---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): YSeries IMEI <-> sd-phone identity.
local imei = require 'server.compat.yseries.imei'
---@type table Authoritative call-routing handlers (server.calls.actions): dial/current/hangup.
local actions = require 'server.calls.actions'
---@type table Contacts persistence layer (server.contacts.store): identity-keyed blocks, contacts
---and call history, which is the shape YSeries addresses by IMEI even while the owner is offline.
local contacts = require 'server.contacts.store'
---@type table Player bridge (bridge.server.player): source resolution from an identity.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): the contact avatar colour picker.
local util = require 'server.util'

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---The player's live call snapshot ({ channel, phase, number, name, elapsed }) or nil, unwrapped
---from the actions.current envelope.
---@param source any
---@return table|nil
local function currentFor(source)
    if type(source) ~= 'number' then return nil end
    local res = actions.current(source)
    if type(res) == 'table' and res.success then return res.data end
    return nil
end

---CallContact(targetNumber, targetPlayerId, callerNumber, callerPlayerId, anonymousCall): places a
---1:1 call and returns YSeries' call-data shape, nil when it could not be placed. sd-phone has no
---anonymous-call mode, so that flag warns once and the call goes out attributed.
registerExport('CallContact', function(targetNumber, targetPlayerId, callerNumber, callerPlayerId, anonymousCall)
    if anonymousCall then
        warnOnce('CallContact.anonymous', ('CallContact anonymousCall is not supported (called by %s); the call was placed with the caller number attached'):format(GetInvokingResource() or 'unknown'))
    end

    local src = tonumber(callerPlayerId)
    if not src then
        local identity = imei.forNumber(callerNumber)
        src = identity and player.getAnySourceByIdentifier(identity) or nil
    end
    if not src or not GetPlayerName(src) then return nil end

    local number = shim.digits(targetNumber)
    if not number then return nil end

    local res = actions.dial(src, { number = number })
    if not res.success then return nil end

    return {
        callId       = res.data.channel,
        caller       = shim.digits(callerNumber),
        target       = number,
        callerSource = src,
        targetSource = tonumber(targetPlayerId) or imei.toSource(imei.forNumber(number)),
    }
end)

---EndCall(callId): ends the call carrying `callId`, which on sd-phone is the pma-voice channel.
---Resolves a participant from the channel, since hangup is driven from a source.
registerExport('EndCall', function(callId)
    local channel = tonumber(callId)
    if not channel then return false end

    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        local call = s and currentFor(s)
        if call and call.channel == channel then
            return actions.hangup(s, { channel = channel }).success == true
        end
    end
    return false
end)

---IsInCall(playerId): whether the player is in a call or pending group ring, plus the channel as
---the call id second return.
registerExport('IsInCall', function(playerId)
    local call = currentFor(tonumber(playerId))
    if not call then return false end
    return true, call.channel
end)

---CanReceiveCalls(playerId): whether a call placed to this player would ring. False while they are
---already in one, in airplane mode, out of service, or have no phone identity.
registerExport('CanReceiveCalls', function(playerId)
    local src = tonumber(playerId)
    if not src or not GetPlayerName(src) then return false end
    if currentFor(src) then return false end

    local identity = imei.forSource(src)
    if not identity then return false end
    if sd:isAirplaneMode(src) then return false end
    return sd:isNumberInService(imei.toNumber(identity)) ~= false
end)

---GetCallData(callId): every participant snapshot for a channel, as an array. Empty when the
---channel carries no live call.
registerExport('GetCallData', function(callId)
    local channel = tonumber(callId)
    if not channel then return {} end

    local out = {}
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        local call = s and currentFor(s)
        if call and call.channel == channel then
            out[#out + 1] = {
                callId = channel,
                source = s,
                number = call.number,
                name   = call.name,
                phase  = call.phase,
                elapsed = call.elapsed,
            }
        end
    end
    return out
end)

---RemovePlayerFromServerCall(playerSourceId): drops one participant from whatever call they are
---in, leaving the rest of the call standing where sd-phone supports it.
registerExport('RemovePlayerFromServerCall', function(playerSourceId)
    local src = tonumber(playerSourceId)
    local call = currentFor(src)
    if not call then return end
    actions.hangup(src, { channel = call.channel })
end)

---BlockContact(contactData, phoneImei): blocks or unblocks a number for the IMEI's owner. Driven
---through the contacts STORE rather than the source-keyed export, because YSeries addresses the
---owner by IMEI and that owner is frequently offline.
registerExport('BlockContact', function(contactData, phoneImei)
    if type(contactData) ~= 'table' then return false end
    local identity = (type(phoneImei) == 'string' and phoneImei ~= '') and phoneImei or nil
    local number = shim.digits(contactData.phoneNumber)
    if not identity or not number then return false end

    if contactData.isBlocked == false then
        contacts.unblockNumber(identity, number)
    else
        contacts.blockNumber(identity, number)
    end
    return true
end)

---GetBlockedNumbers(phoneImei): every number the IMEI's owner has blocked, as an array.
registerExport('GetBlockedNumbers', function(phoneImei)
    local identity = (type(phoneImei) == 'string' and phoneImei ~= '') and phoneImei or nil
    if not identity then return {} end

    local out = {}
    for _, row in ipairs(contacts.listBlocked(identity) or {}) do
        out[#out + 1] = type(row) == 'table' and (row.number or row.phone) or row
    end
    return out
end)

---AddContact(phoneNumber, data): saves a contact into the address book of the number's owner. Goes
---to the store for the same reason BlockContact does, and mints its own row id.
registerExport('AddContact', function(phoneNumber, data)
    if type(data) ~= 'table' then return false end
    local identity = imei.forNumber(phoneNumber)
    local number = shim.digits(data.number)
    if not identity or not number then return false end

    local name = type(data.name) == 'string' and data.name ~= '' and data.name or number
    local ok = pcall(function()
        contacts.insertContact(contacts.newId(), identity, {
            name  = name,
            phone = number,
            color = util.colorFor(name),
        })
    end)
    return ok
end)

---AddRecentCall(toNumber, phoneImei, callType, anonymousCall): writes a call-history row for the
---IMEI's owner. `callType` is one of outgoing, incoming, missed; anything else counts as outgoing.
registerExport('AddRecentCall', function(toNumber, phoneImei, callType, _anonymousCall)
    local identity = (type(phoneImei) == 'string' and phoneImei ~= '') and phoneImei or nil
    local number = shim.digits(toNumber)
    if not identity or not number then return nil end

    local direction = (callType == 'incoming' or callType == 'missed') and callType or 'outgoing'
    local id = contacts.newId()
    local ok = pcall(function()
        contacts.insertCall(id, identity, {
            number    = number,
            direction = direction,
            duration  = 0,
            calledAt  = os.time(),
        })
    end)
    return ok and id or nil
end)

-- sd-phone reads its call cadence from configs/phone.lua rather than publishing a call config
-- table, so the two documented keys are answered from there and the rest is absent.
stubExport('GetCallConfig', { CallRepeats = 1, RepeatTimeout = 0 },
    'has no sd-phone equivalent: ring cadence lives in configs/phone.lua')
