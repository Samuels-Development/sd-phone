---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Find Friends config (configs/friends.lua): MaxFriends cap + push interval.
local config  = require 'configs.friends'
---@type table Find Friends persistence (server.friends.store): directed share-edge CRUD.
local store   = require 'server.friends.store'
---@type table Authoritative Find Friends handlers (server.friends.actions).
local actions = require 'server.friends.actions'

---@type table<number, boolean> Players whose Find Friends app is currently open (live-push
---targets), by src.
local watchers = {}

-- Schema bootstrap, once at boot: creates/upgrades the phone_friends table.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('friends', err)
        return
    end
    boot.schemaReady()
end)

-- Roster callbacks: thin delegates into server.friends.actions; payloads are coerced to tables here.
lib.callback.register('sd-phone:server:friends:list', function(src)
    return actions.list(src)
end)

lib.callback.register('sd-phone:server:friends:add', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return actions.add(src, payload.phone)
end)

lib.callback.register('sd-phone:server:friends:remove', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return actions.remove(src, payload.id)
end)

lib.callback.register('sd-phone:server:friends:share', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return actions.setShare(src, payload.id, payload.enabled)
end)

lib.callback.register('sd-phone:server:friends:respond', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return actions.respond(src, payload.id, payload.phone, payload.accept == true)
end)

lib.callback.register('sd-phone:server:friends:status', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return actions.status(src, payload.phone)
end)

---Subscribes or unsubscribes the caller to the live position push while the app is open.
---@param payload table { on: boolean }
lib.callback.register('sd-phone:server:friends:watch', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    if payload.on == true then watchers[src] = true else watchers[src] = nil end
    return { success = true }
end)

---@type table<number, string> The last roster each watcher was sent, encoded, so an unchanged
---tick (nobody moved, nothing toggled) costs no push at all.
local lastSent = {}

---Drops a departing watcher's entry.
AddEventHandler('playerDropped', function()
    watchers[source] = nil
    lastSent[source] = nil
end)

---@type table Player bridge (bridge.server.player): the once-per-tick online cid->src map.
local player = require 'bridge.server.player'

-- Live push loop: every UpdateInterval ms, hands each watcher their fresh roster snapshot,
-- sharing one online cid->src map per tick; vanished watchers are pruned in-line.
CreateThread(function()
    while true do
        Wait(config.UpdateInterval or 3000)
        if next(watchers) then
            local onlineCids = player.onlineCidMap()
            for src in pairs(watchers) do
                if GetPlayerName(src) then
                    local payload = { friends = actions.snapshot(src, onlineCids) }
                    local encoded = json.encode(payload)
                    if lastSent[src] ~= encoded then
                        lastSent[src] = encoded
                        TriggerClientEvent('sd-phone:client:friends:update', src, payload)
                    end
                else
                    watchers[src] = nil
                    lastSent[src] = nil
                end
            end
        end
    end
end)
