---@type table Saved-jobs store module; the table returned at end of file.
local store = {}

---Creates the saved-jobs, job-offer and pending-fire tables. phone_saved_jobs holds a JSON map
---of jobName -> { grade }; offers are unique per (citizenid, job).
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_saved_jobs (
            citizenid  VARCHAR(64) NOT NULL,
            jobs       JSON        NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_job_invites (
            id         VARCHAR(48)  NOT NULL,
            citizenid  VARCHAR(64)  NOT NULL,
            job        VARCHAR(64)  NOT NULL,
            grade      INT          NOT NULL DEFAULT 0,
            invited_by VARCHAR(128) NULL,
            created_at INT          NOT NULL DEFAULT 0,
            PRIMARY KEY (id),
            UNIQUE KEY uq_invite (citizenid, job)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_job_fires (
            citizenid VARCHAR(64) NOT NULL,
            job       VARCHAR(64) NOT NULL,
            PRIMARY KEY (citizenid, job)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Unique phones once keyed these rows by the phone's identity, which showed up in rosters as
    -- a "sim:<number>" employee. A phone changes hands, so the rows cannot be handed back to a
    -- character safely; the framework's own jobs re-seed each list on the next Jobs tab open.
    for _, tbl in ipairs({ 'phone_saved_jobs', 'phone_job_invites', 'phone_job_fires' }) do
        MySQL.update.await(('DELETE FROM %s WHERE citizenid LIKE ? OR citizenid LIKE ?'):format(tbl),
            { 'sim:%', 'device:%' })
    end
end

---Queues an unemployment to apply on the player's next load (offline fire); idempotent.
---@param citizenid string
---@param job string
function store.addPendingFire(citizenid, job)
    if not citizenid or citizenid == '' or not job or job == '' then return end
    MySQL.update.await('INSERT IGNORE INTO phone_job_fires (citizenid, job) VALUES (?, ?)', { citizenid, job })
end

---Consumes a pending fire for (citizenid, job): returns true and clears it if one existed.
---@param citizenid string
---@param job string
---@return boolean
function store.takePendingFire(citizenid, job)
    if not citizenid or citizenid == '' or not job or job == '' then return false end
    local row = MySQL.single.await('SELECT 1 AS x FROM phone_job_fires WHERE citizenid = ? AND job = ?', { citizenid, job })
    if not row then return false end
    MySQL.update.await('DELETE FROM phone_job_fires WHERE citizenid = ? AND job = ?', { citizenid, job })
    return true
end

---Returns the set of jobs a character has a pending fire for. Non-consuming.
---@param citizenid string
---@return table<string, boolean>
function store.pendingFiresFor(citizenid)
    local set = {}
    if not citizenid or citizenid == '' then return set end
    local rows = MySQL.query.await('SELECT job FROM phone_job_fires WHERE citizenid = ?', { citizenid }) or {}
    for _, r in ipairs(rows) do set[r.job] = true end
    return set
end

---Returns the set of citizenids with a pending fire for `jobName`. Non-consuming.
---@param jobName string
---@return table<string, boolean>
function store.pendingFireCids(jobName)
    local set = {}
    if not jobName or jobName == '' then return set end
    local rows = MySQL.query.await('SELECT citizenid FROM phone_job_fires WHERE job = ?', { jobName }) or {}
    for _, r in ipairs(rows) do set[r.citizenid] = true end
    return set
end

---Generates a fresh offer id (time + random suffix).
---@return string
function store.newId()
    return ('inv_%d_%d'):format(os.time(), math.random(100000, 999999))
end

---Reads a player's saved-jobs map as `{ [job] = { grade } }`, or `{}`; a raw JSON string is
---decoded under a pcall guard.
---@param citizenid string
---@return table
function store.getSaved(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await('SELECT jobs FROM phone_saved_jobs WHERE citizenid = ?', { citizenid })
    if not row or not row.jobs then return {} end
    if type(row.jobs) == 'table' then return row.jobs end
    local ok, decoded = pcall(json.decode, row.jobs)
    return (ok and type(decoded) == 'table') and decoded or {}
end

---@type integer How long a savedJobMembers result is reused, in ms.
local MEMBERS_TTL = 30000
---@type table<string, { at: number, rows: table[] }> Memoised savedJobMembers results by job name.
local membersCache = {}

---Returns everyone who has `jobName` in their saved jobs as `{ {citizenid, grade}, ... }`. The
---JSON_EXTRACT predicate no index can serve, so the result is memoised for MEMBERS_TTL and
---dropped whenever any saved-jobs map is written.
---@param jobName string
---@return { citizenid: string, grade: number }[]
function store.savedJobMembers(jobName)
    if not jobName or jobName == '' then return {} end
    local hit = membersCache[jobName]
    if hit and (GetGameTimer() - hit.at) < MEMBERS_TTL then return hit.rows end
    local path = ('$."%s".grade'):format(jobName)
    local rows = MySQL.query.await([[
        SELECT citizenid, JSON_EXTRACT(jobs, ?) AS grade
        FROM phone_saved_jobs
        WHERE JSON_EXTRACT(jobs, ?) IS NOT NULL
    ]], { path, path }) or {}
    local out = {}
    for _, r in ipairs(rows) do
        out[#out + 1] = { citizenid = r.citizenid, grade = math.floor(tonumber(r.grade) or 0) }
    end
    membersCache[jobName] = { at = GetGameTimer(), rows = out }
    return out
end

---Overwrite a player's saved-jobs map (upsert).
---@param citizenid string
---@param map table
function store.setSaved(citizenid, map)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_saved_jobs (citizenid, jobs) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE jobs = VALUES(jobs)
    ]], { citizenid, json.encode(map or {}) })
    -- One character's map can add or drop membership of any job, so the whole memo goes.
    membersCache = {}
end

---Adds (or updates the grade of) one saved job, with the grade coerced to an integer. `pending`
---marks a grade a boss set from the phone while the member was not working the job: it is the
---only saved grade the next load pushes into the framework (actions.reconcileJobs). Every other
---write drops the mark, so a grade the framework reported is never pushed back at it. The `fw`
---mark (see store.syncHeld) is about membership rather than grade, so a grade write keeps it.
---@param citizenid string
---@param job string
---@param grade number
---@param pending? boolean
function store.addSaved(citizenid, job, grade, pending)
    local map = store.getSaved(citizenid)
    local prev = map[job]
    map[job] = {
        grade   = math.floor(tonumber(grade) or 0),
        pending = pending or nil,
        fw      = type(prev) == 'table' and prev.fw or nil,
    }
    store.setSaved(citizenid, map)
end

---Brings a saved-jobs map in line with the jobs the framework holds for the character right now,
---and writes it back when anything changed. A held job is seeded or has its grade refreshed (a
---pending grade is left for the next switch or load to push) and is marked `fw`: the framework
---backs that membership. A saved job marked `fw` that the framework no longer holds was taken
---away outside the phone (a boss menu, an admin, a fire while offline), so it is dropped: kept, it
---would let a fired member switch straight back in at the grade they were fired from. A saved job
---never marked is one only the phone keeps (an accepted offer not worked yet, or a job switched
---away from on a framework that holds one job at a time), and stays.
---@param citizenid string
---@param held table<string, integer> jobName -> grade the framework holds (job.getAll)
---@param blacklist table<string, boolean> jobs never listed
---@return table map the synced saved-jobs map
function store.syncHeld(citizenid, held, blacklist)
    local map = store.getSaved(citizenid)
    local changed = false
    for name, grade in pairs(held) do
        if not blacklist[name] then
            local prev = type(map[name]) == 'table' and map[name] or nil
            if not prev or (prev.grade ~= grade and not prev.pending) then
                map[name] = { grade = grade, fw = true }
                changed = true
            elseif not prev.fw then
                prev.fw = true
                changed = true
            end
        end
    end
    for name, info in pairs(map) do
        if held[name] == nil and type(info) == 'table' and info.fw then
            map[name] = nil
            changed = true
        end
    end
    if changed then store.setSaved(citizenid, map) end
    return map
end

---Removes one saved job; no-op when the job isn't saved.
---@param citizenid string
---@param job string
function store.removeSaved(citizenid, job)
    local map = store.getSaved(citizenid)
    if map[job] == nil then return end
    map[job] = nil
    store.setSaved(citizenid, map)
end

---List a player's pending job offers, newest first.
---@param citizenid string
---@return table[]
function store.listInvites(citizenid)
    if not citizenid or citizenid == '' then return {} end
    return MySQL.query.await(
        'SELECT id, job, grade, invited_by, created_at FROM phone_job_invites WHERE citizenid = ? ORDER BY created_at DESC',
        { citizenid }) or {}
end

---Fetches a single offer for a player, scoped to citizenid and id.
---@param citizenid string
---@param id string
---@return table|nil
function store.getInvite(citizenid, id)
    if not citizenid or not id or id == '' then return nil end
    return MySQL.single.await(
        'SELECT id, job, grade, invited_by, created_at FROM phone_job_invites WHERE citizenid = ? AND id = ?',
        { citizenid, id })
end

---Creates or refreshes a pending offer, unique per (citizenid, job).
---@param inv { id: string, cid: string, job: string, grade: number, invitedBy?: string, createdAt: number }
function store.addInvite(inv)
    MySQL.update.await([[
        INSERT INTO phone_job_invites (id, citizenid, job, grade, invited_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            grade = VALUES(grade), invited_by = VALUES(invited_by), created_at = VALUES(created_at)
    ]], { inv.id, inv.cid, inv.job, math.floor(tonumber(inv.grade) or 0), inv.invitedBy, inv.createdAt or os.time() })
end

---Delete one offer, scoped to its owner. Idempotent.
---@param citizenid string
---@param id string
function store.deleteInvite(citizenid, id)
    if not citizenid or not id then return end
    MySQL.update.await('DELETE FROM phone_job_invites WHERE citizenid = ? AND id = ?', { citizenid, id })
end

return store
