---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'
---@type table Scripted phone camera (client.phonecam): owns the view whenever the video call is
---allowed to keep the player moving, since the native cell cam pins the ped at engine level.
local phonecam = require 'client.phonecam'

-- Thin delegates: each call action proxies straight into its server callback.
proxyCallback('sd-phone:call:dial',    'sd-phone:server:call:dial')
proxyCallback('sd-phone:call:accept',  'sd-phone:server:call:accept')
proxyCallback('sd-phone:call:decline', 'sd-phone:server:call:decline')
proxyCallback('sd-phone:call:hangup',  'sd-phone:server:call:hangup')
proxyCallback('sd-phone:call:current', 'sd-phone:server:call:current')

---Forwards a server call event straight into the React call overlay.
---@param action string NUI action name
---@param data any payload forwarded unchanged
local function pushCall(action, data)
    SendNUIMessage({ action = action, data = data })
end

---@type boolean True while the local mic is muted for the active call.
local micMuted = false

---Mutes/unmutes the local mic entirely (call AND proximity - a muted caller isn't talking).
---Mumble's audio input distance gates capture at the source; near-zero captures nothing.
---@param on boolean
local function setMicMuted(on)
    micMuted = on == true
    MumbleSetAudioInputDistance(micMuted and 0.05 or 9999.0)
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

---Toggles the camera takeover for a video call and hides the HUD per frame while active. The
---scripted cam frames it wherever movement is allowed, the native cell cam otherwise. Idempotent
---per direction.
---@param on boolean|nil activate (truthy) or deactivate
---@param front boolean|nil front lens (default true); false switches to the rear lens
local function setVideoCamera(on, front)
    if on then
        if not videoCamActive then
            videoCamActive = true
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

---Selfie-cam takeover toggle, driven by the video UI mounting / unmounting. Nil-guarded.
---@param data table { on: boolean, front?: boolean }
RegisterNUICallback('sd-phone:video:camera', function(data, cb)
    setVideoCamera(data and data.on, data and data.front)
    cb('ok')
end)

-- Server to NUI relays: the peer's video request/accept/stop and signaling messages forward
-- unchanged into the React call overlay.
RegisterNetEvent('sd-phone:client:call:video:request', function()      pushCall('sd-phone:video:request', nil) end)
RegisterNetEvent('sd-phone:client:call:video:accept',  function()      pushCall('sd-phone:video:accept',  nil) end)
RegisterNetEvent('sd-phone:client:call:video:stop',    function()      pushCall('sd-phone:video:stop',    nil) end)
RegisterNetEvent('sd-phone:client:call:video:signal',  function(data)  pushCall('sd-phone:video:signal',  data) end)
