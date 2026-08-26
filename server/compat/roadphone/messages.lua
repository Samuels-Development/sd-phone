---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Player bridge (bridge.server.player): source -> acting identity.
local player = require 'bridge.server.player'
---@type table Authoritative message handlers (server.messages.actions): list + system delivery.
local actions = require 'server.messages.actions'
---@type table Message persistence layer (server.messages.store): read marking.
local store = require 'server.messages.store'
---@type table Shared server helpers (server.util): trim + number formatting at the shim boundary.
local util = require 'server.util'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---Delivers one text from a number to a number, the way RoadPhone's server-side sendMessage does:
---sender-first, online or offline, and false rather than an error on a malformed call.
---
---A sender number held by a CONNECTED character goes through the phone's own composer, so both
---halves of the conversation are written and the sender's Messages app shows what it sent. Only an
---offline or unowned sender number falls back to the one-way system text, which writes the
---recipient's copy alone.
---@param from any sender number
---@param to any recipient number
---@param message any body
---@return boolean delivered
local function deliver(from, to, message)
    local sender, target = shim.digits(from), shim.digits(to)
    if not sender or not target or sender == target then return false end

    local body = util.trim(type(message) == 'number' and tostring(message) or message)
    if type(body) ~= 'string' or body == '' then return false end

    local src = sd:getSourceByNumber(sender)
    if src then
        local result = sd:sendMessage(src, { conversation = target, body = body })
        if type(result) == 'table' and result.success == true then return true end
        warnOnce('sendMessage.refused', ('sendMessage was refused for a connected sender (called by %s); the phone\'s composer runs the same airplane-mode, service and moderation gates a player faces, and nothing was delivered'):format(GetInvokingResource() or 'unknown'))
        return false
    end

    warnOnce('sendMessage.oneway', ('sendMessage wrote only the recipient\'s copy (called by %s); the sender number belongs to nobody connected, so there is no outgoing mailbox to write the sent copy into'):format(GetInvokingResource() or 'unknown'))
    return sd:sendSystemMessage(sender, util.formatNumber(sender), target, body) == true
end

---sendMessage(senderNumber, receiverNumber, message): the SERVER three-argument form, writing both
---sides of the conversation whenever the sender number is held by a connected character. The client
---export of the same name takes (recipient, body) and lives in client/compat/roadphone.lua.
registerExport('sendMessage', function(senderNumber, receiverNumber, message)
    return deliver(senderNumber, receiverNumber, message)
end)

---GetPhoneMessages(source): the player's conversations. RoadPhone hands back a flat metadata array
---where sd-phone threads by conversation, so the rows are sd-phone's own serialized conversations
---rather than RoadPhone's message shape.
registerExport('GetPhoneMessages', function(source)
    local src = shim.source(source)
    if not src then return {} end
    warnOnce('GetPhoneMessages', ('GetPhoneMessages returns sd-phone conversations rather than RoadPhone\'s flat metadata message rows (called by %s); the field names differ'):format(GetInvokingResource() or 'unknown'))

    local result = actions.list(src)
    return result.success and result.data and result.data.conversations or {}
end)

---AddMessageToMetadata(source, message): writes a text onto the phone the player is holding. The
---message is delivered as a real system text so it lands in the thread and rings the banner,
---rather than being spliced into an item's metadata.
registerExport('AddMessageToMetadata', function(source, message)
    local src = shim.source(source)
    if not src or type(message) ~= 'table' then return false end

    local target = shim.digits(sd:getPhoneNumber(src))
    if not target then return false end

    local sender = shim.digits(message.sender or message.number) or target
    local name = type(message.name) == 'string' and message.name or util.formatNumber(sender)
    local body = util.trim(message.message or message.content or message.body)
    if type(body) ~= 'string' or body == '' then return false end

    return sd:sendSystemMessage(sender, name, target, body) == true
end)

---AddMessageToMetadataForNumber(source, phoneNumber, message): the same write addressed at whoever
---owns a number rather than at the phone in hand. `source` is only the caller's context here, so it
---is not required to resolve.
registerExport('AddMessageToMetadataForNumber', function(_source, phoneNumber, message)
    if type(message) ~= 'table' then return false end
    local sender = message.sender or message.number
    return deliver(sender or phoneNumber, phoneNumber, message.message or message.content or message.body)
end)

---MarkMessagesReadInMetadata(source, phoneNumber): clears the unread flag on one conversation.
registerExport('MarkMessagesReadInMetadata', function(source, phoneNumber)
    local src = shim.source(source)
    local conversation = shim.digits(phoneNumber)
    local cid = src and player.getIdentifier(src) or nil
    if not cid or not conversation then return false end

    store.markThreadRead(cid, conversation)
    return true
end)

-- Bulk metadata writes have no counterpart: sd-phone's messages are rows owned by each mailbox,
-- correlated across participants, so replacing the whole list from outside would desynchronise
-- every other copy of those threads.
stubExport('UpdatePhoneMessages', false,
    'cannot replace a whole mailbox: sd-phone stores one message row per participant, so a wholesale rewrite would desynchronise the other side of every thread')
stubExport('ClearGroupUnreadInMetadata', false,
    'has no sd-phone counterpart: group unread counts are derived from the stored rows rather than kept as a metadata badge')
