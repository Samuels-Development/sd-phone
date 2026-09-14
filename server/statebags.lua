---@type table Player bridge (bridge.server.player): identity resolution for airplane state.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): airplane mode, Do Not Disturb
---and saved-ringtone reads.
local settings = require 'server.settings.store'
---@type table sd-phone config root (configs.config): Phone.AudibleRing governs the ring broadcast.
local config = require 'configs.config'
---@type table Audible-ring helpers (shared.callring): whose phone rings out loud, and which tone a
---bystander is able to play.
local callring = require 'shared.callring'

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

---@type table<number, table<number, boolean>> Every party the started event put call keys on, by
---channel. A group ring's answered payload names only the target who picked up, and its final
---decline ends it with nobody left in targets, so the parties those later payloads no longer list
---have to be released from what was recorded here rather than from the payload itself.
local rung = {}

---Collects every party's source in a lifecycle payload, caller included and deduplicated.
---@param call table eventCall/eventRing payload from server.calls.actions
---@return number[] sources in payload order
---@return table<number, boolean> seen the same sources keyed for lookup
local function partySources(call)
    local out, seen = {}, {}

    local function add(party)
        local src = party and tonumber(party.source or party.src)
        if not src or seen[src] then return end
        seen[src] = true
        out[#out + 1] = src
    end

    ---Adds every party in one of the payload's party lists, which may be absent. Added one list
    ---at a time: a group ring carries targets but no merged parties, and gathering them with
    ---ipairs over a table holding a nil would stop at the hole and drop the targets entirely.
    ---@param list table|nil
    local function addAll(list)
        if type(list) ~= 'table' then return end
        for _, party in ipairs(list) do add(party) end
    end

    add(call.caller)
    add(call.callee)
    addAll(call.merged)
    addAll(call.targets)
    return out, seen
end

---Publishes the call state of every party to a lifecycle payload, remembering who was rung on
---the channel so a later payload that drops them can still release them.
---@param call table eventCall/eventRing payload from server.calls.actions
---@param status string|nil 'ringing' | 'active'; nil clears the three call keys
local function applyCall(call, status)
    if type(call) ~= 'table' then return end

    local sources, seen = partySources(call)
    for _, src in ipairs(sources) do
        putCall(src, status and { channel = call.channel, status = status } or nil)
    end

    if status ~= 'ringing' or call.channel == nil then return end
    local set = rung[call.channel] or {}
    for src in pairs(seen) do set[src] = true end
    rung[call.channel] = set
end

---Releases every party the channel rang that this payload no longer lists: the targets a group
---ring cancelled when someone else picked up, or everyone once the last of them declined. Their
---call keys and audible ring are cleared exactly as if their own leg had ended.
---@param call table answered/ended payload from server.calls.actions
local function releaseUnlisted(call)
    if type(call) ~= 'table' or call.channel == nil then return end
    local set = rung[call.channel]
    rung[call.channel] = nil
    if not set then return end

    local _, seen = partySources(call)
    for src in pairs(set) do
        if not seen[src] then
            putCall(src, nil)
            put(src, 'phoneRinging', nil)
        end
    end
end

---Publishes the tone each ringing party's phone should be heard playing by players standing near
---them, and clears the key once the call stops ringing. The caller is never included: they hear
---ringback in their ear, and their own handset makes no sound for anyone to overhear.
---@param call table eventCall/eventRing payload from server.calls.actions
---@param ringing boolean whether the call is currently ringing
local function applyAudibleRing(call, ringing)
    if type(call) ~= 'table' then return end
    local cfg = config.Phone.AudibleRing
    if type(cfg) ~= 'table' or cfg.Enabled == false then return end

    -- The settings reads below can yield. Keep this exact ring's recipient set:
    -- answering/ending removes it, and declining removes the individual source.
    -- A late query must never turn the audible ring back on after either event.
    local pending = rung[call.channel]
    local function stillRinging(src)
        return pending and rung[call.channel] == pending and pending[src] == true
    end

    for _, src in ipairs(callring.ringRecipients(call)) do
        local tone
        if ringing then
            if stillRinging(src) then
                local cid = player.getIdentifier(src)
                if cid and not (cfg.RespectDnd ~= false and settings.isDnd(cid)) then
                    if stillRinging(src) then
                        tone = callring.playableTone(settings.getTones(cid).ringtone)
                    end
                end
                if stillRinging(src) then put(src, 'phoneRinging', tone) end
            end
        else
            put(src, 'phoneRinging', nil)
        end
    end
end

---Drops one party from a ring that carries on without them. A group-ring target declining fires
---no lifecycle event, because the ring is still up for everyone else, so the calls module
---releases them here directly.
---@param channel number ring channel
---@param source number declining player server id
function statebags.dropRinger(channel, source)
    local set = rung[channel]
    if set then set[source] = nil end
    putCall(source, nil)
    put(source, 'phoneRinging', nil)
end

AddEventHandler('sd-phone:server:call:started', function(call)
    applyCall(call, 'ringing')
    applyAudibleRing(call, true)
end)
AddEventHandler('sd-phone:server:call:answered', function(call)
    applyCall(call, 'active')
    applyAudibleRing(call, false)
    releaseUnlisted(call)
end)
AddEventHandler('sd-phone:server:call:ended', function(call)
    applyCall(call, nil)
    applyAudibleRing(call, false)
    releaseUnlisted(call)
end)

---Clears every key for a dropping player so a recycled source never inherits the last one's state.
AddEventHandler('playerDropped', function()
    local src = source
    disabled[src] = nil
    for _, set in pairs(rung) do set[src] = nil end
    putCall(src, nil)
    put(src, 'phoneOpen', false)
    put(src, 'softOpen', false)
    put(src, 'phoneDisabled', false)
    put(src, 'phoneRinging', nil)
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
