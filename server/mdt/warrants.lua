---@type table sd-phone config root (configs/config.lua); read for the expiry and bond bounds.
local config    = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, clamping, string caps.
local util      = require 'server.util'
---@type table MDT persistence (server.mdt.store): the ref allocator and name hydration.
local store     = require 'server.mdt.store'
---@type table MDT permissions (server.mdt.access): the read gate, write wrapper and audience.
local access    = require 'server.mdt.access'
---@type table Penal code (server.mdt.offences): charge resolution and the class counters.
local offences  = require 'server.mdt.offences'
---@type table Reports and cases (server.mdt.paperwork): the suspect-charge lookup a warrant reads.
local paperwork = require 'server.mdt.paperwork'

---@type table Warrants module; the table returned at end of file. A warrant is active while its
---expiry is in the future, and closing one expires it rather than deleting it.
local warrants = {}

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt

---@type table Warrant settings (configs/mdt.lua Warrants).
local W = MDT.Warrants or {}

---@type integer Days a warrant runs for when the issuing officer names no expiry.
local DEFAULT_DAYS = math.max(1, math.floor(tonumber(W.DefaultExpiryDays) or 7))

---@type integer Longest expiry an officer may set, in days.
local MAX_DAYS = math.max(1, math.floor(tonumber(W.MaxExpiryDays) or 90))

---@type integer Highest bond a warrant may carry.
local MAX_BOND = math.floor(tonumber(W.MaxBond) or 500000)

---@type integer Rows returned per page.
local PAGE_SIZE = math.floor(tonumber((MDT.Paging or {}).PageSize) or 25)

---@type integer Highest page a client may ask for.
local MAX_PAGE = math.floor(tonumber((MDT.Paging or {}).MaxPage) or 400)

---@type integer Charge lines one warrant may carry.
local MAX_CHARGES = math.floor(tonumber((MDT.Limits or {}).Charges) or 40)

---@type integer Seconds in a day.
local DAY = 86400

---@type string Client event every open terminal repaints its wanted flags from.
local WANTED_EVENT = 'sd-phone:client:mdt:warrant'

---Coerces a client page number to a whole page inside the served range.
---@param v any
---@return integer page 1..MAX_PAGE
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

---Tells every terminal that a citizen's wanted state changed, so an open person record repaints
---without a refetch.
---@param citizenid string
---@param wanted boolean
local function announce(citizenid, wanted)
    util.pushMany(WANTED_EVENT, access.audience(), { citizenid = citizenid, wanted = wanted })
end

---Decodes a stored charge blob back into warrant charge lines.
---@param raw any stored JSON text
---@return table[] charges
local function decodeCharges(raw)
    if type(raw) ~= 'string' or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---The warrant payload shape, shared by the list and the detail.
---@param row table DB row
---@param now integer unix seconds
---@return table warrant
local function shapeOf(row, now)
    local expiry = tonumber(row.expiry) or 0
    return {
        ref            = row.ref,
        citizenid      = row.citizenid,
        subject        = (row.subject_name and row.subject_name ~= '') and row.subject_name or row.citizenid,
        reportRef      = row.report_ref,
        charges        = decodeCharges(row.charges),
        felonies       = tonumber(row.felonies) or 0,
        misdemeanors   = tonumber(row.misdemeanors) or 0,
        infractions    = tonumber(row.infractions) or 0,
        bond           = tonumber(row.bond) or 0,
        officer        = row.issued_name or '',
        callsign       = (row.issued_callsign and row.issued_callsign ~= '') and row.issued_callsign or nil,
        issuedAt       = tonumber(row.issued_at) or 0,
        expiresAt      = expiry,
        active         = expiry > now,
    }
end

---Whether a citizen currently has an unexpired warrant against them.
---@param citizenid any
---@return boolean wanted
function warrants.isWanted(citizenid)
    if type(citizenid) ~= 'string' or citizenid == '' then return false end
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_mdt_warrants WHERE citizenid = ? AND expiry > ? LIMIT 1',
        { citizenid, os.time() }) ~= nil
end

---Wanted state for a whole page of citizens in one query.
---@param cids string[]
---@return table<string, boolean> wanted
function warrants.wantedSet(cids)
    local out = {}
    if type(cids) ~= 'table' or #cids == 0 then return out end

    local marks, params = {}, {}
    for i = 1, #cids do
        marks[i]  = '?'
        params[i] = cids[i]
    end
    params[#params + 1] = os.time()

    local rows = MySQL.query.await(([[
        SELECT DISTINCT citizenid FROM phone_mdt_warrants
        WHERE citizenid IN (%s) AND expiry > ?
    ]]):format(table.concat(marks, ',')), params) or {}

    for i = 1, #rows do out[rows[i].citizenid] = true end
    return out
end

---Every unexpired warrant against one citizen, newest first. Read by the person record.
---@param citizenid any
---@return table[] warrants
function warrants.activeFor(citizenid)
    if type(citizenid) ~= 'string' or citizenid == '' then return {} end

    local now  = os.time()
    local rows = MySQL.query.await([[
        SELECT * FROM phone_mdt_warrants WHERE citizenid = ? AND expiry > ?
        ORDER BY issued_at DESC
    ]], { citizenid, now }) or {}

    local out = {}
    for i = 1, #rows do out[i] = shapeOf(rows[i], now) end
    return out
end

---A page of warrants, split into the active ones and the ones that have run out.
warrants.list = access.gated('warrants.view', function(_, payload)
    local now = os.time()
    local where, params = { 'w.expiry > ?' }, { now }
    if payload.status == 'expired' then
        where, params = { 'w.expiry <= ?' }, { now }
    end

    local query = util.limitedString(payload.query, 60)
    if query then
        where[#where + 1] = '(w.subject_name LIKE ? OR w.citizenid LIKE ? OR w.ref LIKE ?)'
        local like = '%' .. likeSafe(query) .. '%'
        for _ = 1, 3 do params[#params + 1] = like end
    end

    local clauses = table.concat(where, ' AND ')
    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_mdt_warrants w WHERE %s'):format(clauses), params)) or 0

    local page = pageOf(payload.page)
    local rows = MySQL.query.await(([[
        SELECT w.* FROM phone_mdt_warrants w WHERE %s
        ORDER BY w.issued_at DESC LIMIT %d OFFSET %d
    ]]):format(clauses, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local out = {}
    for i = 1, #rows do out[i] = shapeOf(rows[i], now) end
    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---One warrant in full.
warrants.get = access.gated('warrants.view', function(_, payload)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.warrantNoLongerExists', 'That warrant no longer exists') end
    return util.ok({ warrant = shapeOf(row, os.time()) })
end)

---Issues a warrant. When a report is attached the charges come from that report's own rows for
---this suspect, so the counters can never be dictated by the client.
warrants.issue = access.audited('warrants.issue', function(_, payload, me)
    local citizenid = util.limitedString(payload.citizenid, 64)
    if not citizenid then return util.fail('mdt.pickCitizen', 'Pick a citizen') end

    local reportRef = util.limitedString(payload.reportRef, 16)
    local reportId, subject

    local raw = {}
    if reportRef then
        local report, suspect, rows = paperwork.suspectCharges(me, reportRef, citizenid)
        if not report then return util.fail('mdt.reportNotAvailable', 'That report is not available') end
        if not suspect then return util.fail('mdt.citizenNotSuspectReport', 'That citizen is not a suspect on that report') end
        reportId = report.id
        subject  = suspect.name
        raw      = rows
    elseif type(payload.charges) == 'table' then
        for i = 1, #payload.charges do
            local c = payload.charges[i]
            if type(c) == 'table' and #raw < MAX_CHARGES then
                raw[#raw + 1] = { code = c.code, count = c.count }
            end
        end
    end

    local lines = offences.totalFor(raw)
    if #lines == 0 then return util.fail('mdt.warrantNeedsLeastOneCharge', 'A warrant needs at least one charge') end

    if not subject then subject = store.namesFor({ citizenid })[citizenid] end

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

    local felonies, misdemeanors, infractions = offences.countByClass(lines)

    local days = math.floor(tonumber(payload.expiryDays) or DEFAULT_DAYS)
    if not util.finite(days) or days < 1 then days = DEFAULT_DAYS end
    if days > MAX_DAYS then days = MAX_DAYS end

    local bond = util.wholeAmount(payload.bond)
    if bond > MAX_BOND then bond = MAX_BOND end

    local ref = store.nextRef('warrant')
    if not ref then return util.fail('mdt.couldNotAllocateWarrantNumber', 'Could not allocate a warrant number') end

    local now = os.time()
    MySQL.insert.await([[
        INSERT INTO phone_mdt_warrants
            (ref, citizenid, subject_name, report_id, report_ref, charges, felonies, misdemeanors,
             infractions, bond, issued_cid, issued_name, issued_callsign, department, issued_at, expiry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        ref, citizenid, subject or citizenid, reportId, reportRef, json.encode(charges),
        felonies, misdemeanors, infractions, bond,
        me.citizenid, me.name, me.callsign, me.job, now, now + (days * DAY),
    })

    local row = MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.warrantCouldNotIssued', 'The warrant could not be issued') end

    announce(citizenid, true)

    return util.ok({ warrant = shapeOf(row, now) }), {
        entityType = 'warrant',
        entityId   = ref,
        details    = { subject = subject or citizenid, citizenid = citizenid, reportRef = reportRef, days = days },
    }
end)

---Closes a warrant by expiring it. The row survives, so the subject's history stays intact. Only
---the department that issued a warrant may close it, however wide the read is.
warrants.close = access.audited('warrants.close', function(_, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.warrantNoLongerExists', 'That warrant no longer exists') end
    if row.department ~= '' and row.department ~= me.job then
        return util.fail('mdt.warrantBelongsAnotherDepartment', 'That warrant belongs to another department')
    end

    local now = os.time()
    if (tonumber(row.expiry) or 0) <= now then return util.fail('mdt.warrantAlreadyClosed', 'That warrant is already closed') end

    MySQL.update.await('UPDATE phone_mdt_warrants SET expiry = ? WHERE id = ?', { now, row.id })
    row.expiry = now

    announce(row.citizenid, warrants.isWanted(row.citizenid))

    return util.ok({ warrant = shapeOf(row, now) }), {
        entityType = 'warrant',
        entityId   = ref,
        details    = { subject = row.subject_name, citizenid = row.citizenid },
    }
end)

---Voids a warrant from the bench. Distinct from closing one: a court quashing a warrant is not the
---issuing department deciding it is served, so it deliberately ignores the department guard that
---close() enforces. Only a bench department reaches the key.
warrants.void = access.audited('warrants.void', function(_, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.warrantNoLongerExists', 'That warrant no longer exists') end

    local now = os.time()
    if (tonumber(row.expiry) or 0) <= now then return util.fail('mdt.warrantAlreadyClosed', 'That warrant is already closed') end

    MySQL.update.await('UPDATE phone_mdt_warrants SET expiry = ? WHERE id = ?', { now, row.id })
    row.expiry = now

    announce(row.citizenid, warrants.isWanted(row.citizenid))

    return util.ok({ warrant = shapeOf(row, now) }), {
        entityType = 'warrant',
        entityId   = ref,
        details    = { subject = row.subject_name, citizenid = row.citizenid, voidedBy = me.name },
    }
end)

return warrants
