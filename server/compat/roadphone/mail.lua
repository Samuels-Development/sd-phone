---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Shared server helpers (server.util): trim at the shim boundary.
local util = require 'server.util'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table Mail module; the table returned at end of file, so the client half's support handler
---delivers through exactly the same path the export does.
local mail = {}

---Delivers one RoadPhone mail to whichever mailbox a character owns. Their first registered account
---in creation order is the inbox, matching how sd-phone itself addresses a character.
---
---`button` (an action row) is dropped and warns once: sd-phone mail carries attachments, not
---event-firing buttons.
---@param identifier any framework per-character id
---@param mailData any RoadPhone mail table { senderMail, subject, message, button? }
---@return boolean delivered
function mail.sendOffline(identifier, mailData)
    if type(identifier) ~= 'string' or identifier == '' then return false end
    if type(mailData) ~= 'table' then return false end

    if mailData.button ~= nil then
        warnOnce('sendMailOffline.button', ('sendMailOffline action buttons are not supported (called by %s); the mail was delivered without one'):format(GetInvokingResource() or 'unknown'))
    end

    local accounts = sd:getMailAddresses(identifier) or {}
    local address = accounts[1] and accounts[1].email or nil
    if not address then return false end

    local result = sd:sendMail({
        to      = address,
        subject = util.trim(mailData.subject),
        body    = util.trim(mailData.message),
        from    = { email = mailData.senderMail, name = mailData.senderName },
    })
    return type(result) == 'table' and result.success == true and (result.delivered or 0) > 0
end

---sendMailOffline(identifier, mailData): system mail addressed by framework identifier, delivered
---whether or not the character is connected. The client export of the same name shares this path.
registerExport('sendMailOffline', function(identifier, mailData)
    mail.sendOffline(identifier, mailData)
end)

return mail
