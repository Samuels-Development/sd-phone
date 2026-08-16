---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx'|'vrp') + live core
---handle.
local framework   = require 'bridge.shared.framework'
---@type table Inventory resource detection (bridge.shared.inventory_id): first-started candidate.
local inventoryId = require 'bridge.shared.inventory_id'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod  = require 'bridge.server.player'

---@type table Money module; the table returned at end of file. Personal money + black-money
---operations. Black money is the black_money item on ox_inventory, the markedbills item with
---metadata worth on QBCore, and a true account on ESX; each path is dispatched once at module load.
---vRP has no black-money account or item of its own, so unless a dedicated inventory is detected it
---takes the same "no supported path" degradation ESX-less servers already take: 0, false, false.
local money = {}

---Bind the vRP facade once at module load, and only on a vRP server.
---
---The require lives inside this branch on purpose: nothing under bridge/server/vrp/ may be pulled
---onto a QBox, QBCore or ESX boot, where its configs/vrp.lua would be missing and the load would take
---the whole resource down. Every branch below reads nil as "not a vRP server".
---@return table|nil core bridge.server.vrp.core, or nil off vRP
local function chooseVrp()
    if framework.name ~= 'vrp' then return nil end
    return require 'bridge.server.vrp.core'
end

---@type table|nil vRP facade (bridge.server.vrp.core), bound once at load; nil on every other
---framework.
local vrp = chooseVrp()

---Normalise caller-passed money type names across frameworks. ESX wants `money` for cash, QBCore
---wants `cash`; both accept `bank` as-is. The vRP branches never reach here: vRP's own account
---resolver already accepts `cash`, `money`, `wallet` and `bank`, so the caller's type is passed
---through untouched.
---@param t string
---@return string
local function convertType(t)
    if t == 'money' and framework.qb  then return 'cash'  end
    if t == 'cash'  and framework.name == 'esx' then return 'money' end
    return t
end

---Credit one of the player's framework accounts (cash, bank, ...). Returns nothing by contract;
---a no-op when the player can't be resolved. On vRP the credit is vRP's own giveMoney/giveBankMoney
---and `reason` is dropped, because vRP has no money log to write it to.
---@param source number
---@param moneyType string
---@param amount number
---@param reason? string Optional reason string passed to the framework's logger.
function money.add(source, moneyType, amount, reason)
    if vrp then
        vrp.addMoney(source, moneyType, amount)
        return
    end

    local p = player_mod.get(source)
    if not p then return end

    if framework.qb then
        p.Functions.AddMoney(convertType(moneyType), amount, reason)
    elseif framework.name == 'esx' then
        p.addAccountMoney(convertType(moneyType), amount)
    end
end

---Debit one of the player's framework accounts. False when the player could not be resolved or the
---framework declined the debit; callers must still pre-check money.get(src, type) >= amount. On vRP
---the debit is composed inside the facade - vRP 1 has no bank-debit primitive at all - and true
---still means the full amount left the player, with nothing partially consumed on a false.
---@param source number
---@param moneyType string
---@param amount number
---@param reason? string Optional reason string passed to the framework's logger.
---@return boolean removed
function money.remove(source, moneyType, amount, reason)
    if vrp then return vrp.removeMoney(source, moneyType, amount) end

    local p = player_mod.get(source)
    if not p then return false end

    if framework.qb then
        return p.Functions.RemoveMoney(convertType(moneyType), amount, reason) ~= false
    elseif framework.name == 'esx' then
        p.removeAccountMoney(convertType(moneyType), amount)
        return true
    end
    return false
end

---The player's current balance for one of their accounts. Read-only; 0 when the player or
---account can't be resolved. vRP has exactly two accounts, wallet and bank, so any other type reads
---0 there - the same shape ESX degrades to for an account it was never given.
---@param source number
---@param moneyType string
---@return number
function money.get(source, moneyType)
    if vrp then return vrp.balance(source, moneyType) end

    local p = player_mod.get(source)
    if not p then return 0 end

    if framework.qb then
        return p.PlayerData.money[convertType(moneyType)] or 0
    elseif framework.name == 'esx' then
        local account = p.getAccount(convertType(moneyType))
        return account and account.money or 0
    end
    return 0
end

---Pick the "read black-money balance" implementation once at module load: ox counts black_money,
---qb-inventory sums markedbills `info.worth`, ESX reads the account. 0 with no supported path, which
---is where vRP lands unless it runs ox_inventory: vRP has no black-money account of its own.
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
---one markedbills with the amount in `info.worth`, ESX credits the account. False with no path,
---which is where vRP lands unless it runs ox_inventory.
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
---False with no path, which is where vRP lands unless it runs ox_inventory.
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
