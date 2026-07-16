---@type table Prefs store module; the table returned at end of file.
local store = {}

local util = require 'server.util'
local isTruthy = util.truthy

---Creates the phone_service_prefs table if it doesn't exist and back-fills the job_messages
---column; toggles default to ON.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_service_prefs (
            citizenid    VARCHAR(64) NOT NULL,
            job          VARCHAR(64) NOT NULL,
            duty         TINYINT(1)  NOT NULL DEFAULT 1,
            job_calls    TINYINT(1)  NOT NULL DEFAULT 1,
            job_messages TINYINT(1)  NOT NULL DEFAULT 1,
            updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, job)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    local hasCol = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phone_service_prefs' AND COLUMN_NAME = 'job_messages'
    ]])
    if not hasCol or hasCol == 0 then
        MySQL.query.await('ALTER TABLE phone_service_prefs ADD COLUMN job_messages TINYINT(1) NOT NULL DEFAULT 1 AFTER job_calls')
    end
end

---Reads a character's prefs for a job; unset (or blank keys) all default to ON.
---@param citizenid string
---@param job string
---@return { duty: boolean, jobCalls: boolean, jobMessages: boolean }
function store.getPrefs(citizenid, job)
    if not citizenid or citizenid == '' or not job or job == '' then
        return { duty = true, jobCalls = true, jobMessages = true }
    end
    local row = MySQL.single.await(
        'SELECT duty, job_calls, job_messages FROM phone_service_prefs WHERE citizenid = ? AND job = ?',
        { citizenid, job })
    if not row then return { duty = true, jobCalls = true, jobMessages = true } end
    return { duty = isTruthy(row.duty), jobCalls = isTruthy(row.job_calls), jobMessages = isTruthy(row.job_messages) }
end

---Persists the Duty toggle for a (character, job), leaving the other toggles intact.
---@param citizenid string
---@param job string
---@param on boolean
function store.setDuty(citizenid, job, on)
    if not citizenid or citizenid == '' or not job or job == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_service_prefs (citizenid, job, duty) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE duty = VALUES(duty)
    ]], { citizenid, job, on and 1 or 0 })
end

---Persists the Job-Calls toggle for a (character, job), leaving the other toggles intact.
---@param citizenid string
---@param job string
---@param on boolean
function store.setJobCalls(citizenid, job, on)
    if not citizenid or citizenid == '' or not job or job == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_service_prefs (citizenid, job, job_calls) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE job_calls = VALUES(job_calls)
    ]], { citizenid, job, on and 1 or 0 })
end

---Persists the Job-Messages toggle for a (character, job), leaving the other toggles intact.
---@param citizenid string
---@param job string
---@param on boolean
function store.setJobMessages(citizenid, job, on)
    if not citizenid or citizenid == '' or not job or job == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_service_prefs (citizenid, job, job_messages) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE job_messages = VALUES(job_messages)
    ]], { citizenid, job, on and 1 or 0 })
end

return store
