---@type table Pure Bluetooth maths (shared.bluetooth): validation, range, capacity.
local bt = require 'shared.bluetooth'

---@type table Registry module; the table returned at end of file.
local registry = {}

---@type table<string, table> Registered devices by id, each carrying the resource that owns it.
local devices = {}
---@type table<string, table<number, boolean>> Device id to the set of player ids connected to it.
local links = {}

---Every registered device id.
---@return string[]
function registry.ids()
    local out = {}
    for id in pairs(devices) do out[#out + 1] = id end
    return out
end

---One registered device, or nil.
---@param id string
---@return table|nil
function registry.get(id)
    return devices[id]
end

---A device as another resource may see it: identity only, so neither the owning script's callbacks
---nor a table the registry still holds ever leaves this module.
---@param device table
---@return table view { id, name, kind, owner }
function registry.view(device)
    return { id = device.id, name = device.name, kind = device.kind, owner = device.owner }
end

---Adds a device. Rejects a duplicate id rather than replacing, so two resources cannot silently
---fight over one device.
---@param def table registration passed to registerBluetoothDevice
---@param owner string resource that registered it
---@return boolean ok, string|nil err
function registry.add(def, owner)
    local device, err = bt.validate(def)
    if not device then return false, err end
    if devices[device.id] then return false, ('device %s is already registered'):format(device.id) end

    device.owner = owner
    devices[device.id] = device
    links[device.id] = {}
    return true
end

---Patches a device in place, so renaming or moving one does not have to unregister it and drop
---everyone connected. Only the resource that registered a device may patch it.
---@param id string
---@param patch table fields to change; omitted keys keep their current value
---@param owner string resource asking
---@return boolean ok, string|nil err
function registry.update(id, patch, owner)
    local current = devices[id]
    if not current then return false, ('device %s is not registered'):format(tostring(id)) end
    if current.owner ~= owner then
        return false, ('device %s belongs to %s'):format(id, tostring(current.owner))
    end

    local merged = bt.merge(current, patch)
    if not merged then return false, 'patch must be a table' end

    local device, err = bt.validate(merged)
    if not device then return false, err end

    device.owner = current.owner
    devices[id] = device
    return true
end

---Where a device is right now. An entity-backed device follows the entity; a coords-backed one
---never moves. Returns nil when an entity has despawned, which reads as out of range everywhere.
---@param device table
---@return number|nil x, number|nil y, number|nil z
function registry.positionOf(device)
    if device.entity then
        local ent = NetworkGetEntityFromNetworkId(device.entity)
        if ent and ent ~= 0 and DoesEntityExist(ent) then
            local c = GetEntityCoords(ent)
            return c.x, c.y, c.z
        end
        if not device.coords then return nil end
    end
    local pos = device.coords
    if not pos then return nil end
    return tonumber(pos.x), tonumber(pos.y), tonumber(pos.z)
end

---Whether a player standing at a point can reach a device.
---@param device table
---@param x number
---@param y number
---@param z number
---@return boolean
function registry.reachable(device, x, y, z)
    local dx, dy, dz = registry.positionOf(device)
    if not dx then return false end
    return bt.inRange(x, y, z, { coords = { x = dx, y = dy, z = dz }, range = device.range })
end

---Players connected to a device.
---@param id string
---@return number[] sources
function registry.connections(id)
    local out = {}
    for src in pairs(links[id] or {}) do out[#out + 1] = src end
    return out
end

---How many players are connected to a device.
---@param id string
---@return integer
function registry.count(id)
    local n = 0
    for _ in pairs(links[id] or {}) do n = n + 1 end
    return n
end

---Whether a player is connected to a device.
---@param src number
---@param id string
---@return boolean
function registry.isConnected(src, id)
    return (links[id] or {})[src] == true
end

---Every device a player is connected to.
---@param src number
---@return string[] ids
function registry.connectedTo(src)
    local out = {}
    for id, set in pairs(links) do
        if set[src] then out[#out + 1] = id end
    end
    return out
end

---Runs an owning script's callback without letting it take the caller down with it. A third-party
---handler that errors must never stall the reconnect tick or abort a pairing.
---@param fn function|nil
---@param ... any
local function safely(fn, ...)
    if type(fn) ~= 'function' then return end
    local ok, err = pcall(fn, ...)
    if not ok then
        print(('^1[sd-phone:bluetooth]^0 device callback errored: %s'):format(tostring(err)))
    end
end

---Server-local lifecycle events, fired once per change. Every path that touches `links` goes through
---connect and disconnect below, so none of them can open or close a connection silently.
---@param src number player server id
---@param device table the device connected to
local function announceConnect(src, device)
    TriggerEvent('sd-phone:server:bluetooth:connected', src, device.id, registry.view(device))
end

---@param src number player server id
---@param id string device the player was on, read before the link was cleared
---@param reason string why it ended
local function announceDisconnect(src, id, reason)
    TriggerEvent('sd-phone:server:bluetooth:disconnected', src, id, reason)
end

---Links a player to a device, if it exists and has room. Range is the caller's to check, because
---pairing and the reconnect tick already hold the player's coords.
---@param src number
---@param id string
---@return boolean ok, string|nil err
function registry.connect(src, id)
    local device = devices[id]
    if not device then return false, 'unknown device' end
    if registry.isConnected(src, id) then return true end
    if not bt.hasRoom(device, registry.count(id)) then return false, 'device is full' end

    links[id][src] = true
    safely(device.onConnect, src, id)
    announceConnect(src, device)
    return true
end

---Unlinks a player from a device and tells the owning script why.
---@param src number
---@param id string
---@param reason string one of manual, range, dropped, disabled, unregistered, kicked
---@return boolean disconnected
function registry.disconnect(src, id, reason)
    if not registry.isConnected(src, id) then return false end
    links[id][src] = nil

    local why = reason or 'manual'
    local device = devices[id]
    if device then safely(device.onDisconnect, src, id, why) end
    announceDisconnect(src, id, why)
    return true
end

---Drops every connection a player holds, on relog, airplane mode or a switched-off radio.
---@param src number
---@param reason string
function registry.disconnectAll(src, reason)
    for _, id in ipairs(registry.connectedTo(src)) do
        registry.disconnect(src, id, reason)
    end
end

---Removes a device, dropping everyone on it first so the owning script always sees the close.
---@param id string
---@return boolean removed
function registry.remove(id)
    if not devices[id] then return false end
    for _, src in ipairs(registry.connections(id)) do
        registry.disconnect(src, id, 'unregistered')
    end
    devices[id] = nil
    links[id] = nil
    return true
end

---Removes every device a resource registered, so a stopped script leaves nothing dangling.
---@param owner string resource name
---@return integer removed
function registry.removeByOwner(owner)
    local doomed = {}
    for id, device in pairs(devices) do
        if device.owner == owner then doomed[#doomed + 1] = id end
    end
    for _, id in ipairs(doomed) do registry.remove(id) end
    return #doomed
end

return registry
