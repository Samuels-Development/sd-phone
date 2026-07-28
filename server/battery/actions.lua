---@type table Main config (configs.config).
local config = require 'configs.config'
---@type table Battery persistence (server.battery.store).
local store = require 'server.battery.store'

local actions = {}

---@type table<number, table> Live client state, authoritative while the player is connected.
actions.live = {}

---True while the feature is switched on.
---@return boolean
local function on()
    return config.Battery ~= nil and config.Battery.Enabled == true
end

---@param v any
---@return integer
local function clamp(v)
    local n = math.floor(tonumber(v) or 0)
    if n < 0 then return 0 end
    if n > 100 then return 100 end
    return n
end

---Current level for a source. A live client's value wins; otherwise the checkpoint is projected.
---@param source number player server id
---@return integer level 0-100
function actions.get(source)
    if not on() then return 100 end
    local live = actions.live[source]
    if live then return live.level end

    local owner = store.ownerKey(source)
    if not owner then return 100 end
    local state = store.read(owner)
    return store.derive({ level = state.level, charging = state.charging, updated_at = state.updatedAt })
end

---Sets an absolute level, checkpoints it and pushes the new value to the client.
---@param source number player server id
---@param pct number 0-100
---@return boolean
function actions.set(source, pct)
    if not on() then return false end
    local owner = store.ownerKey(source)
    if not owner then return false end

    local level = clamp(pct)
    local live = actions.live[source] or { charging = false, lowPower = false }
    local was = live.level or level
    live.level = level
    actions.live[source] = live

    store.write(owner, level, live.charging, live.lowPower)
    TriggerClientEvent('sd-phone:client:battery:set', source, level, live.charging, live.lowPower)

    if level <= 0 and was > 0 then
        TriggerEvent('sd-phone:server:battery:died', source, owner)
    end
    return true
end

---Adds (or removes) charge relative to the current level.
---@param source number player server id
---@param amount number percentage points, may be negative
---@return boolean
function actions.charge(source, amount)
    if not on() then return false end
    local delta = tonumber(amount)
    if not delta then return false end

    local okay = actions.set(source, actions.get(source) + delta)
    if okay and delta > 0 then
        TriggerEvent('sd-phone:server:battery:charged', source, store.ownerKey(source), actions.get(source))
    end
    return okay
end

---Latches charging on or off.
---@param source number player server id
---@param charging boolean
---@return boolean
function actions.setCharging(source, charging)
    if not on() then return false end
    local owner = store.ownerKey(source)
    if not owner then return false end

    local live = actions.live[source] or { level = actions.get(source), lowPower = false }
    live.charging = charging == true
    actions.live[source] = live

    store.write(owner, live.level, live.charging, live.lowPower)
    TriggerClientEvent('sd-phone:client:battery:charging', source, live.charging)
    return true
end

---@param source number player server id
---@return boolean
function actions.isCharging(source)
    if not on() then return false end
    local live = actions.live[source]
    if live then return live.charging == true end

    local owner = store.ownerKey(source)
    if not owner then return false end
    return store.read(owner).charging
end

---@param source number player server id
---@return boolean
function actions.isDead(source)
    if not on() then return false end
    return actions.get(source) <= 0
end

---Forces a checkpoint write for a source.
---@param source number player server id
---@return boolean
function actions.flush(source)
    if not on() then return false end
    local owner = store.ownerKey(source)
    local live = actions.live[source]
    if not owner or not live then return false end
    return store.write(owner, live.level, live.charging, live.lowPower)
end

---Flushes every live session.
function actions.flushAll()
    for source in pairs(actions.live) do actions.flush(source) end
end

return actions
