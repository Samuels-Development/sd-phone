---@type table Store module; the table returned at end of file.
local store = {}


local util = require 'server.util'
local function newId() return util.newId(7) end

store.newId = newId

---Decodes a value into a Lua table: tables pass through, strings are JSON-decoded, and
---anything else (or a failed decode) becomes {}.
---@param value any
---@return table
local function decodeJson(value)
    if value == nil then return {} end
    if type(value) == 'table' then return value end
    if type(value) == 'string' then
        local ok, decoded = pcall(json.decode, value)
        if ok and type(decoded) == 'table' then return decoded end
    end
    return {}
end

store.decodeJson = decodeJson

---Encodes a meta table for storage; empty / nil tables become SQL NULL.
---@param tbl table|nil
---@return string|nil
local function encodeJson(tbl)
    if not tbl or next(tbl) == nil then return nil end
    return json.encode(tbl)
end

---Creates the message tables idempotently, back-fills missing columns, and upgrades the
---reactions primary key. Run once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_messages (
            id            VARCHAR(16)  NOT NULL,
            mid           VARCHAR(16)  NULL,
            citizenid     VARCHAR(64)  NOT NULL,
            conversation  VARCHAR(48)  NOT NULL,
            sender        VARCHAR(32)  NOT NULL DEFAULT '',
            direction     VARCHAR(16)  NOT NULL,
            kind          VARCHAR(16)  NOT NULL DEFAULT 'text',
            body          TEXT         NULL,
            meta          JSON         NULL,
            is_read       TINYINT(1)   NOT NULL DEFAULT 0,
            withheld      TINYINT(1)   NOT NULL DEFAULT 0,
            created_at    BIGINT       NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_phone_messages_thread (citizenid, conversation, created_at),
            INDEX idx_phone_messages_mid (mid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    util.ensureIndex('phone_messages', 'idx_phone_messages_unread', '(citizenid, is_read)')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_message_reactions (
            mid         VARCHAR(16) NOT NULL,
            citizenid   VARCHAR(64) NOT NULL,
            emoji       VARCHAR(32) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (mid, citizenid, emoji),
            INDEX idx_phone_message_reactions_mid (mid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    local pk = MySQL.query.await([[
        SELECT COLUMN_NAME AS col FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phone_message_reactions'
          AND CONSTRAINT_NAME = 'PRIMARY'
    ]]) or {}
    local hasEmojiInPk = false
    for _, r in ipairs(pk) do if r.col == 'emoji' then hasEmojiInPk = true break end end
    if #pk > 0 and not hasEmojiInPk then
        MySQL.query.await('ALTER TABLE phone_message_reactions DROP PRIMARY KEY, ADD PRIMARY KEY (mid, citizenid, emoji)')
    end

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_message_groups (
            id          VARCHAR(16) NOT NULL,
            name        VARCHAR(64) NOT NULL,
            avatar      VARCHAR(512) NULL,
            owner_cid   VARCHAR(64) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_phone_message_groups_owner (owner_cid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_message_group_members (
            group_id    VARCHAR(16) NOT NULL,
            citizenid   VARCHAR(64) NOT NULL,
            number      VARCHAR(32) NOT NULL,
            name        VARCHAR(64) NOT NULL,
            PRIMARY KEY (group_id, citizenid),
            INDEX idx_pmgm_cid (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    local wcol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'phone_messages'
          AND column_name = 'withheld'
    ]])
    if not wcol or tonumber(wcol.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_messages ADD COLUMN withheld TINYINT(1) NOT NULL DEFAULT 0')
    end

    local mcol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'phone_messages'
          AND column_name = 'mid'
    ]])
    if not mcol or tonumber(mcol.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_messages ADD COLUMN mid VARCHAR(16) NULL')
        MySQL.query.await('ALTER TABLE phone_messages ADD INDEX idx_phone_messages_mid (mid)')
    end
    MySQL.query.await('UPDATE phone_messages SET mid = id WHERE mid IS NULL')

    local acol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'phone_message_groups'
          AND column_name = 'avatar'
    ]])
    if not acol or tonumber(acol.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_message_groups ADD COLUMN avatar VARCHAR(512) NULL')
    end
end

---Lists a player's conversation keys, most-recently-active first, each with the newest message
---epoch. Withheld rows are excluded. Read-only.
---@param citizenid string
---@return { conversation: string, last_at: number }[]
function store.threadKeys(citizenid)
    return MySQL.query.await([[
        SELECT conversation, MAX(created_at) AS last_at
        FROM phone_messages
        WHERE citizenid = ? AND withheld = 0
        GROUP BY conversation
        ORDER BY last_at DESC
    ]], { citizenid }) or {}
end

---Reads the newest `limit` messages in one thread, returned oldest-first. The cap is a
---validated integer interpolated into the query. Read-only.
---@param citizenid string
---@param conversation string
---@param limit number
---@return table[]
function store.threadMessages(citizenid, conversation, limit)
    local n = math.floor(tonumber(limit) or 200)
    if n < 1 then n = 1 end
    local rows = MySQL.query.await(([[
        SELECT id, mid, sender, direction, kind, body, meta, is_read, created_at
        FROM phone_messages
        WHERE citizenid = ? AND conversation = ? AND withheld = 0
        ORDER BY created_at DESC
        LIMIT %d
    ]]):format(n), { citizenid, conversation }) or {}

    local out, len = {}, #rows
    for i = len, 1, -1 do out[len - i + 1] = rows[i] end
    return out
end

---Inserts one mailbox copy of a message; meta is JSON-encoded here.
---@param id string unique id for this mailbox copy
---@param mid string shared logical message id (same across every copy of one send)
---@param citizenid string mailbox owner
---@param conversation string thread key (peer number, or 'g-'..groupId)
---@param sender string sender's number digits
---@param direction 'incoming'|'outgoing'
---@param kind string
---@param body string|nil
---@param meta table|nil
---@param isRead boolean
---@param createdAt number unix epoch
---@param withheld boolean|nil true = held back (recipient is in airplane mode)
---@return boolean
function store.insertMessage(id, mid, citizenid, conversation, sender, direction, kind, body, meta, isRead, createdAt, withheld)
    local affected = MySQL.insert.await([[
        INSERT INTO phone_messages
            (id, mid, citizenid, conversation, sender, direction, kind, body, meta, is_read, withheld, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        id, mid, citizenid, conversation, sender, direction, kind,
        body, encodeJson(meta), isRead and 1 or 0, withheld and 1 or 0, createdAt,
    })
    return affected ~= nil
end

---Prunes a thread down to its newest `keep` rows. The LIMIT is a validated integer
---interpolated into the query. Scoped to the owner's mailbox.
---@param citizenid string
---@param conversation string
---@param keep number
function store.pruneThread(citizenid, conversation, keep)
    local n = math.floor(tonumber(keep) or 200)
    if n < 1 then n = 1 end
    MySQL.update.await(([[
        DELETE FROM phone_messages
        WHERE citizenid = ? AND conversation = ?
          AND id NOT IN (
              SELECT id FROM (
                  SELECT id FROM phone_messages
                  WHERE citizenid = ? AND conversation = ?
                  ORDER BY created_at DESC
                  LIMIT %d
              ) AS keep_rows
          )
    ]]):format(n), { citizenid, conversation, citizenid, conversation })
end

---Marks every inbound message in a thread as read, scoped to its owner.
---@param citizenid string
---@param conversation string
function store.markThreadRead(citizenid, conversation)
    MySQL.update.await([[
        UPDATE phone_messages
        SET is_read = 1
        WHERE citizenid = ? AND conversation = ? AND direction = 'incoming' AND is_read = 0
    ]], { citizenid, conversation })
end

---Counts unread inbound messages across every thread an owner has, excluding withheld rows.
---Read-only.
---@param citizenid string
---@return number
function store.unreadCount(citizenid)
    local row = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM phone_messages
        WHERE citizenid = ? AND direction = 'incoming' AND is_read = 0 AND withheld = 0
    ]], { citizenid })
    return row and tonumber(row.n) or 0
end

---Conversations holding withheld (airplane-mode) messages for an owner. Read-only.
---@param citizenid string
---@return { conversation: string }[]
function store.withheldConversations(citizenid)
    return MySQL.query.await([[
        SELECT DISTINCT conversation FROM phone_messages
        WHERE citizenid = ? AND withheld = 1
    ]], { citizenid }) or {}
end

---Releases every withheld message for an owner. Idempotent.
---@param citizenid string
function store.releaseWithheld(citizenid)
    MySQL.update.await(
        'UPDATE phone_messages SET withheld = 0 WHERE citizenid = ? AND withheld = 1',
        { citizenid }
    )
end

---Deletes a player's copy of an entire thread; other participants' copies stay put.
---@param citizenid string
---@param conversation string
function store.deleteThread(citizenid, conversation)
    MySQL.update.await(
        'DELETE FROM phone_messages WHERE citizenid = ? AND conversation = ?',
        { citizenid, conversation }
    )
end

---Inserts a new group thread. Returns false on failure.
---@param id string
---@param name string
---@param ownerCid string
---@param createdAt number
---@return boolean
function store.createGroup(id, name, ownerCid, createdAt)
    local affected = MySQL.insert.await(
        'INSERT INTO phone_message_groups (id, name, owner_cid, created_at) VALUES (?, ?, ?, ?)',
        { id, name, ownerCid, createdAt }
    )
    return affected ~= nil
end

---Read a single group row, or nil. Read-only.
---@param groupId string
---@return { id: string, name: string, avatar: string|nil, owner_cid: string }|nil
function store.getGroup(groupId)
    if not groupId or groupId == '' then return nil end
    return MySQL.single.await(
        'SELECT id, name, avatar, owner_cid FROM phone_message_groups WHERE id = ?',
        { groupId }
    )
end

---Updates a group's name and picture.
---@param groupId string
---@param name string
---@param avatar string|nil
function store.updateGroup(groupId, name, avatar)
    MySQL.update.await(
        'UPDATE phone_message_groups SET name = ?, avatar = ? WHERE id = ?',
        { name, avatar, groupId }
    )
end

---Add a member to a group. Idempotent - re-adding the same citizen just refreshes their cached
---number / name.
---@param groupId string
---@param citizenid string
---@param number string
---@param name string
function store.addGroupMember(groupId, citizenid, number, name)
    MySQL.update.await([[
        INSERT INTO phone_message_group_members (group_id, citizenid, number, name)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE number = VALUES(number), name = VALUES(name)
    ]], { groupId, citizenid, number, name })
end

---Every member of a group. Read-only.
---@param groupId string
---@return { citizenid: string, number: string, name: string }[]
function store.groupMembers(groupId)
    return MySQL.query.await(
        'SELECT citizenid, number, name FROM phone_message_group_members WHERE group_id = ?',
        { groupId }
    ) or {}
end

---True iff the citizen is a member of the group. Read-only.
---@param groupId string
---@param citizenid string
---@return boolean
function store.isGroupMember(groupId, citizenid)
    local row = MySQL.single.await(
        'SELECT 1 AS hit FROM phone_message_group_members WHERE group_id = ? AND citizenid = ? LIMIT 1',
        { groupId, citizenid }
    )
    return row ~= nil
end

---Group ids the player belongs to, paired with the group name. Read-only.
---@param citizenid string
---@return { id: string, name: string }[]
function store.groupsForMember(citizenid)
    return MySQL.query.await([[
        SELECT g.id, g.name
        FROM phone_message_groups g
        INNER JOIN phone_message_group_members m ON m.group_id = g.id
        WHERE m.citizenid = ?
        ORDER BY g.created_at DESC
    ]], { citizenid }) or {}
end

---Removes a member from a group. No-op when they're not a member.
---@param groupId string
---@param citizenid string
function store.removeGroupMember(groupId, citizenid)
    MySQL.update.await(
        'DELETE FROM phone_message_group_members WHERE group_id = ? AND citizenid = ?',
        { groupId, citizenid }
    )
end

---Live member count for a group. Read-only.
---@param groupId string
---@return number
function store.groupMemberCount(groupId)
    local row = MySQL.single.await(
        'SELECT COUNT(*) AS n FROM phone_message_group_members WHERE group_id = ?',
        { groupId }
    )
    return row and tonumber(row.n) or 0
end

---Hard-deletes an empty group and any stray rows tied to it.
---@param groupId string
function store.deleteGroup(groupId)
    MySQL.update.await('DELETE FROM phone_message_group_members WHERE group_id = ?', { groupId })
    MySQL.update.await('DELETE FROM phone_message_groups WHERE id = ?', { groupId })
end

---Resolves a caller's mailbox copy to its shared logical id, verifying the row is theirs.
---Returns nil if the message isn't in the caller's mailbox. Read-only.
---@param id string the caller's copy id
---@param citizenid string
---@return string|nil
function store.midForCopy(id, citizenid)
    return MySQL.scalar.await(
        'SELECT mid FROM phone_messages WHERE id = ? AND citizenid = ? LIMIT 1',
        { id, citizenid }
    )
end

---Toggles a player's reaction for one emoji on a message: an existing reaction is removed,
---otherwise it's added. Returns true if it was added.
---@param mid string
---@param citizenid string
---@param emoji string
---@param createdAt number
---@return boolean added
function store.toggleReaction(mid, citizenid, emoji, createdAt)
    local exists = MySQL.scalar.await(
        'SELECT 1 FROM phone_message_reactions WHERE mid = ? AND citizenid = ? AND emoji = ? LIMIT 1',
        { mid, citizenid, emoji }
    ) ~= nil
    if exists then
        MySQL.query.await(
            'DELETE FROM phone_message_reactions WHERE mid = ? AND citizenid = ? AND emoji = ?',
            { mid, citizenid, emoji }
        )
        return false
    end
    MySQL.query.await(
        'INSERT IGNORE INTO phone_message_reactions (mid, citizenid, emoji, created_at) VALUES (?, ?, ?, ?)',
        { mid, citizenid, emoji, createdAt }
    )
    return true
end

---Every reaction on one message, oldest first. Read-only.
---@param mid string
---@return { citizenid: string, emoji: string }[]
function store.reactionsFor(mid)
    return MySQL.query.await(
        'SELECT citizenid, emoji FROM phone_message_reactions WHERE mid = ? ORDER BY created_at ASC',
        { mid }
    ) or {}
end

---Reactions for many messages at once, as { [mid] = { {citizenid, emoji}, ... } } ordered
---oldest-first. Nil/empty mids are skipped. Read-only.
---@param mids string[]
---@return table<string, { citizenid: string, emoji: string }[]>
function store.reactionsForMids(mids)
    local out = {}
    local list, ph = {}, {}
    for i = 1, #mids do
        local m = mids[i]
        if m and m ~= '' then list[#list + 1] = m; ph[#ph + 1] = '?' end
    end
    if #list == 0 then return out end
    local rows = MySQL.query.await(
        ('SELECT mid, citizenid, emoji FROM phone_message_reactions WHERE mid IN (%s) ORDER BY created_at ASC')
            :format(table.concat(ph, ',')),
        list
    ) or {}
    for _, r in ipairs(rows) do
        local bucket = out[r.mid]
        if not bucket then bucket = {}; out[r.mid] = bucket end
        bucket[#bucket + 1] = { citizenid = r.citizenid, emoji = r.emoji }
    end
    return out
end

---Reads one message's raw meta column (JSON string or table). Read-only.
---@param id string
---@return any
function store.messageMeta(id)
    return MySQL.scalar.await('SELECT meta FROM phone_messages WHERE id = ? LIMIT 1', { id })
end

---Finds the newest still-pending request card of `kind` in one mailbox thread, scanning the
---newest five candidates. Scoped to the owner's mailbox. Read-only.
---@param citizenid string
---@param conversation string
---@param kind string
---@return string|nil copy id
function store.latestPendingRequest(citizenid, conversation, kind)
    local rows = MySQL.query.await([[
        SELECT id, meta FROM phone_messages
        WHERE citizenid = ? AND conversation = ? AND kind = ?
        ORDER BY created_at DESC
        LIMIT 5
    ]], { citizenid, conversation, kind }) or {}
    for _, r in ipairs(rows) do
        local meta = decodeJson(r.meta)
        if meta.requestStatus == nil or meta.requestStatus == 'pending' then return r.id end
    end
    return nil
end

---Overwrites one message's meta blob.
---@param id string
---@param meta table|nil
function store.updateMeta(id, meta)
    MySQL.update.await('UPDATE phone_messages SET meta = ? WHERE id = ?', { encodeJson(meta), id })
end

---Every mailbox copy of a logical message. Read-only.
---@param mid string
---@return { id: string, citizenid: string, conversation: string }[]
function store.siblingCopies(mid)
    return MySQL.query.await(
        'SELECT id, citizenid, conversation FROM phone_messages WHERE mid = ?',
        { mid }
    ) or {}
end

return store
