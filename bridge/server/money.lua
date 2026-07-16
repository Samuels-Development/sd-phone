---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework   = require 'bridge.shared.framework'
---@type table Inventory resource detection (bridge.shared.inventory_id): first-started candidate.
local inventoryId = require 'bridge.shared.inventory_id'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod  = require 'bridge.server.player'

---@type table Money module; the table returned at end of file. Personal money + black-money
---operations. Black money is the black_money item on ox_inventory, the markedbills item with
---metadata worth on QBCore, and a true account on ESX; each path is dispatched once at module load.
local money = {}

---Normalise caller-passed money type names across frameworks. ESX wants `money` for cash, QBCore
---wants `cash`; both accept `bank` as-is.
---@param t string
---@return string
local function convertType(t)
    if t == 'money' and framework.name == 'qb'  then return 'cash'  end
    if t == 'cash'  and framework.name == 'esx' then return 'money' end
    return t
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

    if framework.name == 'qb' then
        p.Functions.AddMoney(convertType(moneyType), amount, reason)
    elseif framework.name == 'esx' then
        p.addAccountMoney(convertType(moneyType), amount)
    end
end

---Debit one of the player's framework accounts. Returns nothing and cannot report a declined
---debit; callers must pre-check money.get(src, type) >= amount first.
---@param source number
---@param moneyType string
---@param amount number
---@param reason? string Optional reason string passed to the framework's logger.
function money.remove(source, moneyType, amount, reason)
    local p = player_mod.get(source)
    if not p then return end

    if framework.name == 'qb' then
        p.Functions.RemoveMoney(convertType(moneyType), amount, reason)
    elseif framework.name == 'esx' then
        p.removeAccountMoney(convertType(moneyType), amount)
    end
end

---The player's current balance for one of their accounts. Read-only; 0 when the player or
---account can't be resolved.
---@param source number
---@param moneyType string
---@return number
function money.get(source, moneyType)
    local p = player_mod.get(source)
    if not p then return 0 end

    if framework.name == 'qb' then
        return p.PlayerData.money[convertType(moneyType)] or 0
    elseif framework.name == 'esx' then
        local account = p.getAccount(convertType(moneyType))
        return account and account.money or 0
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
    if framework.name == 'qb' and inventoryId.name == 'qb-inventory' then
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
    if framework.name == 'qb' and inventoryId.name == 'qb-inventory' then
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
    if framework.name == 'qb' and inventoryId.name == 'qb-inventory' then
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
