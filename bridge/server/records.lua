---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'
---@type table Garage bridge (bridge.server.garages): the active system's column profile, so a
---vehicle's garage and state are read the same way here as in the Garages app.
local garages = require 'bridge.server.garages'
---@type table|nil AI Core helpers (bridge.server.aicore): characters, names and search; nil on
---every other framework. AI Core's own tables trail its memory, so on AI Core nothing here reads
---them: characters come from ai-core and vehicles from ai-vehicles.
local aicore = framework.aicore and require 'bridge.server.aicore' or nil

---@type table Records module; the table returned at end of file. Read-only reads of the
---FRAMEWORK's own citizen and vehicle tables, so framework-shape knowledge stays in bridge/ and
---never leaks into server/mdt/. Nothing here writes, and no framework table is ever ALTERed.
local records = {}

---@type { table: string, idCol: string } Framework citizen table: QBCore/QBox key characters by
---citizenid in `players`, ESX by identifier in `users`, ox_core by charId in `characters`, ND by
---charid in `nd_characters`.
---
---ox_core and ND both also HAVE an account table (`users` and `nd_users`), one row per player
---rather than per character - reaching ESX's branch here would read the wrong rows entirely.
local PEOPLE
if framework.name == 'esx' then
    PEOPLE = { table = 'users',         idCol = 'identifier' }
elseif framework.name == 'ox' then
    PEOPLE = { table = 'characters',    idCol = 'charId' }
elseif framework.name == 'nd' then
    PEOPLE = { table = 'nd_characters', idCol = 'charid' }
else
    PEOPLE = { table = 'players',       idCol = 'citizenid' }
end

---@type { table: string, idCol: string } Framework ownership table, picked the same way
---bridge/server/garages.lua picks it.
local VEHICLES
if framework.name == 'esx' then
    VEHICLES = { table = 'owned_vehicles',  idCol = 'owner' }
elseif framework.name == 'ox' then
    VEHICLES = { table = 'vehicles',        idCol = 'owner' }
elseif framework.name == 'nd' then
    VEHICLES = { table = 'nd_vehicles',     idCol = 'owner' }
else
    VEHICLES = { table = 'player_vehicles', idCol = 'citizenid' }
end

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

---Licence keys held in a qb-shaped metadata table, under either spelling.
---@param meta table decoded metadata
---@return string[] licences
local function licencesOf(meta)
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
    return licences
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

    local licences = licencesOf(meta)

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

---Licence keys an ESX character holds, read from esx_license's `user_licenses` table and folded
---onto the qb vocabulary: `drive`, `drive_bike` and `drive_truck` all become `driver`, anything
---else keeps its type name. Empty when the table is not installed. One query, so only the single
---citizen read calls it; the paged search never does.
---@param identifier string ESX identifier
---@return string[] licences
local function esxLicences(identifier)
    if not next(columnsOf('user_licenses')) then return {} end
    local ok, rows = pcall(function()
        return MySQL.query.await('SELECT `type` FROM user_licenses WHERE owner = ?', { identifier })
    end)
    if not ok or type(rows) ~= 'table' then return {} end
    local seen, out = {}, {}
    for i = 1, #rows do
        local key = str(rows[i].type)
        if key:sub(1, 5) == 'drive' then key = 'driver' end
        if key ~= '' and not seen[key] then
            seen[key] = true
            out[#out + 1] = key
        end
    end
    return out
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

---Builds the normalised citizen shape from an ND `nd_characters` row. charid is an INT column, so
---it is stringified on the way out to match the identifier every caller carries.
---@param row table
---@return table citizen
local function ndCitizen(row)
    local cid   = tostring(row.charid)
    local first = str(row.firstname)
    local last  = str(row.lastname)
    local name  = str(first .. ' ' .. last)
    local meta  = decode(row.metadata)

    local activeJob, activeRank = '', 0
    for groupName, group in pairs(decode(row.groups)) do
        if type(groupName) == 'string' and type(group) == 'table' and group.isJob then
            activeJob, activeRank = groupName, tonumber(group.rank) or 0
            break
        end
    end

    return {
        citizenid   = cid,
        name        = name ~= '' and name or cid,
        firstname   = first,
        lastname    = last,
        dob         = str(row.dob),
        sex         = str(row.gender),
        phone       = str(row.phonenumber),
        nationality = '',
        job         = activeJob,
        jobGrade    = activeRank,
        licences    = {},
        fingerprint = str(meta.fingerprint),
        bloodtype   = str(meta.bloodtype),
        callsign    = str(meta.callsign),
    }
end

---Phone numbers for a set of citizenids from sd-phone's own `phone_settings`, for AI Core, which
---keeps no number of its own.
---@param cids string[]
---@return table<string, string> number by citizenid
local function phoneNumbersOf(cids)
    local out = {}
    if #cids == 0 then return out end

    local marks = ('?,'):rep(#cids):sub(1, -2)
    local rows = MySQL.query.await(
        ("SELECT citizenid, phone_number FROM phone_settings WHERE device = 'phone' AND citizenid IN (%s)"):format(marks),
        cids) or {}
    for i = 1, #rows do out[rows[i].citizenid] = str(rows[i].phone_number) end
    return out
end

---Builds the normalised citizen shape from an AI Core character (aicore.characters). The phone
---number comes from the phone's own settings; the job is the highest-graded one held.
---@param character table
---@param phone string|nil
---@return table citizen
local function aiCitizen(character, phone)
    local info  = character.info
    local meta  = type(character.metadata) == 'table' and character.metadata or {}
    local first = str(info.firstname)
    local last  = str(info.lastname)
    local name  = str(first .. ' ' .. last)

    local job, grade = '', 0
    for _, held in ipairs(type(character.jobs) == 'table' and character.jobs or {}) do
        local g = tonumber(held.grade) or 0
        if job == '' or g > grade then job, grade = str(held.job), g end
    end

    return {
        citizenid   = info.citizenid,
        name        = name ~= '' and name or info.citizenid,
        firstname   = first,
        lastname    = last,
        dob         = str(info.birthdate),
        sex         = str(info.sex),
        phone       = str(phone),
        nationality = str(info.nationality),
        job         = job,
        jobGrade    = grade,
        licences    = licencesOf(meta),
        fingerprint = str(meta.fingerprint),
        bloodtype   = str(meta.bloodtype),
        callsign    = str(meta.callsign),
    }
end

---Normalised citizens for a list of citizenids, in that order, read from ai-core all at once.
---Unknown citizenids are left out.
---@param cids string[]
---@return table[] citizens
local function aiCitizens(cids)
    local characters = aicore.characters(cids)
    local phones = phoneNumbersOf(cids)

    local out = {}
    for i = 1, #cids do
        local character = characters[cids[i]]
        if character then out[#out + 1] = aiCitizen(character, phones[cids[i]]) end
    end
    return out
end

---The citizenids of every loaded AI Core character, by name. AI Core keeps no list of everyone to
---browse, so a browse shows who is in the city.
---@return string[] cids
local function aiLoadedCids()
    local loaded = {}
    local ok, sources = pcall(function() return exports['ai-core']:GetLoadedSources() end)
    for _, src in ipairs(ok and type(sources) == 'table' and sources or {}) do
        local info = exports['ai-core']:GetCharacter(src)
        if type(info) == 'table' and type(info.citizenid) == 'string' then
            loaded[#loaded + 1] = { cid = info.citizenid, name = str(str(info.firstname) .. ' ' .. str(info.lastname)):lower() }
        end
    end
    table.sort(loaded, function(a, b) return a.name < b.name end)

    local out = {}
    for i = 1, #loaded do out[i] = loaded[i].cid end
    return out
end

---A page of AI Core citizens. A search takes SearchCharacters' matches (first / last name
---prefixes, citizenid) and then phone number matches from the phone's own settings; a browse takes
---the loaded characters. SearchCharacters reports no total, so a further page reads as one more row.
---@param term string
---@param like string escaped LIKE pattern of the term
---@param browse boolean
---@param limit integer
---@param offset integer
---@return table[] citizens
---@return integer total
local function aiSearchCitizens(term, like, browse, limit, offset)
    local cids
    if browse then
        cids = aiLoadedCids()
    else
        local want, seen = offset + limit + 1, {}
        cids = {}
        local function add(cid)
            if type(cid) ~= 'string' or cid == '' or seen[cid] or #cids >= want then return end
            seen[cid] = true
            cids[#cids + 1] = cid
        end

        for _, c in ipairs((aicore.search(term, want))) do add(c.citizenid) end
        local rows = MySQL.query.await(
            "SELECT citizenid FROM phone_settings WHERE device = 'phone' AND phone_number LIKE ? LIMIT ?",
            { like, want }) or {}
        for i = 1, #rows do add(rows[i].citizenid) end
    end

    local page = {}
    for i = offset + 1, math.min(#cids, offset + limit) do page[#page + 1] = cids[i] end
    return aiCitizens(page), #cids
end

---@type string QBCore/QBox citizen projection.
local QB_CITIZEN_COLS = 'citizenid, charinfo, metadata, job'
---@type string ESX citizen projection.
local ESX_CITIZEN_COLS = 'identifier, firstname, lastname, dateofbirth, sex, phone_number, job, job_grade'
---@type string ND citizen projection. `groups` carries the job: ND stores no job column, the active
---one is the held group flagged isJob.
local ND_CITIZEN_COLS = 'charid, firstname, lastname, dob, gender, phonenumber, `groups`, metadata'

---One citizen by their framework identifier, or nil. Read-only.
---@param cid string citizenid on QBCore/QBox, identifier on ESX
---@return table|nil citizen
function records.getCitizen(cid)
    if type(cid) ~= 'string' or cid == '' then return nil end

    if aicore then return aiCitizens({ cid })[1] end

    if framework.qb then
        local row = MySQL.single.await(
            ('SELECT %s FROM players WHERE citizenid = ? LIMIT 1'):format(QB_CITIZEN_COLS), { cid })
        return row and qbCitizen(row) or nil
    end

    if framework.name == 'nd' then
        local row = MySQL.single.await(
            ('SELECT %s FROM nd_characters WHERE charid = ? LIMIT 1'):format(ND_CITIZEN_COLS),
            { tonumber(cid) })
        return row and ndCitizen(row) or nil
    end

    local have = columnsOf('users')
    local cols = have.metadata and (ESX_CITIZEN_COLS .. ', metadata') or ESX_CITIZEN_COLS
    local row  = MySQL.single.await(
        ('SELECT %s FROM users WHERE identifier = ? LIMIT 1'):format(cols), { cid })
    if not row then return nil end
    local citizen = esxCitizen(row)
    citizen.licences = esxLicences(cid)
    return citizen
end

---Citizen names for a set of identifiers as `{ [citizenid] = name }`. One query, offline
---characters included. Read-only.
---@param cids string[]
---@return table<string, string>
function records.namesFor(cids)
    local out = {}
    if type(cids) ~= 'table' or #cids == 0 then return out end
    if aicore then return aicore.names(cids) end

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

    if framework.name == 'nd' then
        local ids = {}
        for i = 1, #cids do ids[i] = tonumber(cids[i]) end
        local rows = MySQL.query.await(
            ('SELECT charid, firstname, lastname FROM nd_characters WHERE charid IN (%s)'):format(inClause), ids) or {}
        for i = 1, #rows do
            local cid  = tostring(rows[i].charid)
            local name = str(str(rows[i].firstname) .. ' ' .. str(rows[i].lastname))
            out[cid] = name ~= '' and name or cid
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

    if aicore then return aiSearchCitizens(term, like, browse, limit, offset) end

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

    if framework.name == 'nd' then
        local where, args = '', {}
        if not browse then
            where = 'WHERE charid LIKE ? OR firstname LIKE ? OR lastname LIKE ? OR phonenumber LIKE ?'
            args  = { like, like, like, like }
        end
        local order = citizenOrder('nd_characters', 'charid', 'charid')
        local total = MySQL.scalar.await(
            ('SELECT COUNT(*) FROM nd_characters %s'):format(where), args)
        local rows  = MySQL.query.await(
            ('SELECT %s FROM nd_characters %s ORDER BY %s LIMIT %d OFFSET %d')
                :format(ND_CITIZEN_COLS, where, order, limit, offset), args) or {}

        local out = {}
        for i = 1, #rows do out[i] = ndCitizen(rows[i]) end
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
---holds a plain name, else the saved-properties model key (`vehicle` on ESX, `properties` on ND),
---else the row's stored hash - ESX keeps the whole blob under `vehicle`, so a value opening with a
---brace is a row rather than a name. Same rule as garages.lua's modelOf.
---@param row table raw ownership row
---@param modelCol string|nil column carrying the model name
---@return table vehicle
local function vehicleOf(row, modelCol)
    local props = decode(row.vehicle)
    if next(props) == nil then props = decode(row.properties) end
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

---A synchronous ai-vehicles export's answer, nil when it errors (ai-vehicles not running).
---@param name string export name
---@param ... any export arguments
---@return any
local function aiVehicles(name, ...)
    local args = table.pack(...)
    local ok, res = pcall(function()
        return exports['ai-vehicles'][name](exports['ai-vehicles'], table.unpack(args, 1, args.n))
    end)
    return ok and res or nil
end

---Builds the normalised vehicle shape from an ai-vehicles vehicle in its `framework` shape. The
---owner is a citizenid, resolved from ai-vehicles' character id unless the caller already knows it.
---@param v table
---@param ownerCid? string
---@return table vehicle
local function aiVehicle(v, ownerCid)
    local props = type(v.props) == 'table' and v.props or {}
    local model = str(v.model)
    if model == '' then model = str(props.model) end

    local owner = ownerCid
    if not owner and type(v.owner) == 'table' and v.owner.type == 'character' then
        owner = aicore.citizenId(v.owner.id)
    end

    local garage, stored, impound = garages.locationOf(v)
    return {
        plate   = str(v.plate):upper(),
        model   = model,
        owner   = owner,
        garage  = garage,
        state   = stored and 1 or 0,
        impound = impound,
    }
end

---A plate as the mirror keys it: upper-cased, spaces dropped.
---@param plate any
---@return string
local function plateKey(plate)
    return (str(plate):upper():gsub('%s', ''))
end

---@class AiFleetEntry
---@field plate string the plate as ai-vehicles holds it
---@field key string plateKey(plate)
---@field model string upper-cased model name, '' when ai-vehicles had none

---@type table<string, AiFleetEntry> Mirror of the vehicles ai-vehicles holds in memory, by plate key.
---Seeded once from GetPlateOwners and kept current from its `ai-vehicles:owners` event, the way its
---key systems mirror it, so a search never copies the whole list across or asks per vehicle.
local fleet = {}

---@type AiFleetEntry[]|nil The mirror sorted by plate, rebuilt on the first search after a change.
local fleetSorted

---Adds a plate to the mirror. Its model is read once, when the plate enters; an owner change keeps it.
---@param plate any
local function fleetPut(plate)
    local key = plateKey(plate)
    if key == '' or fleet[key] then return end

    local v = aiVehicles('GetVehicle', plate)
    fleet[key] = { plate = plate, key = key, model = type(v) == 'table' and str(v.model):upper() or '' }
    fleetSorted = nil
end

---Fills the mirror from ai-vehicles' snapshot, yielding now and then so a large fleet does not
---stall the server tick.
local function fleetSeed()
    local rows = aiVehicles('GetPlateOwners') or {}
    for i, row in ipairs(rows) do
        if type(row) == 'table' then fleetPut(row[1]) end
        if i % 200 == 0 then Wait(0) end
    end
end

if aicore then
    CreateThread(function()
        if GetResourceState('ai-vehicles') == 'started' then fleetSeed() end
    end)

    ---ai-vehicles' mirror feed: `puts` are `[plate, ownerType, ownerId]` rows that entered memory or
    ---changed owner, `removes` the plates that left memory. One batch per tick.
    AddEventHandler('ai-vehicles:owners', function(puts, removes)
        for _, row in ipairs(type(puts) == 'table' and puts or {}) do
            if type(row) == 'table' then fleetPut(row[1]) end
        end
        for _, plate in ipairs(type(removes) == 'table' and removes or {}) do
            fleet[plateKey(plate)] = nil
        end
        fleetSorted = nil
    end)

    AddEventHandler('onResourceStart', function(resource)
        if resource ~= 'ai-vehicles' then return end
        fleet, fleetSorted = {}, nil
        CreateThread(fleetSeed)
    end)

    AddEventHandler('onResourceStop', function(resource)
        if resource == 'ai-vehicles' then fleet, fleetSorted = {}, nil end
    end)
end

---The mirror sorted by plate.
---@return AiFleetEntry[]
local function sortedFleet()
    if fleetSorted then return fleetSorted end

    fleetSorted = {}
    for _, entry in pairs(fleet) do fleetSorted[#fleetSorted + 1] = entry end
    table.sort(fleetSorted, function(a, b) return a.key < b.key end)
    return fleetSorted
end

---A page of AI Core vehicles. ai-vehicles holds the vehicles of the characters it has loaded and
---answers one stored vehicle by its exact plate, with no search over everything stored, so a search
---matches the mirrored loaded vehicles by plate or model and adds an exact plate match from
---storage; a browse pages the loaded ones. Only the rows shown are read from ai-vehicles.
---@param term string
---@param browse boolean
---@param limit integer
---@param offset integer
---@return table[] vehicles
---@return integer total
local function aiSearchVehicles(term, browse, limit, offset)
    local needle = plateKey(term)
    local model  = str(term):upper()

    local hits, exact = {}, false
    for _, entry in ipairs(sortedFleet()) do
        local byPlate = entry.key:find(needle, 1, true) ~= nil
        local byModel = entry.model ~= '' and entry.model:find(model, 1, true) ~= nil
        if browse or byPlate or byModel then
            hits[#hits + 1] = { plate = entry.plate }
            if entry.key == needle then exact = true end
        end
    end

    if not browse and not exact then
        local v = aicore.awaitOn('ai-vehicles', 'FindVehicle', term, aicore.ANSWER, 'framework')
        if type(v) == 'table' then hits[#hits + 1] = { plate = str(v.plate), v = v } end
    end

    local out = {}
    for i = offset + 1, math.min(#hits, offset + limit) do
        local v = hits[i].v or aiVehicles('GetVehicle', hits[i].plate, 'framework')
        if type(v) == 'table' then out[#out + 1] = aiVehicle(v) end
    end
    return out, #hits
end

---One vehicle by plate, or nil. The plate is matched case- and space-insensitively because the
---framework stores it exactly as the game formatted it. Read-only.
---@param plate string
---@return table|nil vehicle
function records.vehicleByPlate(plate)
    plate = str(plate):upper()
    if plate == '' then return nil end

    if aicore then
        local v = aicore.awaitOn('ai-vehicles', 'FindVehicle', plate, aicore.ANSWER, 'framework')
        return type(v) == 'table' and aiVehicle(v) or nil
    end

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

    if aicore then
        local owner = aicore.vehicleOwner(cid)
        local list = owner and aicore.awaitOn('ai-vehicles', 'GetVehiclesOf', owner, aicore.ANSWER, 'framework')
        local out = {}
        for _, v in ipairs(type(list) == 'table' and list or {}) do
            if type(v) == 'table' then out[#out + 1] = aiVehicle(v, cid) end
        end
        table.sort(out, function(a, b) return a.plate < b.plate end)
        while #out > 60 do out[#out] = nil end
        return out
    end

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

    if aicore then return aiSearchVehicles(term, #term < MIN_TERM, limit, offset) end

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
