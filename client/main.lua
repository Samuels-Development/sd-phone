---@type table Companion-device bus (client.companion): NUI callback registry + push mirror for a
---sibling device resource (sd-tablet). Required FIRST - it shadows RegisterNUICallback and
---SendNUIMessage, so it has to be installed before any module that uses them loads.
local companion = require 'client.companion'
---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Notify bridge (bridge.client.notify): backend-agnostic on-screen toasts.
local notify = require 'bridge.client.notify'

-- Apps disabled in configs/apps.lua never reach the NUI, so neither the home screen nor the
-- App Store can show them. Built once - the catalog is static per boot.
---@type integer Apps seeded onto page one of a brand-new phone; 0 fills the page. The home screen
---clamps it to the grid, so an oversized value cannot invent slots.
local FIRST_PAGE_APPS = math.max(0, math.floor(tonumber(config.Apps.FirstPageApps) or 12))

---@type table[] Enabled app entries, config order preserved.
local ENABLED_APPS = {}
---@type string[] Dock ids with disabled apps dropped.
local ENABLED_DOCK = {}
do
    local ids = {}
    for _, app in ipairs(config.Apps.Apps or {}) do
        if app.enabled ~= false then
            ENABLED_APPS[#ENABLED_APPS + 1] = app
            if app.id then ids[app.id] = true end
        end
    end
    for _, id in ipairs(config.Apps.Dock or {}) do
        if ids[id] then ENABLED_DOCK[#ENABLED_DOCK + 1] = id end
    end
end

-- The catalog above is what this SERVER has; what this PLAYER may see also depends on the job they
-- are holding, which only the server knows. Asked on every open rather than cached, so switching
-- job on a multijob server puts the right terminal on the home screen with no event to miss.
---@return table[] apps
---@return string[] dock
local function visibleApps()
    local hidden = lib.callback.await('sd-phone:server:apps:hidden', false)
    if type(hidden) ~= 'table' or #hidden == 0 then return ENABLED_APPS, ENABLED_DOCK end

    local drop = {}
    for i = 1, #hidden do drop[hidden[i]] = true end

    local apps, dock = {}, {}
    for i = 1, #ENABLED_APPS do
        local app = ENABLED_APPS[i]
        if not drop[app.id] then apps[#apps + 1] = app end
    end
    for i = 1, #ENABLED_DOCK do
        if not drop[ENABLED_DOCK[i]] then dock[#dock + 1] = ENABLED_DOCK[i] end
    end
    return apps, dock
end
-- Number display config for the NUI. Format keys are stringified deliberately: a Lua table whose
-- integer keys run contiguously from 1 encodes as a JSON ARRAY, which would land in the UI
-- off-by-one, so this guarantees an object either way.
---@type { formats: table<string, string>, length: integer }
local NUMBER_FORMAT = {}
do
    local cfg = type(config.Phone.Number) == 'table' and config.Phone.Number or {}
    local formats = {}
    for length, pattern in pairs(type(cfg.Formats) == 'table' and cfg.Formats or {}) do
        if type(pattern) == 'string' and pattern ~= '' then formats[tostring(length)] = pattern end
    end
    NUMBER_FORMAT = { formats = formats, length = math.floor(tonumber(cfg.Length) or 10) }
end

-- Which URL sources the Music library accepts (configs/music.lua). Blanket YouTube is opt-in, so
-- the default here has to be `false` for a server whose config predates this file. Hosts are
-- lowercased once so the UI can compare them against a parsed hostname directly; video ids are
-- NOT, because YouTube ids are case-sensitive and folding them would let 'AbC' match 'abc'.
---@type { youtube: boolean, hosts: string[], videos: string[] }
local MUSIC_SOURCES = {}
do
    local cfg = type(config.Music) == 'table' and config.Music or {}
    local hosts = {}
    for _, host in ipairs(type(cfg.AllowedHosts) == 'table' and cfg.AllowedHosts or {}) do
        if type(host) == 'string' and host ~= '' then hosts[#hosts + 1] = host:lower() end
    end
    local videos = {}
    for _, video in ipairs(type(cfg.AllowedVideos) == 'table' and cfg.AllowedVideos or {}) do
        if type(video) == 'string' and video ~= '' then videos[#videos + 1] = video end
    end
    -- Curated tracks accept either a bare URL string or { url, title, artist }, so both are
    -- normalised to the table form here and the UI only ever sees one shape.
    local tracks = {}
    for _, entry in ipairs(type(cfg.AllowedTracks) == 'table' and cfg.AllowedTracks or {}) do
        local url = type(entry) == 'string' and entry or (type(entry) == 'table' and entry.url)
        if type(url) == 'string' and url ~= '' then
            tracks[#tracks + 1] = {
                url    = url,
                title  = type(entry) == 'table' and entry.title or nil,
                artist = type(entry) == 'table' and entry.artist or nil,
            }
        end
    end
    MUSIC_SOURCES = {
        youtube  = cfg.AllowYouTube == true,
        anyAudio = cfg.AllowAnyAudioLink == true,
        hosts    = hosts,
        videos   = videos,
        tracks   = tracks,
    }
end

---@type table Weather bridge (bridge.client.weather): live weather + synced world-time reads.
local weatherBridge = require 'bridge.client.weather'
---@type table Custom third-party app registry (client.customapps): add/remove/message + lifecycle.
local customApps = require 'client.customapps'
---@type table Hold pose and hand prop (client.pose): owns which clip is held and re-asserts it.
local pose = require 'client.pose'
---@type table Scripted phone camera (client.phonecam): owns the frame-a-shot movement lock.
local phonecam = require 'client.phonecam'
---@type table Cell service (client.service): live signal level, bars + capability gating.
local service = require 'client.service'
---@type table Wi-Fi (client.wifi): joined network, nearby scan + capability gating.
local wifiClient = require 'client.wifi'
---@type table Bluetooth (client.bluetooth): the radio switch + connected devices, mirrored server-side.
local bluetoothClient = require 'client.bluetooth'
---@type table Game-clock sampler (client.gameclock): pushes GetClock* to the UI while open.
local gameclock = require 'client.gameclock'

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
require 'client.apps.weazelnews'
require 'client.apps.banking'
require 'client.apps.services'
require 'client.apps.voicememos'
require 'client.apps.music'
require 'client.lockscreenwidgets'
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
require 'client.apps.mdt'
require 'client.apps.cctv'
require 'client.cctvplace'
require 'client.apps.bodycam'
require 'client.apps.racing'
require 'client.apps.ryde'
require 'client.apps.radio'
require 'client.apps.clock'
require 'client.apps.casino'
require 'client.apps.cookie'
require 'client.apps.stocks'
require 'client.apps.games'
require 'client.apps.settings'
require 'client.apps.sim'
require 'client.admin'
require 'client.payphone'
require 'client.celltowerblips'
require 'client.media'

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

---Debug breadcrumb. Two ways to turn it on, because they answer different questions: config.Debug
---is the resource's own switch and prints at info so it shows with no further setup, while
---`setr ox:printlevel:sd-phone debug` turns the same output on live, without editing a config and
---restarting.
---@param ... any values to print
local function debugPrint(...)
    if config.Debug then return lib.print.info(...) end
    lib.print.debug(...)
end

---@type fun()|nil Weather snapshot push into the NUI (assigned with the weather feed below).
local pushWeather

---@type fun()|nil Phone close (assigned further down).
local ClosePhone

---@type table<integer, {obj: integer, color: string}> Server id -> local phone-prop copy welded
---onto that remote holder's ped.
local remoteProps = {}
---@type boolean Lockscreen torch state; persists after the UI closes.
local flashlightOn = false
---@type boolean True while the Camera app's native cell-cam owns the pose and controls.
local cameraActive = false
---@type string Which surface owns the cell-cam while active: 'camera' or 'video' (video call).
local cameraSurface = 'camera'
---@type boolean True while the Camera app has handed the mouse to the game to aim the lens.
local cameraCursorFree = false
---@type boolean True while a call is live; holds the pose up after the phone is put away.
local callActive = false
---@type boolean True while a UI text field is focused.
local typingInPhone = false
---@type boolean True while the focused field is digit-only (PIN pads, dialers): keep-input
---stays on so the player can move, and the digit weapon binds are suppressed instead.
local typingNumeric = false
---@type boolean True while the hold-to-look keybind has released the cursor for camera control.
local lookMode = false

---Returns whether the live cell-cam has to freeze the game, i.e. its own surface has movement
---turned off. An absent config key reads as on, so servers on an older configs/phone.lua still
---get the fix.
---@return boolean
local function cameraFrozen()
    if not cameraActive then return false end
    if cameraSurface == 'video' then return config.Phone.AllowMovementInVideoCall == false end
    return config.Phone.AllowMovementInCamera == false
end

---Broadcasts the hold state via the replicated `sdPhone` player statebag: frame colour while
---holding, false otherwise. No-op when cross-player visibility is off.
local function broadcastHoldState()
    if not config.Phone.PropVisibleToOthers then return end
    local color = pose.shouldHold() and currentFrameColor or false
    LocalPlayer.state:set('sdPhone', color, true)
end

---Pushes the current state into the pose module, which starts or stops the held clip to match,
---then broadcasts the result.
local function updatePose()
    pose.refresh({
        open   = phoneState.open,
        torch  = flashlightOn,
        camera = cameraActive,
        color  = currentFrameColor,
        call   = callActive,
    })
    broadcastHoldState()
end

-- The four control sets the phone suppresses, as data. They are handed to ox_lib's
-- lib.disableControls, which keeps ONE refcounted set and re-asserts all of it in a single call per
-- frame - so the thread below toggles a group when the state changes rather than reissuing the same
-- two dozen DisableControlAction calls every frame regardless of whether anything moved.

---@type integer[] INPUT_FRONTEND_PAUSE and its alternate; held whenever the phone is on screen.
local CONTROLS_PAUSE <const> = { 199, 200 }

---@type integer[] Combat, melee, weapon-wheel, cover, chat - and the scroll-wheel fall-throughs
---under keep-input, because the phone owns the wheel and vehicle radio cycling must not react.
local CONTROLS_MOVEMENT <const> = {
    24, 25, 37, 106, 245, 246, 257, 263, 264, 140, 141, 142, 143,
    14, 15, 16, 17, 81, 82, 83, 84, 85, 99, 100,
}

---@type integer[] Mouse-look. Dropped while the Camera app aims the lens, or it would be immovable.
local CONTROLS_LOOK <const> = { 1, 2 }

---@type integer[] The number row, which GTA binds to weapon slots while a digit field is focused.
local CONTROLS_DIGITS <const> = { 157, 158, 159, 160, 161, 162, 163, 164, 165, 166 }

---@type table<table, true> Groups currently added to lib.disableControls.
local appliedControls = {}

---Adds or removes a group exactly once per state change. Add/Remove are refcounted, so an
---unbalanced pair would leave a control disabled for the rest of the session.
---@param group integer[]
---@param wanted boolean
local function setControlGroup(group, wanted)
    if wanted == (appliedControls[group] or false) then return end
    appliedControls[group] = wanted or nil
    if wanted then
        lib.disableControls:Add(group)
    else
        lib.disableControls:Remove(group)
    end
end

---@type boolean True while the per-frame input thread is running.
local inputThreadRunning = false

---Runs ONE per-frame thread per open: holds the pause control down unconditionally, and with
---AllowMovement on also suppresses combat, mouse-look, weapon-wheel and chat.
---
---The mouse-look group is dropped while the Camera app's Alt toggle has the lens, because
---suppressing it there makes the lens immovable. DisablePlayerFiring is not a control, so it stays
---a native and stays inside the frame loop.
---
---The pause group is held for a few frames past the close, or the closing keypress opens the escape
---menu. The outer loop exists so a reopen DURING that trailing hold rejoins rather than dying with
---the flag about to clear, which would leave an open phone suppressing nothing; nothing yields
---between the break and the flag clearing, so an open can never be refused by a thread on its way
---out.
local function startInputThread()
    if inputThreadRunning then return end
    inputThreadRunning = true
    CreateThread(function()
        while true do
            while phoneState.open do
                setControlGroup(CONTROLS_PAUSE, true)

                ---@type boolean Whether the movement suppression applies this frame.
                local suppress = false
                if config.Phone.AllowMovement then
                    if IsPauseMenuActive() then
                        if ClosePhone then ClosePhone() end
                    else
                        suppress = (not typingInPhone or typingNumeric) and not cameraFrozen()
                    end
                end

                setControlGroup(CONTROLS_MOVEMENT, suppress)
                setControlGroup(CONTROLS_LOOK, suppress and not lookMode and not cameraCursorFree)
                setControlGroup(CONTROLS_DIGITS, suppress and typingNumeric)

                if suppress then DisablePlayerFiring(cache.playerId, true) end

                lib.disableControls()
                Wait(0)
            end

            setControlGroup(CONTROLS_PAUSE, true)
            setControlGroup(CONTROLS_MOVEMENT, false)
            setControlGroup(CONTROLS_LOOK, false)
            setControlGroup(CONTROLS_DIGITS, false)

            local held = 0
            while held < 15 and not phoneState.open do
                lib.disableControls()
                held = held + 1
                Wait(0)
            end
            if not phoneState.open then break end
        end
        setControlGroup(CONTROLS_PAUSE, false)
        inputThreadRunning = false
    end)
end

---Sets keep-input from the typing and camera flags. No-op unless the phone is open with
---AllowMovement on.
local function syncKeepInput()
    if phoneState.open and config.Phone.AllowMovement then
        SetNuiFocusKeepInput((not typingInPhone or typingNumeric) and not cameraFrozen())
    end
end

---Enters look mode: releases the NUI cursor so the mouse rotates the camera while the phone stays
---on screen. Only fires with the phone open in movement mode and not typing or in a frozen camera
---view. This is how a walking player aims the lens during a video call.
local function enterLookMode()
    if lookMode or not phoneState.open or not config.Phone.AllowMovement then return end
    if typingInPhone or cameraFrozen() then return end
    lookMode = true
    SetNuiFocus(false, false)
end

---Exits look mode: restores the NUI cursor and keep-input. No-op unless currently looking.
local function exitLookMode()
    if not lookMode then return end
    lookMode = false
    -- Never grab the cursor back while the Camera app has deliberately released it, or its own
    -- cursorOn flag desyncs and the viewfinder's key relays go dead.
    if phoneState.open and not cameraCursorFree then
        SetNuiFocus(true, true)
        syncKeepInput()
    end
end

---Tracks the Camera app's cell-cam state, then re-syncs the pose and keep-input. Payload coerced
---to a strict boolean.
---@param on any truthy while the cell-cam view is live
---@param surface string|nil which surface owns it: 'video' for the video call, otherwise the Camera app
AddEventHandler('sd-phone:client:cameraMode', function(on, surface)
    cameraActive  = on and true or false
    cameraSurface = surface == 'video' and 'video' or 'camera'
    if not cameraActive then cameraCursorFree = false end
    updatePose()
    syncKeepInput()
end)

---Tracks whether a call is live, then re-syncs the pose so the phone stays in hand once the UI is
---put away. Routed through updatePose rather than straight into the pose module so the prop
---statebag other players read is broadcast with it.
---@param on any truthy from the first ring-out until the call ends
AddEventHandler('sd-phone:client:callPose', function(on)
    callActive = on and true or false
    updatePose()
end)

---Tracks whether the Camera app is holding the NUI cursor or has handed the mouse to the game to
---aim the lens, and re-asserts keep-input since SetNuiFocus is what moved.
---@param on any truthy while the NUI cursor is showing
AddEventHandler('sd-phone:client:cameraCursor', function(on)
    cameraCursorFree = not (on and true or false)
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

    local visibleAppList, visibleDock = visibleApps()
    -- Same question for the other catalog: the built-in apps were just filtered server-side, so the
    -- third-party ones re-ask about their own gates on the same open.
    customApps.refreshGates()

    local ped = cache.ped

    if config.Phone.BlockWhileDead and IsEntityDead(ped) then
        notify.show({ description = 'You can\'t use your phone right now.', type = 'error' })
        return
    end
    if config.Phone.BlockWhileSwimming and IsPedSwimming(ped) then
        notify.show({ description = 'You can\'t use your phone while swimming.', type = 'error' })
        return
    end

    -- One device at a time: a companion holding the screen gives it up here, so focus, the
    -- cell-cam and pma-voice only ever have one owner.
    if companion.companionOpen then TriggerEvent('sd-phone:client:companion:close') end

    phoneState.open   = true
    phoneState.locked = true
    companion.phoneOpen = true
    gameclock.push()

    updatePose()

    TriggerEvent('sd-phone:client:openState', true)
    TriggerServerEvent('sd-phone:server:phone:setOpen', true)

    SetNuiFocus(true, true)
    if config.Phone.AllowMovement then
        typingInPhone = false
        typingNumeric = false
        SetNuiFocusKeepInput(true)
    end
    startInputThread()
    SendNUIMessage({
        action = 'sd-phone:open',
        data   = {
            locale    = config.Locale,
            locked    = phoneState.locked,
            battery   = phoneState.battery,
            frameColor = currentFrameColor,
            carrier   = config.StatusBar.Carrier,
            signal    = service.active() and service.bars() or config.StatusBar.SignalBars,
            showWifi  = config.StatusBar.ShowWifi,
            wifiConfigured = wifiClient.configured(),
            bluetoothConfigured = bluetoothClient.configured(),
            use24h    = config.Lockscreen.Use24Hour,
            showDate  = config.Lockscreen.ShowDate,
            dock      = visibleDock,
            apps      = visibleAppList,
            firstPageApps = FIRST_PAGE_APPS,
            mailDomain = config.Mail.Domain,
            number    = NUMBER_FORMAT,
            music     = MUSIC_SOURCES,
            bootScreen = config.Phone.BootScreen ~= false,
            wallpaper = {
                lock = config.Lockscreen.Wallpaper,
                home = config.Apps.Wallpaper,
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
    companion.phoneOpen = false
    TriggerServerEvent('sd-phone:server:phone:setOpen', false)
    SetNuiFocus(false, false)
    -- Announced AFTER the focus drop, never before. Same-resource handlers run synchronously, and
    -- the payphone booth and the admin panel both answer this event by re-claiming focus when
    -- their own UI is still on screen. Announced first, that claim was undone by the very next
    -- line, and the player was left looking at a live overlay the cursor could no longer reach.
    TriggerEvent('sd-phone:client:openState', false)
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

-- Keybind wiring. lib.addKeybind registers the +/- command pair and the mapping together, refuses
-- to fire while the pause menu is up, and clears both halves out of the chat suggestion list. It
-- invokes the handlers as METHODS, so each is handed the keybind table as a first argument; all of
-- these take none, so it falls away.
lib.addKeybind({
    name        = 'sdphone_toggle',
    description = 'Toggle Phone',
    defaultKey  = config.Phone.Keybind,
    onPressed   = TogglePhone,
})

-- Hold-to-look: press frees the mouse for camera rotation, release restores the cursor.
lib.addKeybind({
    name        = 'sdphone_look',
    description = 'Phone: Hold to look around',
    defaultKey  = config.Phone.LookKeybind,
    onPressed   = enterLookMode,
    onReleased  = exitLookMode,
})

-- Both selfie-lens keybinds below serve two surfaces: the Camera app's viewfinder and a video
-- call. Each pushes its state to the one that is actually up, because the Camera app stays MOUNTED
-- in the switcher deck once backgrounded and its listeners with it, so a single shared action would
-- have a parked viewfinder quietly re-labelling its hints off a call it has no part in.
---@param action string action name minus its surface prefix ('lock' or 'faceCam')
---@param on boolean state the lens ended up in
local function pushLensState(action, on)
    local surface = cameraSurface == 'video' and 'video' or 'camera'
    SendNUIMessage({ action = ('sd-phone:%s:%s'):format(surface, action), data = { on = on } })
end

-- Angle lock: stops the body turning with the selfie lens, so the shot can swing around the player
-- for something other than head-on. Walking is untouched. toggleLock returns nil on the outward
-- lens, which frames the world and gains nothing from it.
-- The surface's own hint carries the lock state, so it flips to "Unlock Angle" rather than a
-- toast interrupting the shot.
lib.addKeybind({
    name        = 'sdphone_camlock',
    description = 'Phone: Move the selfie camera instead of yourself',
    defaultKey  = config.Phone.CameraLockKeybind,
    onPressed   = function()
        if not cameraActive then return end
        local locked = phonecam.toggleLock()
        if locked == nil then return end
        pushLensState('lock', locked)
    end,
})

-- Head tracking: turns the face back toward the lens so an angled selfie still looks at the camera.
-- Opt-in, because it reads as posed rather than candid and not every shot wants that.
lib.addKeybind({
    name        = 'sdphone_camface',
    description = 'Phone: Look at the selfie camera',
    defaultKey  = config.Phone.CameraFaceKeybind,
    onPressed   = function()
        if not cameraActive then return end
        local facing = phonecam.toggleFaceCam()
        if facing == nil then return end
        pushLensState('faceCam', facing)
    end,
})

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
            -- Push the colour first, then re-weld: a prop already in hand keeps the old model
            -- otherwise, since attaching no-ops while one exists.
            updatePose()
            pose.reweld()
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
    pose.setTyping(typingInPhone)
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

-- 5s weather poll while a device is on screen (ours or a companion's - the push mirror carries
-- it across, so the tablet's Weather app stays live while the phone is stowed).
CreateThread(function()
    while true do
        if phoneState.open or companion.companionOpen then pushWeather() end
        Wait(5000)
    end
end)

-- Immediate push on every weather change.
weatherBridge.onChange(function()
    if phoneState.open or companion.companionOpen then pushWeather() end
end)

---Returns a weather + world-time snapshot for the Weather app on mount.
---@param _data table|nil unused payload
---@param cb fun(result: table) NUI response (weather snapshot)
RegisterNUICallback('sd-phone:weather:get', function(_data, cb)
    cb(weatherBridge.read())
end)

gameclock.start(phoneState.isOpen)

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
            local ped = cache.ped
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
        if not source or source == cache.serverId then return end
        if not value or ped == 0 then
            removeRemoteProp(source)
            return
        end
        if not FRAME_COLORS[value] then return end
        local entry = remoteProps[source]
        if entry and entry.color == value and DoesEntityExist(entry.obj) then return end
        removeRemoteProp(source)
        local obj = pose.createProp(ped, value)
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

---Current cell service, 0 (dead zone) to 1 (standing at a mast). Always 1 when no towers are
---configured.
exports('getServiceLevel', function() return service.level() end)

---Current status bar bars, 0..4.
exports('getServiceBars', function() return service.bars() end)

---The configured masts as { tower = vector3, range = number }, mirroring configs/celltowers.lua.
---Empty while the system is off. The lb-phone GetCellTowers export drops the ranges to match
---their shape; this one keeps them.
exports('getCellTowers', function() return service.towers() end)

---Whether a capability is currently possible: 'text', 'call' or 'data' (default 'data').
---@param capability string|nil
exports('hasService', function(capability)
    return service.allows(capability or 'data')
end)

---Whether the phone is on a Wi-Fi network right now.
exports('isOnWifi', function() return wifiClient.connected() end)

---The joined network's id as configs/wifi.lua names it, or nil while off Wi-Fi.
exports('getWifi', function()
    local c = wifiClient.current()
    return c and c.id or nil
end)

---The joined network as { id, ssid, strength, bars }, or nil while off Wi-Fi.
exports('getWifiNetwork', function() return wifiClient.current() end)

---Every configured network as { id, ssid, coords, range, secured }, mirroring configs/wifi.lua.
---Empty while the system is off. A network's password is never part of this.
exports('getWifiNetworks', function() return wifiClient.networks() end)

---The networks in reach as of the last scan, strongest first, as { id, ssid, secured, strength,
---bars, known }. Empty while the radio is off or nothing is in range.
exports('getNearbyWifi', function() return wifiClient.nearby() end)

---Whether this character's Bluetooth radio is switched on. Says nothing about what is connected:
---a switched-on radio with nothing in range is still on.
exports('isBluetoothOn', function() return bluetoothClient.enabled() end)

---Whether this phone is connected to a device right now, by the id its owning script registered.
---@param deviceId string
exports('isBluetoothConnected', function(deviceId) return bluetoothClient.isConnected(deviceId) end)

---Every device this phone is connected to as { id, name, kind }. Empty while the radio is off or
---nothing paired is in range.
exports('getConnectedDevices', function() return bluetoothClient.devices() end)

---Registers a third-party app - exports['sd-phone']:addCustomApp(data). Attribution is the calling
---resource; re-registering an identifier is only allowed from that same resource.
---
---`devices` limits which devices list the app ('phone', 'tablet'); absent means all of them.
---`job` limits who sees it, as a name, an array of names, or a name->minimum-grade map.
---`requires` hides it until the player clears a gate - an item, framework metadata, a job, or your
---own server export - in the same shape configs/apps.lua documents for built-in apps. The server
---answers it, so an app the player cannot see never reaches their phone at all. `consume = true`
---makes it a permanent unlock instead of a live check; award one with
---exports['sd-phone']:unlockApp(source, appId) from your server side.
---
---All three only decide whether an icon is DRAWN. None of them authorises anything: a player can
---still fire your resource's events and callbacks directly, so keep checking server-side.
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

---Server-side settings appeared after the UI had already hydrated, so pull them again. The
---lb-phone import writes phone_settings partway through boot, long after the resource-start
---hydrate below has run - without this the player's wallpaper, theme and tones stay stock until
---the resource is restarted a second time.
RegisterNetEvent('sd-phone:client:rehydrate', pushCharacterLoaded)

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
    pose.stop()
    if config.Phone.PropVisibleToOthers then LocalPlayer.state:set('sdPhone', false, true) end
    for source in pairs(remoteProps) do removeRemoteProp(source) end
end)

require 'client.compat.lbphone'
