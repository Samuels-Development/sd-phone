---@type table Shared server helpers (server.util): schema back-fill helpers.
local util = require 'server.util'

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

    -- The primary key is an auto-increment, so INSERT IGNORE has nothing to collide with and a
    -- repeated lb-phone import would duplicate every row. `src_id` carries the source row's
    -- identity and is unique; rows created in-game leave it NULL, and a unique index permits
    -- any number of NULLs.
    util.ensureColumns('phone_bank_transactions', { src_id = 'src_id VARCHAR(32) NULL' })
    util.ensureUniqueIndex('phone_bank_transactions', 'uq_bank_tx_src', '(src_id)')
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

---Trims a character's log to the newest `keep` rows. Nothing reads past that (the app takes
---Banking.TransactionLimit, the export caps at 100), so the tail only slows the list query and
---grows with every logged movement. The derived table is what lets MySQL delete from the table it
---is selecting from; a character under `keep` rows matches nothing and is left alone.
---@param citizenid string owning character's citizenid
---@param keep integer rows to retain
function store.prune(citizenid, keep)
    if not citizenid or citizenid == '' then return end
    MySQL.query.await([[
        DELETE FROM `phone_bank_transactions`
        WHERE citizenid = ? AND id <= (
            SELECT cutoff FROM (
                SELECT id AS cutoff FROM `phone_bank_transactions`
                WHERE citizenid = ? ORDER BY id DESC LIMIT 1 OFFSET ?
            ) AS t
        )
    ]], { citizenid, citizenid, math.floor(tonumber(keep) or 0) })
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
