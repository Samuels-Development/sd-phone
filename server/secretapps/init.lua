-- Wires configs/secret_apps.lua's `secretapp` entries to an ox_inventory item: using the item
-- unlocks the matching app onto that character's phone permanently (server/secretapps/store.lua),
-- and client/secretapps.lua registers it as a custom app on that player's phone alone, so nobody
-- else's App Store or home screen ever lists it.
--
-- The item itself lives in ox_inventory's own data/items.lua and isn't touched here. Point it at
-- this export:
--   ['custom_usb_1'] = {
--       label   = 'USB Tool',
--       weight  = 100,
--       stack   = false,
--       close   = true,
--       consume = 1,
--       server  = { export = 'sd-phone.useSecretAppItem' },
--   },

---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot   = require 'server.boot'
---@type table Secret app catalog root (configs/secret_apps.lua).
local config = require 'configs.secret_apps'
---@type table Player bridge (bridge.server.player): citizenid lookups from a server id.
local player = require 'bridge.server.player'
---@type table Notify bridge (bridge.server.notify): server -> client toasts.
local notify = require 'bridge.server.notify'
---@type table Secret app persistence layer (server.secretapps.store): unlock CRUD.
local store  = require 'server.secretapps.store'

-- Schema bootstrap.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        boot.schemaFailed('secretapps', err)
        return
    end
    boot.schemaReady()
end)

-- item id -> app def, built once from configs/secret_apps.lua. A malformed or duplicate entry is
-- skipped rather than erroring the whole catalog.
---@type table<string, table> ox_inventory item id -> app def.
local BY_ITEM = {}
---@type table<string, table> secret app id -> app def.
local BY_ID   = {}
for _, app in ipairs(config.Apps or {}) do
    if type(app.id) == 'string' and app.id ~= '' then
        BY_ID[app.id] = app
        if type(app.secretapp) == 'string' and app.secretapp ~= '' then
            if BY_ITEM[app.secretapp] then
                print(('^1[sd-phone]^0 secret app item %s is claimed by more than one app; keeping the first'):format(app.secretapp))
            else
                BY_ITEM[app.secretapp] = app
            end
        end
    end
end

---Finds a secret app definition by app id, secretapp item name, or loose matching.
---@param query string
---@return table|nil
local function findApp(query)
    if type(query) ~= 'string' or query == '' then return nil end
    if BY_ID[query] then return BY_ID[query] end
    if BY_ITEM[query] then return BY_ITEM[query] end
    for _, app in ipairs(config.Apps or {}) do
        if app.id:lower() == query:lower() or (app.secretapp and app.secretapp:lower() == query:lower()) then
            return app
        end
    end
    return nil
end

---The caller's already-unlocked secret app ids. Read-only.
---@param source number player server id
---@return string[] ids
lib.callback.register('sd-phone:server:secretapps:list', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return {} end
    return store.list(cid)
end)

---Removes/uninstalls a secret app from a player's phone.
---@param target number|string player server ID
---@param appQuery string secret app ID or item name
---@return boolean success, string? message
local function removeSecretApp(target, appQuery)
    local targetSrc = tonumber(target)
    if not targetSrc or targetSrc <= 0 then
        return false, 'Invalid player ID'
    end

    local cid = player.getIdentifier(targetSrc)
    if not cid then
        return false, 'Player not found or offline'
    end

    local app = findApp(appQuery)
    local appId = app and app.id or appQuery

    if not store.has(cid, appId) then
        return false, ('App %s is not installed for this player'):format(app and app.label or appId)
    end

    store.remove(cid, appId)
    TriggerClientEvent('sd-phone:client:secretapps:removed', targetSrc, appId)
    notify.to(targetSrc, ('%s uninstalled'):format(app and app.label or appId), 'inform')
    return true, ('Uninstalled %s for player %s'):format(app and app.label or appId, targetSrc)
end

exports('removeSecretApp', removeSecretApp)
exports('uninstallSecretApp', removeSecretApp)

---ox_inventory calls this export for every event on a `secretapp` item (see the header comment
---for the item's `server.export` field). Only the actual use fires an unlock; a re-use once
---already unlocked is a no-op notice rather than a second write.
---@param event string ox_inventory usable-item event name
---@param item table|nil the used item's static definition (item.name is the item id)
---@param inv table|nil inventory the item was used from; `.id` is the player's server id
exports('useSecretAppItem', function(event, item, inv)
    if event ~= 'usingItem' then return end
    if type(inv) ~= 'table' or type(inv.id) ~= 'number' then return end

    local itemName = item and item.name
    local app = type(itemName) == 'string' and BY_ITEM[itemName] or nil
    if not app then return end

    local source = inv.id
    local cid = player.getIdentifier(source)
    if not cid then return end

    if store.has(cid, app.id) then
        notify.to(source, ('%s is already installed'):format(app.label or app.id), 'error')
        TriggerClientEvent('sd-phone:client:secretapps:unlocked', source, app)
        return
    end

    store.unlock(cid, app.id)
    notify.to(source, ('%s unlocked'):format(app.label or app.id), 'success')
    TriggerClientEvent('sd-phone:client:secretapps:unlocked', source, app)
end)

---/uninstallsecretapp <app> [target] - uninstalls a secret app from a player's phone.
lib.addCommand('uninstallsecretapp', {
    help = 'Uninstall a secret app from your phone (or target player)',
    params = {
        { name = 'app',    type = 'string',   help = 'Secret App ID or Item name (e.g. ghm-vehiclehack)' },
        { name = 'target', type = 'playerId', help = 'Target Player ID (Admin only, defaults to yourself)', optional = true },
    },
}, function(source, args)
    local targetSrc = source
    if args.target and args.target ~= source then
        if source ~= 0 and not IsPlayerAceAllowed(tostring(source), 'command.phoneadmin') and not IsPlayerAceAllowed(tostring(source), 'command') then
            notify.to(source, 'You do not have permission to uninstall apps from other players', 'error')
            return
        end
        targetSrc = args.target
    end

    if targetSrc == 0 then
        print('^1[sd-phone]^0 Console must specify a target player ID.')
        return
    end

    local ok, msg = removeSecretApp(targetSrc, args.app)
    if source == 0 then
        print(('%s[sd-phone]^0 %s'):format(ok and '^2' or '^1', msg or 'Done'))
    elseif source ~= targetSrc then
        notify.to(source, msg or 'Done', ok and 'success' or 'error')
    end
end)

---/removesecretapp <target> <app> - admin command to remove a secret app from a player.
lib.addCommand('removesecretapp', {
    help = 'Admin: remove/uninstall a secret app from a player',
    restricted = 'group.admin',
    params = {
        { name = 'target', type = 'playerId', help = 'Target Player ID' },
        { name = 'app',    type = 'string',   help = 'Secret App ID or Item name (e.g. ghm-vehiclehack)' },
    },
}, function(source, args)
    local targetSrc = args.target or source
    if not targetSrc or targetSrc <= 0 then
        if source == 0 then
            print('^1[sd-phone]^0 Console must specify a target player ID.')
        end
        return
    end

    local ok, msg = removeSecretApp(targetSrc, args.app)
    if source == 0 then
        print(('%s[sd-phone]^0 %s'):format(ok and '^2' or '^1', msg or 'Done'))
    else
        notify.to(source, msg or 'Done', ok and 'success' or 'error')
    end
end)

