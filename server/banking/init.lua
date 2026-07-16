---@type table sd-phone config root (configs/config.lua): Banking.TransactionLimit is the default export row cap.
local config = require 'configs.config'
---@type table Banking persistence layer (server.banking.store): phone_bank_transactions rows.
local store = require 'server.banking.store'
---@type table Authoritative banking handlers (server.banking.actions): overview/send/addExternal.
local actions = require 'server.banking.actions'
---@type table Shared server helpers (server.util): finite-number guard for the export boundary.
local util = require 'server.util'

-- Schema bootstrap.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:banking]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:banking]^0 schema ready')
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
