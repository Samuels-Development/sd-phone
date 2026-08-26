---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'
---@type table Authoritative invoice handlers (server.services.invoices): the received list + payment.
local invoices = require 'server.services.invoices'

local registerExport, stubExport = shim.registerExport, shim.stubExport

---GetBills(source): every unpaid bill addressed to the player. sd-phone's bills are its pending
---invoices, shaped here into qs-smartphone's { title, subtitle, price } rows with the id kept so
---PayBill can name one.
registerExport('GetBills', function(source)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return {} end

    local result = invoices.received(src)
    if not (result.success and result.data) then return {} end

    local out = {}
    for _, inv in ipairs(result.data.invoices or {}) do
        out[#out + 1] = {
            id       = inv.id,
            title    = inv.label,
            subtitle = inv.note ~= '' and inv.note or inv.from,
            price    = inv.amount,
            amount   = inv.amount,
            status   = inv.status,
        }
    end
    return out
end)

---PayBill(source, billId): pays one of the player's pending bills, moving the money through the
---bank exactly as the Wallet does. False when the bill is not theirs, no longer pending, or the
---balance will not cover it.
registerExport('PayBill', function(source, billId)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return false end
    return invoices.pay(src, { id = tostring(billId or '') }).success == true
end)

-- CreateBill has no sd-phone equivalent. Every sd-phone invoice is raised BY somebody - an on-duty
-- employee of a configured business, or another character - and paying it credits that sender's
-- account. A senderless system bill has nobody to pay into, so inventing one would take the payer's
-- money and destroy it. Raise the invoice from the business instead: the Services app's own invoice
-- flow, or a personal invoice from the character who is owed the money.
stubExport('CreateBill', nil,
    'has no sd-phone equivalent: every sd-phone invoice is raised by a real business or character and pays into their account, so a senderless system bill cannot be created; raise it from the Services app instead')
