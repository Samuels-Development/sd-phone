---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Player bridge (bridge.server.player): citizenid/name/job lookups from a server id.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone_settings row CRUD plus
---custom tones and per-app notification prefs, all keyed by citizenid.
local store  = require 'server.settings.store'
---@type table Accounts engine handlers (server.accounts.actions): the shared sign-out the factory
---reset and Settings > Sign Out of All Accounts both run through.
local accounts = require 'server.accounts.actions'
---@type table Badge recompute-and-push (server.badges.init).
local badges = require 'server.badges.init'
---@type table Photos actions (server.photos.actions): the URL-import gate + host allow/blocklist
---policy, shared verbatim by wallpaper link imports.
local photos = require 'server.photos.actions'
---@type table Version helpers (bridge.server.version): manifest version + cached latest-GitHub-
---release lookup for the Software Update page.
local version = require 'bridge.server.version'
---@type table Shared server helpers (server.util): write throttles + the disconnect sweep.
local util = require 'server.util'

---@type string GitHub repo the Software Update page checks for new releases.
local UPDATE_REPO = 'Samuels-Development/sd-phone'

-- Schema bootstrap.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        boot.schemaFailed('settings', err)
        return
    end
    boot.schemaReady()
end)

---Server export: returns a player's phone number by server id, assigning one on first access;
---an unresolvable player yields nil.
---@param source number player server id
---@return string|nil number raw-digit phone number
exports('getPhoneNumber', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    return store.ensurePhoneNumber(cid)
end)

---@type integer Rolling budget per settings write, per character, per 10s. Six a second is an
---order of magnitude past what a finger on a toggle can produce; the sliders never reach it
---because they take the coalescing path instead.
local WRITES_PER_10S = 60

---@type integer Rolling budget across the whole settings namespace, per character, per 10s, so
---rotating between handlers cannot multiply the per-handler budget.
local NAMESPACE_WRITES_PER_10S = 240

---@type table Envelope for a character writing settings faster than any UI could drive.
local BUSY = { success = false, messageKey = 'settings.tooManyChangesOnce', message = 'Too many changes at once' }

---True when this character may run one more settings write.
---@param cid string framework per-character id
---@param key string handler name, a call-site constant
---@return boolean ok
local function writeAllowed(cid, key)
    if not util.rateLimit(cid, 'settings:' .. key, 10000, WRITES_PER_10S) then return false end
    return util.rateLimit(cid, 'settings:*', 10000, NAMESPACE_WRITES_PER_10S)
end

---@type integer Minimum gap between persisted writes of one coalesced setting (ms).
local WRITE_GAP = 400

---@type table<string, { last: number, pending: fun()|nil, timer: boolean }> Trailing-write state
---per (citizenid, setting).
local writes = {}

---Runs `fn` at most once per WRITE_GAP for one character and setting, keeping the LAST call made
---inside a window and running it when the window closes. Refusing would drop the value a drag
---gesture ends on, so these handlers stash instead; every coalesced payload carries the setting's
---full current state, so an intermediate tick is never worth writing.
---@param cid string framework per-character id
---@param key string setting name, a call-site constant
---@param fn fun() the write to perform
local function coalesce(cid, key, fn)
    local k = cid .. '\0' .. key
    local w = writes[k]
    local now = GetGameTimer()
    if not w then
        writes[k] = { last = now }
        fn()
        return
    end
    local since = now - w.last
    if since < 0 or since >= WRITE_GAP then
        w.last, w.pending = now, nil
        fn()
        return
    end
    w.pending = fn
    if not w.timer then
        w.timer = true
        SetTimeout(WRITE_GAP - since, function()
            w.timer = false
            local pending = w.pending
            w.pending = nil
            if not pending then return end
            w.last = GetGameTimer()
            pcall(pending)
        end)
    end
end

---Drops every queued trailing write for one character, so a reset is not undone a moment later
---by a value the player changed just before pressing it. The timer still fires; it finds nothing
---pending and does nothing. Anything that rewrites the whole settings row has to call this first,
---or the twelve coalesced settings (brightness, phone scale, island pet, app labels, ...) each
---get up to WRITE_GAP to come back from the dead.
---@param cid string framework per-character id
local function dropPendingWrites(cid)
    local prefix = cid .. '\0'
    for k, w in pairs(writes) do
        if k:sub(1, #prefix) == prefix then w.pending = nil end
    end
end

-- A pending timer holds its own state by upvalue, so a trailing write still lands for a player
-- who disconnects mid-gesture; only the idle rows go.
util.onCleanup(function(_, cid)
    if type(cid) ~= 'string' or cid == '' then return end
    local prefix = cid .. '\0'
    for k in pairs(writes) do
        if k:sub(1, #prefix) == prefix then writes[k] = nil end
    end
end)

---@type integer How often idle coalescing rows are dropped (ms).
local SWEEP_MS = 5 * 60 * 1000

-- Backstop for the sweep above, whose citizenid is best effort at disconnect. A row with no
-- pending timer past the gap rebuilds identically on the next write, so dropping it is invisible.
CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        local now = GetGameTimer()
        for k, w in pairs(writes) do
            local since = now - w.last
            if not w.timer and (since < 0 or since >= WRITE_GAP) then writes[k] = nil end
        end
    end
end)

-- Client-reachable settings callbacks; the acting character always resolves from src.

---Returns the caller's full settings snapshot: tone selections, custom tones, airplane mode,
---clock preferences, wallpaper, chat text scale, locale and lock security. Read-only.
---@type table<string, boolean> Devices that own a settings row. An id outside this set is the
---phone, so a hand-edited client cannot mint rows for devices that do not exist.
local SETTINGS_DEVICES = { phone = true, tablet = true }

---Which device a settings call came from. The UI stamps it on every sd-phone:settings:* payload;
---an absent or unknown one is the phone, which is what keeps older NUI bundles working unchanged.
---@param payload table|nil client-supplied payload
---@return string device
local function deviceOf(payload)
    local d = type(payload) == 'table' and payload.device or nil
    return (type(d) == 'string' and SETTINGS_DEVICES[d]) and d or 'phone'
end

lib.callback.register('sd-phone:server:settings:get', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    -- One row read, not one per field: this used to issue 16 single-column PK lookups.
    local data = store.snapshot(cid, deviceOf(payload))
    data.customRingtones         = store.listCustomTones(cid, 'ringtone')
    data.customNotificationTones = store.listCustomTones(cid, 'notification')
    -- Face Unlock only works for the SIM's first activator - a stolen phone still asks the
    -- thief for the passcode (a no-op outside unique-phones mode).
    data.faceId                  = data.faceId and require('server.sim.session').isOwner(source)
    return { success = true, data = data }
end)

---Persists the caller's lock and/or home wallpaper key; an absent field leaves that screen
---unchanged.
lib.callback.register('sd-phone:server:settings:setWallpaper', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'wallpaper') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setWallpaper(cid, payload.lock or payload.wallpaper, payload.home, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's per-screen wallpaper blur flags; an absent field leaves that screen
---unchanged.
lib.callback.register('sd-phone:server:settings:setBlur', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'blur', function() store.setBlur(cid, payload.lock, payload.home, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's Dynamic Island pet. The store validates the id, so a stale client cannot
---save a pet this shell has no artwork for.
lib.callback.register('sd-phone:server:settings:setIslandPet', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'islandPet', function() store.setIslandPet(cid, payload.pet, deviceOf(payload)) end)
    return { success = true }
end)

---Saves a custom wallpaper URL for the caller; the photo URL-import gate and host policy apply
---(config.Photos.AllowImport + block/allow lists).
lib.callback.register('sd-phone:server:settings:wallpapers:add', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'wallpapersAdd') then return BUSY end
    if not photos.importEnabled() then
        return { success = false, messageKey = 'settings.urlImportDisabledServer', message = 'URL import is disabled on this server' }
    end
    payload = type(payload) == 'table' and payload or {}
    if not photos.isAllowedImportUrl(payload.url) then
        return { success = false, messageKey = 'settings.imagesFromSiteArenT', message = 'Images from that site aren\'t allowed' }
    end
    if not store.addCustomWallpaper(cid, payload.url) then
        return { success = false, messageKey = 'settings.couldNotSaveWallpaper', message = 'Could not save that wallpaper' }
    end
    return { success = true }
end)

---Removes one of the caller's custom wallpapers.
lib.callback.register('sd-phone:server:settings:wallpapers:remove', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'wallpapersRemove') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.removeCustomWallpaper(cid, payload.url)
    return { success = true }
end)

---Persists the caller's lock security (passcode + Face Unlock), overwriting both fields.
lib.callback.register('sd-phone:server:settings:setSecurity', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'security') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setSecurity(cid, payload.passcode, payload.faceId == true, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's lockscreen clock customization (font/layout/colour/scale).
lib.callback.register('sd-phone:server:settings:setLockClock', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    local cfg = type(payload) == 'table' and payload or {}
    coalesce(cid, 'lockClock', function() store.setLockClock(cid, cfg, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's chat-bubble text size multiplier.
lib.callback.register('sd-phone:server:settings:setChatTextScale', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'chatTextScale', function() store.setChatTextScale(cid, payload.scale, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's accessibility preferences. Fields are individually optional so a single
---toggle does not have to echo the rest back.
lib.callback.register('sd-phone:server:settings:setAccessibility', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'accessibility', function() store.setAccessibility(cid, payload, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's home screen density preset. The layout itself is refitted client-side and
---saved through the existing layout callback, so this only carries the preset name.
lib.callback.register('sd-phone:server:settings:setHomeDensity', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'homeDensity', function() store.setHomeDensity(cid, payload.density, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's home screen icon scale, the fine adjustment on top of the density preset.
lib.callback.register('sd-phone:server:settings:setHomeIconScale', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'homeIconScale', function() store.setHomeIconScale(cid, payload.scale, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's home screen app name overrides.
lib.callback.register('sd-phone:server:settings:setAppLabels', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    local labels = type(payload.labels) == 'table' and payload.labels or {}
    coalesce(cid, 'appLabels', function() store.setAppLabels(cid, labels, deviceOf(payload)) end)
    return { success = true }
end)

---Returns the installed phone version plus the latest GitHub release, so the Software Update
---page can flag when this build is behind. Read-only; the release lookup is cached an hour.
lib.callback.register('sd-phone:server:settings:versionInfo', function()
    local current = version.current()
    local latest  = version.latest(UPDATE_REPO)
    return { success = true, data = {
        current         = current,
        latest          = latest,
        updateAvailable = current ~= nil and latest ~= nil and version.isNewer(current, latest),
    } }
end)

---Persists the caller's phone frame scale (slider value 0-100).
lib.callback.register('sd-phone:server:settings:setPhoneScale', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'phoneScale', function() store.setPhoneScale(cid, payload.scale, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's 3D tilt (turn / lean, in degrees).
lib.callback.register('sd-phone:server:settings:setPhoneTilt', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    local tilt = type(payload) == 'table' and payload or {}
    coalesce(cid, 'phoneTilt', function() store.setPhoneTilt(cid, tilt, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's shell presentation preferences (dock treatment, open animation,
---wallpaper parallax). Fields are individually optional.
lib.callback.register('sd-phone:server:settings:setInterface', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'interface', function() store.setInterface(cid, payload, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's screen brightness (0-100 slider).
lib.callback.register('sd-phone:server:settings:setBrightness', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'brightness', function() store.setBrightness(cid, payload.brightness, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's phone anchor position (whitelisted).
lib.callback.register('sd-phone:server:settings:setPhoneAlign', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'phoneAlign') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setPhoneAlign(cid, payload.align, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's ringtone-and-alert and call volumes (each 0-100).
lib.callback.register('sd-phone:server:settings:setVolumes', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    coalesce(cid, 'volumes', function() store.setVolumes(cid, payload.ringtone, payload.call, deviceOf(payload)) end)
    return { success = true }
end)

---Persists the caller's chosen phone language.
lib.callback.register('sd-phone:server:settings:setLocale', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'locale') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setLocale(cid, payload.locale, deviceOf(payload))
    return { success = true }
end)

---Toggles the caller's airplane mode; turning it off fires the server-local release event.
lib.callback.register('sd-phone:server:settings:setAirplane', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'airplane') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    local on = payload.on == true
    store.setAirplane(cid, on, deviceOf(payload))
    if not on then TriggerEvent('sd-phone:server:airplane:released', source) end
    return { success = true }
end)

---Persists the caller's 24-hour time preference, coerced to a strict boolean.
lib.callback.register('sd-phone:server:settings:setHour24', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'hour24') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setHour24(cid, payload.on == true)
    return { success = true }
end)

---Persists whether the caller's number is shown to whoever they dial. Enforced server-side at
---dial time, so a patched client cannot reveal a number the player chose to withhold - nor hide
---one, which would otherwise be a way past a callee's block list.
lib.callback.register('sd-phone:server:settings:setCallerId', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'callerId') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setCallerId(cid, payload.on == true)
    return { success = true }
end)

---Persists the caller's Streamer Mode preference, coerced to a strict boolean.
lib.callback.register('sd-phone:server:settings:setStreamerMode', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'streamerMode') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setStreamerMode(cid, payload.on == true)
    return { success = true }
end)

---Persists which categories Streamer Mode hides. The store rebuilds the row from its own key
---whitelist, so an unknown key is dropped rather than stored.
lib.callback.register('sd-phone:server:settings:setStreamerHide', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'streamerHide') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setStreamerHide(cid, type(payload.hide) == 'table' and payload.hide or {})
    return { success = true }
end)

---Marks the caller's profile as having completed first-run setup (one-way; the wipe path
---deletes the whole settings row, which is what un-sets it).
lib.callback.register('sd-phone:server:settings:setSetupDone', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'setupDone') then return BUSY end
    store.setSetupDone(cid, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's reopen-into-holstered-app preference.
lib.callback.register('sd-phone:server:settings:setReopenApp', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'reopenApp') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setReopenApp(cid, payload.on == true, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's light/dark theme.
lib.callback.register('sd-phone:server:settings:setTheme', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'theme') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setTheme(cid, payload.theme, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's dark-mode palette (graphite/black/warm).
lib.callback.register('sd-phone:server:settings:setDarkTheme', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'darkTheme') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setDarkTheme(cid, payload.darkTheme, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's light-mode palette.
lib.callback.register('sd-phone:server:settings:setLightTheme', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'lightTheme') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setLightTheme(cid, payload.lightTheme, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's accent colour.
lib.callback.register('sd-phone:server:settings:setAccent', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'accent') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setAccent(cid, payload.accent, deviceOf(payload))
    return { success = true }
end)

---Persists whether the caller's phone shows game time rather than their PC clock.
lib.callback.register('sd-phone:server:settings:setGameTime', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'gameTime') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setGameTime(cid, payload.on == true, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's phone shell. The store drops anything the config does not allow.
lib.callback.register('sd-phone:server:settings:setShell', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'shell') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setShell(cid, payload.shell, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's home-screen icon theme, whitelisted by the store.
lib.callback.register('sd-phone:server:settings:setIconTheme', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'iconTheme') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setIconTheme(cid, payload.iconTheme, deviceOf(payload))
    return { success = true }
end)

---Saves one of the caller's own icon themes, keyed by its id; the store validates every field
---and refuses past the per-character cap.
lib.callback.register('sd-phone:server:settings:saveCustomIconTheme', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'iconThemeSave') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    local ok, reason = store.saveCustomIconTheme(cid, payload.theme)
    if ok then return { success = true } end
    if reason == 'limit' then
        return { success = false, messageKey = 'settings.haveSavedAsManyIcon', message = 'You have saved as many icon themes as this phone holds' }
    end
    return { success = false, messageKey = 'settings.couldNotSaveIconTheme', message = 'Could not save that icon theme' }
end)

---Removes one of the caller's own icon themes; a caller using it falls back to Default.
lib.callback.register('sd-phone:server:settings:deleteCustomIconTheme', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'iconThemeDelete') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.deleteCustomIconTheme(cid, payload.id)
    return { success = true }
end)

---Saves one of the caller's own colour palettes, keyed by its id; the store validates every
---field and refuses past the per-character cap.
lib.callback.register('sd-phone:server:settings:savePalette', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'paletteSave') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    local ok, reason = store.saveCustomPalette(cid, payload.palette)
    if ok then return { success = true } end
    if reason == 'limit' then
        return { success = false, messageKey = 'settings.haveSavedAsManyPalettes', message = 'You have saved as many palettes as this phone holds' }
    end
    return { success = false, messageKey = 'settings.couldNotSavePalette', message = 'Could not save that palette' }
end)

---Removes one of the caller's own colour palettes; any device using it falls back to its
---built-in default shade.
lib.callback.register('sd-phone:server:settings:deletePalette', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'paletteDelete') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.deleteCustomPalette(cid, payload.id)
    return { success = true }
end)

---Persists whether the caller wants app names under their home-screen icons.
lib.callback.register('sd-phone:server:settings:setShowAppNames', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'showAppNames') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setShowAppNames(cid, payload.on == true, deviceOf(payload))
    return { success = true }
end)

---Persists the caller's tone selections; a missing or invalid field is left unchanged.
lib.callback.register('sd-phone:server:settings:setTones', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'tones') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setTones(cid, payload.ringtone, payload.notificationTone, deviceOf(payload))
    return { success = true }
end)

---Returns the caller's notification preference for one app, defaulting to enabled. Read-only.
lib.callback.register('sd-phone:server:settings:getNotifPref', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    return { success = true, data = { enabled = store.getNotifPref(cid, payload.app) } }
end)

---Every stored notification override for the caller, keyed by app. Read-only.
lib.callback.register('sd-phone:server:settings:getNotifPrefs', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    return { success = true, data = store.getNotifPrefs(cid) }
end)

---Persists the caller's notification preferences for one app. `on`, `sounds` and `tone` are each
---optional; whatever is omitted keeps its stored value.
lib.callback.register('sd-phone:server:settings:setNotifPref', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'notifPref') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.setNotifPref(cid, payload.app, {
        enabled = payload.on,
        sounds  = payload.sounds,
        tone    = payload.tone,
    })
    return { success = true }
end)

---Saves a custom (YouTube) tone, ringtone or notification; the store's boolean result becomes
---the envelope's success flag.
lib.callback.register('sd-phone:server:settings:tones:add', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'tonesAdd') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    return { success = store.addCustomTone(cid, payload.kind, payload.id, payload.name, payload.url) }
end)

---Removes one of the caller's custom tones.
lib.callback.register('sd-phone:server:settings:tones:remove', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    if not writeAllowed(cid, 'tonesRemove') then return BUSY end
    payload = type(payload) == 'table' and payload or {}
    store.removeCustomTone(cid, payload.id)
    return { success = true }
end)

---@type table<string, { key: string, window: integer }> Cooldown budget per reset scope. The two
---cost wildly different amounts: an erase runs two unindexed mail scans and a badge recompute, a
---settings reset is a handful of small deletes. Separate keys, so one never blocks the other.
local RESET_LIMITS = {
    settings = { key = 'settings:reset',        window = 2000 },
    erase    = { key = 'settings:factoryReset', window = 30000 },
}

---Milliseconds left on each reset's cooldown, so the Reset Phone page can grey the row out and
---count down instead of letting the player press a button that will be refused. Read-only.
lib.callback.register('sd-phone:server:settings:resetCooldown', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    local data = {}
    for scope, limit in pairs(RESET_LIMITS) do
        data[scope] = util.cooldownLeft(cid, limit.key, limit.window)
    end
    return { success = true, data = data }
end)

---Settings > Reset All Settings (`scope = 'settings'`) and Settings > Erase All Content
---(`scope = 'erase'`).
---
---Reset puts the preferences back to default and leaves the character otherwise intact: still
---set up, still holding their apps, accounts, lock, contact card and everything on the phone.
---Erase clears the row down to the phone number, deletes the content the phone owns (contacts,
---messages, photos and the rest, per server.admin.wipe.wipeDeviceContent) and signs the caller
---out of every app account and mailbox.
---
---Erase HAS to clear setup_done server-side: the client re-arming the wizard locally is undone
---by the very next settings:get while the stored flag still reads done.
lib.callback.register('sd-phone:server:settings:factoryReset', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, messageKey = 'settings.playerNotFound', message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    local eraseAll = payload.scope ~= 'settings'
    local limit = RESET_LIMITS[eraseAll and 'erase' or 'settings']
    if not util.cooldown(cid, limit.key, limit.window) then
        return {
            success = false,
            messageKey = 'settings.pleaseWaitMomentBeforeTrying', message = 'Please wait a moment before trying again',
            retryIn = util.cooldownLeft(cid, limit.key, limit.window),
        }
    end
    dropPendingWrites(cid)
    store.resetSettings(cid, deviceOf(payload), eraseAll and 'erase' or 'settings')
    store.resetNotifPrefs(cid)
    require('server.services.store').resetFor(cid)
    require('server.wifi.store').resetFor(cid)
    require('server.bluetooth.store').resetFor(cid)
    if eraseAll then
        require('server.admin.wipe').wipeDeviceContent(cid)
        accounts.signOutEverywhere(cid)
    end
    badges.push(source)
    return { success = true }
end)

---Server export: returns a character's phone number by citizenid. Pass ensure == true to assign
---a number on first access; otherwise a never-assigned character yields nil.
---@param citizenid string framework per-character id
---@param ensure boolean|nil assign a number when none exists yet
---@return string|nil number raw-digit phone number
exports('getPhoneNumberByIdentifier', function(citizenid, ensure)
    if type(citizenid) ~= 'string' or citizenid == '' then return nil end
    if ensure == true then return store.ensurePhoneNumber(citizenid) end
    return store.getPhoneNumber(citizenid)
end)

---Server export: returns the citizenid that owns a phone number, or nil when unassigned.
---@param number string phone number in any formatting
---@return string|nil citizenid
exports('getIdentifierByNumber', function(number)
    return store.getCitizenByNumber(number)
end)

---Server export: the connected server id of the character that owns a phone number. Nil when the
---number is unassigned or its owner is offline.
---@param number string phone number in any formatting
---@return number|nil source
exports('getSourceByNumber', function(number)
    local cid = store.getCitizenByNumber(number)
    if not cid then return nil end
    return player.getSourceByIdentifier(cid)
end)

---Server export: returns true when a phone number is assigned to any character.
---@param number string phone number in any formatting
---@return boolean inService
exports('isNumberInService', function(number)
    local digits = (tostring(number or ''):gsub('%D', ''))
    if digits == '' then return false end
    return store.numberExists(digits)
end)

---Server export: returns true when a player currently has airplane mode on; an unresolvable
---source reads as false.
---@param source number player server id
---@return boolean on
exports('isAirplaneMode', function(source)
    if type(source) ~= 'number' then return false end
    local cid = player.getIdentifier(source)
    if not cid then return false end
    -- Always the phone's radio: a caller asking whether this player is reachable means the device
    -- that takes calls and texts, and a tablet has none.
    return store.isAirplane(cid)
end)
