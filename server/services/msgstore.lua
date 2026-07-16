---@type table Company inbox store module; the table returned at end of file.
local store = {}

---Creates the company-inbox tables: one flat message table keyed by (job, citizen_number) and a
---per-(viewer, thread) read-state table.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_service_messages (
            id             VARCHAR(64)  NOT NULL,
            job            VARCHAR(64)  NOT NULL,
            citizen_number VARCHAR(32)  NOT NULL,
            citizen_name   VARCHAR(128) DEFAULT NULL,
            sender         VARCHAR(8)   NOT NULL,          -- 'citizen' | 'staff'
            staff_cid      VARCHAR(64)  DEFAULT NULL,
            staff_name     VARCHAR(128) DEFAULT NULL,
            body           TEXT         NOT NULL,
            created_at     INT          NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_job (job, citizen_number, created_at),
            INDEX idx_cit (citizen_number, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    MySQL.query.await([[
        ALTER TABLE phone_service_messages
            ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'text',
            ADD COLUMN IF NOT EXISTS meta TEXT NULL
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_service_msg_reads (
            viewer         VARCHAR(64) NOT NULL,
            job            VARCHAR(64) NOT NULL,
            citizen_number VARCHAR(32) NOT NULL,
            last_read      INT         NOT NULL DEFAULT 0,
            PRIMARY KEY (viewer, job, citizen_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

local util = require 'server.util'
local function newId() return util.newId(7) end
store.newId = newId

---Appends one message to a (job, citizen) thread.
---@param rec { id: string, job: string, citizenNumber: string, citizenName?: string, sender: string, staffCid?: string, staffName?: string, body: string, kind?: string, meta?: string, createdAt: number }
function store.insert(rec)
    MySQL.insert.await([[
        INSERT INTO phone_service_messages
            (id, job, citizen_number, citizen_name, sender, staff_cid, staff_name, body, kind, meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        rec.id, rec.job, rec.citizenNumber, rec.citizenName,
        rec.sender, rec.staffCid, rec.staffName, rec.body,
        rec.kind or 'text', rec.meta, rec.createdAt,
    })
end

---Every message in a (job, citizen) thread, oldest first. Read-only.
---@param job string
---@param citizenNumber string
---@param limit? number row cap (default 100)
---@return table[]
function store.threadMessages(job, citizenNumber, limit)
    return MySQL.query.await([[
        SELECT id, sender, staff_cid, staff_name, citizen_name, body, kind, meta, created_at
        FROM phone_service_messages
        WHERE job = ? AND citizen_number = ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?
    ]], { job, citizenNumber, limit or 100 }) or {}
end

---Distinct customer threads for a job (one row per customer, newest first), each carrying the
---latest body + the customer's most recent known display name. Read-only.
---@param job string
---@return { citizen_number: string, citizen_name?: string, last_body?: string, created_at: number }[]
function store.jobThreads(job)
    return MySQL.query.await([[
        SELECT t.citizen_number, t.created_at,
               (SELECT body FROM phone_service_messages
                  WHERE job = ? AND citizen_number = t.citizen_number
                  ORDER BY created_at DESC, id DESC LIMIT 1) AS last_body,
               (SELECT citizen_name FROM phone_service_messages
                  WHERE job = ? AND citizen_number = t.citizen_number AND citizen_name IS NOT NULL
                  ORDER BY created_at DESC LIMIT 1) AS citizen_name
        FROM (
            SELECT citizen_number, MAX(created_at) AS created_at
            FROM phone_service_messages WHERE job = ?
            GROUP BY citizen_number
        ) t
        ORDER BY t.created_at DESC
    ]], { job, job, job }) or {}
end

---Marks a (viewer, job, citizen) thread read up to `ts`; the stored timestamp never moves
---backwards.
---@param viewer string
---@param job string
---@param citizenNumber string
---@param ts number
function store.markRead(viewer, job, citizenNumber, ts)
    if not viewer or viewer == '' or not job or job == '' or not citizenNumber or citizenNumber == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_service_msg_reads (viewer, job, citizen_number, last_read) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE last_read = GREATEST(last_read, VALUES(last_read))
    ]], { viewer, job, citizenNumber, ts or 0 })
end

---Unread customer messages per thread for a STAFF viewer of `job` (citizen_number -> count).
---Only counts messages from the customer side. Read-only.
---@param viewer string
---@param job string
---@return table<string, number>
function store.jobUnread(viewer, job)
    local rows = MySQL.query.await([[
        SELECT m.citizen_number AS k, COUNT(*) AS unread
        FROM phone_service_messages m
        LEFT JOIN phone_service_msg_reads r
            ON r.viewer = ? AND r.job = m.job AND r.citizen_number = m.citizen_number
        WHERE m.job = ? AND m.sender = 'citizen' AND m.created_at > COALESCE(r.last_read, 0)
        GROUP BY m.citizen_number
    ]], { viewer, job }) or {}
    local map = {}
    for _, row in ipairs(rows) do map[row.k] = tonumber(row.unread) or 0 end
    return map
end

---Unread company replies per thread for a CUSTOMER viewer (job -> count). Only counts messages
---from the staff side. Read-only.
---@param viewer string
---@param citizenNumber string
---@return table<string, number>
function store.personalUnread(viewer, citizenNumber)
    local rows = MySQL.query.await([[
        SELECT m.job AS k, COUNT(*) AS unread
        FROM phone_service_messages m
        LEFT JOIN phone_service_msg_reads r
            ON r.viewer = ? AND r.job = m.job AND r.citizen_number = m.citizen_number
        WHERE m.citizen_number = ? AND m.sender = 'staff' AND m.created_at > COALESCE(r.last_read, 0)
        GROUP BY m.job
    ]], { viewer, citizenNumber }) or {}
    local map = {}
    for _, row in ipairs(rows) do map[row.k] = tonumber(row.unread) or 0 end
    return map
end

---Distinct company threads for a customer (one row per job, newest first), each carrying the
---latest body. Read-only.
---@param citizenNumber string
---@return { job: string, last_body?: string, created_at: number }[]
function store.citizenThreads(citizenNumber)
    return MySQL.query.await([[
        SELECT t.job, t.created_at,
               (SELECT body FROM phone_service_messages
                  WHERE citizen_number = ? AND job = t.job
                  ORDER BY created_at DESC, id DESC LIMIT 1) AS last_body
        FROM (
            SELECT job, MAX(created_at) AS created_at
            FROM phone_service_messages WHERE citizen_number = ?
            GROUP BY job
        ) t
        ORDER BY t.created_at DESC
    ]], { citizenNumber, citizenNumber }) or {}
end

return store
