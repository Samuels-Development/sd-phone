---@type table Clock persistence layer (server.clock.store): alarm + timer-recents tables.
local store   = require 'server.clock.store'
---@type table Authoritative clock handlers (server.clock.actions): validation + clamping.
local actions = require 'server.clock.actions'

-- Schema bootstrap, once at boot.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:clock]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:clock]^0 schema ready')
end)

-- NUI callbacks: thin delegates into server.clock.actions; delete/add unwrap their single payload field.
lib.callback.register('sd-phone:server:clock:alarms:list', function(src) return actions.listAlarms(src) end)
lib.callback.register('sd-phone:server:clock:alarms:save', function(src, payload) return actions.saveAlarm(src, payload) end)
lib.callback.register('sd-phone:server:clock:alarms:delete', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.deleteAlarm(src, payload.id)
end)
lib.callback.register('sd-phone:server:clock:recents:list', function(src) return actions.listRecents(src) end)
lib.callback.register('sd-phone:server:clock:recents:add', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.addRecent(src, payload.seconds)
end)
