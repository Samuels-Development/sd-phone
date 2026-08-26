---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): source -> identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Authoritative message handlers (server.messages.actions): systemText delivery.
local actions = require 'server.messages.actions'
---@type table sd-phone config root (configs/config.lua): Messages.MaxBodyLength body cap.
local config = require 'configs.config'
---@type table Shared server helpers (server.util): digit/trim sanitizers at the shim boundary.
local util = require 'server.util'
---@type table Settings persistence layer (server.settings.store): number lookups for a broadcast.
local settings = require 'server.settings.store'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---Delivers one text and answers with gksphone's { status, messageId, error } result. sd-phone
---threads by participant pair, so an existing thread is matched from the two numbers alone.
---@param from any sender number, digits
---@param to any recipient number
---@param message any string, vector2 or { x, y } coords table
---@param senderName string|nil banner/thread display name, defaults to the formatted sender number
---@return table result
local function deliver(from, to, message, senderName)
    local sender = shim.digits(from)
    local target = shim.digits(to)
    if not sender or not target then
        return { status = false, error = 'Missing parameters' }
    end

    local body, isLocation = shim.messageBody(message)
    if not body then return { status = false, error = 'Missing parameters' } end
    if isLocation then
        warnOnce('SendMessage.location', ('a GPS-drop message body arrives as plain coordinate text (called by %s); sd-phone has no tappable location bubble in Messages'):format(shim.invoker()))
    end

    local text = util.trim(body)
    local maxBody = config.Messages.MaxBodyLength
    if #text > maxBody then text = text:sub(1, maxBody) end

    local name = (senderName and senderName ~= '' and senderName or util.formatNumber(sender)):sub(1, 64)
    local ok, messageId = actions.systemText(sender, name, target, text)
    if not ok then return { status = false, error = 'Delivery failed' } end
    return { status = true, messageId = messageId }
end

---The short code a free-text service label files its thread under. Its own digits when it has any,
---otherwise a stable hash of the label, so "Delivery" and "LSCustom" never collapse into one thread.
---@param label string
---@return string code
local function codeFor(label)
    local code = shim.digits(label)
    if code then return code end

    local sum = 0
    for i = 1, #label do sum = (sum * 31 + label:byte(i)) % 99999 end
    return tostring(100000 + sum)
end

---One system text, shared by the single-target and broadcast exports.
---@param target any recipient number
---@param message any body
---@param label string free-text sender label
---@return table result
local function systemDeliver(target, message, label)
    return deliver(codeFor(label), target, message, label)
end

---SendMessage(fromNumber, toNumber, message): a text from any number to another.
registerExport('SendMessage', function(fromNumber, toNumber, message)
    return deliver(fromNumber, toNumber, message)
end)

---SendSystemMessage(targetPhoneNumber, message, senderNumber): a system text whose `senderNumber`
---is a free-text label ("Delivery", "LSCustom"). The label becomes the thread header and banner
---title; codeFor picks the short code the thread files under.
registerExport('SendSystemMessage', function(targetPhoneNumber, message, senderNumber)
    local label = shim.text(senderNumber)
    if not label then return { status = false, error = 'Missing parameters' } end
    return systemDeliver(targetPhoneNumber, message, label)
end)

---BroadcastSystemMessage(message, senderNumber): the same system text at every online player,
---answering with gksphone's { status, sentCount }. A player with no number assigned is skipped.
registerExport('BroadcastSystemMessage', function(message, senderNumber)
    local label = shim.text(senderNumber)
    if not label then return { status = false, sentCount = 0 } end

    local sent = 0
    for _, src in ipairs(GetPlayers()) do
        local identity = phones.forSource(tonumber(src))
        local number = identity and settings.getPhoneNumber(identity)
        if number and systemDeliver(number, message, label).status then
            sent = sent + 1
        end
    end
    return { status = sent > 0, sentCount = sent }
end)
