---@type table Dark Chat persistence layer (server.darkchat.store): schema bootstrap + CRUD.
local store   = require 'server.darkchat.store'
---@type table Dark Chat business logic (server.darkchat.actions): validated room/message/reaction handlers.
local actions = require 'server.darkchat.actions'
---@type table Player bridge (bridge.server.player): server id lookups from a citizenid.
local player  = require 'bridge.server.player'

-- Schema bootstrap runs once at load; a failure is printed.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:darkchat]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:darkchat]^0 schema ready')
end)

-- Live presence, in memory only: who is tabbed into which room, and who is sitting on the
-- rooms list.
---@type table<string, table<integer, boolean>> Viewers currently inside a room, per room id.
local present  = {}
---@type table<integer, boolean> Viewers currently on the rooms list, by src.
local homepage = {}

---Marks `src` as viewing `roomId`. Only called after actions.open granted access.
---@param src integer player server id
---@param roomId string room id
local function joinPresence(src, roomId)
    present[roomId] = present[roomId] or {}
    present[roomId][src] = true
end

---Removes `src` from one room's viewer set; a garbage roomId changes nothing.
---@param src integer player server id
---@param roomId string room id (may be raw client input; only ever used as a table key)
local function leavePresence(src, roomId)
    local set = present[roomId]
    if set then set[src] = nil end
end

---Remove `src` from every room's viewer set (app exit / disconnect).
---@param src integer player server id
local function leaveAll(src)
    for _, set in pairs(present) do set[src] = nil end
end

---Mark `src` as sitting on the rooms list, where they receive active-count pushes.
---@param src integer player server id
local function joinHomepage(src)  homepage[src] = true end

---Drop `src` from the rooms-list set.
---@param src integer player server id
local function leaveHomepage(src) homepage[src] = nil  end

---How many viewers are currently inside `roomId`.
---@param roomId string room id
---@return integer n
local function countPresent(roomId)
    local set = present[roomId]
    if not set then return 0 end
    local n = 0
    for _ in pairs(set) do n = n + 1 end
    return n
end

---Live viewer count per room id.
---@return table<string, integer> counts
local function publicCounts()
    local counts = {}
    for roomId in pairs(present) do counts[roomId] = countPresent(roomId) end
    return counts
end

---Pushes the current "active" viewer count for a public room to the viewers inside it and
---anyone sitting on the rooms list. Private rooms are skipped.
---@param roomId string room id (non-public ids no-op)
local function broadcastActive(roomId)
    if not actions.isPublic(roomId) then return end
    local n = countPresent(roomId)
    local sent = {}
    local set = present[roomId]
    if set then
        for tgt in pairs(set) do
            sent[tgt] = true
            TriggerClientEvent('sd-phone:client:darkchat:active', tgt, { roomId = roomId, active = n })
        end
    end
    for tgt in pairs(homepage) do
        if not sent[tgt] then
            TriggerClientEvent('sd-phone:client:darkchat:active', tgt, { roomId = roomId, active = n })
        end
    end
end

---Delivers a freshly-stored message to every other live viewer of its room. The message
---carries only the author's nickname.
---@param roomId string room id
---@param exceptSrc integer sender to skip
---@param message table client-shaped message from actions.send
local function broadcast(roomId, exceptSrc, message)
    local set = present[roomId]
    if not set then return end
    for tgt in pairs(set) do
        if tgt ~= exceptSrc then
            TriggerClientEvent('sd-phone:client:darkchat:message', tgt, { roomId = roomId, message = message })
        end
    end
end

---Fires the standard phone notification + darkchat badge to private-room members who opted in,
---skipping the sender and anyone currently viewing the room (they already got the live message,
---so no banner spam). Offline members are simply not reachable - Dark Chat keeps no server-side
---unread badge.
---@param roomId string room id
---@param exceptSrc integer sender to skip
---@param message table client-shaped message from actions.send
local function pushNotifications(roomId, exceptSrc, message)
    local note = actions.notifyTargets(exceptSrc, roomId, message)
    if not note then return end
    local viewers = present[roomId]
    for _, cid in ipairs(note.citizenids) do
        local tgt = player.getSourceByIdentifier(cid)
        if tgt and tgt ~= exceptSrc and not (viewers and viewers[tgt]) then
            TriggerClientEvent('sd-phone:client:notify', tgt, {
                app = 'darkchat', appId = 'darkchat', time = 'now',
                title = note.title, body = note.body,
            })
        end
    end
end

---Pushes a message's new reaction set to everyone in the room except the reactor.
---@param roomId string room id
---@param exceptSrc integer reactor to skip
---@param messageId string message id
---@param reactions table[] { emoji, count, mine } rows
local function broadcastReaction(roomId, exceptSrc, messageId, reactions)
    local set = present[roomId]
    if not set then return end
    for tgt in pairs(set) do
        if tgt ~= exceptSrc then
            TriggerClientEvent('sd-phone:client:darkchat:reaction', tgt, { roomId = roomId, messageId = messageId, reactions = reactions })
        end
    end
end

---Pushes a private room's authoritative member count to its online members, so joins/leaves/
---removals show up live instead of waiting for the next app open. The actor is skipped - their
---own callback response already carries the fresh count. Public rooms track presence instead.
---@param roomId string room id
---@param exceptSrc integer|nil member to skip
local function broadcastMembers(roomId, exceptSrc)
    if actions.isPublic(roomId) then return end
    local n = store.memberCount(roomId)
    for _, m in ipairs(store.membersWithNames(roomId)) do
        local tgt = player.getSourceByIdentifier(m.citizenid)
        if tgt and tgt ~= exceptSrc then
            TriggerClientEvent('sd-phone:client:darkchat:members', tgt, { roomId = roomId, members = n })
        end
    end
end

---Room list + preloaded histories. Fetching the list also marks the caller as sitting on the
---homepage for live active-count pushes.
lib.callback.register('sd-phone:server:darkchat:rooms', function(src)
    joinHomepage(src)
    return actions.listRooms(src, publicCounts())
end)

---Opens one room: access-check + history via actions.open, then presence bookkeeping; a public
---room gets its live active count attached and everyone else's count refreshed.
---@param payload table { roomId: string }
lib.callback.register('sd-phone:server:darkchat:open', function(src, payload)
    local roomId = type(payload) == 'table' and payload.roomId or nil
    if type(roomId) ~= 'string' then return { success = false } end
    local res = actions.open(src, roomId)
    if res.success then
        leaveHomepage(src)
        joinPresence(src, roomId)
        if actions.isPublic(roomId) then
            res.data.active = countPresent(roomId)
            broadcastActive(roomId)
        end
    end
    return res
end)

---A room view closed back to the rooms list: the caller becomes a homepage viewer again and the
---room's active count refreshes for everyone still watching.
---@param payload table { roomId: string }
lib.callback.register('sd-phone:server:darkchat:close', function(src, payload)
    joinHomepage(src)
    local roomId = type(payload) == 'table' and payload.roomId or nil
    if type(roomId) == 'string' then
        leavePresence(src, roomId)
        broadcastActive(roomId)
    end
    return { success = true }
end)

---The Dark Chat app itself closed (home button / app switch): scrub the viewer from all presence,
---then refresh the active count of each public room they were tabbed into. Idempotent.
lib.callback.register('sd-phone:server:darkchat:exit', function(src)
    leaveHomepage(src)
    local affected = {}
    for roomId, set in pairs(present) do
        if set[src] and actions.isPublic(roomId) then affected[#affected + 1] = roomId end
    end
    leaveAll(src)
    for _, roomId in ipairs(affected) do broadcastActive(roomId) end
    return { success = true }
end)

---Post a message (validated + stored in actions.send) and push it to the room's other live viewers
---on success.
---@param payload table { roomId, kind?, body?, meta? }
lib.callback.register('sd-phone:server:darkchat:send', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local res = actions.send(src, payload.roomId, payload)
    if res.success then
        broadcast(payload.roomId, src, res.data.message)
        pushNotifications(payload.roomId, src, res.data.message)
    end
    return res
end)

---Toggle a reaction (validated in actions.react) and push the updated set to the room's other
---live viewers on success.
---@param payload table { roomId, messageId, emoji }
lib.callback.register('sd-phone:server:darkchat:react', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local res = actions.react(src, payload.roomId, payload.messageId, payload.emoji)
    if res.success then
        broadcastReaction(payload.roomId, src, res.data.messageId, res.data.reactions)
    end
    return res
end)

-- Thin delegates into server.darkchat.actions.
lib.callback.register('sd-phone:server:darkchat:create', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.create(src, payload.name, payload.code)
end)

lib.callback.register('sd-phone:server:darkchat:join', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local res = actions.join(src, payload.code)
    if res.success then broadcastMembers(res.data.room.id, src) end
    return res
end)

---Leave a private room: drop the caller's presence in it first, then remove their membership via
---actions.leave.
---@param payload table { roomId: string }
lib.callback.register('sd-phone:server:darkchat:leave', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    if payload.roomId then leavePresence(src, payload.roomId) end
    local res = actions.leave(src, payload.roomId)
    if res.success and type(res.data.roomId) == 'string' then broadcastMembers(res.data.roomId, src) end
    return res
end)

---Save the caller's nickname (validated in actions.setNickname).
---@param payload table { nickname: string }
lib.callback.register('sd-phone:server:darkchat:nickname', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.setNickname(src, payload.nickname)
end)

---Room settings for a private room: the caller's notification flag, whether they are the creator,
---and (creator only) the member list.
---@param payload table { roomId: string }
lib.callback.register('sd-phone:server:darkchat:roomInfo', function(src, payload)
    local roomId = type(payload) == 'table' and payload.roomId or nil
    if type(roomId) ~= 'string' then return { success = false } end
    return actions.roomInfo(src, roomId)
end)

---Toggle the caller's own per-room notification flag.
---@param payload table { roomId: string, enabled: boolean }
lib.callback.register('sd-phone:server:darkchat:notifications', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.setNotifications(src, payload.roomId, payload.enabled)
end)

---Creator removes a member: validated in actions.kick, then the kicked player is scrubbed from the
---room's presence and told to drop it from their UI live. The client never sees the target's
---citizenid - only the echoed member token comes back.
---@param payload table { roomId: string, memberId: string }
lib.callback.register('sd-phone:server:darkchat:kick', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local res = actions.kick(src, payload.roomId, payload.memberId)
    if not res.success then return res end
    local tgt = player.getSourceByIdentifier(res.data.targetCid)
    if tgt then
        leavePresence(tgt, res.data.roomId)
        TriggerClientEvent('sd-phone:client:darkchat:kicked', tgt, { roomId = res.data.roomId })
    end
    broadcastMembers(res.data.roomId, src)
    return { success = true, data = { memberId = res.data.memberId } }
end)

---Creator bans a member: validated in actions.ban (kick + ban list), then the banned player is
---scrubbed from presence, told to drop the room live, and shown a banner saying they were
---banned. The client only ever sees the echoed member token.
---@param payload table { roomId: string, memberId: string }
lib.callback.register('sd-phone:server:darkchat:ban', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local res = actions.ban(src, payload.roomId, payload.memberId)
    if not res.success then return res end
    local tgt = player.getSourceByIdentifier(res.data.targetCid)
    if tgt then
        leavePresence(tgt, res.data.roomId)
        TriggerClientEvent('sd-phone:client:darkchat:kicked', tgt, { roomId = res.data.roomId })
        TriggerClientEvent('sd-phone:client:notify', tgt, {
            app = 'darkchat', appId = 'darkchat', time = 'now',
            title = res.data.roomName,
            body  = 'You have been banned from this room.',
        })
    end
    broadcastMembers(res.data.roomId, src)
    return { success = true, data = { memberId = res.data.memberId, name = res.data.name } }
end)

---Creator lifts a ban (validated in actions.unban). The unbanned player gets no push - nothing
---changes for them until they choose to rejoin with the code.
---@param payload table { roomId: string, memberId: string }
lib.callback.register('sd-phone:server:darkchat:unban', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.unban(src, payload.roomId, payload.memberId)
end)

---Creator mints a fresh room code (cooldown-validated in actions.regenCode); every other online
---member's app patches the code live so nobody keeps sharing the retired one.
---@param payload table { roomId: string }
lib.callback.register('sd-phone:server:darkchat:regenCode', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local res = actions.regenCode(src, payload.roomId)
    if not res.success then return res end
    for _, m in ipairs(store.membersWithNames(res.data.roomId)) do
        local tgt = player.getSourceByIdentifier(m.citizenid)
        if tgt and tgt ~= src then
            TriggerClientEvent('sd-phone:client:darkchat:code', tgt, {
                roomId = res.data.roomId, code = res.data.code,
            })
        end
    end
    return res
end)

---A disconnecting player is scrubbed from all presence state, and each public room they were
---tabbed into gets its active count refreshed for the remaining viewers.
AddEventHandler('playerDropped', function()
    local src = source
    local affected = {}
    for roomId, set in pairs(present) do
        if set[src] and actions.isPublic(roomId) then affected[#affected + 1] = roomId end
    end
    leaveHomepage(src)
    leaveAll(src)
    for _, roomId in ipairs(affected) do broadcastActive(roomId) end
end)
