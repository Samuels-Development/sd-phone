---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework   = require 'bridge.shared.framework'
---@type table Inventory resource detection (bridge.shared.inventory_id): first-started candidate.
local inventoryId = require 'bridge.shared.inventory_id'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod  = require 'bridge.server.player'
---@type table|nil ox_core helpers (bridge.shared.oxcore); nil on every other framework.
local ox          = framework.name == 'ox' and require 'bridge.shared.oxcore' or nil
---@type table|nil ND_Core helpers (bridge.shared.ndcore); nil on every other framework.
local nd          = framework.name == 'nd' and require 'bridge.shared.ndcore' or nil

---@type table Money module; the table returned at end of file. Personal money + black-money
---operations. Black money is the black_money item on ox_inventory, the markedbills item with
---metadata worth on QBCore, and a true account on ESX; each path is dispatched once at module load.
local money = {}

---Normalise caller-passed money type names across frameworks. ESX wants `money` for cash, QBCore
---and ND want `cash`; all three accept `bank` as-is. ox_core is not in here: it has no account
---named for a money type at all, so its paths below branch on the type rather than renaming it.
---@param t string
---@return string
local function convertType(t)
    if t == 'money' and (framework.qb or framework.name == 'nd') then return 'cash'  end
    if t == 'cash'  and framework.name == 'esx' then return 'money' end
    return t
end

---Whether a caller-passed money type means physical cash. ox_core keeps cash as the `money`
---ox_inventory item and everything else in an account, so this is the only split that matters.
---@param t string
---@return boolean
local function oxIsCash(t) return t == 'cash' or t == 'money' end

---The character's ox_core account, or nil when the source has no loaded character.
---@param source number
---@return table|nil
local function oxAccount(source)
    local cid = ox.charId(source)
    return cid and ox.account(cid) or nil
end

---Credit one of the player's framework accounts (cash, bank, ...). Returns nothing by contract;
---a no-op when the player can't be resolved.
---@param source number
---@param moneyType string
---@param amount number
---@param reason? string Optional reason string passed to the framework's logger.
function money.add(source, moneyType, amount, reason)
    local p = player_mod.get(source)
    if not p then return end

    if framework.qb then
        p.Functions.AddMoney(convertType(moneyType), amount, reason)
    elseif framework.name == 'esx' then
        p.addAccountMoney(convertType(moneyType), amount)
    elseif framework.name == 'ox' then
        if oxIsCash(moneyType) then
            require('bridge.server.inventory').add(source, 'money', amount)
            return
        end
        local acc = oxAccount(source)
        if acc then ox.accountCall(acc.accountId, 'addBalance', { amount = amount, message = reason }) end
    elseif framework.name == 'nd' then
        if type(p.addMoney) == 'function' then p.addMoney(convertType(moneyType), amount, reason) end
    end
end

---Debit one of the player's framework accounts. False when the player could not be resolved or the
---framework declined the debit; callers must still pre-check money.get(src, type) >= amount.
---@param source number
---@param moneyType string
---@param amount number
---@param reason? string Optional reason string passed to the framework's logger.
---@return boolean removed
function money.remove(source, moneyType, amount, reason)
    local p = player_mod.get(source)
    if not p then return false end

    if framework.qb then
        return p.Functions.RemoveMoney(convertType(moneyType), amount, reason) ~= false
    elseif framework.name == 'esx' then
        p.removeAccountMoney(convertType(moneyType), amount)
        return true
    elseif framework.name == 'ox' then
        if oxIsCash(moneyType) then
            return require('bridge.server.inventory').remove(source, 'money', amount)
        end
        local acc = oxAccount(source)
        if not acc then return false end
        -- overdraw stays false: the account must refuse rather than go negative, and callers
        -- already pre-check the balance.
        return ox.accountCall(acc.accountId, 'removeBalance',
            { amount = amount, overdraw = false, message = reason }) ~= false
    elseif framework.name == 'nd' then
        -- deductMoney returns nil rather than false on a rejected amount, and lets the balance go
        -- negative, so the caller's own pre-check against money.get is what keeps it in range.
        if type(p.deductMoney) ~= 'function' then return false end
        return p.deductMoney(convertType(moneyType), amount, reason) == true
    end
    return false
end

---The player's current balance for one of their accounts. Read-only; 0 when the player or
---account can't be resolved.
---@param source number
---@param moneyType string
---@return number
function money.get(source, moneyType)
    local p = player_mod.get(source)
    if not p then return 0 end

    if framework.qb then
        return p.PlayerData.money[convertType(moneyType)] or 0
    elseif framework.name == 'esx' then
        local account = p.getAccount(convertType(moneyType))
        return account and account.money or 0
    elseif framework.name == 'ox' then
        if oxIsCash(moneyType) then return require('bridge.server.inventory').count(source, 'money') end
        local acc = oxAccount(source)
        return (acc and acc.balance) or 0
    elseif framework.name == 'nd' then
        return tonumber(p[convertType(moneyType)]) or 0
    end
    return 0
end

---Pick the "read black-money balance" implementation once at module load: ox counts black_money,
---qb-inventory sums markedbills `info.worth`, ESX reads the account. 0 with no supported path.
---@return fun(source: number): number
local function chooseGetBlack()
    if inventoryId.name == 'ox_inventory' then
        local invMod = require 'bridge.server.inventory'
        return function(src) return invMod.count(src, 'black_money') end
    end
    if framework.qb and inventoryId.name == 'qb-inventory' then
        return function(src)
            local bills = exports['qb-inventory']:GetItemsByName(src, 'markedbills')
            if not bills then return 0 end
            local worth = 0
            for _, bill in pairs(bills) do
                if bill.info and bill.info.worth then
                    worth = worth + bill.info.worth
                end
            end
            return worth
        end
    end
    if framework.name == 'esx' then
        return function(src)
            local p = player_mod.get(src); if not p then return 0 end
            local account = p.getAccount('black_money')
            return account and account.money or 0
        end
    end
    return function() return 0 end
end

---@type fun(source: number): number Black-money balance reader, bound once at load.
local getBlack = chooseGetBlack()

---The player's current black-money balance. Read-only; 0 when unsupported or unresolvable.
---@param source number
---@return number
function money.getBlack(source) return getBlack(source) end

---Pick the "credit black money" implementation once at module load: ox adds black_money, qb mints
---one markedbills with the amount in `info.worth`, ESX credits the account. False with no path.
---@return fun(source: number, amount: number): boolean
local function chooseAddBlack()
    if inventoryId.name == 'ox_inventory' then
        local invMod = require 'bridge.server.inventory'
        return function(src, amount) return invMod.add(src, 'black_money', amount) end
    end
    if framework.qb and inventoryId.name == 'qb-inventory' then
        return function(src, amount)
            local p = player_mod.get(src); if not p then return false end
            return p.Functions.AddItem('markedbills', 1, false, { worth = amount })
        end
    end
    if framework.name == 'esx' then
        return function(src, amount)
            local p = player_mod.get(src); if not p then return false end
            p.addAccountMoney('black_money', amount)
            return true
        end
    end
    return function() return false end
end

---@type fun(source: number, amount: number): boolean Black-money credit, bound once at load.
local addBlack = chooseAddBlack()

---Credit black money to the player. Returns true only if the credit landed.
---@param source number
---@param amount number
---@return boolean
function money.addBlack(source, amount) return addBlack(source, amount) end

---Pick the "debit black money" implementation once at module load; true only when the full amount
---left the player. The qb path removes bills by slot, re-adding a reduced bill on a partial consume.
---@return fun(source: number, amount: number): boolean
local function chooseRemoveBlack()
    if inventoryId.name == 'ox_inventory' then
        local invMod = require 'bridge.server.inventory'
        return function(src, amount) return invMod.remove(src, 'black_money', amount) end
    end
    if framework.qb and inventoryId.name == 'qb-inventory' then
        return function(src, amount)
            local p = player_mod.get(src); if not p then return false end
            local bills = exports['qb-inventory']:GetItemsByName(src, 'markedbills')
            if not bills then return false end

            local total = 0
            for _, bill in pairs(bills) do
                if bill.info and bill.info.worth then total = total + bill.info.worth end
            end
            if total < amount then return false end

            local remaining = amount
            for slot, bill in pairs(bills) do
                if remaining <= 0 then break end
                if bill.info and bill.info.worth then
                    if bill.info.worth <= remaining then
                        if p.Functions.RemoveItem('markedbills', 1, bill.slot or slot) then
                            remaining = remaining - bill.info.worth
                        end
                    elseif p.Functions.RemoveItem('markedbills', 1, bill.slot or slot) then
                        p.Functions.AddItem('markedbills', 1, false, { worth = bill.info.worth - remaining })
                        remaining = 0
                    end
                end
            end
            return remaining == 0
        end
    end
    if framework.name == 'esx' then
        return function(src, amount)
            local p = player_mod.get(src); if not p then return false end
            local account = p.getAccount('black_money')
            if not account or (tonumber(account.money) or 0) < amount then return false end
            p.removeAccountMoney('black_money', amount)
            return true
        end
    end
    return function() return false end
end

---@type fun(source: number, amount: number): boolean Black-money debit, bound once at load.
local removeBlack = chooseRemoveBlack()

---Debit black money from the player. Returns true only when the FULL amount could be debited;
---nothing is consumed on a refusal.
---@param source number
---@param amount number
---@return boolean
function money.removeBlack(source, amount) return removeBlack(source, amount) end

return money
