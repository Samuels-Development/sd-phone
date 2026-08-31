---@type table Shared server helpers (server.util): response envelopes.
local util = require 'server.util'
---@type table Player bridge (bridge.server.player): citizenid lookups.
local player = require 'bridge.server.player'
---@type table Bluetooth persistence (server.bluetooth.store): radio switch + paired list.
local store = require 'server.bluetooth.store'
---@type table Device registry (server.bluetooth.registry): registrations + live connections.
local registry = require 'server.bluetooth.registry'
---@type table Pure Bluetooth maths (shared.bluetooth): capacity checks.
local bt = require 'shared.bluetooth'

---@type table Actions module; the table returned at end of file.
local actions = {}

---The server's own view of where a player is, or nil when they cannot be resolved. Read here rather
---than trusted from the client, because a connection gates whatever the owning script decides.
---@param source number|nil player server id
---@return vector3|nil pos
local function coordsOf(source)
    if not source then return nil end
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

---Everything a phone needs to draw the Bluetooth page: the radio switch, every device in reach, and
---every paired device whether or not it is in reach right now.
---@param source number player server id
---@return table envelope { success, data: { enabled, devices } }
function actions.scan(source)
    local cid = player.getIdentifier(source)
    if not cid then return util.fail('bluetooth.noCharacter', 'No character') end

    local state = store.get(cid)
    local pos = coordsOf(source)
    local seen, out = {}, {}

    if pos and state.enabled then
        for _, id in ipairs(registry.ids()) do
            local device = registry.get(id)
            if device and registry.reachable(device, pos.x, pos.y, pos.z) then
                seen[id] = true
                out[#out + 1] = {
                    id        = id,
                    name      = device.name,
                    kind      = device.kind,
                    paired    = state.paired[id] ~= nil,
                    connected = registry.isConnected(source, id),
                    full      = not registry.isConnected(source, id)
                                and not bt.hasRoom(device, registry.count(id)),
                    inRange   = true,
                }
            end
        end
    end

    for id, name in pairs(state.paired) do
        if not seen[id] then
            out[#out + 1] = {
                id = id, name = name, kind = 'device',
                paired = true, connected = false, full = false, inRange = false,
            }
        end
    end

    return util.ok({ enabled = state.enabled, devices = out })
end

---Pairs a device and connects to it in one step, which is what tapping it in the list means.
---@param source number player server id
---@param payload table { id: string }
---@return table envelope
function actions.pair(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return util.fail('bluetooth.noCharacter', 'No character') end

    local id = type(payload) == 'table' and payload.id or nil
    local device = type(id) == 'string' and registry.get(id) or nil
    if not device then return util.fail('bluetooth.deviceNoLongerNearby', 'That device is no longer nearby') end

    local state = store.get(cid)
    if not state.enabled then return util.fail('bluetooth.bluetoothOff', 'Bluetooth is off') end

    local pos = coordsOf(source)
    if not pos or not registry.reachable(device, pos.x, pos.y, pos.z) then
        return util.fail('bluetooth.deviceOutRange', 'That device is out of range')
    end

    local ok, err = registry.connect(source, id)
    if not ok then
        if err == 'device is full' then return util.fail('bluetooth.deviceAlreadyUse', 'That device is already in use') end
        return util.fail('bluetooth.couldNotConnect', 'Could not connect')
    end

    store.remember(cid, id, device.name)
    return util.ok({ id = id })
end

---Forgets a device: disconnects it and drops it from the paired list, so auto-reconnect stops.
---@param source number player server id
---@param payload table { id: string }
---@return table envelope
function actions.forget(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return util.fail('bluetooth.noCharacter', 'No character') end

    local id = type(payload) == 'table' and payload.id or nil
    if type(id) ~= 'string' then return util.fail('bluetooth.unknownDevice', 'Unknown device') end

    registry.disconnect(source, id, 'manual')
    store.forget(cid, id)
    return util.ok({ id = id })
end

---Disconnects without forgetting, so the device stays in the list for a later reconnect.
---@param source number player server id
---@param payload table { id: string }
---@return table envelope
function actions.disconnect(source, payload)
    local id = type(payload) == 'table' and payload.id or nil
    if type(id) ~= 'string' then return util.fail('bluetooth.unknownDevice', 'Unknown device') end
    registry.disconnect(source, id, 'manual')
    return util.ok({ id = id })
end

---The radio switch. Turning it off drops every live connection, because a switched-off radio that
---kept its connections would let a script keep trusting one that is no longer real.
---@param source number player server id
---@param payload table { on: boolean }
---@return table envelope
function actions.setEnabled(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return util.fail('bluetooth.noCharacter', 'No character') end

    local on = type(payload) == 'table' and payload.on == true
    store.setEnabled(cid, on)
    if not on then registry.disconnectAll(source, 'disabled') end
    return util.ok({ enabled = on })
end

return actions
