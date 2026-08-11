---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'
---@type table Scripted phone camera (client.phonecam): owns the view whenever the video call is
---allowed to keep the player moving, since the native cell cam pins the ped at engine level.
local phonecam = require 'client.phonecam'
---@type table On-screen keybind hints (client.hints): placement config shared with the Camera app.
local hints = require 'client.hints'

-- Thin delegates: each call action proxies straight into its server callback.
proxyCallback('sd-phone:call:dial',    'sd-phone:server:call:dial')
proxyCallback('sd-phone:call:accept',  'sd-phone:server:call:accept')
proxyCallback('sd-phone:call:decline', 'sd-phone:server:call:decline')
proxyCallback('sd-phone:call:hangup',  'sd-phone:server:call:hangup')
proxyCallback('sd-phone:call:add',     'sd-phone:server:call:add')
proxyCallback('sd-phone:call:current', 'sd-phone:server:call:current')

---Forwards a server call event straight into the React call overlay.
---@param action string NUI action name
---@param data any payload forwarded unchanged
local function pushCall(action, data)
    SendNUIMessage({ action = action, data = data })
end

---@type boolean True while the local mic is muted for the active call.
local micMuted = false

---Mutes/unmutes the local mic entirely (call AND proximity).
---Switching the voice target to 0 (the default, which carries no call channels) prevents audio
---from reaching the pma-voice call channel; zeroing the input distance silences proximity too.
---The target is only touched when pma-voice is running, since the index is its own.
---@param on boolean
local function setMicMuted(on)
    micMuted = on == true
    local pma = GetResourceState('pma-voice') == 'started'
    if micMuted then
        if pma then MumbleSetVoiceTarget(0) end
        MumbleSetAudioInputDistance(0.0)
    else
        if pma then MumbleSetVoiceTarget(1) end
        MumbleSetAudioInputDistance(9999.0)
    end
end

---React to Lua: the call UI's Mute button.
---@param data { on: boolean }
---@param cb fun(ok: string) NUI response
RegisterNUICallback('sd-phone:call:mute', function(data, cb)
    setMicMuted(data and data.on)
    cb('ok')
end)

---React to Lua: the call UI's Speaker button; the server joins/drops nearby players.
---@param data { on: boolean }
---@param cb fun(ok: string) NUI response
RegisterNUICallback('sd-phone:call:speaker', function(data, cb)
    TriggerServerEvent('sd-phone:server:call:speaker', data and data.on == true)
    cb('ok')
end)

---Applies the phone's call-volume setting (0-100) to pma-voice so it controls how loud the other
---party sounds. pcall-guarded for non-pma-voice setups.
---@param data { volume: number } clamped 0-100
---@param cb fun(ok: string) NUI response
RegisterNUICallback('sd-phone:call:setVolume', function(data, cb)
    local volume = tonumber(data and data.volume)
    if volume then
        if volume < 0 then volume = 0 elseif volume > 100 then volume = 100 end
        pcall(function() exports['pma-voice']:setCallVolume(volume) end)
    end
    cb('ok')
end)

---Incoming call: forces the phone open, waits briefly for the React tree to mount, then pushes
---the ringing payload.
---@param data table incoming-call payload from the server
RegisterNetEvent('sd-phone:client:call:incoming', function(data)
    exports['sd-phone']:open()
    Wait(200)
    pushCall('sd-phone:call:incoming', data)
end)

-- Call-lifecycle relays: outgoing ring-back, connect, and end push straight into the React
-- overlay.
RegisterNetEvent('sd-phone:client:call:outgoing', function(data)
    pushCall('sd-phone:call:outgoing', data)
end)

RegisterNetEvent('sd-phone:client:call:connected', function(data)
    pushCall('sd-phone:call:connected', data)
end)

RegisterNetEvent('sd-phone:client:call:ended', function(data)
    if micMuted then setMicMuted(false) end
    pushCall('sd-phone:call:ended', data)
end)

---Conference roster: who else is on this call, and who is still being rung into it. Pushed on
---every membership change rather than polled, so a phone that was not the one doing the adding
---still names the new party the moment they answer.
---@param data { channel: number, others: table[], pending: table|nil }
RegisterNetEvent('sd-phone:client:call:roster', function(data)
    pushCall('sd-phone:call:roster', data)
end)

---A call torn down because tower coverage went. `lost` marks whether it was this player's own
---signal that dropped; the phone raises a dialog either way.
---@param data { lost: boolean }
RegisterNetEvent('sd-phone:client:call:dropped', function(data)
    pushCall('sd-phone:call:dropped', data)
end)

---Flips the active cell-cam between the rear and front (selfie) lens.
---The old raw hash (0x2491A93618B7D838) is stale on current builds and threw "invalid native";
---the name lets FiveM cross-map it, and a missing native no-ops quietly.
---@param on boolean true for the front (selfie) lens
local CellFrontCamActivate = function(on)
    local fn = CellCamActivateSelfieMode
    if fn then pcall(fn, on) end
end

---@type boolean Whether a camera currently owns the local view (video call active).
local videoCamActive = false

-- Keyboard controls for a FaceTime call (control group 0). The video surface hands the mouse to
-- the game exactly the way the Camera app's viewfinder does, so it answers to the same keys.
---@type integer Left Alt (INPUT_CHARACTER_WHEEL) - take the cursor back.
local CTRL_CURSOR <const> = 19
---@type integer Up arrow (INPUT_CELLPHONE_UP) - flip rear/selfie.
local CTRL_FLIP <const> = 172

---@type integer[] Both call keys, suppressed for as long as the call view is up whether the cursor
---is on or not: with movement allowed the game still reads them, so Alt would open the character
---wheel underneath the player reaching to take the cursor back.
local CONTROLS_VIDEO <const> = { CTRL_CURSOR, CTRL_FLIP }

---@type boolean True while NUI focus (clickable cursor) is on.
local cursorOn = true
---@type boolean True while the FaceTime keyboard-control thread is alive.
local inputLoopRunning = false
---@type boolean Mirror of the phone's open state (sd-phone:client:openState).
local phoneOpen = false

AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open and true or false
end)

---Records the call's cursor state and announces it, so client.main knows whether the mouse is
---steering the view rather than clicking the call UI - that flag is what stops the phone
---suppressing mouse-look. Call it after SetNuiFocus, so the keep-input re-sync lands last.
---@param on boolean whether the NUI cursor is showing
local function setVideoCursor(on)
    cursorOn = on
    TriggerEvent('sd-phone:client:cameraCursor', on)
end

---Pushes a key action into the NUI.
---@param key string action name (flip)
local function sendKey(key)
    SendNUIMessage({ action = 'sd-phone:video:key', data = { key = key } })
end

---Runs the FaceTime keyboard loop: disables each control's default action for as long as the call
---view is up, and relays presses into the NUI while the cursor is off.
---
---The set is added once and dropped on the way out rather than reissued per frame, but
---lib.disableControls still has to be CALLED every frame: IsDisabledControlJustPressed below only
---reads a control that was disabled this frame. The relays run only while the mouse belongs to the
---game; with the cursor up the page has its own handlers and receives these keys itself.
local function startVideoInputLoop()
    if inputLoopRunning then return end
    inputLoopRunning = true
    CreateThread(function()
        lib.disableControls:Add(CONTROLS_VIDEO)
        while videoCamActive do
            Wait(0)
            lib.disableControls()

            if not cursorOn then
                if IsDisabledControlJustPressed(0, CTRL_CURSOR) then
                    SetNuiFocus(true, true)
                    setVideoCursor(true)
                elseif IsDisabledControlJustPressed(0, CTRL_FLIP) then
                    sendKey('flip')
                end
            end
        end
        lib.disableControls:Remove(CONTROLS_VIDEO)
        inputLoopRunning = false
    end)
end

---Toggles the camera takeover for a video call and hides the HUD per frame while active. The
---scripted cam frames it wherever movement is allowed, the native cell cam otherwise. Idempotent
---per direction.
---@param on boolean|nil activate (truthy) or deactivate
---@param front boolean|nil front lens (default true); false switches to the rear lens
local function setVideoCamera(on, front)
    if on then
        if not videoCamActive then
            videoCamActive = true
            setVideoCursor(true)
            -- Take the view BEFORE announcing the mode: the pose handler asks phonecam.active()
            -- which lens is framing, and the scripted cam animates no pose of its own.
            if phonecam.movementAllowed('video') then
                phonecam.start()
            else
                CreateMobilePhone(4)
                CellCamActivate(true, true)
            end
            TriggerEvent('sd-phone:client:cameraMode', true, 'video')
            CreateThread(function()
                while videoCamActive do
                    Wait(0)
                    HideHudAndRadarThisFrame()
                end
            end)
            startVideoInputLoop()
        end
        if phonecam.active() then
            phonecam.setSelfie(front ~= false)
        else
            CellFrontCamActivate(front ~= false)
        end
    elseif videoCamActive then
        videoCamActive = false
        if phonecam.active() then
            phonecam.stop()
        else
            CellCamActivate(false, false)
            DestroyMobilePhone()
        end
        TriggerEvent('sd-phone:client:cameraMode', false, 'video')

        -- The call view can go while the phone is already closing (a hangup mid-walk unmounts it
        -- behind the close animation), so re-focusing unconditionally would strand a cursor on an
        -- empty screen. Announce the cursor either way: the audio call carries on and client.main
        -- has to stop treating the mouse as the view's.
        if phoneOpen and not cursorOn then SetNuiFocus(true, true) end
        setVideoCursor(true)
    end
end

-- NUI to server one-way signaling (request/accept/stop/signal): fire-and-forget events.
RegisterNUICallback('sd-phone:video:request', function(_, cb) TriggerServerEvent('sd-phone:server:call:video:request'); cb('ok') end)
RegisterNUICallback('sd-phone:video:accept',  function(_, cb) TriggerServerEvent('sd-phone:server:call:video:accept');  cb('ok') end)
RegisterNUICallback('sd-phone:video:stop',    function(_, cb) TriggerServerEvent('sd-phone:server:call:video:stop');    cb('ok') end)
RegisterNUICallback('sd-phone:video:signal',  function(data, cb) TriggerServerEvent('sd-phone:server:call:video:signal', data); cb('ok') end)

---ICE server config for the WebRTC peer connection (request/response); an empty list is the
---fallback.
RegisterNUICallback('sd-phone:video:config', function(_, cb)
    cb(lib.callback.await('sd-phone:server:call:video:config', false) or { iceServers = {} })
end)

---Selfie-cam takeover toggle, driven by the video UI mounting / unmounting. Nil-guarded. Reports
---whether the scripted cam took the view, since only that one leaves the player free to walk and so
---has any use for the mouse, plus where the keybind hints belong.
---@param data table { on: boolean, front?: boolean }
RegisterNUICallback('sd-phone:video:camera', function(data, cb)
    setVideoCamera(data and data.on, data and data.front)
    cb({ success = true, walkable = phonecam.active(), hints = hints.config() })
end)

---React -> Lua: cursor toggle requested from the call page.
RegisterNUICallback('sd-phone:video:cursor', function(data, cb)
    -- Refused off the call view, and refused on the native cell cam: that one pins the ped at
    -- engine level, so handing the mouse over there gives up the call buttons and steers nothing.
    if not videoCamActive or not phonecam.active() then cb({ success = false }) return end
    local on = data and data.on and true or false
    SetNuiFocus(on, on)
    setVideoCursor(on)
    cb({ success = true })
end)

-- Server to NUI relays: the peer's video request/accept/stop and signaling messages forward
-- unchanged into the React call overlay.
RegisterNetEvent('sd-phone:client:call:video:request', function()      pushCall('sd-phone:video:request', nil) end)
---An answered FaceTime opens on both ends at once; `initiator` decides which side makes the offer.
RegisterNetEvent('sd-phone:client:call:video:begin',   function(data)  pushCall('sd-phone:video:begin',    data) end)
RegisterNetEvent('sd-phone:client:call:video:accept',  function()      pushCall('sd-phone:video:accept',  nil) end)
RegisterNetEvent('sd-phone:client:call:video:stop',    function()      pushCall('sd-phone:video:stop',    nil) end)
RegisterNetEvent('sd-phone:client:call:video:signal',  function(data)  pushCall('sd-phone:video:signal',  data) end)
