---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Stocks persistence layer (server.stocks.store): schema bootstrap + price rows.
local store   = require 'server.stocks.store'
---@type table Shared price simulation (server.stocks.engine): tick, persist + broadcast payloads.
local engine  = require 'server.stocks.engine'
---@type table Authoritative trade handlers (server.stocks.actions): validation + money movement.
local actions = require 'server.stocks.actions'

---@type table Stocks config (config.Stocks): tick + save cadence.
local ST = config.Stocks

-- NUI-facing callbacks: thin delegates into server.stocks.actions.
lib.callback.register('sd-phone:server:stocks:market',   function(src)          return actions.market(src)             end)
lib.callback.register('sd-phone:server:stocks:deposit',  function(src, payload) return actions.deposit(src, payload)   end)
lib.callback.register('sd-phone:server:stocks:withdraw', function(src, payload) return actions.withdraw(src, payload)  end)
lib.callback.register('sd-phone:server:stocks:buy',      function(src, payload) return actions.buy(src, payload)       end)
lib.callback.register('sd-phone:server:stocks:sell',     function(src, payload) return actions.sell(src, payload)      end)
lib.callback.register('sd-phone:server:stocks:holders',  function(src, payload) return actions.holders(src, payload)   end)

---@type table<number, boolean> Players with the Stocks app open (live price-push targets), by src.
local watchers = {}

---Subscribes or unsubscribes the caller to the per-tick price push while the app is open.
---@param src number
---@param payload table { on: boolean }
lib.callback.register('sd-phone:server:stocks:watch', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    if payload.on == true then watchers[src] = true else watchers[src] = nil end
    return { success = true }
end)

---Drops a departing watcher's entry.
AddEventHandler('playerDropped', function()
    watchers[source] = nil
end)

-- Boot then heartbeat: creates the schema, seeds prices, then ticks the market every
-- ST.TickSeconds, pushing the light tick payload to players with Stocks open.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:stocks]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    engine.init()
    print('^2[sd-phone:stocks]^0 market ready')

    while true do
        Wait((ST.TickSeconds or 5) * 1000)
        engine.tick()
        if next(watchers) then
            local ticks = engine.ticks()
            for src in pairs(watchers) do
                if GetPlayerName(src) then
                    TriggerClientEvent('sd-phone:client:stocks:prices', src, { assets = ticks })
                else
                    watchers[src] = nil
                end
            end
        end
    end
end)

-- Batched persistence: saves the market every ST.SaveSeconds.
CreateThread(function()
    while true do
        Wait((ST.SaveSeconds or 30) * 1000)
        local ok, err = pcall(function() store.savePrices(engine.persistRows()) end)
        if not ok then print(('^1[sd-phone:stocks]^0 price save failed: %s'):format(err)) end
    end
end)

---Flushes the live prices once on resource stop. Guarded to this resource only.
---@param resource string name of the resource that stopped
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    pcall(function() store.savePrices(engine.persistRows()) end)
end)
