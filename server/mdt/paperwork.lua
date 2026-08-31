---@type table sd-phone config root (configs/config.lua); read for the content caps and paging.
local config   = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, clamping, string caps.
local util     = require 'server.util'
---@type table MDT persistence (server.mdt.store): the ref allocator, profiles and name hydration.
local store    = require 'server.mdt.store'
---@type table MDT permissions (server.mdt.access): identity, restrictions and the wrappers.
local access   = require 'server.mdt.access'
---@type table Penal code (server.mdt.offences): the only place charge arithmetic happens.
local offences = require 'server.mdt.offences'

---@type table Paperwork module; the table returned at end of file. Reports and cases, including
---the per-record restriction rows that decide who may even list a report.
local paperwork = {}

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt

---@type table<string, boolean> Report types the police editor offers.
local TYPES = {}
for _, kind in ipairs(MDT.ReportTypes or {}) do TYPES[kind] = true end

---@type table<string, boolean> Report types the medical editor offers instead.
local EMS_TYPES = {}
for _, kind in ipairs(MDT.EmsReportTypes or {}) do EMS_TYPES[kind] = true end

---@type string Report type a save falls back to when the payload names an unknown one.
local DEFAULT_TYPE = (MDT.ReportTypes or {})[1] or 'Incident'
---@type string The medical terminal's own fallback.
local EMS_DEFAULT_TYPE = (MDT.EmsReportTypes or {})[1] or 'Patient Care'

---@type table<string, boolean> Roles a person may hold on a police report.
local ROLES = { suspect = true, victim = true, witness = true }

---@type table<string, boolean> Roles a person may hold on a medical report. A medical report has
---no suspect, which is also why it can carry no charges.
local EMS_ROLES = {}
for _, role in ipairs(MDT.EmsInvolvedRoles or {}) do EMS_ROLES[role] = true end

---The report vocabulary of the caller's own terminal. Every validation reads these rather than a
---module-level constant, so a medic filing a report is held to the medical set and an officer to
---the police one, whatever the client sent.
---@param me table caller identity
---@return table<string, boolean> types
---@return string defaultType
---@return table<string, boolean> roles
local function vocabulary(me)
    if access.isMedical(me) then return EMS_TYPES, EMS_DEFAULT_TYPE, EMS_ROLES end
    return TYPES, DEFAULT_TYPE, ROLES
end

---@type table<string, boolean> Case workflow states.
local STATUSES = { open = true, in_progress = true, closed = true }

---@type table<string, boolean> Case priorities.
local PRIORITIES = { low = true, medium = true, high = true }

---@type table<string, boolean> Roles an officer may hold on a case.
local CASE_ROLES = { primary = true, assisting = true, supervisor = true }

---@type table Content caps for officer-authored text (configs/mdt.lua Limits).
local LIMITS = MDT.Limits or {}

---@type integer Rows returned per page by every paginated list here.
local PAGE_SIZE = math.floor(tonumber((MDT.Paging or {}).PageSize) or 25)

---@type integer Highest page a client may ask for.
local MAX_PAGE = math.floor(tonumber((MDT.Paging or {}).MaxPage) or 400)

---@type integer People who may be attached to one report.
local MAX_INVOLVED = math.floor(tonumber(LIMITS.Involved) or 24)

---@type integer Charge lines one report may carry.
local MAX_CHARGES = math.floor(tonumber(LIMITS.Charges) or 40)

---Coerces a client page number to a whole page inside the served range.
---@param v any
---@return integer page 1..MAX_PAGE
local function pageOf(v)
    local n = tonumber(v)
    if not util.finite(n) or n ~= math.floor(n) or n < 1 then return 1 end
    return n > MAX_PAGE and MAX_PAGE or n
end

---Escapes the LIKE wildcards in a search term so a lone % cannot match every row.
---@param term string
---@return string
local function likeSafe(term)
    return (term:gsub('([%%_\\])', '\\%1'))
end

---@type integer Most evidence entries one piece of paperwork may carry.
local MAX_EVIDENCE = 24
---@type integer Longest evidence URL kept, matching the 512-char url column Photos stores.
local MAX_EVIDENCE_URL = 512

---Normalises the evidence array a client sent: hosted URLs with an optional caption, never inline
---data. One bad entry is dropped rather than failing the save, so a typo cannot cost the report.
---@param value any
---@return string|nil json encoded array, or nil when there is nothing to store
local function sanitizeEvidence(value)
    if type(value) ~= 'table' then return nil end
    local out = {}
    for i = 1, #value do
        local item = value[i]
        if type(item) == 'table' and #out < MAX_EVIDENCE then
            local url = util.limitedString(item.url, MAX_EVIDENCE_URL)
            if url and (url:match('^https?://') or url:match('^nui://')) then
                out[#out + 1] = { url = url, label = util.limitedString(item.label, 120) or '' }
            end
        end
    end
    if #out == 0 then return nil end
    local ok, encoded = pcall(json.encode, out)
    return ok and encoded or nil
end

---Decodes a stored evidence column back into the array the pane renders.
---@param raw any
---@return table[]
local function readEvidence(raw)
    if type(raw) ~= 'string' or #raw < 3 then return {} end
    local ok, list = pcall(json.decode, raw)
    if not ok or type(list) ~= 'table' then return {} end
    local out = {}
    for i = 1, #list do
        local item = list[i]
        if type(item) == 'table' and type(item.url) == 'string' then
            out[#out + 1] = { url = item.url, label = type(item.label) == 'string' and item.label or '' }
        end
    end
    return out
end

---The visibility clause every report read folds in, against the alias `r`: a report with no
---restriction rows is department-wide, otherwise the caller must match one of them.
---@param me table caller identity from access.identity
---@return string clause SQL fragment
---@return any[] args the identifiers it binds
function paperwork.visibility(me)
    local rules = access.restrictions(me)
    local parts, args = {}, { access.domain(me) }
    for i = 1, #rules do
        parts[#parts + 1] = '(x.`type` = ? AND x.`identifier` = ?)'
        args[#args + 1] = rules[i].type
        args[#args + 1] = rules[i].identifier
    end
    -- The domain test leads, and it is an AND rather than one of the restriction rules on purpose:
    -- a restriction narrows who inside a service may read a report, while the domain decides which
    -- service the report belongs to at all. A medical report is not a police report with a tighter
    -- audience, so no combination of restrictions can ever expose one to the other terminal.
    return ([[(
        r.`domain` = ?
        AND (
            NOT EXISTS (SELECT 1 FROM phone_mdt_report_restrictions x WHERE x.report_id = r.id)
            OR EXISTS (
                SELECT 1 FROM phone_mdt_report_restrictions x
                WHERE x.report_id = r.id AND (%s)
            )
        )
    )]]):format(table.concat(parts, ' OR ')), args
end

---The list-row shape every report list sends.
---@param row table DB row
---@return table summary
local function summaryOf(row)
    return {
        ref            = row.ref,
        title          = row.title,
        type           = row.type,
        author         = row.author_name or '',
        authorCid      = row.author_cid,
        callsign       = (row.author_callsign and row.author_callsign ~= '') and row.author_callsign or nil,
        chargeCount    = tonumber(row.charge_count) or 0,
        createdAt      = tonumber(row.created_at) or 0,
        updatedAt      = tonumber(row.updated_at) or 0,
    }
end

---@type string Shared list projection, so a summary is built from one query rather than a walk.
local SUMMARY_SELECT = [[
    SELECT r.id, r.ref, r.title, r.type, r.author_cid, r.author_name, r.author_callsign,
           r.created_at, r.updated_at,
           (SELECT COUNT(*) FROM phone_mdt_report_charges c WHERE c.report_id = r.id) AS charge_count
    FROM phone_mdt_reports r
]]

---Loads a report the caller is allowed to see, by ref.
---@param me table caller identity
---@param ref string report ref
---@return table|nil row
local function readable(me, ref)
    local clause, args = paperwork.visibility(me)
    local params = { ref }
    for i = 1, #args do params[#params + 1] = args[i] end
    return MySQL.single.await(
        ('SELECT r.* FROM phone_mdt_reports r WHERE r.ref = ? AND %s LIMIT 1'):format(clause), params)
end

---Composes the full report the detail pane renders, including the caller's own edit rights.
---@param me table caller identity
---@param src integer player server id
---@param row table report DB row
---@return table report
local function detailOf(me, src, row)
    local parties = MySQL.query.await([[
        SELECT citizenid, role, notes FROM phone_mdt_report_involved
        WHERE report_id = ? ORDER BY id ASC
    ]], { row.id }) or {}

    local charges = MySQL.query.await([[
        SELECT citizenid, code, label, class, count, months, fine FROM phone_mdt_report_charges
        WHERE report_id = ? ORDER BY id ASC
    ]], { row.id }) or {}

    local cids = {}
    for i = 1, #parties do cids[#cids + 1] = parties[i].citizenid end
    for i = 1, #charges do cids[#cids + 1] = charges[i].citizenid end
    local names = store.namesFor(cids)

    local involved = {}
    for i = 1, #parties do
        local p = parties[i]
        involved[i] = {
            citizenid = p.citizenid,
            name      = names[p.citizenid] or p.citizenid,
            role      = p.role,
            notes     = (p.notes and p.notes ~= '') and p.notes or nil,
        }
    end

    local lines, months, fine = {}, 0, 0
    for i = 1, #charges do
        local c = charges[i]
        local count = tonumber(c.count) or 1
        local unitMonths = tonumber(c.months) or 0
        local unitFine   = tonumber(c.fine) or 0
        lines[i] = {
            code      = c.code,
            label     = c.label,
            class     = c.class,
            citizenid = c.citizenid,
            name      = names[c.citizenid] or c.citizenid,
            count     = count,
            months    = unitMonths,
            fine      = unitFine,
        }
        months = months + (unitMonths * count)
        fine   = fine + (unitFine * count)
    end

    local caseRef = MySQL.scalar.await([[
        SELECT c.ref FROM phone_mdt_case_reports l
        JOIN phone_mdt_cases c ON c.id = l.case_id
        WHERE l.report_id = ? LIMIT 1
    ]], { row.id })

    local detail = summaryOf(row)
    detail.chargeCount = #lines
    detail.body        = row.body or ''
    detail.evidence    = readEvidence(row.evidence)
    detail.involved    = involved
    detail.charges     = lines
    detail.totalMonths = months
    detail.totalFine   = fine
    detail.caseRef     = caseRef
    detail.canEdit     = access.can(src, 'reports.edit.any')
        or (row.author_cid == me.citizenid and access.can(src, 'reports.edit.own'))
    detail.canDelete   = access.can(src, 'reports.delete')
    return detail
end

---Validates a save payload into row-ready report fields plus its child rows.
---@param payload table client draft
---@return table|nil draft { title, type, body, involved, charges }
---@return table? refusal failure envelope when draft is nil
local function sanitizeReport(payload, me)
    local types, defaultType, roles = vocabulary(me)

    local title = util.limitedString(payload.title, tonumber(LIMITS.ReportTitle) or 160)
    if not title then return nil, util.fail('mdt.titleRequired', 'A title is required') end

    local kind = type(payload.type) == 'string' and payload.type or ''
    if not types[kind] then kind = defaultType end

    local body = util.limitedString(payload.body, tonumber(LIMITS.ReportBody) or 12000) or ''

    local involved, suspects, seen = {}, {}, {}
    if type(payload.involved) == 'table' then
        for i = 1, #payload.involved do
            local p = payload.involved[i]
            if type(p) == 'table' and #involved < MAX_INVOLVED then
                local cid  = util.limitedString(p.citizenid, 64)
                local role = type(p.role) == 'string' and p.role or ''
                if cid and roles[role] and not seen[cid] then
                    seen[cid] = true
                    involved[#involved + 1] = {
                        citizenid = cid,
                        role      = role,
                        notes     = util.limitedString(p.notes, 255),
                    }
                    if role == 'suspect' then suspects[cid] = true end
                end
            end
        end
    end

    -- A medical report carries no charges, and that is refused here rather than left to the UI:
    -- the medical editor never shows a charge picker, so anything arriving in this field on a
    -- medical report was not typed by a medic.
    if access.isMedical(me) then
        return { title = title, type = kind, body = body, evidence = sanitizeEvidence(payload.evidence), involved = involved, charges = {} }
    end

    local raw = {}
    if type(payload.charges) == 'table' then
        for i = 1, #payload.charges do
            local c = payload.charges[i]
            if type(c) == 'table' and #raw < MAX_CHARGES then
                local cid = util.limitedString(c.citizenid, 64)
                if not cid or not suspects[cid] then
                    return nil, util.fail('mdt.everyChargeMustAttributed', 'Every charge must be attributed to a listed suspect')
                end
                raw[#raw + 1] = { code = c.code, count = c.count, citizenid = cid }
            end
        end
    end

    local charges = offences.totalFor(raw)
    if #raw > 0 and #charges == 0 then
        return nil, util.fail('mdt.noneThoseChargesPenalCode', 'None of those charges are in the penal code')
    end

    return { title = title, type = kind, body = body, evidence = sanitizeEvidence(payload.evidence), involved = involved, charges = charges }
end

---The child-row inserts a report save writes. Shared by create and amend, which differ only in
---whether the parent row is inserted or updated first.
---@param id integer report id
---@param draft table sanitised draft
---@return table[] queries oxmysql transaction entries
local function childQueries(id, draft)
    local queries = {}
    for i = 1, #draft.involved do
        local p = draft.involved[i]
        queries[#queries + 1] = {
            query  = 'INSERT INTO phone_mdt_report_involved (report_id, citizenid, role, notes) VALUES (?, ?, ?, ?)',
            values = { id, p.citizenid, p.role, p.notes },
        }
    end
    for i = 1, #draft.charges do
        local c = draft.charges[i]
        queries[#queries + 1] = {
            query  = 'INSERT INTO phone_mdt_report_charges (report_id, citizenid, code, label, class, count, months, fine) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            values = { id, c.citizenid, c.code, c.label, c.class, c.count, c.months, c.fine },
        }
    end
    return queries
end

---A page of the reports the caller may see, filtered by type and a title or ref search.
paperwork.reportsList = access.gated('reports.view', function(_, payload, me)
    local clause, args = paperwork.visibility(me)
    local where, params = { clause }, {}
    for i = 1, #args do params[#params + 1] = args[i] end

    local types = vocabulary(me)
    local kind = type(payload.type) == 'string' and payload.type or nil
    if kind and types[kind] then
        where[#where + 1] = 'r.type = ?'
        params[#params + 1] = kind
    end

    local query = util.limitedString(payload.query, 60)
    if query then
        where[#where + 1] = '(r.title LIKE ? OR r.ref LIKE ?)'
        local like = '%' .. likeSafe(query) .. '%'
        params[#params + 1] = like
        params[#params + 1] = like
    end

    local clauses = table.concat(where, ' AND ')
    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_mdt_reports r WHERE %s'):format(clauses), params)) or 0

    local page = pageOf(payload.page)
    local rows = MySQL.query.await(
        ('%s WHERE %s ORDER BY r.created_at DESC LIMIT %d OFFSET %d')
            :format(SUMMARY_SELECT, clauses, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local out = {}
    for i = 1, #rows do out[i] = summaryOf(rows[i]) end
    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---One report in full.
paperwork.reportsGet = access.gated('reports.view', function(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and readable(me, ref)
    if not row then return util.fail('mdt.reportNotAvailable', 'That report is not available') end
    return util.ok({ report = detailOf(me, src, row) })
end)

---Files a new report: the report row, its involved people, its charges, and the jobtype
---restriction that scopes it to the author's own department.
local function createReport(src, payload, me)
    local draft, refusal = sanitizeReport(payload, me)
    if not draft then return refusal end

    local ref = store.nextRef('report')
    if not ref then return util.fail('mdt.couldNotAllocateReportNumber', 'Could not allocate a report number') end

    local now = os.time()
    local id = MySQL.insert.await([[
        INSERT INTO phone_mdt_reports
            (ref, title, type, body, evidence, author_cid, author_name, author_callsign, department, domain, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], { ref, draft.title, draft.type, draft.body, draft.evidence, me.citizenid, me.name, me.callsign, me.job, access.domain(me), now, now })
    if not id then return util.fail('mdt.reportCouldNotFiled', 'The report could not be filed') end

    local queries = {
        {
            query  = 'INSERT IGNORE INTO phone_mdt_report_restrictions (report_id, `type`, identifier) VALUES (?, ?, ?)',
            values = { id, 'jobtype', me.department.type or 'leo' },
        },
    }
    for _, q in ipairs(childQueries(id, draft)) do queries[#queries + 1] = q end
    MySQL.transaction.await(queries)

    local row = MySQL.single.await('SELECT * FROM phone_mdt_reports WHERE id = ?', { id })
    if not row then return util.fail('mdt.reportCouldNotFiled', 'The report could not be filed') end

    return util.ok({ report = detailOf(me, src, row) }),
        { entityType = 'report', entityId = ref, details = { title = draft.title, type = draft.type } }
end

---Amends an existing report. The child rows carry no state of their own, so they are rewritten
---wholesale inside the same transaction as the parent update.
local function updateReport(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and readable(me, ref)
    if not row then return util.fail('mdt.reportNotAvailable', 'That report is not available') end

    local draft, refusal = sanitizeReport(payload, me)
    if not draft then return refusal end

    local queries = {
        {
            query  = 'UPDATE phone_mdt_reports SET title = ?, type = ?, body = ?, evidence = ?, updated_at = ? WHERE id = ?',
            values = { draft.title, draft.type, draft.body, draft.evidence, os.time(), row.id },
        },
        { query = 'DELETE FROM phone_mdt_report_involved WHERE report_id = ?', values = { row.id } },
        { query = 'DELETE FROM phone_mdt_report_charges WHERE report_id = ?',  values = { row.id } },
    }
    for _, q in ipairs(childQueries(row.id, draft)) do queries[#queries + 1] = q end
    MySQL.transaction.await(queries)

    local saved = MySQL.single.await('SELECT * FROM phone_mdt_reports WHERE id = ?', { row.id })
    if not saved then return util.fail('mdt.reportCouldNotSaved', 'The report could not be saved') end

    return util.ok({ report = detailOf(me, src, saved) }),
        { entityType = 'report', entityId = ref, details = { title = draft.title, type = draft.type } }
end

---Files or amends a report. Filing needs reports.create; amending your own needs
---reports.edit.own, and amending anyone else's needs reports.edit.any.
---@param src integer player server id
---@param payload table client draft
---@return table envelope
function paperwork.reportsSave(src, payload)
    local me = access.identity(src)
    if not me then return util.fail('mdt.doNotHaveAccessTerminal', 'You do not have access to this terminal') end

    local ref = util.limitedString(payload.ref, 16)
    if not ref then return access.audited('reports.create', createReport)(src, payload) end

    local author = MySQL.scalar.await('SELECT author_cid FROM phone_mdt_reports WHERE ref = ? LIMIT 1', { ref })
    if not author then return util.fail('mdt.reportNotAvailable', 'That report is not available') end

    local key = author == me.citizenid and 'reports.edit.own' or 'reports.edit.any'
    return access.audited(key, updateReport)(src, payload)
end

---Deletes a report and everything hanging off it. The case link goes too; the case survives.
paperwork.reportsDelete = access.audited('reports.delete', function(_, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and readable(me, ref)
    if not row then return util.fail('mdt.reportNotAvailable', 'That report is not available') end

    MySQL.transaction.await({
        { query = 'DELETE FROM phone_mdt_report_charges WHERE report_id = ?',      values = { row.id } },
        { query = 'DELETE FROM phone_mdt_report_involved WHERE report_id = ?',     values = { row.id } },
        { query = 'DELETE FROM phone_mdt_report_restrictions WHERE report_id = ?', values = { row.id } },
        { query = 'DELETE FROM phone_mdt_case_reports WHERE report_id = ?',        values = { row.id } },
        { query = 'DELETE FROM phone_mdt_reports WHERE id = ?',                    values = { row.id } },
    })

    return util.ok({ ref = ref }), { entityType = 'report', entityId = ref, details = { title = row.title } }
end)

---The report, the suspect's own involvement row and their charge lines, or nils when that citizen
---is not a listed suspect on it. The report is resolved through the same visibility clause a
---report read applies, so a warrant or a booking can never reach paperwork the caller cannot open.
---@param me table caller identity from access.identity
---@param reportRef any
---@param citizenid any
---@return table|nil report row from phone_mdt_reports
---@return table|nil suspect { citizenid, name }
---@return table[] charges raw { code, count } lines attributed to that citizen
function paperwork.suspectCharges(me, reportRef, citizenid)
    local ref = util.limitedString(reportRef, 16)
    local cid = util.limitedString(citizenid, 64)
    if not ref or not cid then return nil, nil, {} end

    local report = readable(me, ref)
    if not report then return nil, nil, {} end

    local party = MySQL.single.await([[
        SELECT citizenid FROM phone_mdt_report_involved
        WHERE report_id = ? AND citizenid = ? AND role = 'suspect' LIMIT 1
    ]], { report.id, cid })
    if not party then return report, nil, {} end

    local rows = MySQL.query.await([[
        SELECT code, count FROM phone_mdt_report_charges
        WHERE report_id = ? AND citizenid = ? ORDER BY id ASC
    ]], { report.id, cid }) or {}

    return report, { citizenid = cid, name = store.namesFor({ cid })[cid] or cid }, rows
end

---Officers assigned to a case, with the name and callsign the department knows them by.
---@param id integer case id
---@return table[] officers
local function caseOfficers(id)
    local rows = MySQL.query.await([[
        SELECT citizenid, role FROM phone_mdt_case_officers
        WHERE case_id = ?
        ORDER BY FIELD(role, 'primary', 'supervisor', 'assisting'), id ASC
    ]], { id }) or {}

    local cids = {}
    for i = 1, #rows do cids[i] = rows[i].citizenid end
    local names    = store.namesFor(cids)
    local profiles = store.profilesFor(cids)

    local out = {}
    for i = 1, #rows do
        local row = rows[i]
        out[i] = {
            citizenid = row.citizenid,
            name      = names[row.citizenid] or row.citizenid,
            callsign  = profiles[row.citizenid] and profiles[row.citizenid].callsign or nil,
            role      = row.role,
        }
    end
    return out
end

---Threaded notes on a case, oldest first.
---@param id integer case id
---@return table[] notes
local function caseNotes(id)
    local rows = MySQL.query.await([[
        SELECT id, author_cid, author_name, body, created_at FROM phone_mdt_case_notes
        WHERE case_id = ? ORDER BY created_at ASC, id ASC
    ]], { id }) or {}

    local cids = {}
    for i = 1, #rows do cids[i] = rows[i].author_cid end
    local profiles = store.profilesFor(cids)

    local out = {}
    for i = 1, #rows do
        local row = rows[i]
        out[i] = {
            id        = tonumber(row.id) or 0,
            author    = row.author_name or row.author_cid,
            callsign  = profiles[row.author_cid] and profiles[row.author_cid].callsign or nil,
            body      = row.body or '',
            createdAt = tonumber(row.created_at) or 0,
        }
    end
    return out
end

---Reports linked into a case, newest first.
---@param id integer case id
---@return table[] reports
local function caseReports(id)
    local rows = MySQL.query.await([[
        SELECT r.ref, r.title, r.type FROM phone_mdt_case_reports l
        JOIN phone_mdt_reports r ON r.id = l.report_id
        WHERE l.case_id = ? ORDER BY r.created_at DESC
    ]], { id }) or {}
    return rows
end

---The list-row shape every case list sends.
---@param row table DB row
---@return table summary
local function caseSummaryOf(row)
    return {
        ref          = row.ref,
        title        = row.title,
        status       = row.status,
        priority     = row.priority,
        officers     = tonumber(row.officer_count) or 0,
        reports      = tonumber(row.report_count) or 0,
        createdBy    = row.created_name or '',
        createdAt    = tonumber(row.created_at) or 0,
        updatedAt    = tonumber(row.updated_at) or 0,
    }
end

---@type string Shared case list projection with both child counters folded in.
local CASE_SELECT = [[
    SELECT c.id, c.ref, c.title, c.status, c.priority, c.created_name, c.created_at, c.updated_at,
           (SELECT COUNT(*) FROM phone_mdt_case_officers o WHERE o.case_id = c.id) AS officer_count,
           (SELECT COUNT(*) FROM phone_mdt_case_reports l WHERE l.case_id = c.id) AS report_count
    FROM phone_mdt_cases c
]]

---@type string Detail projection: the list columns plus the two bodies only the detail pane reads.
---Kept apart from CASE_SELECT so listing a page of cases never drags a TEXT summary and a
---MEDIUMTEXT evidence blob per row. Reading a single case through the list projection is what left
---every summary blank: the column was never selected, so `row.summary` was always nil.
local CASE_SELECT_ONE = [[
    SELECT c.id, c.ref, c.title, c.summary, c.evidence, c.status, c.priority,
           c.created_name, c.created_at, c.updated_at,
           (SELECT COUNT(*) FROM phone_mdt_case_officers o WHERE o.case_id = c.id) AS officer_count,
           (SELECT COUNT(*) FROM phone_mdt_case_reports l WHERE l.case_id = c.id) AS report_count
    FROM phone_mdt_cases c
]]

---@type string Case scoping clause, against the alias `c`: a case file belongs to the department
---that opened it, and an unstamped row is shared.
local CASE_SCOPE = '(c.department = ? OR c.department = ?)'

---Loads a case row of the caller's own department by ref, or nil. Reads the detail projection:
---every caller feeds the row to caseDetail, which needs the summary and evidence bodies.
---@param me table caller identity from access.identity
---@param ref string
---@return table|nil row
local function caseRow(me, ref)
    return MySQL.single.await(
        ('%s WHERE c.ref = ? AND %s LIMIT 1'):format(CASE_SELECT_ONE, CASE_SCOPE), { ref, me.job, '' })
end

---Composes the case the detail pane renders.
---@param src integer player server id
---@param row table case DB row from CASE_SELECT
---@return table case
local function caseDetail(src, row)
    local detail = caseSummaryOf(row)
    detail.summary   = row.summary or ''
    detail.evidence  = readEvidence(row.evidence)
    detail.officers  = caseOfficers(row.id)
    detail.notes     = caseNotes(row.id)
    detail.reports   = caseReports(row.id)
    detail.canEdit   = access.can(src, 'cases.edit')
    detail.canDelete = access.can(src, 'cases.delete')
    return detail
end

---A page of cases, filtered by status, priority and a title or ref search.
paperwork.casesList = access.gated('cases.view', function(_, payload, me)
    local where, params = { CASE_SCOPE }, { me.job, '' }

    local status = type(payload.status) == 'string' and payload.status or nil
    if status and STATUSES[status] then
        where[#where + 1] = 'c.status = ?'
        params[#params + 1] = status
    end

    local priority = type(payload.priority) == 'string' and payload.priority or nil
    if priority and PRIORITIES[priority] then
        where[#where + 1] = 'c.priority = ?'
        params[#params + 1] = priority
    end

    local query = util.limitedString(payload.query, 60)
    if query then
        where[#where + 1] = '(c.title LIKE ? OR c.ref LIKE ?)'
        local like = '%' .. likeSafe(query) .. '%'
        params[#params + 1] = like
        params[#params + 1] = like
    end

    local clauses = table.concat(where, ' AND ')
    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_mdt_cases c WHERE %s'):format(clauses), params)) or 0

    local page = pageOf(payload.page)
    local rows = MySQL.query.await(
        ('%s WHERE %s ORDER BY c.updated_at DESC LIMIT %d OFFSET %d')
            :format(CASE_SELECT, clauses, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local out = {}
    for i = 1, #rows do out[i] = caseSummaryOf(rows[i]) end
    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---One case in full.
paperwork.casesGet = access.gated('cases.view', function(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and caseRow(me, ref)
    if not row then return util.fail('mdt.caseNoLongerExists', 'That case no longer exists') end
    return util.ok({ case = caseDetail(src, row) })
end)

---Opens a new case file and puts its creator on it as the primary officer.
local function createCase(src, payload, me)
    local title = util.limitedString(payload.title, tonumber(LIMITS.CaseTitle) or 160)
    if not title then return util.fail('mdt.titleRequired', 'A title is required') end

    local ref = store.nextRef('case')
    if not ref then return util.fail('mdt.couldNotAllocateCaseNumber', 'Could not allocate a case number') end

    local summary  = util.limitedString(payload.summary, tonumber(LIMITS.CaseSummary) or 4000) or ''
    local status   = STATUSES[payload.status] and payload.status or 'open'
    local priority = PRIORITIES[payload.priority] and payload.priority or 'medium'
    local now      = os.time()

    local id = MySQL.insert.await([[
        INSERT INTO phone_mdt_cases
            (ref, title, summary, evidence, status, priority, department, created_cid, created_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], { ref, title, summary, sanitizeEvidence(payload.evidence), status, priority, me.job, me.citizenid, me.name, now, now })
    if not id then return util.fail('mdt.caseCouldNotOpened', 'The case could not be opened') end

    MySQL.query.await([[
        INSERT IGNORE INTO phone_mdt_case_officers (case_id, citizenid, role, assigned_by, assigned_at)
        VALUES (?, ?, 'primary', ?, ?)
    ]], { id, me.citizenid, me.citizenid, now })

    return util.ok({ case = caseDetail(src, caseRow(me, ref)) }),
        { entityType = 'case', entityId = ref, details = { title = title } }
end

---Amends an existing case file.
local function updateCase(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and caseRow(me, ref)
    if not row then return util.fail('mdt.caseNoLongerExists', 'That case no longer exists') end

    local title = util.limitedString(payload.title, tonumber(LIMITS.CaseTitle) or 160)
    if not title then return util.fail('mdt.titleRequired', 'A title is required') end

    local summary  = util.limitedString(payload.summary, tonumber(LIMITS.CaseSummary) or 4000) or ''
    local status   = STATUSES[payload.status] and payload.status or row.status
    local priority = PRIORITIES[payload.priority] and payload.priority or row.priority

    MySQL.update.await([[
        UPDATE phone_mdt_cases SET title = ?, summary = ?, evidence = ?, status = ?, priority = ?, updated_at = ?
        WHERE id = ?
    ]], { title, summary, sanitizeEvidence(payload.evidence), status, priority, os.time(), row.id })

    return util.ok({ case = caseDetail(src, caseRow(me, ref)) }),
        { entityType = 'case', entityId = ref, details = { title = title, status = status, priority = priority } }
end

---Opens or amends a case file.
---@param src integer player server id
---@param payload table client draft
---@return table envelope
function paperwork.casesSave(src, payload)
    if not access.canAccess(src) then return util.fail('mdt.doNotHaveAccessTerminal', 'You do not have access to this terminal') end
    local ref = util.limitedString(payload.ref, 16)
    if not ref then return access.audited('cases.create', createCase)(src, payload) end
    return access.audited('cases.edit', updateCase)(src, payload)
end

---Deletes a case file. Its reports are unlinked, never deleted.
paperwork.casesDelete = access.audited('cases.delete', function(_, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and caseRow(me, ref)
    if not row then return util.fail('mdt.caseNoLongerExists', 'That case no longer exists') end

    MySQL.transaction.await({
        { query = 'DELETE FROM phone_mdt_case_officers WHERE case_id = ?', values = { row.id } },
        { query = 'DELETE FROM phone_mdt_case_notes WHERE case_id = ?',    values = { row.id } },
        { query = 'DELETE FROM phone_mdt_case_reports WHERE case_id = ?',  values = { row.id } },
        { query = 'DELETE FROM phone_mdt_cases WHERE id = ?',              values = { row.id } },
    })

    return util.ok({ ref = ref }), { entityType = 'case', entityId = ref, details = { title = row.title } }
end)

---Adds a note to a case thread.
paperwork.casesNote = access.audited('cases.edit', function(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and caseRow(me, ref)
    if not row then return util.fail('mdt.caseNoLongerExists', 'That case no longer exists') end

    local body = util.limitedString(payload.body, tonumber(LIMITS.CaseNote) or 1000)
    if not body then return util.fail('mdt.writeSomethingFirst', 'Write something first') end

    local now = os.time()
    MySQL.transaction.await({
        {
            query  = 'INSERT INTO phone_mdt_case_notes (case_id, author_cid, author_name, body, created_at) VALUES (?, ?, ?, ?, ?)',
            values = { row.id, me.citizenid, me.name, body, now },
        },
        { query = 'UPDATE phone_mdt_cases SET updated_at = ? WHERE id = ?', values = { now, row.id } },
    })

    return util.ok({ case = caseDetail(src, caseRow(me, ref)) }), { entityType = 'case', entityId = ref }
end)

---Puts an officer on a case, or takes them off it.
paperwork.casesAssign = access.audited('cases.edit', function(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and caseRow(me, ref)
    if not row then return util.fail('mdt.caseNoLongerExists', 'That case no longer exists') end

    local cid = util.limitedString(payload.citizenid, 64)
    if not cid then return util.fail('mdt.pickOfficer', 'Pick an officer') end

    local now = os.time()
    if payload.assigned == false then
        MySQL.update.await(
            'DELETE FROM phone_mdt_case_officers WHERE case_id = ? AND citizenid = ?', { row.id, cid })
    else
        local role = type(payload.role) == 'string' and payload.role or 'assisting'
        if not CASE_ROLES[role] then role = 'assisting' end
        MySQL.query.await([[
            INSERT INTO phone_mdt_case_officers (case_id, citizenid, role, assigned_by, assigned_at)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE role = VALUES(role)
        ]], { row.id, cid, role, me.citizenid, now })
    end
    MySQL.update.await('UPDATE phone_mdt_cases SET updated_at = ? WHERE id = ?', { now, row.id })

    return util.ok({ case = caseDetail(src, caseRow(me, ref)) }),
        { entityType = 'case', entityId = ref, details = { officer = cid, assigned = payload.assigned ~= false } }
end)

---Links a report into a case, or unlinks it.
paperwork.casesLinkReport = access.audited('cases.edit', function(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and caseRow(me, ref)
    if not row then return util.fail('mdt.caseNoLongerExists', 'That case no longer exists') end

    local reportRef = util.limitedString(payload.reportRef, 16)
    if not reportRef then return util.fail('mdt.pickAReport', 'Pick a report') end

    local report = readable(me, reportRef)
    if not report then return util.fail('mdt.reportNotAvailable', 'That report is not available') end

    if payload.linked == false then
        MySQL.update.await(
            'DELETE FROM phone_mdt_case_reports WHERE case_id = ? AND report_id = ?', { row.id, report.id })
    else
        MySQL.query.await(
            'INSERT IGNORE INTO phone_mdt_case_reports (case_id, report_id) VALUES (?, ?)', { row.id, report.id })
    end
    MySQL.update.await('UPDATE phone_mdt_cases SET updated_at = ? WHERE id = ?', { os.time(), row.id })

    return util.ok({ case = caseDetail(src, caseRow(me, ref)) }),
        { entityType = 'case', entityId = ref, details = { report = reportRef, linked = payload.linked ~= false } }
end)

return paperwork
