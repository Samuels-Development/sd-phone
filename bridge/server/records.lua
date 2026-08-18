---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'
---@type table Garage bridge (bridge.server.garages): the active system's column profile, so a
---vehicle's garage and state are read the same way here as in the Garages app.
local garages = require 'bridge.server.garages'

---@type table Records module; the table returned at end of file. Read-only reads of the
---FRAMEWORK's own citizen and vehicle tables, so framework-shape knowledge stays in bridge/ and
---never leaks into server/mdt/. Nothing here writes, and no framework table is ever ALTERed.
local records = {}

---@type { table: string, idCol: string } Framework citizen table: QBCore/QBox key characters by
---citizenid in `players`, ESX by identifier in `users`.
local PEOPLE = framework.name == 'esx'
    and { table = 'users',   idCol = 'identifier' }
    or  { table = 'players', idCol = 'citizenid' }

---@type { table: string, idCol: string } Framework ownership table, picked the same way
---bridge/server/garages.lua picks it.
local VEHICLES = framework.name == 'esx'
    and { table = 'owned_vehicles',  idCol = 'owner' }
    or  { table = 'player_vehicles', idCol = 'citizenid' }

---@type string[] Columns a model name may live in, in preference order. `vehicle` is last on
---purpose: qb/QBox keep a plain name there, but ESX keeps the whole properties blob under the same
---name, so a fork carrying a real model column should win over it.
local MODEL_COLS = { 'model', 'vehicle_name', 'name', 'vehicle' }

---@type integer Characters below which a term is not a filter at all, so the caller is browsing and
---the list comes back unfiltered rather than empty.
local MIN_TERM <const> = 2

---@type table<string, table<string, boolean>>|nil Present columns per table, resolved on first use.
local columnCache = {}

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
---candidates exist (ESX forks that keep the model inside the `vehicle` JSON blob).
---@return string|nil
local function modelColumn()
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

---@type string QBCore/QBox citizen projection.
local QB_CITIZEN_COLS = 'citizenid, charinfo, metadata, job'
---@type string ESX citizen projection.
local ESX_CITIZEN_COLS = 'identifier, firstname, lastname, dateofbirth, sex, phone_number, job, job_grade'

---One citizen by their framework identifier, or nil. Read-only.
---@param cid string citizenid on QBCore/QBox, identifier on ESX
---@return table|nil citizen
function records.getCitizen(cid)
    if type(cid) ~= 'string' or cid == '' then return nil end

    if framework.qb then
        local row = MySQL.single.await(
            ('SELECT %s FROM players WHERE citizenid = ? LIMIT 1'):format(QB_CITIZEN_COLS), { cid })
        return row and qbCitizen(row) or nil
    end

    local have = columnsOf('users')
    local cols = have.metadata and (ESX_CITIZEN_COLS .. ', metadata') or ESX_CITIZEN_COLS
    local row  = MySQL.single.await(
        ('SELECT %s FROM users WHERE identifier = ? LIMIT 1'):format(cols), { cid })
    return row and esxCitizen(row) or nil
end

---Citizen names for a set of identifiers as `{ [citizenid] = name }`. One query, offline
---characters included. Read-only.
---@param cids string[]
---@return table<string, string>
function records.namesFor(cids)
    local out = {}
    if type(cids) ~= 'table' or #cids == 0 then return out end

    local marks = {}
    for i = 1, #cids do marks[i] = '?' end
    local inClause = table.concat(marks, ',')

    if framework.qb then
        local rows = MySQL.query.await(
            ('SELECT citizenid, charinfo FROM players WHERE citizenid IN (%s)'):format(inClause), cids) or {}
        for i = 1, #rows do
            local info = decode(rows[i].charinfo)
            local name = str(str(info.firstname) .. ' ' .. str(info.lastname))
            out[rows[i].citizenid] = name ~= '' and name or rows[i].citizenid
        end
        return out
    end

    local rows = MySQL.query.await(
        ('SELECT identifier, firstname, lastname FROM users WHERE identifier IN (%s)'):format(inClause), cids) or {}
    for i = 1, #rows do
        local name = str(str(rows[i].firstname) .. ' ' .. str(rows[i].lastname))
        out[rows[i].identifier] = name ~= '' and name or rows[i].identifier
    end
    return out
end

---A page of citizens matching a free-text term across first name, last name, identifier and
---phone. A term under two characters returns an empty page rather than the whole server.
---Read-only.
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
        local total = MySQL.scalar.await(('SELECT COUNT(*) FROM players %s'):format(where), args)
        local rows  = MySQL.query.await(
            ('SELECT %s FROM players %s ORDER BY %s LIMIT %d OFFSET %d')
                :format(QB_CITIZEN_COLS, where, order, limit, offset), args) or {}

        local out = {}
        for i = 1, #rows do out[i] = qbCitizen(rows[i]) end
        return out, tonumber(total) or 0
    end

    local where, args = '', {}
    if not browse then
        where = 'WHERE identifier LIKE ? OR firstname LIKE ? OR lastname LIKE ? OR phone_number LIKE ?'
        args  = { like, like, like, like }
    end
    local have  = columnsOf('users')
    local cols  = have.metadata and (ESX_CITIZEN_COLS .. ', metadata') or ESX_CITIZEN_COLS
    local order = citizenOrder('users', 'last_seen', 'identifier')
    local total = MySQL.scalar.await(('SELECT COUNT(*) FROM users %s'):format(where), args)
    local rows  = MySQL.query.await(
        ('SELECT %s FROM users %s ORDER BY %s LIMIT %d OFFSET %d')
            :format(cols, where, order, limit, offset), args) or {}

    local out = {}
    for i = 1, #rows do out[i] = esxCitizen(rows[i]) end
    return out, tonumber(total) or 0
end

---Builds the normalised vehicle shape from an ownership row. The model is the chosen column when it
---holds a plain name, else the saved-properties model key, else the row's stored hash - ESX keeps the
---whole properties blob under `vehicle`, so a value opening with a brace is a row rather than a name
---and printing it verbatim puts the entire blob in the MDT. Same rule as garages.lua's modelOf.
---@param row table raw ownership row
---@param modelCol string|nil column carrying the model name
---@return table vehicle
local function vehicleOf(row, modelCol)
    local props = decode(row.vehicle)
    local model = modelCol and str(row[modelCol]) or ''

    if model:sub(1, 1) == '{' then model = '' end
    if model == '' then model = str(props.model or props.modelName) end
    if model == '' then model = str(row.hash) end

    -- Resolved through the garage bridge's column profile rather than a guess at `garage`/`state`:
    -- which columns hold the garage and its state depends entirely on the garage system running.
    local garage, stored, impound = garages.locationOf(row)

    return {
        plate   = str(row.plate):upper(),
        model   = model,
        owner   = row[VEHICLES.idCol],
        garage  = garage,
        state   = stored and 1 or 0,
        impound = impound,
    }
end

---One vehicle by plate, or nil. The plate is matched case- and space-insensitively because the
---framework stores it exactly as the game formatted it. Read-only.
---@param plate string
---@return table|nil vehicle
function records.vehicleByPlate(plate)
    plate = str(plate):upper()
    if plate == '' then return nil end

    local row = MySQL.single.await(
        ('SELECT * FROM `%s` WHERE REPLACE(UPPER(plate), " ", "") = ? LIMIT 1'):format(VEHICLES.table),
        { (plate:gsub('%s', '')) })
    if not row then return nil end
    return vehicleOf(row, modelColumn())
end

---Every vehicle owned by a citizen. Read-only.
---@param cid string owner identifier
---@return table[] vehicles
function records.vehiclesByOwner(cid)
    if type(cid) ~= 'string' or cid == '' then return {} end

    local rows = MySQL.query.await(
        ('SELECT * FROM `%s` WHERE `%s` = ? ORDER BY plate ASC LIMIT 60'):format(VEHICLES.table, VEHICLES.idCol),
        { cid }) or {}

    local modelCol, out = modelColumn(), {}
    for i = 1, #rows do out[i] = vehicleOf(rows[i], modelCol) end
    return out
end

---A page of vehicles matching a plate or model fragment. A term under two characters is not a
---filter, so the whole fleet is paged back in plate order. Read-only.
---@param term string search term
---@param page integer 1-based page number
---@param pageSize integer rows per page
---@return table[] rows normalised vehicle shapes
---@return integer total matching rows
function records.searchVehicles(term, page, pageSize)
    term = str(term)

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

    local total = MySQL.scalar.await(
        ('SELECT COUNT(*) FROM `%s` %s'):format(VEHICLES.table, where), args)
    local rows = MySQL.query.await(
        ('SELECT * FROM `%s` %s ORDER BY plate ASC LIMIT %d OFFSET %d')
            :format(VEHICLES.table, where, limit, offset), args) or {}

    local out = {}
    for i = 1, #rows do out[i] = vehicleOf(rows[i], modelCol) end
    return out, tonumber(total) or 0
end

return records
