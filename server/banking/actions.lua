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

---@type integer Rolling window both send budgets are measured over, in ms.
local SEND_WINDOW = 60000
---@type integer Transfers one character may send per window, to anyone.
local SEND_MAX = 20
---@type integer Transfers one character may send per window to the same number. Each one banners
---the recipient, so this is what bounds a flood aimed at one player.
local SEND_MAX_PEER = 6
---@type integer Transaction rows kept per character; the tail past this is unreadable.
local KEEP_ROWS = 2000
---@type integer Smallest gap between two prunes of the same character's log, in ms.
local PRUNE_GAP = 300000
---@type string Stand-in the recipient sees in place of an anonymous sender's number.
local ANON_LABEL = 'Anonymous'
---@type table<string, { color: string, pattern: string }> Banks the Wallet ships, each with the
---colour and pattern that make up its authentic card; mirrors web/src/apps/banking/bankBrands.ts.
local CARD_BANKS = {
    fleeca  = { color = 'emerald', pattern = 'wave' },
    maze    = { color = 'crimson', pattern = 'meander' },
    lombank = { color = 'cobalt',  pattern = 'pinstripe' },
    pacific = { color = 'navy',    pattern = 'guilloche' },
    blaine  = { color = 'bronze',  pattern = 'crosshatch' },
}
---@type table<string, true> Card colour ids; mirrors CARD_COLORS in bankBrands.ts.
local CARD_COLORS = {
    emerald = true, crimson = true, cobalt = true, navy = true, bronze = true,
    graphite = true, teal = true, violet = true, slate = true,
    amber = true, rose = true, midnight = true, mint = true, burgundy = true,
}
---@type table<string, true> Card pattern ids; mirrors CARD_PATTERNS in bankBrands.ts.
local CARD_PATTERNS = {
    wave = true, meander = true, pinstripe = true, guilloche = true, crosshatch = true,
    chevron = true, dots = true, grid = true, diamond = true, scales = true,
    topo = true, circuit = true, carbon = true, none = true,
}
---@type string Bank used when the config names an unknown one.
local CARD_FALLBACK = 'fleeca'

---Trims a character's transaction log, at most once per PRUNE_GAP. Called after a write, so a log
---that stopped growing is never re-scanned.
---@param citizenid string
local function pruneLog(citizenid)
    if not util.cooldown(citizenid, 'bank:prune', PRUNE_GAP) then return end
    store.prune(citizenid, KEEP_ROWS)
end

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
        app = 'bank', appId = 'bank', quietInApp = true, time = 'now',
        titleKey = 'banking.bankTitle', title = 'Bank', body = body,
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
    -- Invoice entries keep their label (it carries the reference code); the counterparty still
    -- resolves the peer avatar, it just never displaces the title.
    local cp = digits(row.counterparty)
    if cp ~= '' then
        out.peerNumber = cp
        local contact = contactMap and contactMap[cp]
        if contact then
            out.peerInitials = initialsFor(contact.name)
            out.peerColor    = contact.color
            if contact.avatar and contact.avatar ~= '' then out.avatar = contact.avatar end
            if row.category ~= 'invoice' then out.merchant = contact.name end
        elseif row.category ~= 'invoice' then
            out.merchant = formatNumber(cp)
        end
    end
    return out
end

---Builds the card style the config declares, falling back per axis to the bank's authentic pair.
---@return table style { bank, color, pattern }
local function configuredStyle()
    local card = BK.Card or {}
    local bankId = CARD_BANKS[card.Brand] and card.Brand or CARD_FALLBACK
    local preset = CARD_BANKS[bankId]
    return {
        bank    = bankId,
        color   = CARD_COLORS[card.Color] and card.Color or preset.color,
        pattern = CARD_PATTERNS[card.Pattern] and card.Pattern or preset.pattern,
    }
end

---Resolves the card style a character's Wallet shows: their saved pick per axis, else the
---configured default. A locked config ignores the pick entirely.
---@param citizenid string framework per-character id
---@return table style { bank, color, pattern }
local function cardStyleFor(citizenid)
    local base = configuredStyle()
    if (BK.Card and BK.Card.Locked) == true then return base end

    local saved = settings.getCardStyle(citizenid)
    if type(saved) ~= 'table' then return base end

    local bankId = CARD_BANKS[saved.bank] and saved.bank or base.bank
    local preset = CARD_BANKS[bankId]
    return {
        bank    = bankId,
        color   = CARD_COLORS[saved.color] and saved.color or preset.color,
        pattern = CARD_PATTERNS[saved.pattern] and saved.pattern or preset.pattern,
    }
end

---Stores the card style a character built in the Wallet; every axis is whitelisted separately.
---@param src integer player server id
---@param payload table { bank: string, color: string, pattern: string }
---@return table result envelope { success, message?, data? }
function actions.setCardStyle(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}

    if (BK.Card and BK.Card.Locked) == true then
        return { success = false, messageKey = 'banking.bankCardSetByServer', message = 'Your bank card is set by the server' }
    end

    local bankId, color, pattern = payload.bank, payload.color, payload.pattern
    if not CARD_BANKS[bankId] or not CARD_COLORS[color] or not CARD_PATTERNS[pattern] then
        return { success = false, messageKey = 'banking.unknownCardDesign', message = 'Unknown card design' }
    end

    local style = { bank = bankId, color = color, pattern = pattern }
    if not settings.setCardStyle(cid, style) then
        return { success = false, messageKey = 'banking.couldNotSaveCardDesign', message = 'Could not save that card design' }
    end

    return { success = true, data = { cardStyle = style } }
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
            balance        = bank.getBalance(src) or 0,
            cash           = money.get(src, 'cash') or 0,
            name           = player.getName(src),
            number         = settings.ensurePhoneNumber(cid),
            allowAnonymous = BK.AllowAnonymous ~= false,
            cardStyle      = cardStyleFor(cid),
            cardLocked     = (BK.Card and BK.Card.Locked) == true,
            transactions   = txs,
        },
    }
end

---Resolves how the recipient sees the sender: the title on their transaction row, the name on
---their credit memo and bank statement, and the counterparty stored against the row.
---@param myNumber string sender's bare-digit phone number
---@param anonymous boolean true when the sender asked to stay hidden
---@return string title row title; a bare name, since a counterparty replaces it when there is one
---@return string ref name on the recipient's credit memo and bank statement
---@return string peer counterparty stored on the row; empty when anonymous
local function shownSender(myNumber, anonymous)
    if anonymous then return ANON_LABEL, ANON_LABEL, '' end
    return ('Received from %s'):format(myNumber), myNumber, myNumber
end

---Transfers money from the caller's bank to the character who owns `number`, or to the player
---on `serverId`; debits before crediting, refunds on failure, and logs both sides.
---@param src integer player server id
---@param payload table { number?: string, serverId?: number, amount: number, note?: string, anonymous?: boolean }
---@return table result envelope { success, message?, data? }
function actions.send(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}

    local amount = tonumber(payload.amount) or 0
    local note   = (tostring(payload.note or ''):gsub('^%s+', ''):gsub('%s+$', '')):sub(1, 80)

    local anonymous = payload.anonymous == true
    if anonymous and BK.AllowAnonymous == false then
        return { success = false, messageKey = 'banking.anonymousTransfersDisabled', message = 'Anonymous transfers are disabled' }
    end

    if amount ~= amount or amount == math.huge or amount == -math.huge then
        return { success = false, messageKey = 'banking.enterValidAmount', message = 'Enter a valid amount' }
    end
    amount = math.floor(amount)
    if amount < (BK.MinSend or 1)         then return { success = false, messageKey = 'banking.enterValidAmount', message = 'Enter a valid amount' } end
    if amount > (BK.MaxSend or math.huge) then return { success = false, messageKey = 'banking.amountTooLarge', message = 'Amount is too large' } end

    local myNumber = digits(settings.ensurePhoneNumber(cid))

    local number, rcid
    local serverId = tonumber(payload.serverId)
    if serverId and util.finite(serverId) then
        serverId = math.floor(serverId)
        if serverId <= 0 or serverId > 65535 then return { success = false, messageKey = 'banking.noPlayerWithServerId', message = 'No player with that server ID' } end
        if serverId == src then return { success = false, messageKey = 'banking.canTSendMoneyYourself', message = "You can't send money to yourself" } end
        rcid = player.getIdentifier(serverId)
        if not rcid then return { success = false, messageKey = 'banking.noPlayerWithServerId', message = 'No player with that server ID' } end
        if rcid == cid then return { success = false, messageKey = 'banking.canTSendMoneyYourself', message = "You can't send money to yourself" } end
        number = digits(settings.ensurePhoneNumber(rcid))
    else
        number = digits(payload.number)
        if number == '' then return { success = false, messageKey = 'banking.enterRecipientNumber', message = 'Enter a recipient number' } end
        if number == myNumber then return { success = false, messageKey = 'banking.canTSendMoneyYourself', message = "You can't send money to yourself" } end
        rcid = settings.getCitizenByNumber(number)
        if not rcid then return { success = false, messageKey = 'banking.noOneOwnsNumber', message = 'No one owns that number' } end
        if rcid == cid then return { success = false, messageKey = 'banking.canTSendMoneyYourself', message = "You can't send money to yourself" } end
    end

    if not util.rateLimit(cid, 'bank:send', SEND_WINDOW, SEND_MAX)
        or not util.rateLimit(cid, 'bank:send:' .. number, SEND_WINDOW, SEND_MAX_PEER) then
        return { success = false, messageKey = 'banking.tooManyTransfersTryAgain', message = 'Too many transfers, try again in a minute' }
    end

    local balance = bank.getBalance(src) or 0
    if balance < amount then return { success = false, messageKey = 'banking.insufficientFunds', message = 'Insufficient funds' } end

    local rsrc = player.getSourceByIdentifier(rcid)
    if not rsrc then
        if not (BK.AllowOffline and bank.balanceIsFramework()) then
            return { success = false, messageKey = 'banking.recipientOffline', message = 'Recipient is offline' }
        end
    end

    if not bank.removeMoney(src, amount, ('Transfer to %s'):format(number)) then
        return { success = false, messageKey = 'banking.couldNotTakeFromAccount', message = 'Could not take that from your account' }
    end

    local recvTitle, senderRef, senderPeer = shownSender(myNumber, anonymous)

    local credited
    if rsrc then
        credited = bank.addMoney(rsrc, amount, ('Transfer from %s'):format(senderRef))
    else
        credited = bank.addOffline(rcid, amount)
    end

    if not credited then
        bank.addMoney(src, amount, 'Transfer refund')
        return { success = false, messageKey = 'banking.couldNotReachRecipient', message = 'Could not reach the recipient' }
    end

    local ts          = os.time()
    local senderLabel = note ~= '' and note or ('Sent to %s'):format(number)
    store.insert(cid,  senderLabel,                           -amount, 'transfer', number,     ts)
    store.insert(rcid, recvTitle,                              amount, 'transfer', senderPeer, ts)
    pruneLog(cid)
    pruneLog(rcid)

    ---First-party hook: fires once per settled transfer; toSource is nil for an offline credit.
    TriggerEvent('sd-phone:server:banking:transfer', {
        fromCitizenid = cid, fromNumber = myNumber, fromSource = src,
        toCitizenid = rcid, toNumber = number, toSource = rsrc,
        amount = amount, note = note, anonymous = anonymous, timestamp = ts,
    })

    bank.logToResource(src, ('Transfer to %s'):format(number), amount, false)
    if rsrc then
        bank.logToResource(rsrc, ('Transfer from %s'):format(senderRef), amount, true)
        local received = { amount = amount, anonymous = anonymous }
        if not anonymous then received.from = myNumber end
        TriggerClientEvent('sd-phone:client:bankReceived', rsrc, received)

        if anonymous then
            notifyBank(rsrc, ('Someone sent you %s'):format(formatMoney(amount)))
        else
            local rmap = contactMapFor(rcid)
            local fromName = (rmap[myNumber] and rmap[myNumber].name) or player.getName(src) or formatNumber(myNumber)
            notifyBank(rsrc, ('%s sent you %s'):format(fromName, formatMoney(amount)))
        end
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
    pruneLog(identifier)

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
