---@type table Store module; the table returned at end of file.
local store = {}

---Creates the phone_bank_transactions table if it doesn't exist: one row per side of a
---transfer, each keyed to its own citizenid.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_bank_transactions` (
            `id`           INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`    VARCHAR(64)  NOT NULL,
            `label`        VARCHAR(120) NOT NULL,
            `amount`       BIGINT       NOT NULL,
            `category`     VARCHAR(32)  NOT NULL DEFAULT 'transfer',
            `counterparty` VARCHAR(64)  NULL,
            `created_at`   BIGINT       NOT NULL,
            KEY `citizenid` (`citizenid`),
            KEY `created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
end

---Appends one transaction row. `amount` is a signed whole-currency value: negative = outflow,
---positive = inflow.
---@param citizenid string owning character's citizenid
---@param label string display label (VARCHAR(120))
---@param amount integer signed whole-currency amount
---@param category string|nil category slug, defaults to 'transfer' (VARCHAR(32))
---@param counterparty string|nil other party's bare-digit phone number, if any (VARCHAR(64))
---@param ts integer unix-seconds timestamp
---@return integer insertId
function store.insert(citizenid, label, amount, category, counterparty, ts)
    return MySQL.insert.await(
        'INSERT INTO `phone_bank_transactions` (citizenid, label, amount, category, counterparty, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        { citizenid, label, amount, category or 'transfer', counterparty, ts })
end

---Returns the most-recent `limit` transactions for a character, newest-first by insert id.
---Read-only.
---@param citizenid string owning character's citizenid
---@param limit integer row cap (Banking.TransactionLimit at the call site)
---@return table[] rows raw DB rows, {} when none
function store.recent(citizenid, limit)
    return MySQL.query.await(
        'SELECT * FROM `phone_bank_transactions` WHERE citizenid = ? ORDER BY id DESC LIMIT ?',
        { citizenid, limit }) or {}
end

return store
