---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Money bridge (bridge.server.money): framework-agnostic bank account read/credit/debit.
local money   = require 'bridge.server.money'
---@type table Player bridge (bridge.server.player): identity from a server-trusted source only.
local player  = require 'bridge.server.player'
---@type table Banking actions (server.banking.actions): Wallet transaction log (log-only, moves no money).
local banking = require 'server.banking.actions'
---@type table Banking bridge (bridge.server.banking): moves the money AND registers the movement
---so the generic Wallet logger skips it. Going through money.* directly logs the same conversion
---twice, once from that listener and once from the addExternal call below.
local bankBridge = require 'bridge.server.banking'

---@type table Chips module; the table returned at end of file. Shared casino-chip wallet, one
---persistent balance per character. Chips convert to/from bank money 1:1 and every conversion is
---logged to the Wallet as a signed transaction tagged with the originating game.
local chips = {}

---@type integer Absolute wallet ceiling; credits clamp here.
local CHIP_CEILING = 100000000
---@type integer Max single buy / sell.
local TX_MAX       = 1000000
---@type integer Minimum gap between conversions (ms). Every buy and sell mints a permanent Wallet
---transaction row, so a zero-sum buy/sell loop must not be free.
local CONVERT_COOLDOWN = 2000

---@return string|nil citizenid for a server-trusted src (nil when offline)
local function cidOf(src) return player.getIdentifier(src) end

---Wallet-log category for a chip conversion. Legacy blackjack rows keep their own category so old
---Wallet history still renders; every other conversion (the Casino cashier) logs as 'casino'.
---@param game string|nil originating game id
---@return string category
local function categoryOf(game) return game == 'blackjack' and 'blackjack' or 'casino' end

---Creates the chip-wallet table if it doesn't exist. Runs once at boot.
function chips.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_casino_chips (
            citizenid VARCHAR(64) NOT NULL,
            chips     BIGINT      NOT NULL DEFAULT 0,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Read a character's chip balance (0 when none / no identity). Read-only.
---@param cid string|nil citizenid
---@return integer chips
function chips.get(cid)
    if not cid or cid == '' then return 0 end
    local r = MySQL.single.await('SELECT chips FROM phone_casino_chips WHERE citizenid = ?', { cid })
    return r and tonumber(r.chips) or 0
end

local util = require 'server.util'
local toAmount = util.wholeAmount

---@return integer amount clamped to [0, TX_MAX] for a single buy / sell
local function clampTx(n) return math.min(TX_MAX, toAmount(n)) end

---Credits chips as a single atomic upsert increment (capped at CHIP_CEILING in SQL) and returns
---the new balance. Negative / non-finite / missing amounts are a no-op.
---@param cid string|nil citizenid
---@param n number chips to credit
---@return integer balance new balance (unchanged when cid is missing or n <= 0)
function chips.add(cid, n)
    if not cid or cid == '' then return 0 end
    n = math.min(CHIP_CEILING, toAmount(n))
    if n > 0 then
        MySQL.update.await([[
            INSERT INTO phone_casino_chips (citizenid, chips) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE chips = LEAST(chips + VALUES(chips), ?)
        ]], { cid, n, CHIP_CEILING })
    end
    return chips.get(cid)
end

---Debits chips atomically via one conditional UPDATE. Returns the new balance, or nil when the
---wallet can't cover the full amount.
---@param cid string|nil citizenid
---@param n number chips to debit
---@return integer|nil balance new balance, nil when insufficient (or no identity)
function chips.remove(cid, n)
    if not cid or cid == '' then return nil end
    n = toAmount(n)
    if n == 0 then return chips.get(cid) end
    local affected = MySQL.update.await(
        'UPDATE phone_casino_chips SET chips = chips - ? WHERE citizenid = ? AND chips >= ?',
        { n, cid, n })
    if not affected or affected == 0 then return nil end
    return chips.get(cid)
end

---Credits many characters at once in a single statement, and reads nothing back. Written for
---resource shutdown, where escrowed casino stacks have to reach the database before the state
---holding them is destroyed: one query has a chance of landing, a loop of add + get does not.
---@param rows table<string, integer> citizenid -> chips to credit
---@return integer credited number of characters written
function chips.creditMany(rows)
    local values, params, n = {}, {}, 0
    for cid, amount in pairs(rows or {}) do
        local chunk = toAmount(amount)
        if type(cid) == 'string' and cid ~= '' and chunk > 0 then
            n = n + 1
            values[n] = '(?, ?)'
            params[#params + 1] = cid
            params[#params + 1] = math.min(CHIP_CEILING, chunk)
        end
    end
    if n == 0 then return 0 end
    params[#params + 1] = CHIP_CEILING
    MySQL.update.await(([[
        INSERT INTO phone_casino_chips (citizenid, chips) VALUES %s
        ON DUPLICATE KEY UPDATE chips = LEAST(chips + VALUES(chips), ?)
    ]]):format(table.concat(values, ', ')), params)
    return n
end

---Buys chips with bank money (1:1), debit-before-credit. Logs a -amount Wallet transaction.
---@param src integer player server id
---@param amount any client-supplied amount (clamped to [1, TX_MAX])
---@param game string|nil originating game id (Wallet-log tag only)
---@return table|nil result { chips, bank }, nil + message on failure
---@return string? message failure reason
function chips.buy(src, amount, game)
    local cid = cidOf(src); if not cid then return nil, 'Player not found' end
    amount = clampTx(amount)
    if amount <= 0 then return nil, 'Enter a valid amount' end
    if not bankBridge.removeMoney(src, amount, 'casino-chips') then
        return nil, 'Not enough money in the bank'
    end
    local bal = chips.add(cid, amount)
    banking.addExternal(cid, { label = 'Chip purchase', amount = -amount, category = categoryOf(game) })
    return { chips = bal, bank = money.get(src, 'bank') or 0 }
end

---Sells chips back for bank money (1:1), debit-before-credit. Logs a +amount Wallet transaction.
---@param src integer player server id
---@param amount any client-supplied amount (clamped to [1, TX_MAX])
---@param game string|nil originating game id (Wallet-log tag only)
---@return table|nil result { chips, bank }, nil + message on failure
---@return string? message failure reason
function chips.sell(src, amount, game)
    local cid = cidOf(src); if not cid then return nil, 'Player not found' end
    amount = clampTx(amount)
    if amount <= 0 then return nil, 'Enter a valid amount' end
    local bal = chips.remove(cid, amount)
    if not bal then return nil, 'Not enough chips' end
    if not bankBridge.addMoney(src, amount, 'casino-chips') then
        chips.add(cid, amount)
        return nil, 'Could not reach your bank account'
    end
    banking.addExternal(cid, { label = 'Chip cashout', amount = amount, category = categoryOf(game) })
    return { chips = bal, bank = money.get(src, 'bank') or 0 }
end

---Read the caller's chip + bank balances (identity from source only). Read-only.
lib.callback.register('sd-phone:server:games:chipsGet', function(src)
    local cid = cidOf(src); if not cid then return { success = false } end
    return { success = true, data = { chips = chips.get(cid), bank = money.get(src, 'bank') or 0 } }
end)

---Buy chips with the caller's own bank money (validated + clamped in chips.buy).
lib.callback.register('sd-phone:server:games:chipsBuy', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    if not util.cooldown(cidOf(src), 'games:chipsConvert', CONVERT_COOLDOWN) then return { success = false, messageKey = 'games.slowDown', message = 'Slow down' } end
    local r, msg = chips.buy(src, payload.amount, payload.game)
    if not r then return { success = false, message = msg } end
    return { success = true, data = r }
end)

---Sell the caller's own chips back to bank money (validated + clamped in chips.sell).
lib.callback.register('sd-phone:server:games:chipsSell', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    if not util.cooldown(cidOf(src), 'games:chipsConvert', CONVERT_COOLDOWN) then return { success = false, messageKey = 'games.slowDown', message = 'Slow down' } end
    local r, msg = chips.sell(src, payload.amount, payload.game)
    if not r then return { success = false, message = msg } end
    return { success = true, data = r }
end)

-- One-shot boot thread: creates the wallet schema.
CreateThread(function()
    local good, err = pcall(chips.ensureSchema)
    if good then boot.schemaReady() else boot.schemaFailed('games:chips', err) end
end)

return chips
