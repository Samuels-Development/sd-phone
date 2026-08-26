---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): IMEI -> source resolution.
local imei = require 'server.compat.yseries.imei'
---@type table sd-phone config root (configs/config.lua): Messages.MaxBodyLength body cap.
local config = require 'configs.config'
---@type table Authoritative message handlers (server.messages.actions): systemText delivery.
local actions = require 'server.messages.actions'
---@type table Shared server helpers (server.util): digit/trim sanitizers for the shim boundary.
local util = require 'server.util'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---Every recipient of a YSeries send, as a digits array. Accepts the single string and the array
---the docs say `participants`/`to` may each carry.
---@param to any
---@return string[]
local function recipients(to)
    local out = {}
    if type(to) == 'table' then
        for i = 1, #to do
            local n = shim.digits(to[i])
            if n then out[#out + 1] = n end
        end
    else
        local n = shim.digits(to)
        if n then out[#out + 1] = n end
    end
    return out
end

---Delivers one system text and returns YSeries' result shape, or nil when nothing was delivered.
---sd-phone has no channel concept, so `channelId` is the synthetic 0 the lb-phone shim also
---reports, and `timestamp` is server time rather than a database echo.
---@param from string sender number, digits
---@param to string recipient number, digits
---@param message any body
---@param attachments any JSON string of attachments, per the YSeries contract
---@return table|nil
local function deliver(from, to, message, attachments)
    if attachments ~= nil then
        warnOnce('SendMessage.attachments', ('message attachments are not supported (called by %s); the text was delivered without them'):format(GetInvokingResource() or 'unknown'))
    end

    local text = util.trim(tostring(message or ''))
    local maxBody = config.Messages.MaxBodyLength
    if #text > maxBody then text = text:sub(1, maxBody) end

    local name = util.formatNumber(from):sub(1, 64)
    local ok, messageId = actions.systemText(from, name, to, text)
    if not ok then return nil end

    return {
        channelId    = 0,
        messageId    = messageId,
        targetSource = imei.toSource(imei.forNumber(to)),
        timestamp    = os.time(),
    }
end

---SendMessageTo(from, to, message, attachments): one-way text from a number to one or many. The
---result reports the LAST delivery when several recipients are given, matching YSeries' single
---result object.
registerExport('SendMessageTo', function(from, to, message, attachments)
    local sender = shim.digits(from)
    if not sender then return nil end

    local result
    for _, target in ipairs(recipients(to)) do
        result = deliver(sender, target, message, attachments) or result
    end
    return result
end)

---SendMessage(participants, message, senderDeviceNumber, senderPhoneImei, channelId, attachments):
---the same delivery addressed by participant array. `channelId` is ignored: sd-phone threads by
---participant pair rather than by channel, so an existing thread is found from the numbers alone.
registerExport('SendMessage', function(participants, message, senderDeviceNumber, senderPhoneImei, channelId, attachments)
    if channelId ~= nil then
        warnOnce('SendMessage.channelId', ('SendMessage channelId is ignored (called by %s); sd-phone threads by participant pair, so the existing thread was matched from the numbers'):format(GetInvokingResource() or 'unknown'))
    end

    local sender = shim.digits(senderDeviceNumber) or imei.toNumber(senderPhoneImei)
    if not sender then return nil end

    local result
    for _, target in ipairs(recipients(participants)) do
        result = deliver(sender, target, message, attachments) or result
    end
    return result
end)
