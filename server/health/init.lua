---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'
---@type table Health persistence (server.health.store): schema, banking, reads.
local store = require 'server.health.store'
---@type table Health handlers (server.health.actions): flush budget, summary, leaderboard.
local actions = require 'server.health.actions'
---@type table Shared server helpers (server.util): onCleanup.
local util = require 'server.util'

CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        boot.schemaFailed('health', err)
        return
    end
    boot.schemaReady()
    pcall(store.prune)
end)

util.onCleanup(function(src) actions.forget(src) end)

actions.startSaving()

---The resource stopping writes everything still held. Sent without waiting: an awaited query would
---never be resumed once the resource is gone, while oxmysql runs one already handed to it.
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    actions.save(nil, true)
end)

---txAdmin's warning before a scheduled restart or shutdown: write what is held while it still can.
AddEventHandler('txAdmin:events:serverShuttingDown', function()
    actions.save()
end)

---Banks a client's activity deltas. Fire and forget; the client does not read the result.
---@param delta table steps/distanceM/activeMs/heartRate accumulated since the client's last flush
RegisterNetEvent('sd-phone:server:health:flush', function(delta)
    actions.flush(source, delta)
end)

---Today's totals, the last week of daily rows, and the step goal the ring fills to.
lib.callback.register('sd-phone:server:health:summary', function(source)
    local data = actions.summary(source)
    if not data then return { success = false } end
    return { success = true, data = data }
end)

---Today's server-wide steps board, with the caller's own standing attached.
lib.callback.register('sd-phone:server:health:leaderboard', function(source)
    local data = actions.leaderboard(source)
    if not data then return { success = false } end
    return { success = true, data = data }
end)
