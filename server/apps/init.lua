---@type table Authoritative app-management handlers (server.apps.actions): whitelisting + persistence.
local actions = require 'server.apps.actions'

-- App-management callbacks: thin delegates into server.apps.actions.
lib.callback.register('sd-phone:server:apps:list', function(src)
    return actions.list(src)
end)

lib.callback.register('sd-phone:server:apps:install', function(src, payload)
    return actions.install(src, payload)
end)

lib.callback.register('sd-phone:server:apps:uninstall', function(src, payload)
    return actions.uninstall(src, payload)
end)

lib.callback.register('sd-phone:server:apps:saveLayout', function(src, payload)
    return actions.saveLayout(src, payload)
end)
