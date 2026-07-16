---@type table Shared shim helpers (server.compat.lbphone.shared): export registration + warn-once.
local shim = require 'server.compat.lbphone.shared'
---@type table sd-phone config root (configs/config.lua): Messages.MaxBodyLength body cap.
local config = require 'configs.config'
---@type table Authoritative message handlers (server.messages.actions): systemText delivery.
local actions = require 'server.messages.actions'
---@type table Shared server helpers (server.util): digit/trim sanitizers for the shim boundary.
local util = require 'server.util'

local registerLbExport, warnOnce = shim.registerLbExport, shim.warnOnce

---Coerces an export argument to a trimmed string: integral floats format without the decimal,
---other numbers stringify, any other non-string becomes ''.
---@param v any
---@return string
local function str(v)
    if math.type(v) == 'float' and v % 1 == 0 then
        v = ('%.0f'):format(v)
    elseif type(v) == 'number' then
        v = tostring(v)
    end
    return util.trim(v)
end

---Delivers a one-way system text with digit-normalised numbers, a capped body, and a display
---name derived from the sending number.
---@param from string|number sending number
---@param to string|number recipient number
---@param body string|number message body
---@param opts table|nil presentation-safe kind + meta (see actions.systemText)
---@return boolean delivered
---@return string|nil messageId id of the recipient's message row when delivered
local function deliver(from, to, body, opts)
    local sender = util.digits(str(from)):sub(1, 32)
    local target = util.digits(str(to))
    if sender == '' or target == '' then return false end

    local name = util.formatNumber(sender):sub(1, 64)
    local text = str(body)
    local maxBody = config.Messages.MaxBodyLength
    if #text > maxBody then text = text:sub(1, maxBody) end

    return actions.systemText(sender, name, target, text, opts)
end

---SendMessage(from, to, message, attachments?, cb?, channelId?): recipient-side system text; the
---first attachment rides as an image bubble, further URLs append to the body, channelId is ignored.
---Returns { channelId = 0 (synthetic), messageId } on delivery, nil on failure; `cb` receives the same.
registerLbExport('SendMessage', function(from, to, message, attachments, cb, channelId)
    if channelId ~= nil then
        warnOnce('SendMessage.channelId', ('SendMessage channelId is not supported (called by %s); the message was sent as a plain number-to-number text'):format(GetInvokingResource() or 'unknown'))
    end

    local urls = {}
    if type(attachments) == 'table' then
        for i = 1, #attachments do
            if type(attachments[i]) == 'string' and attachments[i] ~= '' then
                urls[#urls + 1] = attachments[i]
            end
        end
    end

    local text = str(message)
    for i = 2, #urls do
        text = text == '' and urls[i] or (text .. '\n' .. urls[i])
    end

    local delivered, messageId = deliver(from, to, text, urls[1] and { kind = 'image', gifUrl = urls[1] } or nil)
    local result = nil
    if delivered then
        warnOnce('SendMessage.return', ('SendMessage returns a synthetic channelId of 0 (called by %s); sd-phone has no channel ids'):format(GetInvokingResource() or 'unknown'))
        result = { channelId = 0, messageId = messageId or 0 }
    end
    if type(cb) == 'function' then pcall(cb, result) end
    return result
end)

---SendCoords(from, to, coords): delivers the coordinates as a plain readable text. Accepts a
---vector or an {x, y} / array-style table.
registerLbExport('SendCoords', function(from, to, coords)
    local ctype = type(coords)
    local x, y
    if ctype == 'vector2' or ctype == 'vector3' or ctype == 'vector4' then
        x, y = coords.x, coords.y
    elseif ctype == 'table' then
        x, y = tonumber(coords.x or coords[1]), tonumber(coords.y or coords[2])
    end
    if not util.finite(x) or not util.finite(y) then return false end
    return deliver(from, to, ('Location: %.1f, %.1f'):format(x, y))
end)

---SentMoney(from, to, amount): delivered as a plain 'Sent $X' text; the downgrade is warned once.
registerLbExport('SentMoney', function(from, to, amount)
    local n = tonumber(amount)
    if not util.finite(n) then return false end
    warnOnce('SentMoney', ('SentMoney delivers as a plain text message (called by %s); sd-phone payment cards are banking-validated and cannot be minted by other resources'):format(GetInvokingResource() or 'unknown'))
    local rendered = n % 1 == 0 and ('%d'):format(n) or ('%.2f'):format(n)
    return deliver(from, to, ('Sent $%s'):format(rendered))
end)
