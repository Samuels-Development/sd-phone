---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'

---@type table<string, function[]> Registered call interceptors by digit-normalised phone number.
---Bookkeeping only: sd-phone rings a call straight through, so nothing ever consults these.
local interceptors = {}

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---@type table Self-export proxy for the sd-phone server call surface.
local sd = exports['sd-phone']

---registerCallInterceptor(phoneNumber, callback): records an interceptor for a number.
---
---sd-phone's call pipeline has no pre-ring hook: a dial goes to the recipient's phone directly, so
---the callback is never invoked and the call rings normally. The registration is still kept so
---hasCallInterceptor and getRegisteredCallInterceptors report the truth about what was asked for.
registerExport('registerCallInterceptor', function(phoneNumber, callback)
    local number = shim.digits(phoneNumber)
    if not number or type(callback) ~= 'function' then return false end

    warnOnce('registerCallInterceptor', ('call interception is not supported (registered by %s); sd-phone rings a call straight through to the recipient with no pre-ring hook, so the interceptor was recorded but will never be called and every call to that number rings normally'):format(GetInvokingResource() or 'unknown'))

    local list = interceptors[number]
    if not list then
        list = {}
        interceptors[number] = list
    end
    list[#list + 1] = callback
    return true
end)

---unregisterCallInterceptor(phoneNumber): drops every interceptor recorded for a number.
registerExport('unregisterCallInterceptor', function(phoneNumber)
    local number = shim.digits(phoneNumber)
    if not number then return false end
    local had = interceptors[number] ~= nil
    interceptors[number] = nil
    return had
end)

---hasCallInterceptor(phoneNumber): whether the number has one or more interceptors recorded.
registerExport('hasCallInterceptor', function(phoneNumber)
    local number = shim.digits(phoneNumber)
    return number ~= nil and interceptors[number] ~= nil
end)

---getRegisteredCallInterceptors(): every number with interceptors recorded, keyed by number so a
---caller's `for number in pairs(...)` reads the same as it does on qs-smartphone.
registerExport('getRegisteredCallInterceptors', function()
    local out = {}
    for number, list in pairs(interceptors) do out[number] = #list end
    return out
end)

-- The four session-addressed interceptor controls have nothing to address: no call is ever held,
-- so no intercepted session id exists. Each returns the type-correct "no such session" answer.
stubExport('acceptInterceptedCall', false,
    'has no sd-phone equivalent: no call is ever held for interception, so there is no session to accept')
stubExport('rejectInterceptedCall', false,
    'has no sd-phone equivalent: no call is ever held for interception, so there is no session to reject; block the number from the Phone app instead')
stubExport('letInterceptedCallRing', false,
    'has no sd-phone equivalent: sd-phone already rings every call straight through, which is what this releases a call to do')
stubExport('getInterceptedCallData', nil,
    'has no sd-phone equivalent: no call is ever held for interception, so there is no session to read')

---isPlayerInCall(source): whether the player is in an active call or a pending ring.
registerExport('isPlayerInCall', function(source)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return false end
    return sd:isInCall(src) == true
end)

---getActiveCallSession(source): the player's live call, or nil. sd-phone's channel is the session
---id, and `phase` carries the ringing/active state under qs-smartphone's `state` name as well.
registerExport('getActiveCallSession', function(source)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return nil end

    local call = sd:getCurrentCall(src)
    if type(call) ~= 'table' then return nil end

    return {
        id           = call.channel,
        sessionId    = call.channel,
        state        = call.phase,
        phase        = call.phase,
        callerNumber = call.number,
        name         = call.name,
        elapsed      = call.elapsed,
    }
end)

---endCallBySource(source): hangs up whatever call the player is in. Idempotent.
registerExport('endCallBySource', function(source)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return false end
    local result = sd:endCallFor(src)
    return type(result) == 'table' and result.success == true
end)
