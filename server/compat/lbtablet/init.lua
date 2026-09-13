---@type string sd_phone_lbtabletcompat convar; 'false' or '0' turns the whole shim off.
local compatConvar = GetConvar('sd_phone_lbtabletcompat', 'true')
if compatConvar == 'false' or compatConvar == '0' then return end

---Whether a REAL resource named `name` exists on this server, whatever its state.
---@param name string
---@return boolean
local function hasRealResource(name)
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == name then return true end
    end
    return false
end

if hasRealResource('lb-tablet') then
    local state = GetResourceState('lb-tablet')
    if state == 'started' or state == 'starting' then
        print('^3[sd-phone]^0 lb-tablet compat: the real lb-tablet resource is running, so the compat layer is NOT registering its exports. Stop or remove lb-tablet to let sd-phone answer for it.')
        return
    end
end

---@type table Shared shim helpers (server.compat.lbtablet.shared): mid-session deregistration.
local shim = require 'server.compat.lbtablet.shared'

---Deregisters the shim's export handlers when the real lb-tablet starts mid-session.
AddEventHandler('onResourceStart', function(resource)
    if resource ~= 'lb-tablet' then return end
    shim.deregisterAll()
    print('^3[sd-phone]^0 lb-tablet compat: the REAL lb-tablet resource just started, so the compat layer deregistered its export handlers and new lookups now resolve to lb-tablet. Only already-cached callers keep the shim\'s functions until lb-tablet next stops.')
end)

-- Loaded for side effects: registers lb-tablet's dispatch export surface on require.
require 'server.compat.lbtablet.dispatch'
