---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Dark Chat persistence layer (server.darkchat.store): rooms/members/messages/reactions/nicknames CRUD.
local store  = require 'server.darkchat.store'
---@type table Player bridge (bridge.server.player): citizenid lookups from a server id.
local player = require 'bridge.server.player'
---@type table Admin mute registry (server.admin.moderation): scope guards for sending messages.
local moderation = require 'server.admin.moderation'

---@type table Dark Chat config (config.DarkChat): public rooms, length caps, history limit, code length.
local DC = config.DarkChat
---@type table Actions module; the table returned at end of file.
local actions = {}

-- Seed the shared RNG once at load.
math.randomseed(GetGameTimer() + os.time())

---@type table<string, table> Public-room config rows keyed by room id.
local PUBLIC_BY_ID = {}
for _, r in ipairs(DC.PublicRooms) do PUBLIC_BY_ID[r.id] = r end

---@type string Room-code alphabet; ambiguous 0/O/1/I excluded.
local CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

---Mint a random room code of DC.CodeLength characters from CODE_ALPHABET.
---@return string code
local function genCode()
    local t = {}
    for i = 1, DC.CodeLength do
        local n = math.random(#CODE_ALPHABET)
        t[i] = CODE_ALPHABET:sub(n, n)
    end
    return table.concat(t)
end

local util = require 'server.util'
local trim = util.trim

---Trims a client string and caps its byte length; nil for non-strings and empties.
---@param s any client-supplied value
---@param max integer maximum byte length kept
---@return string|nil clean trimmed, capped string (nil if unusable)
local function sanitizeStr(s, max)
    if type(s) ~= 'string' then return nil end
    s = trim(s)
    if s == '' then return nil end
    if #s > max then s = s:sub(1, max) end
    return s
end

---@type table<string, boolean> Message kinds a client may send.
local VALID_KINDS = { text = true, image = true, gif = true, voice = true, location = true }

---@type table<string, boolean> The four reactions the shared MessageBubble picker offers.
local REACTION_SET = { ['❤️'] = true, ['👍'] = true, ['👎'] = true, ['😂'] = true }

---@return string clock time "HH:MM" the client renders next to a message
local function fmtTime(ts) return os.date('%H:%M', ts) end

---Stable per-character identity (framework citizenid) resolved from the server id.
---@param src integer player server id
---@return string|nil citizenid or nil if the player can't be resolved
local function cidOf(src) return player.getIdentifier(src) end

---Normalises a client-supplied room code: uppercase, strip everything outside A-Z0-9.
---Non-strings collapse to ''.
---@param c any client-supplied code
---@return string code normalised (possibly empty)
local function sanitizeCode(c)
    if type(c) ~= 'string' then return '' end
    return (c:upper():gsub('[^A-Z0-9]', ''))
end

---Room-access gate every read/write passes through: public rooms are open to everyone, private
---rooms require a membership row.
---@param roomId string room id
---@param cid string caller citizenid
---@return boolean allowed
local function canAccess(roomId, cid)
    if PUBLIC_BY_ID[roomId] then return true end
    return store.isMember(roomId, cid)
end

---@return boolean public - is this a config public room?
function actions.isPublic(roomId) return PUBLIC_BY_ID[roomId] ~= nil end

---A stable, one-way token identifying a member within a room, so the creator's member list can
---name a kick target without ever exposing a citizenid to the client (Dark Chat is anonymous).
---Two FNV-1a passes give a 64-bit hex handle; the token is deterministic, so the same member
---always maps to the same value and resolveMemberToken can recompute it to find the row.
---@param roomId string room id
---@param cid string member citizenid
---@return string token 16-char hex handle
local function memberToken(roomId, cid)
    local s = roomId .. '\30' .. cid
    local h1, h2 = 2166136261, 2166136261
    for i = 1, #s do
        local b = s:byte(i)
        h1 = ((h1 ~ b) * 16777619) & 0xffffffff
        h2 = ((h2 ~ (b + i)) * 16777619) & 0xffffffff
    end
    return ('%08x%08x'):format(h1, h2)
end

---The member citizenid a client-supplied kick token refers to within `roomId`, or nil. Recomputes
---each member's token and returns the unique match; nil when nothing (or, defensively, more than
---one thing) matches, so a hash collision can never kick the wrong person.
---@param roomId string room id
---@param token any client-supplied member token
---@return string|nil citizenid
local function resolveMemberToken(roomId, token)
    if type(token) ~= 'string' or token == '' then return nil end
    local found
    for _, m in ipairs(store.membersWithNames(roomId)) do
        if memberToken(roomId, m.citizenid) == token then
            if found then return nil end
            found = m.citizenid
        end
    end
    return found
end

---A one-line preview of a message for a notification banner: the author's nickname, then a
---kind-appropriate summary. Mirrors the Messages app's server-side previews (plain, emoji-tagged
---strings the banner shows verbatim).
---@param message table client-shaped message from actions.send
---@return string preview
local function previewLine(message)
    local kind = message.kind or 'text'
    local body
    if kind == 'image'    then body = '📷 Photo'
    elseif kind == 'gif'      then body = 'GIF'
    elseif kind == 'voice'    then body = '🎤 Voice message'
    elseif kind == 'location' then body = '📍 Location'
    else body = message.body or '' end
    return ('%s: %s'):format(message.author or '', body)
end

---A room's recent history shaped for the client: each stored meta blob is flattened onto its
---message, and each message carries its reaction set from `cid`'s viewpoint.
---@param roomId string room id
---@param cid string viewer citizenid
---@return table[] messages oldest-first client message rows
local function buildMessages(roomId, cid)
    local reactions = store.reactionsForRoom(roomId, cid)
    local out = {}
    for _, m in ipairs(store.recentMessages(roomId, DC.HistoryLimit)) do
        local msg = {
            id = tostring(m.id), author = m.author, body = m.body, at = fmtTime(m.created_at),
            mine = m.citizenid == cid, kind = m.kind or 'text',
            reactions = reactions[tostring(m.id)] or {},
        }
        if m.meta and m.meta ~= '' then
            local okDecode, decoded = pcall(json.decode, m.meta)
            if okDecode and type(decoded) == 'table' then
                for k, v in pairs(decoded) do msg[k] = v end
            end
        end
        out[#out + 1] = msg
    end
    return out
end

---Every room the caller can see, each with its history preloaded. `publicCounts` supplies live
---viewer counts for public rooms; private rooms report total membership instead. Read-only.
---@param src integer player server id
---@param publicCounts table<string, integer>|nil live viewer count per public room id
---@return table result { success, data = { public, private, nickname } }
function actions.listRooms(src, publicCounts)
    local cid = cidOf(src)
    if not cid then return { success = false, data = { public = {}, private = {} } } end

    local pub = {}
    for _, r in ipairs(DC.PublicRooms) do
        pub[#pub + 1] = {
            id = r.id, name = r.name, topic = r.topic,
            members = (publicCounts and publicCounts[r.id]) or 0,
            isPrivate = false, messages = buildMessages(r.id, cid),
        }
    end

    local priv = {}
    for _, row in ipairs(store.privateRoomsFor(cid)) do
        priv[#priv + 1] = {
            id = row.id, name = row.name, topic = 'Private room',
            members = store.memberCount(row.id), isPrivate = true, code = row.code,
            messages = buildMessages(row.id, cid),
        }
    end

    return { success = true, data = { public = pub, private = priv, nickname = store.getNickname(cid) or '' } }
end

---A live refresh of one room's history. Access-checked. Read-only.
---@param src integer player server id
---@param roomId string room id
---@return table result { success, data = { messages } }
function actions.open(src, roomId)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if not canAccess(roomId, cid) then return { success = false, message = 'No access to that room' } end
    return { success = true, data = { messages = buildMessages(roomId, cid) } }
end

---Posts a message to a room the caller can access. The author name is the caller's saved
---nickname; kind is whitelisted, meta is rebuilt field-by-field per kind, and the body is capped.
---@param src integer player server id
---@param roomId string room id
---@param payload table { kind?, body?, meta? }
---@return table result { success, data = { message } }
function actions.send(src, roomId, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    local muted = moderation.guard(cid, 'darkchat'); if muted then return muted end
    if type(roomId) ~= 'string' then return { success = false, message = 'Bad room' } end
    if not canAccess(roomId, cid) then return { success = false, message = 'No access to that room' } end

    local nick = store.getNickname(cid)
    if not nick or nick == '' then return { success = false, message = 'Pick a nickname first' } end

    payload = payload or {}
    local kind = VALID_KINDS[payload.kind] and payload.kind or 'text'
    local raw  = type(payload.meta) == 'table' and payload.meta or {}
    local body = trim(payload.body or '')
    local meta = {}

    if kind == 'text' then
        if body == '' then return { success = false, message = 'Empty message' } end
    elseif kind == 'image' or kind == 'gif' then
        local url = sanitizeStr(raw.mediaUrl, 1024)
        if not url then return { success = false, message = 'Missing media' } end
        meta.mediaUrl = url
        if body == '' then body = (kind == 'gif') and 'GIF' or '📷 Photo' end
    elseif kind == 'voice' then
        local url = sanitizeStr(raw.audioUrl, 1024)
        if not url then return { success = false, message = 'Missing audio' } end
        meta.audioUrl = url
        meta.duration = math.max(1, math.min(600, math.floor(tonumber(raw.duration) or 1)))
        if type(raw.waveform) == 'table' then
            local bars = {}
            for i = 1, math.min(#raw.waveform, 64) do
                bars[i] = math.max(0, math.min(100, math.floor(tonumber(raw.waveform[i]) or 0)))
            end
            if #bars > 0 then meta.waveform = bars end
        end
        if body == '' then body = '🎤 Voice message' end
    elseif kind == 'location' then
        meta.wpCode = sanitizeStr(raw.wpCode, 256)
        meta.wpSub  = sanitizeStr(raw.wpSub, 64)
        if body == '' then body = 'Current Location' end
    end

    if type(raw.replyTo) == 'table' then
        local rn = sanitizeStr(raw.replyTo.name, 40)
        local rb = sanitizeStr(raw.replyTo.body, 120)
        if rn and rb then meta.replyTo = { name = rn, body = rb } end
    end

    if #body > DC.MaxMessageLength then body = body:sub(1, DC.MaxMessageLength) end

    local metaJson = next(meta) ~= nil and json.encode(meta) or nil
    local ts = os.time()
    local id = store.insertMessage(roomId, cid, nick, body, ts, kind, metaJson)

    local message = { id = tostring(id), author = nick, body = body, at = fmtTime(ts), kind = kind, reactions = {} }
    for k, v in pairs(meta) do message[k] = v end
    return { success = true, data = { message = message } }
end

---Toggles the caller's reaction on a message, returning the message's new reaction set from
---the caller's viewpoint. The emoji is whitelist-checked; the message must belong to `roomId`.
---@param src integer player server id
---@param roomId string room id
---@param messageId any client-supplied message id
---@param emoji any reaction emoji
---@return table result { success, data = { messageId, reactions } }
function actions.react(src, roomId, messageId, emoji)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(roomId) ~= 'string' then return { success = false } end
    if not canAccess(roomId, cid) then return { success = false, message = 'No access to that room' } end

    messageId = tonumber(messageId)
    if not messageId or messageId ~= messageId or messageId == math.huge or messageId == -math.huge then
        return { success = false, message = 'Bad message' }
    end
    emoji = sanitizeStr(emoji, 32)
    if not emoji or not REACTION_SET[emoji] then return { success = false, message = 'Bad emoji' } end

    if store.messageRoom(messageId) ~= roomId then return { success = false, message = 'No such message' } end

    store.toggleReaction(messageId, cid, emoji, os.time())
    return { success = true, data = { messageId = tostring(messageId), reactions = store.reactionsFor(messageId, cid) } }
end

---Creates a private room owned by the caller and auto-joins them. A well-formed, untaken
---client-proposed code is honoured, otherwise a unique one is minted; room ids are 'p-<code>'.
---@param src integer player server id
---@param name any room display name (trimmed, length-capped)
---@param code any client-proposed room code
---@return table result { success, data = { room } }
function actions.create(src, name, code)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    name = trim(name)
    if #name < DC.MinRoomNameLength then return { success = false, message = 'Name too short' } end
    if #name > DC.MaxRoomNameLength then name = name:sub(1, DC.MaxRoomNameLength) end
    if store.privateCountFor(cid) >= DC.MaxPrivateRoomsPerPlayer then
        return { success = false, message = 'You have too many rooms' }
    end

    code = sanitizeCode(code)
    if #code < 4 or #code > 16 or store.roomByCode(code) then
        repeat code = genCode() until not store.roomByCode(code)
    end

    local id, ts = 'p-' .. code, os.time()
    store.createRoom(id, code, name, cid, ts)
    store.addMember(id, cid, ts)
    return { success = true, data = { room = {
        id = id, name = name, topic = 'Private room', members = 1, isPrivate = true, code = code, messages = {},
    } } }
end

---Joins a private room by its code; anyone holding the code may join. New memberships count
---against the DC.MaxPrivateRoomsPerPlayer cap. Idempotent.
---@param src integer player server id
---@param code any client-supplied room code
---@return table result { success, data = { room } }
function actions.join(src, code)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    code = sanitizeCode(code)
    if code == '' then return { success = false, message = 'Enter a code' } end

    local row = store.roomByCode(code)
    if not row then return { success = false, message = 'No room with that code' } end

    if not store.isMember(row.id, cid) and store.privateCountFor(cid) >= DC.MaxPrivateRoomsPerPlayer then
        return { success = false, message = 'You have too many rooms' }
    end

    store.addMember(row.id, cid, os.time())
    return { success = true, data = { room = {
        id = row.id, name = row.name, topic = 'Private room', members = store.memberCount(row.id),
        isPrivate = true, code = row.code, messages = {},
    } } }
end

---Leaves a private room; public rooms can't be left. Only the caller's own membership row is
---deleted. Idempotent.
---@param src integer player server id
---@param roomId any room id
---@return table result { success, data = { roomId } }
function actions.leave(src, roomId)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(roomId) ~= 'string' then return { success = false, message = 'Bad room' } end
    if PUBLIC_BY_ID[roomId] then return { success = false, message = 'Cannot leave a public room' } end
    store.removeMember(roomId, cid)
    return { success = true, data = { roomId = roomId } }
end

---Sets the caller's Dark Chat nickname, keyed by their citizenid; trimmed and length-capped.
---@param src integer player server id
---@param nick any proposed nickname
---@return table result { success, data = { nickname } }
function actions.setNickname(src, nick)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    nick = trim(nick)
    if #nick < DC.MinNicknameLength then return { success = false, message = 'Nickname too short' } end
    if #nick > DC.MaxNicknameLength then nick = nick:sub(1, DC.MaxNicknameLength) end
    store.setNickname(cid, nick)
    return { success = true, data = { nickname = nick } }
end

---The settings surface for one private room: the caller's own notification flag, whether they
---created the room, and - only when they did - the member list (opaque tokens + display names,
---never citizenids). Public rooms and non-members are refused. Read-only.
---@param src integer player server id
---@param roomId string room id
---@return table result { success, data = { notifications, isCreator, members? } }
function actions.roomInfo(src, roomId)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(roomId) ~= 'string' or PUBLIC_BY_ID[roomId] then return { success = false, message = 'No settings for this room' } end
    if not store.isMember(roomId, cid) then return { success = false, message = 'No access to that room' } end

    local room = store.roomById(roomId)
    if not room then return { success = false, message = 'No such room' } end

    local isCreator = room.owner == cid
    local data = { notifications = store.getNotifications(roomId, cid), isCreator = isCreator }
    if isCreator then
        local members = {}
        for _, m in ipairs(store.membersWithNames(roomId)) do
            members[#members + 1] = {
                id = memberToken(roomId, m.citizenid),
                name = (type(m.nickname) == 'string' and m.nickname ~= '') and m.nickname or '',
                creator = m.citizenid == room.owner,
            }
        end
        data.members = members
    end
    return { success = true, data = data }
end

---Toggles the caller's own per-room notification flag on a private room they belong to. Public
---rooms and non-members are refused.
---@param src integer player server id
---@param roomId any room id
---@param enabled any client-supplied on/off
---@return table result { success, data = { enabled } }
function actions.setNotifications(src, roomId, enabled)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(roomId) ~= 'string' or PUBLIC_BY_ID[roomId] then return { success = false, message = 'No settings for this room' } end
    if not store.isMember(roomId, cid) then return { success = false, message = 'No access to that room' } end
    local on = enabled == true or enabled == 1
    store.setNotifications(roomId, cid, on)
    return { success = true, data = { enabled = on } }
end

---The notification fan-out target for a freshly-sent message: the room's display name, a banner
---preview line, and the citizenids of members (other than the sender) who opted in. nil for
---public rooms, unknown rooms, or when nobody opted in - the init layer then knows to skip it.
---@param src integer sender server id
---@param roomId string room id
---@param message table client-shaped message from actions.send
---@return table|nil { title, body, citizenids }
function actions.notifyTargets(src, roomId, message)
    if PUBLIC_BY_ID[roomId] then return nil end
    local cid = cidOf(src)
    if not cid then return nil end
    local room = store.roomById(roomId)
    if not room then return nil end
    local citizenids = store.notifyMembersFor(roomId, cid)
    if #citizenids == 0 then return nil end
    return { title = room.name, body = previewLine(message), citizenids = citizenids }
end

---Removes a member from a private room on the creator's behalf. Server-validated: the caller must
---be that room's creator, the token must resolve to a current member, and the target may not be
---the creator. The kicked player keeps no ban - they can rejoin later with the code, mirroring
---leave/join. Returns the resolved target citizenid for the init layer's live push (never
---forwarded to the client).
---@param src integer player server id
---@param roomId any room id
---@param token any client-supplied member token
---@return table result { success, data = { roomId, memberId, targetCid } }
function actions.kick(src, roomId, token)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(roomId) ~= 'string' or PUBLIC_BY_ID[roomId] then return { success = false, message = 'Cannot remove from this room' } end

    local room = store.roomById(roomId)
    if not room then return { success = false, message = 'No such room' } end
    if room.owner ~= cid then return { success = false, message = 'Only the room creator can remove members' } end

    local targetCid = resolveMemberToken(roomId, token)
    if not targetCid then return { success = false, message = 'No such member' } end
    if targetCid == room.owner then return { success = false, message = 'You cannot remove yourself' } end

    store.removeMember(roomId, targetCid)
    return { success = true, data = { roomId = roomId, memberId = token, targetCid = targetCid } }
end

return actions
