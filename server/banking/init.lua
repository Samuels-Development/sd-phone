---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table sd-phone config root (configs/config.lua): Banking.TransactionLimit is the default export row cap.
local config = require 'configs.config'
---@type table Banking persistence layer (server.banking.store): phone_bank_transactions rows.
local store = require 'server.banking.store'
---@type table Authoritative banking handlers (server.banking.actions): overview/send/addExternal.
local actions = require 'server.banking.actions'
---@type table Shared server helpers (server.util): finite-number guard for the export boundary.
local util = require 'server.util'
---@type table Banking bridge (bridge.server.banking): expected-echo consumption for the logger.
local bank = require 'bridge.server.banking'
---@type table Player bridge (bridge.server.player): citizenid resolution for the logger.
local player = require 'bridge.server.player'

---Write one externally-driven bank movement to the Wallet log as a generic row. Shared by every
---framework relay below, which each normalise their own payload before calling in, so the row a
---player sees is identical whichever framework produced the movement.
---
---consumeExpected belongs HERE and not in a relay. The registration it consumes is single use, so
---consuming it during normalisation would leave this logger with nothing to match and reinstate the
---duplicate row it exists to prevent: a phone-initiated transfer would appear twice, once as its
---rich phone row and once as a generic Bank Credit.
---@param src number player server id
---@param amount number positive whole magnitude of the movement
---@param minus boolean true when the movement debited the account
---@param reason? string framework-supplied reason, used as the row label when it carries one
local function logExternal(src, amount, minus, reason)
    if bank.consumeExpected(src, amount, minus) then return end
    local cid = player.getIdentifier(src)
    if not cid then return end

    local label = tostring(reason or ''):gsub('[-_]', ' '):gsub('^%s+', ''):gsub('%s+$', '')
    if label == '' or label:lower() == 'unknown' then
        label = minus and 'Bank Charge' or 'Bank Credit'
    else
        label = label:sub(1, 1):upper() .. label:sub(2)
    end
    actions.addExternal(cid, {
        label    = label,
        amount   = minus and -amount or amount,
        category = minus and 'transfer' or 'income',
    })
end

---Any script's bank movement lands in the Wallet log as a generic row (qb/qbox server money
---event; ESX has no server broadcast). Phone-driven movements are skipped since their richer
---rows are already written; 'set' rebalances carry no delta here, so they never log.
AddEventHandler('QBCore:Server:OnMoneyChange', function(src, moneyType, amount, actionType, reason)
    if moneyType ~= 'bank' then return end
    if actionType ~= 'add' and actionType ~= 'remove' then return end
    amount = math.floor(tonumber(amount) or 0)
    if amount <= 0 then return end
    logExternal(src, amount, actionType == 'remove', reason)
end)

---The vRP 2 counterpart. vRP publishes absolute wallet and bank balances, so
---bridge/server/vrp/impl_v2.lua diffs them against its own per-source snapshot and re-emits one
---signed delta per account; by the time it reaches here the shape matches the QBCore relay's. vRP
---carries no reason with a money change, so these always take the generic label. vRP 1 emits no
---money signal at all, which is why an external movement leaves no row there.
---@param source number player server id
---@param account 'wallet'|'bank'
---@param delta number signed movement; negative is a debit
AddEventHandler('sd-phone:server:moneyChanged', function(source, account, delta)
    if account ~= 'bank' then return end
    local src = tonumber(source)
    if not src then return end
    local signed = tonumber(delta) or 0
    local amount = math.floor(math.abs(signed))
    if amount <= 0 then return end
    logExternal(src, amount, signed < 0, nil)
end)

-- Schema bootstrap.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('banking', err)
        return
    end
    boot.schemaReady()
end)

-- Authoritative NUI-facing callbacks: thin delegates into server.banking.actions.
lib.callback.register('sd-phone:server:banking:overview', function(src) return actions.overview(src) end)
lib.callback.register('sd-phone:server:banking:send', function(src, payload) return actions.send(src, payload) end)

---Public export: exports['sd-phone']:addBankTransaction(citizenid, data). Appends a transaction
---to a character's Wallet list (log-only); `amount` is signed and `notify` pops a banner.
---@param identifier string recipient citizenid
---@param data table transaction fields (validated + capped in actions.addExternal)
---@return boolean ok
exports('addBankTransaction', function(identifier, data)
    return actions.addExternal(identifier, data)
end)

---Server-only event form of the addBankTransaction export.
---@param identifier string recipient citizenid
---@param data table transaction fields (validated + capped in actions.addExternal)
AddEventHandler('sd-phone:bank:addTransaction', function(identifier, data)
    actions.addExternal(identifier, data)
end)

---Public export: exports['sd-phone']:getBankTransactions(citizenid, limit?). Returns raw rows
---newest first; limit defaults to Banking.TransactionLimit, clamped 1..100. Read-only.
---@param citizenid string owning character's citizenid
---@param limit? number row cap, defaults to Banking.TransactionLimit, clamped 1..100
---@return table[]|nil rows raw transaction rows ({} when none), nil on a malformed call
exports('getBankTransactions', function(citizenid, limit)
    if type(citizenid) ~= 'string' or citizenid == '' then return nil end
    local n
    if limit == nil then
        n = tonumber(config.Banking.TransactionLimit) or 50
    else
        n = tonumber(limit)
        if not util.finite(n) then return nil end
    end
    n = math.floor(n)
    if n < 1 then n = 1 elseif n > 100 then n = 100 end
    return store.recent(citizenid, n)
end)
