---Flips the active cellphone camera between rear and front (selfie), invoking the native by hash.
---@param activate boolean true = front (selfie) camera
local function CellFrontCamActivate(activate)
    Citizen.InvokeNative(0x2491A93618B7D838, activate)
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
---@type integer E (INPUT_PICKUP) - toggle the flash.
local CTRL_FLASH  <const> = 38
---@type integer Left Alt (INPUT_CHARACTER_WHEEL) - take the cursor back.
local CTRL_CURSOR <const> = 19

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

---Pushes a key action into the NUI.
---@param key string action name (shutter/flip/flash/modePrev/modeNext)
local function sendKey(key)
    SendNUIMessage({ action = 'sd-phone:camera:key', data = { key = key } })
end

---Runs the viewfinder keyboard loop while the cursor is off: disables each control's default
---action and relays presses into the NUI.
local function startInputLoop()
    if inputLoopRunning then return end
    inputLoopRunning = true
    CreateThread(function()
        while active do
            Wait(0)
            if not cursorOn then
                DisableControlAction(0, CTRL_CURSOR, true)
                DisableControlAction(0, CTRL_FLASH, true)
                DisableControlAction(0, CTRL_SHOOT, true)
                DisableControlAction(0, CTRL_FLIP, true)
                DisableControlAction(0, CTRL_PREV, true)
                DisableControlAction(0, CTRL_NEXT, true)

                if IsDisabledControlJustPressed(0, CTRL_CURSOR) then
                    cursorOn = true
                    SetNuiFocus(true, true)
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

---Activates GTA's native cellphone camera, yields the hold pose, and hides the HUD/radar when
---they were not hidden already. Idempotent while already active.
local function enterCameraView()
    if active then return end
    active   = true
    frontCam = false
    cursorOn = true

    TriggerEvent('sd-phone:client:cameraMode', true)

    CreateMobilePhone(1)
    CellCamActivate(true, true)
    CellFrontCamActivate(false)

    if not IsHudHidden()   then hidHud   = true; DisplayHud(false)   end
    if not IsRadarHidden() then hidRadar = true; DisplayRadar(false) end

    startInputLoop()
end

---Deactivates the cell-cam, hands the pose back, re-shows the HUD/radar this module hid, and
---re-focuses the NUI. Idempotent while already inactive.
local function exitCameraView()
    if not active then return end
    active   = false
    frontCam = false

    CellFrontCamActivate(false)
    CellCamActivate(false, false)
    DestroyMobilePhone()

    TriggerEvent('sd-phone:client:cameraMode', false)

    if hidHud   then DisplayHud(true);   hidHud   = false end
    if hidRadar then DisplayRadar(true); hidRadar = false end

    cursorOn = true
    SetNuiFocus(true, true)
end

---Flips between rear and front (selfie) camera. No-op while the cell cam isn't active.
---@param on boolean|nil truthy = front camera
local function setSelfie(on)
    if not active then return end
    frontCam = on and true or false
    CellFrontCamActivate(frontCam)
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
    local on = data and data.on and true or false
    cursorOn = on
    SetNuiFocus(on, on)
    cb({ success = true })
end)

---React -> Lua: the Camera app mounted - enter the native cell-cam view.
RegisterNUICallback('sd-phone:camera:open', function(_, cb)
    enterCameraView()
    cb({ success = true })
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
