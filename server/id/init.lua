---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table ID persistence layer (server.id.store): schema bootstrap + the portrait row.
local store   = require 'server.id.store'
---@type table Authoritative ID handlers (server.id.actions): card assembly, portrait, show flow.
local actions = require 'server.id.actions'
---@type table AirShare core (server.share.core): per-kind delivery handler registry.
local share   = require 'server.share.core'

-- Delivers an accepted card show onto the recipient's phone.
share.registerHandler('id-card', actions.deliver)

---Boots the ID schema; a failure is printed and non-fatal.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        boot.schemaFailed('id', err)
        return
    end
    boot.schemaReady()
end)

---Register one ID callback under the app's 'sd-phone:server:id:' prefix.
---@param action string callback name suffix
---@param fn function handler fun(src, payload?): table
local function register(action, fn)
    lib.callback.register('sd-phone:server:id:' .. action, fn)
end

-- App callbacks: thin delegates into server.id.actions.
register('list',        function(src) return actions.list(src) end)
register('setPortrait', function(src, payload) return actions.setPortrait(src, payload) end)
register('share',       function(src, payload) return actions.requestShare(src, payload) end)
