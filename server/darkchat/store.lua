---@type table Store module; the table returned at end of file. Parameterized queries only; the
---layer stays dumb - callers encode/decode JSON and enforce every length/permission rule. Public
---rooms come from config (no row needed); only private rooms, memberships, messages, reactions
---and nicknames persist. Messages in a public room are keyed by the config room id; private rooms
---use 'p-<code>'.
local store = {}

local util = require 'server.util'
local isTruthy = util.truthy

---Create the Dark Chat tables if they don't exist and back-fill newer columns, so the resource is
---drop-in. `kind` tags a message's type and `meta` holds a JSON blob of its extra fields (media
---URL, audio + duration, waypoint, reply quote); rows from before those columns exist default to
---kind='text'/meta=NULL. Reactions are one row per (message, player, emoji) - a message's rendered
---set is the DISTINCT emoji across its rows. Run once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `darkchat_rooms` (
            `id`         VARCHAR(40)  NOT NULL,
            `code`       VARCHAR(16)  NOT NULL,
            `name`       VARCHAR(60)  NOT NULL,
            `owner`      VARCHAR(60)  NOT NULL,
            `created_at` BIGINT       NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `code` (`code`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `darkchat_members` (
            `room_id`   VARCHAR(40) NOT NULL,
            `citizenid` VARCHAR(60) NOT NULL,
            `joined_at` BIGINT      NOT NULL,
            PRIMARY KEY (`room_id`, `citizenid`),
            KEY `citizenid` (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    MySQL.query.await([[
        ALTER TABLE `darkchat_members`
            ADD COLUMN IF NOT EXISTS `notifications` TINYINT(1) NOT NULL DEFAULT 0
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `darkchat_messages` (
            `id`         INT AUTO_INCREMENT PRIMARY KEY,
            `room_id`    VARCHAR(40) NOT NULL,
            `citizenid`  VARCHAR(60) NULL,
            `author`     VARCHAR(40) NOT NULL,
            `body`       TEXT        NOT NULL,
            `created_at` BIGINT      NOT NULL,
            KEY `room_id` (`room_id`, `id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    MySQL.query.await([[
        ALTER TABLE `darkchat_messages`
            ADD COLUMN IF NOT EXISTS `kind` VARCHAR(16) NOT NULL DEFAULT 'text',
            ADD COLUMN IF NOT EXISTS `meta` TEXT NULL
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `darkchat_reactions` (
            `message_id` INT         NOT NULL,
            `citizenid`  VARCHAR(60) NOT NULL,
            `emoji`      VARCHAR(32) NOT NULL,
            `created_at` BIGINT      NOT NULL,
            PRIMARY KEY (`message_id`, `citizenid`, `emoji`),
            KEY `message_id` (`message_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `darkchat_nicknames` (
            `citizenid` VARCHAR(60) NOT NULL,
            `nickname`  VARCHAR(40) NOT NULL,
            PRIMARY KEY (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
end

---Insert a private room row. Caller guarantees the code (and therefore the 'p-<code>' id) is
---unique and within the VARCHAR(16) column.
---@param id string room id ('p-<code>')
---@param code string join code
---@param name string display name
---@param owner string creator citizenid
---@param ts integer unix seconds
function store.createRoom(id, code, name, owner, ts)
    MySQL.insert.await('INSERT INTO `darkchat_rooms` (id, code, name, owner, created_at) VALUES (?, ?, ?, ?, ?)',
        { id, code, name, owner, ts })
end

---The full room row for a join code, or nil. The row includes the owner citizenid - callers must
---never forward it to a client. Read-only.
---@param code string normalised join code
---@return table|nil row darkchat_rooms row
function store.roomByCode(code)
    return MySQL.single.await('SELECT * FROM `darkchat_rooms` WHERE code = ?', { code })
end

---The full room row for a room id, or nil. The row includes the owner citizenid (the room's
---creator) - callers must never forward it to a client; it gates the kick permission check.
---Read-only.
---@param roomId string room id
---@return table|nil row darkchat_rooms row
function store.roomById(roomId)
    return MySQL.single.await('SELECT * FROM `darkchat_rooms` WHERE id = ?', { roomId })
end

---Every private room `cid` is a member of, newest joins first. Rows include the owner citizenid -
---callers must never forward it to a client. Read-only.
---@param cid string citizenid
---@return table[] rows darkchat_rooms rows
function store.privateRoomsFor(cid)
    return MySQL.query.await([[
        SELECT r.* FROM `darkchat_rooms` r
        JOIN `darkchat_members` m ON m.room_id = r.id
        WHERE m.citizenid = ?
        ORDER BY m.joined_at DESC
    ]], { cid }) or {}
end

---Add a membership row. INSERT IGNORE, so re-joining a room you're already in changes nothing.
---@param roomId string room id
---@param cid string citizenid
---@param ts integer unix seconds
function store.addMember(roomId, cid, ts)
    MySQL.query.await('INSERT IGNORE INTO `darkchat_members` (room_id, citizenid, joined_at) VALUES (?, ?, ?)',
        { roomId, cid, ts })
end

---Delete one player's membership. Scoped to (room, citizenid), so a call can only ever remove the
---given player's own row - never empty a room.
---@param roomId string room id
---@param cid string citizenid
function store.removeMember(roomId, cid)
    MySQL.query.await('DELETE FROM `darkchat_members` WHERE room_id = ? AND citizenid = ?', { roomId, cid })
end

---Whether `cid` holds a membership row for `roomId`. Read-only.
---@param roomId string room id
---@param cid string citizenid
---@return boolean member
function store.isMember(roomId, cid)
    return MySQL.scalar.await('SELECT 1 FROM `darkchat_members` WHERE room_id = ? AND citizenid = ? LIMIT 1', { roomId, cid }) ~= nil
end

---Whether `cid` has per-room message notifications switched on for `roomId`; false when they
---hold no membership row. Read-only.
---@param roomId string room id
---@param cid string citizenid
---@return boolean enabled
function store.getNotifications(roomId, cid)
    return isTruthy(MySQL.scalar.await('SELECT notifications FROM `darkchat_members` WHERE room_id = ? AND citizenid = ?', { roomId, cid }))
end

---Set `cid`'s per-room notification flag on `roomId`. Scoped to the caller's own membership row.
---@param roomId string room id
---@param cid string citizenid
---@param enabled boolean
function store.setNotifications(roomId, cid, enabled)
    MySQL.query.await('UPDATE `darkchat_members` SET notifications = ? WHERE room_id = ? AND citizenid = ?',
        { enabled and 1 or 0, roomId, cid })
end

---The citizenids of every member of `roomId` who has notifications enabled, except `exceptCid`
---(the sender). Feeds the incoming-message notification fan-out. Read-only.
---@param roomId string room id
---@param exceptCid string citizenid to skip (message author)
---@return string[] citizenids
function store.notifyMembersFor(roomId, exceptCid)
    local rows = MySQL.query.await(
        'SELECT citizenid FROM `darkchat_members` WHERE room_id = ? AND notifications = 1 AND citizenid <> ?',
        { roomId, exceptCid }) or {}
    local out = {}
    for _, r in ipairs(rows) do out[#out + 1] = r.citizenid end
    return out
end

---Every member of `roomId` with their saved Dark Chat nickname (NULL when they never picked
---one), oldest join first. Reactor/owner anonymity does not apply here - the list is only ever
---built for the room's creator and citizenids stay server-side (the caller maps them to opaque
---tokens). Read-only.
---@param roomId string room id
---@return table[] rows { citizenid, nickname } rows
function store.membersWithNames(roomId)
    return MySQL.query.await([[
        SELECT m.citizenid AS citizenid, n.nickname AS nickname
        FROM `darkchat_members` m
        LEFT JOIN `darkchat_nicknames` n ON n.citizenid = m.citizenid
        WHERE m.room_id = ?
        ORDER BY m.joined_at ASC
    ]], { roomId }) or {}
end

---How many players are members of a room. Read-only.
---@param roomId string room id
---@return integer count
function store.memberCount(roomId)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `darkchat_members` WHERE room_id = ?', { roomId }) or 0
end

---How many private-room memberships `cid` holds - actions.create's per-player room cap counts
---memberships, not owned rooms. Read-only.
---@param cid string citizenid
---@return integer count
function store.privateCountFor(cid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `darkchat_members` WHERE citizenid = ?', { cid }) or 0
end

---Insert a message row. The citizenid is stored for ownership checks only (buildMessages' `mine`)
---and is never selected into anything client-bound; `author` is the display nickname shown
---instead. `meta` arrives as a ready JSON string or nil - the caller encodes.
---@param roomId string room id
---@param cid string author citizenid
---@param author string display nickname stored beside the message
---@param body string message body (caller caps the length)
---@param ts integer unix seconds
---@param kind string|nil message kind (defaults to 'text')
---@param meta string|nil JSON blob of kind-specific fields
---@return integer id auto-increment message id
function store.insertMessage(roomId, cid, author, body, ts, kind, meta)
    return MySQL.insert.await(
        'INSERT INTO `darkchat_messages` (room_id, citizenid, author, body, created_at, kind, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
        { roomId, cid, author, body, ts, kind or 'text', meta })
end

---The most recent `limit` messages of a room, returned oldest-first for direct rendering (the
---inner query takes the newest N by id, the outer flips them back). Read-only.
---@param roomId string room id
---@param limit integer history size cap
---@return table[] rows darkchat_messages rows
function store.recentMessages(roomId, limit)
    return MySQL.query.await([[
        SELECT * FROM (
            SELECT * FROM `darkchat_messages` WHERE room_id = ? ORDER BY id DESC LIMIT ?
        ) t ORDER BY id ASC
    ]], { roomId, limit }) or {}
end

---The room a message belongs to, or nil - actions.react checks it against the caller's claimed
---room so a bare message id can't reach a message in a room they never joined. Read-only.
---@param messageId number message id
---@return string|nil roomId
function store.messageRoom(messageId)
    return MySQL.scalar.await('SELECT room_id FROM `darkchat_messages` WHERE id = ?', { messageId })
end

---Flip a player's (message, emoji) reaction on/off: delete the row if it exists, otherwise insert
---it (INSERT IGNORE, so a raced double-toggle can't error on the composite primary key).
---@param messageId number message id
---@param cid string reactor citizenid
---@param emoji string reaction emoji
---@param ts integer unix seconds
---@return boolean added true if the reaction was added, false if removed
function store.toggleReaction(messageId, cid, emoji, ts)
    local exists = MySQL.scalar.await(
        'SELECT 1 FROM `darkchat_reactions` WHERE message_id = ? AND citizenid = ? AND emoji = ? LIMIT 1',
        { messageId, cid, emoji }) ~= nil
    if exists then
        MySQL.query.await('DELETE FROM `darkchat_reactions` WHERE message_id = ? AND citizenid = ? AND emoji = ?',
            { messageId, cid, emoji })
        return false
    end
    MySQL.query.await(
        'INSERT IGNORE INTO `darkchat_reactions` (message_id, citizenid, emoji, created_at) VALUES (?, ?, ?, ?)',
        { messageId, cid, emoji, ts })
    return true
end

---A message's reactions from `cid`'s viewpoint: one entry per emoji with a count (players who used
---it) and `mine` (did `cid` react with it), ordered by when each emoji first appeared. Reactor
---citizenids stay inside the query - only the aggregate count and the viewer's own boolean leave
---this layer, preserving anonymity. Read-only.
---@param messageId number message id
---@param cid string viewer citizenid
---@return table[] reactions { emoji, count, mine } rows
function store.reactionsFor(messageId, cid)
    local rows = MySQL.query.await([[
        SELECT emoji, COUNT(*) AS cnt, MAX(citizenid = ?) AS mine
        FROM `darkchat_reactions`
        WHERE message_id = ?
        GROUP BY emoji
        ORDER BY MIN(created_at)
    ]], { cid, messageId }) or {}
    local out = {}
    for _, r in ipairs(rows) do
        out[#out + 1] = { emoji = r.emoji, count = tonumber(r.cnt) or 1, mine = isTruthy(r.mine) }
    end
    return out
end

---Every message's reactions in a room, from `cid`'s viewpoint, keyed by message id AS A STRING to
---match the string ids client messages carry: { [messageId] = { {emoji, count, mine}, ... } }.
---One grouped query for the whole room, so buildMessages attaches per-message sets without an N+1.
---Same anonymity posture as reactionsFor. Read-only.
---@param roomId string room id
---@param cid string viewer citizenid
---@return table<string, table[]> reactions per-message reaction lists
function store.reactionsForRoom(roomId, cid)
    local rows = MySQL.query.await([[
        SELECT r.message_id AS message_id, r.emoji AS emoji, COUNT(*) AS cnt, MAX(r.citizenid = ?) AS mine
        FROM `darkchat_reactions` r
        JOIN `darkchat_messages` m ON m.id = r.message_id
        WHERE m.room_id = ?
        GROUP BY r.message_id, r.emoji
        ORDER BY MIN(r.created_at)
    ]], { cid, roomId }) or {}
    local out = {}
    for _, r in ipairs(rows) do
        local key = tostring(r.message_id)
        out[key] = out[key] or {}
        out[key][#out[key] + 1] = { emoji = r.emoji, count = tonumber(r.cnt) or 1, mine = isTruthy(r.mine) }
    end
    return out
end

---A character's saved nickname, or nil if they never picked one. Read-only.
---@param cid string citizenid
---@return string|nil nickname
function store.getNickname(cid)
    return MySQL.scalar.await('SELECT nickname FROM `darkchat_nicknames` WHERE citizenid = ?', { cid })
end

---Persist a character's nickname (upsert). Caller trims + caps it within the VARCHAR(40) column.
---@param cid string citizenid
---@param nick string display nickname
function store.setNickname(cid, nick)
    MySQL.query.await('INSERT INTO `darkchat_nicknames` (citizenid, nickname) VALUES (?, ?) ON DUPLICATE KEY UPDATE nickname = VALUES(nickname)',
        { cid, nick })
end

return store
