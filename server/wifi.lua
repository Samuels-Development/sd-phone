---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Pure Wi-Fi maths (shared.wifi): strength, scan, password check.
local wifi = require 'shared.wifi'
---@type table Shared server helpers (server.util): response envelopes + rate limiting.
local util = require 'server.util'
---@type table Player bridge (bridge.server.player): citizenid lookup for the rate-limit key.
local player = require 'bridge.server.player'

---@type table Wi-Fi settings (configs/wifi.lua).
local cfg = config.Wifi or {}
---@type table[] Configured networks, empty while the system is switched off. Folding Enabled in
---here means every reading downstream treats a disabled system as a world with no routers.
local NETWORKS = (cfg.Enabled == true and type(cfg.Networks) == 'table') and cfg.Networks or {}
---@type table Capability flags a connection carries (configs/wifi.lua Provides).
local PROVIDES_CFG = type(cfg.Provides) == 'table' and cfg.Provides or {}
---@type table<string, boolean> Lowercased capability -> whether Wi-Fi carries it.
local PROVIDES = {
    text = PROVIDES_CFG.Text == true,
    call = PROVIDES_CFG.Call == true,
    data = PROVIDES_CFG.Data == true,
}
---@type number Strength at or below which a network is out of reach and a connection is dropped.
local DROP_BELOW = tonumber(cfg.DropBelow) or 0.0
---@type integer Rolling window for connect attempts, in ms.
local CONNECT_WINDOW = 30000
---@type integer Connect attempts honoured per window. Refused ones spend budget too, so the
---password check cannot be walked through a wordlist.
local CONNECT_PER_WINDOW = 10

---@type table<integer, string> Network id per connected player, in memory only. Written here and
---nowhere else: a client can ask to connect, it can never assert that it already is.
local connections = {}

---@type table Wi-Fi module; the table returned at end of file.
local wifiServer = {}

---The server's own view of where a player is, or nil when they cannot be resolved.
---@param source number|nil player server id
---@return vector3|nil pos
local function coordsOf(source)
    if not source then return nil end
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

---The network a player is on, re-verified against where the server says they are. Walking out of
---range clears the connection here rather than waiting for a client to admit it.
---@param source number|nil player server id
---@return string|nil id network id, nil when not connected
function wifiServer.connectionOf(source)
    local id = source and connections[source]
    if not id then return nil end

    local net = wifi.find(id, NETWORKS)
    if not net then
        connections[source] = nil
        return nil
    end

    -- An unresolvable player (offline, mid-spawn) is no proof they left, so the connection stands;
    -- it just carries nothing until their position can be read again.
    local pos = coordsOf(source)
    if not pos then return nil end

    if wifi.strength(pos.x, pos.y, pos.z, net) <= DROP_BELOW then
        connections[source] = nil
        return nil
    end
    return id
end

---@param source number|nil player server id
---@return boolean
function wifiServer.isConnected(source)
    return wifiServer.connectionOf(source) ~= nil
end

---Whether a player's Wi-Fi connection carries a capability. False when the network does not offer
---it at all, so the config flag is answered before a position is ever read.
---@param source number|nil player server id
---@param capability string 'text' | 'call' | 'data'
---@return boolean
function wifiServer.provides(source, capability)
    if #NETWORKS == 0 then return false end
    if not PROVIDES[type(capability) == 'string' and capability:lower() or ''] then return false end
    return wifiServer.connectionOf(source) ~= nil
end

---Networks in reach of a player, strongest first, scanned from the server's own coords. Passwords
---never appear in the result; a secured network is reported as nothing more than secured.
---@param source number|nil player server id
---@return table[] found { id, ssid, secured, strength }
function wifiServer.networksFor(source)
    if #NETWORKS == 0 then return {} end
    local pos = coordsOf(source)
    if not pos then return {} end
    return wifi.scan(pos.x, pos.y, pos.z, NETWORKS, DROP_BELOW)
end

---A client asking to join a network. The password lives only on this side and is compared only
---here, against a player the server has itself placed inside the network's radius.
---@param source number player server id
---@param payload table { id: string, password: string|nil }
---@return { success: boolean, message: string|nil }
lib.callback.register('sd-phone:server:wifi:connect', function(source, payload)
    if #NETWORKS == 0 then return util.fail('Wi-Fi is unavailable') end

    -- Spent before the network is even resolved, so every attempt costs the same whether it is
    -- refused for a bad id, for distance, or for the password.
    if not util.rateLimit(player.getIdentifier(source), 'wifi:connect', CONNECT_WINDOW, CONNECT_PER_WINDOW) then
        return util.fail('Too many attempts, wait a moment')
    end

    local body = type(payload) == 'table' and payload or {}
    local net = wifi.find(type(body.id) == 'string' and body.id or nil, NETWORKS)
    if not net then return util.fail('Network not found') end

    local pos = coordsOf(source)
    if not pos or wifi.strength(pos.x, pos.y, pos.z, net) <= DROP_BELOW then
        return util.fail('Network out of range')
    end

    if not wifi.accepts(net, type(body.password) == 'string' and body.password or nil) then
        return util.fail('Incorrect password')
    end

    connections[source] = net.id
    return util.ok()
end)

---A client leaving the network it is on. Nothing to validate: dropping your own connection is
---always allowed, and asking twice is harmless.
RegisterNetEvent('sd-phone:server:wifi:disconnect', function()
    local source = source
    connections[source] = nil
end)

---A departing player takes their connection with them, so a recycled server id never inherits it.
AddEventHandler('playerDropped', function()
    connections[source] = nil
end)

---Whether a player is on Wi-Fi right now, re-verified against their position.
---@param source number player server id
exports('isOnWifi', function(source) return wifiServer.isConnected(source) end)

---The network id a player is connected to, or nil when they are on none.
---@param source number player server id
exports('getWifi', function(source) return wifiServer.connectionOf(source) end)

---Whether a player is connected to THAT network specifically, range included. This is the gate an
---app calls to keep itself to one building's router.
---@param source number player server id
---@param id string network id from configs/wifi.lua
exports('hasWifiAccess', function(source, id)
    if type(id) ~= 'string' or id == '' then return false end
    return wifiServer.connectionOf(source) == id
end)

return wifiServer
