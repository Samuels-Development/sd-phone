---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Pure Wi-Fi maths (shared.wifi): strength, scan, password check.
local wifi = require 'shared.wifi'
---@type table Shared server helpers (server.util): response envelopes + rate limiting.
local util = require 'server.util'
---@type table Player bridge (bridge.server.player): citizenid lookup for the rate-limit key.
local player = require 'bridge.server.player'
---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'
---@type table Wi-Fi persistence layer (server.wifi.store): the radio switch and the networks a
---character has already joined, keyed by citizenid.
local store = require 'server.wifi.store'

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

-- Schema bootstrap.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        boot.schemaFailed('wifi', err)
        return
    end
    boot.schemaReady()
end)

---The server's own view of where a player is, or nil when they cannot be resolved.
---@param source number|nil player server id
---@return vector3|nil pos
local function coordsOf(source)
    if not source then return nil end
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

---Server-local lifecycle event for a connection that has just ended, fired once per ending. Every
---path that clears `connections` calls this, so none of them can end a connection silently.
---@param src number player server id
---@param id string network id the player was on, read before the connection was cleared
local function announceDisconnect(src, id)
    TriggerEvent('sd-phone:server:wifi:disconnected', src, id)
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
        -- The network was edited out of the config under a live connection. A consumer gating on
        -- it has to hear an ending, not just stop being told about the id.
        announceDisconnect(source, id)
        return nil
    end

    -- An unresolvable player (offline, mid-spawn) is no proof they left, so the connection stands;
    -- it just carries nothing until their position can be read again.
    local pos = coordsOf(source)
    if not pos then return nil end

    if wifi.strength(pos.x, pos.y, pos.z, net) <= DROP_BELOW then
        connections[source] = nil
        -- The player walked out of range. This is where that is noticed at all, so it is also the
        -- only place it can be announced from.
        announceDisconnect(source, id)
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

---Every configured network as a fresh table, so a caller mutating the result cannot reach into the
---running config. Empty while the system is switched off; a password never leaves this module.
---@return table[] networks { id, ssid, coords, range, secured }
function wifiServer.networks()
    local out = {}
    for i = 1, #NETWORKS do
        local net = NETWORKS[i]
        -- An id is what the exports and the gating refer to, so an entry without one could never
        -- be joined and is dropped here exactly as the scan drops it.
        if type(net) == 'table' and type(net.id) == 'string' and net.id ~= '' then
            out[#out + 1] = {
                id      = net.id,
                ssid    = tostring(net.ssid or net.id),
                coords  = net.coords,
                range   = tonumber(net.range) or 0.0,
                -- The only thing about a password a caller ever learns: whether there is one.
                secured = wifi.secured(net),
            }
        end
    end
    return out
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

    local cid = player.getIdentifier(source)

    -- Spent before the network is even resolved, so every attempt costs the same whether it is
    -- refused for a bad id, for distance, or for the password.
    if not util.rateLimit(cid, 'wifi:connect', CONNECT_WINDOW, CONNECT_PER_WINDOW) then
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
    -- Remembered from the config's own password, never the string the client sent: the only thing
    -- a client can do here is fail the check above, so nothing it types can reach `known`. A DB
    -- hiccup must not turn a good join into a refusal, so the write is pcall'd.
    if cid then
        pcall(store.remember, cid, net.id, wifi.secured(net) and net.password or nil)
        -- Joining by hand undoes an earlier Disconnect: the player is asking for it back.
        pcall(store.setDeclined, cid, net.id, false)
    end

    -- Server-local lifecycle event, fired once the join is recorded: a consumer gating a door or a
    -- terminal on this network opens it from here.
    TriggerEvent('sd-phone:server:wifi:connected', source, net.id)
    return util.ok()
end)

---This character's persisted Wi-Fi state, for the client to hydrate the radio switch and its
---remembered networks from. Read-only.
---@param source number player server id
---@return table envelope { success, data: { enabled: boolean, known: table } }
lib.callback.register('sd-phone:server:wifi:state', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return util.fail('No character') end
    return util.ok(store.get(cid))
end)

---The radio switch, persisted per character so it survives a restart, a relog and a swap. Nothing
---to validate: owning the phone is what entitles a player to turn its own radio off.
---@param source number player server id
---@param payload table { on: boolean }
---@return table envelope { success, data: { enabled: boolean } }
lib.callback.register('sd-phone:server:wifi:setEnabled', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return util.fail('No character') end

    local on = type(payload) == 'table' and payload.on == true
    store.setEnabled(cid, on)
    return util.ok({ enabled = on })
end)

---A client dropping a network from its remembered list, so a forgotten network stays forgotten
---across a restart. Only ever touches the caller's own row.
---@param id string network id
RegisterNetEvent('sd-phone:server:wifi:forget', function(id)
    local source = source
    local cid = player.getIdentifier(source)
    if not cid then return end
    store.forget(cid, id)
end)

---A client leaving the network it is on. Nothing to validate: dropping your own connection is
---always allowed, and asking twice is harmless.
RegisterNetEvent('sd-phone:server:wifi:disconnect', function(payload)
    local source = source
    local was = connections[source]
    connections[source] = nil

    -- Leaving on purpose is remembered, so the network is never rejoined on its own again. Only
    -- joining it by hand clears that, which is the player asking for it back.
    if was and type(payload) == 'table' and payload.explicit == true then
        local cid = player.getIdentifier(source)
        if cid then pcall(store.setDeclined, cid, was, true) end
    end

    -- Asking twice is harmless, so only a request that ended a live connection announces one.
    if was then announceDisconnect(source, was) end
end)

---A departing player takes their connection with them, so a recycled server id never inherits it.
AddEventHandler('playerDropped', function()
    local was = connections[source]
    connections[source] = nil
    if was then announceDisconnect(source, was) end
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

---Every configured network as { id, ssid, coords, range, secured }, mirroring configs/wifi.lua.
---Empty while the system is off. A network's password is never part of this.
exports('getWifiNetworks', function() return wifiServer.networks() end)

return wifiServer
