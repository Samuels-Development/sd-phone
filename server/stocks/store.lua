---@type table Shared server helpers (server.util): the ensureIndex drop-in upgrade helper.
local util = require 'server.util'

---@type table Store module; the table returned at end of file. Pure persistence - every query
---is parameterized, callers own validation and serialize their own read-modify-writes.
local store = {}

---Creates the three stocks tables if they don't exist: the per-character brokerage wallet,
---per-character holdings, and the shared live price/history per symbol. Runs once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_stock_wallet` (
            `citizenid`  VARCHAR(64)   NOT NULL,
            `cash`       DECIMAL(18,2) NOT NULL DEFAULT 0,
            `updated_at` BIGINT        NOT NULL,
            PRIMARY KEY (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_stock_holdings` (
            `citizenid`  VARCHAR(64)   NOT NULL,
            `symbol`     VARCHAR(16)   NOT NULL,
            `quantity`   DECIMAL(24,8) NOT NULL,
            `avg_cost`   DECIMAL(18,6) NOT NULL,
            `updated_at` BIGINT        NOT NULL,
            PRIMARY KEY (`citizenid`, `symbol`),
            KEY `citizenid` (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_stock_prices` (
            `symbol`     VARCHAR(16)   NOT NULL,
            `price`      DECIMAL(24,8) NOT NULL,
            `history`    LONGTEXT      NULL,
            `updated_at` BIGINT        NOT NULL,
            PRIMARY KEY (`symbol`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    util.ensureIndex('phone_stock_holdings', 'idx_stock_holdings_symbol', '(symbol, quantity)')
end

---Reads a character's wallet cash, creating the row (seeded with `starting`) via INSERT IGNORE
---the first time.
---@param citizenid string framework per-character id
---@param starting? number seed cash for a brand-new wallet row (defaults to 0)
---@return number cash
function store.ensureWallet(citizenid, starting)
    local row = MySQL.single.await('SELECT cash FROM `phone_stock_wallet` WHERE citizenid = ?', { citizenid })
    if row then return tonumber(row.cash) or 0 end
    MySQL.insert.await(
        'INSERT IGNORE INTO `phone_stock_wallet` (citizenid, cash, updated_at) VALUES (?, ?, ?)',
        { citizenid, starting or 0, os.time() })
    return starting or 0
end

---Persists a character's wallet cash (upsert, ABSOLUTE value).
---@param citizenid string framework per-character id
---@param cash number new wallet balance
---@param ts? integer unix seconds for updated_at (defaults to now)
function store.setWallet(citizenid, cash, ts)
    MySQL.prepare.await(
        'INSERT INTO `phone_stock_wallet` (citizenid, cash, updated_at) VALUES (?, ?, ?) ' ..
        'ON DUPLICATE KEY UPDATE cash = VALUES(cash), updated_at = VALUES(updated_at)',
        { citizenid, cash, ts or os.time() })
end

---Every holding row owned by one character. Read-only.
---@param citizenid string framework per-character id
---@return { symbol: string, quantity: number, avg_cost: number }[] rows
function store.listHoldings(citizenid)
    return MySQL.query.await(
        'SELECT symbol, quantity, avg_cost FROM `phone_stock_holdings` WHERE citizenid = ?',
        { citizenid }) or {}
end

---One character's position in one symbol (nil when they hold none). Read-only.
---@param citizenid string framework per-character id
---@param symbol string asset symbol
---@return { symbol: string, quantity: number, avg_cost: number }|nil row
function store.getHolding(citizenid, symbol)
    return MySQL.single.await(
        'SELECT symbol, quantity, avg_cost FROM `phone_stock_holdings` WHERE citizenid = ? AND symbol = ?',
        { citizenid, symbol })
end

---Persist one character's position in one symbol (upsert, ABSOLUTE quantity + cost basis).
---@param citizenid string framework per-character id
---@param symbol string asset symbol
---@param quantity number units held (fractional by design)
---@param avgCost number weighted-average cost basis per unit
---@param ts? integer unix seconds for updated_at (defaults to now)
function store.upsertHolding(citizenid, symbol, quantity, avgCost, ts)
    MySQL.prepare.await(
        'INSERT INTO `phone_stock_holdings` (citizenid, symbol, quantity, avg_cost, updated_at) VALUES (?, ?, ?, ?, ?) ' ..
        'ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), avg_cost = VALUES(avg_cost), updated_at = VALUES(updated_at)',
        { citizenid, symbol, quantity, avgCost, ts or os.time() })
end

---Deletes one character's position in one symbol, scoped to the owner's citizenid.
---@param citizenid string framework per-character id
---@param symbol string asset symbol
function store.deleteHolding(citizenid, symbol)
    MySQL.prepare.await('DELETE FROM `phone_stock_holdings` WHERE citizenid = ? AND symbol = ?', { citizenid, symbol })
end

---Largest holders of a symbol, biggest first. Read-only.
---@param symbol string asset symbol
---@param limit integer max rows (server-chosen, never client input)
---@return { citizenid: string, quantity: number }[] rows
function store.topHolders(symbol, limit)
    return MySQL.query.await(
        'SELECT citizenid, quantity FROM `phone_stock_holdings` WHERE symbol = ? AND quantity > 0 ORDER BY quantity DESC LIMIT ?',
        { symbol, limit }) or {}
end

---Holder count + total units held across all players for a symbol. Read-only.
---@param symbol string asset symbol
---@return { holders: integer, total: number } stats
function store.holderStats(symbol)
    local row = MySQL.single.await(
        'SELECT COUNT(*) AS holders, COALESCE(SUM(quantity), 0) AS total FROM `phone_stock_holdings` WHERE symbol = ? AND quantity > 0',
        { symbol })
    return { holders = row and tonumber(row.holders) or 0, total = row and tonumber(row.total) or 0 }
end

---All persisted prices, keyed by symbol, for seeding the engine at boot. Corrupt history JSON
---degrades to an empty history. Read-only.
---@return table<string, { price: number, history: number[] }> prices
function store.loadPrices()
    local out = {}
    for _, row in ipairs(MySQL.query.await('SELECT symbol, price, history FROM `phone_stock_prices`') or {}) do
        local history = {}
        if row.history and row.history ~= '' then
            local ok, decoded = pcall(json.decode, row.history)
            if ok and type(decoded) == 'table' then history = decoded end
        end
        out[row.symbol] = { price = tonumber(row.price) or 0, history = history }
    end
    return out
end

---Batch-persist the in-memory market (upsert per symbol, one prepared statement). `rows` is an
---array of { symbol, price, history (number[]) } straight from engine.persistRows.
---@param rows table[] rows to persist
function store.savePrices(rows)
    if #rows == 0 then return end
    local ts = os.time()
    local params = {}
    for i, r in ipairs(rows) do
        params[i] = { r.symbol, r.price, json.encode(r.history or {}), ts }
    end
    MySQL.prepare.await(
        'INSERT INTO `phone_stock_prices` (symbol, price, history, updated_at) VALUES (?, ?, ?, ?) ' ..
        'ON DUPLICATE KEY UPDATE price = VALUES(price), history = VALUES(history), updated_at = VALUES(updated_at)',
        params)
end

return store
