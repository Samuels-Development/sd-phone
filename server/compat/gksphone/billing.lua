---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): identifier -> phone identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Business-invoice persistence (server.services.invoicestore): the invoice rows both
---the Services and Banking apps bill from.
local invoicestore = require 'server.services.invoicestore'
---@type table Settings persistence layer (server.settings.store): party numbers on the invoice row.
local settings = require 'server.settings.store'
---@type table Player bridge (bridge.server.player): identity + character-name resolution.
local player = require 'bridge.server.player'

local registerExport = shim.registerExport

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---NewBilling(src, label, society, senderBilling, senderID, amount): files an unpaid invoice against
---the player at `src` on behalf of a company. The row lands in the same table the Services and
---Banking apps bill from, so the target settles it from their own phone exactly as they would any
---other business invoice.
registerExport('NewBilling', function(src, label, society, senderBilling, senderID, amount)
    local source = tonumber(src)
    local value = math.floor(tonumber(amount) or 0)
    if not source or value <= 0 then return false end

    local targetCid = player.getIdentifier(source)
    if not targetCid then return false end

    local senderCid = shim.text(senderID) or shim.text(society) or 'system'
    invoicestore.insert({
        id           = invoicestore.newId(),
        job          = shim.text(society),
        label        = shim.text(label),
        senderCid    = senderCid,
        senderName   = shim.text(senderBilling),
        senderNumber = settings.getPhoneNumber(senderCid),
        targetCid    = targetCid,
        targetName   = player.getName(source),
        targetNumber = settings.getPhoneNumber(targetCid),
        amount       = value,
        createdAt    = os.time(),
    })

    sd:notify(source, {
        appId = 'bank',
        app   = 'Bank',
        title = shim.text(label) or 'New invoice',
        body  = ('You have a new unpaid invoice for %d'):format(value),
        time  = 'now',
    })
    return true
end)

---IsUnpaidBillsbyCid(citizenID): whether the identity has at least one pending invoice. Note the
---lower-case 'by' in the middle of the name, which is gksphone's own spelling.
registerExport('IsUnpaidBillsbyCid', function(citizenID)
    local cid = phones.forIdentifier(shim.text(citizenID))
    if not cid then return false end

    for _, row in ipairs(invoicestore.listReceived(cid, 50) or {}) do
        if row.status == 'pending' then return true end
    end
    return false
end)

---BankSaveHistory(src, type, amount, description): appends a log-only bank transaction to the
---player's Wallet list. gksphone's `type` is 1 for a debit and 2 for a credit, which becomes the
---sign sd-phone's signed amount carries.
registerExport('BankSaveHistory', function(src, txType, amount, description)
    local source = tonumber(src)
    local value = math.abs(math.floor(tonumber(amount) or 0))
    if not source or value == 0 then return false end

    local cid = player.getIdentifier(source)
    if not cid then return false end

    return sd:addBankTransaction(cid, {
        amount = tonumber(txType) == 2 and value or -value,
        label  = shim.text(description) or 'Transaction',
    }) == true
end)
