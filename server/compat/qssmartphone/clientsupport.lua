---@type table Identity translation (server.compat.qssmartphone.identify): scope + own number reads.
local identify = require 'server.compat.qssmartphone.identify'
---@type table Custom-app registry (server.compat.qssmartphone.customapps): the start-up snapshot.
local customapps = require 'server.compat.qssmartphone.customapps'

---@type table Self-export proxy for the sd-phone server call surface.
local sd = exports['sd-phone']

-- Every callback here backs the qs-smartphone compat CLIENT shim (client/compat/qssmartphone.lua),
-- whose exports have to answer questions only the server can, and drive calls that are server-side
-- only in sd-phone.

---Backs the phone:opened payload and getCurrentPhoneNumber-shaped client reads: the caller's own
---number, assigned on first access.
lib.callback.register('sd-phone:server:compat:qs:self', function(source)
    return {
        number = identify.numberOf(source),
        scope  = identify.scopeOf(source),
    }
end)

---Backs the client `call` and PRO `createCall` exports: dials on the caller's behalf and reports
---qs-smartphone's { success } shape.
lib.callback.register('sd-phone:server:compat:qs:dial', function(source, number)
    local result = sd:startCall(source, number)
    return { success = type(result) == 'table' and result.success == true }
end)

---Backs the PRO `endCall` export: hangs up whatever call the caller is in.
lib.callback.register('sd-phone:server:compat:qs:endCall', function(source)
    local result = sd:endCallFor(source)
    return { success = type(result) == 'table' and result.success == true }
end)

---Backs the PRO `getCall` export, which reads names the state bags do not carry.
lib.callback.register('sd-phone:server:compat:qs:call', function(source)
    return sd:getCurrentCall(source)
end)

---Backs the client half's start-up sync: every custom app the server registry already holds, for a
---client that started after the registrations were broadcast.
lib.callback.register('sd-phone:server:compat:qs:customApps', function()
    return customapps.snapshot()
end)
