---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Ryde persistence layer (server.ryde.store): drivers + finished-rides tables.
local store   = require 'server.ryde.store'
---@type table Authoritative Ryde handlers (server.ryde.actions): matching, trips, money movement.
local actions = require 'server.ryde.actions'

-- Schema bootstrap, then any fare a trip lost to a restart still held goes back to its rider.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        boot.schemaFailed('ryde', err)
        return
    end
    boot.schemaReady()
    local refunded, rerr = pcall(actions.refundOrphanHolds)
    if not refunded then print(('^1[sd-phone:ryde]^0 held fares were not refunded: %s'):format(tostring(rerr))) end
end)

-- Authoritative Ryde callbacks: thin delegates into server.ryde.actions.
lib.callback.register('sd-phone:server:ryde:config',        function()             return actions.config() end)
lib.callback.register('sd-phone:server:ryde:me',            function(src)          return actions.me(src) end)
lib.callback.register('sd-phone:server:ryde:sync',          function(src)          return actions.sync(src) end)
lib.callback.register('sd-phone:server:ryde:deleteAccount', function(src)          return actions.deleteAccount(src) end)
lib.callback.register('sd-phone:server:ryde:requestRide',   function(src, payload) return actions.requestRide(src, payload) end)
lib.callback.register('sd-phone:server:ryde:respond',       function(src, payload) return actions.respond(src, payload) end)
lib.callback.register('sd-phone:server:ryde:cancel',        function(src)          return actions.cancel(src) end)
lib.callback.register('sd-phone:server:ryde:setOnline',     function(src, payload) return actions.setOnline(src, payload) end)
lib.callback.register('sd-phone:server:ryde:requestsBoard', function(src)          return actions.requestsBoard(src) end)
lib.callback.register('sd-phone:server:ryde:watchTrip',     function(src, payload) return actions.watchTrip(src, payload) end)
lib.callback.register('sd-phone:server:ryde:waitingCount',  function(src)          return actions.waitingCount(src) end)
lib.callback.register('sd-phone:server:ryde:accept',        function(src, payload) return actions.accept(src, payload) end)
lib.callback.register('sd-phone:server:ryde:tripStatus',    function(src, payload) return actions.tripStatus(src, payload) end)
lib.callback.register('sd-phone:server:ryde:sameVehicle',   function(src, payload) return actions.sameVehicle(src, payload) end)
lib.callback.register('sd-phone:server:ryde:complete',      function(src, payload) return actions.complete(src, payload) end)
lib.callback.register('sd-phone:server:ryde:rate',          function(src, payload) return actions.rate(src, payload) end)
lib.callback.register('sd-phone:server:ryde:history',       function(src)          return actions.history(src) end)
lib.callback.register('sd-phone:server:ryde:leaderboard',   function()             return actions.leaderboard() end)

---/rydeoffer - DEV/TEST: injects a dummy fare offer onto the caller's own active ride request.
---Restricted: it mints a synthetic trip record per run, so it must not be player-reachable.
---@param source integer player server id
lib.addCommand('rydeoffer', {
    help = 'Ryde: add a test fare offer to your active ride request',
    restricted = 'group.admin',
}, function(source)
    local msg = actions.devOffer(source)
    TriggerClientEvent('ox_lib:notify', source, { title = 'Ryde', description = msg, type = 'inform' })
end)

---Cancels anything a leaving player was in and clears their per-src caches.
AddEventHandler('playerDropped', function()
    actions.onPlayerDropped(source)
end)
