---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'
---@type table Cases persistence (server.cases.store): schema bootstrap.
local store = require 'server.cases.store'
---@type table Cases handlers (server.cases.actions): validation, money movement and storage.
local actions = require 'server.cases.actions'

-- NUI-facing callbacks: thin delegates into server.cases.actions.
lib.callback.register('sd-phone:server:cases:state',    function(src)          return actions.state(src)           end)
lib.callback.register('sd-phone:server:cases:equipped', function(src)          return actions.equipped(src)        end)
lib.callback.register('sd-phone:server:cases:buy',      function(src, payload) return actions.buy(src, payload)    end)
lib.callback.register('sd-phone:server:cases:equip',    function(src, payload) return actions.equip(src, payload)  end)
lib.callback.register('sd-phone:server:cases:remove',   function(src, payload) return actions.remove(src, payload) end)
lib.callback.register('sd-phone:server:cases:photo',    function(src, payload) return actions.photo(src, payload)  end)

-- Boot: creates the schema and reports it.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('cases', err)
        return
    end
    boot.schemaReady()
end)
