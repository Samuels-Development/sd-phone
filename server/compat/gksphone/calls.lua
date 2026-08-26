---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): source -> identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Authoritative call-routing handlers (server.calls.actions): dial/current.
local actions = require 'server.calls.actions'
---@type table Services handlers (server.services.actions): the company roster call.
local services = require 'server.services.actions'
---@type table Settings persistence layer (server.settings.store): participant number lookups.
local settings = require 'server.settings.store'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---A player's live call snapshot ({ channel, phase, number, name, elapsed }) or nil, unwrapped from
---the actions.current envelope.
---@param source any
---@return table|nil
local function currentFor(source)
    if type(source) ~= 'number' then return nil end
    local res = actions.current(source)
    if type(res) == 'table' and res.success then return res.data end
    return nil
end

---CreateCall(source, data): a server-initiated call from a player. `data.number` dials that number;
---`data.job` rings every on-duty member of that company instead, which is what gksphone's job call
---does. `data.hideNumber` warns once: sd-phone has no anonymous-call mode.
---@param source any acting caller's server id
---@param data any gksphone call data
---@return boolean placed
---@return string|nil reason
local function createCall(source, data)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return false, 'invalid_source' end
    if type(data) ~= 'table' then return false, 'invalid_data' end

    if data.hideNumber then
        warnOnce('CreateCall.hideNumber', ('CreateCall hideNumber is not supported (called by %s); the call was placed with the caller number attached'):format(shim.invoker()))
    end

    local job = shim.text(data.job) or shim.text(data.company)
    if job then
        return services.callCompany(src, { job = job }).success == true
    end

    local number = shim.digits(data.number)
    if not number then return false, 'invalid_data' end
    return actions.dial(src, { number = number }).success == true
end

registerExport('CreateCall', createCall)

---IsInCall(source): whether the player is in a call or pending ring, plus gksphone's call id (the
---pma-voice channel on sd-phone) and the call table.
registerExport('IsInCall', function(source)
    local call = currentFor(tonumber(source))
    if not call then return false end
    return true, call.channel, call
end)

---GetCall(callId): gksphone's call record for a channel, or nil when nothing live carries it. The
---first participant found is reported as the caller and the rest as receivers; sd-phone stores no
---per-call originator once the call is up, so which leg placed it is not recoverable here.
registerExport('GetCall', function(callId)
    local channel = tonumber(callId)
    if not channel then return nil end

    local caller, receivers = nil, {}
    for _, raw in ipairs(GetPlayers()) do
        local src = tonumber(raw)
        local call = src and currentFor(src)
        if call and call.channel == channel then
            local identity = phones.forSource(src)
            local number = identity and settings.getPhoneNumber(identity) or call.number
            if caller then
                receivers[#receivers + 1] = {
                    receiverSource    = src,
                    receiverPhone     = number,
                    receiverPhoneUniq = identity,
                    is_accepts        = call.phase == 'active',
                }
            else
                caller = { source = src, phone = number, uniq = identity, phase = call.phase }
            end
        end
    end
    if not caller then return nil end

    return {
        callerSource    = caller.source,
        callerPhone     = caller.phone,
        callerPhoneUniq = caller.uniq,
        calltype        = 'calling',
        time            = os.time(),
        status          = caller.phase == 'active' and 'active' or 'calling',
        is_anonymous    = false,
        isJob           = false,
        receivers       = receivers,
    }
end)

---EndCall(source): hangs up whatever call the player is in. Idempotent.
registerExport('EndCall', function(source)
    local src = tonumber(source)
    if not src then return false end
    return sd:endCallFor(src).success == true
end)

-- Returned so the client-support half can place a call without going back out through the export
-- registry, which would resolve to the real gksphone the moment this shim deregisters.
return { createCall = createCall, currentFor = currentFor }
