---@type table Notes persistence layer (server.notes.store): per-citizenid note row CRUD.
local store   = require 'server.notes.store'
---@type table Authoritative Notes handlers (server.notes.actions): citizenid scoping, input
---clamping and envelope responses.
local actions = require 'server.notes.actions'
---@type table AirShare core (server.share.core): nearby/phone-open share request handshake.
local share   = require 'server.share.core'

-- Delivers an accepted note AirShare into the recipient's Notes.
share.registerHandler('note', actions.deliverShare)

-- Boot-time schema bootstrap.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:notes]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:notes]^0 schema ready')
end)

-- NUI callbacks: thin delegates into server.notes.actions; shims normalize non-table payloads.
lib.callback.register('sd-phone:server:notes:list', function(src)
    return actions.list(src)
end)

lib.callback.register('sd-phone:server:notes:save', function(src, payload)
    return actions.save(src, payload)
end)

lib.callback.register('sd-phone:server:notes:delete', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.delete(src, payload.id)
end)

lib.callback.register('sd-phone:server:notes:share', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.requestShare(src, payload.target, payload)
end)
