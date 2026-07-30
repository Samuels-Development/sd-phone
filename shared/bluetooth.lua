---@type table Pure Bluetooth maths; no natives, no state, so both sides and the test harness can
---load it unchanged.
local bluetooth = {}

---@type number Metres a device reaches when it declares no range of its own.
bluetooth.DEFAULT_RANGE = 10.0
---@type integer Connections a device accepts when it declares no limit; 0 means unlimited.
bluetooth.DEFAULT_MAX = 1
---@type integer Longest storable device id, matching the citizenid column's width.
bluetooth.MAX_ID = 64

---Whether a point is inside a device's reach. A true sphere, height included: a speaker on the floor
---above is a different room, not a nearer one.
---@param x number
---@param y number
---@param z number
---@param device table { coords: vector3|table, range: number }
---@return boolean inRange
function bluetooth.inRange(x, y, z, device)
    if type(device) ~= 'table' then return false end
    local pos = device.coords
    if type(pos) ~= 'table' and type(pos) ~= 'vector3' then return false end

    local px, py, pz = tonumber(pos.x), tonumber(pos.y), tonumber(pos.z)
    local range = tonumber(device.range) or bluetooth.DEFAULT_RANGE
    if not px or not py or not pz or range <= 0 then return false end

    local dx, dy, dz = x - px, y - py, z - pz
    return (dx * dx + dy * dy + dz * dz) <= (range * range)
end

---Whether a device has room for another connection. 0 is unlimited; anything unparseable falls back
---to exclusive, so a malformed registration cannot accidentally open a device to everyone.
---@param device table { maxConnections: integer|nil }
---@param current integer connections already held
---@return boolean hasRoom
function bluetooth.hasRoom(device, current)
    if type(device) ~= 'table' then return false end
    local max = tonumber(device.maxConnections)
    if max == nil then max = bluetooth.DEFAULT_MAX end
    max = math.floor(max)
    if max <= 0 then return max == 0 end
    return (tonumber(current) or 0) < max
end

---Trims a device id to something storable; nil when it could never be one.
---@param v any
---@return string|nil id
function bluetooth.cleanId(v)
    if type(v) ~= 'string' or v == '' then return nil end
    return v:sub(1, bluetooth.MAX_ID)
end

---@type string[] Registration fields a patch may carry. `id` is absent on purpose: it keys the
---registry, so a device that changed it would be a different device.
local PATCHABLE = {
    'name', 'kind', 'coords', 'entity', 'range', 'maxConnections', 'onConnect', 'onDisconnect',
}

---Folds a patch over a registration so a device can be renamed, moved or resized in place. Keys the
---patch omits keep their current value, which is why a patch cannot accidentally drop a callback.
---@param device table the registration already held
---@param patch table fields to change
---@return table|nil def a registration for validate, nil when either side is not a table
function bluetooth.merge(device, patch)
    if type(device) ~= 'table' or type(patch) ~= 'table' then return nil end

    local def = { id = device.id }
    for i = 1, #PATCHABLE do
        local key = PATCHABLE[i]
        local value = patch[key]
        if value == nil then value = device[key] end
        def[key] = value
    end
    return def
end

---Validates a registration, returning the fields worth keeping. Rejects rather than repairs, so a
---script learns its device is wrong instead of finding it silently unreachable.
---@param def table registration passed to registerBluetoothDevice
---@return table|nil device, string|nil err
function bluetooth.validate(def)
    if type(def) ~= 'table' then return nil, 'device must be a table' end

    local id = bluetooth.cleanId(def.id)
    if not id then return nil, 'device.id must be a non-empty string' end
    if type(def.name) ~= 'string' or def.name == '' then return nil, 'device.name must be a non-empty string' end

    local range = tonumber(def.range) or bluetooth.DEFAULT_RANGE
    if range <= 0 then return nil, 'device.range must be greater than zero' end

    local hasCoords = type(def.coords) == 'table' or type(def.coords) == 'vector3'
    local rawEntity = tonumber(def.entity)
    local entity = rawEntity and math.floor(rawEntity) or nil
    if not hasCoords and not entity then return nil, 'device needs coords or entity' end

    local max = tonumber(def.maxConnections)
    max = max and math.floor(max) or bluetooth.DEFAULT_MAX
    if max < 0 then return nil, 'device.maxConnections cannot be negative' end

    return {
        id             = id,
        name           = def.name,
        kind           = type(def.kind) == 'string' and def.kind or 'device',
        coords         = hasCoords and def.coords or nil,
        entity         = entity,
        range          = range,
        maxConnections = max,
        onConnect      = type(def.onConnect) == 'function' and def.onConnect or nil,
        onDisconnect   = type(def.onDisconnect) == 'function' and def.onDisconnect or nil,
    }
end

return bluetooth
