---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Cell service (client.service): live level + capability gating.
local service = require 'client.service'
---@type table Wi-Fi (client.wifi): joined network + capability gating.
local wifiClient = require 'client.wifi'

---@type table Cell tower settings (configs/celltowers.lua).
local towerCfg = type(config.CellTowers) == 'table' and config.CellTowers or {}

---@type table<string, boolean> App namespaces that work with no signal.
local OFFLINE_OK = {}
for _, name in ipairs(towerCfg.Offline or {}) do
    OFFLINE_OK[tostring(name)] = true
end

---@type table<string, boolean> '<app>:<action>' pairs that need data despite an offline namespace.
local GATED = {}
for _, name in ipairs(towerCfg.Gated or {}) do
    GATED[tostring(name)] = true
end

---Whether the phone has a data path right now, over either radio. Named against Wi-Fi explicitly
---rather than leaning on service.allows folding it in, so the gate cannot lose it by refactor.
---@return boolean
local function hasData()
    return wifiClient.provides('data') or service.allows('data')
end

---Whether a server callback may be reached right now. Every app talks to the server through
---this file, so one check covers the whole phone; namespaces in Offline are device-local, RF or
---landline and keep working in a dead zone, bar the individual actions listed in Gated.
---@param serverEvent string 'sd-phone:server:<namespace>:<action>'
---@return boolean
local function reachable(serverEvent)
    if not service.active() then return true end
    local action = serverEvent:match('^sd%-phone:server:(.+)$')
    if not action then return true end
    if GATED[action] then return hasData() end
    if OFFLINE_OK[action:match('^([^:]+)')] then return true end
    return hasData()
end

---@type table<string, boolean> Reads whose last good answer survives a dead zone.
local CACHED = {}
for _, name in ipairs(towerCfg.Cached or {}) do
    CACHED[tostring(name)] = true
end

---@type integer Most remembered answers before the oldest is dropped.
local CACHE_MAX = 80

---@type table<string, table> Last good envelope, keyed by action plus the arguments it was for.
local lastGood = {}
---@type string[] Cache keys in insertion order, so the oldest can be evicted.
local cacheOrder = {}

---Key for one read. The arguments are part of it: a profile page and a DM thread are the same
---action with different payloads, and handing one back for the other would show the wrong data.
---@param action string '<app>:<action>'
---@param payload any arguments the NUI sent
---@return string
local function cacheKey(action, payload)
    local ok, encoded = pcall(json.encode, payload)
    return action .. '|' .. ((ok and encoded) or tostring(payload))
end

---Remembers a successful read. Re-reading something moves it to the back of the queue, so a feed
---the player keeps opening is not evicted ahead of a profile they looked at once.
---@param key string
---@param res table envelope
local function remember(key, res)
    if lastGood[key] ~= nil then
        for i = 1, #cacheOrder do
            if cacheOrder[i] == key then table.remove(cacheOrder, i) break end
        end
    end

    cacheOrder[#cacheOrder + 1] = key
    if #cacheOrder > CACHE_MAX then
        local oldest = table.remove(cacheOrder, 1)
        lastGood[oldest] = nil
    end
    lastGood[key] = res
end

---Binds a NUI callback that forwards its payload to the matching server callback and returns the
---response envelope unchanged, falling back to a uniform failure when the server never answers.
---@param nuiAction string NUI action name the React app fetches
---@param serverEvent string server callback name to await
---@param onAccepted? fun() ran only when the server accepted the write, never on a rejection
---@param transform? fun(res: table) mutates a successful envelope before the NUI and the cache see
---it, for the few answers only a client native can complete
local function proxy(nuiAction, serverEvent, onAccepted, transform)
    ---@type string|nil '<app>:<action>', nil for anything not shaped like one
    local action = serverEvent:match('^sd%-phone:server:(.+)$')
    ---@type boolean Whether this action's answers are worth keeping.
    local cacheable = action ~= nil and CACHED[action] == true

    RegisterNUICallback(nuiAction, function(payload, cb)
        local key = cacheable and cacheKey(action, payload) or nil

        if not reachable(serverEvent) then
            local kept = key and lastGood[key]
            if kept then
                local copy = {}
                for k, v in pairs(kept) do copy[k] = v end
                copy.cached = true
                cb(copy)
                return
            end
            cb({ success = false, message = 'No Service' })
            return
        end

        local res = lib.callback.await(serverEvent, false, payload)
        if onAccepted and type(res) == 'table' and res.success == true then onAccepted() end
        if transform and type(res) == 'table' and res.success == true then transform(res) end
        if key and type(res) == 'table' and res.success == true then remember(key, res) end
        cb(res or { success = false, message = 'No response from server' })
    end)
end

return proxy
