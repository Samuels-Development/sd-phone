---@type table Bluetooth persistence (server.bluetooth.store): schema, radio switch, paired list.
local store = require 'server.bluetooth.store'
---@type table Device registry (server.bluetooth.registry): registrations + live connections.
local registry = require 'server.bluetooth.registry'
---@type table Bluetooth callbacks (server.bluetooth.actions): scan, pair, forget, disconnect.
local actions = require 'server.bluetooth.actions'

---@type integer Milliseconds between reconnect sweeps. Slow on purpose: this is the only cost the
---feature carries when nobody is looking at the Bluetooth page.
local TICK_MS = 4000

---@type table<number, table> Per-player state the tick and the exports need, loaded once per session
---and dropped again by anything that changes it.
local watch = {}

CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:bluetooth]^0 schema failed, the feature is off: %s'):format(tostring(err)))
    end
end)

---A player's cached state, read from the database the first time and kept until they leave or change
---something. Returns nil when they have no loaded character to read for.
---@param src number player server id
---@return { enabled: boolean, paired: table<string, string> }|nil state
local function stateOf(src)
    local cached = watch[src]
    if cached then return cached end

    local player = require 'bridge.server.player'
    local cid = player.getIdentifier(src)
    if not cid then return nil end

    local state = store.get(cid)
    watch[src] = state
    return state
end

---Drops a player's cache so the next sweep reloads it, after anything that changes their pairings.
---@param src number player server id
local function invalidate(src)
    watch[src] = nil
end

---The picture the client-side cache mirrors: the radio switch plus the devices connected right now.
---Threaded because the lifecycle events driving it are synchronous and a cold cache reads the
---database, which would otherwise hold up the reconnect sweep.
---@param src number player server id
local function pushState(src)
    CreateThread(function()
        if not src or not GetPlayerName(src) then return end

        local state = stateOf(src)
        local connected = {}
        for _, id in ipairs(registry.connectedTo(src)) do
            local device = registry.get(id)
            connected[#connected + 1] = device
                and { id = id, name = device.name, kind = device.kind }
                or { id = id, name = id, kind = 'device' }
        end

        TriggerClientEvent('sd-phone:client:bluetooth', src, {
            enabled = state == nil or state.enabled == true,
            devices = connected,
        })
    end)
end

-- Mirroring off the lifecycle events rather than the call sites means every path that opens or
-- closes a connection keeps the client cache honest, including the reconnect sweep.
AddEventHandler('sd-phone:server:bluetooth:connected', function(src) pushState(src) end)
AddEventHandler('sd-phone:server:bluetooth:disconnected', function(src) pushState(src) end)

---Seeds the cache on the client's first ask, which is the earliest point a citizenid is sure to
---exist. Only ever answers the caller with their own state.
RegisterNetEvent('sd-phone:server:bluetooth:sync', function()
    pushState(source)
end)

lib.callback.register('sd-phone:server:bluetooth:scan', function(source)
    invalidate(source)
    return actions.scan(source)
end)

lib.callback.register('sd-phone:server:bluetooth:pair', function(source, payload)
    local res = actions.pair(source, payload)
    invalidate(source)
    return res
end)

lib.callback.register('sd-phone:server:bluetooth:forget', function(source, payload)
    local res = actions.forget(source, payload)
    invalidate(source)
    return res
end)

lib.callback.register('sd-phone:server:bluetooth:disconnect', function(source, payload)
    return actions.disconnect(source, payload)
end)

lib.callback.register('sd-phone:server:bluetooth:setEnabled', function(source, payload)
    local res = actions.setEnabled(source, payload)
    invalidate(source)
    pushState(source)
    return res
end)

---Connects paired devices that have come into reach and drops the ones that have left it. Only
---players with something paired are considered, so an empty server does no work at all.
CreateThread(function()
    while true do
        Wait(TICK_MS)

        for _, sid in ipairs(GetPlayers()) do
            local src = tonumber(sid)
            local state = src and stateOf(src) or nil

            if src and state and state.enabled then
                local ped = GetPlayerPed(src)
                local pos = (ped and ped ~= 0) and GetEntityCoords(ped) or nil

                if pos then
                    for id in pairs(state.paired) do
                        local device = registry.get(id)
                        local near = device and registry.reachable(device, pos.x, pos.y, pos.z)
                        local live = registry.isConnected(src, id)

                        if near and not live then
                            registry.connect(src, id)
                        elseif live and not near then
                            registry.disconnect(src, id, 'range')
                        end
                    end
                end
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    registry.disconnectAll(src, 'dropped')
    watch[src] = nil
end)

---Another resource stopping takes its devices with it, so nothing points at a script that is gone.
AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then return end
    registry.removeByOwner(name)
end)

---Registers a device phones can pair with. Attribution is the calling resource, and its devices go
---with it when it stops.
---@param def table { id, name, kind?, coords?, entity?, range?, maxConnections?, onConnect?, onDisconnect? }
---@return boolean ok, string? err
exports('registerBluetoothDevice', function(def)
    return registry.add(def, GetInvokingResource() or GetCurrentResourceName())
end)

---Patches a registered device in place, so a rename or a move keeps everyone connected. Only the
---resource that registered a device may patch it; omitted keys keep their current value.
---@param id string
---@param patch table fields to change
---@return boolean ok, string? err
exports('updateBluetoothDevice', function(id, patch)
    local ok, err = registry.update(id, patch, GetInvokingResource() or GetCurrentResourceName())
    if ok then
        for _, src in ipairs(registry.connections(id)) do pushState(src) end
    end
    return ok, err
end)

---Removes a device, disconnecting everyone on it first with reason `unregistered`.
---@param id string
---@return boolean removed
exports('unregisterBluetoothDevice', function(id)
    return registry.remove(id)
end)

---Every registered device, as identity only.
---@return table[] devices { id, name, kind, owner }
exports('getBluetoothDevices', function()
    local out = {}
    for _, id in ipairs(registry.ids()) do
        local device = registry.get(id)
        if device then out[#out + 1] = registry.view(device) end
    end
    return out
end)

---One registered device, as identity only.
---@param id string
---@return table? device { id, name, kind, owner }
exports('getBluetoothDevice', function(id)
    local device = type(id) == 'string' and registry.get(id) or nil
    return device and registry.view(device) or nil
end)

---@param source number player server id
---@param deviceId string
---@return boolean connected
exports('isBluetoothConnected', function(source, deviceId)
    return registry.isConnected(source, deviceId)
end)

---@param deviceId string
---@return number[] sources players connected to the device
exports('getBluetoothConnections', function(deviceId)
    return registry.connections(deviceId)
end)

---@param source number player server id
---@return string[] ids devices the player is connected to
exports('getConnectedDevices', function(source)
    return registry.connectedTo(source)
end)

---Whether a player's Bluetooth radio is switched on. False for a source with no loaded character,
---which is what tells "the radio is off" apart from "the device is out of range".
---@param source number player server id
---@return boolean enabled
exports('isBluetoothEnabled', function(source)
    local state = stateOf(source)
    return state ~= nil and state.enabled == true
end)

---Connects a player to a device from script. Honours the radio switch and the device's connection
---limit but not its range, which is the point of connecting by hand; it does not pair.
---@param source number player server id
---@param deviceId string
---@return boolean ok, string? err
exports('connectBluetooth', function(source, deviceId)
    local state = stateOf(source)
    if not state then return false, 'no character' end
    if not state.enabled then return false, 'bluetooth is off' end
    return registry.connect(source, deviceId)
end)

---Disconnects a player from a device with reason `kicked`. The pairing survives, so the reconnect
---sweep picks it up again while they stay in range.
---@param source number player server id
---@param deviceId string
---@return boolean disconnected
exports('disconnectBluetooth', function(source, deviceId)
    return registry.disconnect(source, deviceId, 'kicked')
end)
