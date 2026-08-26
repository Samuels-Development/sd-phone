---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): source/identifier -> identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Authoritative mail handlers (server.mail.actions): systemSend validation + fan-out.
local actions = require 'server.mail.actions'
---@type table Mail persistence layer (server.mail.store): account lookups by identity.
local store = require 'server.mail.store'
---@type table Shared server helpers (server.util): trim at the shim boundary.
local util = require 'server.util'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---The mail address to deliver to for one identity: their first registered account in creation
---order. Nil when that identity never made one.
---@param identity string|nil
---@return string|nil
local function addressFor(identity)
    if not identity then return nil end
    local accounts = store.listAccountsForCitizen(identity)
    return accounts[1] and accounts[1].email or nil
end

---Warns once when a caller attaches action buttons. gksphone carries two incompatible button
---shapes - the V2 server's plural `buttons` array and the singular `button` table V1 and the V2
---client both use - and sd-phone mail renders neither, so both spellings are checked and dropped.
---@param mailData table
local function checkButtons(mailData)
    if mailData.buttons == nil and mailData.button == nil then return end
    warnOnce('SendNewMail.buttons', ('mail action buttons are not supported (called by %s); the mail was delivered with its text and attachments but no buttons'):format(shim.invoker()))
end

---Turns a gksphone MailData into sd-phone's systemSend payload. `image` is the sender avatar on
---gksphone and has no sd-phone counterpart, so it is dropped; `attachments` are URL strings, which
---sd-phone accepts as photo shorthand.
---@param address string recipient mail address
---@param mailData table
---@return table payload
local function payloadFor(address, mailData)
    local sender = shim.text(mailData.sender) or 'System'
    return {
        to          = address,
        subject     = shim.text(mailData.subject),
        body        = util.trim(tostring(mailData.message or '')),
        from        = { name = sender },
        attachments = type(mailData.attachments) == 'table' and mailData.attachments or nil,
    }
end

---SendNewMail(src, MailData): mail to a connected player's first mailbox.
---@param src any recipient player's server id
---@param MailData any gksphone mail payload
---@return boolean sent
local function sendMail(src, MailData)
    if type(MailData) ~= 'table' then return false end
    checkButtons(MailData)

    local address = addressFor(phones.forSource(tonumber(src)))
    if not address then return false end
    return actions.systemSend(payloadFor(address, MailData)).success == true
end

registerExport('SendNewMail', sendMail)

---SendNewMailOffline(citizenID, MailData): the same mail addressed by identity rather than source,
---so it lands for a player who is not connected. citizenID is the QB citizenid or ESX identifier.
registerExport('SendNewMailOffline', function(citizenID, MailData)
    if type(MailData) ~= 'table' then return false end
    checkButtons(MailData)

    local address = addressFor(phones.forIdentifier(shim.text(citizenID)))
    if not address then return false end
    return actions.systemSend(payloadFor(address, MailData)).success == true
end)

-- Returned so the client-support half can post mail without going back out through the export
-- registry, which would resolve to the real gksphone the moment this shim deregisters.
return { sendMail = sendMail }
