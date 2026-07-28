---@type table Main config (configs.config).
local config = require 'configs.config'
---@type table Battery policy (server.battery.actions).
local actions = require 'server.battery.actions'
---@type table Battery persistence (server.battery.store).
local store = require 'server.battery.store'

require 'server.battery.items'

---True while the feature is switched on.
---@return boolean
local function on()
    return config.Battery ~= nil and config.Battery.Enabled == true
end

---Client checkpoint: the owning client reports its simulated level.
RegisterNetEvent('sd-phone:server:battery:checkpoint', function(level, charging, lowPower)
    local src = source
    if not on() then return end

    local owner = store.ownerKey(src)
    if not owner then return end

    local clamped = math.max(0, math.min(100, math.floor(tonumber(level) or 100)))
    actions.live[src] = { level = clamped, charging = charging == true, lowPower = lowPower == true }
    store.write(owner, clamped, charging == true, lowPower == true)
end)

---Hydration: the client asks for its stored state on boot.
lib.callback.register('sd-phone:server:battery:get', function(src)
    if not on() then
        return { enabled = false, level = 100, charging = false, lowPower = false }
    end

    local owner = store.ownerKey(src)
    if not owner then
        return { enabled = false, level = 100, charging = false, lowPower = false }
    end

    local state = store.read(owner)
    local level = store.derive({ level = state.level, charging = state.charging, updated_at = state.updatedAt })
    actions.live[src] = { level = level, charging = state.charging, lowPower = state.lowPower }
    return { enabled = true, level = level, charging = state.charging, lowPower = state.lowPower }
end)

AddEventHandler('playerDropped', function()
    local src = source
    actions.flush(src)
    actions.live[src] = nil
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    actions.flushAll()
end)

---Server export: current battery level for a player, 0-100. Reads 100 while disabled.
---@param source number player server id
---@return integer level
exports('getBattery', function(source) return actions.get(source) end)

---Server export: sets an absolute battery level.
---@param source number player server id
---@param pct number 0-100
---@return boolean
exports('setBattery', function(source, pct) return actions.set(source, pct) end)

---Server export: adds charge relative to the current level; negative drains.
---@param source number player server id
---@param amount number percentage points
---@return boolean
exports('chargePhone', function(source, amount) return actions.charge(source, amount) end)

---Server export: latches charging on or off. The caller owns both edges.
---@param source number player server id
---@param charging boolean
---@return boolean
exports('toggleCharging', function(source, charging) return actions.setCharging(source, charging) end)

---Server export: true while the phone is charging.
---@param source number player server id
---@return boolean
exports('isCharging', function(source) return actions.isCharging(source) end)

---Server export: true once the battery has reached zero.
---@param source number player server id
---@return boolean
exports('isPhoneDead', function(source) return actions.isDead(source) end)

---Server export: forces a checkpoint write.
---@param source number player server id
---@return boolean
exports('saveBattery', function(source) return actions.flush(source) end)

return actions
