---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): number -> identity resolution.
local imei = require 'server.compat.yseries.imei'
---@type table Authoritative banking handlers (server.banking.actions): external ledger writes.
local actions = require 'server.banking.actions'
---@type table Shared server helpers (server.util): number formatting for the counterparty label.
local util = require 'server.util'

local registerExport = shim.registerExport

---YPayAddTransaction(senderNumber, recipientNumber, amount, reason): writes the two Wallet ledger
---rows for a transfer between phone numbers, returning the amount as the transaction id on success
---and false otherwise. Per the YSeries contract this records the movement only; it never moves
---money, which stays the caller's job.
---
---Each side is written independently and offline-safe, so a transfer to a number whose owner has
---logged off still records the sender's debit, which is what a ledger should show.
registerExport('YPayAddTransaction', function(senderNumber, recipientNumber, amount, reason)
    local value = tonumber(amount)
    if not value or value <= 0 then return false end

    local label = type(reason) == 'string' and reason ~= '' and reason or 'YPay transfer'
    local sender = shim.digits(senderNumber)
    local recipient = shim.digits(recipientNumber)
    local senderIdentity = imei.forNumber(sender)
    local recipientIdentity = imei.forNumber(recipient)
    if not senderIdentity and not recipientIdentity then return false end

    local logged = false

    if senderIdentity then
        logged = actions.addExternal(senderIdentity, {
            amount = -value, label = label, category = 'transfer',
            counterparty = recipient and util.formatNumber(recipient) or nil,
        }) or logged
    end

    if recipientIdentity then
        logged = actions.addExternal(recipientIdentity, {
            amount = value, label = label, category = 'transfer',
            counterparty = sender and util.formatNumber(sender) or nil,
        }) or logged
    end

    return logged and value or false
end)
