---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Cell service (client.service): live level + capability gating.
local service = require 'client.service'

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

---Whether a server callback may be reached right now. Every app talks to the server through
---this file, so one check covers the whole phone; namespaces in Offline are device-local, RF or
---landline and keep working in a dead zone, bar the individual actions listed in Gated.
---@param serverEvent string 'sd-phone:server:<namespace>:<action>'
---@return boolean
local function reachable(serverEvent)
    if not service.active() then return true end
    local action = serverEvent:match('^sd%-phone:server:(.+)$')
    if not action then return true end
    if GATED[action] then return service.allows('data') end
    if OFFLINE_OK[action:match('^([^:]+)')] then return true end
    return service.allows('data')
end

---Binds a NUI callback that forwards its payload to the matching server callback and returns the
---response envelope unchanged, falling back to a uniform failure when the server never answers.
---@param nuiAction string NUI action name the React app fetches
---@param serverEvent string server callback name to await
---@param onAccepted? fun() ran only when the server accepted the write, never on a rejection
local function proxy(nuiAction, serverEvent, onAccepted)
    RegisterNUICallback(nuiAction, function(payload, cb)
        if not reachable(serverEvent) then
            cb({ success = false, message = 'No Service' })
            return
        end
        local res = lib.callback.await(serverEvent, false, payload)
        if onAccepted and type(res) == 'table' and res.success == true then onAccepted() end
        cb(res or { success = false, message = 'No response from server' })
    end)
end

return proxy
