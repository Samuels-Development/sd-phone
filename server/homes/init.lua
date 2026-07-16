---@type table Housing bridge (bridge.server.housing): cross-resource housing-system detection,
---per-system property normalisation + action dispatch (lock/keys), and capability flags.
local housing = require 'bridge.server.housing'

---Property list plus the active system's capability flags. Read-only; a disabled/undetected
---system degrades to an empty array.
lib.callback.register('sd-phone:server:homes:list', function(src)
    return { success = true, data = housing.list(src), caps = housing.capabilities() }
end)

---Toggles the front-door lock. `data.lock` is the desired state; returns the resulting locked
---boolean, nil when the system has no lock API.
lib.callback.register('sd-phone:server:homes:lock', function(src, data)
    if type(data) ~= 'table' then data = nil end
    local locked = housing.lock(src, data and data.id, data and data.lock)
    return { success = locked ~= nil, locked = locked }
end)

---List who holds a key to the property ({ id = citizenid, name }). Read-only; degrades to an
---empty array when the system exposes no key-list API.
lib.callback.register('sd-phone:server:homes:keyHolders', function(src, data)
    if type(data) ~= 'table' then data = nil end
    return { success = true, holders = housing.keyHolders(src, data and data.id) }
end)

---Grants a key to an online player (data.target = recipient server id, coerced to a number in
---the bridge).
lib.callback.register('sd-phone:server:homes:giveKey', function(src, data)
    if type(data) ~= 'table' then data = nil end
    return { success = housing.giveKey(src, data and data.id, data and data.target) }
end)

---Revokes a key holder (data.holder = their citizenid, as returned by keyHolders).
lib.callback.register('sd-phone:server:homes:removeKey', function(src, data)
    if type(data) ~= 'table' then data = nil end
    return { success = housing.removeKey(src, data and data.id, data and data.holder) }
end)

---Boot report: prints the housing system the bridge detected.
CreateThread(function()
    Wait(300)
    print(('^2[sd-phone:homes]^0 ready — system: ^3%s^0'):format(housing.activeSystem() or 'none'))
end)
