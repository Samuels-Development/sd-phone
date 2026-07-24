---@type table Pages persistence layer (server.pages.store): post row CRUD.
local store = require 'server.pages.store'
---@type table Authoritative pages handlers (server.pages.actions).
local actions = require 'server.pages.actions'
---@type table Watcher registry (server.watchers): shared with the feed broadcast in actions.
local watchers = require('server.watchers').of('pages')

-- One-shot boot thread: creates/migrates the pages table.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:pages]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:pages]^0 schema ready')
end)

-- Callbacks: thin delegates into server.pages.actions.
lib.callback.register('sd-phone:server:pages:list', function(src) return actions.list(src) end)
lib.callback.register('sd-phone:server:pages:create', function(src, payload) return actions.create(src, payload) end)
lib.callback.register('sd-phone:server:pages:update', function(src, payload) return actions.update(src, payload) end)

---Unwraps { id } before delegating; a non-table payload is coerced to {}.
---@param src integer player server id
---@param payload table|nil { id } (untrusted)
lib.callback.register('sd-phone:server:pages:delete', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.delete(src, payload.id)
end)

---Subscribes or unsubscribes the caller to the live feed push while the app is open.
---@param src integer player server id
---@param payload table { on: boolean }
lib.callback.register('sd-phone:server:pages:watch', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    watchers.watch(src, payload.on == true)
    return { success = true }
end)

---Drops a departing watcher's entry.
AddEventHandler('playerDropped', function()
    watchers.drop(source)
end)
