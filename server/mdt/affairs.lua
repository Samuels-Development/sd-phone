---@type table sd-phone config root (configs/config.lua); read for the paging bounds.
local config = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, clamping, string caps.
local util   = require 'server.util'
---@type table MDT persistence (server.mdt.store): the ref allocator and name hydration.
local store  = require 'server.mdt.store'
---@type table MDT permissions (server.mdt.access): the read gate, write wrapper and rank guard.
local access = require 'server.mdt.access'

---@type table Internal Affairs module; the table returned at end of file. A complaint against an
---officer, the investigation it opens and the finding that closes it. Every row is scoped to the
---filing officer's own department: one force cannot read another's discipline.
local affairs = {}

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt

---@type integer Rows returned per page.
local PAGE_SIZE = math.floor(tonumber((MDT.Paging or {}).PageSize) or 25)

---@type integer Highest page a client may ask for.
local MAX_PAGE = math.floor(tonumber((MDT.Paging or {}).MaxPage) or 400)

---@type integer Byte cap on the complaint title.
local MAX_TITLE = 160

---@type integer Byte cap on the complaint body and on the finding.
local MAX_BODY = 6000

---@type integer Byte cap on one investigation note.
local MAX_NOTE = 2000

---@type integer Notes returned with a file.
local NOTES_LIMIT = 100

---@type table<string, boolean> Complaint categories.
local CATEGORIES = {
    force       = true,
    misconduct  = true,
    corruption  = true,
    negligence  = true,
    discourtesy = true,
    pursuit     = true,
    other       = true,
}

---@type table<string, boolean> Where a file sits.
local STATUSES = {
    open          = true,
    investigating = true,
    review        = true,
    closed        = true,
}

---@type table<string, boolean> How seriously it is being taken.
local SEVERITIES = { low = true, medium = true, high = true }

---@type table<string, boolean> The finding, once an investigation concludes. These are the four
---dispositions a real review board returns, and only a closed file carries one.
local DISPOSITIONS = {
    sustained     = true,
    unfounded     = true,
    exonerated    = true,
    not_sustained = true,
}

---@type table<string, boolean> What the department did about a sustained finding.
local DISCIPLINE = {
    none        = true,
    counselling = true,
    reprimand   = true,
    suspension  = true,
    demotion    = true,
    termination = true,
}

---Coerces a client page number to a whole page inside the served range.
---@param v any
---@return integer page
local function pageOf(v)
    local n = tonumber(v)
    if not util.finite(n) or n ~= math.floor(n) or n < 1 then return 1 end
    return n > MAX_PAGE and MAX_PAGE or n
end

---Escapes the LIKE wildcards in a search term.
---@param term string
---@return string
local function likeSafe(term)
    return (term:gsub('([%%_\\])', '\\%1'))
end

---Picks a value from an allowed set, falling back when the client sends anything else.
---@param value any
---@param allowed table<string, boolean>
---@param fallback string|nil
---@return string|nil
local function oneOf(value, allowed, fallback)
    local s = util.limitedString(value, 24)
    if s and allowed[s] then return s end
    return fallback
end

---Decodes a stored evidence blob.
---@param raw any
---@return table[]
local function readEvidence(raw)
    if type(raw) ~= 'string' or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---Normalises client evidence into the stored shape. Mirrors the paperwork rules: only http(s) and
---nui:// urls survive, so a file can never carry a javascript: link into an officer's terminal.
---@param value any
---@return table[]
local function sanitizeEvidence(value)
    if type(value) ~= 'table' then return {} end
    local out = {}
    for i = 1, #value do
        local item = value[i]
        if type(item) == 'table' and #out < 24 then
            local url = util.limitedString(item.url, 512)
            if url and (url:match('^https?://') or url:match('^nui://')) then
                out[#out + 1] = { url = url, label = util.limitedString(item.label, 80) or '' }
            end
        end
    end
    return out
end

---The list-row shape.
---@param row table DB row
---@return table
local function summaryOf(row)
    return {
        ref       = row.ref,
        title     = row.title,
        subject   = (row.subject_name ~= '' and row.subject_name) or row.subject_cid,
        subjectId = row.subject_cid,
        rank      = row.subject_rank or '',
        category  = row.category,
        status    = row.status,
        severity  = row.severity,
        filedBy   = row.filed_name,
        assigned  = row.assigned_name,
        createdAt = tonumber(row.created_at) or 0,
        updatedAt = tonumber(row.updated_at) or 0,
    }
end

---The full file, list fields plus everything only the detail needs.
---@param row table DB row
---@param notes table[]
---@return table
local function detailOf(row, notes)
    local file = summaryOf(row)
    file.summary     = row.summary or ''
    file.evidence    = readEvidence(row.evidence)
    file.disposition = row.disposition
    file.discipline  = row.discipline
    file.finding     = row.finding or ''
    file.assignedId  = row.assigned_cid
    file.closedAt    = tonumber(row.closed_at) or nil
    file.notes       = notes
    return file
end

---Every note on a file, oldest first.
---@param id integer
---@return table[]
local function notesFor(id)
    local rows = MySQL.query.await([[
        SELECT author_name, body, created_at FROM phone_mdt_ia_notes
        WHERE ia_id = ? ORDER BY created_at ASC LIMIT ?
    ]], { id, NOTES_LIMIT }) or {}

    local out = {}
    for i = 1, #rows do
        out[i] = {
            author    = rows[i].author_name,
            body      = rows[i].body,
            createdAt = tonumber(rows[i].created_at) or 0,
        }
    end
    return out
end

---Loads a file by ref, refusing one that belongs to another department.
---@param ref any
---@param me table caller identity
---@return table|nil row
local function rowFor(ref, me)
    local key = util.limitedString(ref, 16)
    if not key then return nil end
    local row = MySQL.single.await('SELECT * FROM phone_mdt_ia_cases WHERE ref = ? LIMIT 1', { key })
    if not row then return nil end
    if row.department ~= '' and row.department ~= me.job then return nil end
    return row
end

---A page of complaints against officers of the caller's own department.
affairs.list = access.gated('affairs.view', function(_, payload, me)
    local where, params = { '(department = ? OR department = ?)' }, { me.job, '' }

    local status = oneOf(payload.status, STATUSES, nil)
    if status then
        where[#where + 1] = 'status = ?'
        params[#params + 1] = status
    end

    local category = oneOf(payload.category, CATEGORIES, nil)
    if category then
        where[#where + 1] = 'category = ?'
        params[#params + 1] = category
    end

    local query = util.limitedString(payload.query, 60)
    if query then
        where[#where + 1] = '(title LIKE ? OR subject_name LIKE ? OR ref LIKE ?)'
        local like = '%' .. likeSafe(query) .. '%'
        for _ = 1, 3 do params[#params + 1] = like end
    end

    local clauses = table.concat(where, ' AND ')
    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_mdt_ia_cases WHERE %s'):format(clauses), params)) or 0

    local page = pageOf(payload.page)
    local rows = MySQL.query.await(([[
        SELECT * FROM phone_mdt_ia_cases WHERE %s
        ORDER BY updated_at DESC LIMIT %d OFFSET %d
    ]]):format(clauses, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local out = {}
    for i = 1, #rows do out[i] = summaryOf(rows[i]) end
    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---One file in full, with its investigation notes.
affairs.get = access.gated('affairs.view', function(_, payload, me)
    local row = rowFor(payload.ref, me)
    if not row then return util.fail('mdt.fileNotAvailable', 'That file is not available') end
    return util.ok({ file = detailOf(row, notesFor(row.id)) })
end)

---Complaints filed against ONE officer, newest first. Read by the personnel card, so it takes the
---same key as the board rather than a weaker one.
affairs.forOfficer = access.gated('affairs.view', function(_, payload, me)
    local cid = util.limitedString(payload.citizenid, 64)
    if not cid then return util.fail('mdt.unknownOfficer', 'Unknown officer') end

    local rows = MySQL.query.await([[
        SELECT * FROM phone_mdt_ia_cases
        WHERE subject_cid = ? AND (department = ? OR department = '')
        ORDER BY created_at DESC LIMIT 25
    ]], { cid, me.job }) or {}

    local out = {}
    for i = 1, #rows do out[i] = summaryOf(rows[i]) end
    return util.ok({ rows = out })
end)

---Files a complaint. Open to every sworn grade, because the witness to misconduct is usually the
---junior officer standing next to it. The subject must be someone in the filer's own department,
---and never the filer: self-reporting through IA is not a thing.
affairs.file = access.audited('affairs.file', function(_, payload, me)
    local cid = util.limitedString(payload.citizenid, 64)
    if not cid then return util.fail('mdt.pickOfficer', 'Pick an officer') end
    if cid == me.citizenid then return util.fail('mdt.cannotFileComplaintAgainstYourself', 'You cannot file a complaint against yourself') end

    local grade, jobName = access.gradeOf(cid)
    if grade == nil then return util.fail('mdt.unknownOfficer', 'Unknown officer') end
    if jobName and jobName ~= me.job then return util.fail('mdt.officerNotDepartment', 'That officer is not in your department') end

    local title = util.limitedString(payload.title, MAX_TITLE)
    if not title then return util.fail('mdt.complaintNeedsTitle', 'A complaint needs a title') end

    local ref = store.nextRef('ia')
    if not ref then return util.fail('mdt.couldNotAllocateFileNumber', 'Could not allocate a file number') end

    local names = store.namesFor({ cid })
    local now = os.time()

    MySQL.insert.await([[
        INSERT INTO phone_mdt_ia_cases
            (ref, subject_cid, subject_name, subject_rank, category, title, summary, evidence,
             status, severity, department, filed_cid, filed_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
    ]], {
        ref, cid, names[cid] or cid, util.limitedString(payload.rank, 64) or '',
        oneOf(payload.category, CATEGORIES, 'misconduct'), title,
        util.limitedString(payload.summary, MAX_BODY) or '',
        json.encode(sanitizeEvidence(payload.evidence)),
        oneOf(payload.severity, SEVERITIES, 'medium'),
        me.job, me.citizenid, me.name, now, now,
    })

    local row = MySQL.single.await('SELECT * FROM phone_mdt_ia_cases WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.complaintCouldNotFiled', 'The complaint could not be filed') end

    return util.ok({ file = detailOf(row, {}) }), {
        entityType = 'ia',
        entityId   = ref,
        details    = { subject = names[cid] or cid, citizenid = cid, title = title },
    }
end)

---Updates an open file: status, severity, the narrative, the evidence and who is investigating.
---The finding is NOT settable here, so an investigator cannot quietly resolve their own file.
affairs.update = access.audited('affairs.investigate', function(_, payload, me)
    local row = rowFor(payload.ref, me)
    if not row then return util.fail('mdt.fileNotAvailable', 'That file is not available') end
    if row.status == 'closed' then return util.fail('mdt.fileClosed', 'That file is closed') end

    local sets, params = {}, {}

    local status = oneOf(payload.status, STATUSES, nil)
    if status and status ~= 'closed' then
        sets[#sets + 1] = 'status = ?'
        params[#params + 1] = status
    end

    local severity = oneOf(payload.severity, SEVERITIES, nil)
    if severity then
        sets[#sets + 1] = 'severity = ?'
        params[#params + 1] = severity
    end

    local category = oneOf(payload.category, CATEGORIES, nil)
    if category then
        sets[#sets + 1] = 'category = ?'
        params[#params + 1] = category
    end

    if payload.title ~= nil then
        local title = util.limitedString(payload.title, MAX_TITLE)
        if not title then return util.fail('mdt.complaintNeedsTitle', 'A complaint needs a title') end
        sets[#sets + 1] = 'title = ?'
        params[#params + 1] = title
    end

    if payload.summary ~= nil then
        sets[#sets + 1] = 'summary = ?'
        params[#params + 1] = util.limitedString(payload.summary, MAX_BODY) or ''
    end

    if payload.evidence ~= nil then
        sets[#sets + 1] = 'evidence = ?'
        params[#params + 1] = json.encode(sanitizeEvidence(payload.evidence))
    end

    if payload.assign ~= nil then
        local assignee = util.limitedString(payload.assign, 64)
        if assignee then
            local names = store.namesFor({ assignee })
            sets[#sets + 1] = 'assigned_cid = ?'
            params[#params + 1] = assignee
            sets[#sets + 1] = 'assigned_name = ?'
            params[#params + 1] = names[assignee] or assignee
        else
            sets[#sets + 1] = 'assigned_cid = NULL'
            sets[#sets + 1] = 'assigned_name = NULL'
        end
    end

    if #sets == 0 then return util.fail('mdt.nothingChange', 'Nothing to change') end

    sets[#sets + 1] = 'updated_at = ?'
    params[#params + 1] = os.time()
    params[#params + 1] = row.id

    MySQL.update.await(
        ('UPDATE phone_mdt_ia_cases SET %s WHERE id = ?'):format(table.concat(sets, ', ')), params)

    local fresh = MySQL.single.await('SELECT * FROM phone_mdt_ia_cases WHERE id = ? LIMIT 1', { row.id })
    if not fresh then return util.fail('mdt.fileNotAvailable', 'That file is not available') end

    return util.ok({ file = detailOf(fresh, notesFor(row.id)) }), {
        entityType = 'ia',
        entityId   = row.ref,
        details    = { subject = row.subject_name, status = status },
    }
end)

---Appends an investigation note. Notes are append-only: an IA file that can be edited after the
---fact is not evidence of anything.
affairs.note = access.audited('affairs.investigate', function(_, payload, me)
    local row = rowFor(payload.ref, me)
    if not row then return util.fail('mdt.fileNotAvailable', 'That file is not available') end

    local body = util.limitedString(payload.body, MAX_NOTE)
    if not body then return util.fail('mdt.writeSomethingFirst', 'Write something first') end

    local now = os.time()
    MySQL.insert.await([[
        INSERT INTO phone_mdt_ia_notes (ia_id, author_cid, author_name, body, created_at)
        VALUES (?, ?, ?, ?, ?)
    ]], { row.id, me.citizenid, me.name, body, now })

    MySQL.update.await('UPDATE phone_mdt_ia_cases SET updated_at = ? WHERE id = ?', { now, row.id })

    return util.ok({ notes = notesFor(row.id) }), {
        entityType = 'ia',
        entityId   = row.ref,
        details    = { subject = row.subject_name },
    }
end)

---Closes a file with a disposition, and a discipline when the finding is sustained. Separate key
---from investigating, so the officer running the investigation is not the officer who rules on it
---unless the department is small enough that the same rank does both.
affairs.close = access.audited('affairs.close', function(_, payload, me)
    local row = rowFor(payload.ref, me)
    if not row then return util.fail('mdt.fileNotAvailable', 'That file is not available') end
    if row.status == 'closed' then return util.fail('mdt.fileAlreadyClosed', 'That file is already closed') end

    local disposition = oneOf(payload.disposition, DISPOSITIONS, nil)
    if not disposition then return util.fail('mdt.pickFinding', 'Pick a finding') end

    local discipline = oneOf(payload.discipline, DISCIPLINE, 'none')
    if disposition ~= 'sustained' then discipline = 'none' end

    local now = os.time()
    MySQL.update.await([[
        UPDATE phone_mdt_ia_cases
        SET status = 'closed', disposition = ?, discipline = ?, finding = ?, closed_at = ?, updated_at = ?
        WHERE id = ?
    ]], {
        disposition, discipline, util.limitedString(payload.finding, MAX_BODY) or '',
        now, now, row.id,
    })

    local fresh = MySQL.single.await('SELECT * FROM phone_mdt_ia_cases WHERE id = ? LIMIT 1', { row.id })
    if not fresh then return util.fail('mdt.fileNotAvailable', 'That file is not available') end

    return util.ok({ file = detailOf(fresh, notesFor(row.id)) }), {
        entityType = 'ia',
        entityId   = row.ref,
        details    = {
            subject     = row.subject_name,
            citizenid   = row.subject_cid,
            disposition = disposition,
            discipline  = discipline,
        },
    }
end)

return affairs
