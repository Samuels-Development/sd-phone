---@type table sd-phone config root (configs/config.lua); read for the authored-text caps.
local config           = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, clamps, string caps.
local util             = require 'server.util'
---@type table Records bridge (bridge.server.records): the framework's own citizen directory.
local frameworkRecords = require 'bridge.server.records'
---@type table MDT permissions (server.mdt.access): identity, the gate and the audited wrapper.
local access           = require 'server.mdt.access'
---@type table Reports and cases (server.mdt.paperwork): the paperwork a patient appears in.
local paperwork        = require 'server.mdt.paperwork'

---@type table Medical module; the table returned at end of file. The patient half of the medical
---terminal: identity, the medical file, and the EMS paperwork the person appears in.
---
---There is deliberately no criminal history here, no flags, no charges and no warrant check. A
---patient sheet is not a police sheet with the police parts hidden - the queries that would build
---those are simply not in this file, so no permission mistake can surface them.
local medical = {}

---@type table MDT config (configs/mdt.lua).
local MDT = (config.Mdt or {})
---@type table Authored-text caps.
local LIMITS = (MDT.Limits or {})
---@type table Paging caps.
local PAGING = (MDT.Paging or {})

---@type integer Rows one page of a patient search returns.
local PAGE_SIZE = math.max(1, math.floor(tonumber(PAGING.PageSize) or 25))
---@type integer Highest page a search will serve.
local MAX_PAGE = math.max(1, math.floor(tonumber(PAGING.MaxPage) or 400))
---@type integer Longest query accepted.
local MAX_QUERY = 60

---@type table<string, boolean> Blood types the editor offers. An unknown value is stored empty
---rather than refused, so a server that types them in by hand is not locked out of saving.
local BLOOD_TYPES = {
    ['A+'] = true, ['A-'] = true, ['B+'] = true, ['B-'] = true,
    ['AB+'] = true, ['AB-'] = true, ['O+'] = true, ['O-'] = true,
}

---Clamps a page number.
---@param v any
---@return integer page
local function pageOf(v)
    local page = math.floor(tonumber(v) or 1)
    if page < 1 then page = 1 end
    if page > MAX_PAGE then page = MAX_PAGE end
    return page
end

---The medical file for one citizen, or an empty one. A citizen with no row is not an error: it
---means nobody has treated them yet, and the sheet renders the same either way.
---@param citizenid string
---@return table file
local function fileOf(citizenid)
    local row = MySQL.single.await(
        'SELECT * FROM phone_mdt_medical WHERE citizenid = ? LIMIT 1', { citizenid })
    if not row then
        return {
            bloodType   = '',
            allergies   = '',
            conditions  = '',
            medications = '',
            notes       = '',
            dnr         = false,
            updatedBy   = '',
            updatedAt   = 0,
        }
    end
    return {
        bloodType   = row.blood_type or '',
        allergies   = row.allergies or '',
        conditions  = row.conditions or '',
        medications = row.medications or '',
        notes       = row.notes or '',
        dnr         = util.truthy(row.dnr),
        updatedBy   = row.updated_by or '',
        updatedAt   = tonumber(row.updated_at) or 0,
    }
end

---Medical files for a list of citizens, as one query, so a search page costs one round trip rather
---than one per row.
---@param cids string[]
---@return table<string, table> by citizenid
local function filesOf(cids)
    local out = {}
    if #cids == 0 then return out end

    local marks = {}
    for i = 1, #cids do marks[i] = '?' end
    local rows = MySQL.query.await(
        ('SELECT citizenid, blood_type, allergies, dnr FROM phone_mdt_medical WHERE citizenid IN (%s)')
            :format(table.concat(marks, ', ')), cids) or {}

    for i = 1, #rows do
        out[rows[i].citizenid] = {
            bloodType = rows[i].blood_type or '',
            allergies = rows[i].allergies or '',
            dnr       = util.truthy(rows[i].dnr),
        }
    end
    return out
end

---The EMS reports a patient is named on. Scoped through paperwork.visibility, so it carries the
---same domain separation every other report read does and can never return a police report.
---@param me table caller identity
---@param citizenid string
---@return table[] rows
local function paperworkFor(me, citizenid)
    local clause, args = paperwork.visibility(me)
    local params = {}
    for i = 1, #args do params[#params + 1] = args[i] end
    params[#params + 1] = citizenid

    local rows = MySQL.query.await(([[
        SELECT r.ref, r.title, r.type, r.created_at, i.role
        FROM phone_mdt_reports r
        JOIN phone_mdt_report_involved i ON i.report_id = r.id
        WHERE %s AND i.citizenid = ?
        ORDER BY r.created_at DESC
        LIMIT 25
    ]]):format(clause), params) or {}

    local out = {}
    for i = 1, #rows do
        out[i] = {
            ref       = rows[i].ref,
            title     = rows[i].title,
            type      = rows[i].type,
            role      = rows[i].role,
            createdAt = tonumber(rows[i].created_at) or 0,
        }
    end
    return out
end

---Searches the citizen directory for patients. The row carries only what triage needs at a glance:
---who they are, blood type, whether there is an allergy on file, and the DNR flag.
medical.patientsSearch = access.gated('patients.view', function(_, payload)
    local page  = pageOf(payload.page)
    local query = util.limitedString(payload.query, MAX_QUERY)

    local found, total = frameworkRecords.searchCitizens(query, page, PAGE_SIZE)
    found = found or {}

    local cids = {}
    for i = 1, #found do cids[i] = found[i].citizenid end
    local files = filesOf(cids)

    local rows = {}
    for i = 1, #found do
        local c = found[i]
        local file = files[c.citizenid] or {}
        rows[i] = {
            citizenid  = c.citizenid,
            name       = c.name,
            dob        = c.dob or '',
            sex        = c.sex or '',
            phone      = c.phone or '',
            bloodType  = file.bloodType or '',
            hasAllergy = (file.allergies or '') ~= '',
            dnr        = file.dnr == true,
        }
    end

    return util.ok({ rows = rows, total = tonumber(total) or #rows, page = page, pageSize = PAGE_SIZE })
end)

---One patient sheet: identity, the medical file, and the EMS paperwork they appear in.
medical.patientsGet = access.gated('patients.view', function(_, payload, me)
    local citizenid = util.limitedString(payload.citizenid, 64)
    if not citizenid then return util.fail('mdt.noPatientSelected', 'No patient selected') end

    local citizen = frameworkRecords.getCitizen(citizenid)
    if not citizen then return util.fail('mdt.patientNotFile', 'That patient is not on file') end

    return util.ok({
        patient = {
            citizenid = citizenid,
            name      = citizen.name,
            dob       = citizen.dob or '',
            sex       = citizen.sex or '',
            phone     = citizen.phone or '',
            file      = fileOf(citizenid),
            reports   = paperworkFor(me, citizenid),
        },
    })
end)

---Writes the medical file. Every field is optional; an absent field is left as it was, so two
---medics editing different halves of a sheet do not overwrite each other.
medical.patientsUpdate = access.audited('patients.edit', function(_, payload, me)
    local citizenid = util.limitedString(payload.citizenid, 64)
    if not citizenid then return util.fail('mdt.noPatientSelected', 'No patient selected') end

    local current = fileOf(citizenid)

    local bloodType = current.bloodType
    if payload.bloodType ~= nil then
        local given = util.limitedString(payload.bloodType, 8) or ''
        bloodType = BLOOD_TYPES[given] and given or ''
    end

    local function field(key, cap)
        if payload[key] == nil then return current[key] end
        return util.limitedString(payload[key], cap) or ''
    end

    local allergies   = field('allergies', tonumber(LIMITS.Allergies) or 400)
    local conditions  = field('conditions', tonumber(LIMITS.Conditions) or 400)
    local medications = field('medications', tonumber(LIMITS.Medications) or 400)
    local notes       = field('notes', tonumber(LIMITS.MedicalNotes) or 4000)

    local dnr = current.dnr
    if payload.dnr ~= nil then dnr = payload.dnr == true end

    local stamp = me.callsign and me.callsign ~= '' and ('%s %s'):format(me.callsign, me.name) or me.name

    MySQL.query.await([[
        INSERT INTO phone_mdt_medical
            (citizenid, blood_type, allergies, conditions, medications, notes, dnr, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            `blood_type`  = VALUES(`blood_type`),
            `allergies`   = VALUES(`allergies`),
            `conditions`  = VALUES(`conditions`),
            `medications` = VALUES(`medications`),
            `notes`       = VALUES(`notes`),
            `dnr`         = VALUES(`dnr`),
            `updated_by`  = VALUES(`updated_by`),
            `updated_at`  = VALUES(`updated_at`)
    ]], { citizenid, bloodType, allergies, conditions, medications, notes, dnr and 1 or 0, stamp, os.time() })

    return util.ok({ file = fileOf(citizenid) }),
        { entityType = 'patient', entityId = citizenid, details = { dnr = dnr } }
end)

return medical
