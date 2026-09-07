---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): identifier lookups from a trusted source.
local player = require 'bridge.server.player'

---@type table Garage bridge module; the table returned at end of file. Abstracts the supported
---third-party garage systems behind one normalised vehicle list for the Garages app. Read-only -
---it never writes to another resource's tables.
local garages = {}

---@type table Garages config (configs/garages.lua): Enabled + System override + Resources
---detection list + manual waypoint Locations.
local G = config.Garages or { Enabled = false }

---@type { table: string, idCol: string } Framework ownership table: QBCore/Qbox key owned
---vehicles by citizenid in `player_vehicles`, ESX by owner identifier in `owned_vehicles`, and
---ox_core by charId in its own `vehicles`. An if-chain, not a ternary: an unrecognised framework
---must not silently inherit the QBCore table.
local BASE
if framework.name == 'esx' then
    BASE = { table = 'owned_vehicles',  idCol = 'owner' }
elseif framework.name == 'ox' then
    BASE = { table = 'vehicles',        idCol = 'owner' }
elseif framework.name == 'nd' then
    BASE = { table = 'nd_vehicles',     idCol = 'owner' }
else
    BASE = { table = 'player_vehicles', idCol = 'citizenid' }
end

-- Profile fields: garage/state columns are tried in order, first present wins; `stored`/`impound`
-- are the state values meaning parked / impounded; `impoundCol` names a separate truthy flag;
-- storedFallback=false opts out of statusOf's generic 1-means-stored fallback. `outState` is the
-- state value written to mean "out"; `outGarage` is set only on systems that mark out in the
-- GARAGE column. Storage per system:
--   qb-garages / qbx_garages / jg-advancedgarages : player_vehicles
--       garage=`garage`, state=`state` (0 out / 1 stored / 2 impound),
--       fuel=`fuel` (0-100), engine/body=`engine`/`body` (0-1000), props=`mods`
--   lunar_garage / nc_garage / op_garages (QB)     : player_vehicles, garage/state
--   okokGarage / codem-garage (QB)                 : player_vehicles, garage in `parking`
--   cd_garage                                      : owned_vehicles/player_vehicles,
--       garage=`garage_id`, state=`in_garage` (+ separate `impound` flag)
--   esx_garage (+ ESX variants)                    : owned_vehicles
--       owner=`owner`, props=`vehicle` JSON (model hash, fuelLevel, engineHealth,
--       bodyHealth), stored=`stored`/`state`, garage=`parking`/`garage`
--   qs-advancedgarages                             : owned_vehicles (esx) / player_vehicles (qb)
--       garage=`garage` ('OUT' while the car is out), state=`stored` (esx) or
--       `state` (qb), impound=`impound_data` (JSON blob, '' when free),
--       type=`type` ('vehicle'|'boat'|'plane')
--   aty_garage (v1)                                : framework table, garage=`garage` (the config
--       key), state=`state`/`stored`; garages come from its own Config.Garages
--   aty_garage_v2                                  : framework table for ownership, but the
--       garage a car is parked in may live in its own `aty_garage_parked` table instead of a
--       column, and its garages are built in-game into `aty_garages`. Both are read by
--       discovery (see discoveredGarages/columnsOf) because ATY publishes no schema.
--   mt_garages                                    : player_vehicles, garage=`garage`,
--       state=`state` (0 out / 1 stored / 2 impound) - the qb-garages schema. Its garages are
--       built in-game into a table it publishes no schema for, so they are discovered too.
---@type table Permissive fallback column profile for systems without an exact entry.
local DEFAULT_PROFILE = {
    garage     = { 'garage', 'parking', 'garage_id', 'garagename' },
    state      = { 'state', 'stored', 'in_garage' },
    stored     = { [1] = true },
    impound    = { [2] = true },
    impoundCol = 'impound',
    outState   = 0,
}
---@type table<string, table> Exact column profiles, keyed by garage resource name.
local PROFILES = {
    ['qs-advancedgarages'] = { garage = { 'garage' },             state = { 'stored', 'state' }, impoundCol = 'impound_data', outGarage = 'OUT' },
    ['qb-garages']         = { garage = { 'garage' },             state = { 'state' } },
    ['qbx_garages']        = { garage = { 'garage' },             state = { 'state' } },
    ['jg-advancedgarages'] = { garage = { 'garage_id', 'garage' },state = { 'in_garage' }, impoundCol = 'impound' },
    ['lunar_garage']       = { garage = { 'garage', 'parking' },  state = { 'state', 'stored' } },
    ['nc_garage']          = { garage = { 'garage', 'parking' },  state = { 'state', 'stored' } },
    ['op_garages']         = { garage = { 'vehicleGarage', 'garage', 'parking' }, state = { 'state', 'stored' }, stored = { [0] = true }, storedFallback = false, impoundCol = 'isTowedOut', outState = 1 },
    ['okokGarage']         = { garage = { 'parking', 'garage' },  state = { 'state', 'stored' } },
    ['codem-garage']       = { garage = { 'parking', 'garage' },  state = { 'state', 'stored' } },
    ['cd_garage']          = { garage = { 'garage_id', 'garage' },state = { 'in_garage', 'state' } },
    ['esx_garage']         = { garage = { 'parking', 'garage' },  state = { 'stored', 'state' } },
    ['aty_garage']         = { garage = { 'garage', 'parking' },  state = { 'state', 'stored' } },
    ['aty_garage_v2']      = { garage = { 'garage', 'parking' },  state = { 'state', 'stored' }, parkedTable = 'aty_garage_parked' },
    ['mt_garages']         = { garage = { 'garage' },             state = { 'state' } },
    ['ND_Core']            = { garage = {},                       state = { 'stored' }, impoundCol = 'impounded' },
    ['kartik-garages']     = { garage = { 'garage' },             state = { 'state', 'stored' }, impoundCol = 'impound' },
}

---@type table<string, boolean> Systems whose garages are discovered from their own config/table
---rather than read from a runtime export, because they publish no schema for them.
local DISCOVERS_GARAGES = { ['aty_garage'] = true, ['aty_garage_v2'] = true, ['mt_garages'] = true }

---Resolve which supported garage system is running: an explicit config override wins, else the
---first resource in G.Resources that reports `started`.
---@return string|nil name active system's resource name, nil when none is running
local function detectSystem()
    if G.System and G.System ~= 'auto' then return G.System end
    for _, name in ipairs(G.Resources or {}) do
        if GetResourceState(name) == 'started' then return name end
    end
    return nil
end

---@type string|nil Active garage system's resource name, resolved once at load (nil = none).
local ACTIVE  = detectSystem()
---@type table Column profile for the active system; missing keys inherit DEFAULT_PROFILE.
local PROFILE = setmetatable(PROFILES[ACTIVE or ''] or {}, { __index = DEFAULT_PROFILE })

---First non-nil value among the named columns of a row, in preference order.
---@param row table DB row
---@param names string[] candidate column names
---@return any value nil when none present
local function pick(row, names)
    for i = 1, #names do
        local v = row[names[i]]
        if v ~= nil then return v end
    end
    return nil
end

---@type table<string, table<string, boolean>> Present columns per table, resolved on first use.
local columnCache = {}

---The columns a table actually has, read once per table and memoised. A table that does not exist
---resolves to an empty set.
---@param tbl string table name
---@return table<string, boolean> set column name -> true (shared, read-only)
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

---First of the candidate columns that the named table actually has.
---@param tbl string table name
---@param names string[] candidate column names in preference order
---@return string|nil name nil when the table has none of them (or does not exist)
local function firstColumn(tbl, names)
    local cols = columnsOf(tbl)
    for i = 1, #names do
        if cols[names[i]] then return names[i] end
    end
    return nil
end

---Decode the saved vehicle-properties blob (qb `mods`, esx `vehicle`, ND `properties`, some forks
---`modifications`): tables pass through, JSON-looking strings are decoded, failures yield nil.
---@param row table vehicle DB row
---@return table|nil props decoded properties, nil when absent/undecodable
local function decodeProps(row)
    for _, col in ipairs({ 'mods', 'vehicle', 'properties', 'modifications' }) do
        local raw = row[col]
        if type(raw) == 'string' and (lib.string.startsWith(raw, '{') or lib.string.startsWith(raw, '[')) then
            local ok, decoded = pcall(json.decode, raw)
            if ok and type(decoded) == 'table' then return decoded end
        elseif type(raw) == 'table' then
            return raw
        end
    end
    return nil
end

---The vehicle's model: the `vehicle` column when it holds a plain name, else the saved-properties
---model key, else the row's stored hash.
---@param row table vehicle DB row
---@param props table|nil decoded vehicle-properties JSON
---@return string|number|nil model spawn name or hash
local function modelOf(row, props)
    local raw = row.vehicle
    if type(raw) == 'string' and not lib.string.startsWith(raw, '{') then return raw end
    return (props and (props.model or props.modelName)) or row.hash or nil
end

---Clamp a condition value to a rounded 0-100 integer percentage. Values above 100 are assumed to
---be on the 0-1000 health scale and divided down first.
---@param n any candidate value
---@return integer|nil pct nil when not a number
local function clampPct(n)
    if type(n) ~= 'number' then return nil end
    if n > 100 then n = n / 10 end
    if n < 0 then n = 0 elseif n > 100 then n = 100 end
    return lib.math.round(n)
end

---Resolve one condition metric (fuel/engine/body): dedicated column first (tried in order,
---string numbers coerced), then the saved-properties JSON key, else the default.
---@param row table vehicle DB row
---@param props table|nil decoded vehicle-properties JSON
---@param cols string[] candidate column names
---@param propKey string properties JSON key
---@param default integer fallback percentage
---@return integer pct
local function condition(row, props, cols, propKey, default)
    local v = pick(row, cols)
    if type(v) == 'string' then v = tonumber(v) end
    if v == nil and props then v = props[propKey] end
    return clampPct(v) or default
end

---Truthiness of a separate impound-flag column: any non-zero number, true, or a non-empty /
---non-'0' / non-'false' string counts.
---@param f any flag column value
---@return boolean set
local function isFlagSet(f)
    if f == nil or f == false then return false end
    if type(f) == 'number' then return f ~= 0 end
    if type(f) == 'string' then return f ~= '' and f ~= '0' and f:lower() ~= 'false' end
    return f == true
end

---Base status from the DB row: 'stored' or 'out', plus an explicit impound flag. A set
---impound-flag column wins; else the first present state column matches the profile's value sets.
---@param row table vehicle DB row
---@return string status 'stored' | 'out'
---@return boolean impound explicitly impound-flagged
local function statusOf(row)
    local impCol = PROFILE.impoundCol
    if impCol and isFlagSet(row[impCol]) then return 'out', true end
    local v = pick(row, PROFILE.state)
    if v == nil then return 'stored', false end
    if type(v) == 'string' then v = tonumber(v) or v end
    if PROFILE.impound and PROFILE.impound[v] then return 'out', true end
    if PROFILE.stored and PROFILE.stored[v] then return 'stored', false end
    if PROFILE.storedFallback ~= false and (v == 1 or v == true) then return 'stored', false end
    return 'out', false
end

---@return any s with trailing whitespace removed when it's a string, else unchanged
local function trim(s)
    return type(s) == 'string' and (s:gsub('%s+$', '')) or s
end

---Normalised plate (trimmed both ends + uppercased).
---@param p any plate value
---@return string|nil
local function normPlate(p)
    if type(p) ~= 'string' then return nil end
    return (p:gsub('^%s+', ''):gsub('%s+$', '')):upper()
end

---@type integer Seconds the world-plate set and the garage collection stay warm. Both are
---server-global, so a per-player cache upstream still let N players each pay full price inside the
---same second. Kept short: the plate set is live world state.
local MEMO_TTL = 2

---@type table<string, boolean>|nil Last built plate set.
local platesCache
---@type integer os.time the plate set was built (0 = never).
local platesAt = 0

---Set of plates currently spawned in the world (server-side). Memoised: the walk is one entity
---native per vehicle on the whole server, and the answer is the same for every caller.
---@return table<string, boolean> plateSet normalised plate -> true (shared, read-only)
local function spawnedPlates()
    local now = os.time()
    if platesCache and (now - platesAt) < MEMO_TTL then return platesCache end

    local set = {}
    local ok, vehs = pcall(GetAllVehicles)
    if ok and type(vehs) == 'table' then
        for i = 1, #vehs do
            local p = normPlate(GetVehicleNumberPlateText(vehs[i]))
            if p then set[p] = true end
        end
    end
    platesCache, platesAt = set, now
    return set
end

---Display status for a row: statusOf's stored/out, refined to impound when the row is
---impound-flagged or its plate is nowhere in the world.
---@param row table vehicle DB row
---@param spawned table<string, boolean> plate set from spawnedPlates()
---@return string status 'stored' | 'out' | 'impound'
local function displayStatus(row, spawned)
    local status, impound = statusOf(row)
    if status ~= 'out' then return status end
    local p = normPlate(row.plate)
    if impound or not (p and spawned[p]) then return 'impound' end
    return 'out'
end

---Where a vehicle row says it is, resolved through the active system's column profile. Exists so
---the MDT reads garages the same way the Garages app does: it used to look only at `garage`,
---`parking`, `state` and `stored`, which meant every system keeping them elsewhere (jg and cd_garage
---in `garage_id`/`in_garage`, op_garages in `vehicleGarage`) showed as "Not on file" there while the
---Garages app read them correctly.
---@param row table|nil vehicle DB row
---@return string garage garage name, '' when unknown or the row is out
---@return boolean stored parked in a garage
---@return boolean impound explicitly impound-flagged
function garages.locationOf(row)
    if type(row) ~= 'table' then return '', false, false end

    local status, impound = statusOf(row)

    local name = pick(row, PROFILE.garage)
    name = name ~= nil and trim(tostring(name)) or ''

    -- qs-advancedgarages parks the word OUT in the garage column instead of a garage name, so the
    -- column holds a state there, not a place. Printing it would read as a garage called "OUT".
    if PROFILE.outGarage and name:upper() == tostring(PROFILE.outGarage):upper() then name = '' end

    return name, status == 'stored', impound
end

---True when jg-vehiclemileage is running. Checked at call time.
---@return boolean
local function mileageActive()
    return GetResourceState('jg-vehiclemileage') == 'started'
end

---@type string|nil Mileage display unit ('km' | 'mi'), resolved once from jg-vehiclemileage.
local cachedUnit

---The mileage display unit from jg-vehiclemileage's own config, cached after the first read
---('km' unless the resource reports miles).
---@return string unit 'km' | 'mi'
local function mileageUnit()
    if cachedUnit then return cachedUnit end
    local ok, u = pcall(function() return exports['jg-vehiclemileage']:getUnit() end)
    cachedUnit = (ok and u == 'miles') and 'mi' or 'km'
    return cachedUnit
end

---A vehicle's mileage in the configured display unit, truncated to a whole number. Nil when
---unavailable.
---@param plate string|nil plate to look up
---@return integer|nil mileage
---@return string|nil unit 'km' | 'mi'
local function mileageFor(plate)
    if not plate or plate == '' then return nil end
    local ok, km = pcall(function() return exports['jg-vehiclemileage']:getMileageByPlate(plate) end)
    if not ok or type(km) ~= 'number' then return nil end
    local unit = mileageUnit()
    local val  = unit == 'mi' and km * 0.621371 or km
    return math.floor(val), unit
end

-- Garage waypoint resolution: systems with a runtime export (qbx_garages, qb-garages,
-- jg-advancedgarages, cd_garage, op_garages) are read directly, qs-advancedgarages from its config
-- file; the rest fall back to the manual coordinate map in configs.garages -> Locations.

---@type table|nil Last loaded garage collection (nil is a valid cached answer).
local gcolCache
---@type integer os.time the collection was loaded (0 = never).
local gcolAt = 0
---@type table|nil Parsed qs-advancedgarages garage table, held until that resource restarts.
local qsCache
---@type boolean Whether the qs-advancedgarages config has been parsed since the last restart.
local qsParsed = false

---qs-advancedgarages' garage table, parsed once from the `config/config.lua` it ships
---unencrypted and evaluated in a sandbox.
---@return table|nil garages keyed by garage name, nil when unreadable
local function qsGarages()
    if qsParsed then return qsCache end
    qsParsed = true

    local raw = LoadResourceFile('qs-advancedgarages', 'config/config.lua')
    if type(raw) ~= 'string' then return nil end

    local env = setmetatable({ Config = {}, Locales = {} }, { __index = _G })
    local chunk = load(raw, '@qs-advancedgarages/config/config.lua', 't', env)
    if not chunk then return nil end

    local ok = pcall(chunk)
    qsCache = ok and type(env.Config) == 'table' and env.Config.Garages or nil
    return qsCache
end

---@type table|nil Normalised garage map for the systems whose garages are discovered rather than
---exported (ATY v1/v2, mt_garages), held until that resource restarts.
local discoveredCache
---@type boolean Whether the discovered garages have been resolved since the last restart.
local discoveredResolved = false

---x/y out of any of the coordinate shapes a garage config can hold: a vector3/vector4, a
---{ x, y, z } table, or a positional { [1], [2], [3] } array.
---@param c any candidate coordinate value
---@return { x: number, y: number }|nil
local function coordsOf(c)
    if type(c) == 'vector3' or type(c) == 'vector4' then return { x = c.x + 0.0, y = c.y + 0.0 } end
    if type(c) == 'table' then
        local x, y = c.x or c[1], c.y or c[2]
        if type(x) == 'number' and type(y) == 'number' then return { x = x + 0.0, y = y + 0.0 } end
    end
    return nil
end

---The point a garage is marked at: where its attendant stands, else where the vehicle appears.
---@param g table one ATY v1 garage definition
---@return { x: number, y: number }|nil
local function atyV1Point(g)
    return coordsOf(g.pedCoords) or coordsOf(g.vehicleCoords)
end

---The point inside a garage row's coordinate blob, which may be the point itself or wrap named
---points.
---@param blob any decoded coordinate column
---@return { x: number, y: number }|nil
local function blobPoint(blob)
    if type(blob) ~= 'table' then return nil end
    return coordsOf(blob) or coordsOf(blob.pedCoords) or coordsOf(blob.ped) or coordsOf(blob.menu)
end

---ATY v1's garage table, parsed from the config it ships as plain Lua and evaluated in a sandbox.
---Each known config path is tried until one loads.
---@return table|nil garages raw Config.Garages, nil when unreadable
local function atyV1Config()
    for _, path in ipairs({ 'config.lua', 'shared/config.lua', 'config/config.lua', 'configs/config.lua' }) do
        local raw = LoadResourceFile('aty_garage', path)
        if type(raw) == 'string' then
            local env = setmetatable({ Config = {}, Locales = {}, Lang = {} }, { __index = _G })
            local chunk = load(raw, '@aty_garage/' .. path, 't', env)
            if chunk and pcall(chunk) and type(env.Config) == 'table' and type(env.Config.Garages) == 'table' then
                return env.Config.Garages
            end
        end
    end
    return nil
end

---Every row of an in-game-built garage table (ATY v2's `aty_garages`, mt_garages' own).
---@param tbl string table name
---@return table|nil rows raw garage rows, nil when the table is absent
local function garageTableRows(tbl)
    if next(columnsOf(tbl)) == nil then return nil end
    local ok, rows = pcall(function() return MySQL.query.await(('SELECT * FROM `%s`'):format(tbl)) end)
    return (ok and type(rows) == 'table') and rows or nil
end

---One ATY v1 config entry as a normalised garage, keyed under its own id when it carries one.
---@param key any the Config.Garages key
---@param g any the garage definition
---@return string|nil id
---@return { x: number, y: number, impound: boolean }|nil garage
local function atyV1Garage(key, g)
    if type(g) ~= 'table' then return nil, nil end
    local c = atyV1Point(g)
    if not c then return nil, nil end
    return tostring(g.garage or g.name or key), { x = c.x, y = c.y, impound = isFlagSet(g.isImpound or g.impound) }
end

---@type table<string, boolean> Values an impound column can hold that mean "this row is the pound".
local IMPOUND_WORDS = { impound = true, depot = true, pound = true, seized = true }

---Whether a discovered impound column's value marks the row as the pound. A word is judged by
---meaning rather than truthiness: these columns are found by name, and one named `type` holds
---'garage' as often as 'impound', so reading any non-empty string as a set flag would mark every
---garage a pound. Numbers and boolean-ish strings still read as plain flags.
---@param v any impound column value
---@return boolean
local function isImpoundValue(v)
    if type(v) ~= 'string' then return isFlagSet(v) end
    local w = v:lower()
    if tonumber(w) or w == 'true' or w == 'false' then return isFlagSet(v) end
    return IMPOUND_WORDS[w] == true
end

---One garage-table row as a normalised garage, read through the columns discovered on its table.
---@param row table garage row
---@param cols { id: string|nil, blob: string|nil, x: string|nil, y: string|nil, impound: string|nil }
---@return string|nil id
---@return { x: number, y: number, impound: boolean }|nil garage
local function tableGarage(row, cols)
    local c
    if cols.blob and row[cols.blob] ~= nil then
        local raw = row[cols.blob]
        if type(raw) == 'string' then
            local ok, decoded = pcall(json.decode, raw)
            raw = ok and decoded or nil
        end
        c = blobPoint(raw)
    end
    if not c and cols.x and cols.y then
        c = coordsOf({ x = tonumber(row[cols.x]), y = tonumber(row[cols.y]) })
    end

    local id = cols.id and row[cols.id]
    if not c or id == nil then return nil, nil end

    return tostring(id), { x = c.x, y = c.y, impound = isImpoundValue(cols.impound and row[cols.impound]) }
end

---Garages read out of one table whose schema the owning resource never published: the id,
---coordinate and impound columns are discovered, then every row is normalised. A table carrying a
---`plate` column is a vehicle list, not a garage list, and is rejected outright - that shape check
---is what makes it safe to look a table up by name pattern. Nil unless at least one row resolved.
---@param tbl string|nil table name
---@return table<string, { x: number, y: number, impound: boolean }>|nil
local function garagesFromTable(tbl)
    if not tbl then return nil end
    local present = columnsOf(tbl)
    if next(present) == nil or present.plate then return nil end

    local cols = {
        id      = firstColumn(tbl, { 'garage', 'identifier', 'name', 'garage_id', 'label', 'id' }),
        blob    = firstColumn(tbl, { 'coords', 'position', 'data', 'pedCoords', 'ped_coords' }),
        x       = firstColumn(tbl, { 'x', 'pos_x', 'coord_x' }),
        y       = firstColumn(tbl, { 'y', 'pos_y', 'coord_y' }),
        impound = firstColumn(tbl, { 'isImpound', 'is_impound', 'impound', 'type' }),
    }
    if not cols.id or not (cols.blob or (cols.x and cols.y)) then return nil end

    local out, found = {}, false
    local rows = garageTableRows(tbl) or {}
    for i = 1, #rows do
        local id, garage = tableGarage(rows[i], cols)
        if id then out[id], found = garage, true end
    end
    return found and out or nil
end

---Tables mt_garages could keep its in-game-built garages in. It ships no SQL and documents no
---schema, so the table is found by name (`mt_`...`garage`...) and only accepted once
---garagesFromTable confirms its shape. Shortest name first, so the resource's own table is tried
---before any suffixed sibling.
---@return string[] names ordered candidates, empty when the schema has none
local function mtGarageTables()
    local ok, rows = pcall(function()
        return MySQL.query.await([[
            SELECT TABLE_NAME AS name FROM information_schema.tables
            WHERE table_schema = DATABASE() AND TABLE_NAME LIKE 'mt/_%garage%' ESCAPE '/'
            ORDER BY LENGTH(TABLE_NAME), TABLE_NAME
        ]])
    end)
    local out = {}
    if ok and type(rows) == 'table' then
        for i = 1, #rows do
            if type(rows[i].name) == 'string' then out[#out + 1] = rows[i].name end
        end
    end
    return out
end

---The garages of every system that publishes no collection export, normalised to one map:
---garage id -> { x, y, impound }. ATY v1 comes from its plain-Lua config; ATY v2 and mt_garages
---from the table their in-game creator writes. Nil when nothing readable was found, which leaves
---those vehicles on the manual Locations map.
---@return table<string, { x: number, y: number, impound: boolean }>|nil
local function discoveredGarages()
    if discoveredResolved then return discoveredCache end
    discoveredResolved = true

    local out
    if ACTIVE == 'aty_garage' then
        local map, found = {}, false
        for key, g in pairs(atyV1Config() or {}) do
            local id, garage = atyV1Garage(key, g)
            if id then map[id], found = garage, true end
        end
        out = found and map or nil
    elseif ACTIVE == 'aty_garage_v2' then
        out = garagesFromTable('aty_garages')
    elseif ACTIVE == 'mt_garages' then
        local names = mtGarageTables()
        for i = 1, #names do
            out = garagesFromTable(names[i])
            if out then break end
        end
    end

    discoveredCache = out
    return discoveredCache
end

---Plate to garage id from the profile's side table (ATY v2's `aty_garage_parked`), for just these
---plates. An absent table or missing column yields an empty map.
---@param plates string[] normalised plates to look up
---@return table<string, string> map plate -> garage id
local function parkedGarages(plates)
    local tbl = PROFILE.parkedTable
    if not tbl or #plates == 0 then return {} end

    local plateCol  = firstColumn(tbl, { 'plate', 'vehicle_plate', 'numberplate' })
    local garageCol = firstColumn(tbl, { 'garage', 'garage_id', 'identifier', 'name' })
    if not plateCol or not garageCol then return {} end

    local holes = string.rep('?', #plates, ',')
    local ok, rows = pcall(function()
        return MySQL.query.await(
            ('SELECT `%s` AS plate, `%s` AS garage FROM `%s` WHERE `%s` IN (%s)')
                :format(plateCol, garageCol, tbl, plateCol, holes), plates)
    end)
    if not ok or type(rows) ~= 'table' then return {} end

    local map = {}
    for i = 1, #rows do
        local p = normPlate(rows[i].plate)
        if p and rows[i].garage ~= nil then map[p] = tostring(rows[i].garage) end
    end
    return map
end

---Normalised plates of the rows a side-table lookup should cover. Empty unless the profile names
---such a table, since no other system needs the query.
---@param rows table[] vehicle DB rows
---@return string[] plates
local function platesOf(rows)
    local out = {}
    if not PROFILE.parkedTable then return out end
    for i = 1, #rows do
        local p = normPlate(rows[i].plate)
        if p then out[#out + 1] = p end
    end
    return out
end

---Whether membership of the profile's side table is the only parked/out signal available, which is
---true only when the vehicle rows carry no state column at all.
---@param rows table[] vehicle DB rows
---@return boolean
local function parkedIsAuthoritative(rows)
    return PROFILE.parkedTable ~= nil and rows[1] ~= nil and pick(rows[1], PROFILE.state) == nil
end

---Pull the active system's full garage collection. Nil for op_garages (per-garage export lookups)
---and for unsupported systems. Memoised on the same short TTL as the plate set: it crosses a
---resource boundary and every caller gets the same answer.
---@return table|nil collection
local function loadGarageCollection()
    local now = os.time()
    if (now - gcolAt) < MEMO_TTL then return gcolCache end

    local ok, data = pcall(function()
        if ACTIVE == 'qbx_garages'        then return exports['qbx_garages']:GetGarages() end
        if ACTIVE == 'qb-garages'         then return exports['qb-garages']:getAllGarages() end
        if ACTIVE == 'jg-advancedgarages' then return exports['jg-advancedgarages']:getAllGarages() end
        if ACTIVE == 'cd_garage'          then return exports['cd_garage']:GetConfig() end
        if ACTIVE == 'qs-advancedgarages' then return qsGarages() end
        if ACTIVE == 'kartik-garages'     then return exports['kartik-garages']:GetGarages() end
        if DISCOVERS_GARAGES[ACTIVE] then return discoveredGarages() end
        return nil
    end)
    gcolCache, gcolAt = ok and data or nil, now
    return gcolCache
end

-- A cached collection holds tables owned by the garage resource, so a restart must drop it rather
-- than hand out references into the old instance.
if ACTIVE then
    local function dropCollection(name)
        if name == ACTIVE then
            gcolCache, gcolAt   = nil, 0
            qsCache, qsParsed   = nil, false
            discoveredCache, discoveredResolved = nil, false
            columnCache = {}
        end
    end
    AddEventHandler('onResourceStart', dropCollection)
    AddEventHandler('onResourceStop', dropCollection)
end

---Coords (a vector with .x/.y) for the vehicle's garage from the active system's own data.
---pcall-guarded; any shape surprise yields nil.
---@param gcol table|nil pre-loaded garage collection (nil for op_garages / unsupported)
---@param row table the vehicle's DB row
---@param garageId any the row's garage name/id
---@return any coords vector-like with .x/.y, or nil
local function systemCoords(gcol, row, garageId)
    if not ACTIVE then return nil end
    local ok, c = pcall(function()
        if ACTIVE == 'op_garages' then
            local idx = row.vehicleGarage or garageId
            if idx == nil then return nil end
            local g = exports['op_garages']:getGarageByIndex(tostring(idx))
            return g and (g.CenterOfZone or g.AccessPoint)
        end
        if not gcol then return nil end
        if DISCOVERS_GARAGES[ACTIVE] then
            return garageId and gcol[tostring(garageId)]
        elseif ACTIVE == 'qs-advancedgarages' then
            local g = garageId and gcol[garageId]
            local c = g and g.coords
            return c and (c.menuCoords or c.spawnCoords)
        elseif ACTIVE == 'qbx_garages' then
            local g  = gcol[garageId]
            local ap = g and g.accessPoints and g.accessPoints[1]
            return ap and ap.coords
        elseif ACTIVE == 'qb-garages' or ACTIVE == 'jg-advancedgarages' then
            for _, g in pairs(gcol) do
                if g.name == garageId then return g.takeVehicle end
            end
        elseif ACTIVE == 'cd_garage' then
            for _, g in pairs(gcol.Locations or {}) do
                if g.Garage_ID == garageId then return vec3(g.x_1 + 0.0, g.y_1 + 0.0, g.z_1 + 0.0) end
            end
        elseif ACTIVE == 'kartik-garages' then
            for _, g in pairs(gcol or {}) do
                if g.name == garageId or g.label == garageId or g.id == garageId then
                    local c = g.coords or (g.blip and g.blip.coords) or (g.parkingSpots and g.parkingSpots[1])
                    if c then return c end
                end
            end
        end
        return nil
    end)
    return ok and c or nil
end

-- Manual waypoint fallback: coords from configs.garages -> Locations, keyed by the Location text
-- normalised (lowercased, trailing whitespace stripped) at both build and lookup.
---@type table<string, any> Normalised location text -> configured vec2.
local LOC_MAP = {}
do
    local src = G.Locations
    if type(src) == 'table' then
        for name, c in pairs(src) do
            if type(name) == 'string' and c then LOC_MAP[(name:lower():gsub('%s+$', ''))] = c end
        end
    end
end

---Manual-map coords for a location label, using the same normalisation LOC_MAP was built with.
---@param loc any the vehicle's display location text
---@return any coords configured vec2, or nil
local function locationCoords(loc)
    if type(loc) ~= 'string' then return nil end
    return LOC_MAP[(loc:lower():gsub('%s+$', ''))]
end

---@return boolean carDepot whether a depot serves cars (vehicleType car/all/unset) - not the air or sea lot
local function isCarDepot(vt) return vt == nil or vt == 'car' or vt == 'all' end

---Coords of the impound/depot lot an impounded vehicle is retrievable from, preferring a depot
---that serves cars. Nil when nothing matches; pcall-guarded like systemCoords.
---@param gcol table|nil pre-loaded garage collection (nil for op_garages / unsupported)
---@param row table the vehicle's DB row
---@param garageId any the row's garage name/id
---@return any coords vector-like with .x/.y, or nil
local function impoundCoords(gcol, row, garageId)
    if not ACTIVE then return nil end
    local ok, c = pcall(function()
        if ACTIVE == 'op_garages' then
            if row.vehicleImpound == nil then return nil end
            local g = exports['op_garages']:getImpoundByIndex(tostring(row.vehicleImpound))
            return g and g.Coords
        end
        if not gcol then return nil end
        if DISCOVERS_GARAGES[ACTIVE] then
            local own = garageId and gcol[tostring(garageId)]
            if own and own.impound then return own end
            for _, g in pairs(gcol) do
                if g.impound then return g end
            end
            return nil
        elseif ACTIVE == 'qs-advancedgarages' then
            local own = garageId and gcol[garageId]
            local oc  = own and own.isImpound and own.coords
            if oc then return oc.menuCoords or oc.spawnCoords end
            local fallback
            for _, g in pairs(gcol) do
                local c = g.isImpound and g.coords and (g.coords.menuCoords or g.coords.spawnCoords)
                if c then
                    if g.type == nil or g.type == 'vehicle' then return c end
                    fallback = fallback or c
                end
            end
            return fallback
        elseif ACTIVE == 'qbx_garages' then
            local own = garageId and gcol[garageId]
            local ap  = own and own.type == 'depot' and own.accessPoints and own.accessPoints[1]
            if ap then return ap.coords end
            local fallback
            for _, g in pairs(gcol) do
                local p = g.type == 'depot' and g.accessPoints and g.accessPoints[1]
                if p then
                    if isCarDepot(g.vehicleType) then return p.coords end
                    fallback = fallback or p.coords
                end
            end
            return fallback
        elseif ACTIVE == 'qb-garages' or ACTIVE == 'jg-advancedgarages' then
            local fallback
            for _, g in pairs(gcol) do
                if (g.type == 'depot' or g.type == 'impound') and g.takeVehicle then
                    if isCarDepot(g.vehicle or g.vehicleType) then return g.takeVehicle end
                    fallback = fallback or g.takeVehicle
                end
            end
            return fallback
        elseif ACTIVE == 'kartik-garages' then
            for _, g in pairs(gcol or {}) do
                if g.type == 'impound' then
                    local c = g.coords or (g.blip and g.blip.coords) or (g.parkingSpots and g.parkingSpots[1])
                    if c then return c end
                end
            end
        end
        return nil
    end)
    return ok and c or nil
end

---Waypoint for one vehicle: the active system's own data first, the manual Locations map second.
---Impounded vehicles mark the impound/depot lot. Returns a plain { x, y }, or nil.
---@param gcol table|nil pre-loaded garage collection
---@param row table the vehicle's DB row
---@param garageId any the row's garage name/id
---@param location string the display location text (manual-map key)
---@param status string 'stored' | 'impound'
---@return { x: number, y: number }|nil
local function resolveWaypoint(gcol, row, garageId, location, status)
    local c
    if status == 'impound' then
        c = impoundCoords(gcol, row, garageId) or locationCoords(location)
    else
        c = systemCoords(gcol, row, garageId) or locationCoords(location)
    end
    if c and c.x and c.y then return { x = c.x + 0.0, y = c.y + 0.0 } end
    return nil
end

---Resource name of the detected garage system, or nil. Read-only.
---@return string|nil
function garages.activeSystem() return ACTIVE end

---Normalised list of the caller's owned vehicles: stored/out/impound status, condition fields,
---waypoints on stored/impounded rows, and mileage while jg-vehiclemileage runs. Read-only. Keyed on
---the framework identifier rather than the acting SIM identity server/sim/init.lua installs over
---getIdentifier, because ownership belongs to the character and a phone swap must not change whose
---vehicles come back.
---@param source number caller server id
---@return table[] vehicles (empty when disabled / no character / table missing)
function garages.list(source)
    if not G.Enabled then return {} end

    local id = player.getRealIdentifier(source)
    if not id then return {} end

    local ok, rows = pcall(function()
        return MySQL.query.await(('SELECT * FROM `%s` WHERE `%s` = ?'):format(BASE.table, BASE.idCol), { id })
    end)
    if not ok or type(rows) ~= 'table' then
        print(('^1[sd-phone:garages]^0 query failed on `%s` — check your garage system / table'):format(BASE.table))
        return {}
    end

    local useMileage = mileageActive()
    local gcol       = loadGarageCollection()
    local spawned    = spawnedPlates()

    local parked        = parkedGarages(platesOf(rows))
    local parkedDecides = parkedIsAuthoritative(rows)

    local out = {}
    for i = 1, #rows do
        local row   = rows[i]
        local props = decodeProps(row)
        local np    = normPlate(row.plate)
        local inBay = np and parked[np] or nil

        local status
        if parkedDecides then
            status = inBay and 'stored' or ((np and spawned[np]) and 'out' or 'impound')
        else
            status = displayStatus(row, spawned)
        end

        local garageName = pick(row, PROFILE.garage)
        if type(garageName) ~= 'string' or garageName == '' or garageName:upper() == 'OUT' then
            garageName = nil
        end
        garageName = garageName or inBay

        local rawModel = modelOf(row, props)

        local plate = trim(row.plate) or ''
        local veh = {
            id         = tostring(row.id or row.plate or i),
            model      = rawModel,
            hash       = row.hash,
            plate      = plate,
            garage     = garageName or 'Garage',
            location   = (status == 'impound' and 'Impound')
                or (status == 'stored' and (garageName or 'Garage'))
                or 'Out on the street',
            status     = status,
            locked     = status ~= 'out',
            fuel       = condition(row, props, { 'fuel' },   'fuelLevel',    100),
            engine     = condition(row, props, { 'engine' }, 'engineHealth', 100),
            body       = condition(row, props, { 'body' },   'bodyHealth',   100),
            garageType = pick(row, { 'garage_type', 'type', 'category' }),
        }

        if status == 'stored' or status == 'impound' then
            veh.waypoint = resolveWaypoint(gcol, row, garageName, veh.location, status)
        end

        if useMileage then
            local m, unit = mileageFor(plate)
            if m then veh.mileage, veh.mileageUnit = m, unit end
        end

        out[#out + 1] = veh
    end

    return out
end

---Name of the first of the candidate columns actually present on a row, for building an UPDATE.
---@param row table DB row
---@param names string[] candidate column names in preference order
---@return string|nil name
local function pickName(row, names)
    for i = 1, #names do
        if row[names[i]] ~= nil then return names[i] end
    end
    return nil
end

---One of the caller's own vehicles by plate, with the same status the app list shows. Ownership
---resolves from the framework identifier, the same one garages.list reads, so a SIM swap cannot
---turn someone else's plate into a match.
---@param source number caller server id
---@param plate string
---@return table|nil vehicle { row, status, model, props, plate }
function garages.vehicleFor(source, plate)
    if not G.Enabled then return nil end

    local id   = player.getRealIdentifier(source)
    local want = normPlate(plate)
    if not id or not want or want == '' then return nil end

    local ok, rows = pcall(function()
        return MySQL.query.await(('SELECT * FROM `%s` WHERE `%s` = ?'):format(BASE.table, BASE.idCol), { id })
    end)
    if not ok or type(rows) ~= 'table' then return nil end

    local spawned = spawnedPlates()
    for i = 1, #rows do
        local row = rows[i]
        if normPlate(row.plate) == want then
            local props = decodeProps(row)
            return {
                row    = row,
                status = displayStatus(row, spawned),
                model  = modelOf(row, props),
                props  = props,
                plate  = trim(row.plate) or '',
            }
        end
    end
    return nil
end

---Mark one of the caller's vehicles as out of its garage: the profile's state column to its
---`outState`, plus the garage column on systems carrying `outGarage`. The one write in this bridge.
---@param source number caller server id
---@param plate string
---@param netId number|nil network id of the spawned entity, for systems that track it
---@return boolean committed
function garages.takeOut(source, plate, netId)
    local veh = garages.vehicleFor(source, plate)
    if not veh or veh.status ~= 'stored' then return false end

    local row       = veh.row
    local stateCol  = pickName(row, PROFILE.state)
    local garageCol = PROFILE.outGarage and pickName(row, PROFILE.garage) or nil
    if not stateCol and not garageCol then return false end

    local sets, args = {}, {}
    if stateCol then
        sets[#sets + 1] = ('`%s` = ?'):format(stateCol)
        args[#args + 1] = PROFILE.outState
    end
    if garageCol then
        sets[#sets + 1] = ('`%s` = ?'):format(garageCol)
        args[#args + 1] = PROFILE.outGarage
    end
    args[#args + 1] = row.plate

    local ok, affected = pcall(function()
        return MySQL.update.await(
            ('UPDATE `%s` SET %s WHERE `plate` = ?'):format(BASE.table, table.concat(sets, ', ')), args)
    end)
    if not ok or (tonumber(affected) or 0) < 1 then return false end

    if netId then
        pcall(function()
            if ACTIVE == 'jg-advancedgarages' then
                TriggerEvent('jg-advancedgarages:server:register-vehicle-outside', veh.plate, netId)
            elseif ACTIVE == 'qs-advancedgarages' then
                exports['qs-advancedgarages']:setVehicleToPersistent(netId)
            end
        end)
    end

    return true
end

---What the bridge resolved for the caller: detected resource, ownership table, which profile
---columns their rows really carry, and how many garages have usable coordinates. Read-only.
---@param source number caller server id
---@return table report
function garages.diagnose(source)
    local id   = player.getRealIdentifier(source)
    local rows = {}
    if id then
        local ok, r = pcall(function()
            return MySQL.query.await(('SELECT * FROM `%s` WHERE `%s` = ?'):format(BASE.table, BASE.idCol), { id })
        end)
        rows = (ok and type(r) == 'table') and r or {}
    end

    local sample = rows[1]
    local present = {}
    if sample then
        for col in pairs(sample) do present[#present + 1] = col end
        table.sort(present)
    end

    local gcol, placed = loadGarageCollection(), 0
    for _, g in pairs(gcol or {}) do
        if type(g) == 'table' and g.x and g.y then placed = placed + 1 end
    end

    return {
        system      = ACTIVE or 'none detected',
        table       = BASE.table,
        rows        = #rows,
        garageCol   = sample and pickName(sample, PROFILE.garage) or nil,
        stateCol    = sample and pickName(sample, PROFILE.state) or nil,
        parkedTable = PROFILE.parkedTable,
        parkedCols  = PROFILE.parkedTable and next(columnsOf(PROFILE.parkedTable)) ~= nil or false,
        garages     = gcol and placed or 0,
        columns     = present,
    }
end

return garages
