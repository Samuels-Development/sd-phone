---@type table Money bridge (bridge.server.money): framework-agnostic bank account read/credit/debit.
local money   = require 'bridge.server.money'
---@type table Player bridge (bridge.server.player): identity from a server-trusted source only.
local player  = require 'bridge.server.player'
---@type table Banking actions (server.banking.actions): Wallet transaction log (log-only, moves no money).
local banking = require 'server.banking.actions'

---@type table Chips module; the table returned at end of file. Shared casino-chip wallet, one
---persistent balance per character. Chips convert to/from bank money 1:1 and every conversion is
---logged to the Wallet as a signed transaction tagged with the originating game.
local chips = {}

---@type integer Absolute wallet ceiling; credits clamp here.
local CHIP_CEILING = 100000000
---@type integer Max single buy / sell.
local TX_MAX       = 1000000
---@type integer Max absolute chip swing one client-run solo/co-op session may report via settle.
local SETTLE_MAX   = 1000000

---@return string|nil citizenid for a server-trusted src (nil when offline)
local function cidOf(src) return player.getIdentifier(src) end

---Wallet-log category for a chip conversion; unknown or missing game ids collapse to 'blackjack'.
---@param game string|nil originating game id
---@return string category
local function categoryOf(game) return game == 'blackjack' and game or 'blackjack' end

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
    if (money.get(src, 'bank') or 0) < amount then return nil, 'Not enough money in the bank' end
    money.remove(src, 'bank', amount, 'casino-chips')
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
    money.add(src, 'bank', amount, 'casino-chips')
    banking.addExternal(cid, { label = 'Chip cashout', amount = amount, category = categoryOf(game) })
    return { chips = bal, bank = money.get(src, 'bank') or 0 }
end

---Applies a client-asserted net chip change from a solo / co-op session. Deltas clamp to
---SETTLE_MAX either way, non-finite deltas collapse to 0, and losses floor the balance at 0.
---@param src integer player server id
---@param delta any client-supplied signed chip change
---@return table|nil result { chips }, nil when the caller has no identity
function chips.settle(src, delta)
    local cid = cidOf(src); if not cid then return nil end
    delta = tonumber(delta)
    if not delta or delta ~= delta or delta == math.huge or delta == -math.huge then delta = 0 end
    delta = math.floor(delta)
    if delta >  SETTLE_MAX then delta =  SETTLE_MAX end
    if delta < -SETTLE_MAX then delta = -SETTLE_MAX end
    if delta >= 0 then return { chips = chips.add(cid, delta) } end
    MySQL.update.await(
        'UPDATE phone_casino_chips SET chips = GREATEST(chips - ?, 0) WHERE citizenid = ?',
        { -delta, cid })
    return { chips = chips.get(cid) }
end

---Read the caller's chip + bank balances (identity from source only). Read-only.
lib.callback.register('sd-phone:server:games:chipsGet', function(src)
    local cid = cidOf(src); if not cid then return { success = false } end
    return { success = true, data = { chips = chips.get(cid), bank = money.get(src, 'bank') or 0 } }
end)

---Buy chips with the caller's own bank money (validated + clamped in chips.buy).
lib.callback.register('sd-phone:server:games:chipsBuy', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local r, msg = chips.buy(src, payload.amount, payload.game)
    if not r then return { success = false, message = msg } end
    return { success = true, data = r }
end)

---Sell the caller's own chips back to bank money (validated + clamped in chips.sell).
lib.callback.register('sd-phone:server:games:chipsSell', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local r, msg = chips.sell(src, payload.amount, payload.game)
    if not r then return { success = false, message = msg } end
    return { success = true, data = r }
end)

---Apply a solo/co-op session's net result to the caller's own wallet (clamped in chips.settle).
lib.callback.register('sd-phone:server:games:chipsSettle', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local r = chips.settle(src, payload.delta)
    if not r then return { success = false } end
    return { success = true, data = r }
end)

-- One-shot boot thread: creates the wallet schema.
CreateThread(function()
    local good, err = pcall(chips.ensureSchema)
    if not good then print(('^1[sd-phone:games]^0 chips schema bootstrap failed: %s'):format(err)) end
end)

return chips
