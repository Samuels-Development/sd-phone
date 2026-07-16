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
---vehicles by citizenid in `player_vehicles`, ESX by owner identifier in `owned_vehicles`.
local BASE = framework.name == 'esx'
    and { table = 'owned_vehicles',  idCol = 'owner' }
    or  { table = 'player_vehicles', idCol = 'citizenid' }

-- Profile fields: garage/state columns are tried in order, first present wins; `stored`/`impound`
-- are the state values meaning parked / impounded; `impoundCol` names a separate truthy flag;
-- storedFallback=false opts out of statusOf's generic 1-means-stored fallback. Storage per system:
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
---@type table Permissive fallback column profile for systems without an exact entry.
local DEFAULT_PROFILE = {
    garage     = { 'garage', 'parking', 'garage_id', 'garagename' },
    state      = { 'state', 'stored', 'in_garage' },
    stored     = { [1] = true },
    impound    = { [2] = true },
    impoundCol = 'impound',
}
---@type table<string, table> Exact column profiles, keyed by garage resource name.
local PROFILES = {
    ['qb-garages']         = { garage = { 'garage' },             state = { 'state' } },
    ['qbx_garages']        = { garage = { 'garage' },             state = { 'state' } },
    ['jg-advancedgarages'] = { garage = { 'garage_id', 'garage' },state = { 'in_garage' }, impoundCol = 'impound' },
    ['lunar_garage']       = { garage = { 'garage', 'parking' },  state = { 'state', 'stored' } },
    ['nc_garage']          = { garage = { 'garage', 'parking' },  state = { 'state', 'stored' } },
    ['op_garages']         = { garage = { 'vehicleGarage', 'garage', 'parking' }, state = { 'state', 'stored' }, stored = { [0] = true }, storedFallback = false, impoundCol = 'isTowedOut' },
    ['okokGarage']         = { garage = { 'parking', 'garage' },  state = { 'state', 'stored' } },
    ['codem-garage']       = { garage = { 'parking', 'garage' },  state = { 'state', 'stored' } },
    ['cd_garage']          = { garage = { 'garage_id', 'garage' },state = { 'in_garage', 'state' } },
    ['esx_garage']         = { garage = { 'parking', 'garage' },  state = { 'stored', 'state' } },
}

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

---Decode the saved vehicle-properties blob (qb `mods`, esx `vehicle`, some forks
---`modifications`): tables pass through, JSON-looking strings are decoded, failures yield nil.
---@param row table vehicle DB row
---@return table|nil props decoded properties, nil when absent/undecodable
local function decodeProps(row)
    for _, col in ipairs({ 'mods', 'vehicle', 'modifications' }) do
        local raw = row[col]
        if type(raw) == 'string' and (raw:sub(1, 1) == '{' or raw:sub(1, 1) == '[') then
            local ok, decoded = pcall(json.decode, raw)
            if ok and type(decoded) == 'table' then return decoded end
        elseif type(raw) == 'table' then
            return raw
        end
    end
    return nil
end

---Clamp a condition value to a rounded 0-100 integer percentage. Values above 100 are assumed to
---be on the 0-1000 health scale and divided down first.
---@param n any candidate value
---@return integer|nil pct nil when not a number
local function clampPct(n)
    if type(n) ~= 'number' then return nil end
    if n > 100 then n = n / 10 end
    if n < 0 then n = 0 elseif n > 100 then n = 100 end
    return math.floor(n + 0.5)
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

---Set of plates currently spawned in the world (server-side).
---@return table<string, boolean> plateSet normalised plate -> true
local function spawnedPlates()
    local set = {}
    local ok, vehs = pcall(GetAllVehicles)
    if ok and type(vehs) == 'table' then
        for i = 1, #vehs do
            local p = normPlate(GetVehicleNumberPlateText(vehs[i]))
            if p then set[p] = true end
        end
    end
    return set
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
-- jg-advancedgarages, cd_garage, op_garages) are read directly; the rest fall back to the manual
-- coordinate map in configs.garages -> Locations.

---Pull the active system's full garage collection once per list() call. Nil for op_garages
---(per-garage export lookups) and for unsupported systems.
---@return table|nil collection
local function loadGarageCollection()
    local ok, data = pcall(function()
        if ACTIVE == 'qbx_garages'        then return exports['qbx_garages']:GetGarages() end
        if ACTIVE == 'qb-garages'         then return exports['qb-garages']:getAllGarages() end
        if ACTIVE == 'jg-advancedgarages' then return exports['jg-advancedgarages']:getAllGarages() end
        if ACTIVE == 'cd_garage'          then return exports['cd_garage']:GetConfig() end
        return nil
    end)
    return ok and data or nil
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
        if ACTIVE == 'qbx_garages' then
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
        if ACTIVE == 'qbx_garages' then
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
---waypoints on stored/impounded rows, and mileage while jg-vehiclemileage runs. Read-only.
---@param source number caller server id
---@return table[] vehicles (empty when disabled / no character / table missing)
function garages.list(source)
    if not G.Enabled then return {} end

    local id = player.getIdentifier(source)
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
    local out = {}
    for i = 1, #rows do
        local row   = rows[i]
        local props = decodeProps(row)
        local status, impound = statusOf(row)
        if status == 'out' then
            local p = normPlate(row.plate)
            if impound or not (p and spawned[p]) then status = 'impound' end
        end

        local garageName = pick(row, PROFILE.garage)
        if type(garageName) ~= 'string' or garageName == '' then garageName = nil end

        local rawModel = row.vehicle
        if type(rawModel) ~= 'string' or rawModel:sub(1, 1) == '{' then
            rawModel = (props and (props.model or props.modelName)) or row.hash or nil
        end

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

return garages
