---@type table sd-phone config root (configs/config.lua); read for the paging and sentence bounds.
local config    = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, clamping, string caps.
local util      = require 'server.util'
---@type table MDT persistence (server.mdt.store): the ref allocator and name hydration.
local store     = require 'server.mdt.store'
---@type table MDT permissions (server.mdt.access): the read gate, write wrapper and bench check.
local access    = require 'server.mdt.access'
---@type table Penal code (server.mdt.offences): charge resolution and the class counters.
local offences  = require 'server.mdt.offences'
---@type table Reports and cases (server.mdt.paperwork): the suspect-charge lookup a docket reads.
local paperwork = require 'server.mdt.paperwork'

---@type table Court module; the table returned at end of file. The docket a court runs and the
---expungement petitions it rules on. A court records what it decided; it does not police. The one
---mechanical effect it has is the granted expungement, which hides charge lines from the priors
---sheet without deleting the report they were filed on.
local court = {}

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt

---@type integer Rows returned per page.
local PAGE_SIZE = math.floor(tonumber((MDT.Paging or {}).PageSize) or 25)

---@type integer Highest page a client may ask for.
local MAX_PAGE = math.floor(tonumber((MDT.Paging or {}).MaxPage) or 400)

---@type integer Byte cap on a case title.
local MAX_TITLE = 160

---@type integer Byte cap on a summary, a ruling or a motion body.
local MAX_BODY = 6000

---@type integer Byte cap on one docket note.
local MAX_NOTE = 2000

---@type integer Notes returned with a case.
local NOTES_LIMIT = 100

---@type integer Report refs one expungement petition may name.
local MAX_SCOPE = 25

---@type integer Longest custodial sentence a court may hand down, in months.
local MAX_MONTHS = 600

---@type integer Largest fine a court may hand down.
local MAX_FINE = 1000000

---@type integer Furthest ahead a hearing may be listed, in seconds.
local MAX_HEARING_AHEAD = 86400 * 90

---@type table<string, boolean> Where a case sits on the docket.
local STATUSES = {
    filed     = true,
    arraigned = true,
    scheduled = true,
    trial     = true,
    closed    = true,
    dismissed = true,
}

---@type table<string, boolean> The defendant's plea.
local PLEAS = { guilty = true, not_guilty = true, no_contest = true }

---@type table<string, boolean> How a case ended.
local VERDICTS = { guilty = true, not_guilty = true, dismissed = true, mistrial = true, plea = true }

---@type table<string, boolean> What a docket note is. A motion and a ruling read differently on
---the timeline, and knowing which is which is most of what a docket is for.
local NOTE_KINDS = { note = true, motion = true, filing = true, ruling = true }

---@type table<string, boolean> Where an expungement petition sits.
local PETITION_STATUSES = { pending = true, granted = true, denied = true }

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

---Decodes a stored JSON array.
---@param raw any
---@return table[]
local function readList(raw)
    if type(raw) ~= 'string' or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---Normalises client evidence into the stored shape, on the same url rules as the police paperwork.
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

---A hearing time the client asked for, clamped to a sane window. Nil clears the listing.
---@param value any unix seconds
---@return integer|nil
local function hearingAt(value)
    local n = tonumber(value)
    if not util.finite(n) or n <= 0 then return nil end
    n = math.floor(n)
    local now = os.time()
    if n > now + MAX_HEARING_AHEAD then return now + MAX_HEARING_AHEAD end
    return n
end

---The list-row shape.
---@param row table DB row
---@return table
local function summaryOf(row)
    return {
        ref        = row.ref,
        title      = row.title,
        defendant  = (row.defendant_name ~= '' and row.defendant_name) or row.citizenid,
        citizenid  = row.citizenid,
        status     = row.status,
        plea       = row.plea,
        verdict    = row.verdict,
        hearingAt  = tonumber(row.hearing_at) or nil,
        judge      = row.judge_name,
        prosecutor = row.prosecutor_name,
        defence    = row.defence_name,
        charges    = #readList(row.charges),
        createdAt  = tonumber(row.created_at) or 0,
        updatedAt  = tonumber(row.updated_at) or 0,
    }
end

---The full case, list fields plus everything only the detail needs.
---@param row table DB row
---@param notes table[]
---@return table
local function detailOf(row, notes)
    local file = summaryOf(row)
    file.charges        = readList(row.charges)
    file.evidence       = readList(row.evidence)
    file.summary        = row.summary or ''
    file.ruling         = row.ruling or ''
    file.reportRef      = row.report_ref
    file.sentenceMonths = tonumber(row.sentence_months) or 0
    file.sentenceFine   = tonumber(row.sentence_fine) or 0
    file.filedBy        = row.filed_name
    file.judgeId        = row.judge_cid
    file.prosecutorId   = row.prosecutor_cid
    file.defenceId      = row.defence_cid
    file.notes          = notes
    return file
end

---Every note on a case, oldest first: the docket timeline.
---@param id integer
---@return table[]
local function notesFor(id)
    local rows = MySQL.query.await([[
        SELECT author_name, kind, body, created_at FROM phone_mdt_court_notes
        WHERE court_id = ? ORDER BY created_at ASC LIMIT ?
    ]], { id, NOTES_LIMIT }) or {}

    local out = {}
    for i = 1, #rows do
        out[i] = {
            author    = rows[i].author_name,
            kind      = rows[i].kind,
            body      = rows[i].body,
            createdAt = tonumber(rows[i].created_at) or 0,
        }
    end
    return out
end

---Loads a case by ref.
---@param ref any
---@return table|nil row
local function rowFor(ref)
    local key = util.limitedString(ref, 16)
    if not key then return nil end
    return MySQL.single.await('SELECT * FROM phone_mdt_court_cases WHERE ref = ? LIMIT 1', { key })
end

---A page of the docket. Every court department reads the same docket: an attorney who cannot see
---the case list cannot pick up a brief.
court.list = access.gated('court.view', function(_, payload, me)
    local where, params = { '1 = 1' }, {}

    local status = oneOf(payload.status, STATUSES, nil)
    if status then
        where[#where + 1] = 'status = ?'
        params[#params + 1] = status
    end

    -- Whose cases "mine" means is taken from the resolved identity, never from the payload.
    if payload.mine == true then
        where[#where + 1] = '(judge_cid = ? OR prosecutor_cid = ? OR defence_cid = ?)'
        for _ = 1, 3 do params[#params + 1] = me.citizenid end
    end

    local query = util.limitedString(payload.query, 60)
    if query then
        where[#where + 1] = '(title LIKE ? OR defendant_name LIKE ? OR ref LIKE ?)'
        local like = '%' .. likeSafe(query) .. '%'
        for _ = 1, 3 do params[#params + 1] = like end
    end

    local clauses = table.concat(where, ' AND ')
    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_mdt_court_cases WHERE %s'):format(clauses), params)) or 0

    local page = pageOf(payload.page)
    local rows = MySQL.query.await(([[
        SELECT * FROM phone_mdt_court_cases WHERE %s
        ORDER BY (hearing_at IS NULL), hearing_at ASC, updated_at DESC
        LIMIT %d OFFSET %d
    ]]):format(clauses, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local out = {}
    for i = 1, #rows do out[i] = summaryOf(rows[i]) end
    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---One case in full, with its docket timeline.
court.get = access.gated('court.view', function(_, payload)
    local row = rowFor(payload.ref)
    if not row then return util.fail('mdt.caseNotDocket', 'That case is not on the docket') end
    return util.ok({ file = detailOf(row, notesFor(row.id)) })
end)

---Court history for one citizen, newest first. Read by the person record.
court.forCitizen = access.gated('court.view', function(_, payload)
    local cid = util.limitedString(payload.citizenid, 64)
    if not cid then return util.fail('mdt.unknownCitizen', 'Unknown citizen') end

    local rows = MySQL.query.await([[
        SELECT * FROM phone_mdt_court_cases WHERE citizenid = ?
        ORDER BY created_at DESC LIMIT 25
    ]], { cid }) or {}

    local out = {}
    for i = 1, #rows do out[i] = summaryOf(rows[i]) end
    return util.ok({ rows = out })
end)

---Files a case onto the docket. When a report is named the charges come from that report's own
---rows for this defendant, so what the court is trying can never be dictated by the client.
court.fileCase = access.audited('court.file', function(_, payload, me)
    local cid = util.limitedString(payload.citizenid, 64)
    if not cid then return util.fail('mdt.pickDefendant', 'Pick a defendant') end

    local title = util.limitedString(payload.title, MAX_TITLE)
    if not title then return util.fail('mdt.caseTitleRequired', 'A case needs a title') end

    local reportRef = util.limitedString(payload.reportRef, 16)
    local defendant, raw = nil, {}

    if reportRef then
        local report, suspect, rows = paperwork.suspectCharges(me, reportRef, cid)
        if not report then return util.fail('mdt.reportNotAvailable', 'That report is not available') end
        if not suspect then return util.fail('mdt.citizenNotSuspectReport', 'That citizen is not a suspect on that report') end
        defendant = suspect.name
        raw = rows
    elseif type(payload.charges) == 'table' then
        for i = 1, #payload.charges do
            local c = payload.charges[i]
            if type(c) == 'table' and #raw < 40 then
                raw[#raw + 1] = { code = c.code, count = c.count }
            end
        end
    end

    local lines = offences.totalFor(raw)
    if #lines == 0 then return util.fail('mdt.caseNeedsLeastOneCharge', 'A case needs at least one charge') end

    if not defendant then defendant = store.namesFor({ cid })[cid] end

    local charges = {}
    for i = 1, #lines do
        charges[i] = {
            code   = lines[i].code,
            label  = lines[i].label,
            class  = lines[i].class,
            count  = lines[i].count,
            months = lines[i].months,
            fine   = lines[i].fine,
        }
    end

    local ref = store.nextRef('court')
    if not ref then return util.fail('mdt.couldNotAllocateCaseNumber', 'Could not allocate a case number') end

    -- The filer takes the chair their department sits in: an attorney who files is prosecuting it,
    -- a judge who files is the one hearing it.
    local bench = access.isBench(me)
    local now = os.time()

    MySQL.insert.await([[
        INSERT INTO phone_mdt_court_cases
            (ref, title, citizenid, defendant_name, report_ref, charges, summary, evidence,
             status, judge_cid, judge_name, prosecutor_cid, prosecutor_name,
             filed_cid, filed_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'filed', ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        ref, title, cid, defendant or cid, reportRef, json.encode(charges),
        util.limitedString(payload.summary, MAX_BODY) or '',
        json.encode(sanitizeEvidence(payload.evidence)),
        bench and me.citizenid or nil, bench and me.name or nil,
        (not bench) and me.citizenid or nil, (not bench) and me.name or nil,
        me.citizenid, me.name, now, now,
    })

    local row = MySQL.single.await('SELECT * FROM phone_mdt_court_cases WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.caseCouldNotFiled', 'The case could not be filed') end

    return util.ok({ file = detailOf(row, {}) }), {
        entityType = 'court',
        entityId   = ref,
        details    = { defendant = defendant or cid, citizenid = cid, reportRef = reportRef },
    }
end)

---Schedules and staffs a case: the hearing time, the bench and both counsel tables. Bench only,
---because the court controls its own calendar.
court.manage = access.audited('court.manage', function(_, payload, me)
    local row = rowFor(payload.ref)
    if not row then return util.fail('mdt.caseNotDocket', 'That case is not on the docket') end
    if row.status == 'closed' or row.status == 'dismissed' then
        return util.fail('mdt.caseHasAlreadyBeenDecided', 'That case has already been decided')
    end

    local sets, params = {}, {}

    local status = oneOf(payload.status, STATUSES, nil)
    if status and status ~= 'closed' and status ~= 'dismissed' then
        sets[#sets + 1] = 'status = ?'
        params[#params + 1] = status
    end

    if payload.title ~= nil then
        local title = util.limitedString(payload.title, MAX_TITLE)
        if not title then return util.fail('mdt.caseTitleRequired', 'A case needs a title') end
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

    if payload.plea ~= nil then
        local plea = oneOf(payload.plea, PLEAS, nil)
        sets[#sets + 1] = 'plea = ?'
        params[#params + 1] = plea
    end

    if payload.hearingAt ~= nil then
        sets[#sets + 1] = 'hearing_at = ?'
        params[#params + 1] = hearingAt(payload.hearingAt)
    end

    -- Each chair is set from a citizenid the caller names; the display name is resolved here so a
    -- client cannot write a title onto somebody else's seat.
    local seats = {
        { field = 'judge',      key = 'judge' },
        { field = 'prosecutor', key = 'prosecutor' },
        { field = 'defence',    key = 'defence' },
    }
    for i = 1, #seats do
        local seat = seats[i]
        local given = payload[seat.key]
        if given ~= nil then
            local cid = util.limitedString(given, 64)
            if cid then
                local names = store.namesFor({ cid })
                sets[#sets + 1] = seat.field .. '_cid = ?'
                params[#params + 1] = cid
                sets[#sets + 1] = seat.field .. '_name = ?'
                params[#params + 1] = names[cid] or cid
            else
                sets[#sets + 1] = seat.field .. '_cid = NULL'
                sets[#sets + 1] = seat.field .. '_name = NULL'
            end
        end
    end

    if #sets == 0 then return util.fail('mdt.nothingChange', 'Nothing to change') end

    sets[#sets + 1] = 'updated_at = ?'
    params[#params + 1] = os.time()
    params[#params + 1] = row.id

    MySQL.update.await(
        ('UPDATE phone_mdt_court_cases SET %s WHERE id = ?'):format(table.concat(sets, ', ')), params)

    local fresh = MySQL.single.await('SELECT * FROM phone_mdt_court_cases WHERE id = ? LIMIT 1', { row.id })
    if not fresh then return util.fail('mdt.caseNotDocket', 'That case is not on the docket') end

    return util.ok({ file = detailOf(fresh, notesFor(row.id)) }), {
        entityType = 'court',
        entityId   = row.ref,
        details    = { defendant = row.defendant_name, status = status, by = me.name },
    }
end)

---Appends to the docket timeline: a motion, a filing, a ruling or a plain note. Append-only, the
---way a real docket is. Both counsel and the bench may write.
court.note = access.audited('court.file', function(_, payload, me)
    local row = rowFor(payload.ref)
    if not row then return util.fail('mdt.caseNotDocket', 'That case is not on the docket') end

    local body = util.limitedString(payload.body, MAX_NOTE)
    if not body then return util.fail('mdt.writeSomethingFirst', 'Write something first') end

    local kind = oneOf(payload.kind, NOTE_KINDS, 'note')
    -- Only the bench enters a ruling on the record.
    if kind == 'ruling' and not access.isBench(me) then kind = 'motion' end

    local now = os.time()
    MySQL.insert.await([[
        INSERT INTO phone_mdt_court_notes (court_id, author_cid, author_name, kind, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ]], { row.id, me.citizenid, me.name, kind, body, now })

    MySQL.update.await('UPDATE phone_mdt_court_cases SET updated_at = ? WHERE id = ?', { now, row.id })

    return util.ok({ notes = notesFor(row.id) }), {
        entityType = 'court',
        entityId   = row.ref,
        details    = { defendant = row.defendant_name, kind = kind },
    }
end)

---Rules on a case: the verdict, the sentence and the written reasons. Bench only, and it closes
---the case. The sentence is recorded rather than executed: the court says what it decided and the
---department that holds the defendant carries it out.
court.rule = access.audited('court.rule', function(_, payload, me)
    local row = rowFor(payload.ref)
    if not row then return util.fail('mdt.caseNotDocket', 'That case is not on the docket') end
    if row.status == 'closed' or row.status == 'dismissed' then
        return util.fail('mdt.caseHasAlreadyBeenDecided', 'That case has already been decided')
    end

    local verdict = oneOf(payload.verdict, VERDICTS, nil)
    if not verdict then return util.fail('mdt.pickVerdict', 'Pick a verdict') end

    local months, fine = 0, 0
    if verdict == 'guilty' or verdict == 'plea' then
        months = math.floor(tonumber(payload.sentenceMonths) or 0)
        if not util.finite(months) or months < 0 then months = 0 end
        if months > MAX_MONTHS then months = MAX_MONTHS end

        fine = util.wholeAmount(payload.sentenceFine)
        if fine > MAX_FINE then fine = MAX_FINE end
    end

    local status = (verdict == 'dismissed') and 'dismissed' or 'closed'
    local now = os.time()

    MySQL.update.await([[
        UPDATE phone_mdt_court_cases
        SET status = ?, verdict = ?, sentence_months = ?, sentence_fine = ?, ruling = ?,
            judge_cid = COALESCE(judge_cid, ?), judge_name = COALESCE(judge_name, ?), updated_at = ?
        WHERE id = ?
    ]], {
        status, verdict, months, fine, util.limitedString(payload.ruling, MAX_BODY) or '',
        me.citizenid, me.name, now, row.id,
    })

    local fresh = MySQL.single.await('SELECT * FROM phone_mdt_court_cases WHERE id = ? LIMIT 1', { row.id })
    if not fresh then return util.fail('mdt.caseNotDocket', 'That case is not on the docket') end

    return util.ok({ file = detailOf(fresh, notesFor(row.id)) }), {
        entityType = 'court',
        entityId   = row.ref,
        details    = {
            defendant = row.defendant_name,
            citizenid = row.citizenid,
            verdict   = verdict,
            months    = months,
            fine      = fine,
        },
    }
end)

---The report refs a petition names, capped and de-duplicated. An empty list means the whole
---record, which is what a blanket petition asks for.
---@param value any
---@return string[] refs
local function scopeOf(value)
    if type(value) ~= 'table' then return {} end
    local seen, out = {}, {}
    for i = 1, #value do
        local ref = util.limitedString(value[i], 16)
        if ref and not seen[ref] and #out < MAX_SCOPE then
            seen[ref] = true
            out[#out + 1] = ref
        end
    end
    return out
end

---The petition list-row shape.
---@param row table DB row
---@return table
local function petitionOf(row)
    return {
        ref        = row.ref,
        citizenid  = row.citizenid,
        subject    = (row.subject_name ~= '' and row.subject_name) or row.citizenid,
        scope      = readList(row.scope),
        reason     = row.reason or '',
        status     = row.status,
        ruling     = row.ruling or '',
        filedBy    = row.filed_name,
        ruledBy    = row.ruled_name,
        cleared    = tonumber(row.charges_cleared) or 0,
        createdAt  = tonumber(row.created_at) or 0,
        updatedAt  = tonumber(row.updated_at) or 0,
    }
end

---A page of expungement petitions.
court.petitions = access.gated('expunge.view', function(_, payload)
    local where, params = { '1 = 1' }, {}

    local status = oneOf(payload.status, PETITION_STATUSES, nil)
    if status then
        where[#where + 1] = 'status = ?'
        params[#params + 1] = status
    end

    local query = util.limitedString(payload.query, 60)
    if query then
        where[#where + 1] = '(subject_name LIKE ? OR citizenid LIKE ? OR ref LIKE ?)'
        local like = '%' .. likeSafe(query) .. '%'
        for _ = 1, 3 do params[#params + 1] = like end
    end

    local clauses = table.concat(where, ' AND ')
    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_mdt_expungements WHERE %s'):format(clauses), params)) or 0

    local page = pageOf(payload.page)
    local rows = MySQL.query.await(([[
        SELECT * FROM phone_mdt_expungements WHERE %s
        ORDER BY (status = 'pending') DESC, updated_at DESC LIMIT %d OFFSET %d
    ]]):format(clauses, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local out = {}
    for i = 1, #rows do out[i] = petitionOf(rows[i]) end
    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---Files an expungement petition against a citizen's record.
court.petition = access.audited('expunge.file', function(_, payload, me)
    local cid = util.limitedString(payload.citizenid, 64)
    if not cid then return util.fail('mdt.pickCitizen', 'Pick a citizen') end

    local reason = util.limitedString(payload.reason, MAX_BODY)
    if not reason then return util.fail('mdt.petitionNeedsReason', 'A petition needs a reason') end

    local ref = store.nextRef('expunge')
    if not ref then return util.fail('mdt.couldNotAllocatePetitionNumber', 'Could not allocate a petition number') end

    local names = store.namesFor({ cid })
    local now = os.time()

    MySQL.insert.await([[
        INSERT INTO phone_mdt_expungements
            (ref, citizenid, subject_name, scope, reason, status, filed_cid, filed_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    ]], {
        ref, cid, names[cid] or cid, json.encode(scopeOf(payload.scope)), reason,
        me.citizenid, me.name, now, now,
    })

    local row = MySQL.single.await('SELECT * FROM phone_mdt_expungements WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.petitionCouldNotFiled', 'The petition could not be filed') end

    return util.ok({ petition = petitionOf(row) }), {
        entityType = 'expunge',
        entityId   = ref,
        details    = { subject = names[cid] or cid, citizenid = cid },
    }
end)

---Rules on a petition. Granting is the court's one mechanical power: it flags the citizen's charge
---lines expunged so they stop appearing as priors. The report rows themselves survive untouched,
---so the paperwork an officer filed is never rewritten by a court.
court.rulePetition = access.audited('expunge.rule', function(_, payload, me)
    local key = util.limitedString(payload.ref, 16)
    local row = key and MySQL.single.await('SELECT * FROM phone_mdt_expungements WHERE ref = ? LIMIT 1', { key })
    if not row then return util.fail('mdt.petitionNoLongerExists', 'That petition no longer exists') end
    if row.status ~= 'pending' then return util.fail('mdt.petitionHasAlreadyBeenRuled', 'That petition has already been ruled on') end

    local grant = payload.grant == true
    local cleared = 0

    if grant then
        local scope = readList(row.scope)
        if #scope > 0 then
            local marks = {}
            local params = { row.citizenid }
            for i = 1, #scope do
                marks[i] = '?'
                params[#params + 1] = scope[i]
            end
            cleared = MySQL.update.await(([[
                UPDATE phone_mdt_report_charges c
                JOIN phone_mdt_reports r ON r.id = c.report_id
                SET c.expunged = 1
                WHERE c.citizenid = ? AND c.expunged = 0 AND r.ref IN (%s)
            ]]):format(table.concat(marks, ', ')), params) or 0
        else
            cleared = MySQL.update.await(
                'UPDATE phone_mdt_report_charges SET expunged = 1 WHERE citizenid = ? AND expunged = 0',
                { row.citizenid }) or 0
        end
    end

    local now = os.time()
    MySQL.update.await([[
        UPDATE phone_mdt_expungements
        SET status = ?, ruling = ?, ruled_cid = ?, ruled_name = ?, charges_cleared = ?, updated_at = ?
        WHERE id = ?
    ]], {
        grant and 'granted' or 'denied', util.limitedString(payload.ruling, MAX_BODY) or '',
        me.citizenid, me.name, cleared, now, row.id,
    })

    local fresh = MySQL.single.await('SELECT * FROM phone_mdt_expungements WHERE id = ? LIMIT 1', { row.id })
    if not fresh then return util.fail('mdt.petitionNoLongerExists', 'That petition no longer exists') end

    return util.ok({ petition = petitionOf(fresh) }), {
        entityType = 'expunge',
        entityId   = row.ref,
        details    = {
            subject   = row.subject_name,
            citizenid = row.citizenid,
            granted   = grant,
            cleared   = cleared,
        },
    }
end)

return court
