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
---@type table Live records (server.mdt.live): field locks, the saved push and the access registry.
local live      = require 'server.mdt.live'
---@type table Court shares (server.mdt.shares): whether a court department may edit a warrant.
local shares    = require 'server.mdt.shares'
---@type table Revision history (server.mdt.revisions): the field-by-field trail of amendments.
local revisions = require 'server.mdt.revisions'
---@type fun(v: any): integer MDT page coercion (server.mdt.paging): a client page clamped to 1..MaxPage.
local pageOf = require('server.mdt.paging').pageOf

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

---@type integer Charge lines one warrant may carry.
local MAX_CHARGES = math.floor(tonumber((MDT.Limits or {}).Charges) or 40)

---@type integer Seconds in a day.
local DAY = 86400

---@type integer Longest note a warrant carries, in bytes.
local MAX_NOTES = 2000

---@type table<string, boolean> Warrant fields an edit may write.
local WARRANT_FIELDS <const> = { charges = true, bond = true, expiry = true, notes = true }

---@type string Client event every open terminal repaints its wanted flags from.
local WANTED_EVENT = 'sd-phone:client:mdt:warrant'

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
        id             = tonumber(row.id),
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
        issuedCid      = row.issued_cid,
        callsign       = (row.issued_callsign and row.issued_callsign ~= '') and row.issued_callsign or nil,
        issuedAt       = tonumber(row.issued_at) or 0,
        expiresAt      = expiry,
        active         = expiry > now,
        notes          = row.notes or '',
    }
end

---Encodes charge lines in a fixed key order, so equal charges always encode equal.
---@param charges table[] { code, count }
---@return string json
local function encodeCharges(charges)
    local parts = {}
    for i = 1, #charges do
        parts[i] = ('{"code":%s,"count":%d}'):format(json.encode(charges[i].code), math.floor(tonumber(charges[i].count) or 1))
    end
    return '[' .. table.concat(parts, ',') .. ']'
end

---Resolves a caller's access to one warrant. Every terminal with warrants.view reads them; a court
---edits through an editable share, the issuing department through warrants.issue, and only while active.
---@param src integer
---@param me table
---@param ref string
---@return LiveAccess|nil
local function warrantAccess(src, me, ref)
    if not access.can(src, 'warrants.view') then return nil end
    local row = MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE ref = ? LIMIT 1', { ref })
    if not row then return nil end
    local active = (tonumber(row.expiry) or 0) > os.time()
    if access.isCourt(me) then
        local level = shares.accessFor(me, 'warrant', ref)
        local edit = active and level == 'edit' and access.can(src, 'shared.edit')
        return { row = row, view = true, edit = edit, owner = false, restore = false, fields = edit and WARRANT_FIELDS or {}, access = level }
    end
    local mine = row.department == '' or row.department == me.job
    local edit = active and mine and access.can(src, 'warrants.issue')
    return {
        row = row, view = true, edit = edit, owner = mine and access.domain(me) == 'leo',
        restore = edit, fields = edit and WARRANT_FIELDS or {},
    }
end

---The warrant payload with what the caller may do to it.
---@param src integer
---@param me table
---@param row table
---@return table warrant
local function detailFor(src, me, row)
    local shape = shapeOf(row, os.time())
    local res = warrantAccess(src, me, row.ref)
    shape.canEdit      = res ~= nil and res.edit or false
    shape.canShare     = res ~= nil and res.owner and access.can(src, 'shares.create') or false
    shape.sharedAccess = res and res.access or nil
    return shape
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

---Trusted resource-facing read for the legacy Police warrant export. The legacy export has no
---caller source, so this is separate from the permission-gated terminal get handler.
---@param ref string|number
---@param domain 'leo'|'ems'
---@return table|nil warrant
function warrants.exportWarrant(ref, domain)
    local value = util.limitedString(type(ref) == 'string' and ref or tostring(ref or ''), 32)
    if not value or (domain ~= 'leo' and domain ~= 'ems') then return nil end
    local row
    if tonumber(value) then
        row = MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE id = ? LIMIT 1', { tonumber(value) })
    else
        row = MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE ref = ? LIMIT 1', { value })
    end
    if not row then return nil end
    local dept = access.departmentFor(row.department)
    if not dept or access.domain({ department = dept }) ~= domain then return nil end
    return shapeOf(row, os.time())
end

---A page of warrants, split into the active ones and the ones that have run out.
warrants.list = access.gated('warrants.view', function(_, payload, me)
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
    if access.isCourt(me) then
        local refs = {}
        for i = 1, #out do refs[i] = out[i].ref end
        local levels = shares.levelsFor(me, 'warrant', refs)
        for i = 1, #out do out[i].sharedAccess = levels[out[i].ref] end
    end
    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---One warrant in full.
warrants.get = access.gated('warrants.view', function(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local row = ref and MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE ref = ? LIMIT 1', { ref })
    if not row then return util.fail('mdt.warrantNoLongerExists', 'That warrant no longer exists') end
    return util.ok({ warrant = detailFor(src, me, row) })
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

---Amends a live warrant: only the fields named in `payload.fields` (every field when absent), refused
---while someone else holds one of them, with a revision per changed field.
---@param src integer
---@param payload table
---@param me table
---@return table envelope, table? audit
local function updateWarrant(src, payload, me)
    local ref = util.limitedString(payload.ref, 16)
    local res = ref and warrantAccess(src, me, ref)
    if not ref or not res or not res.edit then
        return util.fail('mdt.warrantNotEditable', 'That warrant can no longer be edited')
    end
    local row = res.row

    local fields = {}
    if type(payload.fields) == 'table' then
        for i = 1, #payload.fields do
            local field = payload.fields[i]
            if type(field) == 'string' and res.fields[field] then fields[field] = true end
        end
    else
        for field in pairs(res.fields) do fields[field] = true end
    end

    for field in pairs(fields) do
        local holder = live.lockedByOther('warrant', ref, field, src)
        if holder then return util.fail('mdt.fieldBeingEdited', '{name} is editing that', { name = holder }) end
    end

    local now = os.time()
    local sets, values, changed = {}, {}, {}

    if fields.charges then
        local raw = {}
        if type(payload.charges) == 'table' then
            for i = 1, #payload.charges do
                local c = payload.charges[i]
                if type(c) == 'table' and #raw < MAX_CHARGES then raw[#raw + 1] = { code = c.code, count = c.count } end
            end
        end
        local lines = offences.totalFor(raw)
        if #lines == 0 then return util.fail('mdt.warrantNeedsLeastOneCharge', 'A warrant needs at least one charge') end

        local charges = {}
        for i = 1, #lines do
            charges[i] = {
                code = lines[i].code, label = lines[i].label, class = lines[i].class,
                count = lines[i].count, months = lines[i].months, fine = lines[i].fine,
            }
        end
        local before, after = encodeCharges(decodeCharges(row.charges)), encodeCharges(charges)
        if before ~= after then
            local felonies, misdemeanors, infractions = offences.countByClass(lines)
            changed[#changed + 1] = { field = 'charges', before = before, after = after }
            sets[#sets + 1] = 'charges = ?, felonies = ?, misdemeanors = ?, infractions = ?'
            values[#values + 1] = json.encode(charges)
            values[#values + 1] = felonies
            values[#values + 1] = misdemeanors
            values[#values + 1] = infractions
        end
    end

    if fields.bond then
        local bond = util.wholeAmount(payload.bond)
        if bond > MAX_BOND then bond = MAX_BOND end
        local before = tostring(tonumber(row.bond) or 0)
        if before ~= tostring(bond) then
            changed[#changed + 1] = { field = 'bond', before = before, after = tostring(bond) }
            sets[#sets + 1] = 'bond = ?'
            values[#values + 1] = bond
        end
    end

    local expiryChanged = false
    if fields.expiry then
        local expiry = math.floor(tonumber(payload.expiresAt) or 0)
        if not util.finite(expiry) or expiry < now + 60 then expiry = now + 60 end
        if expiry > now + (MAX_DAYS * DAY) then expiry = now + (MAX_DAYS * DAY) end
        local before = tostring(tonumber(row.expiry) or 0)
        if before ~= tostring(expiry) then
            expiryChanged = true
            changed[#changed + 1] = { field = 'expiry', before = before, after = tostring(expiry) }
            sets[#sets + 1] = 'expiry = ?'
            values[#values + 1] = expiry
        end
    end

    if fields.notes then
        local notes = util.limitedString(payload.notes, MAX_NOTES) or ''
        local before = row.notes or ''
        if before ~= notes then
            changed[#changed + 1] = { field = 'notes', before = before, after = notes }
            sets[#sets + 1] = 'notes = ?'
            values[#values + 1] = notes
        end
    end

    if #sets > 0 then
        values[#values + 1] = row.id
        MySQL.update.await(('UPDATE phone_mdt_warrants SET %s WHERE id = ?'):format(table.concat(sets, ', ')), values)
    end

    for i = 1, #changed do
        revisions.record(me, 'warrant', ref, changed[i].field, changed[i].before, changed[i].after)
    end
    local names = {}
    for field in pairs(fields) do names[#names + 1] = field end
    live.saved('warrant', ref, src, names, me.name)

    if expiryChanged then announce(row.citizenid, warrants.isWanted(row.citizenid)) end

    local saved = MySQL.single.await('SELECT * FROM phone_mdt_warrants WHERE id = ? LIMIT 1', { row.id })
    if not saved then return util.fail('mdt.warrantNoLongerExists', 'That warrant no longer exists') end

    local changedNames = {}
    for i = 1, #changed do changedNames[i] = changed[i].field end
    return util.ok({ warrant = detailFor(src, me, saved) }), {
        entityType = 'warrant',
        entityId   = ref,
        details    = { subject = row.subject_name, citizenid = row.citizenid, fields = changedNames },
    }
end

---Amends a warrant under the key the caller's terminal edits with.
---@param src integer
---@param payload table
---@return table envelope
function warrants.update(src, payload)
    local me = access.identity(src)
    if not me then return util.fail('mdt.doNotHaveAccessTerminal', 'You do not have access to this terminal') end
    return access.audited(access.isCourt(me) and 'shared.edit' or 'warrants.issue', updateWarrant)(src, payload)
end

---Puts one warrant field back to an earlier value through the ordinary amend path.
---@param src integer
---@param me table
---@param ref string
---@param field string
---@param value string
---@return table envelope
local function restoreWarrant(src, me, ref, field, value)
    local res = warrantAccess(src, me, ref)
    if not res or not res.restore then return util.fail('mdt.rankDoesNotAllow', 'Your rank does not allow that') end

    local row = res.row
    local payload = {
        ref       = ref,
        fields    = { field },
        charges   = decodeCharges(row.charges),
        bond      = tonumber(row.bond) or 0,
        expiresAt = tonumber(row.expiry) or 0,
        notes     = row.notes or '',
    }
    if field == 'charges' then
        payload.charges = decodeCharges(value)
    elseif field == 'bond' or field == 'expiry' then
        payload[field == 'bond' and 'bond' or 'expiresAt'] = tonumber(value) or 0
    else
        payload.notes = value
    end
    return (updateWarrant(src, payload, me))
end

live.register('warrant', { resolve = warrantAccess, restore = restoreWarrant })

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
