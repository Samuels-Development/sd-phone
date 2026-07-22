---@type table Shared shim helpers (server.compat.lbphone.shared): export registration + warn-once.
local shim = require 'server.compat.lbphone.shared'
---@type table Authoritative call-routing handlers (server.calls.actions): dial/current/hangup.
local actions = require 'server.calls.actions'
---@type table Player bridge (bridge.server.player): source resolution from a citizenid.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): number -> citizenid resolution.
local settings = require 'server.settings.store'

local registerLbExport, stubLbExport, warnOnce = shim.registerLbExport, shim.stubLbExport, shim.warnOnce

---The caller's live call snapshot ({ channel, phase, number, name, elapsed }) or nil, unwrapped
---from the actions.current envelope.
---@param source any
---@return table|nil
local function currentFor(source)
    if type(source) ~= 'number' then return nil end
    local res = actions.current(source)
    if type(res) == 'table' and res.success then return res.data end
    return nil
end

---CreateCall(caller { source, phoneNumber }, callee?, options?): starts a 1:1 call through
---actions.dial, resolving the caller by source then phoneNumber. Returns the pma-voice channel
---as the call id, nil when the call could not be placed.
registerLbExport('CreateCall', function(caller, callee, options)
    if type(caller) ~= 'table' then return nil end
    if type(options) == 'table' and (options.company ~= nil or options.hideNumber ~= nil) then
        warnOnce('CreateCall.options', ('CreateCall options.company/hideNumber are not supported (called by %s); the call was placed as a plain 1:1 call'):format(GetInvokingResource() or 'unknown'))
    end

    local src = tonumber(caller.source)
    if not src then
        local cid = settings.getCitizenByNumber(caller.phoneNumber)
        src = cid and player.getSourceByIdentifier(cid) or nil
    end
    if not src or not GetPlayerName(src) then return nil end

    local number = type(callee) == 'table' and callee.phoneNumber or callee
    local res = actions.dial(src, { number = number })
    return res.success and res.data.channel or nil
end)

---EndCall(source): ends whatever call the player is in, resolving their own channel through
---actions.current and hanging up through actions.hangup. Not being in a call is success.
registerLbExport('EndCall', function(source)
    if type(source) ~= 'number' then return false end
    local call = currentFor(source)
    if not call then return true end
    return actions.hangup(source, { channel = call.channel }).success == true
end)

---IsInCall(source): whether the player is in a call or pending group ring, plus the channel as
---the call id second return. lb's third return (the raw call object) is not honoured.
registerLbExport('IsInCall', function(source)
    local call = currentFor(source)
    if not call then return false end
    return true, call.channel
end)

stubLbExport('GetCall', nil, 'is not supported: sd-phone call sessions are not addressable by id')
