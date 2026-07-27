---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player = require 'bridge.server.player'
---@type table Settings persistence (server.settings.store): citizenid -> phone-number lookups.
local settings = require 'server.settings.store'
---@type table Shared server helpers (server.util): per-citizenid cooldown + payload size guard.
local util = require 'server.util'

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
---@type integer Minimum gap between accepted requests from one character (ms). A share is a
---deliberate tap on a picked recipient, so seconds apart; this only bites a scripted flood.
local REQUEST_COOLDOWN = 2000
---@type integer Pending requests one player may have open as sender, and as recipient. Answering
---is a single tap and unanswered entries expire after 60s, so five is far past normal use.
local MAX_PENDING = 5
---@type integer Encoded ceiling on a held payload. A note with a full set of sketches is the
---biggest legitimate share and lands around 1 MB; anything past this is not a real share.
local MAX_PAYLOAD_BYTES = 4 * 1024 * 1024

---Registers the delivery handler for a share kind (e.g. 'contact', 'voice'). A handler may return
---a second value: a recipient-facing reason for the refusal, shown to them verbatim. Handlers
---that return a bare boolean still work and fall back to a generic message.
---@param kind string share kind
---@param fn fun(targetSrc: number, payload: table): boolean, string? true on success, else a reason
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
    if kind == 'document' then return 'document' end
    if kind == 'signature-request' then return 'signature request' end
    return 'contact'
end

---Drops every expired pending request, tallying what survives for the pair about to be checked
---in the same walk so the caps never cost a second pass over the table.
---@param fromSrc number sender server id to count open requests for
---@param target number recipient server id to count inbound requests for
---@return integer sent still-pending requests opened by `fromSrc`
---@return integer inbound still-pending requests addressed to `target`
local function pruneExpired(fromSrc, target)
    local now = os.time()
    local sent, inbound = 0, 0
    for id, req in pairs(requests) do
        if now > req.expires then
            requests[id] = nil
        else
            if req.fromSrc == fromSrc then sent = sent + 1 end
            if req.target == target then inbound = inbound + 1 end
        end
    end
    return sent, inbound
end

---Opens an AirShare request to a nearby, phone-open player. The kind must have a registered
---handler and the target must pass canShareTo; the payload is held server-side until answered.
---@param src number sender server id
---@param target any client-supplied recipient server id
---@param kind string share kind
---@param payload table kind-specific share data, handed to the handler on accept
---@return boolean ok, string? message failure reason
function core.request(src, target, kind, payload)
    target = tonumber(target)
    if not target then return false, 'Invalid recipient' end
    -- Sharing to yourself needs no second player, so it is the one path with no proximity cost
    -- at all; the picker never offers it either.
    if target == src then return false, 'Invalid recipient' end
    if not handlers[kind] then return false, 'Unknown share type' end
    if not core.canShareTo(src, target) then return false, 'Recipient is no longer nearby' end

    -- Gated only once the request would otherwise be accepted, so a recipient who walked away
    -- never costs the sender their next attempt.
    if not util.cooldown(player.getIdentifier(src), 'airshare', REQUEST_COOLDOWN) then
        return false, 'Slow down a moment'
    end
    local sent, inbound = pruneExpired(src, target)
    if sent >= MAX_PENDING then return false, 'Too many pending shares' end
    if inbound >= MAX_PENDING then return false, 'Recipient has too many pending shares' end
    if not util.encodedSize(payload, MAX_PAYLOAD_BYTES) then return false, 'That is too large to share' end

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
    local delivered, reason
    if handler then delivered, reason = handler(src, req.payload) end

    if delivered == true then
        TriggerClientEvent('sd-phone:client:notify', req.fromSrc, {
            app = 'phone', title = 'AirShare',
            body = ('%s accepted your %s.'):format(player.getName(src), kindLabel(req.kind)),
        })
        return { success = true }
    end

    -- Refused AFTER an accept (recipient's contacts full, duplicate, ...). Both sides otherwise
    -- just watch the prompt disappear: the recipient's client fires the respond callback and
    -- drops the card without reading the result, and the sender was only ever told on success.
    -- The recipient gets the handler's specific reason; the sender only needs to know it missed.
    TriggerClientEvent('sd-phone:client:notify', src, {
        app = 'phone', title = 'AirShare',
        body = reason or ('That %s could not be saved.'):format(kindLabel(req.kind)),
    })
    TriggerClientEvent('sd-phone:client:notify', req.fromSrc, {
        app = 'phone', title = 'AirShare',
        body = ('%s could not save your %s.'):format(player.getName(src), kindLabel(req.kind)),
    })
    return { success = false, message = reason }
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
---capped at config.Share.MaxTargets. Each carries their phone number so the picker can show
---the receiver as a saved contact (or their number) instead of a character name. Read-only.
---@param src number player server id
---@return { id: number, name: string, number?: string }[] targets
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
        local cid = player.getIdentifier(found[i].id)
        out[#out + 1] = { id = found[i].id, name = found[i].name, number = cid and settings.getPhoneNumber(cid) or nil }
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
