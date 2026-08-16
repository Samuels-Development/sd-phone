---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx'|'vrp') + live core
---handle.
local framework = require 'bridge.shared.framework'

---@type table Records module; the table returned at end of file. Read-only reads of the
---FRAMEWORK's own citizen and vehicle tables, so framework-shape knowledge stays in bridge/ and
---never leaks into server/mdt/. Nothing here writes, and no framework table is ever ALTERed.
local records = {}

---@type { table: string, idCol: string }|nil Framework ownership table, picked the same way
---bridge/server/garages.lua picks it. Nil on a framework whose vehicle schema this module does not
---know: every read below treats that as "records unavailable" and returns empty, rather than
---querying `player_vehicles` on a server that has no such table. vRP is deliberately one of those:
---`vrp_user_vehicles` is (user_id, vehicle) with no plate column and vRP 2 core has no vehicle table
---at all, so MDT vehicle records and plate search stay unavailable there while citizen records work.
local VEHICLES =
    framework.name == 'esx' and { table = 'owned_vehicles',  idCol = 'owner' }
    or framework.qb         and { table = 'player_vehicles', idCol = 'citizenid' }
    or nil

---@type string[] Columns a model name may live in, in preference order.
local MODEL_COLS = { 'vehicle', 'model', 'vehicle_name', 'name' }

---@type integer Characters below which a term is not a filter at all, so the caller is browsing and
---the list comes back unfiltered rather than empty.
local MIN_TERM <const> = 2

---@type table<string, table<string, boolean>>|nil Present columns per table, resolved on first use.
local columnCache = {}

---One row, or nil when the query raised. Every read in this module goes through these three
---helpers: they run against the FRAMEWORK's own tables, whose shape this resource does not control,
---so a missing table or a renamed column must return an empty page rather than propagate out of the
---MDT callback that asked.
---@param sql string
---@param params? table
---@return table|nil row
local function single(sql, params)
    local ok, row = pcall(function() return MySQL.single.await(sql, params) end)
    return (ok and type(row) == 'table') and row or nil
end

---Rows, or an empty list when the query raised.
---@param sql string
---@param params? table
---@return table[] rows
local function query(sql, params)
    local ok, rows = pcall(function() return MySQL.query.await(sql, params) end)
    return (ok and type(rows) == 'table') and rows or {}
end

---A scalar, or 0 when the query raised.
---@param sql string
---@param params? table
---@return number
local function scalar(sql, params)
    local ok, value = pcall(function() return MySQL.scalar.await(sql, params) end)
    return (ok and tonumber(value)) or 0
end

---The set of columns a table actually has, read once per table and memoised. An unknown table
---resolves to an empty set, which every caller treats as "that column is not available".
---@param tbl string table name
---@return table<string, boolean>
local function columnsOf(tbl)
    local hit = columnCache[tbl]
    if hit then return hit end
    local out = {}
    local ok, rows = pcall(function()
        return MySQL.query.await([[
            SELECT COLUMN_NAME AS name FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = ?
        ]], { tbl })
    end)
    if ok and type(rows) == 'table' then
        for i = 1, #rows do out[rows[i].name] = true end
    end
    columnCache[tbl] = out
    return out
end

---Ordering for a citizen list. Recency reads far better than an identifier for a browse list, and
---the recency column is indexed where it exists, so the page comes off the index instead of a
---filesort over the whole table. Sorting by name is deliberately not offered: on the qb family the
---name lives inside the `charinfo` text blob, so it can only be reached through JSON_EXTRACT, which
---no index can serve.
---@param tbl string table the list is read from
---@param recent string recency column to prefer
---@param fallback string indexed column to fall back to
---@return string order SQL fragment
local function citizenOrder(tbl, recent, fallback)
    if columnsOf(tbl)[recent] then return ('`%s` DESC'):format(recent) end
    return ('`%s` ASC'):format(fallback)
end

---The column a vehicle's model name lives in on this framework, or nil when none of the known
---candidates exist (ESX forks that keep the model inside the `vehicle` JSON blob), or when this
---framework has no known ownership table at all.
---@return string|nil
local function modelColumn()
    if not VEHICLES then return nil end
    local have = columnsOf(VEHICLES.table)
    for i = 1, #MODEL_COLS do
        if have[MODEL_COLS[i]] then return MODEL_COLS[i] end
    end
    return nil
end

---Trims a value to a plain string; a non-string coerces to ''.
---@param v any
---@return string
local function str(v)
    if type(v) ~= 'string' then return v ~= nil and tostring(v) or '' end
    return (v:gsub('^%s+', ''):gsub('%s+$', ''))
end

---Decodes a JSON column that oxmysql may hand back already decoded.
---@param raw any
---@return table
local function decode(raw)
    if type(raw) == 'table' then return raw end
    if type(raw) ~= 'string' or raw == '' then return {} end
    local ok, out = pcall(json.decode, raw)
    return (ok and type(out) == 'table') and out or {}
end

---Builds the normalised citizen shape from a QBCore/QBox `players` row.
---@param row table
---@return table citizen
local function qbCitizen(row)
    local info = decode(row.charinfo)
    local meta = decode(row.metadata)
    local jb   = decode(row.job)

    local first = str(info.firstname)
    local last  = str(info.lastname)
    local name  = str((first .. ' ' .. last))

    local licences = {}
    if type(meta.licences) == 'table' then
        for key, held in pairs(meta.licences) do
            if held == true and type(key) == 'string' then licences[#licences + 1] = key end
        end
    end
    if type(meta.licenses) == 'table' then
        for key, held in pairs(meta.licenses) do
            if held == true and type(key) == 'string' then licences[#licences + 1] = key end
        end
    end

    return {
        citizenid   = row.citizenid,
        name        = name ~= '' and name or row.citizenid,
        firstname   = first,
        lastname    = last,
        dob         = str(info.birthdate) ~= '' and str(info.birthdate) or str(info.dateofbirth),
        sex         = str(info.gender) ~= '' and str(info.gender) or str(info.sex),
        phone       = str(info.phone),
        nationality = str(info.nationality),
        job         = str(jb.name),
        jobGrade    = type(jb.grade) == 'table' and (tonumber(jb.grade.level) or 0) or (tonumber(jb.grade) or 0),
        licences    = licences,
        fingerprint = str(meta.fingerprint),
        bloodtype   = str(meta.bloodtype),
        callsign    = str(meta.callsign),
    }
end

---Builds the normalised citizen shape from an ESX `users` row.
---@param row table
---@return table citizen
local function esxCitizen(row)
    local first = str(row.firstname)
    local last  = str(row.lastname)
    local name  = str(first .. ' ' .. last)
    local meta  = decode(row.metadata)

    return {
        citizenid   = row.identifier,
        name        = name ~= '' and name or row.identifier,
        firstname   = first,
        lastname    = last,
        dob         = str(row.dateofbirth),
        sex         = str(row.sex),
        phone       = str(row.phone_number),
        nationality = '',
        job         = str(row.job),
        jobGrade    = tonumber(row.job_grade) or 0,
        licences    = {},
        fingerprint = str(meta.fingerprint),
        bloodtype   = '',
        callsign    = '',
    }
end

---Builds the normalised citizen shape from a vRP identity row.
---
---vRP's identity table carries only firstname, name, age, phone and registration, so DOB, sex,
---nationality, job, licences and every metadata field come back blank: those MDT fields render
---empty rather than showing a value vRP never stored. The citizenid is the sd-phone identifier the
---identity was read under, which is the key every other module already addresses the character by.
---@param identity table normalised identity from bridge.server.vrp.core
---@return table citizen
local function vrpCitizen(identity)
    local key   = str(identity.key)
    local first = str(identity.firstname)
    local last  = str(identity.lastname)
    local name  = str(first .. ' ' .. last)

    return {
        citizenid   = key,
        name        = name ~= '' and name or key,
        firstname   = first,
        lastname    = last,
        dob         = '',
        sex         = '',
        phone       = str(identity.phone),
        nationality = '',
        job         = '',
        jobGrade    = 0,
        licences    = {},
        fingerprint = '',
        bloodtype   = '',
        callsign    = '',
    }
end

---@type string QBCore/QBox citizen projection.
local QB_CITIZEN_COLS = 'citizenid, charinfo, metadata, job'
---@type string ESX citizen projection.
local ESX_CITIZEN_COLS = 'identifier, firstname, lastname, dateofbirth, sex, phone_number, job, job_grade'

---One citizen by their framework identifier, or nil. Read-only. On vRP the row comes from the
---identity table, so DOB, sex, nationality, job and every metadata field are blank.
---@param cid string citizenid on QBCore/QBox, identifier on ESX, sd-phone key ('vrp:c17') on vRP
---@return table|nil citizen
function records.getCitizen(cid)
    if type(cid) ~= 'string' or cid == '' then return nil end

    if framework.qb then
        local row = single(
            ('SELECT %s FROM players WHERE citizenid = ? LIMIT 1'):format(QB_CITIZEN_COLS), { cid })
        return row and qbCitizen(row) or nil
    end

    if framework.name == 'esx' then
        local have = columnsOf('users')
        local cols = have.metadata and (ESX_CITIZEN_COLS .. ', metadata') or ESX_CITIZEN_COLS
        local row  = single(
            ('SELECT %s FROM users WHERE identifier = ? LIMIT 1'):format(cols), { cid })
        return row and esxCitizen(row) or nil
    end

    if framework.name == 'vrp' then
        ---@type table vRP facade (bridge.server.vrp.core). Required inside the branch, never at file
        ---scope: this module loads on every framework, and the vRP tree must not be pulled onto a
        ---qb, qbx or esx boot.
        local core = require 'bridge.server.vrp.core'
        local identity = core.offlineIdentity(cid)
        return identity and vrpCitizen(identity) or nil
    end

    return nil
end

---Citizen names for a set of identifiers as `{ [citizenid] = name }`. One query, offline
---characters included. Read-only.
---@param cids string[]
---@return table<string, string>
function records.namesFor(cids)
    local out = {}
    if type(cids) ~= 'table' or #cids == 0 then return out end

    if framework.name == 'vrp' then
        ---@type table vRP facade (bridge.server.vrp.core), required inside the branch so the vRP
        ---tree never reaches a qb, qbx or esx boot. It reads vRP's own identity table, so offline
        ---characters are included exactly as they are on the qb and esx paths.
        local core = require 'bridge.server.vrp.core'
        return core.offlineNames(cids)
    end

    local marks = {}
    for i = 1, #cids do marks[i] = '?' end
    local inClause = table.concat(marks, ',')

    if framework.qb then
        local rows = query(
            ('SELECT citizenid, charinfo FROM players WHERE citizenid IN (%s)'):format(inClause), cids)
        for i = 1, #rows do
            local info = decode(rows[i].charinfo)
            local name = str(str(info.firstname) .. ' ' .. str(info.lastname))
            out[rows[i].citizenid] = name ~= '' and name or rows[i].citizenid
        end
        return out
    end

    if framework.name == 'esx' then
        local rows = query(
            ('SELECT identifier, firstname, lastname FROM users WHERE identifier IN (%s)'):format(inClause), cids)
        for i = 1, #rows do
            local name = str(str(rows[i].firstname) .. ' ' .. str(rows[i].lastname))
            out[rows[i].identifier] = name ~= '' and name or rows[i].identifier
        end
    end

    return out
end

---A page of citizens matching a free-text term across first name, last name, identifier and
---phone. A term under two characters returns an empty page rather than the whole server. On vRP the
---match is over vRP's own identity table and the page is capped there. Read-only.
---@param term string search term
---@param page integer 1-based page number
---@param pageSize integer rows per page
---@return table[] rows normalised citizen shapes
---@return integer total matching rows
function records.searchCitizens(term, page, pageSize)
    term = str(term)

    local limit  = math.max(1, math.floor(tonumber(pageSize) or 25))
    local offset = math.max(0, (math.max(1, math.floor(tonumber(page) or 1)) - 1) * limit)
    local like   = '%' .. term:gsub('([%%_\\])', '\\%1') .. '%'
    local browse = #term < MIN_TERM

    if framework.qb then
        local where, args = '', {}
        if not browse then
            -- COLLATE, because JSON_UNQUOTE hands back utf8mb4_bin: a binary, case-SENSITIVE
            -- collation. Without it `sam` never matches `Samuel` and only citizenid search, which
            -- reads a real column with the table's own collation, appears to work.
            where = [[
                WHERE citizenid LIKE ?
                   OR JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.firstname')) COLLATE utf8mb4_general_ci LIKE ?
                   OR JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.lastname'))  COLLATE utf8mb4_general_ci LIKE ?
                   OR JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.phone'))     COLLATE utf8mb4_general_ci LIKE ?
            ]]
            args = { like, like, like, like }
        end
        local order = citizenOrder('players', 'last_updated', 'citizenid')
        local total = scalar(('SELECT COUNT(*) FROM players %s'):format(where), args)
        local rows  = query(
            ('SELECT %s FROM players %s ORDER BY %s LIMIT %d OFFSET %d')
                :format(QB_CITIZEN_COLS, where, order, limit, offset), args)

        local out = {}
        for i = 1, #rows do out[i] = qbCitizen(rows[i]) end
        return out, total
    end

    if framework.name == 'esx' then
        local where, args = '', {}
        if not browse then
            where = 'WHERE identifier LIKE ? OR firstname LIKE ? OR lastname LIKE ? OR phone_number LIKE ?'
            args  = { like, like, like, like }
        end
        local have  = columnsOf('users')
        local cols  = have.metadata and (ESX_CITIZEN_COLS .. ', metadata') or ESX_CITIZEN_COLS
        local order = citizenOrder('users', 'last_seen', 'identifier')
        local total = scalar(('SELECT COUNT(*) FROM users %s'):format(where), args)
        local rows  = query(
            ('SELECT %s FROM users %s ORDER BY %s LIMIT %d OFFSET %d')
                :format(cols, where, order, limit, offset), args)

        local out = {}
        for i = 1, #rows do out[i] = esxCitizen(rows[i]) end
        return out, total
    end

    if framework.name == 'vrp' then
        ---@type table vRP facade (bridge.server.vrp.core), required inside the branch so the vRP
        ---tree never reaches a qb, qbx or esx boot. It owns the wildcard wrapping, the escaping and
        ---the same two-character floor enforced above, and caps the page hard: neither lineage
        ---indexes the name columns and a substring LIKE could not use such an index anyway, so every
        ---search is a table scan and the page size is the only thing bounding its cost. vRP splits a
        ---name across `firstname` and `name` and matches them separately, so a two-word term like
        ---"john doe" finds nothing there.
        local core = require 'bridge.server.vrp.core'
        local rows, total = core.searchIdentities(term, limit, offset)

        local out = {}
        for i = 1, #rows do out[i] = vrpCitizen(rows[i]) end
        return out, total
    end

    return {}, 0
end

---Citizenids whose FULL character name matches a free-text term, in the framework's own table.
---Takes a RAW term, not a LIKE pattern: this function owns its own wildcard wrapping and escaping,
---so a caller that pre-wrapped would search for a literal percent sign. The predicate is
---CONCAT(first, ' ', last) rather than per-column, so a two-word term like "john doe" keeps matching
---the way server/admin/store.lua's own SQL did before this replaced it. Ids only: callers that want
---the whole citizen shape use records.searchCitizens. Read-only.
---@param term string raw search text
---@param limit integer maximum rows
---@return string[] cids
function records.searchCitizenIds(term, limit)
    term = str(term)
    if term == '' then return {} end

    local cap  = math.max(1, math.floor(tonumber(limit) or 25))
    local like = '%' .. term:gsub('([%%_\\])', '\\%1') .. '%'
    local out  = {}

    if framework.qb then
        local rows = query(([[
            SELECT citizenid FROM players
            WHERE CONCAT(
                JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.firstname')), ' ',
                JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.lastname'))
            ) LIKE ?
            LIMIT %d
        ]]):format(cap), { like })
        for i = 1, #rows do out[i] = rows[i].citizenid end
        return out
    end

    if framework.name == 'esx' then
        local rows = query(([[
            SELECT identifier FROM users
            WHERE CONCAT(firstname, ' ', lastname) LIKE ?
            LIMIT %d
        ]]):format(cap), { like })
        for i = 1, #rows do out[i] = rows[i].identifier end
        return out
    end

    if framework.name == 'vrp' then
        ---@type table vRP facade (bridge.server.vrp.core). Required inside the branch, never at file
        ---scope: this module loads on every framework, and the vRP tree must not be pulled onto a
        ---qb, qbx or esx boot. vRP keeps the two halves of a name in separate columns and matches
        ---them separately, so a two-word term finds nothing there.
        local core = require 'bridge.server.vrp.core'
        local rows = core.searchIdentities(term, cap, 0)
        for i = 1, #rows do out[i] = rows[i].key end
        return out
    end

    return out
end

---Builds the normalised vehicle shape from an ownership row.
---@param row table raw ownership row
---@param modelCol string|nil column carrying the model name
---@return table vehicle
local function vehicleOf(row, modelCol)
    local props = decode(row.vehicle)
    local model = modelCol and str(row[modelCol]) or ''
    if model == '' then model = str(props.model) end

    local garage = str(row.garage) ~= '' and str(row.garage) or str(row.parking)
    local state  = row.state
    if state == nil then state = row.stored end

    return {
        plate  = str(row.plate):upper(),
        model  = model,
        owner  = VEHICLES and row[VEHICLES.idCol] or nil,
        garage = garage,
        state  = tonumber(state) or (state == true and 1) or 0,
    }
end

---One vehicle by plate, or nil. The plate is matched case- and space-insensitively because the
---framework stores it exactly as the game formatted it. Always nil on a framework with no known
---ownership table, vRP included. Read-only.
---@param plate string
---@return table|nil vehicle
function records.vehicleByPlate(plate)
    plate = str(plate):upper()
    if plate == '' or not VEHICLES then return nil end

    local row = single(
        ('SELECT * FROM `%s` WHERE REPLACE(UPPER(plate), " ", "") = ? LIMIT 1'):format(VEHICLES.table),
        { (plate:gsub('%s', '')) })
    if not row then return nil end
    return vehicleOf(row, modelColumn())
end

---Every vehicle owned by a citizen. Empty on a framework with no known ownership table, vRP
---included. Read-only.
---@param cid string owner identifier
---@return table[] vehicles
function records.vehiclesByOwner(cid)
    if type(cid) ~= 'string' or cid == '' or not VEHICLES then return {} end

    local rows = query(
        ('SELECT * FROM `%s` WHERE `%s` = ? ORDER BY plate ASC LIMIT 60'):format(VEHICLES.table, VEHICLES.idCol),
        { cid })

    local modelCol, out = modelColumn(), {}
    for i = 1, #rows do out[i] = vehicleOf(rows[i], modelCol) end
    return out
end

---A page of vehicles matching a plate or model fragment. A term under two characters is not a
---filter, so the whole fleet is paged back in plate order. An empty page on a framework with no
---known ownership table, vRP included. Read-only.
---@param term string search term
---@param page integer 1-based page number
---@param pageSize integer rows per page
---@return table[] rows normalised vehicle shapes
---@return integer total matching rows
function records.searchVehicles(term, page, pageSize)
    term = str(term)
    if not VEHICLES then return {}, 0 end

    local limit  = math.max(1, math.floor(tonumber(pageSize) or 25))
    local offset = math.max(0, (math.max(1, math.floor(tonumber(page) or 1)) - 1) * limit)
    local like   = '%' .. term:gsub('([%%_\\])', '\\%1') .. '%'

    local modelCol = modelColumn()
    local where, args = '', {}
    if #term >= MIN_TERM then
        if modelCol then
            where = ('WHERE plate LIKE ? OR `%s` LIKE ?'):format(modelCol)
            args  = { like, like }
        else
            where = 'WHERE plate LIKE ?'
            args  = { like }
        end
    end

    local total = scalar(
        ('SELECT COUNT(*) FROM `%s` %s'):format(VEHICLES.table, where), args)
    local rows = query(
        ('SELECT * FROM `%s` %s ORDER BY plate ASC LIMIT %d OFFSET %d')
            :format(VEHICLES.table, where, limit, offset), args)

    local out = {}
    for i = 1, #rows do out[i] = vehicleOf(rows[i], modelCol) end
    return out, total
end

return records
