---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'
---@type table Scripted phone camera (client.phonecam): owns the view whenever the video call is
---allowed to keep the player moving, since the native cell cam pins the ped at engine level.
local phonecam = require 'client.phonecam'
---@type table On-screen keybind hints (client.hints): placement config shared with the Camera app.
local hints = require 'client.hints'
---@type table Voice backend (bridge.client.voice): one API over pma-voice and SaltyChat.
local voice = require 'bridge.client.voice'

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

---@type boolean True from the moment a call starts ringing out until it ends.
local callLive = false

---@type boolean True while the call screen has been minimised away, so the phone is open on some
---other app. Only meaningful while callLive.
local callMinimised = false

---Tells the shell whether a call is live and whether its screen has been minimised away, so the
---held pose survives the phone being put away and drops out of the ear pose once the player has
---left the call screen for another app.
local function syncCallPose()
    TriggerEvent('sd-phone:client:callPose', callLive, callMinimised)
end

---Only ever announced on a change: the pose refresh it drives also re-broadcasts the prop
---statebag, which is not worth doing on every roster or connect push. Ending a call clears the
---minimised flag too, so the next one opens on its call screen rather than inheriting this one.
---@param on boolean
local function setCallLive(on)
    if callLive == on then return end
    callLive = on
    if not on then callMinimised = false end
    syncCallPose()
end

---Mutes/unmutes the local mic entirely (call AND proximity), through whichever voice script is
---running. A backend with no mute (SaltyChat) leaves the flag alone, so the phone never reports
---itself muted when nothing was actually silenced.
---@param on boolean
local function setMicMuted(on)
    if not voice.setMuted(on == true) then return end
    micMuted = on == true
end

---React to Lua: the call UI's Mute button.
---@param data { on: boolean }
---@param cb fun(ok: string) NUI response
RegisterNUICallback('sd-phone:call:mute', function(data, cb)
    setMicMuted(data and data.on)
    cb('ok')
end)

---React to Lua: the call screen was minimised away or brought back. Drives the held pose only, so
---it is dropped outside a live call rather than remembered for the next one.
---@param data { on: boolean }
---@param cb fun(ok: string) NUI response
RegisterNUICallback('sd-phone:call:minimised', function(data, cb)
    local on = data and data.on == true
    if callLive and callMinimised ~= on then
        callMinimised = on
        syncCallPose()
    end
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
        voice.setCallVolume(volume)
    end
    cb('ok')
end)

---React -> Lua: what the running voice script can actually do, so the call UI never offers a
---control it cannot honour. Asked rather than pushed because it is fixed for the session.
---@param _ any unused
---@param cb fun(caps: { mute: boolean, callVolume: boolean, transmitState: boolean, radio: boolean })
RegisterNUICallback('sd-phone:call:voiceCapabilities', function(_, cb)
    cb(voice.capabilities())
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
    setCallLive(true)
    pushCall('sd-phone:call:outgoing', data)
end)

RegisterNetEvent('sd-phone:client:call:connected', function(data)
    setCallLive(true)
    pushCall('sd-phone:call:connected', data)
end)

RegisterNetEvent('sd-phone:client:call:ended', function(data)
    -- Push first: the mic reset reaches into the voice script, and anything it raises must not
    -- take the end of the call down with it.
    pushCall('sd-phone:call:ended', data)
    setCallLive(false)
    if micMuted then pcall(setMicMuted, false) end
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

-- Keyboard controls for a video call (control group 0). The video surface hands the mouse to
-- the game exactly the way the Camera app's viewfinder does, so it answers to the same keys.
---@type integer Left Alt (INPUT_CHARACTER_WHEEL) - take the cursor back.
local CTRL_CURSOR <const> = 19
---@type integer Up arrow (INPUT_CELLPHONE_UP) - flip rear/selfie.
local CTRL_FLIP <const> = 172
---@type integer Down arrow (INPUT_CELLPHONE_DOWN) - the angle lock's default bind. Suppressed like
---its siblings so the game's own action never fires underneath the keybind.
local CTRL_LOCK <const> = 173
---@type integer Wheel up (INPUT_CURSOR_SCROLL_UP) - zoom in.
local CTRL_ZOOM_IN <const> = 241
---@type integer Wheel down (INPUT_CURSOR_SCROLL_DOWN) - zoom out.
local CTRL_ZOOM_OUT <const> = 242

---@type integer[] Every call key, suppressed for as long as the call view is up whether the cursor
---is on or not: with movement allowed the game still reads them, so Alt would open the character
---wheel underneath the player reaching to take the cursor back.
local CONTROLS_VIDEO <const> = { CTRL_CURSOR, CTRL_FLIP, CTRL_LOCK, CTRL_ZOOM_IN, CTRL_ZOOM_OUT }

---@type boolean True while NUI focus (clickable cursor) is on.
local cursorOn = true
---@type boolean True while the video-call keyboard-control thread is alive.
local inputLoopRunning = false
---@type boolean Mirror of the phone's open state (sd-phone:client:openState).
local phoneOpen = false

AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open and true or false
end)

---Records the call's cursor state and announces it, so client.main knows whether the mouse is
---steering the view rather than clicking the call UI - that flag is what stops the phone
---suppressing mouse-look. Call it after SetNuiFocus, so the keep-input re-sync lands last.
---
---The page is told as well as client.main, because the control tray is only reachable while the
---cursor is up: hand the mouse to the game and those buttons cannot be clicked at all, so the tray
---stands down rather than sitting over the caller doing nothing. The keybind hints stay up, since
---the keys are the whole interface in that mode.
---@param on boolean whether the NUI cursor is showing
local function setVideoCursor(on)
    cursorOn = on
    TriggerEvent('sd-phone:client:cameraCursor', on)
    SendNUIMessage({ action = 'sd-phone:video:cursorState', data = { on = on } })
end

---Pushes a key action into the NUI.
---@param key string action name (flip)
local function sendKey(key)
    SendNUIMessage({ action = 'sd-phone:video:key', data = { key = key } })
end

---Runs the video-call keyboard loop: disables each control's default action for as long as the call
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
                if IsDisabledControlJustPressed(0, CTRL_ZOOM_IN) then
                    sendKey('zoomIn')
                elseif IsDisabledControlJustPressed(0, CTRL_ZOOM_OUT) then
                    sendKey('zoomOut')
                elseif IsDisabledControlJustPressed(0, CTRL_CURSOR) then
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

---React -> Lua: angle lock toggled from the call's on-screen control (or the Down key, which
---reaches phonecam through the global keybind and reports back over the push instead).
---
---The lens is asked for the state it ended up in rather than the page being trusted for it: every
---flip clears the lock in Lua, so a page copy can describe a lens that stopped behaving that way.
---A nil refusal is the outward lens or the native cell cam, neither of which can swing.
---@param _ any unused
---@param cb fun(result: { success: boolean, on: boolean|nil }) NUI response
RegisterNUICallback('sd-phone:video:lock', function(_, cb)
    if not videoCamActive then cb({ success = false }) return end
    local on = phonecam.toggleLock()
    if on == nil then cb({ success = false }) return end
    cb({ success = true, on = on })
end)

---React -> Lua: head tracking toggled from the call's on-screen control (or the R Shift keybind).
---Same refusal and same reporting as the lock above.
---@param _ any unused
---@param cb fun(result: { success: boolean, on: boolean|nil }) NUI response
RegisterNUICallback('sd-phone:video:faceCam', function(_, cb)
    if not videoCamActive then cb({ success = false }) return end
    local on = phonecam.toggleFaceCam()
    if on == nil then cb({ success = false }) return end
    cb({ success = true, on = on })
end)

---React -> Lua: call-camera magnification. Zooming the lens optically keeps the picture sharp,
---where cropping the captured frame sends the peer fewer pixels the further in you go.
---@param data { zoom: number }
---@param cb fun(result: { success: boolean }) NUI response
RegisterNUICallback('sd-phone:video:zoom', function(data, cb)
    phonecam.setZoom(data and data.zoom)
    cb({ success = true })
end)

-- Server to NUI relays: the peer's video request/accept/stop and signaling messages forward
-- unchanged into the React call overlay.
RegisterNetEvent('sd-phone:client:call:video:request', function()      pushCall('sd-phone:video:request', nil) end)
---An answered video call opens on both ends at once; `initiator` decides which side makes the offer.
RegisterNetEvent('sd-phone:client:call:video:begin',   function(data)  pushCall('sd-phone:video:begin',    data) end)
RegisterNetEvent('sd-phone:client:call:video:accept',  function()      pushCall('sd-phone:video:accept',  nil) end)
RegisterNetEvent('sd-phone:client:call:video:stop',    function()      pushCall('sd-phone:video:stop',    nil) end)
RegisterNetEvent('sd-phone:client:call:video:signal',  function(data)  pushCall('sd-phone:video:signal',  data) end)

-- Call recording: NUI to server one-way, and the peer's notifications back into the overlay.
RegisterNUICallback('sd-phone:record:start', function(_, cb) TriggerServerEvent('sd-phone:server:call:record:start'); cb('ok') end)
RegisterNUICallback('sd-phone:record:stop',  function(_, cb) TriggerServerEvent('sd-phone:server:call:record:stop');  cb('ok') end)

RegisterNetEvent('sd-phone:client:call:record:start', function() pushCall('sd-phone:record:peerStart', nil) end)
RegisterNetEvent('sd-phone:client:call:record:stop',  function() pushCall('sd-phone:record:peerStop',  nil) end)

---Dev only: opens the phone and drives the in-call panel with no real call behind it. The
---sequencing lives here rather than on the server so the open animation is given time to finish
---before the panel is pushed on top of it.
---@param data table { channel: number, name: string, number: string }
RegisterNetEvent('sd-phone:client:call:devFake', function(data)
    if type(data) ~= 'table' then return end
    exports['sd-phone']:open()
    SetTimeout(450, function()
        setCallLive(true)
        pushCall('sd-phone:call:outgoing', data)
        SetTimeout(1200, function()
            pushCall('sd-phone:call:connected', { channel = data.channel })
        end)
    end)
end)
