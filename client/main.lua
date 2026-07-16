---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Notify bridge (bridge.client.notify): backend-agnostic on-screen toasts.
local notify = require 'bridge.client.notify'
---@type table Weather bridge (bridge.client.weather): live weather + synced world-time reads.
local weatherBridge = require 'bridge.client.weather'

-- Loaded for side effects: every app's client module self-registers its own NUI callbacks,
-- net events and server proxies (nothing in this file calls into them directly).
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
require 'client.apps.homes'
require 'client.apps.maps'
require 'client.apps.compass'
require 'client.apps.findfriends'
require 'client.apps.cherry'
require 'client.apps.photogram'
require 'client.apps.voice'
require 'client.apps.streaks'
require 'client.apps.ryde'
require 'client.apps.radio'
require 'client.apps.clock'
require 'client.apps.cookie'
require 'client.apps.stocks'
require 'client.apps.games'
require 'client.apps.settings'

-- The client-side source of truth for phone visibility, exposed to other resources through the
-- isOpen/isLocked exports at the bottom of the file. `locked` re-arms on every open (the phone
-- always opens onto the lockscreen); `battery` is purely cosmetic.
---@type table Phone visibility state: open/locked flags + cosmetic battery percentage.
local phoneState = {
    open       = false,  -- true while the NUI is focused on the phone
    locked     = true,   -- true while the lockscreen is shown
    battery    = config.StatusBar.BatteryStart, -- cosmetic, ticks down while open
}

-- Session-local kill switch other resources flip via the setDisabled export (jail, zip-ties,
-- robbery scripts). While true the phone refuses to open; flipping it true while the phone is
-- out force-closes it. Plain local, so it resets to enabled on resource restart.
---@type boolean True while another resource has disabled the phone.
local phoneDisabled = false

-- Frame (rail) colour for the session: set by whichever phone variant you open with (the item
-- used, or the keybind's server-resolved owned colour) and kept so it persists across opens.
-- Colour names must match web/src/frameColors.ts and the `sd_phone_<colour>` props streamed by
-- sd-phone-props.
---@type string Current frame colour; always one of FRAME_COLORS.
local currentFrameColor = config.Phone.DefaultColor or 'black'
---@type table<string, boolean> Whitelist of valid frame colours - every incoming colour (server
---push, callback result) is checked against this set, so an unknown value can never select a
---non-existent prop model.
local FRAME_COLORS = {
    black = true, blue = true, green = true, orange = true,
    pink = true, purple = true, red = true, yellow = true,
}

---@type integer Wall-clock ms captured once at script load - close enough to "when the player
---joined the server" for the Health app's Time Awake readout. `os` is stripped on the FiveM
---client (sandboxed runtime), so this reads the cloud-time native instead: the same Unix epoch
---as JS Date.now(), just in seconds, hence the *1000 to match the React side.
local SESSION_START_MS = GetCloudTimeAsInt() * 1000

---@return boolean true while the phone NUI is open
function phoneState.isOpen() return phoneState.open end

---@return boolean true while the lockscreen is shown (re-armed on every open)
function phoneState.isLocked() return phoneState.locked end

---Debug print helper, routed through config.Debug so production servers stay quiet but the
---breadcrumbs are one toggle away.
---@param ... any values to print
local function debugPrint(...)
    if config.Debug then
        print('[sd-phone:client]', ...)
    end
end

-- Forward declaration: OpenPhone() pushes a weather snapshot the instant the phone opens, but
-- the function is defined further down with the rest of the weather feed. Declaring the local up
-- here lets OpenPhone capture a true local reference instead of falling through to a nil global.
---@type fun()|nil Weather snapshot push into the NUI (assigned with the weather feed below).
local pushWeather

-- Forward declaration: the walk-while-on-phone thread closes the phone when Esc / P is pressed,
-- but ClosePhone is defined further down. Declaring the local up here lets the thread capture a
-- true local reference instead of a nil global.
---@type fun()|nil Phone close (assigned further down).
local ClosePhone

-- Third-person pose: what other players see while the phone is out - a looping upper-body
-- "reading a phone" anim with a colour-matched prop in the right hand. The same pose also backs
-- the lockscreen flashlight - the torch beam visibly leaves the phone in hand - so the pose is
-- kept alive whenever the light is on, even after the UI itself is dismissed.
---@type integer|nil Handle of the attached phone prop, nil while stowed.
local phoneProp
---@type table<integer, {obj: integer, color: string}> Cross-player visibility: server id -> the
---local phone-prop copy this client welded onto that remote holder's ped. Never networked; driven
---by the `sdPhone` statebag observer near the bottom of this file.
local remoteProps = {}
---@type boolean Lockscreen torch state; deliberately outlives the UI.
local flashlightOn = false
---@type boolean True while the Camera app's native cell-cam owns the pose and controls.
local cameraActive = false
---@type boolean True while a UI text field is focused - the NUI gets full input then.
local typingInPhone = false

---Turn a camera rotation into a forward unit vector, so the flashlight beam tracks wherever the
---player is looking.
---@param rot vector3 gameplay-cam rotation in degrees
---@return vector3 dir forward unit vector
local function rotToDir(rot)
    local z   = math.rad(rot.z)
    local x   = math.rad(rot.x)
    local num = math.abs(math.cos(x))
    return vec3(-math.sin(z) * num, math.cos(z) * num, math.sin(x))
end

---Whether the hold pose should be applied right now: the phone is open OR the flashlight is on -
---but never while the Camera app is live, since its native cell-cam drives its own pose and prop
---and ours would fight it.
---@return boolean
local function shouldHold()
    return (phoneState.open or flashlightOn) and not cameraActive
end

---Create a colour-matched phone prop and rigidly weld it to a ped's hand bone, returning the prop
---entity (or nil if the sd_phone_<colour> model won't stream within 1s). This is the single source
---of truth for the weld: our own prop AND every remote copy other clients spawn both go through it,
---so they look and track identically. The object is LOCAL (isNetwork=false) on purpose - a local
---object's owner can never migrate to another client and override the attach, which is exactly what
---keeps the prop glued to the hand instead of freezing at its spawn coords. Two details make the
---weld hold, and both are how lb-phone/scully/npwd stay rock-solid: (1) collision is killed BEFORE
---the attach - SetEntityCollision(false,false) disables the rigid body, so toggling it after the
---weld strands the prop asleep at its spawn coords; (2) the weld is rigid (useSoftPinning=false),
---which hard-parents the prop to the bone and rewrites its transform every frame regardless of
---physics state. isPed=false + rotationOrder=2 match lb-phone. PropOffset/PropRot stay 0,0,0 in
---configs/phone.lua because the models bake their grip origin at 0,0,0 (per the prop maker); set
---PropRot to (0,0,180) only if a model ends up facing the wrong way.
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

---Attach OUR OWN colour-matched hand prop (config.Phone.PropPrefix .. currentFrameColor). No-op if
---one is already attached, or if the prop pack isn't streamed (the phone still works, just no prop).
---Delegates the create + weld to createHandProp; see there for why the object is local and how the
---weld holds. Other players seeing this prop is handled separately by the sdPhone statebag observer.
---@param ped integer player ped handle
local function attachPhoneProp(ped)
    if phoneProp and DoesEntityExist(phoneProp) then return end
    phoneProp = createHandProp(ped, currentFrameColor)
    if not phoneProp then return end

    -- ---- TEMP DIAGNOSTIC (delete once the prop is confirmed in-hand) ----
    -- Confirms on the first in-game test that the weld took and that it tracks the hand as you
    -- walk. Read the console: attached=true with a small, stable gap = fixed; a gap that grows
    -- as you walk = still stranded (try the (0,0,180) rotation note above / ping me).
    CreateThread(function()
        Wait(0)
        print(('[sd-phone][prop] exists=%s attached=%s networked=%s'):format(
            tostring(DoesEntityExist(phoneProp)),
            tostring(phoneProp and IsEntityAttachedToEntity(phoneProp, ped)),
            tostring(phoneProp and NetworkGetEntityIsNetworked(phoneProp))))
        Wait(1500) -- walk forward during this window
        if phoneProp and DoesEntityExist(phoneProp) then
            local pp = GetEntityCoords(phoneProp)
            local hb = GetPedBoneCoords(ped, config.Phone.PropBone, 0.0, 0.0, 0.0)
            print(('[sd-phone][prop] gap prop<->hand = %.3f m (small & steady = welded)'):format(#(pp - hb)))
        end
    end)
    -- ---- END DIAGNOSTIC ----
end

---Delete the attached phone prop, if any. Idempotent.
local function removePhoneProp()
    if phoneProp and DoesEntityExist(phoneProp) then DeleteObject(phoneProp) end
    phoneProp = nil
end

---Play the looping hold anim and attach the prop. Anim flag 49 = looping + upper-body, so the
---player can still walk. Guarded on IsEntityPlayingAnim so re-applying after an interruption
---doesn't restart the clip every frame. No-op when config.Phone.HoldAnimation is off - the pose
---and the prop ship together.
local function startPose()
    if not config.Phone.HoldAnimation then return end
    local ped = PlayerPedId()
    RequestAnimDict(config.Phone.AnimDict)
    local started = GetGameTimer()
    while not HasAnimDictLoaded(config.Phone.AnimDict) and GetGameTimer() - started < 1000 do Wait(0) end
    if not IsEntityPlayingAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 3) then
        -- blendIn 6.0 (was 3.0): a slow blend leaves the hand/fingers mid-transition into the
        -- texting grip for ~0.5s while the prop is already welded to the palm, so the phone visibly
        -- clips the not-yet-curled fingers until the pose lands. 6.0 snaps the grip in (~0.17s) - a
        -- touch softer than lb-phone's 8.0 - so the phone reaches its correct hand position quickly
        -- without the raise looking robotic.
        TaskPlayAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 6.0, -1.0, -1, 49, 0.0, false, false, false)
    end
    attachPhoneProp(ped)
end

---Stop the hold anim (only when it's actually our clip playing) and remove the prop.
local function stopPose()
    local ped = PlayerPedId()
    if config.Phone.HoldAnimation and IsEntityPlayingAnim(ped, config.Phone.AnimDict, config.Phone.AnimName, 3) then
        StopAnimTask(ped, config.Phone.AnimDict, config.Phone.AnimName, 1.0)
    end
    removePhoneProp()
end

---Broadcast whether we're currently holding the phone to other clients, via a replicated player
---statebag (`sdPhone` = our frame colour while holding, false otherwise). Their observer spawns or
---removes a local welded copy of the prop on our ped from this. No-op when cross-player visibility
---is off, so those servers never touch the bag. Mirrors exactly what drives our own prop.
local function broadcastHoldState()
    if not config.Phone.PropVisibleToOthers then return end
    local color = (config.Phone.HoldAnimation and shouldHold()) and currentFrameColor or false
    LocalPlayer.state:set('sdPhone', color, true)
end

---Reconcile the pose with current state. Called on open/close, on every flashlight toggle, and
---whenever the Camera app takes or yields the pose.
local function updatePose()
    if shouldHold() then startPose() else stopPose() end
    broadcastHoldState()
end

---@type boolean Guard so at most one movement-suppression thread runs at a time.
local movementThreadRunning = false

---Walk-while-on-phone. With config.Phone.AllowMovement on, game input stays alive alongside the
---NUI (SetNuiFocusKeepInput) and this thread suppresses everything except movement each frame so
---the mouse only drives the on-screen cursor: mouse look (controls 1/2), attack + aim
---(24/25/257), every melee control (140-143, 263/264), the weapon wheel (37), vehicle mouse
---control (106) and text chat (245/246), plus DisablePlayerFiring. The pause menu / map opens
---straight through keep-input and can't be reliably blocked from another resource, so - matching
---lb-phone and NPWD - the phone is closed the instant IsPauseMenuActive() reports the menu is up,
---rather than fighting it (the map stays open; a second Esc closes it as normal). Suppression
---pauses while a text field is focused (keep-input is off then, so nothing leaks anyway) or while
---the Camera app drives its own controls. One thread per open; it ends itself when the phone closes.
local function startMovementThread()
    if not config.Phone.AllowMovement or movementThreadRunning then return end
    movementThreadRunning = true
    CreateThread(function()
        while phoneState.open do
            if IsPauseMenuActive() then
                if ClosePhone then ClosePhone() end
            elseif not typingInPhone and not cameraActive then
                DisablePlayerFiring(PlayerId(), true)
                DisableControlAction(0, 1, true)
                DisableControlAction(0, 2, true)
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
                DisableControlAction(0, 245, true)  -- INPUT_MP_TEXT_CHAT_ALL (T)
                DisableControlAction(0, 246, true)  -- INPUT_MP_TEXT_CHAT_TEAM (Y)
            end
            Wait(0)
        end
        movementThreadRunning = false
    end)
end

---Drop or restore keep-input as walking is suspended / resumed (typing in the UI, or the Camera
---app taking over). No-op unless the phone is open with AllowMovement on.
local function syncKeepInput()
    if phoneState.open and config.Phone.AllowMovement then
        SetNuiFocusKeepInput(not typingInPhone and not cameraActive)
    end
end

---The Camera app (client/apps/camera.lua) raises this same-client event as it enters / leaves
---its native cell-cam view. We yield the pose to it while it's live, then take it back when it
---exits (if the phone's still out or the torch is on). The payload is coerced to a strict
---boolean so a stray truthy value can't leak into state.
---@param on any truthy while the cell-cam view is live
AddEventHandler('sd-phone:client:cameraMode', function(on)
    cameraActive = on and true or false
    updatePose()
    syncKeepInput()
end)

---Open the phone NUI. Refuses while dead or swimming (config.Phone.BlockWhile*) - the same
---safety blocks most QB / ESX phones apply - or while another resource has disabled the phone
---via the setDisabled export, and always opens onto the lockscreen. Announces
---visibility to other client modules (sd-phone:client:openState) and to the server
---(sd-phone:server:phone:setOpen, so nearby players can share to us). The player's installed
---downloadable apps ride in the open payload - a single primary-key lookup - so the home screen
---renders the right app set with no "show all then remove" flash; that callback yields, so
---phoneState.open is re-checked after it and a close landing mid-await (F1 double-tap, admin
---wipe) can't be overridden by a stale resume that re-focuses the NUI against a closed state.
---With AllowMovement on, keep-input stays enabled and the movement thread suppresses combat
---controls so the player can walk with the phone in hand. Finally pushes an immediate weather
---snapshot (so the Weather app has real data the moment it's tapped, not mocked-from-profile Los
---Santos data) and the session-start timestamp (so the Health app's Time Awake card lines up
---with real server time).
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

    updatePose()

    TriggerEvent('sd-phone:client:openState', true)
    TriggerServerEvent('sd-phone:server:phone:setOpen', true)

    local installedRes  = lib.callback.await('sd-phone:server:apps:list', false)
    if not phoneState.open then return end
    local installedApps = (installedRes and installedRes.success and installedRes.data and installedRes.data.installed) or {}
    local homeLayout    = (installedRes and installedRes.success and installedRes.data and installedRes.data.layout) or nil

    SetNuiFocus(true, true)
    if config.Phone.AllowMovement then
        typingInPhone = false
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
            installedApps = installedApps,
            homeLayout = homeLayout,
            wallpaper = {
                lock = config.Lockscreen.Wallpaper,
                home = config.Homescreen.Wallpaper,
            },
        },
    })

    pushWeather(true)

    SendNUIMessage({
        action = 'sd-phone:session',
        data   = { startMs = SESSION_START_MS },
    })

    debugPrint('phone opened')
end

---Close the phone NUI. Idempotent - safe to call from the NUI exit callback even if the player
---has already let go of focus. Mirrors the open announcements (openState / setOpen false),
---releases NUI focus (the movement thread ends itself via phoneState.open), and drops the pose
---unless the flashlight is keeping the phone in hand.
function ClosePhone()
    if not phoneState.open then return end

    phoneState.open = false
    TriggerEvent('sd-phone:client:openState', false)
    TriggerServerEvent('sd-phone:server:phone:setOpen', false)
    SetNuiFocus(false, false)
    typingInPhone = false
    SendNUIMessage({ action = 'sd-phone:close' })

    updatePose()

    debugPrint('phone closed')
end

---Toggle helper bound to the keybind. Closing never needs a check; opening is gated SERVER-side:
---the keybind can't prove you hold a phone the way using the item does, so we ask the server
---(authoritative, sd-phone:server:phone:resolveOpen) whether you own one and which colour to
---open, passing the session's current colour as a preference hint. No phone means a notification
---and no open. The returned colour is still whitelist-checked against FRAME_COLORS before it's
---adopted, so a surprising callback result can't select a non-existent prop model.
local function TogglePhone()
    if phoneState.open then ClosePhone() return end

    local color = lib.callback.await('sd-phone:server:phone:resolveOpen', false, currentFrameColor)
    if not color then
        notify.show({ description = 'You don\'t have a phone.', type = 'error' })
        return
    end
    if FRAME_COLORS[color] then currentFrameColor = color end
    OpenPhone()
end

-- Dynamically create exports for each defined phone item to work with ox_inventory.
local phoneItems = config.Phone.Items
for i = 1, #phoneItems do
    exports(('usePhone_%s'):format(phoneItems[i].color), TogglePhone)
end

-- Keybind wiring. RegisterKeyMapping lets players rebind via Settings > Key Bindings; the
-- default comes from config.Phone.Keybind. There is no chat command - the phone opens by using a
-- phone item, or via this keybind (itself server-gated on ownership inside TogglePhone). The `-`
-- command is the mandatory no-op release half of a +command mapping.
RegisterCommand('+sdphone_toggle', TogglePhone, false)
RegisterCommand('-sdphone_toggle', function() end, false)
RegisterKeyMapping('+sdphone_toggle', 'Toggle Phone', 'keyboard', config.Phone.Keybind)

---Server push after a phone item is used (server/main.lua registers each configured item as
---usable; using the item is itself proof of possession, so no further gate here). Carries the
---variant's frame colour so the rail and the in-hand prop match the phone you used;
---whitelist-checked against FRAME_COLORS and nil-guarded, so a missing or unknown colour still
---opens in the current colour.
---@param color string|nil frame colour of the used item variant
RegisterNetEvent('sd-phone:client:openFromItem', function(color)
    if color and FRAME_COLORS[color] then currentFrameColor = color end
    OpenPhone()
end)

---Admin wipe (server /wipemyphone). The DB is already cleared server-side; here the phone UI
---resets so the next open is a true fresh boot - the React app clears its local storage (setup
---flag, layout, cached state) and reloads. No payload to validate.
RegisterNetEvent('sd-phone:client:wipe', function()
    if phoneState.open then ClosePhone() end
    SendNUIMessage({ action = 'sd-phone:wipe' })
end)

---React to Lua: the NUI requests the phone be closed (swipe down / back gesture).
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:close', function(_, cb)
    ClosePhone()
    cb({ ok = true })
end)

---React to Lua: unlock gesture finished. Mirrors the locked flag back into Lua so external
---scripts can query exports['sd-phone']:isLocked() and gate behaviour on it - the actual
---lockscreen-to-homescreen animation is entirely client-side in the React app. The flag re-arms
---on the next open (the phone always opens locked).
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:unlock', function(_, cb)
    phoneState.locked = false
    cb({ ok = true })
end)

---React to Lua: a text field in the UI gained or lost focus. While walking is allowed the
---keyboard reaches the game too, so full input is handed back to the UI while typing (otherwise
---WASD in a search box would also move the player) and walking restores on blur. Payload
---nil-guarded and coerced to a strict boolean.
---@param data table|nil { typing: boolean }
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:typing', function(data, cb)
    typingInPhone = data and data.typing and true or false
    syncKeepInput()
    cb({ ok = true })
end)

---React to Lua: an app icon was tapped. Debug breadcrumb only - the React app owns app routing;
---this exists so taps are visible on the console during testing.
---@param data table|nil { id: string }
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:openApp', function(data, cb)
    debugPrint('openApp:', data and data.id or '?')
    cb({ ok = true })
end)

---React to Lua: lockscreen torch button. Flips the beam and keeps the holding pose alive so the
---light keeps coming from the phone in hand after the UI closes. Returns the resulting state so
---the button can reflect what actually happened.
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response { on: boolean }
RegisterNUICallback('sd-phone:flashlight:toggle', function(_, cb)
    flashlightOn = not flashlightOn
    updatePose()
    -- Same-client beam announcement (mirrors sd-phone:client:openState): fires on every
    -- flashlight state change with the resulting boolean, so other client modules never poll.
    TriggerEvent('sd-phone:client:flashlight', flashlightOn)
    cb({ on = flashlightOn })
end)

---React to Lua: query the current beam state - the button re-syncs to this on every open, since
---the beam outlives the UI.
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response { on: boolean }
RegisterNUICallback('sd-phone:flashlight:state', function(_, cb)
    cb({ on = flashlightOn })
end)

---Push the current weather + synced world time into the NUI. The bridge resolves both from
---whatever weathersync is running (Renewed-Weathersync / qb-weathersync), falling back to GTA
---natives; the UI derives the hourly/daily forecast + temperature from the live weather, so this
---stays cheap. Pushed every few seconds while the phone is open (world time advances
---continuously, so no dedup) plus instantly on every bridge-reported weather change.
pushWeather = function()
    SendNUIMessage({
        action = 'sd-phone:weather',
        data   = weatherBridge.read(),
    })
end

-- Coarse 5s weather poll, pushing only while the phone is open - otherwise it's wasted work.
CreateThread(function()
    while true do
        if phoneState.open then pushWeather() end
        Wait(5000)
    end
end)

-- Instant refresh the moment the weather flips, so the app never lags the 5s poll.
weatherBridge.onChange(function()
    if phoneState.open then pushWeather() end
end)

---Request/response snapshot for the Weather app on mount, so it shows the real weather + world
---time immediately instead of flashing placeholder data until the next 5s push lands.
---@param _data table|nil unused payload
---@param cb fun(result: table) NUI response (weather snapshot)
RegisterNUICallback('sd-phone:weather:get', function(_data, cb)
    cb(weatherBridge.read())
end)

-- Cosmetic battery drain while the phone is open: one percent every 30s gives a believable
-- ~50min from 100 to 0, floored at 0. The value is pushed to the React app so the status bar
-- redraws without a callback round-trip.
CreateThread(function()
    while true do
        Wait(30000)
        if phoneState.open and phoneState.battery > 0 then
            phoneState.battery = phoneState.battery - 1
            SendNUIMessage({ action = 'sd-phone:battery', data = phoneState.battery })
        end
    end
end)

-- While the torch is on, cast a spotlight from the phone (the hand bone) in the direction the
-- player is looking. DrawSpotLight is a per-frame native, so this runs every frame while lit and
-- idles at a coarse 300ms poll while off - it costs nothing when unlit.
CreateThread(function()
    local fl = config.Phone.Flashlight
    while true do
        if flashlightOn then
            local ped = PlayerPedId()
            local pos = GetPedBoneCoords(ped, config.Phone.PropBone, 0.0, 0.0, 0.0)
            local dir = rotToDir(GetGameplayCamRot(2))
            DrawSpotLight(
                pos.x, pos.y, pos.z + 0.1,
                dir.x, dir.y, dir.z,
                fl.Color[1], fl.Color[2], fl.Color[3],
                fl.Distance, fl.Brightness, 0.0, fl.Radius, 1.0
            )
            Wait(0)
        else
            Wait(300)
        end
    end
end)

-- Keep the hold pose alive if the game clears it (entering a vehicle, a brief stagger, etc.).
-- startPose's IsEntityPlayingAnim guard means this only re-plays the clip when it's actually
-- been dropped - no per-tick stutter. Coarse (500ms) - a half-second gap in a cosmetic pose is
-- invisible.
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

---Delete a remote holder's welded prop copy, if any. Idempotent; safe when there's no copy. Used
---by the sdPhone observer, its cleanup sweep, and resource-stop hygiene.
---@param source integer server id of the remote holder
local function removeRemoteProp(source)
    local entry = remoteProps[source]
    if entry and entry.obj and DoesEntityExist(entry.obj) then DeleteObject(entry.obj) end
    remoteProps[source] = nil
end

-- Cross-player prop visibility (lb-phone's "state" strategy). We never network the hand prop: a
-- networked object's ownership can migrate to a nearby client whose sync then overrides our attach
-- and freezes it, and NetworkAllowLocalEntityAttachment has been broken since game build 2545.
-- Instead the holder broadcasts a replicated `sdPhone` player statebag (broadcastHoldState) and
-- every client welds its OWN local copy on the holder's ped - the same rigid weld as our own prop,
-- so it tracks the texting anim with zero network jitter. The hold animation already replicates on
-- its own (it's a ped task), so this only fills in the missing prop.
if config.Phone.PropVisibleToOthers then
    ---Resolve a `player:<serverId>` bag to (serverId, ped). ped is 0 when that player isn't in
    ---scope on this client - we can't (and needn't) attach then; the handler re-fires on scope-in.
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
        if not source or source == GetPlayerServerId(PlayerId()) then return end -- skip self: own prop is direct
        if not value or ped == 0 then
            removeRemoteProp(source)
            return
        end
        if not FRAME_COLORS[value] then return end -- ignore a spoofed / unknown colour
        local entry = remoteProps[source]
        if entry and entry.color == value and DoesEntityExist(entry.obj) then return end -- already shown
        removeRemoteProp(source)                                                          -- colour changed / stale
        local obj = createHandProp(ped, value)
        if obj then remoteProps[source] = { obj = obj, color = value } end
        debugPrint(('remote prop for %s -> %s'):format(source, value))
    end)

    -- Reap copies whose owner left scope or dropped: onPlayerDropped isn't reliably raised on the
    -- client for other players, and a ped that leaves scope can orphan its attached local prop, so
    -- a coarse 1s sweep cleans up. Re-scope re-fires the handler and respawns the prop.
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

---Launch an app on the phone from another resource - exports['sd-phone']:openApp(appId, link).
---Opens the phone first if it's closed, walking the same dead/swimming/disabled blocks as any
---other open and returning false when one refuses. The launch itself is handed to the React
---shell, which queues it behind the lockscreen exactly like a tapped lockscreen notification -
---nothing here bypasses or unlocks anything. `link` is an optional deep-link table the target
---app's notification-link handler understands. Shape-checked so a caller bug fails cleanly:
---a non-string or empty appId, or a non-table link, returns false without touching the phone.
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

-- Public surface for other resources on this client: query phone visibility (isOpen/isLocked)
-- or drive the phone programmatically. `open` re-runs the dead/swimming/disabled safety blocks
-- but not the ownership gate (callers vouch for their own context); `close` is idempotent.
exports('isOpen',   phoneState.isOpen)
exports('isLocked', phoneState.isLocked)
exports('open',     OpenPhone)
exports('close',    ClosePhone)
exports('openApp',  OpenApp)

---Flip the session-local disable switch - exports['sd-phone']:setDisabled(disabled). Coerced to
---a strict boolean (only literal true disables). While disabled the phone refuses to open, and
---disabling while the phone is out closes it immediately. The lockscreen flashlight is switched
---off with it: shouldHold keeps the beam and hold pose alive while flashlightOn is true, and a
---disabled phone can no longer be opened to turn it off, so leaving it lit would strand both.
---Resets to enabled on resource restart.
---@param disabled any only literal true disables
exports('setDisabled', function(disabled)
    phoneDisabled = disabled == true
    if not phoneDisabled then return end
    local wasLit = flashlightOn
    flashlightOn = false
    if phoneState.open then ClosePhone() else updatePose() end
    -- This path clears the beam without going through the NUI toggle, so announce the force-off
    -- here too, but only when it was actually lit, or listeners would desync on a redundant false.
    if wasLit then TriggerEvent('sd-phone:client:flashlight', false) end
end)

---Query the disable switch - exports['sd-phone']:isDisabled().
---@return boolean disabled
exports('isDisabled', function() return phoneDisabled end)

---Resource-stop hygiene (dev restarts): release NUI focus so the player isn't left
---cursor-trapped, delete the hand prop, and stop the hold anim - none of these clean themselves
---up when the script dies.
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
