---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Lifecycle bridge (bridge.client.lifecycle): framework-agnostic character load/unload edges.
local lifecycle = require 'bridge.client.lifecycle'

---@type table Bluetooth module; the table returned at end of file.
local bluetoothClient = {}

---@type boolean Whether this server runs Bluetooth at all. Off hides the Settings row and leaves
---every reading here empty, matching a server where nothing was ever registered.
local CONFIGURED = (config.Bluetooth or {}).Enabled ~= false

---@type boolean The radio switch, mirrored from the server so an export never has to ask for it.
local radioOn = true
---@type table[] Devices connected right now, as { id, name, kind }.
local devices = {}
---@type table<string, boolean> The same devices as a set, for a lookup that does not walk the list.
local index = {}

---Whether this server runs Bluetooth at all. Separate from `enabled`, which answers for the
---player's own radio switch on a server that does run it.
---@return boolean
function bluetoothClient.configured()
    return CONFIGURED
end

---Whether this character's Bluetooth radio is switched on.
---@return boolean
function bluetoothClient.enabled()
    return CONFIGURED and radioOn
end

---Every device this phone is connected to, as fresh tables so a caller mutating the result cannot
---reach into the mirror.
---@return table[] devices { id, name, kind }
function bluetoothClient.devices()
    local out = {}
    for i = 1, #devices do
        out[i] = { id = devices[i].id, name = devices[i].name, kind = devices[i].kind }
    end
    return out
end

---Whether this phone is connected to a device right now.
---@param id string|nil
---@return boolean
function bluetoothClient.isConnected(id)
    return type(id) == 'string' and index[id] == true
end

---Replaces the mirror wholesale. The server sends the whole picture on every change, so there is no
---patch to merge and no way for the two sides to drift apart.
---@param data table { enabled: boolean, devices: table[] }
local function apply(data)
    if type(data) ~= 'table' then return end

    radioOn = data.enabled ~= false
    devices, index = {}, {}

    local list = type(data.devices) == 'table' and data.devices or {}
    for i = 1, #list do
        local device = list[i]
        if type(device) == 'table' and type(device.id) == 'string' then
            devices[#devices + 1] = {
                id   = device.id,
                name = type(device.name) == 'string' and device.name or device.id,
                kind = type(device.kind) == 'string' and device.kind or 'device',
            }
            index[device.id] = true
        end
    end
end

---Asks the server for a fresh picture, for the points where this side cannot know it has gone stale.
local function sync()
    if not CONFIGURED then return end
    TriggerServerEvent('sd-phone:server:bluetooth:sync')
end

RegisterNetEvent('sd-phone:client:bluetooth', apply)

-- The same signals client/main.lua rebuilds its character state on: a live character switch has to
-- drop the outgoing character's connections before the incoming one's land on top of them.
lifecycle.onCharacterLoaded(sync)
RegisterNetEvent('sd-phone:client:rehydrate', sync)

-- A restart puts this script beside a player who is already loaded, so nothing above would fire.
CreateThread(function()
    Wait(2000)
    sync()
end)

---Nearby and paired devices for the Bluetooth settings page. Thin forward into server/bluetooth,
---which reads player distances server-side.
RegisterNUICallback('sd-phone:bluetooth:scan', function(_, cb)
    cb(lib.callback.await('sd-phone:server:bluetooth:scan', false) or { success = false, data = { enabled = false, devices = {} } })
end)

---Pair with a device and connect to it, which is what tapping it in the list means.
RegisterNUICallback('sd-phone:bluetooth:pair', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:bluetooth:pair', false, payload) or { success = false })
end)

---Forget a device: disconnect and stop auto-reconnecting to it.
RegisterNUICallback('sd-phone:bluetooth:forget', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:bluetooth:forget', false, payload) or { success = false })
end)

---Disconnect without forgetting, so it stays in the list for later.
RegisterNUICallback('sd-phone:bluetooth:disconnect', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:bluetooth:disconnect', false, payload) or { success = false })
end)

---The radio switch, persisted per character.
RegisterNUICallback('sd-phone:bluetooth:setEnabled', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:bluetooth:setEnabled', false, payload) or { success = false })
end)

return bluetoothClient
