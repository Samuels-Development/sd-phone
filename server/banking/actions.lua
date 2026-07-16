---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Banking persistence layer (server.banking.store): phone_bank_transactions rows.
local store = require 'server.banking.store'
---@type table Multi-banking adapter (bridge.server.banking): balance reads, debits/credits and
---offline DB credit across the popular banking resources, framework account as the fallback.
local bank = require 'bridge.server.banking'
---@type table Money bridge (bridge.server.money): framework cash/bank account reads.
local money = require 'bridge.server.money'
---@type table Player bridge (bridge.server.player): citizenid/name/source lookups.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone-number ownership.
local settings = require 'server.settings.store'
---@type table Contacts persistence layer (server.contacts.store): saved-contact rows.
local contacts = require 'server.contacts.store'

---@type table Banking app knobs (configs/banking.lua): TransactionLimit, MinSend/MaxSend, AllowOffline.
local BK = config.Banking
---@type table Actions module; the table returned at end of file. Every handler returns the
---{ success, message?, data? } envelope.
local actions = {}

---@return string|nil citizenid of the acting player, resolved from src via the player bridge
local function cidOf(src) return player.getIdentifier(src) end

local util = require 'server.util'
local digits, initialsFor, formatNumber = util.digits, util.initialsFor, util.formatNumber

---@return string iso UTC ISO-8601 timestamp ("2026-01-01T00:00:00Z") from unix seconds
local function iso(ts)    return os.date('!%Y-%m-%dT%H:%M:%SZ', ts) end


---Formats an amount as "$1,234" with thousands separators, sign dropped.
---@param amount number signed whole-currency amount
---@return string formatted
local function formatMoney(amount)
    local s = tostring(math.floor(math.abs(tonumber(amount) or 0)))
    local k
    repeat s, k = s:gsub('^(%d+)(%d%d%d)', '%1,%2') until k == 0
    return '$' .. s
end

---Fires a Bank/Wallet notification to an online player; quietInApp drops the banner while the
---player is in the Bank app.
---@param src integer|nil player server id (no-op when nil)
---@param body string notification body text
local function notifyBank(src, body)
    if not src then return end
    TriggerClientEvent('sd-phone:client:notify', src, {
        app = 'bank', appId = 'bank', quietInApp = true, time = 'now', title = 'Bank', body = body,
    })
end


---Builds a digits -> contact-row lookup from a player's saved contacts.
---@param cid string viewer's citizenid
---@return table<string, table> map keyed by bare-digit phone number
local function contactMapFor(cid)
    local map = {}
    for _, row in ipairs(contacts.listContacts(cid)) do
        map[digits(row.phone)] = row
    end
    return map
end

---Maps a DB row to the Wallet transaction shape, resolving a counterparty number to the
---viewer's saved contact or a formatted number; peerNumber stays raw digits.
---@param row table phone_bank_transactions row (or an equivalent literal)
---@param contactMap table<string, table>|nil digits -> contact-row lookup for the viewer
---@return table out Wallet transaction shape
local function txOut(row, contactMap)
    local out = {
        id       = tostring(row.id),
        merchant = row.label,
        amount   = tonumber(row.amount),
        category = row.category,
        date     = iso(tonumber(row.created_at)),
    }
    local cp = digits(row.counterparty)
    if cp ~= '' then
        out.peerNumber = cp
        local contact = contactMap and contactMap[cp]
        if contact then
            out.merchant     = contact.name
            out.peerInitials = initialsFor(contact.name)
            out.peerColor    = contact.color
            if contact.avatar and contact.avatar ~= '' then out.avatar = contact.avatar end
        else
            out.merchant = formatNumber(cp)
        end
    end
    return out
end

---Returns balance, cash, and recent transactions for the Wallet's main screen, with the list
---capped at Banking.TransactionLimit; ensurePhoneNumber lazily allocates the caller's number.
---@param src integer player server id
---@return table result envelope { success, data? }
function actions.overview(src)
    local cid = cidOf(src)
    if not cid then return { success = false } end

    local contactMap = contactMapFor(cid)
    local txs = {}
    for _, row in ipairs(store.recent(cid, BK.TransactionLimit)) do
        txs[#txs + 1] = txOut(row, contactMap)
    end

    return {
        success = true,
        data = {
            balance      = bank.getBalance(src) or 0,
            cash         = money.get(src, 'cash') or 0,
            name         = player.getName(src),
            number       = settings.ensurePhoneNumber(cid),
            transactions = txs,
        },
    }
end

---Transfers money from the caller's bank to the character who owns `number`: amount validated
---and clamped, debit before credit with a refund on failure, both sides logged.
---@param src integer player server id
---@param payload table { number: string, amount: number, note?: string }
---@return table result envelope { success, message?, data? }
function actions.send(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}

    local number = digits(payload.number)
    local amount = tonumber(payload.amount) or 0
    local note   = (tostring(payload.note or ''):gsub('^%s+', ''):gsub('%s+$', '')):sub(1, 80)

    if number == '' then return { success = false, message = 'Enter a recipient number' } end
    if amount ~= amount or amount == math.huge or amount == -math.huge then
        return { success = false, message = 'Enter a valid amount' }
    end
    amount = math.floor(amount)
    if amount < (BK.MinSend or 1)         then return { success = false, message = 'Enter a valid amount' } end
    if amount > (BK.MaxSend or math.huge) then return { success = false, message = 'Amount is too large' } end

    local myNumber = digits(settings.ensurePhoneNumber(cid))
    if number == myNumber then return { success = false, message = "You can't send money to yourself" } end

    local rcid = settings.getCitizenByNumber(number)
    if not rcid then return { success = false, message = 'No one owns that number' } end

    local balance = bank.getBalance(src) or 0
    if balance < amount then return { success = false, message = 'Insufficient funds' } end

    local rsrc = player.getSourceByIdentifier(rcid)
    if not rsrc then
        if not (BK.AllowOffline and bank.balanceIsFramework()) then
            return { success = false, message = 'Recipient is offline' }
        end
    end

    bank.removeMoney(src, amount, ('Transfer to %s'):format(number))

    local credited
    if rsrc then
        bank.addMoney(rsrc, amount, ('Transfer from %s'):format(myNumber))
        credited = true
    else
        credited = bank.addOffline(rcid, amount)
    end

    if not credited then
        bank.addMoney(src, amount, 'Transfer refund')
        return { success = false, message = 'Could not reach the recipient' }
    end

    local ts          = os.time()
    local senderLabel = note ~= '' and note or ('Sent to %s'):format(number)
    store.insert(cid,  senderLabel,                          -amount, 'transfer', number,   ts)
    store.insert(rcid, ('Received from %s'):format(myNumber), amount, 'transfer', myNumber, ts)

    ---First-party hook: fires once per settled transfer; toSource is nil for an offline credit.
    TriggerEvent('sd-phone:server:banking:transfer', {
        fromCitizenid = cid, fromNumber = myNumber, fromSource = src,
        toCitizenid = rcid, toNumber = number, toSource = rsrc,
        amount = amount, note = note, timestamp = ts,
    })

    bank.logToResource(src, ('Transfer to %s'):format(number), amount, false)
    if rsrc then
        bank.logToResource(rsrc, ('Transfer from %s'):format(myNumber), amount, true)
        TriggerClientEvent('sd-phone:client:bankReceived', rsrc, { amount = amount, from = myNumber })

        local rmap = contactMapFor(rcid)
        local fromName = (rmap[myNumber] and rmap[myNumber].name) or player.getName(src) or formatNumber(myNumber)
        notifyBank(rsrc, ('%s sent you %s'):format(fromName, formatMoney(amount)))
    end

    return {
        success = true,
        data = {
            balance = bank.getBalance(src) or (balance - amount),
            transaction = txOut({
                id = 'new', label = senderLabel, amount = -amount,
                category = 'transfer', counterparty = number, created_at = ts,
            }, contactMapFor(cid)),
        },
    }
end

---Appends a transaction to a character's phone log (log-only, never moves money); `notify` true
---pops the default "You received $X" line (suppressed for outflows), a string pops that line.
---@param identifier string recipient citizenid
---@param data { label: string, amount: number, category?: string, counterparty?: string, notify?: boolean|string }
---@return boolean ok false when the identifier, data table, or amount is unusable
function actions.addExternal(identifier, data)
    if type(identifier) ~= 'string' or identifier == '' then return false end
    if type(data) ~= 'table' then return false end

    local amount = tonumber(data.amount) or 0
    if amount ~= amount or amount == math.huge or amount == -math.huge then return false end
    amount = math.floor(amount)
    if amount == 0 then return false end

    local label        = (tostring(data.label or 'Transaction')):sub(1, 120)
    local category     = (tostring(data.category or 'transfer')):sub(1, 32)
    local counterparty = data.counterparty and (tostring(data.counterparty)):sub(1, 64) or nil
    local ts           = os.time()
    store.insert(identifier, label, amount, category, counterparty, ts)

    local src = player.getSourceByIdentifier(identifier)
    ---First-party hook: fires once per logged external transaction; source is nil while offline.
    TriggerEvent('sd-phone:server:banking:transaction', {
        citizenid = identifier, source = src, amount = amount, label = label,
        category = category, counterparty = counterparty, timestamp = ts,
    })
    if src then
        TriggerClientEvent('sd-phone:client:bankTxAdded', src)
        if data.notify then
            local body = type(data.notify) == 'string' and data.notify
                or (amount > 0 and ('You received %s'):format(formatMoney(amount)) or nil)
            if body then notifyBank(src, body) end
        end
    end
    return true
end

return actions
