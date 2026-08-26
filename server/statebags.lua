---@type table Player bridge (bridge.server.player): identity resolution for airplane state.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): airplane mode reads.
local settings = require 'server.settings.store'

---@type table State bag module; the table returned at end of file. Publishes the phone's live
---per-player state onto FiveM player state bags, where any resource can read it without an export
---call and without sd-phone being started first.
local statebags = {}

---@type table<number, boolean> Server-authoritative phone lockout, by source. Kept here rather
---than on the client because the client copy dies with a resource restart and cannot be asked
---about an arbitrary player from the server.
local disabled = {}

---Writes one replicated key onto a player's state bag, tolerating a source that has just dropped.
---@param source number player server id
---@param key string state bag key
---@param value any
local function put(source, key, value)
    if not source or not GetPlayerName(source) then return end
    pcall(function() Player(source).state:set(key, value, true) end)
end

---Publishes whether the phone is open. Driven from the client, which is the only side that knows.
---@param source number player server id
---@param open boolean
function statebags.setOpen(source, open)
    put(source, 'phoneOpen', open == true)
end

---Publishes whether the phone is open in its small companion form.
---@param source number player server id
---@param soft boolean
function statebags.setSoftOpen(source, soft)
    put(source, 'softOpen', soft == true)
end

---Publishes the cosmetic battery percentage. sd-phone has no battery simulation on this branch, so
---the value mirrors the client's display counter rather than a persisted charge.
---@param source number player server id
---@param level number 0-100
function statebags.setBattery(source, level)
    local n = tonumber(level)
    if not n then return end
    put(source, 'batteryLevel', math.max(0, math.min(100, math.floor(n))))
end

---Publishes airplane mode, read from the player's stored settings.
---@param source number player server id
function statebags.syncAirplane(source)
    local cid = player.getIdentifier(source)
    put(source, 'airplaneMode', cid ~= nil and settings.isAirplane(cid) == true)
end

---Locks a player out of their phone, or releases them, publishing the result. Server-authoritative:
---this is the value `IsDisabled` answers from.
---@param source number player server id
---@param off boolean true disables the phone
function statebags.setDisabled(source, off)
    local value = off == true
    disabled[source] = value or nil
    TriggerClientEvent('sd-phone:client:setDisabled', source, value)
    put(source, 'phoneDisabled', value)
end

---Whether a player is currently locked out of their phone.
---@param source number player server id
---@return boolean
function statebags.isDisabled(source)
    return disabled[source] == true
end

---Publishes a player's call state. A nil `call` clears all three keys, which is how "not in a
---call" is expressed.
---@param source number player server id
---@param call { channel: number, status: string }|nil
local function putCall(source, call)
    put(source, 'inCall', call ~= nil)
    put(source, 'callId', call and call.channel or nil)
    put(source, 'callStatus', call and { callId = call.channel, status = call.status } or nil)
end

---Publishes the call state of every party to a lifecycle payload.
---@param call table eventCall/eventRing payload from server.calls.actions
---@param status string|nil 'ringing' | 'active'; nil clears the three call keys
local function applyCall(call, status)
    if type(call) ~= 'table' then return end

    local parties = { call.caller, call.callee }
    for _, list in ipairs({ call.merged, call.targets }) do
        if type(list) == 'table' then
            for _, party in ipairs(list) do parties[#parties + 1] = party end
        end
    end

    for _, party in ipairs(parties) do
        local src = party and tonumber(party.source or party.src)
        if src then
            putCall(src, status and { channel = call.channel, status = status } or nil)
        end
    end
end

AddEventHandler('sd-phone:server:call:started', function(call) applyCall(call, 'ringing') end)
AddEventHandler('sd-phone:server:call:answered', function(call) applyCall(call, 'active') end)
AddEventHandler('sd-phone:server:call:ended', function(call) applyCall(call, nil) end)

---Clears every key for a dropping player so a recycled source never inherits the last one's state.
AddEventHandler('playerDropped', function()
    local src = source
    disabled[src] = nil
    putCall(src, nil)
    put(src, 'phoneOpen', false)
    put(src, 'softOpen', false)
    put(src, 'phoneDisabled', false)
end)

---Client-reported shell state: open/soft-open/battery are only knowable on the client, so it
---reports them here and the server does the replicated write.
RegisterNetEvent('sd-phone:server:statebags:report', function(payload)
    local src = source
    if type(payload) ~= 'table' then return end
    if payload.open ~= nil then statebags.setOpen(src, payload.open) end
    if payload.soft ~= nil then statebags.setSoftOpen(src, payload.soft) end
    if payload.battery ~= nil then statebags.setBattery(src, payload.battery) end
    statebags.syncAirplane(src)
end)

return statebags
