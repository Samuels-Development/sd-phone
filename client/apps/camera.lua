---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Scripted phone camera (client.phonecam): owns the view whenever this surface is
---allowed to keep the player moving, since the native cell cam pins the ped at engine level.
local phonecam = require 'client.phonecam'
---@type table Hold pose and hand prop (client.pose): the landscape grip is a prop transform.
local pose = require 'client.pose'

---Flips the active cellphone camera between rear and front (selfie).
---The old raw hash (0x2491A93618B7D838) is stale on current builds and threw "invalid native",
---taking the whole open/close callback with it; the name lets FiveM cross-map the running build.
---@param activate boolean true = front (selfie) camera
local function CellFrontCamActivate(activate)
    local fn = CellCamActivateSelfieMode
    if fn then pcall(fn, activate) end
end

-- Keyboard controls for the viewfinder (control group 0).
---@type integer Enter (INPUT_CELLPHONE_SELECT) - press the shutter.
local CTRL_SHOOT  <const> = 176
---@type integer Up arrow (INPUT_CELLPHONE_UP) - flip rear/selfie.
local CTRL_FLIP   <const> = 172
---@type integer Left arrow (INPUT_CELLPHONE_LEFT) - previous capture mode.
local CTRL_PREV   <const> = 174
---@type integer Right arrow (INPUT_CELLPHONE_RIGHT) - next capture mode.
local CTRL_NEXT   <const> = 175
---@type integer Down arrow (INPUT_CELLPHONE_DOWN) - the movement lock's default bind. Suppressed
---like its siblings so the game's own action never fires underneath the keybind.
local CTRL_DOWN   <const> = 173
---@type integer E (INPUT_PICKUP) - toggle the flash.
local CTRL_FLASH  <const> = 38
---@type integer Left Alt (INPUT_CHARACTER_WHEEL) - take the cursor back.
local CTRL_CURSOR <const> = 19
---@type integer Wheel up (INPUT_CURSOR_SCROLL_UP) - zoom in.
local CTRL_ZOOM_IN <const> = 241
---@type integer Wheel down (INPUT_CURSOR_SCROLL_DOWN) - zoom out.
local CTRL_ZOOM_OUT <const> = 242

---@type boolean True while the native cell-cam view is active.
local active   = false
---@type boolean True while the front (selfie) camera is selected.
local frontCam = false
---@type boolean True while NUI focus (clickable cursor) is on.
local cursorOn = true
---@type boolean True when entry hid the HUD.
local hidHud   = false
---@type boolean True when entry hid the radar.
local hidRadar = false
---@type boolean True while the keyboard-control thread is alive.
local inputLoopRunning = false
---@type boolean Mirror of the phone's open state (sd-phone:client:openState).
local phoneOpen = false

AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open and true or false
end)

---Records the viewfinder cursor state and announces it, so the movement thread knows whether the
---mouse is aiming the lens. Call it after SetNuiFocus, so the keep-input re-sync lands last.
---@param on boolean whether the NUI cursor is showing
local function setCursorState(on)
    cursorOn = on
    TriggerEvent('sd-phone:client:cameraCursor', on)
end

---Pushes a key action into the NUI.
---@param key string action name (shutter/flip/flash/modePrev/modeNext)
local function sendKey(key)
    SendNUIMessage({ action = 'sd-phone:camera:key', data = { key = key } })
end

---Runs the viewfinder keyboard loop: disables each control's default action for as long as the
---app is up, and relays presses into the NUI while the cursor is off.
local function startInputLoop()
    if inputLoopRunning then return end
    inputLoopRunning = true
    CreateThread(function()
        while active do
            Wait(0)
            -- Suppress the game's own action on every viewfinder key for as long as the app is up,
            -- cursor or not: with movement on the game still reads them, so E would fire interact
            -- scripts and Alt the character wheel while the player reaches for the flash.
            DisableControlAction(0, CTRL_CURSOR, true)
            DisableControlAction(0, CTRL_FLASH, true)
            DisableControlAction(0, CTRL_SHOOT, true)
            DisableControlAction(0, CTRL_FLIP, true)
            DisableControlAction(0, CTRL_PREV, true)
            DisableControlAction(0, CTRL_NEXT, true)
            DisableControlAction(0, CTRL_DOWN, true)
            DisableControlAction(0, CTRL_ZOOM_IN, true)
            DisableControlAction(0, CTRL_ZOOM_OUT, true)

            -- Relays only run while the mouse belongs to the game; with the cursor up the page
            -- receives these events itself, and the wheel zooms from its own handler.
            if not cursorOn then
                if IsDisabledControlJustPressed(0, CTRL_ZOOM_IN) then
                    sendKey('zoomIn')
                elseif IsDisabledControlJustPressed(0, CTRL_ZOOM_OUT) then
                    sendKey('zoomOut')
                elseif IsDisabledControlJustPressed(0, CTRL_CURSOR) then
                    SetNuiFocus(true, true)
                    setCursorState(true)
                elseif IsDisabledControlJustPressed(0, CTRL_SHOOT) then
                    sendKey('shutter')
                elseif IsDisabledControlJustPressed(0, CTRL_FLIP) then
                    sendKey('flip')
                elseif IsDisabledControlJustPressed(0, CTRL_FLASH) then
                    sendKey('flash')
                elseif IsDisabledControlJustPressed(0, CTRL_PREV) then
                    sendKey('modePrev')
                elseif IsDisabledControlJustPressed(0, CTRL_NEXT) then
                    sendKey('modeNext')
                end
            end
        end
        inputLoopRunning = false
    end)
end

---Takes the viewfinder view and hides the HUD/radar when they were not hidden already. The
---scripted cam frames it wherever movement is allowed, the native cell cam otherwise. Idempotent
---while already active.
local function enterCameraView()
    if active then return end
    active   = true
    frontCam = false
    setCursorState(true)

    -- Take the view BEFORE announcing the mode: the pose handler asks phonecam.active() which lens
    -- is framing, so announcing first would have it read the native path and stand the pose down
    -- for a camera that animates nothing.
    if phonecam.movementAllowed('camera') then
        phonecam.start()
    else
        CreateMobilePhone(1)
        CellCamActivate(true, true)
        CellFrontCamActivate(false)
    end

    TriggerEvent('sd-phone:client:cameraMode', true, 'camera')

    if not IsHudHidden()   then hidHud   = true; DisplayHud(false)   end
    if not IsRadarHidden() then hidRadar = true; DisplayRadar(false) end

    startInputLoop()
end

---Hands the view back to whichever camera took it, re-shows the HUD/radar this module hid, and
---re-focuses the NUI. Idempotent while already inactive.
local function exitCameraView()
    if not active then return end
    active   = false
    frontCam = false

    if phonecam.active() then
        phonecam.stop()
    else
        CellFrontCamActivate(false)
        CellCamActivate(false, false)
        DestroyMobilePhone()
    end

    TriggerEvent('sd-phone:client:cameraMode', false, 'camera')

    if hidHud   then DisplayHud(true);   hidHud   = false end
    if hidRadar then DisplayRadar(true); hidRadar = false end

    -- The app unmounts behind the phone's close animation, so this can land after the phone is
    -- already gone; re-focusing then would strand a cursor on an empty screen.
    if phoneOpen then SetNuiFocus(true, true) end
    setCursorState(true)
end

---Flips between rear and front (selfie) camera, through whichever camera owns the view. No-op
---while the viewfinder isn't active.
---@param on boolean|nil truthy = front camera
local function setSelfie(on)
    if not active then return end
    frontCam = on and true or false
    if phonecam.active() then
        phonecam.setSelfie(frontCam)
    else
        CellFrontCamActivate(frontCam)
    end
end

-- Flash: a point light drawn just in front of the final rendered camera.
---@type boolean True while the flash light should keep drawing.
local flashing = false
---@type boolean True while the flash draw thread is alive.
local flashLoopRunning = false

---Draws the flash light every frame until stopFlash clears the flag, recomputing the position
---from the final rendered camera.
local function startFlash()
    if flashing then return end
    flashing = true
    if flashLoopRunning then return end
    flashLoopRunning = true
    CreateThread(function()
        while flashing do
            local cam = GetFinalRenderedCamCoord()
            local rot = GetFinalRenderedCamRot(2)
            local rx, rz = math.rad(rot.x), math.rad(rot.z)
            local horiz  = math.abs(math.cos(rx))
            local dir    = vector3(-math.sin(rz) * horiz, math.cos(rz) * horiz, math.sin(rx))
            local pos    = cam + dir * 0.6
            DrawLightWithRange(pos.x, pos.y, pos.z, 255, 250, 235, 13.0, 20.0)
            Wait(0)
        end
        flashLoopRunning = false
    end)
end

---Stop the flash loop (the draw thread exits on its next frame).
local function stopFlash()
    flashing = false
end

---React -> Lua: flash toggle from the on-screen control (or the E key relayed back).
RegisterNUICallback('sd-phone:camera:flash', function(data, cb)
    if data and data.on then startFlash() else stopFlash() end
    cb({ success = true })
end)

---React -> Lua: rear/selfie flip from the on-screen control (or the Up key relayed back).
RegisterNUICallback('sd-phone:camera:selfie', function(data, cb)
    setSelfie(data and data.on)
    cb({ success = true })
end)

---React -> Lua: cursor toggle requested from the page.
RegisterNUICallback('sd-phone:camera:cursor', function(data, cb)
    -- The app stays mounted in the switcher deck once backgrounded, and its Alt listener with it:
    -- honouring this off the viewfinder would strip the phone's cursor from another app.
    if not active then cb({ success = false }) return end
    local on = data and data.on and true or false
    SetNuiFocus(on, on)
    setCursorState(on)
    cb({ success = true })
end)

---React -> Lua: viewfinder magnification. Zooming the lens optically keeps the shot sharp, where
---cropping the rendered frame magnifies fewer pixels the further in you go.
RegisterNUICallback('sd-phone:camera:zoom', function(data, cb)
    phonecam.setZoom(data and data.zoom)
    cb({ success = true })
end)

---React -> Lua: landscape mode toggled - lays the hand prop on its side to match the wide
---viewfinder. Honoured off the viewfinder too, so unmounting can stand the prop back up.
RegisterNUICallback('sd-phone:camera:landscape', function(data, cb)
    pose.setLandscape(data and data.on)
    cb({ success = true })
end)

---@type table<string, boolean> Corners the hint list may sit in.
local HINT_CORNERS <const> = {
    ['top-right'] = true, ['top-left'] = true, ['bottom-right'] = true, ['bottom-left'] = true,
}

---The viewfinder hint settings, normalised so the page never has to defend against a typo in
---configs/phone.lua.
---@return { enabled: boolean, corner: string, columns: integer }
local function hintConfig()
    local hints = config.Phone.CameraHints or {}
    local corner = hints.Corner
    return {
        enabled = hints.Enabled ~= false,
        corner  = HINT_CORNERS[corner] and corner or 'top-right',
        columns = hints.Columns == 1 and 1 or 2,
    }
end

---React -> Lua: the Camera app mounted - take the viewfinder view. Reports which camera took it,
---because the viewfinder's selfie crop bias only compensates the native one, and where the keybind
---hints belong.
RegisterNUICallback('sd-phone:camera:open', function(_, cb)
    enterCameraView()
    cb({ success = true, walkable = phonecam.active(), hints = hintConfig() })
end)

---React -> Lua: the Camera app unmounted - kill the flash and restore the normal view.
RegisterNUICallback('sd-phone:camera:close', function(_, cb)
    stopFlash()
    exitCameraView()
    cb({ success = true })
end)

-- Shutter relay: captured media arrives as a base64 data-URL and is forwarded to the server
-- over a latent event.
---@type integer Latent-event throttle for photos (bytes/sec).
local PHOTO_BPS <const> = 256 * 1024
---@type integer Latent-event throttle for videos (bytes/sec).
local VIDEO_BPS <const> = 2 * 1024 * 1024

---React -> Lua: shutter pressed - relays the captured media to the server. The image must be a
---non-empty string and the kind is coerced onto the photo/video whitelist.
RegisterNUICallback('sd-phone:camera:capture', function(data, cb)
    local image = data and data.image
    if type(image) ~= 'string' or image == '' then
        cb({ success = false, error = 'no-image' })
        return
    end

    local kind = (data and data.kind == 'video') and 'video' or 'photo'
    local bps  = kind == 'video' and VIDEO_BPS or PHOTO_BPS

    TriggerLatentServerEvent('sd-phone:server:photos:upload', bps, image, kind)
    cb({ success = true })
end)

---Resource-stop cleanup: stops the flash and exits the cell-cam view.
---@param res string name of the resource that stopped
AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then
        stopFlash()
        exitCameraView()
    end
end)
