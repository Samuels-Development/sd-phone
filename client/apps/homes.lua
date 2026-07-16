---@type table Notify bridge (bridge.client.notify): backend-agnostic toast notifications.
local notify = require 'bridge.client.notify'
-- Loaded for side effects: registers the owner-context exec callback for the housing bridge.
require 'bridge.client.housing'

---Lists the caller's owned properties via the server homes callback.
RegisterNUICallback('sd-phone:homes:list', function(_payload, cb)
    cb(lib.callback.await('sd-phone:server:homes:list', false) or { success = false, data = {} })
end)

---Drops a map waypoint at a property's coords; both coords are type-checked and coerced to
---floats.
---@param payload table { x: number, y: number }
RegisterNUICallback('sd-phone:homes:waypoint', function(payload, cb)
    local x = type(payload) == 'table' and tonumber(payload.x) or nil
    local y = type(payload) == 'table' and tonumber(payload.y) or nil
    if not x or not y then return cb({ success = false }) end
    SetNewWaypoint(x + 0.0, y + 0.0)
    notify.show({ description = 'Waypoint set.', type = 'success' })
    cb({ success = true })
end)

-- Thin delegates into server/homes: lock toggling and key management.
RegisterNUICallback('sd-phone:homes:lock', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:homes:lock', false, payload) or { success = false })
end)

RegisterNUICallback('sd-phone:homes:keyHolders', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:homes:keyHolders', false, payload) or { success = false, holders = {} })
end)

RegisterNUICallback('sd-phone:homes:giveKey', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:homes:giveKey', false, payload) or { success = false })
end)

RegisterNUICallback('sd-phone:homes:removeKey', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:homes:removeKey', false, payload) or { success = false })
end)
