---@type table Business-invoices store module; the table returned at end of file.
local store = {}

---@type table Shared server helpers (server.util): id generation.
local util = require 'server.util'

---Creates the invoices table. One row per invoice keyed by id; job NULL = a personal invoice.
---Indexed for the business sent list (job), the target's received list and the personal sent list.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_service_invoices (
            id            VARCHAR(48)  NOT NULL,
            job           VARCHAR(64)  DEFAULT NULL,
            label         VARCHAR(128) DEFAULT NULL,
            sender_cid    VARCHAR(64)  NOT NULL,
            sender_name   VARCHAR(128) DEFAULT NULL,
            sender_number VARCHAR(32)  DEFAULT NULL,
            target_cid    VARCHAR(64)  NOT NULL,
            target_name   VARCHAR(128) DEFAULT NULL,
            target_number VARCHAR(32)  DEFAULT NULL,
            amount        INT          NOT NULL,
            note          VARCHAR(255) DEFAULT NULL,
            status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
            created_at    INT          NOT NULL,
            paid_at       INT          DEFAULT NULL,
            PRIMARY KEY (id),
            INDEX idx_job (job, created_at),
            INDEX idx_target (target_cid, status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Installs created before personal invoices carry job NOT NULL; relax it once.
    local nullable = MySQL.scalar.await([[
        SELECT IS_NULLABLE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phone_service_invoices' AND COLUMN_NAME = 'job'
    ]])
    if nullable == 'NO' then
        MySQL.query.await('ALTER TABLE phone_service_invoices MODIFY job VARCHAR(64) DEFAULT NULL')
    end

    util.ensureIndex('phone_service_invoices', 'idx_sender', '(sender_cid, status, created_at)')
end

---Generates a fresh invoice id.
---@return string
function store.newId()
    return 'bill_' .. util.newId(16)
end

---Inserts one invoice row (status defaults to pending). A nil job stores NULL: a personal invoice.
---@param rec { id: string, job?: string, label?: string, senderCid: string, senderName?: string, senderNumber?: string, targetCid: string, targetName?: string, targetNumber?: string, amount: number, note?: string, createdAt: number }
function store.insert(rec)
    MySQL.insert.await([[
        INSERT INTO phone_service_invoices
            (id, job, label, sender_cid, sender_name, sender_number,
             target_cid, target_name, target_number, amount, note, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    ]], {
        rec.id, rec.job, rec.label, rec.senderCid, rec.senderName, rec.senderNumber,
        rec.targetCid, rec.targetName, rec.targetNumber,
        math.floor(tonumber(rec.amount) or 0), rec.note, rec.createdAt,
    })
end

---Fetches a single invoice by id. Read-only.
---@param id string
---@return table|nil
function store.get(id)
    if not id or id == '' then return nil end
    return MySQL.single.await('SELECT * FROM phone_service_invoices WHERE id = ?', { id })
end

---Every invoice sent from a business, newest first. Read-only.
---@param job string
---@param limit? number row cap (default 50)
---@return table[]
function store.listByJob(job, limit)
    if not job or job == '' then return {} end
    return MySQL.query.await(
        'SELECT * FROM phone_service_invoices WHERE job = ? ORDER BY created_at DESC LIMIT ?',
        { job, limit or 50 }) or {}
end

---Personal invoices (job NULL) sent by a player, newest first. Read-only.
---@param senderCid string
---@param limit? number row cap (default 50)
---@return table[]
function store.listPersonalBySender(senderCid, limit)
    if not senderCid or senderCid == '' then return {} end
    return MySQL.query.await(
        'SELECT * FROM phone_service_invoices WHERE job IS NULL AND sender_cid = ? ORDER BY created_at DESC LIMIT ?',
        { senderCid, limit or 50 }) or {}
end

---How many personal invoices a sender still has pending (the anti-spam cap input). Read-only.
---@param senderCid string
---@return number
function store.countPendingPersonal(senderCid)
    if not senderCid or senderCid == '' then return 0 end
    return tonumber(MySQL.scalar.await(
        "SELECT COUNT(*) FROM phone_service_invoices WHERE job IS NULL AND sender_cid = ? AND status = 'pending'",
        { senderCid })) or 0
end

---Invoices addressed to a player: pending first (newest first), then settled history. Read-only.
---@param targetCid string
---@param limit? number row cap (default 50)
---@return table[]
function store.listReceived(targetCid, limit)
    if not targetCid or targetCid == '' then return {} end
    return MySQL.query.await(
        "SELECT * FROM phone_service_invoices WHERE target_cid = ? ORDER BY (status = 'pending') DESC, created_at DESC LIMIT ?",
        { targetCid, limit or 50 }) or {}
end

---Atomically flips a pending invoice to paid. Returns true only when a pending row was updated,
---which guards against a double payment.
---@param id string
---@param ts number paid-at unix seconds
---@return boolean flipped
function store.markPaid(id, ts)
    if not id or id == '' then return false end
    local affected = MySQL.update.await(
        "UPDATE phone_service_invoices SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'",
        { ts, id })
    return (tonumber(affected) or 0) > 0
end

---Reverts a just-paid invoice back to pending (used when the payout leg fails after the debit).
---@param id string
---@return boolean reverted
function store.revertToPending(id)
    if not id or id == '' then return false end
    local affected = MySQL.update.await(
        "UPDATE phone_service_invoices SET status = 'pending', paid_at = NULL WHERE id = ? AND status = 'paid'",
        { id })
    return (tonumber(affected) or 0) > 0
end

---Atomically flips a pending invoice to cancelled. Returns true only when a pending row was
---updated. Idempotent.
---@param id string
---@return boolean cancelled
function store.markCancelled(id)
    if not id or id == '' then return false end
    local affected = MySQL.update.await(
        "UPDATE phone_service_invoices SET status = 'cancelled' WHERE id = ? AND status = 'pending'",
        { id })
    return (tonumber(affected) or 0) > 0
end

return store
