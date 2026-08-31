---@type table Shared server helpers (server.util): envelopes, clamping, TINYINT reads.
local util = require 'server.util'
---@type table Framework record bridge (bridge.server.records): read-only citizen + vehicle reads.
local frameworkRecords = require 'bridge.server.records'
---@type table MDT permission layer (server.mdt.access): gated/audited wrappers and identity.
local access = require 'server.mdt.access'
---@type table Reports and cases (server.mdt.paperwork): the report visibility clause priors reuse.
local paperwork = require 'server.mdt.paperwork'

---@type table Records module; the table returned at end of file. Persons and vehicles: the
---framework owns identity, the MDT owns the overlay it is composed with.
local records = {}

---@type integer Rows returned per page by every paginated read here.
local PAGE_SIZE = 25
---@type integer Highest page number a client may ask for.
local MAX_PAGE = 400
---@type integer Byte cap on a search term.
local MAX_QUERY = 64
---@type integer Byte cap on an officer's free-text notes.
local MAX_NOTES = 2000
---@type integer Byte cap on a stored mugshot URL.
local MAX_URL = 512
---@type integer Highest licence-point total a vehicle record may carry.
local MAX_POINTS = 24
---@type integer Charge lines returned as priors on one person sheet.
local PRIORS_LIMIT = 60
---@type integer Vehicles returned on one person sheet.
local OWNED_LIMIT = 40

---@type table<string, boolean> Descriptor flags an officer may set on a citizen record; mirrors
---the PersonFlag union in web/src/apps/mdt/data.ts.
local FLAGS = {
    wanted        = true,
    armed         = true,
    gang          = true,
    mental_health = true,
    flight_risk   = true,
    informant     = true,
}

---@type table<string, boolean> Registration states the DMV overlay accepts.
local STATUSES = {
    valid     = true,
    suspended = true,
    expired   = true,
    impounded = true,
}

---Warrant module, required on first use so the two records modules can reference each other
---without a load-order cycle.
---@return table warrants
local function warrantsModule()
    return require 'server.mdt.warrants'
end

---Coerces a client page number to a whole page inside the served range.
---@param v any client-supplied page
---@return integer page 1..MAX_PAGE
local function pageOf(v)
    local n = tonumber(v)
    if not util.finite(n) or n ~= math.floor(n) or n < 1 then return 1 end
    return n > MAX_PAGE and MAX_PAGE or n
end

---Normalised plate: trimmed, collapsed whitespace, uppercased. Nil when unusable.
---@param v any client-supplied plate
---@return string|nil
local function plateOf(v)
    local s = util.limitedString(v, 16)
    if not s then return nil end
    return (s:gsub('%s+', ' '):upper())
end

---A `?, ?, ?` placeholder list for an IN clause of `n` values.
---@param n integer
---@return string
local function marks(n)
    local out = {}
    for i = 1, n do out[i] = '?' end
    return table.concat(out, ',')
end

---Decodes a stored flags column into the whitelisted subset, in a stable order.
---@param raw any stored JSON array
---@return string[] flags
local function decodeFlags(raw)
    local list = raw
    if type(list) == 'string' then
        local ok, decoded = pcall(json.decode, list)
        list = ok and decoded or nil
    end
    if type(list) ~= 'table' then return {} end

    local seen, out = {}, {}
    for _, f in ipairs(list) do
        if type(f) == 'string' and FLAGS[f] and not seen[f] then
            seen[f] = true
            out[#out + 1] = f
        end
    end
    table.sort(out)
    return out
end

---Clamps a client flags array to the whitelist, de-duplicated and sorted.
---@param raw any client-supplied array
---@return string[] flags
local function sanitizeFlags(raw)
    if type(raw) ~= 'table' then return {} end
    local seen, out = {}, {}
    for _, f in ipairs(raw) do
        if type(f) == 'string' and FLAGS[f] and not seen[f] then
            seen[f] = true
            out[#out + 1] = f
        end
    end
    table.sort(out)
    return out
end

---The MDT-owned overlay row for a citizen, defaulted when none has been written.
---@param citizenid string
---@return table overlay { notes, flags, mugshot, updatedAt, updatedBy }
local function personOverlay(citizenid)
    local row = MySQL.single.await([[
        SELECT notes, flags, mugshot, updated_by, updated_at
        FROM phone_mdt_person_records WHERE citizenid = ?
    ]], { citizenid })
    if not row then return { notes = '', flags = {}, mugshot = nil } end
    return {
        notes     = row.notes or '',
        flags     = decodeFlags(row.flags),
        mugshot   = (row.mugshot and row.mugshot ~= '') and row.mugshot or nil,
        updatedBy = row.updated_by,
        updatedAt = tonumber(row.updated_at),
    }
end

---Overlays for a page of citizens, keyed by citizenid. One statement per page.
---@param cids string[]
---@return table<string, table> overlays
local function personOverlays(cids)
    local out = {}
    if #cids == 0 then return out end

    local rows = MySQL.query.await(([[
        SELECT citizenid, flags, mugshot FROM phone_mdt_person_records WHERE citizenid IN (%s)
    ]]):format(marks(#cids)), cids) or {}

    for i = 1, #rows do
        out[rows[i].citizenid] = {
            flags   = decodeFlags(rows[i].flags),
            mugshot = (rows[i].mugshot and rows[i].mugshot ~= '') and rows[i].mugshot or nil,
        }
    end
    return out
end

---True when a decoded flag list carries the manual wanted marker.
---@param flags string[]
---@return boolean
local function flaggedWanted(flags)
    for i = 1, #flags do
        if flags[i] == 'wanted' then return true end
    end
    return false
end

---Writes one column of a citizen's overlay row, creating the row on first use.
---@param citizenid string
---@param column string overlay column name, a call-site constant
---@param value any bound value
---@param actor string|nil citizenid stamped as the editor
local function writeOverlay(citizenid, column, value, actor)
    MySQL.query.await(([[
        INSERT INTO phone_mdt_person_records (citizenid, `%s`, updated_by, updated_at)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE `%s` = VALUES(`%s`), updated_by = VALUES(updated_by),
            updated_at = VALUES(updated_at)
    ]]):format(column, column, column), { citizenid, value, actor, os.time() })
end

---The MDT-owned DMV overlay for a plate, defaulted when none has been written.
---@param plate string normalised plate
---@return table overlay
local function vehicleOverlay(plate)
    local row = MySQL.single.await([[
        SELECT notes, points, status, stolen, bolo, image, updated_by, updated_at
        FROM phone_mdt_vehicles WHERE plate = ?
    ]], { plate })
    if not row then
        return { notes = '', points = 0, status = 'valid', stolen = false, bolo = false }
    end
    return {
        notes     = row.notes or '',
        points    = tonumber(row.points) or 0,
        status    = STATUSES[row.status] and row.status or 'valid',
        stolen    = util.truthy(row.stolen),
        bolo      = util.truthy(row.bolo),
        image     = (row.image and row.image ~= '') and row.image or nil,
        updatedBy = row.updated_by,
        updatedAt = tonumber(row.updated_at),
    }
end

---Overlays for a page of plates, keyed by plate. One statement per page.
---@param plates string[] normalised plates
---@return table<string, table> overlays
local function vehicleOverlays(plates)
    local out = {}
    if #plates == 0 then return out end

    local rows = MySQL.query.await(([[
        SELECT plate, status, stolen, bolo FROM phone_mdt_vehicles WHERE plate IN (%s)
    ]]):format(marks(#plates)), plates) or {}

    for i = 1, #rows do
        out[rows[i].plate] = {
            status = STATUSES[rows[i].status] and rows[i].status or 'valid',
            stolen = util.truthy(rows[i].stolen),
            bolo   = util.truthy(rows[i].bolo),
        }
    end
    return out
end

---The wire shape for one vehicle row: framework facts plus the DMV overlay laid over them.
---@param base table normalised bridge vehicle
---@param overlay table|nil overlay for that plate
---@param ownerName string|nil resolved owner display name
---@return table row
local function vehicleRow(base, overlay, ownerName)
    overlay = overlay or { status = 'valid', stolen = false, bolo = false }
    return {
        plate     = base.plate,
        model     = base.model or '',
        owner     = base.owner or '',
        ownerName = ownerName or base.owner or '',
        status    = overlay.status,
        stolen    = overlay.stolen,
        bolo      = overlay.bolo,
    }
end

---Charge lines attributed to a citizen on reports the caller may read, newest first. Each prior
---carries the ref of the report it came from so the sheet can link back to the source.
---@param me table caller identity from access.identity
---@param citizenid string
---@return table[] priors
local function priorsFor(me, citizenid)
    local clause, args = paperwork.visibility(me)
    local params = { citizenid }
    for i = 1, #args do params[#params + 1] = args[i] end
    params[#params + 1] = PRIORS_LIMIT

    -- An expunged charge line is gone from the record as far as anyone reading it is concerned.
    -- The row survives so the report it was filed on stays whole; a court sealed the charge, it
    -- did not rewrite the officer's paperwork.
    local rows = MySQL.query.await(([[
        SELECT r.ref, c.code, c.label, c.class, c.count, r.title, r.created_at
        FROM phone_mdt_report_charges c
        JOIN phone_mdt_reports r ON r.id = c.report_id
        WHERE c.citizenid = ? AND c.expunged = 0 AND %s
        ORDER BY r.created_at DESC
        LIMIT ?
    ]]):format(clause), params) or {}

    local out = {}
    for i = 1, #rows do
        local row = rows[i]
        out[i] = {
            reportRef   = row.ref,
            reportTitle = row.title or row.ref,
            code        = row.code,
            label       = row.label or row.code,
            class       = row.class or 'infraction',
            count       = tonumber(row.count) or 1,
            date        = tonumber(row.created_at) or 0,
        }
    end
    return out
end

---How many arrest rows name this citizen.
---@param citizenid string
---@return integer arrests
local function arrestCount(citizenid)
    return tonumber(MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_mdt_arrests WHERE citizenid = ?', { citizenid })) or 0
end

---Every vehicle a citizen owns, each merged with its DMV overlay.
---@param citizenid string
---@param ownerName string owner display name, already known
---@return table[] vehicles
local function vehiclesOwnedBy(citizenid, ownerName)
    local owned = frameworkRecords.vehiclesByOwner(citizenid) or {}

    local plates, bases = {}, {}
    for i = 1, #owned do
        local plate = plateOf(owned[i].plate)
        if plate and #bases < OWNED_LIMIT then
            owned[i].plate = plate
            plates[#plates + 1] = plate
            bases[#bases + 1] = owned[i]
        end
    end

    local overlays = vehicleOverlays(plates)
    local out = {}
    for i = 1, #bases do
        out[i] = vehicleRow(bases[i], overlays[bases[i].plate], ownerName)
    end
    return out
end

---Composes the full person sheet: framework identity, MDT overlay, owned vehicles, active
---warrants, priors and the arrest counter.
---@param me table caller identity from access.identity
---@param citizenid string
---@return table|nil person nil when the citizen is not on file
local function composePerson(me, citizenid)
    local citizen = frameworkRecords.getCitizen(citizenid)
    if not citizen then return nil end

    local overlay  = personOverlay(citizenid)
    local warrants = warrantsModule().activeFor(citizenid)

    local licences = {}
    if type(citizen.licences) == 'table' then
        for _, id in ipairs(citizen.licences) do
            if type(id) == 'string' and id ~= '' then licences[#licences + 1] = id end
        end
    end

    return {
        citizenid   = citizenid,
        name        = citizen.name,
        dob         = citizen.dob or '',
        sex         = citizen.sex or '',
        phone       = citizen.phone or '',
        wanted      = #warrants > 0 or flaggedWanted(overlay.flags),
        bolo        = false,
        mugshot     = overlay.mugshot,
        firstname   = citizen.firstname or '',
        lastname    = citizen.lastname or '',
        nationality = citizen.nationality or '',
        job         = citizen.job or '',
        jobGrade    = tonumber(citizen.jobGrade) or 0,
        licences    = licences,
        fingerprint = citizen.fingerprint or '',
        bloodtype   = citizen.bloodtype or '',
        notes       = overlay.notes,
        flags       = overlay.flags,
        vehicles    = vehiclesOwnedBy(citizenid, citizen.name),
        warrants    = warrants,
        priors      = priorsFor(me, citizenid),
        arrests     = arrestCount(citizenid),
    }
end

---Composes one vehicle sheet: framework facts, then the MDT overlay laid over them.
---@param plate string normalised plate
---@return table|nil vehicle nil when no framework row owns the plate
local function composeVehicle(plate)
    local base = frameworkRecords.vehicleByPlate(plate)
    if not base then return nil end

    base.plate = plateOf(base.plate) or plate
    local overlay = vehicleOverlay(base.plate)
    local names   = frameworkRecords.namesFor({ base.owner or '' })

    local out = vehicleRow(base, overlay, names[base.owner or ''])
    out.garage    = base.garage or ''
    out.stored    = tonumber(base.state) == 1
    out.notes     = overlay.notes
    out.points    = overlay.points
    out.image     = overlay.image
    out.updatedBy = overlay.updatedBy
    out.updatedAt = overlay.updatedAt
    return out
end

records.personsSearch = access.gated('persons.view', function(_, payload)
    local page  = pageOf(payload.page)
    local query = util.limitedString(payload.query, MAX_QUERY)

    local found, total = frameworkRecords.searchCitizens(query, page, PAGE_SIZE)
    found = found or {}

    local cids = {}
    for i = 1, #found do cids[i] = found[i].citizenid end

    local overlays = personOverlays(cids)
    local wanted   = warrantsModule().wantedSet(cids)

    local rows = {}
    for i = 1, #found do
        local c = found[i]
        local overlay = overlays[c.citizenid] or { flags = {} }
        rows[i] = {
            citizenid = c.citizenid,
            name      = c.name,
            dob       = c.dob or '',
            sex       = c.sex or '',
            phone     = c.phone or '',
            wanted    = wanted[c.citizenid] == true or flaggedWanted(overlay.flags),
            bolo      = false,
            mugshot   = overlay.mugshot,
        }
    end

    return util.ok({ rows = rows, total = tonumber(total) or #rows, page = page, pageSize = PAGE_SIZE })
end)

records.personsGet = access.gated('persons.view', function(_, payload, me)
    local citizenid = util.limitedString(payload.citizenid, 64)
    if not citizenid then return util.fail('mdt.noCitizenSelected', 'No citizen selected') end

    local person = composePerson(me, citizenid)
    if not person then return util.fail('mdt.noRecordCitizen', 'No record for that citizen') end
    return util.ok({ person = person })
end)

records.personsNotes = access.audited('persons.edit', function(_, payload, me)
    local citizenid = util.limitedString(payload.citizenid, 64)
    if not citizenid then return util.fail('mdt.noCitizenSelected', 'No citizen selected') end

    local person = composePerson(me, citizenid)
    if not person then return util.fail('mdt.noRecordCitizen', 'No record for that citizen') end

    writeOverlay(citizenid, 'notes', util.limitedString(payload.notes, MAX_NOTES) or '', me.citizenid)
    person = composePerson(me, citizenid)

    return util.ok({ person = person }), {
        entityType = 'person',
        entityId   = citizenid,
        details    = { name = person and person.name or citizenid },
    }
end)

records.personsFlags = access.audited('persons.edit', function(_, payload, me)
    local citizenid = util.limitedString(payload.citizenid, 64)
    if not citizenid then return util.fail('mdt.noCitizenSelected', 'No citizen selected') end

    local person = composePerson(me, citizenid)
    if not person then return util.fail('mdt.noRecordCitizen', 'No record for that citizen') end

    local flags = sanitizeFlags(payload.flags)
    writeOverlay(citizenid, 'flags', json.encode(flags), me.citizenid)
    person = composePerson(me, citizenid)

    return util.ok({ person = person }), {
        entityType = 'person',
        entityId   = citizenid,
        details    = { name = person and person.name or citizenid, flags = flags },
    }
end)

records.personsMugshot = access.audited('persons.edit', function(_, payload, me)
    local citizenid = util.limitedString(payload.citizenid, 64)
    if not citizenid then return util.fail('mdt.noCitizenSelected', 'No citizen selected') end

    local person = composePerson(me, citizenid)
    if not person then return util.fail('mdt.noRecordCitizen', 'No record for that citizen') end

    local url = util.limitedString(payload.url, MAX_URL)
    if url and not url:match('^https?://') then return util.fail('mdt.mugshotMustWebAddress', 'A mugshot must be a web address') end

    writeOverlay(citizenid, 'mugshot', url, me.citizenid)
    person = composePerson(me, citizenid)

    return util.ok({ person = person }), {
        entityType = 'person',
        entityId   = citizenid,
        details    = { name = person and person.name or citizenid, cleared = url == nil },
    }
end)

records.vehiclesSearch = access.gated('vehicles.view', function(_, payload)
    local page  = pageOf(payload.page)
    local query = util.limitedString(payload.query, MAX_QUERY)

    local found, total = frameworkRecords.searchVehicles(query, page, PAGE_SIZE)
    found = found or {}

    local plates, owners = {}, {}
    for i = 1, #found do
        found[i].plate = plateOf(found[i].plate) or ''
        plates[i] = found[i].plate
        if type(found[i].owner) == 'string' and found[i].owner ~= '' then
            owners[#owners + 1] = found[i].owner
        end
    end

    local overlays = vehicleOverlays(plates)
    local names    = frameworkRecords.namesFor(owners)

    local rows = {}
    for i = 1, #found do
        rows[i] = vehicleRow(found[i], overlays[found[i].plate], names[found[i].owner or ''])
    end

    return util.ok({ rows = rows, total = tonumber(total) or #rows, page = page, pageSize = PAGE_SIZE })
end)

records.vehiclesGet = access.gated('vehicles.view', function(_, payload)
    local plate = plateOf(payload.plate)
    if not plate then return util.fail('mdt.noPlateSelected', 'No plate selected') end

    local vehicle = composeVehicle(plate)
    if not vehicle then return util.fail('mdt.noVehicleRegisteredPlate', 'No vehicle registered on that plate') end
    return util.ok({ vehicle = vehicle })
end)

records.vehiclesUpdate = access.audited('vehicles.edit', function(_, payload, me)
    local plate = plateOf(payload.plate)
    if not plate then return util.fail('mdt.noPlateSelected', 'No plate selected') end
    if not frameworkRecords.vehicleByPlate(plate) then
        return util.fail('mdt.noVehicleRegisteredPlate', 'No vehicle registered on that plate')
    end

    local current = vehicleOverlay(plate)

    local status = current.status
    if payload.status ~= nil then
        local wanted = util.limitedString(payload.status, 16)
        if not wanted or not STATUSES[wanted] then return util.fail('mdt.pickValidRegistrationStatus', 'Pick a valid registration status') end
        status = wanted
    end

    local points = current.points
    if payload.points ~= nil then
        points = util.wholeAmount(payload.points)
        if points > MAX_POINTS then points = MAX_POINTS end
    end

    local notes = current.notes
    if payload.notes ~= nil then notes = util.limitedString(payload.notes, MAX_NOTES) or '' end

    local image = current.image
    if payload.image ~= nil then
        image = util.limitedString(payload.image, MAX_URL)
        if image and not image:match('^https?://') then return util.fail('mdt.photoMustWebAddress', 'A photo must be a web address') end
    end

    local stolen = current.stolen
    if payload.stolen ~= nil then stolen = payload.stolen == true end

    local bolo = current.bolo
    if payload.bolo ~= nil then bolo = payload.bolo == true end

    MySQL.query.await([[
        INSERT INTO phone_mdt_vehicles (plate, notes, points, status, stolen, bolo, image, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE notes = VALUES(notes), points = VALUES(points), status = VALUES(status),
            stolen = VALUES(stolen), bolo = VALUES(bolo), image = VALUES(image),
            updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)
    ]], { plate, notes, points, status, stolen and 1 or 0, bolo and 1 or 0, image, me.citizenid, os.time() })

    local vehicle = composeVehicle(plate)
    if not vehicle then return util.fail('mdt.noVehicleRegisteredPlate', 'No vehicle registered on that plate') end

    return util.ok({ vehicle = vehicle }), {
        entityType = 'vehicle',
        entityId   = plate,
        details    = { status = status, points = points, stolen = stolen, bolo = bolo },
    }
end)

return records
