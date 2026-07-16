---@type table Marketplace persistence layer (server.marketplace.store): listing row CRUD.
local store = require 'server.marketplace.store'
---@type table Authoritative marketplace handlers (server.marketplace.actions).
local actions = require 'server.marketplace.actions'

-- One-shot boot thread: creates/migrates the marketplace table.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:marketplace]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:marketplace]^0 schema ready')
end)

-- Callbacks: thin delegates into server.marketplace.actions.
lib.callback.register('sd-phone:server:marketplace:list', function(src) return actions.list(src) end)
lib.callback.register('sd-phone:server:marketplace:create', function(src, payload) return actions.create(src, payload) end)
lib.callback.register('sd-phone:server:marketplace:update', function(src, payload) return actions.update(src, payload) end)

---Unwraps { id } before delegating; a non-table payload is coerced to {}.
---@param src integer player server id
---@param payload table|nil { id } (untrusted)
lib.callback.register('sd-phone:server:marketplace:delete', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.delete(src, payload.id)
end)
