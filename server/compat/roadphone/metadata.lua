---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Player bridge (bridge.server.player): source -> acting identity.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): the phone's own stored state.
local store = require 'server.settings.store'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, stubMeta, warnOnce = shim.registerExport, shim.stubMeta, shim.warnOnce

---The acting identity behind a source: the SIM identity while unique phones are on, the character
---id otherwise. Nil when the player is not connected.
---@param source any
---@return string|nil identity
local function identity(source)
    local src = shim.source(source)
    return src and player.getIdentifier(src) or nil
end

---GetPhoneMetadataOnly(source): everything RoadPhone keeps on the phone item, assembled from the
---rows sd-phone stores per phone instead. Nil when the player does not resolve.
registerExport('GetPhoneMetadataOnly', function(source)
    local cid = identity(source)
    if not cid then return nil end

    local security = store.getSecurity(cid)
    local wallpapers = store.getWallpapers(cid)
    return {
        phone_number   = store.getPhoneNumber(cid),
        setup          = store.getSetupDone(cid) and 1 or 0,
        background     = wallpapers.home or wallpapers.lock,
        pin            = security.passcode,
        pin_needed     = security.passcode and 1 or 0,
        phone_settings = store.snapshot(cid, 'phone'),
        installed_apps = store.getInstalledApps(cid),
        homescreen     = store.getHomeLayout(cid),
    }
end)

---GetPhoneSetupFromItem(source): whether the phone has finished first-run setup.
registerExport('GetPhoneSetupFromItem', function(source)
    local cid = identity(source)
    if not cid then return 0 end
    return store.getSetupDone(cid) and 1 or 0
end)

---UpdatePhoneSetup(source, setupStatus): marks setup done. sd-phone only ever moves this forward -
---there is no un-setup path - so a 0 is refused rather than pretending to re-arm the wizard.
registerExport('UpdatePhoneSetup', function(source, setupStatus)
    local cid = identity(source)
    if not cid then return false end
    if tonumber(setupStatus) ~= 1 then
        warnOnce('UpdatePhoneSetup.reset', ('UpdatePhoneSetup cannot un-complete setup (called by %s); sd-phone stores a done flag with no reset path'):format(GetInvokingResource() or 'unknown'))
        return false
    end

    store.setSetupDone(cid)
    return true
end)

---GetPhoneBackground(source): the wallpaper key of the active phone, home screen first.
registerExport('GetPhoneBackground', function(source)
    local cid = identity(source)
    if not cid then return nil end
    local wallpapers = store.getWallpapers(cid)
    return wallpapers.home or wallpapers.lock
end)

---UpdatePhoneBackground(source, background): sets the wallpaper. RoadPhone keeps one background
---where sd-phone keeps a lock and a home screen, so both are written to the same key.
registerExport('UpdatePhoneBackground', function(source, background)
    local cid = identity(source)
    if not cid or type(background) ~= 'string' then return false end

    store.setWallpaper(cid, background, background)
    return true
end)

---GetPhoneSettingsFromMetadata(source): the phone's whole settings snapshot. The keys are
---sd-phone's own (theme, brightness, ringtone, hour24, and the rest), not RoadPhone's.
registerExport('GetPhoneSettingsFromMetadata', function(source)
    local cid = identity(source)
    if not cid then return {} end
    return store.snapshot(cid, 'phone')
end)

---GetPhonePin(source): the lock passcode and whether one is required.
registerExport('GetPhonePin', function(source)
    local cid = identity(source)
    if not cid then return nil end

    local security = store.getSecurity(cid)
    return { pin = security.passcode, pin_needed = security.passcode and 1 or 0 }
end)

---UpdatePhonePin(source, pin, pinNeeded): sets or clears the lock passcode. (source, nil, 0) clears
---it, which also switches Face Unlock off because sd-phone only allows it alongside a passcode.
registerExport('UpdatePhonePin', function(source, pin, pinNeeded)
    local cid = identity(source)
    if not cid then return false end

    local wanted = (tonumber(pinNeeded) == 1) and pin or nil
    store.setSecurity(cid, wanted, store.getSecurity(cid).faceId)
    return true
end)

---GetPhoneAppsFromMetadata(source): the installed downloadable apps plus the home-screen layout.
registerExport('GetPhoneAppsFromMetadata', function(source)
    local cid = identity(source)
    if not cid then return {} end
    return { installedApps = store.getInstalledApps(cid), homescreen = store.getHomeLayout(cid) }
end)

---UpdateInstalledApps(source, installedApps): replaces the installed downloadable app id list.
registerExport('UpdateInstalledApps', function(source, installedApps)
    local cid = identity(source)
    if not cid or type(installedApps) ~= 'table' then return false end

    store.setInstalledApps(cid, installedApps)
    return true
end)

---UpdateHomescreenLayout(source, homescreenData): replaces the home-screen layout.
registerExport('UpdateHomescreenLayout', function(source, homescreenData)
    local cid = identity(source)
    if not cid or type(homescreenData) ~= 'table' then return false end

    store.setHomeLayout(cid, homescreenData)
    return true
end)

---UpdatePhoneApps(source, appsData): both of the above in one write; either half may be absent.
registerExport('UpdatePhoneApps', function(source, appsData)
    local cid = identity(source)
    if not cid or type(appsData) ~= 'table' then return false end

    local apps = appsData.installedApps or appsData.installed_apps
    local layout = appsData.homescreen or appsData.homescreenData
    if type(apps) == 'table' then store.setInstalledApps(cid, apps) end
    if type(layout) == 'table' then store.setHomeLayout(cid, layout) end
    return apps ~= nil or layout ~= nil
end)

---PhoneSession_InvalidateBankTx(source): nudges the phone to refetch its bank transactions, which
---is the observable half of what RoadPhone's cache drop does.
registerExport('PhoneSession_InvalidateBankTx', function(source)
    local src = shim.source(source)
    if not src then return end
    TriggerClientEvent('sd-phone:client:bankTxAdded', src)
end)

-- The generic metadata mutators have nothing to write to: sd-phone keeps phone data in its own
-- tables keyed by device identity, so there is no per-item metadata blob to patch a field, a nested
-- field or an array inside. The typed exports above cover the parts that do have a home.
stubMeta('UpdatePhoneMetadataField', false, 'phone state lives in sd-phone\'s own tables, addressed by the typed exports instead')
stubMeta('UpdatePhoneMetadataNested', false, 'phone state lives in sd-phone\'s own tables, addressed by the typed exports instead')
stubMeta('UpdatePhoneMetadataArray', false, 'phone state lives in sd-phone\'s own tables, addressed by the typed exports instead')
stubMeta('UpdatePhoneSettings', false, 'settings are written through validated per-setting handlers, so an arbitrary key/value blob has no safe landing place')

-- Backups: sd-phone backs a phone up by syncing a whole device profile to a cloud account from the
-- Settings app, not by naming a snapshot a resource can create, list or restore.
stubMeta('CreatePhoneBackup', false, 'backups are whole-device cloud profile syncs driven from the Settings app, not named snapshots')
stubMeta('GetPhoneBackups', {}, 'backups are whole-device cloud profile syncs driven from the Settings app, so there is no named list to page')
stubMeta('RestorePhoneBackup', false, 'a restore replaces a whole device profile and is driven by the phone\'s owner from the Settings app')
stubMeta('DeletePhoneBackup', false, 'a restore replaces a whole device profile and is driven by the phone\'s owner from the Settings app')

-- Write-behind and the outbox: sd-phone writes through to the database on every accepted change and
-- has no buffer to flush, so a caller that flushes before reading is already reading fresh rows.
stubMeta('PhoneWriteBehind_Flush', nil, 'writes go straight to the database, so there is never a buffer to flush')
stubMeta('PhoneWriteBehind_FlushAll', nil, 'writes go straight to the database, so there is never a buffer to flush')
stubMeta('EnqueuePhoneOutbox', false, 'the only store-and-forward queue is for pending messages to a number, keyed by message rather than by arbitrary payload kind')
stubMeta('DrainPhoneOutbox', false, 'the only store-and-forward queue is for pending messages, and sd-phone drains it itself when a number attaches')
stubMeta('PhoneSession_InvalidateCallHistory', nil, 'the recents list is fetched per open rather than cached for the session, so there is nothing to invalidate')
