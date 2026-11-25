-- Prop screen (optional): the phone UI drawn ON the held phone prop's screen instead of the
-- full-screen NUI overlay. Off by default; see configs/phone.lua PropScreen and the README.
--
-- How it works
--   * A DUI (off-screen CEF browser) loads web/dui/phone.html, which boots the very same web/build
--     bundle as the NUI frame and stretches the phone's screen element to fill the DUI viewport. It is
--     started the first time the phone is opened, not with the resource, and that first open boots it
--     on the prop: the screen stays dark until the page reports ready.
--   * From then on every SendNUIMessage push is mirrored into the DUI (SendDuiMessage), so it keeps the
--     same state as the NUI frame. NUI callbacks need no bridge: the DUI page is served from
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
---The size the screen is drawn at. A texture much larger than the phone appears on the monitor is
---shrunk by the game with no smoothing, which frays small text, so by default it is sized to how
---tall the phone stands in the close-up camera on this player's monitor, in the proportions the
---config gives.
---@return integer width, integer height
local function screenPixels()
    local w, h = cfg.Width or 540, cfg.Height or 1174
    if cfg.AutoResolution == false or cfg.Camera == false then return math.floor(w), math.floor(h) end
    local _, monitor = GetActiveScreenResolution()
    local tall = (cfg.ScreenSize or vec2(0.07336, 0.1584)).y
    local share = tall / (2.0 * (cfg.CamDistance or 0.28) * math.tan(math.rad((cfg.CamFov or 40.0) / 2.0)))
    local height = math.max(640, math.min(1800, math.floor(monitor * share + 0.5)))
    return math.floor(height * w / h + 0.5), height
end

local W <const>, H <const> = screenPixels()
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
---@type string, string The hold made for this view (stream/sd_phone@hold.ycd): the stock reading pose with the
---thumb laid along the phone's edge, where the stock one rests it across the glass.
local HOLD_DICT <const>, HOLD_ANIM <const> = 'sd_phone@hold', 'hold'
-- The clip held for the whole session (no typing swap, see pose.clipOverride): the stock reading pose
-- until the first session finds the phone's own hold streamed (chooseHold).
local HOLD_CLIP <const> = {
    dict = (cfg.HoldAnim or {}).dict or config.Phone.AnimDict or 'cellphone@',
    anim = (cfg.HoldAnim or {}).anim or config.Phone.AnimName or 'cellphone_text_read_base',
    blendIn = 4.0, blendOut = -4.0, flags = 1 | 16 | 32,
}

---Switches the session's clip to the phone's own hold once it is streamed, unless the config names a
---clip. Asked when a session starts and not when this file loads, as a resource's streamed files are
---not yet known to the game while its scripts are first read.
local function chooseHold()
    if cfg.HoldAnim or HOLD_CLIP.dict == HOLD_DICT or not DoesAnimDictExist(HOLD_DICT) then return end
    HOLD_CLIP.dict, HOLD_CLIP.anim = HOLD_DICT, HOLD_ANIM
end

---@type { offset: vector3, rot: vector3 } Where the phone sits in the hand while its screen is in use, on top of
---PropOffset and PropRot.
local HAND_SHIFT <const> = { offset = cfg.HandOffset or vec3(0.0, 0.0, 0.0), rot = cfg.HandRot or vec3(0.0, 0.0, 0.0) }
---@type number, number How bright the screen is drawn (0-1) at midday and in the dead of night.
local GAIN_DAY <const>, GAIN_NIGHT <const> = (cfg.Brightness or {}).Day or 0.95, (cfg.Brightness or {}).Night or 0.62

local dui, duiReady, duiFailed = nil, false, false
---@type boolean True once the first phone open has asked for the DUI; pushes queue for it from then on.
local duiWanted = false
---@type boolean True once the runtime texture the DUI draws into exists, so the screen can be swapped for it.
local rtReady = false
local queue = {}
local closer, opener
local forceFullscreenOnce = false
local keyboardUp = false
local cam
local sessionSeq = 0
---@type fun() Closes the prop session and reopens the phone full-screen (assigned under "full-screen hand-off").
local handOffToFullscreen

local function log(...) print('^5[sd-phone:propscreen]^0', ...) end

---------------------------------------------------------------- DUI lifetime

local function duiSend(data)
    if not duiWanted or duiFailed then return end
    if not duiReady then
        if #queue < 400 then queue[#queue + 1] = data end
        return
    end
    SendDuiMessage(dui, json.encode(data))
end

---Turns the feature off for this session and drops the DUI; the phone keeps the full-screen UI. A
---session already on the prop, which the first open's is while the DUI boots, is handed to it.
---@param why string
local function fail(why)
    if duiFailed then return end
    duiFailed = true
    queue = {}
    log(('^1%s; prop screen disabled, using the full-screen UI^0'):format(why))
    if dui then DestroyDui(dui) dui = nil end
    if M.active then handOffToFullscreen() end
end

local function createDui()
    if dui or duiFailed then return end
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
    rtReady = true
    if cfg.Debug then log(('DUI created %dx%d (available=%s)'):format(W, H, tostring(IsDuiAvailable(dui)))) end
    -- The page announces itself through a NUI callback; no answer means the callback path is not
    -- reaching us, and the phone stays on the full-screen UI rather than a dead screen.
    SetTimeout(20000, function()
        if not duiReady then fail('DUI never reported ready') end
    end)
end

---Starts the DUI the first time the phone is opened rather than with the resource, so a player who
---never takes the phone out never runs a second copy of it off-screen. Pushes queue from here until the
---page reports ready. The art is not shipped with sd-phone: without the DUI model there is nothing to
---draw on, so that is said once, here, and the phone stays on the full-screen UI.
local function ensureDui()
    if duiWanted or duiFailed then return end
    if not IsModelInCdimage(joaat(MODEL)) then
        return fail(('model %s is not streamed (see PropScreen in configs/phone.lua)'):format(MODEL))
    end
    duiWanted = true
    CreateThread(createDui)
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

---@type number Degrees the phone may turn away from the steady camera's heading before the camera is aimed
---again: well past what a hand at rest does, so only a real change of pose (a turn, a new hold) moves it.
local CAM_REAIM <const> = 6.0

---@type vector3|nil The heading the steady camera keeps (CamSteady), taken from the phone when it was last aimed.
local camRot
---@type boolean Set to have the camera aimed at the phone again on its next look (the hold has just settled).
local camReaim = false

---Puts the close-up camera on the phone: square on to the screen, the phone's top as its up. The engine
---carries it with the phone, so the phone stays in the middle of the picture with none of the frame of
---lag a script moving it would add.
---
---A hand is never still: measured in game, the hold turns the phone through about two degrees every few
---seconds. Fixed rigidly to the phone (CamSteady = false) the camera turns with it, and at arm's length
---two degrees swings the whole world behind the phone across the monitor. The steady camera follows only
---where the phone is and keeps the heading it was aimed with, so the world stands still and the phone
---turns those two degrees in place, which is too little to see.
---@param prop integer the phone in hand
local function rideProp(prop)
    local x, y, z = SC.x, SC.y - (cfg.CamDistance or 0.28), SC.z + (cfg.CamRise or 0.0)
    if cfg.CamSteady == false then
        camRot = nil
        HardAttachCamToEntity(cam, prop, 0.0, 0.0, 0.0, x, y, z, true)
        return
    end
    local off = GetOffsetFromEntityInWorldCoords(prop, x, y, z) - GetEntityCoords(prop)
    camRot = GetEntityRotation(prop, 2)
    AttachCamToEntity(cam, prop, off.x, off.y, off.z, false)
    SetCamRot(cam, camRot.x, camRot.y, camRot.z, 2)
end

---How far the phone has turned from the heading the steady camera keeps, in degrees: the larger of the
---turn up and down and the turn left and right.
---@param prop integer the phone in hand
---@return number
local function camDrift(prop)
    local now = GetEntityRotation(prop, 2)
    local yaw = math.abs(((now.z - camRot.z + 180.0) % 360.0) - 180.0)
    return math.max(math.abs(now.x - camRot.x), yaw)
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
        cam = CreateCam('DEFAULT_SCRIPTED_CAMERA', false)
        SetCamFov(cam, cfg.CamFov or 40.0)
        SetCamNearClip(cam, 0.03)
        rideProp(prop)
        SetCamActive(cam, true)
        RenderScriptCams(true, true, cfg.CamEaseMs or 450, true, false)
        local turned = 0
        while seq == sessionSeq and cam do
            local now = pose.getProp()
            if now and (now ~= prop or camReaim) then
                prop, camReaim = now, false
                rideProp(prop)
            elseif now and camRot then
                turned = camDrift(now) > CAM_REAIM and turned + 1 or 0
                if turned >= 4 then
                    turned = 0
                    rideProp(now)
                end
            end
            Wait(100)
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
function handOffToFullscreen()
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

---@type string, string The pointer over the phone: a ring drawn by the game at the mouse itself each frame.
---A pointer drawn inside the screen's own picture trails the mouse by the frames the picture takes to arrive,
---and the game's own cursor only comes as an arrow or a pointing hand.
local TOUCH_TXD <const>, TOUCH_TEX <const> = 'sd_phone_touch', 'ring'

---Paints the pointer ring into a texture of its own: a white ring with a faint white fill, on a soft
---dark halo that keeps it readable over a white page. Painted here so the phone ships no picture for it.
local function paintTouch()
    local size <const> = 64
    local texture = CreateRuntimeTexture(CreateRuntimeTxd(TOUCH_TXD), TOUCH_TEX, size, size)
    local mid <const>, outer <const>, inner <const> = (size - 1) / 2, 23.0, 18.5
    for y = 0, size - 1 do
        for x = 0, size - 1 do
            local r = math.sqrt((x - mid) ^ 2 + (y - mid) ^ 2)
            local ring = math.max(0.0, math.min(1.0, outer - r + 0.5)) * math.max(0.0, math.min(1.0, r - inner + 0.5))
            local fill = r < inner and 0.26 or 0.0
            local halo = r > outer and math.max(0.0, 1.0 - (r - outer) / 8.0) ^ 2 * 0.42 or 0.0
            local white = math.max(ring, fill)
            local alpha = math.max(white, halo)
            local shade = alpha > 0 and math.floor(255 * white / alpha + 0.5) or 255
            SetRuntimeTexturePixel(texture, x, y, shade, shade, shade, math.floor(alpha * 255 + 0.5))
        end
    end
    CommitRuntimeTexture(texture)
end
paintTouch()

---Draws the pointer ring at a spot on the monitor, a little smaller while the button is held.
---@param x number 0-1 across the monitor
---@param y number 0-1 down it
---@param pressed boolean whether the mouse button is down
local function drawTouch(x, y, pressed)
    local tall = (cfg.PointerSize or 0.034) * (pressed and 0.78 or 1.0)
    DrawSprite(TOUCH_TXD, TOUCH_TEX, x, y, tall / GetAspectRatio(false), tall, 0.0, 255, 255, 255, 255)
end

---@type boolean True while a text field on the phone is being typed into. The game cannot hand key presses
---to the screen's own page, so the phone's NUI frame takes the keyboard and the mouse for as long as it lasts
---(web/src/core/propScreenCapture.ts) and reports both here; nothing reaches the game, so a typed T opens no chat.
local typing = false
---@type { x: number, y: number, pressed: boolean, released: boolean, wheel: number, back: boolean } What the
---frame reported since the input loop last looked.
local reported = { x = 0.5, y = 0.5, pressed = false, released = false, wheel = 0, back = false }

---Gives the keyboard and mouse to the NUI frame, or hands them back to the game.
---@param on boolean
local function setTyping(on)
    if typing == on then return end
    typing = on
    reported.pressed, reported.released, reported.wheel, reported.back = false, false, 0, false
    nextFocus(on, on)
    nextKeep(false)
    nextSend({ action = 'sd-phone:propscreen:capture', on = on })
end

---Where the pointer is and what it did this frame, from the game's own controls or, while typing, from
---what the NUI frame reported.
---@return number x, number y, boolean pressed, boolean released, number wheel, boolean back
local function pointer()
    if typing then
        local pressed, released, wheel, back = reported.pressed, reported.released, reported.wheel, reported.back
        reported.pressed, reported.released, reported.wheel, reported.back = false, false, 0, false
        return reported.x, reported.y, pressed, released, wheel, back
    end
    SetMouseCursorActiveThisFrame()
    local wheel = (IsDisabledControlJustPressed(0, 241) and 1 or 0) - (IsDisabledControlJustPressed(0, 242) and 1 or 0)
    return GetDisabledControlNormal(0, 239), GetDisabledControlNormal(0, 240),
        IsDisabledControlJustPressed(0, 24), IsDisabledControlJustReleased(0, 24), wheel,
        IsDisabledControlJustPressed(0, 25) or IsDisabledControlJustPressed(0, 177)
end

local function inputLoop(seq)
    CreateThread(function()
        local lastX, lastY = -1, -1
        local down = false
        while seq == sessionSeq do
            if not keyboardUp then
                for i = 1, #BLOCK do DisableControlAction(0, BLOCK[i], true) end
                local mx, my, pressed, released, wheel, back = pointer()
                local prop = pose.getProp()
                local q = prop and dui and projectQuad(prop)
                if q then
                    local u, v = quadToUv(q, mx, my)
                    if u then
                        local inside = u >= 0 and u <= 1 and v >= 0 and v <= 1
                        SetMouseCursorVisibleInMenus(not inside)
                        if inside or typing then drawTouch(mx, my, down) end
                        local px = math.floor(math.min(math.max(u, 0), 1) * (W - 1) + 0.5)
                        local py = math.floor(math.min(math.max(v, 0), 1) * (H - 1) + 0.5)
                        if (inside or down) and (px ~= lastX or py ~= lastY) then
                            SendDuiMouseMove(dui, px, py)
                            lastX, lastY = px, py
                        end
                        if inside and pressed then
                            SendDuiMouseMove(dui, px, py)
                            SendDuiMouseDown(dui, 'left')
                            down = true
                        elseif pressed and typing then
                            duiSend({ propScreen = 'type', key = 'Escape' })
                        end
                    end
                end
                if down and released and dui then
                    SendDuiMouseUp(dui, 'left')
                    down = false
                end
                if wheel ~= 0 and dui then SendDuiMouseWheel(dui, wheel * 120, 0) end
                -- Back: right mouse or Backspace -> the UI's own escape (closes an app/sheet, at home closes)
                if back then duiSend({ action = 'sd-phone:escape' }) end
                if not typing then
                    -- Enter unlocks the lockscreen / submits, as on the full-screen phone
                    if IsDisabledControlJustPressed(0, 191) then duiSend({ propScreen = 'key', key = 'Enter' }) end
                    -- ESC puts the phone away
                    if IsDisabledControlJustPressed(0, 200) or IsDisabledControlJustPressed(0, 322) then
                        if closer then closer() end
                    end
                end
                if IsPedInAnyVehicle(PlayerPedId(), true) and closer then closer() end
                -- The DUI model has one portrait screen: an unfolded foldable goes full-screen.
                if not ALLOW_FOLD and pose.isFolded() then handOffToFullscreen() end
            end
            Wait(0)
        end
        if down and dui then SendDuiMouseUp(dui, 'left') end
        SetMouseCursorVisibleInMenus(true)
        setTyping(false)
    end)
end

---A text field on the phone was tapped: typing starts, straight onto the screen.
RegisterNUICallback('sd-phone:propscreen:text', function(_, cb)
    cb({ ok = true })
    if M.active then setTyping(true) end
end)

---The field being typed into was left (a tap elsewhere, Escape, or the page closed it).
RegisterNUICallback('sd-phone:propscreen:blur', function(_, cb)
    cb({ ok = true })
    setTyping(false)
end)

---A key, a paste or a pointer event from the NUI frame while it holds the keyboard and mouse.
---@param data { t: string, key: string?, ctrl: boolean?, shift: boolean?, text: string?, x: number?, y: number?, button: integer?, delta: number? }
RegisterNUICallback('sd-phone:propscreen:input', function(data, cb)
    cb({ ok = true })
    if not typing or type(data) ~= 'table' then return end
    local kind = data.t
    if kind == 'key' and type(data.key) == 'string' then
        duiSend({ propScreen = 'type', key = data.key, ctrl = data.ctrl == true, shift = data.shift == true })
    elseif kind == 'paste' and type(data.text) == 'string' then
        duiSend({ propScreen = 'type', text = data.text:sub(1, 2000) })
    elseif kind == 'wheel' then
        reported.wheel = reported.wheel + ((tonumber(data.delta) or 0) < 0 and 1 or -1)
    elseif type(data.x) == 'number' and type(data.y) == 'number' then
        reported.x, reported.y = data.x, data.y
        if kind == 'down' then
            if data.button == 2 then reported.back = true elseif data.button == 0 then reported.pressed = true end
        elseif kind == 'up' and data.button == 0 then
            reported.released = true
        end
    end
end)

RegisterNUICallback('sd-phone:propscreen:log', function(data, cb)
    cb({ ok = true })
    if cfg.Debug and type(data) == 'table' then
        log(('tap %s,%s on %s .%s "%s"'):format(data.x, data.y, data.tag, data.cls, data.text))
    end
end)

---------------------------------------------------------------- session

---How bright the screen should be drawn right now. The screen is a light of its own, so at night the
---game's exposure turns a full-strength one into a white glare: it is drawn dimmer after dark, the way a
---phone dims itself, and climbs back through dawn. The player's own Brightness setting dims it further
---inside the page.
---@return number gain 0-1
local function screenGain()
    local hour = GetClockHours() + GetClockMinutes() / 60.0
    local light = math.max(0.0, math.min(1.0, math.min(hour - 5.0, 21.0 - hour) / 2.0))
    return GAIN_NIGHT + (GAIN_DAY - GAIN_NIGHT) * light
end

---Keeps the screen's brightness in step with the time of day for as long as a session lasts.
---@param seq integer the session this loop belongs to
local function gainLoop(seq)
    CreateThread(function()
        local sent
        while seq == sessionSeq and M.active do
            local gain = math.floor(screenGain() * 100 + 0.5) / 100
            if gain ~= sent then
                sent = gain
                duiSend({ propScreen = 'gain', value = gain })
            end
            Wait(2000)
        end
    end)
end

local function startSession()
    sessionSeq = sessionSeq + 1
    local seq = sessionSeq
    M.active = true
    nextFocus(false, false)
    duiSend({ propScreen = 'active', on = true, debug = cfg.Debug == true })
    chooseHold()
    pose.modelOverride = MODEL
    pose.clipOverride = HOLD_CLIP
    pose.handShift = HAND_SHIFT
    gainLoop(seq)
    CreateThread(function()
        RequestStreamedTextureDict(MODEL_TXD, false)
        local t = GetGameTimer()
        while seq == sessionSeq and not (rtReady and HasStreamedTextureDictLoaded(MODEL_TXD)) and GetGameTimer() - t < 20000 do Wait(0) end
        if seq ~= sessionSeq or not rtReady then return end
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
    pose.handShift = nil
    -- the torch or a live call can keep the phone in hand after the UI closes: put the normal body back
    if pose.shouldHold() then CreateThread(function() pose.reweld() end) end
end

AddEventHandler('sd-phone:client:openState', function(open)
    if not open then return endSession() end
    -- sd-tablet raises this event for its own open too: only the phone itself goes on the prop.
    if not companion.phoneOpen or M.active then return end
    ensureDui()
    if forceFullscreenOnce then forceFullscreenOnce = false return end
    if duiFailed then return end
    if cfg.Debug and not duiReady then log('DUI still starting, the screen lights once it reports ready') end
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

AddEventHandler('onResourceStop', function(res)
    if res ~= RES then return end
    if M.active then
        RenderScriptCams(false, false, 0, true, false)
        RemoveReplaceTexture(MODEL_TXD, MODEL_TEX)
    end
    if dui then DestroyDui(dui) end
end)

return M
