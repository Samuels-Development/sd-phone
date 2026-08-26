---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): recipient resolution.
local imei = require 'server.compat.yseries.imei'
---@type table Authoritative mail handlers (server.mail.actions): systemSend validation + fan-out.
local actions = require 'server.mail.actions'
---@type table Mail persistence layer (server.mail.store): account lookups by identity.
local store = require 'server.mail.store'
---@type table Shared server helpers (server.util): trim at the shim boundary.
local util = require 'server.util'

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---The mail address to deliver to for one identity: their first registered account in creation
---order. Nil when the identity never made one.
---@param identity string|nil
---@return string|nil
local function addressFor(identity)
    if not identity then return nil end
    local accounts = store.listAccountsForCitizen(identity)
    return accounts[1] and accounts[1].email or nil
end

---SendMail(email, receiverType, receiver): system mail addressed by source, phone number, IMEI or
---'all'. Returns YSeries' (insertId, received) pair.
---
---`actions` (button rows) are not supported and warn once. `receiverType = 'all'` fans out over
---every identity with a mailbox, which is the closest sd-phone has to a broadcast.
registerExport('SendMail', function(email, receiverType, receiver)
    if type(email) ~= 'table' then return nil, false end
    if email.actions ~= nil then
        warnOnce('SendMail.actions', ('SendMail action buttons are not supported (called by %s); the mail was sent without them'):format(GetInvokingResource() or 'unknown'))
    end

    local payload = {
        subject     = email.title,
        body        = util.trim(type(email.content) == 'number' and tostring(email.content) or email.content),
        from        = { name = email.senderDisplayName, address = email.sender },
        attachments = email.attachments,
    }

    if receiverType == 'all' then
        warnOnce('SendMail.all', ("SendMail receiverType 'all' reaches every mailbox one send at a time (called by %s); sd-phone has no broadcast mail path"):format(GetInvokingResource() or 'unknown'))
        local sent = false
        for _, address in ipairs(store.listAllAddresses and store.listAllAddresses() or {}) do
            payload.to = address
            sent = actions.systemSend(payload).success == true or sent
        end
        return nil, sent
    end

    local address = addressFor(imei.resolveRecipient(receiverType, receiver))
    if not address then return nil, false end

    payload.to = address
    local result = actions.systemSend(payload)
    return result.success and result.data and result.data.id or nil, result.success == true
end)

-- sd-phone deletes mail through the owner's own mailbox action rather than by a global row id,
-- so there is no id-addressed delete to answer with.
stubExport('DeleteMail', false,
    'is not supported: sd-phone mail is deleted through the owner\'s mailbox, not by a global id')
