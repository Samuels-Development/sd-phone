-- Prop screen (optional): the phone UI drawn ON the held phone prop's screen instead of the
-- full-screen NUI overlay. Off by default; see configs/phone.lua PropScreen and the README.
--
-- How it works
--   * A DUI (off-screen CEF browser) loads web/dui/phone.html, which boots the very same web/build
--     bundle as the NUI frame and stretches the phone's screen element to fill the DUI viewport.
--   * Every SendNUIMessage push is mirrored into the DUI (SendDuiMessage), so it keeps the same state
--     as the NUI frame. NUI callbacks need no bridge: the DUI page is served from
--     https://cfx-nui-<resource>/, so its fetch('https://<resource>/<action>') lands on this
--     resource's RegisterNUICallback handlers exactly like the frame's.
--   * While the phone is open on foot (a "session"), the NUI frame is kept closed and unfocused, the
--     hand prop is the configured DUI-screen model and its screen texture is swapped for the DUI
--     (AddReplaceTexture). A close-up camera eases in on the phone, the game cursor is mapped onto
--     the screen through the projected screen corners (homography) and forwarded as DUI mouse events.
--   * Vehicles, the Camera app, video calls and (unless PropScreen.Foldable) an unfolded foldable
--     fall back to the stock full-screen UI.
--
-- With PropScreen.Enabled ~= true this module returns a no-op table before creating anything: no
-- DUI, no threads, no shadowed natives, so the stock phone is untouched.

---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table
local M = { active = false }
function M.bind() end

-- Registered before the early return below so the export exists (returning false) even when the option is off.
---@return boolean whether the phone is currently shown on the prop
exports('isPropScreenActive', function() return M.active end)

local cfg = config.Phone and config.Phone.PropScreen
if type(cfg) ~= 'table' or cfg.Enabled ~= true then
    return M
end

---@type table In-hand pose + prop (client.pose).
local pose = require 'client.pose'
---@type table Companion-device bus (client.companion): knows whether the PHONE (not a companion) is open.
local companion = require 'client.companion'

local RES <const> = GetCurrentResourceName()
local W <const>, H <const> = math.floor(cfg.Width or 540), math.floor(cfg.Height or 1174)
-- Runtime texture dictionary the DUI is drawn into (created here, any unique name works).
local RT_TXD <const>, RT_TEX <const> = 'sd_phone_propscreen_rt', 'screen'
local MODEL <const> = cfg.Model or 'sd_phone_dui'
-- The streamed YTD holding the screen texture. AddReplaceTexture only works on a standalone,
-- resident YTD (not on a texture embedded in the YDR), and the archetype's textureDictionary
-- points at it, so by convention it is named like the model.
local MODEL_TXD <const> = cfg.TextureDict or MODEL
local MODEL_TEX <const> = cfg.Texture or 'sd_phone_screen'
local SC <const> = cfg.ScreenCentre or vec3(0.0, -0.00186, 0.0)
local SS <const> = cfg.ScreenSize or vec2(0.07336, 0.1584)
local ALLOW_FOLD <const> = cfg.Foldable == true
-- The clip held for the whole session (the stock reading pose; no typing swap, see pose.clipOverride).
local HOLD_CLIP <const> = {
    dict = config.Phone.AnimDict or 'cellphone@', anim = config.Phone.AnimName or 'cellphone_text_read_base',
    blendIn = 4.0, blendOut = -4.0, flags = 1 | 16 | 32,
}

local dui, duiReady, duiFailed = nil, false, false
local queue = {}
local closer, opener
local forceFullscreenOnce = false
local keyboardUp = false
local cam
local sessionSeq = 0

local function log(...) print('^5[sd-phone:propscreen]^0', ...) end

---------------------------------------------------------------- DUI lifetime

local function duiSend(data)
    if not dui or duiFailed then return end
    if not duiReady then
        if #queue < 400 then queue[#queue + 1] = data end
        return
    end
    SendDuiMessage(dui, json.encode(data))
end

---Turns the feature off for this session and drops the DUI; the phone keeps the full-screen UI.
---@param why string
local function fail(why)
    if duiFailed then return end
    duiFailed = true
    queue = {}
    log(('^1%s; prop screen disabled, using the full-screen UI^0'):format(why))
    if dui then DestroyDui(dui) dui = nil end
end

local function createDui()
    if dui or duiFailed then return end
    -- The art is not shipped with sd-phone: without the DUI model and its YTD there is nothing to
    -- draw on, so say so once and stay on the full-screen UI.
    if not IsModelInCdimage(joaat(MODEL)) then
        return fail(('model %s is not streamed (see PropScreen in configs/phone.lua)'):format(MODEL))
    end
    RequestStreamedTextureDict(MODEL_TXD, false)
    local t = GetGameTimer()
    while not HasStreamedTextureDictLoaded(MODEL_TXD) and GetGameTimer() - t < 5000 do Wait(50) end
    if not HasStreamedTextureDictLoaded(MODEL_TXD) then
        return fail(('texture dictionary %s did not load (it must be a standalone .ytd)'):format(MODEL_TXD))
    end

    dui = CreateDui(('nui://%s/web/dui/phone.html'):format(RES), W, H)
    t = GetGameTimer()
    while not IsDuiAvailable(dui) and GetGameTimer() - t < 10000 do Wait(50) end
    local txd = CreateRuntimeTxd(RT_TXD)
    CreateRuntimeTextureFromDuiHandle(txd, RT_TEX, GetDuiHandle(dui))
    if cfg.Debug then log(('DUI created %dx%d (available=%s)'):format(W, H, tostring(IsDuiAvailable(dui)))) end
    -- The page announces itself through a NUI callback; no answer means the callback path is not
    -- reaching us, and the phone stays on the full-screen UI rather than a dead screen.
    SetTimeout(20000, function()
        if not duiReady then fail('DUI never reported ready') end
    end)
end

RegisterNUICallback('sd-phone:propscreen:ready', function(data, cb)
    cb({ ok = true })
    if duiReady or not dui then return end
    duiReady = true
    if cfg.Debug then
        log(('DUI ready (viewport %sx%s), flushing %d queued pushes'):format(
            tostring(data and data.w), tostring(data and data.h), #queue))
    end
    for i = 1, #queue do SendDuiMessage(dui, json.encode(queue[i])) end
    queue = {}
    SendDuiMessage(dui, json.encode({ propScreen = 'active', on = M.active }))
end)

---------------------------------------------------------------- push mirror + focus guard

-- Installed after client.companion (main.lua requires this module right after it), so these wrap
-- the companion's own shadows.
local nextSend = SendNUIMessage
---Mirrors every push into the DUI; while a prop session owns the phone the NUI frame gets nothing,
---so it never opens behind the prop or plays a second ringtone.
function SendNUIMessage(data)
    if not duiFailed then
        -- The open push only goes to the DUI when a session is up, so the DUI's phone is never
        -- "open" while the full-screen one is.
        if not (type(data) == 'table' and data.action == 'sd-phone:open' and not M.active) then
            duiSend(data)
        end
    end
    if M.active then return end
    nextSend(data)
end

local nextFocus, nextKeep = SetNuiFocus, SetNuiFocusKeepInput
function SetNuiFocus(hasFocus, hasCursor)
    if M.active then return nextFocus(false, false) end
    return nextFocus(hasFocus, hasCursor)
end

function SetNuiFocusKeepInput(keep)
    if M.active then return nextKeep(false) end
    return nextKeep(keep)
end

---------------------------------------------------------------- screen projection

---Prop-local screen corners (TL, TR, BR, BL as the viewer sees them; face -Y, top +Z).
local function corners(prop)
    local hx, hz = SS.x / 2, SS.y / 2
    return {
        GetOffsetFromEntityInWorldCoords(prop, SC.x - hx, SC.y, SC.z + hz),
        GetOffsetFromEntityInWorldCoords(prop, SC.x + hx, SC.y, SC.z + hz),
        GetOffsetFromEntityInWorldCoords(prop, SC.x + hx, SC.y, SC.z - hz),
        GetOffsetFromEntityInWorldCoords(prop, SC.x - hx, SC.y, SC.z - hz),
    }
end

---Inverse of the unit-square -> quad homography (Heckbert), mapping a screen point to screen UV.
local function quadToUv(q, x, y)
    local x0, y0, x1, y1, x2, y2, x3, y3 = q[1][1], q[1][2], q[2][1], q[2][2], q[3][1], q[3][2], q[4][1], q[4][2]
    local sx, sy = x0 - x1 + x2 - x3, y0 - y1 + y2 - y3
    local dx1, dx2, dy1, dy2 = x1 - x2, x3 - x2, y1 - y2, y3 - y2
    local den = dx1 * dy2 - dx2 * dy1
    if math.abs(den) < 1e-12 then return nil end
    local g = (sx * dy2 - dx2 * sy) / den
    local h = (dx1 * sy - sx * dy1) / den
    local a, b, c = x1 - x0 + g * x1, x3 - x0 + h * x3, x0
    local d, e, f = y1 - y0 + g * y1, y3 - y0 + h * y3, y0
    -- adjugate of [[a b c][d e f][g h 1]]
    local A, B, C = e - f * h, c * h - b, b * f - c * e
    local D, E, F = f * g - d, a - c * g, c * d - a * f
    local G, Hh, I = d * h - e * g, b * g - a * h, a * e - b * d
    local w = G * x + Hh * y + I
    if math.abs(w) < 1e-12 then return nil end
    return (A * x + B * y + C) / w, (D * x + E * y + F) / w
end

local function projectQuad(prop)
    local q = {}
    for i, p in ipairs(corners(prop)) do
        local ok, sx, sy = GetScreenCoordFromWorldCoord(p.x, p.y, p.z)
        if not ok then return nil end
        q[i] = { sx, sy }
    end
    return q
end

---------------------------------------------------------------- camera

local function camTarget(prop)
    local c = GetOffsetFromEntityInWorldCoords(prop, SC.x, SC.y, SC.z)
    local n = GetOffsetFromEntityInWorldCoords(prop, SC.x, SC.y - 1.0, SC.z) - c
    local up = GetOffsetFromEntityInWorldCoords(prop, SC.x, SC.y, SC.z + 1.0) - c
    local right = GetOffsetFromEntityInWorldCoords(prop, SC.x + 1.0, SC.y, SC.z) - c
    local d = cfg.CamDistance or 0.34
    -- slightly above and to the right of the screen normal, so the phone reads as held and angled
    return c + n * d + up * (d * 0.12) + right * (d * 0.10), c
end

local function startCam(seq)
    if cfg.Camera == false then return end
    CreateThread(function()
        local prop
        local t = GetGameTimer()
        repeat
            prop = pose.getProp()
            if not prop then Wait(0) end
        until prop or GetGameTimer() - t > 3000 or seq ~= sessionSeq
        if not prop or seq ~= sessionSeq then return end
        Wait(250) -- let the hold clip blend in so the first frame is not aimed at the hip
        if seq ~= sessionSeq then return end
        prop = pose.getProp()
        if not prop then return end
        local pos, look = camTarget(prop)
        cam = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', pos.x, pos.y, pos.z, 0.0, 0.0, 0.0, cfg.CamFov or 40.0, false, 2)
        PointCamAtCoord(cam, look.x, look.y, look.z)
        SetCamActive(cam, true)
        RenderScriptCams(true, true, cfg.CamEaseMs or 450, true, false)
        local fpos, flook = pos, look
        local k = cfg.CamFollow or 1.0
        while seq == sessionSeq and cam do
            prop = pose.getProp()
            if prop then
                pos, look = camTarget(prop)
                -- 1.0 = rigid to the prop: the phone holds still under the cursor and the world sways
                fpos = fpos + (pos - fpos) * k
                flook = flook + (look - flook) * k
                SetCamCoord(cam, fpos.x, fpos.y, fpos.z)
                PointCamAtCoord(cam, flook.x, flook.y, flook.z)
            end
            Wait(0)
        end
    end)
end

local function stopCam()
    if not cam then return end
    local c = cam
    cam = nil
    RenderScriptCams(false, true, cfg.CamEaseMs or 450, true, false)
    SetTimeout((cfg.CamEaseMs or 450) + 100, function()
        if DoesCamExist(c) then DestroyCam(c, false) end
    end)
end

---------------------------------------------------------------- full-screen hand-off

---Closes the prop session and reopens the phone on the stock full-screen UI (the next normal open
---is on the prop again).
local function handOffToFullscreen()
    if not M.active or not closer then return end
    forceFullscreenOnce = true
    closer()
    if opener then SetTimeout(250, function() opener(true) end) end
end

---------------------------------------------------------------- input

-- Controls disabled while the cursor drives the screen: look/aim/attack, movement, cover, weapon
-- wheel, phone/menu keys, back/enter/ESC (handled below).
local BLOCK <const> = {
    1, 2, 24, 25, 37, 140, 141, 142, 143, 257, 263, 264, 14, 15, 16, 17, 81, 82, 99, 100,
    30, 31, 32, 33, 34, 35, 21, 22, 36, 44, 23, 75, 45, 47, 58, 199, 200, 322, 177, 191, 201, 241, 242,
}

local function inputLoop(seq)
    CreateThread(function()
        local lastX, lastY = -1, -1
        local down = false
        while seq == sessionSeq do
            if not keyboardUp then
                for i = 1, #BLOCK do DisableControlAction(0, BLOCK[i], true) end
                SetMouseCursorActiveThisFrame()
                local prop = pose.getProp()
                local q = prop and projectQuad(prop)
                if q then
                    local mx, my = GetDisabledControlNormal(0, 239), GetDisabledControlNormal(0, 240)
                    local u, v = quadToUv(q, mx, my)
                    if u then
                        local inside = u >= 0 and u <= 1 and v >= 0 and v <= 1
                        SetMouseCursorSprite(inside and 5 or 1)
                        local px = math.floor(math.min(math.max(u, 0), 1) * (W - 1) + 0.5)
                        local py = math.floor(math.min(math.max(v, 0), 1) * (H - 1) + 0.5)
                        if (inside or down) and (px ~= lastX or py ~= lastY) then
                            SendDuiMouseMove(dui, px, py)
                            lastX, lastY = px, py
                        end
                        if inside and IsDisabledControlJustPressed(0, 24) then
                            SendDuiMouseMove(dui, px, py)
                            SendDuiMouseDown(dui, 'left')
                            down = true
                        end
                    end
                end
                if down and IsDisabledControlJustReleased(0, 24) then
                    SendDuiMouseUp(dui, 'left')
                    down = false
                end
                if IsDisabledControlJustPressed(0, 241) then SendDuiMouseWheel(dui, 120, 0) end
                if IsDisabledControlJustPressed(0, 242) then SendDuiMouseWheel(dui, -120, 0) end
                -- Back: right mouse or Backspace -> the UI's own escape (closes an app/sheet, at home closes)
                if IsDisabledControlJustPressed(0, 25) or IsDisabledControlJustPressed(0, 177) then
                    duiSend({ action = 'sd-phone:escape' })
                end
                -- Enter unlocks the lockscreen / submits, as on the full-screen phone
                if IsDisabledControlJustPressed(0, 191) then duiSend({ propScreen = 'key', key = 'Enter' }) end
                -- ESC puts the phone away
                if IsDisabledControlJustPressed(0, 200) or IsDisabledControlJustPressed(0, 322) then
                    if closer then closer() end
                end
                if IsPedInAnyVehicle(PlayerPedId(), true) and closer then closer() end
                -- The DUI model has one portrait screen: an unfolded foldable goes full-screen.
                if not ALLOW_FOLD and pose.isFolded() then handOffToFullscreen() end
            end
            Wait(0)
        end
        if down and dui then SendDuiMouseUp(dui, 'left') end
    end)
end

-- Text entry. A DUI has no keyboard path, so a tapped text field asks for the game's on-screen
-- keyboard and the result is written back into the field (React-safe setter in phone.html).
RegisterNUICallback('sd-phone:propscreen:text', function(data, cb)
    cb({ ok = true })
    if not M.active or keyboardUp then return end
    keyboardUp = true
    CreateThread(function()
        local max = math.max(1, math.min(tonumber(data and data.maxLength) or 255, 600))
        DisplayOnscreenKeyboard(1, 'FMMC_KEY_TIP8', '', tostring(data and data.value or ''), '', '', '', max)
        while UpdateOnscreenKeyboard() == 0 do Wait(0) end
        local status = UpdateOnscreenKeyboard()
        local result = status == 1 and GetOnscreenKeyboardResult() or nil
        Wait(150) -- swallow the Enter/ESC that closed the keyboard
        keyboardUp = false
        duiSend({ propScreen = 'text', value = result, cancelled = result == nil })
    end)
end)

RegisterNUICallback('sd-phone:propscreen:log', function(data, cb)
    cb({ ok = true })
    if cfg.Debug and type(data) == 'table' then
        log(('tap %s,%s on %s .%s "%s"'):format(data.x, data.y, data.tag, data.cls, data.text))
    end
end)

---------------------------------------------------------------- session

local function startSession()
    sessionSeq = sessionSeq + 1
    local seq = sessionSeq
    M.active = true
    nextFocus(false, false)
    duiSend({ propScreen = 'active', on = true, debug = cfg.Debug == true })
    pose.modelOverride = MODEL
    pose.clipOverride = HOLD_CLIP
    CreateThread(function()
        RequestStreamedTextureDict(MODEL_TXD, false)
        local t = GetGameTimer()
        while not HasStreamedTextureDictLoaded(MODEL_TXD) and GetGameTimer() - t < 3000 do Wait(0) end
        if seq ~= sessionSeq then return end
        AddReplaceTexture(MODEL_TXD, MODEL_TEX, RT_TXD, RT_TEX)
    end)
    CreateThread(function() pose.reweld() end)
    startCam(seq)
    inputLoop(seq)
end

local function endSession()
    if not M.active then return end
    sessionSeq = sessionSeq + 1
    M.active = false
    keyboardUp = false
    duiSend({ propScreen = 'active', on = false })
    stopCam()
    RemoveReplaceTexture(MODEL_TXD, MODEL_TEX)
    pose.modelOverride = nil
    pose.clipOverride = nil
    -- the torch or a live call can keep the phone in hand after the UI closes: put the normal body back
    if pose.shouldHold() then CreateThread(function() pose.reweld() end) end
end

AddEventHandler('sd-phone:client:openState', function(open)
    if not open then return endSession() end
    -- sd-tablet raises this event for its own open too: only the phone itself goes on the prop.
    if not companion.phoneOpen or M.active then return end
    if forceFullscreenOnce then forceFullscreenOnce = false return end
    if duiFailed then return end
    if not duiReady then
        if cfg.Debug then log('DUI not ready yet, using the full-screen UI for this open') end
        return
    end
    if IsPedInAnyVehicle(PlayerPedId(), true) then return end
    if not ALLOW_FOLD and pose.isFolded() then return end
    startSession()
end)

-- Camera app / video call: hand the phone to the stock full-screen UI (close, reopen full-screen;
-- the player taps the app again there).
AddEventHandler('sd-phone:client:cameraMode', function(on)
    if on then handOffToFullscreen() end
end)

---Wires the phone's own close and open functions (client/main.lua).
---@param close fun() closes the phone
---@param open fun(silent: boolean|nil) opens the phone through the ownership gate
function M.bind(close, open)
    closer, opener = close, open
end

CreateThread(function()
    Wait(1500)
    createDui()
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= RES then return end
    if M.active then
        RenderScriptCams(false, false, 0, true, false)
        RemoveReplaceTexture(MODEL_TXD, MODEL_TEX)
    end
    if dui then DestroyDui(dui) end
end)

return M
