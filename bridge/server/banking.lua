---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'
---@type table Money bridge (bridge.server.money): framework personal-account operations.
local money     = require 'bridge.server.money'
---@type table Player bridge (bridge.server.player): citizenid/identifier lookups from src.
local player    = require 'bridge.server.player'

---@type table Banking module; the table returned at end of file. Multi-banking adapter: reads and
---moves a player's personal bank balance through a dedicated provider path where one exists, else
---the framework bank account.
local banking = {}

-- Dedicated-path export shapes:
--   wasabi_banking : AddMoney/RemoveMoney/GetAccountBalance(identifier, amount, reason)
--   omes_banking   : AddBankMoney/RemoveBankMoney/GetBankBalance(source, amount, desc)
--   prism_banking  : AddBankingTransaction(source, type, amount, spendType, tax, name, desc)
--   tgg-banking    : GetPersonalAccountByPlayerId(source).balance (read only)
---@type string[] Banking resources, in detection-priority order.
local KNOWN = {
    'wasabi_banking', 'omes_banking', 'prism_banking', 'tgg-banking', 'okokBanking',
    'Renewed-Banking', 'qb-banking', 'esx_banking', 'qs-banking', 'fd_banking',
    'new_banking', 'ps-banking',
}

---@type table<string, boolean> Resources that store the personal balance in their own tables.
local OWN_TABLE = {
    wasabi_banking = true, okokBanking = true, ['tgg-banking'] = true,
    prism_banking  = true, fd_banking  = true,
}

---@type boolean, string|nil Detection-ran flag + cached provider name (nil = framework account).
local resolved, providerName = false, nil

---The active banking resource, resolved lazily and cached on first use. Nil when none is
---started; every operation then uses the framework bank account directly.
---@return string|nil
local function provider()
    if not resolved then
        for _, name in ipairs(KNOWN) do
            if GetResourceState(name) == 'started' then providerName = name; break end
        end
        resolved = true
        print(('^2[sd-phone:banking]^0 banking provider: ^3%s^0'):format(providerName or 'framework account'))
    end
    return providerName
end

-- `banking.name` reads through the lazy resolver.
setmetatable(banking, { __index = function(_, k) if k == 'name' then return provider() end end })

---True when the player's bank balance is the framework account; false for OWN_TABLE resources.
---@return boolean
function banking.balanceIsFramework()
    local name = provider()
    return not (name and OWN_TABLE[name])
end

---Runs a provider export call; true only if it didn't error. The provider's return value is
---ignored.
---@param fn function
---@return boolean
local function try(fn)
    local ok = pcall(fn)
    return ok
end

---The player's current bank balance. Read-only. Own-table providers are read through their
---exports; any miss, type surprise, or error falls through to the framework bank account.
---@param src number
---@return number
function banking.getBalance(src)
    local name = banking.name
    if name == 'wasabi_banking' then
        local id = player.getIdentifier(src)
        if id then
            local ok, bal = pcall(function() return exports.wasabi_banking:GetAccountBalance(id) end)
            if ok and type(bal) == 'number' then return bal end
        end
    elseif name == 'omes_banking' then
        local ok, bal = pcall(function() return exports['omes_banking']:GetBankBalance(src) end)
        if ok and type(bal) == 'number' then return bal end
    elseif name == 'tgg-banking' then
        local ok, acc = pcall(function() return exports['tgg-banking']:GetPersonalAccountByPlayerId(src) end)
        if ok and type(acc) == 'table' and type(acc.balance) == 'number' then return acc.balance end
    elseif name == 'prism_banking' then
        local ok, accs = pcall(function() return exports['prism_banking']:GetBankAccounts(src) end)
        if ok and type(accs) == 'table' then
            for _, a in pairs(accs) do
                if type(a) == 'table' and type(a.balance) == 'number' then return a.balance end
            end
        end
    end
    return money.get(src, 'bank')
end

---Credit the player's bank account. A dedicated provider path returns early only when its export
---call didn't error; otherwise the credit lands on the framework bank account.
---@param src number
---@param amount number
---@param reason? string
function banking.addMoney(src, amount, reason)
    local name = banking.name
    if name == 'wasabi_banking' then
        local id = player.getIdentifier(src)
        if id and try(function() exports.wasabi_banking:AddMoney(id, amount, reason or 'Phone transfer') end) then return end
    elseif name == 'omes_banking' then
        if try(function() exports['omes_banking']:AddBankMoney(src, amount, reason or 'Phone transfer') end) then return end
    elseif name == 'prism_banking' then
        if try(function() exports['prism_banking']:AddBankingTransaction(src, 'deposit', amount, 'phone', false, reason or 'Phone transfer', reason or '') end) then return end
    end
    money.add(src, 'bank', amount, reason)
end

---Debit the player's bank account. Returns nothing and cannot report a declined debit; callers
---must pre-check getBalance >= amount first.
---@param src number
---@param amount number
---@param reason? string
function banking.removeMoney(src, amount, reason)
    local name = banking.name
    if name == 'wasabi_banking' then
        local id = player.getIdentifier(src)
        if id and try(function() exports.wasabi_banking:RemoveMoney(id, amount, reason or 'Phone transfer') end) then return end
    elseif name == 'omes_banking' then
        if try(function() exports['omes_banking']:RemoveBankMoney(src, amount, reason or 'Phone transfer') end) then return end
    elseif name == 'prism_banking' then
        if try(function() exports['prism_banking']:AddBankingTransaction(src, 'withdraw', amount, 'phone', false, reason or 'Phone transfer', reason or '') end) then return end
    end
    money.remove(src, 'bank', amount, reason)
end

---Best-effort credit to an offline character's framework bank account via a parameterized DB
---write against each framework's default schema. True only when a row was actually updated.
---@param citizenid string
---@param amount number
---@return boolean ok
function banking.addOffline(citizenid, amount)
    if framework.name == 'qb' then
        local ok, affected = pcall(function()
            return MySQL.update.await(
                "UPDATE players SET money = JSON_SET(money, '$.bank', JSON_EXTRACT(money, '$.bank') + ?) WHERE citizenid = ?",
                { amount, citizenid })
        end)
        return ok and (tonumber(affected) or 0) > 0
    elseif framework.name == 'esx' then
        local ok, affected = pcall(function()
            return MySQL.update.await(
                "UPDATE users SET accounts = JSON_SET(accounts, '$.bank', JSON_EXTRACT(accounts, '$.bank') + ?) WHERE identifier = ?",
                { amount, citizenid })
        end)
        return ok and (tonumber(affected) or 0) > 0
    end
    return false
end

---Best-effort: mirrors a phone transfer into the active banking resource's own transaction log.
---Failures are swallowed; providers without a personal-log export are skipped.
---@param src number
---@param label string
---@param amount number positive magnitude
---@param isCredit boolean
function banking.logToResource(src, label, amount, isCredit)
    local name = banking.name
    if name == 'esx_banking' then
        try(function() exports['esx_banking']:logTransaction(src, label, isCredit and 'DEPOSIT' or 'WITHDRAW', amount) end)
    elseif name == 'qb-banking' then
        local cid = player.getIdentifier(src)
        try(function() exports['qb-banking']:CreateBankStatement(src, cid, amount, label, isCredit and 'deposit' or 'withdraw', 'player') end)
    elseif name == 'okokBanking' then
        local cid = player.getIdentifier(src)
        try(function() exports['okokBanking']:AddTransaction(cid, { type = isCredit and 'deposit' or 'withdraw', amount = amount, reason = label }, src) end)
    elseif name == 'omes_banking' then
        try(function() exports['omes_banking']:LogCustomTransaction(src, isCredit and 'deposit' or 'withdraw', amount, label) end)
    end
end

return banking
