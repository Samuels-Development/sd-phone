---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player = require 'bridge.server.player'

---@type table Core module; the table returned at end of file.
local core = {}

---@type table<number, boolean> Set of srcs whose phone is currently open (out in hand). Tracked
---in memory from the client's open/close hooks; positions are never cached - they're read live
---at query time.
local openPhones = {}

---Tracks a player's phone-open state, self-reported by the owning client.
---@param src number player server id
---@param open boolean whether the phone is now open
function core.setOpen(src, open)
    if open then openPhones[src] = true else openPhones[src] = nil end
end

-- AirShare request handshake: delivery runs only after the recipient accepts; requests expire after 60s.
---@type table<string, table> Pending requests: [id] = { kind, fromSrc, target, payload, expires }.
local requests  = {}
---@type table<string, fun(targetSrc: number, payload: table): boolean> Delivery handler per kind.
local handlers  = {}
---@type integer Next request id ordinal.
local nextReqId = 1

---Registers the delivery handler for a share kind (e.g. 'contact', 'voice').
---@param kind string share kind
---@param fn fun(targetSrc: number, payload: table): boolean delivery function, true on success
function core.registerHandler(kind, fn) handlers[kind] = fn end

---Human noun for a share kind, used in the sender-facing accept/decline notifications. Falls
---back to 'contact' for the contact kind and anything unrecognised.
---@param kind string share kind
---@return string label
local function kindLabel(kind)
    if kind == 'voice' then return 'voice memo' end
    if kind == 'note'  then return 'note' end
    if kind == 'pin'   then return 'map pin' end
    if kind == 'music-track'    then return 'song' end
    if kind == 'music-playlist' then return 'playlist' end
    return 'contact'
end

---Drops every expired pending request.
local function pruneExpired()
    local now = os.time()
    for id, req in pairs(requests) do
        if now > req.expires then requests[id] = nil end
    end
end

---Opens an AirShare request to a nearby, phone-open player. The kind must have a registered
---handler and the target must pass canShareTo; the payload is held server-side until answered.
---@param src number sender server id
---@param target any client-supplied recipient server id
---@param kind string share kind
---@param payload table kind-specific share data, handed to the handler on accept
---@return boolean ok, string? message failure reason
function core.request(src, target, kind, payload)
    pruneExpired()
    target = tonumber(target)
    if not target then return false, 'Invalid recipient' end
    if not handlers[kind] then return false, 'Unknown share type' end
    if not core.canShareTo(src, target) then return false, 'Recipient is no longer nearby' end

    local id = ('as%d'):format(nextReqId)
    nextReqId = nextReqId + 1
    requests[id] = { kind = kind, fromSrc = src, target = target, payload = payload, expires = os.time() + 60 }

    TriggerClientEvent('sd-phone:client:airshare:request', target, {
        id = id, kind = kind, fromName = player.getName(src),
    })
    return true
end

---Recipient's accept/decline; only the request's addressed target may answer. The request is
---consumed either way, on accept the per-kind handler delivers, and the sender is notified.
---@param src number responder server id
---@param id any client-supplied request id
---@param accept boolean whether the share was accepted
---@return table result { success, message? }
function core.respond(src, id, accept)
    local req = requests[id]
    if not req or req.target ~= src then return { success = false } end
    requests[id] = nil
    if os.time() > req.expires then return { success = false, message = 'Request expired' } end

    if not accept then
        TriggerClientEvent('sd-phone:client:notify', req.fromSrc, {
            app = 'phone', title = 'AirShare',
            body = ('%s declined your %s.'):format(player.getName(src), kindLabel(req.kind)),
        })
        return { success = true }
    end

    local handler = handlers[req.kind]
    local ok = (handler and handler(src, req.payload)) == true
    if ok then
        TriggerClientEvent('sd-phone:client:notify', req.fromSrc, {
            app = 'phone', title = 'AirShare',
            body = ('%s accepted your %s.'):format(player.getName(src), kindLabel(req.kind)),
        })
    end
    return { success = ok }
end

---Forgets a departing player: their open flag and every pending request they sent or were
---addressed to.
---@param src number player server id
function core.clear(src)
    openPhones[src] = nil
    for id, req in pairs(requests) do
        if req.fromSrc == src or req.target == src then requests[id] = nil end
    end
end

---Live ped coords for a player, nil when they have no ped (disconnecting / not spawned).
---@param src number player server id
---@return vector3|nil coords
local function coordsOf(src)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

---Players (other than `src`) with their phone open, within config.Share.Range, nearest first,
---capped at config.Share.MaxTargets. Read-only.
---@param src number player server id
---@return { id: number, name: string }[] targets
function core.nearby(src)
    local origin = coordsOf(src)
    if not origin then return {} end

    local range = config.Share.Range
    local found = {}
    for tgt in pairs(openPhones) do
        if tgt ~= src then
            local c = coordsOf(tgt)
            if c then
                local dist = #(origin - c)
                if dist <= range then
                    found[#found + 1] = { id = tgt, name = player.getName(tgt), dist = dist }
                end
            end
        end
    end

    table.sort(found, function(a, b) return a.dist < b.dist end)

    local out = {}
    for i = 1, math.min(#found, config.Share.MaxTargets) do
        out[#out + 1] = { id = found[i].id, name = found[i].name }
    end
    return out
end

---Guard for opening a share request: true only if `target` is a phone-open player within
---config.Share.Range of `src`, measured from live server-side coords.
---@param src number sender server id
---@param target number recipient server id
---@return boolean allowed
function core.canShareTo(src, target)
    if not openPhones[target] then return false end
    local o, c = coordsOf(src), coordsOf(target)
    if not o or not c then return false end
    return #(o - c) <= config.Share.Range
end

return core
