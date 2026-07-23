---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Notify bridge (bridge.client.notify): backend-agnostic on-screen toasts.
local notify = require 'bridge.client.notify'
---@type table Weather bridge (bridge.client.weather): live weather + synced world-time reads.
local weatherBridge = require 'bridge.client.weather'
---@type table Custom third-party app registry (client.customapps): add/remove/message + lifecycle.
local customApps = require 'client.customapps'

-- Loaded for side effects: each app module registers its own NUI callbacks, net events and
-- server proxies.
require 'client.apps.groups'
require 'client.apps.health'
require 'client.apps.mail'
require 'client.apps.messages'
require 'client.apps.camera'
require 'client.apps.photos'
require 'client.apps.birdy'
require 'client.apps.accounts'
require 'client.apps.contacts'
require 'client.apps.appstore'
require 'client.apps.calls'
require 'client.apps.gifs'
require 'client.apps.garages'
require 'client.apps.darkchat'
require 'client.apps.marketplace'
require 'client.apps.pages'
require 'client.apps.review'
require 'client.apps.weazelnews'
require 'client.apps.banking'
require 'client.apps.services'
require 'client.apps.voicememos'
require 'client.apps.music'
require 'client.apps.share'
require 'client.apps.notifications'
require 'client.apps.notes'
require 'client.apps.documents'
require 'client.apps.homes'
require 'client.apps.maps'
require 'client.apps.compass'
require 'client.apps.findfriends'
require 'client.apps.cherry'
require 'client.apps.photogram'
require 'client.apps.vibez'
require 'client.apps.voice'
require 'client.apps.streaks'
require 'client.apps.ryde'
require 'client.apps.radio'
require 'client.apps.clock'
require 'client.apps.cookie'
require 'client.apps.stocks'
require 'client.apps.games'
require 'client.apps.settings'
require 'client.apps.sim'
require 'client.admin'
require 'client.payphone'

---@type table Phone visibility state: open/locked flags + cosmetic battery percentage.
local phoneState = {
    open       = false,  -- true while the NUI is focused on the phone
    locked     = true,   -- true while the lockscreen is shown
    battery    = config.StatusBar.BatteryStart, -- cosmetic, ticks down while open
}

---@type boolean True while another resource has disabled the phone.
local phoneDisabled = false

---@type { hasSim: boolean, number: string|nil, device: boolean|nil, profile: string|nil }|nil
---Last SIM snapshot from the server; nil while unique phones are off (stock behaviour). `device`
---marks DeviceIdentity mode (phone opens without a SIM, "No Service" instead of a No-SIM wall);
---`profile` is the device identity the UI namespaces per-phone state under in that mode.
local currentSimState = nil

---@type string Current frame colour; always one of FRAME_COLORS.
local currentFrameColor = config.Phone.DefaultColor or 'black'
---@type table<string, boolean> Whitelist of valid frame colours.
local FRAME_COLORS = {
    black = true, blue = true, green = true, orange = true,
    pink = true, purple = true, red = true, yellow = true,
}

---@type integer Wall-clock ms of the session start (re-stamped on character load); the Health app's
---"time awake" anchor. Seeded at script load as a fallback for opens before the character resolves.
local SESSION_START_MS = GetCloudTimeAsInt() * 1000

---@return boolean true while the phone NUI is open
function phoneState.isOpen() return phoneState.open end

---@return boolean true while the lockscreen is shown (re-armed on every open)
function phoneState.isLocked() return phoneState.locked end

---Prints debug output when config.Debug is enabled.
---@param ... any values to print
local function debugPrint(...)
    if config.Debug then
        print('[sd-phone:client]', ...)
    end
end

---@type fun()|nil Weather snapshot push into the NUI (assigned with the weather feed below).
local pushWeather

---@type fun()|nil Phone close (assigned further down).
local ClosePhone

---@type integer|nil Handle of the attached phone prop, nil while stowed.
local phoneProp
---@type table<integer, {obj: integer, color: string}> Server id -> local phone-prop copy welded
---onto that remote holder's ped.
local remoteProps = {}
---@type boolean Lockscreen torch state; persists after the UI closes.
local flashlightOn = false
---@type boolean True while the Camera app's native cell-cam owns the pose and controls.
local cameraActive = false
---@type boolean True while a UI text field is focused.
local typingInPhone = false
---@type boolean True while the focused field is digit-only (PIN pads, dialers): keep-input
---stays on so the player can move, and the digit weapon binds are suppressed instead.
local typingNumeric = false
---@type boolean True while the hold-to-look keybind has released the cursor for camera control.
local lookMode = false

---Returns whether the hold pose should apply: phone open or flashlight on, and the Camera app
---not live.
---@return boolean
local function shouldHold()
    return (phoneState.open or flashlightOn) and not cameraActive
end

---Creates a colour-matched local phone prop, disables its collision, and rigidly welds it to the
---ped's hand bone.
---@param ped integer ped to attach the prop to
---@param color string frame colour; must be a key of FRAME_COLORS
---@return integer? prop the welded prop entity, or nil if the model wouldn't stream
local function createHandProp(ped, color)
    local model = joaat(config.Phone.PropPrefix .. color)
    RequestModel(model)
    local started = GetGameTimer()
    while not HasModelLoaded(model) and GetGameTimer() - started < 1000 do Wait(0) end
    if not HasModelLoaded(model) then return nil end
    local coords = GetEntityCoords(ped)
    local prop = CreateObject(model, coords.x, coords.y, coords.z, false, true, true)
    SetEntityCollision(prop, false, false)
    local off, rot = config.Phone.PropOffset, config.Phone.PropRot
    AttachEntityToEntity(prop, ped, GetPedBoneIndex(ped, config.Phone.PropBone),
        off.x, off.y, off.z, rot.x, rot.y, rot.z, false, false, false, false, 2, true)
    SetModelAsNoLongerNeeded(model)
    return prop
end

---Attaches our own hand prop in the current frame colour. No-op if one is already attached or
---the model won't stream.
---@param ped integer player ped handle
local function attachPhoneProp(ped)
    if phoneProp and DoesEntityExist(phoneProp) then return end
    phoneProp = createHandProp(ped, currentFrameColor)
end

---Delete the attached phone prop, if any. Idempotent.
local function removePhoneProp()
    if phoneProp and DoesEntityExist(phoneProp) then DeleteObject(phoneProp) end
    phoneProp = nil
end

---Plays the looping upper-body hold anim and attaches the prop. No-op when
---config.Phone.HoldAnimation is off.
local function startPose()
    if not config.Phone.HoldAnimation then return end
    -- Load the dict and play the pose on its own thread: the anim is cosmetic and must never
    -- gate the phone opening. Blocking here (up to 1s waiting on the dict) used to stall the
    -- NUI reveal since OpenPhone runs this synchronously before focusing the UI.
    CreateThread(function()
        RequestAnimDict(config.Phone.AnimDict)
        local started = GetGameTimer()
        while not HasAnimDictLoaded(config.Phone.AnimDict) and GetGameTimer() - started < 1000 do Wait(0) end
        -- The player may have closed the phone (or the camera took the pose) during the load.
        if not shouldHold() then return end
        local ped = PlayerPedId()
        if not IsEntityPlayingAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 3) then
            TaskPlayAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 6.0, -1.0, -1, 49, 0.0, false, false, false)
        end
        attachPhoneProp(ped)
    end)
end

---Stop the hold anim (only when it's actually our clip playing) and remove the prop.
local function stopPose()
    local ped = PlayerPedId()
    if config.Phone.HoldAnimation and IsEntityPlayingAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 3) then
        StopAnimTask(ped, config.Phone.AnimDict, config.Phone.AnimName, 1.0)
    end
    removePhoneProp()
end

---Broadcasts the hold state via the replicated `sdPhone` player statebag: frame colour while
---holding, false otherwise. No-op when cross-player visibility is off.
local function broadcastHoldState()
    if not config.Phone.PropVisibleToOthers then return end
    local color = (config.Phone.HoldAnimation and shouldHold()) and currentFrameColor or false
    LocalPlayer.state:set('sdPhone', color, true)
end

---Starts or stops the pose per current state and broadcasts it.
local function updatePose()
    if shouldHold() then startPose() else stopPose() end
    broadcastHoldState()
end

---@type boolean True while the movement-suppression thread is running.
local movementThreadRunning = false

---Runs one thread per open that suppresses combat, mouse-look, weapon-wheel and chat controls
---each frame, and closes the phone when the pause menu activates.
local function startMovementThread()
    if not config.Phone.AllowMovement or movementThreadRunning then return end
    movementThreadRunning = true
    CreateThread(function()
        while phoneState.open do
            if IsPauseMenuActive() then
                if ClosePhone then ClosePhone() end
            elseif (not typingInPhone or typingNumeric) and not cameraActive then
                DisablePlayerFiring(PlayerId(), true)
                if not lookMode then
                    DisableControlAction(0, 1, true)
                    DisableControlAction(0, 2, true)
                end
                DisableControlAction(0, 24, true)
                DisableControlAction(0, 25, true)
                DisableControlAction(0, 257, true)
                DisableControlAction(0, 263, true)
                DisableControlAction(0, 264, true)
                DisableControlAction(0, 140, true)
                DisableControlAction(0, 141, true)
                DisableControlAction(0, 142, true)
                DisableControlAction(0, 143, true)
                DisableControlAction(0, 37, true)
                DisableControlAction(0, 106, true)
                DisableControlAction(0, 245, true)
                DisableControlAction(0, 246, true)
                -- Scroll-wheel fall-throughs under keep-input: the phone owns the wheel, so
                -- vehicle radio cycling, the radio wheel and weapon cycling must not react.
                DisableControlAction(0, 14, true)
                DisableControlAction(0, 15, true)
                DisableControlAction(0, 16, true)
                DisableControlAction(0, 17, true)
                DisableControlAction(0, 81, true)
                DisableControlAction(0, 82, true)
                DisableControlAction(0, 83, true)
                DisableControlAction(0, 84, true)
                DisableControlAction(0, 85, true)
                DisableControlAction(0, 99, true)
                DisableControlAction(0, 100, true)
                if typingNumeric then
                    -- Digit pad up: the number row must not fire GTA weapon-slot binds.
                    for control = 157, 166 do
                        DisableControlAction(0, control, true)
                    end
                end
            end
            Wait(0)
        end
        movementThreadRunning = false
    end)
end

---Sets keep-input from the typing and camera flags. No-op unless the phone is open with
---AllowMovement on.
local function syncKeepInput()
    if phoneState.open and config.Phone.AllowMovement then
        SetNuiFocusKeepInput((not typingInPhone or typingNumeric) and not cameraActive)
    end
end

---Enters look mode: releases the NUI cursor so the mouse rotates the camera while the phone stays
---on screen. Only fires with the phone open in movement mode and not typing or in the camera view.
local function enterLookMode()
    if lookMode or not phoneState.open or not config.Phone.AllowMovement then return end
    if typingInPhone or cameraActive then return end
    lookMode = true
    SetNuiFocus(false, false)
end

---Exits look mode: restores the NUI cursor and keep-input. No-op unless currently looking.
local function exitLookMode()
    if not lookMode then return end
    lookMode = false
    if phoneState.open then
        SetNuiFocus(true, true)
        syncKeepInput()
    end
end

---Tracks the Camera app's cell-cam state, then re-syncs the pose and keep-input. Payload coerced
---to a strict boolean.
---@param on any truthy while the cell-cam view is live
AddEventHandler('sd-phone:client:cameraMode', function(on)
    cameraActive = on and true or false
    updatePose()
    syncKeepInput()
end)

---Opens the phone NUI onto the lockscreen, loads installed apps, focuses the NUI, and pushes a
---weather snapshot plus the session-start timestamp. Refuses while dead, swimming, or disabled.
local function OpenPhone()
    if phoneState.open then return end

    if phoneDisabled then
        notify.show({ description = 'You can\'t use your phone right now.', type = 'error' })
        return
    end

    local ped = PlayerPedId()

    if config.Phone.BlockWhileDead and IsEntityDead(ped) then
        notify.show({ description = 'You can\'t use your phone right now.', type = 'error' })
        return
    end
    if config.Phone.BlockWhileSwimming and IsPedSwimming(ped) then
        notify.show({ description = 'You can\'t use your phone while swimming.', type = 'error' })
        return
    end

    phoneState.open   = true
    phoneState.locked = true

    CreateThread(function()
        while phoneState.open do
            DisableControlAction(0, 199, true) -- INPUT_FRONTEND_PAUSE
            DisableControlAction(0, 200, true) -- INPUT_FRONTEND_PAUSE_ALTERNATE
            Wait(0)
        end
        for i = 1, 15 do
            DisableControlAction(0, 199, true)
            DisableControlAction(0, 200, true)
            Wait(0)
        end
    end)

    updatePose()

    TriggerEvent('sd-phone:client:openState', true)
    TriggerServerEvent('sd-phone:server:phone:setOpen', true)

    SetNuiFocus(true, true)
    if config.Phone.AllowMovement then
        typingInPhone = false
        typingNumeric = false
        SetNuiFocusKeepInput(true)
        startMovementThread()
    end
    SendNUIMessage({
        action = 'sd-phone:open',
        data   = {
            locale    = config.Locale,
            locked    = phoneState.locked,
            battery   = phoneState.battery,
            frameColor = currentFrameColor,
            carrier   = config.StatusBar.Carrier,
            signal    = config.StatusBar.SignalBars,
            showWifi  = config.StatusBar.ShowWifi,
            use24h    = config.Lockscreen.Use24Hour,
            showDate  = config.Lockscreen.ShowDate,
            dock      = config.Homescreen.Dock,
            apps      = config.Homescreen.Apps,
            mailDomain = config.Mail.Domain,
            wallpaper = {
                lock = config.Lockscreen.Wallpaper,
                home = config.Homescreen.Wallpaper,
            },
            sim = currentSimState and {
                enabled = true,
                hasSim  = currentSimState.hasSim == true,
                number  = currentSimState.number,
                device  = currentSimState.device == true,
                profile = currentSimState.profile,
            } or { enabled = false },
        },
    })

    pushWeather(true)

    SendNUIMessage({
        action = 'sd-phone:session',
        data   = { startMs = SESSION_START_MS },
    })

    debugPrint('phone opened')

    -- Installed apps + saved home layout need a server round-trip. Fetch them AFTER the phone is
    -- on screen (the home screen sits behind the lockscreen anyway) and push them in as a
    -- follow-up, so the round-trip never gates the reveal. The NUI paints instantly from its own
    -- fallbacks and reconciles when this lands.
    CreateThread(PushInstalledApps)
end

---Fetches the acting profile's installed apps + home layout and pushes them into the open NUI.
---Runs as the open follow-up and again after a cloud-backup restore replaces the profile data.
function PushInstalledApps()
    local installedRes = lib.callback.await('sd-phone:server:apps:list', false)
    if not phoneState.open then return end
    SendNUIMessage({
        action = 'sd-phone:apps',
        data   = {
            installedApps = (installedRes and installedRes.success and installedRes.data and installedRes.data.installed) or {},
            homeLayout    = (installedRes and installedRes.success and installedRes.data and installedRes.data.layout) or nil,
        },
    })
end

---Closes the phone NUI, announces the close, releases NUI focus, and drops the pose unless the
---flashlight keeps it. Idempotent.
function ClosePhone()
    if not phoneState.open then return end

    phoneState.open = false
    TriggerEvent('sd-phone:client:openState', false)
    TriggerServerEvent('sd-phone:server:phone:setOpen', false)
    SetNuiFocus(false, false)
    typingInPhone = false
    typingNumeric = false
    lookMode = false
    SendNUIMessage({ action = 'sd-phone:close' })

    updatePose()

    debugPrint('phone closed')
end

---Keybind toggle: closes when open, otherwise resolves ownership and colour via the server
---callback and opens. The returned colour is whitelist-checked against FRAME_COLORS. Under
---unique phones the server answers with a table carrying the SIM snapshot instead.
local function TogglePhone()
    if phoneState.open then ClosePhone() return end

    local res = lib.callback.await('sd-phone:server:phone:resolveOpen', false, currentFrameColor)
    if not res then
        notify.show({ description = 'You don\'t have a phone.', type = 'error' })
        return
    end
    local color = res
    if type(res) == 'table' then
        color = res.color
        if res.pending then
            currentSimState = currentSimState or { hasSim = true, number = nil }
        else
            currentSimState = { hasSim = res.hasSim == true, number = res.number }
        end
    else
        currentSimState = nil
    end
    if FRAME_COLORS[color] then currentFrameColor = color end
    OpenPhone()
end

-- Keybind wiring; the `-` command is the no-op release half of the +command mapping.
RegisterCommand('+sdphone_toggle', TogglePhone, false)
RegisterCommand('-sdphone_toggle', function() end, false)
RegisterKeyMapping('+sdphone_toggle', 'Toggle Phone', 'keyboard', config.Phone.Keybind)

-- Hold-to-look: the +command frees the mouse for camera rotation, the -command restores the cursor.
RegisterCommand('+sdphone_look', enterLookMode, false)
RegisterCommand('-sdphone_look', exitLookMode, false)
RegisterKeyMapping('+sdphone_look', 'Phone: Hold to look around', 'keyboard', config.Phone.LookKeybind)

---Opens the phone after a phone item is used, adopting the item variant's frame colour when it
---passes the FRAME_COLORS whitelist.
---@param color string|nil frame colour of the used item variant
---@param sim { hasSim: boolean, number: string|nil }|nil SIM snapshot (kept for signature compat; the server now defers and sends nil)
---@param simPending boolean|nil true while the server resolves the SIM in the background (unique phones)
---@param deviceHint string|nil the used phone's device identity, read synchronously from its
---item metadata: a DIFFERENT device than the last snapshot seeds the switch at reveal time
RegisterNetEvent('sd-phone:client:openFromItem', function(color, sim, simPending, deviceHint)
    if color and FRAME_COLORS[color] then currentFrameColor = color end
    if sim then
        currentSimState = { hasSim = sim.hasSim == true, number = sim.number }
    elseif simPending then
        if deviceHint and not (currentSimState and currentSimState.profile == deviceHint) then
            -- Another phone than last time: seed its profile now so the NUI tears the previous
            -- one down during the reveal; the deferred simState push still reconciles the rest.
            currentSimState = { hasSim = true, number = nil, device = true, profile = deviceHint }
        else
            -- SIM resolve is still running server-side; keep the last snapshot (optimistic
            -- has-service on a cold start) until the simState push corrects it.
            currentSimState = currentSimState or { hasSim = true, number = nil }
        end
    else
        currentSimState = nil
    end
    OpenPhone()
end)

---Live SIM state push (SIM inserted/ejected/moved). Keeps the local snapshot fresh and, while
---the phone is open, swaps the NUI's "No SIM" screen in or out immediately.
---@param state { enabled: boolean, hasSim: boolean, number: string|nil, device: boolean|nil, profile: string|nil }
RegisterNetEvent('sd-phone:client:simState', function(state)
    if type(state) ~= 'table' then return end
    currentSimState = state.enabled and {
        hasSim  = state.hasSim == true,
        number  = state.number,
        device  = state.device == true,
        profile = state.profile,
    } or nil
    -- The active SIM'd phone's colour wins: a pending keybind open answered with the owned
    -- colour before the resolve, so correct the frame, the hand prop and the UI rail here.
    if state.color and FRAME_COLORS[state.color] then
        if state.color ~= currentFrameColor then
            currentFrameColor = state.color
            if shouldHold() then
                removePhoneProp()
                attachPhoneProp(PlayerPedId())
                broadcastHoldState()
            end
        end
        -- ALWAYS forwarded (even while closed, even when the client already believed this
        -- colour): the NUI boots with its own default and has no other pre-open sync point,
        -- so a skipped forward leaves closed-shell peeks wearing the wrong frame.
        SendNUIMessage({ action = 'sd-phone:frameColor', data = { color = state.color } })
    end
    if phoneState.open then
        SendNUIMessage({
            action = 'sd-phone:simState',
            data   = {
                enabled = state.enabled == true,
                hasSim  = state.hasSim == true,
                number  = state.number,
                device  = state.device == true,
                profile = state.profile,
            },
        })
    end
end)

---Cloud-backup restore replaced the acting profile's data in place: the NUI drops every cached
---trace (kept-alive apps, hydrated settings, data stores) and rehydrates. Forwarded even while
---the phone is closed - the NUI keeps running hidden and would otherwise reopen on stale state.
---The installed-apps follow-up re-runs too, since the restore changes apps + home layout.
RegisterNetEvent('sd-phone:client:profileReset', function()
    SendNUIMessage({ action = 'sd-phone:profileReset' })
    if phoneState.open then CreateThread(PushInstalledApps) end
end)

---Admin wipe (server /wipemyphone): closes the phone and tells the React app to clear its local
---storage and reload. The reload tears down the phone AND the admin-panel React trees, so any NUI
---focus they were holding must be dropped here - otherwise the reloaded (empty) NUI keeps focus
---with no UI left to release it, and the player is stuck. wipeFocus lets the panels clear their
---own open flags first so a later phone close doesn't re-assert focus over nothing.
RegisterNetEvent('sd-phone:client:wipe', function()
    TriggerEvent('sd-phone:client:wipeFocus')
    if phoneState.open then ClosePhone() end
    SendNUIMessage({ action = 'sd-phone:wipe' })
    SetNuiFocus(false, false)
end)

---React to Lua: the NUI requests the phone be closed (swipe down / back gesture).
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:close', function(_, cb)
    ClosePhone()
    cb({ ok = true })
end)

---React to Lua: unlock gesture finished. Clears the locked flag; it re-arms on the next open.
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:unlock', function(_, cb)
    phoneState.locked = false
    cb({ ok = true })
end)

---React to Lua: the closed-shell peek's call island was tapped; reopen the phone onto the
---live call.
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:requestOpen', function(_, cb)
    OpenPhone()
    cb({ ok = true })
end)

---React to Lua: a text field gained or lost focus. Full typing releases keep-input so keys
---reach only the field; numeric typing (PIN pads, dialers) keeps it so the player can still
---move, with the digit weapon binds suppressed by the movement thread instead.
---@param data table|nil { typing: boolean, numeric: boolean }
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:typing', function(data, cb)
    typingInPhone = data and data.typing and true or false
    typingNumeric = typingInPhone and data and data.numeric and true or false
    syncKeepInput()
    cb({ ok = true })
end)

---React to Lua: an app icon was tapped; prints a debug breadcrumb.
---@param data table|nil { id: string }
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:openApp', function(data, cb)
    debugPrint('openApp:', data and data.id or '?')
    cb({ ok = true })
end)

---React to Lua: lockscreen torch button. Flips the beam, re-applies the pose, and returns the
---resulting state.
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response { on: boolean }
RegisterNUICallback('sd-phone:flashlight:toggle', function(_, cb)
    flashlightOn = not flashlightOn
    updatePose()
    TriggerEvent('sd-phone:client:flashlight', flashlightOn)
    cb({ on = flashlightOn })
end)

---React to Lua: returns the current beam state.
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response { on: boolean }
RegisterNUICallback('sd-phone:flashlight:state', function(_, cb)
    cb({ on = flashlightOn })
end)

---Pushes the current weather + synced world time snapshot into the NUI.
pushWeather = function()
    SendNUIMessage({
        action = 'sd-phone:weather',
        data   = weatherBridge.read(),
    })
end

-- 5s weather poll while the phone is open.
CreateThread(function()
    while true do
        if phoneState.open then pushWeather() end
        Wait(5000)
    end
end)

-- Immediate push on every weather change.
weatherBridge.onChange(function()
    if phoneState.open then pushWeather() end
end)

---Returns a weather + world-time snapshot for the Weather app on mount.
---@param _data table|nil unused payload
---@param cb fun(result: table) NUI response (weather snapshot)
RegisterNUICallback('sd-phone:weather:get', function(_data, cb)
    cb(weatherBridge.read())
end)

-- Cosmetic battery drain: one percent every 30s while the phone is open, pushed to the React app.
CreateThread(function()
    while true do
        Wait(30000)
        if phoneState.open and phoneState.battery > 0 then
            phoneState.battery = phoneState.battery - 1
            SendNUIMessage({ action = 'sd-phone:battery', data = phoneState.battery })
        end
    end
end)

-- Draws a spotlight from the hand bone in the ped's facing direction each frame while the
-- torch is on; idles at a 300ms poll while off. Direction is NOT camera-based so looking
-- around does not move the beam.
CreateThread(function()
    local fl = config.Phone.Flashlight
    while true do
        if flashlightOn then
            local ped = PlayerPedId()
            local pos = GetPedBoneCoords(ped, config.Phone.PropBone, 0.0, 0.0, 0.0)
            local fwd = GetEntityForwardVector(ped)
            DrawSpotLight(
                pos.x, pos.y, pos.z,
                fwd.x, fwd.y, fwd.z,
                fl.Color[1], fl.Color[2], fl.Color[3],
                fl.Distance, fl.Brightness, 0.0, fl.Radius, 1.0
            )
            Wait(0)
        else
            Wait(300)
        end
    end
end)

-- Re-applies the hold pose on a 500ms poll if the game clears it.
CreateThread(function()
    while true do
        if shouldHold() then
            local ped = PlayerPedId()
            if config.Phone.HoldAnimation and not IsEntityPlayingAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 3) then
                startPose()
            end
        end
        Wait(500)
    end
end)

---Deletes a remote holder's welded prop copy, if any. Idempotent.
---@param source integer server id of the remote holder
local function removeRemoteProp(source)
    local entry = remoteProps[source]
    if entry and entry.obj and DoesEntityExist(entry.obj) then DeleteObject(entry.obj) end
    remoteProps[source] = nil
end

-- Cross-player prop visibility: the holder broadcasts the replicated `sdPhone` player statebag
-- and every client welds its own local prop copy onto the holder's ped.
if config.Phone.PropVisibleToOthers then
    ---Resolves a `player:<serverId>` bag to (serverId, ped); ped is 0 when that player isn't in
    ---scope on this client.
    ---@param bagName string
    ---@return integer? source, integer ped
    local function bagOwner(bagName)
        local source = tonumber(bagName:match('player:(%d+)'))
        if not source then return nil, 0 end
        local plyr = GetPlayerFromServerId(source)
        if plyr == -1 then return source, 0 end
        return source, GetPlayerPed(plyr)
    end

    AddStateBagChangeHandler('sdPhone', nil, function(bagName, _key, value)
        local source, ped = bagOwner(bagName)
        if not source or source == GetPlayerServerId(PlayerId()) then return end
        if not value or ped == 0 then
            removeRemoteProp(source)
            return
        end
        if not FRAME_COLORS[value] then return end
        local entry = remoteProps[source]
        if entry and entry.color == value and DoesEntityExist(entry.obj) then return end
        removeRemoteProp(source)
        local obj = createHandProp(ped, value)
        if obj then remoteProps[source] = { obj = obj, color = value } end
        debugPrint(('remote prop for %s -> %s'):format(source, value))
    end)

    -- 1s sweep: removes copies whose owner left scope or whose prop no longer exists.
    CreateThread(function()
        while true do
            Wait(1000)
            for source, entry in pairs(remoteProps) do
                local plyr = GetPlayerFromServerId(source)
                local ped = plyr ~= -1 and GetPlayerPed(plyr) or 0
                if ped == 0 or not DoesEntityExist(ped) or not DoesEntityExist(entry.obj) then
                    removeRemoteProp(source)
                end
            end
        end
    end)
end

---Launches an app from another resource (exports['sd-phone']:openApp), opening the phone first
---if needed. Returns false on a refused open or malformed arguments.
---@param appId string app id as the home screen knows it (e.g. 'messages')
---@param link table|nil optional deep-link payload
---@return boolean accepted true once the launch has been handed to the UI
local function OpenApp(appId, link)
    if type(appId) ~= 'string' or appId == '' then return false end
    if link ~= nil and type(link) ~= 'table' then return false end
    if not phoneState.open then
        OpenPhone()
        if not phoneState.open then return false end
    end
    SendNUIMessage({
        action = 'sd-phone:launchApp',
        data   = { id = appId, link = link },
    })
    return true
end

-- Exports for other resources: query phone visibility or drive the phone.
exports('isOpen',   phoneState.isOpen)
exports('isLocked', phoneState.isLocked)
exports('open',     OpenPhone)
exports('close',    ClosePhone)
exports('openApp',  OpenApp)

---Registers a third-party app - exports['sd-phone']:addCustomApp(data). Attribution is the calling
---resource; re-registering an identifier is only allowed from that same resource.
---@param data table lb-phone-shaped app definition
---@return boolean ok, string? err
exports('addCustomApp', function(data)
    return customApps.add(data, GetInvokingResource())
end)

---Removes a registered app - exports['sd-phone']:removeCustomApp(identifier). Only the resource that
---registered the app may remove it.
---@param identifier string
---@return boolean ok, string? err
exports('removeCustomApp', function(identifier)
    return customApps.remove(identifier, GetInvokingResource())
end)

---Pushes a Lua message into a registered app's UI - exports['sd-phone']:sendCustomAppMessage(id, msg).
---Only the owning resource may message its own app; the reserved id 'any' broadcasts to every app.
---@param identifier string
---@param message any
---@return boolean ok, string? err
exports('sendCustomAppMessage', function(identifier, message)
    return customApps.sendMessage(identifier, message, GetInvokingResource())
end)

---Flips the session-local disable switch - exports['sd-phone']:setDisabled(disabled). Disabling
---closes an open phone and switches the lockscreen flashlight off.
---@param disabled any only literal true disables
exports('setDisabled', function(disabled)
    phoneDisabled = disabled == true
    if not phoneDisabled then return end
    local wasLit = flashlightOn
    flashlightOn = false
    if phoneState.open then ClosePhone() else updatePose() end
    if wasLit then TriggerEvent('sd-phone:client:flashlight', false) end
end)

---Returns the disable switch - exports['sd-phone']:isDisabled().
---@return boolean disabled
exports('isDisabled', function() return phoneDisabled end)

---Character-loaded signal for the NUI: settings can only resolve once the citizenid exists, so
---the UI re-pulls its per-player state (wallpaper, tones, locale...) the moment the framework
---reports the player in - covering slow multichar picks and live character switches alike.
local function pushCharacterLoaded()
    SESSION_START_MS = GetCloudTimeAsInt() * 1000
    SendNUIMessage({ action = 'sd-phone:client:characterLoaded' })
    SendNUIMessage({ action = 'sd-phone:session', data = { startMs = SESSION_START_MS } })
    -- Unique phones: ask for a SIM snapshot once the inventory has settled, so the active
    -- phone's frame colour (closed-shell peeks, hand prop) is right before the first open.
    SetTimeout(2000, function() TriggerServerEvent('sd-phone:server:sim:requestPush') end)
end
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', pushCharacterLoaded)
RegisterNetEvent('esx:playerLoaded', pushCharacterLoaded)

---Resource restart with the character already in: the framework load events above won't
---re-fire, but the freshly reloaded NUI still needs the character signal and a SIM snapshot
---(closed-shell frame colour before the first open). On a fresh join this fires before any
---character exists - the server ignores the SIM request then, and the real load event follows.
AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    SetTimeout(5000, pushCharacterLoaded)
end)

---Resource-stop cleanup: releases NUI focus, deletes props, clears the statebag, and stops the
---hold anim.
---@param resource string name of the resource that stopped
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if phoneState.open then SetNuiFocus(false, false) end
    removePhoneProp()
    if config.Phone.PropVisibleToOthers then LocalPlayer.state:set('sdPhone', false, true) end
    for source in pairs(remoteProps) do removeRemoteProp(source) end
    local ped = PlayerPedId()
    if config.Phone.HoldAnimation and IsEntityPlayingAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 3) then
        StopAnimTask(ped, config.Phone.AnimDict, config.Phone.AnimName, 1.0)
    end
end)

require 'client.compat.lbphone'
