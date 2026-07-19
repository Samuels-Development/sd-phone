---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): identifier/name lookups from a trusted source.
local player = require 'bridge.server.player'

---@type table Housing bridge module; the table returned at end of file. Abstracts the supported
---housing systems behind one normalised property list plus capability-gated actions (lock / key
---list / key management).
local housing = {}

---@type table Homes config (configs/housing.lua): Enabled flag + System override + Resources
---detection list.
local H = config.Housing or { Enabled = false }

---Resolve which supported housing system is running: an explicit config override wins, else the
---first resource in H.Resources that reports `started`.
---@return string|nil name active system's resource name, nil when none is running
local function detectSystem()
    if H.System and H.System ~= 'auto' then return H.System end
    for _, name in ipairs(H.Resources or {}) do
        if GetResourceState(name) == 'started' then return name end
    end
    return nil
end

---@type string|nil Active housing system's resource name, resolved once at load (nil = none).
local ACTIVE = detectSystem()

---Parameterised query; returns nil on error or a non-table result.
---@param sql string parameterised SQL
---@param params table bind parameters
---@return table|nil rows result rows, nil on error or non-table result
local function dbQuery(sql, params)
    local ok, rows = pcall(function() return MySQL.query.await(sql, params) end)
    if ok and type(rows) == 'table' then return rows end
    return nil
end

---Decode a JSON column: tables pass through, JSON-looking strings are decoded, failures yield
---nil.
---@param raw any column value (table, JSON string, or anything else)
---@return table|nil decoded
local function decodeJson(raw)
    if type(raw) == 'table' then return raw end
    if type(raw) == 'string' and (raw:sub(1, 1) == '{' or raw:sub(1, 1) == '[') then
        local ok, d = pcall(json.decode, raw)
        if ok and type(d) == 'table' then return d end
    end
    return nil
end

---@return number numeric coercion of v (0 when not numeric)
local function num(v) return tonumber(v) or 0 end
---@return boolean truthiness across the mixed flag encodings housing rows use (nil/false/0/'0' are false)
local function truthy(v) return v ~= nil and v ~= 0 and v ~= false and v ~= '0' end
---@return string|nil v when it's a non-empty string, else nil
local function s(v) return (type(v) == 'string' and v ~= '') and v or nil end

---Pull a flat { x, y } out of the coord shapes housing scripts use: a vector table, a JSON
---string, or an array. Nil when neither x nor y can be found.
---@param v any candidate coord value
---@return { x: number, y: number }|nil
local function asXY(v)
    if type(v) == 'string' then v = decodeJson(v) end
    if type(v) ~= 'table' then return nil end
    local x = v.x or v[1]
    local y = v.y or v[2]
    if x and y then return { x = num(x), y = num(y) } end
    return nil
end

---Try several field names on a row/object and return the first that yields XY.
---@param row any DB row or export record
---@param ... string candidate field names, in preference order
---@return { x: number, y: number }|nil
local function coordsFrom(row, ...)
    if type(row) ~= 'table' then return nil end
    for _, k in ipairs({ ... }) do
        local xy = asXY(row[k])
        if xy then return xy end
    end
    return nil
end

---Coerce a client-echoed property id to a number when numeric, else return it unchanged.
---@param id any client-echoed property id
---@return any id a number when numeric, else unchanged
local function pid(id) return tonumber(id) or id end

---Map an array of citizenids (or { citizenid = ... } objects) to the app's { id, name } holder
---shape, resolving online players to a friendly name and defaulting the rest to 'Resident'.
---@param list any candidate holder array
---@return table[] holders { id = citizenid, name }
local function resolveCids(list)
    if type(list) ~= 'table' then return {} end
    local online = player.onlineCidMap()
    local out = {}
    for _, v in pairs(list) do
        local cid = type(v) == 'table' and (v.citizenid or v.identifier or v.cid or v.id) or v
        if cid ~= nil and cid ~= '' then
            cid = tostring(cid)
            local osrc = online[cid]
            out[#out + 1] = {
                id   = cid,
                name = (osrc and player.getName(osrc)) or (type(v) == 'table' and s(v.name)) or 'Resident',
            }
        end
    end
    return out
end

---Build a normalised Home with safe defaults, matching the React `Home` shape (id, address,
---type, area, value, status, coords?, locked?). The id is stringified.
---@param o table raw field bag from an adapter
---@return table home normalised property record
local function home(o)
    return {
        id      = tostring(o.id or o.address or ''),
        address = o.address or 'Property',
        type    = o.type or 'Property',
        area    = o.area or '',
        value   = num(o.value),
        status  = o.status == 'rented' and 'rented' or 'owned',
        coords  = o.coords or nil,
        locked  = o.locked,
    }
end

-- Per-system adapters, keyed by resource name: (source, id) -> Home[]. Sources per system:
--   ps-housing   DB `properties` (owner_citizenid, street, region, apartment, price, door_data) - open source
--   qs-housing   DB `player_houses` joined to `houselocations` (owner, rented, label, price, coords, keyholders)
--   vms_housing  export GetProperty(id).metadata.enter | DB `houses`; keys via vms_housing:sv:giveKey/removeKey
--   rtx_housing  export GetPlayerOwnedProperties / GetPropertyData(.enter.coords) / Get|SetPropertyLockStatus
--   bcs_housing  export GetOwnedHomes / GetHome(.properties.entry) / LockHome / isLocked / Add|RemoveKeyHolder / GetKeyHolders
--   tk_housing   export getPropertiesByIdentifier (list only - no coords/lock/keys public)
--   rx_housing   export GetOwnedProperties / GetProperty / AddKeyholder / RemoveKeyholder / GetPropertyKeyholders
--   loaf_housing export GetPlayerHouses | DB `loaf_houses`.entrance (coords only; keys need an undocumented keyId)
--   origen_housing exports getPlayerHouses(.entryCoords) / toggleDoor / getHouseDoor / addKeyHolder / removeKeyHolder
---@type table<string, fun(source: number, id: string): table[]> Per-system property-list adapters.
local ADAPTERS = {}

---ps-housing: single `properties` table, no rental concept; entrance coords from the door_data
---JSON.
---@param _source number caller server id (unused - the table keys by citizenid)
---@param id string caller citizenid
---@return table[] homes
ADAPTERS['ps-housing'] = function(_source, id)
    local rows = dbQuery('SELECT * FROM `properties` WHERE `owner_citizenid` = ?', { id })
    if not rows then return {} end
    local out = {}
    for _, r in ipairs(rows) do
        local apt = s(r.apartment)
        out[#out + 1] = home{
            id      = r.property_id or r.id,
            address = s(r.street) or s(r.description),
            type    = apt and 'Apartment' or 'House',
            area    = s(r.region),
            value   = r.price,
            status  = 'owned',
            coords  = coordsFrom(r, 'door_data'),
        }
    end
    return out
end

---qs-housing: ownership/rental in `player_houses`, label/price/coords/keyholders from the joined
---`houselocations`; falls back to the ownership table alone when the join fails.
---@param _source number caller server id (unused - the table keys by owner identifier)
---@param id string caller identifier
---@return table[] homes
ADAPTERS['qs-housing'] = function(_source, id)
    local rows = dbQuery([[
        SELECT ph.*, hl.label AS hl_label, hl.name AS hl_name, hl.price AS hl_price, hl.coords AS hl_coords
        FROM `player_houses` ph
        LEFT JOIN `houselocations` hl ON hl.name = ph.house
        WHERE ph.owner = ?
    ]], { id }) or dbQuery('SELECT * FROM `player_houses` WHERE `owner` = ?', { id })
    if not rows then return {} end
    local out = {}
    for _, r in ipairs(rows) do
        out[#out + 1] = home{
            id      = r.id or r.house,
            address = s(r.hl_label) or s(r.hl_name) or s(r.house) or s(r.label),
            type    = 'Property',
            area    = s(r.zone) or s(r.region),
            value   = r.hl_price or r.price,
            status  = truthy(r.rented) and 'rented' or 'owned',
            coords  = coordsFrom(r, 'hl_coords', 'coords'),
        }
    end
    return out
end

---vms_housing: single `houses` table; `owner` owns, `renter` rents, with an owner-only fallback
---query. Entrance coords from `metadata.enter`.
---@param _source number caller server id (unused - the table keys by identifier)
---@param id string caller identifier
---@return table[] homes
ADAPTERS['vms_housing'] = function(_source, id)
    local rows = dbQuery('SELECT * FROM `houses` WHERE `owner` = ? OR `renter` = ?', { id, id })
                 or dbQuery('SELECT * FROM `houses` WHERE `owner` = ?', { id })
    if not rows then return {} end
    local out = {}
    for _, r in ipairs(rows) do
        local meta = decodeJson(r.metadata)
        out[#out + 1] = home{
            id      = r.id,
            address = s(r.address) or s(r.name),
            type    = s(r.type),
            area    = s(r.region),
            value   = r.price or (meta and (meta.price or meta.value)),
            status  = (s(r.renter) == id) and 'rented' or 'owned',
            coords  = (meta and (asXY(meta.enter) or asXY(meta.coords))) or coordsFrom(r, 'enter', 'coords'),
        }
    end
    return out
end

---rtx_housing - documented export first, DB `houses` as fallback. Entrance coords come from
---`.enter.coords`; live lock state is read per home via GetPropertyLockStatus.
---@param source number caller server id (the export keys on it)
---@param id string caller identifier (DB fallback)
---@return table[] homes
ADAPTERS['rtx_housing'] = function(source, id)
    local props
    local ok, res = pcall(function() return exports['rtx_housing']:GetPlayerOwnedProperties(source) end)
    if ok and type(res) == 'table' then props = res end
    if not props then props = dbQuery('SELECT * FROM `houses` WHERE `owneridentifier` = ?', { id }) end
    if not props then return {} end
    local out = {}
    for _, r in pairs(props) do
        local hid    = r.id or r.adress or r.address
        local enter  = r.enter
        local coords = (type(enter) == 'table' and (asXY(enter.coords) or asXY(enter))) or coordsFrom(r, 'coords')
        local locked
        local okl, lk = pcall(function() return exports['rtx_housing']:GetPropertyLockStatus(hid) end)
        if okl and type(lk) == 'boolean' then locked = lk end
        out[#out + 1] = home{
            id      = hid,
            address = s(r.adress) or s(r.address) or s(r.label),
            type    = s(r.housetype) or s(r.type) or 'House',
            area    = s(r.region) or s(r.area),
            value   = r.houseprice or r.price,
            status  = truthy(r.rented) and 'rented' or 'owned',
            coords  = coords,
            locked  = locked,
        }
    end
    return out
end

---bcs_housing - documented exports for owned homes; entrance coords + lock state come from
---GetHome(homeId)/isLocked per home.
---@param _source number caller server id (unused - the exports key by identifier)
---@param id string caller identifier
---@return table[] homes
ADAPTERS['bcs_housing'] = function(_source, id)
    local props
    local ok, res = pcall(function() return exports.bcs_housing:GetOwnedHomes(id) end)
    if ok and type(res) == 'table' then props = res end
    if not props then return {} end
    local out = {}
    for _, h in pairs(props) do
        local hid = h.identifier or h.id
        local coords, locked
        local okh, full = pcall(function() return exports.bcs_housing:GetHome(hid) end)
        if okh and type(full) == 'table' and type(full.properties) == 'table' then
            coords = asXY(full.properties.entry)
                or (type(full.properties.data) == 'table' and type(full.properties.data.flat) == 'table' and asXY(full.properties.data.flat.coords))
        end
        local okl, lk = pcall(function() return exports.bcs_housing:isLocked(hid) end)
        if okl and type(lk) == 'boolean' then locked = lk end
        out[#out + 1] = home{
            id      = hid,
            address = s(h.name) or s(h.label),
            type    = s(h.type),
            area    = s(h.complex),
            value   = h.price,
            status  = (h.payment == 'Rent') and 'rented' or 'owned',
            coords  = coords,
            locked  = locked,
        }
    end
    return out
end

---tk_housing - documented export returns the identifier's properties (list only; no public
---coords/lock/keys API).
---@param _source number caller server id (unused - the export keys by identifier)
---@param id string caller identifier
---@return table[] homes
ADAPTERS['tk_housing'] = function(_source, id)
    local props
    local ok, res = pcall(function() return exports.tk_housing:getPropertiesByIdentifier(id) end)
    if ok and type(res) == 'table' then props = res end
    if not props then return {} end
    local out = {}
    for _, p in pairs(props) do
        out[#out + 1] = home{
            id      = p.id,
            address = s(p.address) or s(p.name),
            type    = s(p.type),
            value   = p.price,
            status  = (s(p.owner) == id) and 'owned' or 'rented',
        }
    end
    return out
end

---rx_housing: export namespace is `RxHousing`; coords probed across common field names.
---@param _source number caller server id (unused - the export keys by identifier)
---@param id string caller identifier
---@return table[] homes
ADAPTERS['rx_housing'] = function(_source, id)
    local props
    local ok, res = pcall(function() return exports['RxHousing']:GetOwnedProperties(id) end)
    if ok and type(res) == 'table' then props = res end
    if not props then return {} end
    local out = {}
    for _, p in pairs(props) do
        out[#out + 1] = home{
            id      = p.id or p.propertyId or p.label,
            address = s(p.label) or s(p.address) or s(p.name),
            type    = s(p.type) or s(p.propertyType),
            area    = s(p.region) or s(p.area),
            value   = p.price or p.value,
            status  = 'owned',
            coords  = coordsFrom(p, 'coords', 'enter', 'entrance', 'entryCoords', 'location'),
        }
    end
    return out
end

---loaf_housing: export probe, tried with the server id then the identifier; entrance coords from
---the row JSON when present.
---@param source number caller server id
---@param id string caller identifier
---@return table[] homes
ADAPTERS['loaf_housing'] = function(source, id)
    local props
    local ok, res = pcall(function() return exports['loaf_housing']:GetPlayerHouses(source) end)
    if ok and type(res) == 'table' then props = res end
    if not props then
        local ok2, res2 = pcall(function() return exports['loaf_housing']:GetPlayerHouses(id) end)
        if ok2 and type(res2) == 'table' then props = res2 end
    end
    if not props then return {} end
    local out = {}
    for _, p in pairs(props) do
        out[#out + 1] = home{
            id      = p.id or p.identifier or p.label,
            address = s(p.label) or s(p.name) or s(p.address),
            type    = s(p.type),
            area    = s(p.zone) or s(p.region),
            value   = p.price or p.value,
            status  = 'owned',
            coords  = coordsFrom(p, 'entrance', 'coords', 'location', 'enter'),
        }
    end
    return out
end

---origen_housing - server exports, probed newest-name-first (GetPlayerProperties by source, then
---GetOwnedProperties by identifier). Entrance coords from `entryCoords`/`location`.
---@param source number caller server id
---@param id string caller identifier
---@return table[] homes
ADAPTERS['origen_housing'] = function(source, id)
    local props
    for _, attempt in ipairs({
        function() return exports['origen_housing']:GetPlayerProperties(source) end,
        function() return exports['origen_housing']:GetOwnedProperties(id) end,
    }) do
        local ok, res = pcall(attempt)
        if ok and type(res) == 'table' then props = res; break end
    end
    if not props then return {} end
    local out = {}
    for _, p in pairs(props) do
        out[#out + 1] = home{
            id      = p.id or p.identifier or p.label,
            address = s(p.label) or s(p.name) or s(p.address) or s(p.street),
            type    = s(p.type) or s(p.propertyType),
            area    = s(p.region) or s(p.area) or s(p.zone),
            value   = p.price or p.value,
            status  = 'owned',
            coords  = coordsFrom(p, 'entryCoords', 'location', 'coords', 'enter'),
        }
    end
    return out
end

---LNS_Housing: reads the in-memory Properties table via the GetProperties export and filters to
---properties owned by the calling player. Entrance coords come from `metadata.entrance`; lock
---state from `metadata.locked`; property type is inferred from `metadata.shell`.
---@param _source number caller server id (unused - filtered by owner citizenid)
---@param id string caller citizenid
---@return table[] homes
ADAPTERS['LNS_Housing'] = function(_source, id)
    local ok, props = pcall(function() return exports.LNS_Housing:GetProperties() end)
    if not ok or type(props) ~= 'table' then return {} end
    local out = {}
    for _, p in pairs(props) do
        local isOwner = (p.owner == id)
        local isKeyholder = false
        if not isOwner and p.permissions and type(p.permissions.entry) == 'table' then
            for _, cid in ipairs(p.permissions.entry) do
                if cid == id then isKeyholder = true; break end
            end
        end
        if isOwner or isKeyholder then
            local shell = p.metadata and p.metadata.shell
            local propType = (shell == 'mlo') and 'House'
                          or (type(shell) == 'string' and shell ~= '' and shell)
                          or 'Property'
            out[#out + 1] = home{
                id      = p.id,
                address = s(p.label),
                type    = propType,
                area    = '',
                value   = p.price,
                status  = isOwner and ((p.sale_type == 'rent') and 'rented' or 'owned') or 'rented',
                coords  = p.metadata and asXY(p.metadata.entrance) or nil,
                locked  = p.metadata and p.metadata.locked or nil,
            }
        end
    end
    return out
end

-- Capability map: which detail-view actions each system supports.
---@type table<string, { lock: boolean, keyList: boolean, keyManage: boolean }> Per-system action support.
local CAPS = {
    ['bcs_housing']    = { lock = true,  keyList = true,  keyManage = true  },
    ['ps-housing']     = { lock = false, keyList = true,  keyManage = true  },
    ['rtx_housing']    = { lock = true,  keyList = false, keyManage = false },
    ['tk_housing']     = { lock = false, keyList = false, keyManage = false },
    ['origen_housing'] = { lock = true,  keyList = false, keyManage = true  },
    ['rx_housing']     = { lock = false, keyList = true,  keyManage = true  },
    ['qs-housing']     = { lock = false, keyList = true,  keyManage = false },
    ['vms_housing']    = { lock = false, keyList = false, keyManage = true  },
    ['loaf_housing']   = { lock = false, keyList = false, keyManage = false },
    ['LNS_Housing']    = { lock = true,  keyList = true,  keyManage = true  },
}

---Capability flags for the active system, all-false when none is detected.
---@return { lock: boolean, keyList: boolean, keyManage: boolean }
local function caps() return CAPS[ACTIVE or ''] or { lock = false, keyList = false, keyManage = false } end

---Run an owner-gated action on the caller's client via the 'sd-phone:client:housing:exec'
---callback; nil when the client callback errors. Client twin: bridge/client/housing.lua.
---@param src number caller server id (the property owner using the app)
---@param action string 'lock' | 'give' | 'remove' | 'keyHolders'
---@param ... any action arguments, forwarded verbatim
---@return any result client-side result, nil on error
local function clientExec(src, action, ...)
    local args = { ... }
    local ok, res = pcall(function()
        return lib.callback.await('sd-phone:client:housing:exec', src, ACTIVE, action, table.unpack(args))
    end)
    if ok then return res end
    return nil
end

---The first defined key name for a bcs home, defaulting to 'Resident' when none can be read.
---@param id any property id
---@return string keyName
local function bcsDefaultKey(id)
    local ok, keys = pcall(function() return exports.bcs_housing:GetKeyList(id) end)
    if ok and type(keys) == 'table' then
        for _, k in pairs(keys) do
            if type(k) == 'table' then return k.name or k.key or k.label or 'Resident' end
            if type(k) == 'string' then return k end
        end
    end
    return 'Resident'
end

---Resource name of the detected housing system, or nil. Read-only.
---@return string|nil
function housing.activeSystem() return ACTIVE end

---Capability flags for the detected system (the app hides unsupported actions). Read-only.
---@return { lock: boolean, keyList: boolean, keyManage: boolean }
function housing.capabilities()
    local c = caps()
    return { lock = c.lock, keyList = c.keyList, keyManage = c.keyManage }
end

---Normalised list of the caller's own properties via the active system's adapter. An adapter
---failure degrades to an empty list with a console warning.
---@param source number caller server id
---@return table[] homes (empty when disabled / no character / unsupported system / adapter failure)
function housing.list(source)
    if not H.Enabled then return {} end
    local id = player.getIdentifier(source)
    if not id then return {} end

    local adapter = ADAPTERS[ACTIVE or '']
    if not adapter then return {} end

    local ok, list = pcall(adapter, source, id)
    if not ok or type(list) ~= 'table' then
        print(('^1[sd-phone:housing]^0 adapter failed for `%s` — check the housing system / its exports'):format(ACTIVE or '?'))
        return {}
    end
    return list
end

---Ownership gate: true only when the id matches a property in the caller's own normalised list,
---resolved fresh from the active adapter. Ids compare as strings.
---@param src number caller server id
---@param id any client-echoed property id
---@return boolean owns true only when the property is in the caller's own list
local function ownsProperty(src, id)
    if id == nil then return false end
    local key = tostring(id)
    for _, h in ipairs(housing.list(src)) do
        if h.id == key then return true end
    end
    return false
end

---Set the front-door lock state. Ownership-gated. Returns the resulting locked boolean, or nil
---when the active system has no lock API or the gate rejects.
---@param src number  owner source
---@param id any       property id (client-echoed)
---@param want boolean desired locked state
---@return boolean|nil
function housing.lock(src, id, want)
    if not caps().lock or not ownsProperty(src, id) then return nil end
    want = want and true or false
    local p = pid(id)
    if ACTIVE == 'rtx_housing' then
        pcall(function() exports['rtx_housing']:SetPropertyLockStatus(p, want) end)
        return want
    elseif ACTIVE == 'bcs_housing' then
        local ok, cur = pcall(function() return exports.bcs_housing:isLocked(p) end)
        if (ok and type(cur) == 'boolean' and cur ~= want) or not ok then
            pcall(function() exports.bcs_housing:LockHome(p) end)
        end
        return want
    elseif ACTIVE == 'origen_housing' then
        local r = clientExec(src, 'lock', p, want)
        return r == nil and nil or (r and true or false)
    elseif ACTIVE == 'LNS_Housing' then
        local okPerm, allowed = pcall(function()
            return exports.LNS_Housing:CheckPermission(src, 'house', p, 'manage')
        end)
        if not okPerm or not allowed then return nil end
        local okProp, prop = pcall(function() return exports.LNS_Housing:GetProperty(p) end)
        local cur = okProp and type(prop) == 'table' and prop.metadata and prop.metadata.locked
        if cur ~= want then
            local okT, newState = pcall(function() return exports.LNS_Housing:ToggleLock(p) end)
            if okT and type(newState) == 'boolean' then return newState end
        end
        return want
    end
    return nil
end

---List the property's key holders as { id, name } records (id = citizenid). Ownership-gated;
---read via server exports, the qs keyholders column, or the caller's client, per system.
---@param src number caller source
---@param id any property id (client-echoed)
---@return table[] holders (empty when unsupported or rejected)
function housing.keyHolders(src, id)
    if not caps().keyList or not ownsProperty(src, id) then return {} end
    local p = pid(id)
    if ACTIVE == 'bcs_housing' then
        local ok, list = pcall(function() return exports.bcs_housing:GetKeyHolders(p) end)
        if not ok or type(list) ~= 'table' then return {} end
        local out = {}
        for _, k in pairs(list) do
            out[#out + 1] = { id = tostring(k.identifier or k.id or ''), name = s(k.name) or 'Resident' }
        end
        return out
    elseif ACTIVE == 'rx_housing' then
        local ok, list = pcall(function() return exports['RxHousing']:GetPropertyKeyholders(p) end)
        return ok and resolveCids(list) or {}
    elseif ACTIVE == 'qs-housing' then
        local rows = dbQuery('SELECT `keyholders` FROM `player_houses` WHERE `id` = ? OR `house` = ?', { id, id })
        local raw  = rows and rows[1] and rows[1].keyholders
        return resolveCids(decodeJson(raw))
    elseif ACTIVE == 'ps-housing' then
        local r = clientExec(src, 'keyHolders', p)
        return type(r) == 'table' and r or {}
    elseif ACTIVE == 'LNS_Housing' then
        local okPerm, allowed = pcall(function()
            return exports.LNS_Housing:CheckPermission(src, 'house', p, 'manage')
        end)
        if not okPerm or not allowed then return {} end
        local okProp, prop = pcall(function() return exports.LNS_Housing:GetProperty(p) end)
        if not okProp or type(prop) ~= 'table' then return {} end
        local entry = prop.permissions and prop.permissions.entry
        return resolveCids(entry)
    end
    return {}
end

---Grant a key to an online player, addressed by server id (coerced to a positive integer and
---converted to each system's identifier). Ownership-gated; true on apparent success.
---@param src number  owner source
---@param id any property id (client-echoed)
---@param targetSrc number|string  the recipient's server id
---@return boolean
function housing.giveKey(src, id, targetSrc)
    if not caps().keyManage or not ownsProperty(src, id) then return false end
    targetSrc = tonumber(targetSrc)
    if not targetSrc or targetSrc < 1 or targetSrc % 1 ~= 0 then return false end
    local p = pid(id)
    if ACTIVE == 'bcs_housing' then
        return pcall(function() exports.bcs_housing:AddKeyHolder(p, targetSrc, bcsDefaultKey(p)) end)
    elseif ACTIVE == 'rx_housing' then
        local cid = player.getIdentifier(targetSrc)
        if not cid then return false end
        local ok, res = pcall(function() return exports['RxHousing']:AddKeyholder(p, cid) end)
        if ok and res ~= false then
            TriggerClientEvent('sd-phone:client:homes:refresh', src)
            TriggerClientEvent('sd-phone:client:homes:refresh', targetSrc)
        end
        return ok and res ~= false
    elseif ACTIVE == 'ps-housing' or ACTIVE == 'origen_housing' or ACTIVE == 'vms_housing' then
        local res = clientExec(src, 'give', p, targetSrc)
        if res then
            TriggerClientEvent('sd-phone:client:homes:refresh', src)
            TriggerClientEvent('sd-phone:client:homes:refresh', targetSrc)
        end
        return res and true or false
    elseif ACTIVE == 'LNS_Housing' then
        local okPerm, allowed = pcall(function()
            return exports.LNS_Housing:CheckPermission(src, 'house', p, 'manage')
        end)
        if not okPerm or not allowed then return false end
        local cid = player.getIdentifier(targetSrc)
        if not cid then return false end
        local ok, res = pcall(function() return exports.LNS_Housing:GiveKey(p, cid) end)
        if ok and res ~= false then
            TriggerClientEvent('sd-phone:client:homes:refresh', src)
            TriggerClientEvent('sd-phone:client:homes:refresh', targetSrc)
            return true
        end
    end
    return false
end

---Revoke a key holder by their identifier (citizenid), as returned by housing.keyHolders.
---Ownership-gated; the holder id must be a non-empty string or number. True on apparent success.
---@param src number owner source
---@param id any property id (client-echoed)
---@param holderId string holder citizenid
---@return boolean
function housing.removeKey(src, id, holderId)
    if not caps().keyManage or not ownsProperty(src, id) then return false end
    if (type(holderId) ~= 'string' and type(holderId) ~= 'number') or holderId == '' then return false end
    local p = pid(id)
    if ACTIVE == 'bcs_housing' then
        return pcall(function() exports.bcs_housing:RemoveKeyHolder(p, holderId) end)
    elseif ACTIVE == 'rx_housing' then
        return pcall(function() exports['RxHousing']:RemoveKeyholder(p, holderId) end)
    elseif ACTIVE == 'ps-housing' or ACTIVE == 'origen_housing' or ACTIVE == 'vms_housing' then
        return clientExec(src, 'remove', p, holderId) and true or false
    elseif ACTIVE == 'LNS_Housing' then
        local okPerm, allowed = pcall(function()
            return exports.LNS_Housing:CheckPermission(src, 'house', p, 'manage')
        end)
        if not okPerm or not allowed then return false end
        local ok, res = pcall(function() return exports.LNS_Housing:RemoveKey(p, tostring(holderId)) end)
        if ok and res ~= false then
            local targetSrc = player.getSourceByIdentifier(tostring(holderId))
            if targetSrc then
                TriggerClientEvent('sd-phone:client:homes:refresh', targetSrc)
            end
            TriggerClientEvent('sd-phone:client:homes:refresh', src)
            return true
        end
    end
    return false
end

return housing
