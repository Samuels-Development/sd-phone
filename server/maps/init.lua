---@type table Maps persistence layer (server.maps.store): one JSON row per citizenid.
local store   = require 'server.maps.store'
---@type table Authoritative Maps handlers (server.maps.actions): sanitize + cap + scope.
local actions = require 'server.maps.actions'
---@type table AirShare core (server.share.core): per-kind delivery handler registry.
local share   = require 'server.share.core'

-- Delivery handler for accepted pin AirShares.
share.registerHandler('pin', actions.deliverShare)

---Bootstraps the pins schema once at boot.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:maps]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:maps]^0 schema ready')
end)

-- NUI callbacks: thin delegates into server.maps.actions.
lib.callback.register('sd-phone:server:maps:list', function(src)
    return actions.list(src)
end)

lib.callback.register('sd-phone:server:maps:save', function(src, payload)
    return actions.save(src, payload)
end)

lib.callback.register('sd-phone:server:maps:sharePin', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return actions.requestShare(src, payload.target, payload)
end)
