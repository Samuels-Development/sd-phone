---@type table Store module; the table returned at end of file.
local store = {}


local util = require 'server.util'
local function newId() return util.newId(7) end

store.newId = newId

---Decodes a value into a Lua table, covering both auto-decoded JSON columns and raw strings;
---anything else yields {}.
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

---JSON-encode a table for a NOT NULL JSON column (nil becomes an empty container).
---@param tbl table|nil
---@return string
local function encodeJson(tbl) return json.encode(tbl or {}) end

---Reshape a raw row from `phone_groups` into the canonical group shape with `members`
---and `invites` already JSON-decoded.
---@param row table|nil
---@return table|nil
local function hydrateRow(row)
    if not row then return nil end
    return {
        id         = row.id,
        name       = row.name,
        leader_cid = row.leader_cid,
        color      = row.color,
        avatar     = row.avatar,
        members    = decodeJson(row.members),
        invites    = decodeJson(row.invites),
    }
end

---Creates the phone_groups and phone_group_invites tables idempotently, back-filling the
---avatar column on older installs and migrating legacy JSON invites once.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_groups (
            id          VARCHAR(16)  NOT NULL,
            name        VARCHAR(64)  NOT NULL,
            leader_cid  VARCHAR(64)  NOT NULL,
            color       VARCHAR(16)  NOT NULL,
            avatar      VARCHAR(512) NULL,
            members     JSON         NOT NULL,
            invites     JSON         NOT NULL,
            created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_phone_groups_leader (leader_cid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    local col = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_groups' AND column_name = 'avatar'
    ]])
    if not col or tonumber(col.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_groups ADD COLUMN avatar VARCHAR(512) NULL AFTER color')
    end

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_group_invites (
            id           VARCHAR(16) NOT NULL,
            group_id     VARCHAR(16) NOT NULL,
            target_cid   VARCHAR(64) NOT NULL,
            invited_by   VARCHAR(64) NOT NULL,
            invited_name VARCHAR(64) NULL,
            sent_at      BIGINT      NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_group_invites_target (target_cid),
            INDEX idx_group_invites_group (group_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Older installs created sent_at as DATETIME, but the code stamps it with os.time() (a Unix
    -- integer), so a mismatched column rejects every invite. Bring an existing column up to BIGINT.
    local sentAt = MySQL.single.await([[
        SELECT DATA_TYPE AS t FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_group_invites' AND column_name = 'sent_at'
    ]])
    if sentAt and sentAt.t and sentAt.t ~= 'bigint' then
        MySQL.query.await('ALTER TABLE phone_group_invites MODIFY COLUMN sent_at BIGINT NOT NULL')
    end

    -- One-time migration of pending invites from the legacy invites JSON column into phone_group_invites.
    local legacy = MySQL.query.await("SELECT id, invites FROM phone_groups WHERE JSON_LENGTH(invites) > 0") or {}
    for _, row in ipairs(legacy) do
        for _, inv in ipairs(decodeJson(row.invites)) do
            if type(inv) == 'table' and inv.id and inv.target_cid then
                MySQL.insert.await([[
                    INSERT IGNORE INTO phone_group_invites (id, group_id, target_cid, invited_by, invited_name, sent_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                ]], { inv.id, row.id, inv.target_cid, inv.invited_by or '', inv.invited_name, tonumber(inv.sent_at) or os.time() })
            end
        end
        MySQL.update.await("UPDATE phone_groups SET invites = '[]' WHERE id = ?", { row.id })
    end
end

---Reads a single group by id, hydrated; nil if missing. Non-string / empty ids return nil.
---@param id string
---@return { id: string, name: string, leader_cid: string, color: string, members: table[], invites: table[] }|nil
function store.getGroup(id)
    if type(id) ~= 'string' or id == '' then return nil end
    local row = MySQL.single.await(
        'SELECT id, name, leader_cid, color, avatar, members, invites FROM phone_groups WHERE id = ?',
        { id }
    )
    return hydrateRow(row)
end

---Counts how many groups a player currently leads.
---@param leaderCid string
---@return number
function store.countOwnedBy(leaderCid)
    local row = MySQL.single.await(
        'SELECT COUNT(*) AS n FROM phone_groups WHERE leader_cid = ?',
        { leaderCid }
    )
    return row and tonumber(row.n) or 0
end

---List every group containing the given citizenid as a member, newest first.
---@param citizenid string
---@return table[] hydrated groups
function store.listForMember(citizenid)
    local rows = MySQL.query.await([[
        SELECT id, name, leader_cid, color, avatar, members, invites
        FROM phone_groups
        WHERE JSON_SEARCH(members, 'one', ?, NULL, '$[*].citizenid') IS NOT NULL
        ORDER BY created_at DESC
    ]], { citizenid }) or {}

    for i = 1, #rows do rows[i] = hydrateRow(rows[i]) end
    return rows
end

---Returns every pending invite for a citizenid paired with the parent group.
---@param citizenid string
---@return { invite: table, group: table }[]
function store.listInvitesFor(citizenid)
    local rows = MySQL.query.await([[
        SELECT i.id, i.group_id, i.target_cid, i.invited_by, i.invited_name, i.sent_at,
               g.id AS g_id, g.name, g.leader_cid, g.color, g.avatar, g.members, g.invites
        FROM phone_group_invites i
        JOIN phone_groups g ON g.id = i.group_id
        WHERE i.target_cid = ?
    ]], { citizenid }) or {}

    local results = {}
    for k = 1, #rows do
        local r = rows[k]
        results[#results + 1] = {
            invite = {
                id = r.id, group_id = r.group_id, target_cid = r.target_cid,
                invited_by = r.invited_by, invited_name = r.invited_name, sent_at = r.sent_at,
            },
            group = hydrateRow({
                id = r.g_id, name = r.name, leader_cid = r.leader_cid, color = r.color,
                avatar = r.avatar, members = r.members, invites = r.invites,
            }),
        }
    end
    return results
end

---Looks up a single invite by id together with its owning group; non-string / empty ids
---return nil.
---@param inviteId string
---@return { invite: table, group: table }|nil
function store.findInvite(inviteId)
    if type(inviteId) ~= 'string' or inviteId == '' then return nil end
    local inv = MySQL.single.await(
        'SELECT id, group_id, target_cid, invited_by, invited_name, sent_at FROM phone_group_invites WHERE id = ?',
        { inviteId })
    if not inv then return nil end
    local g = store.getGroup(inv.group_id)
    if not g then return nil end
    return { invite = inv, group = g }
end

---Insert a new group row. Caller is responsible for the initial members array (typically
---just the leader).
---@param id string
---@param name string
---@param leaderCid string
---@param color string
---@param members table[]
---@return boolean
function store.insertGroup(id, name, leaderCid, color, members)
    local affected = MySQL.insert.await([[
        INSERT INTO phone_groups (id, name, leader_cid, color, members, invites)
        VALUES (?, ?, ?, ?, ?, '[]')
    ]], { id, name, leaderCid, color, encodeJson(members or {}) })
    return affected ~= nil
end

---Sets (or clears) a group's custom picture URL.
---@param id string
---@param avatar string|nil
---@return boolean
function store.setAvatar(id, avatar)
    local affected = MySQL.update.await(
        'UPDATE phone_groups SET avatar = ? WHERE id = ?',
        { avatar, id }
    )
    return (affected or 0) > 0
end

---Hard-deletes a group and its pending invites.
---@param id string
---@return boolean
function store.deleteGroup(id)
    MySQL.update.await('DELETE FROM phone_group_invites WHERE group_id = ?', { id })
    local affected = MySQL.update.await('DELETE FROM phone_groups WHERE id = ?', { id })
    return (affected or 0) > 0
end

---Persists a hydrated group's member list back to MySQL; whole-column last-write-wins on the
---members JSON.
---@param id string
---@param members table[]
---@return boolean
local function saveMembers(id, members)
    local affected = MySQL.update.await(
        'UPDATE phone_groups SET members = ? WHERE id = ?',
        { encodeJson(members), id }
    )
    return (affected or 0) > 0
end

---Adds a player to a group's member list; returns false if they're already a member.
---@param groupId string
---@param citizenid string
---@param name string
---@return boolean inserted true if a row was actually added
function store.addMember(groupId, citizenid, name)
    local g = store.getGroup(groupId); if not g then return false end
    for i = 1, #g.members do
        if g.members[i].citizenid == citizenid then return false end
    end
    g.members[#g.members + 1] = { citizenid = citizenid, name = name, joined_at = os.time() }
    return saveMembers(groupId, g.members)
end

---Removes a player from a group. Returns true if they were a member.
---@param groupId string
---@param citizenid string
---@return boolean
function store.removeMember(groupId, citizenid)
    local g = store.getGroup(groupId); if not g then return false end
    local filtered = {}
    local removed = false
    for i = 1, #g.members do
        if g.members[i].citizenid ~= citizenid then
            filtered[#filtered + 1] = g.members[i]
        else
            removed = true
        end
    end
    if not removed then return false end
    return saveMembers(groupId, filtered)
end

---Returns true iff the citizenid is currently in the group's members array.
---@param groupId string
---@param citizenid string
---@return boolean
function store.isMember(groupId, citizenid)
    local g = store.getGroup(groupId); if not g then return false end
    for i = 1, #g.members do
        if g.members[i].citizenid == citizenid then return true end
    end
    return false
end

---Member count for a group (0 if the group doesn't exist).
---@param groupId string
---@return number
function store.countMembers(groupId)
    local g = store.getGroup(groupId); if not g then return 0 end
    return #g.members
end

---Adds a pending invite as its own junction row, stamping sent_at server-side.
---@param groupId string
---@param invite { id: string, target_cid: string, invited_by: string, invited_name: string }
---@return boolean
function store.addInvite(groupId, invite)
    invite.sent_at = os.time()
    local affected = MySQL.insert.await([[
        INSERT INTO phone_group_invites (id, group_id, target_cid, invited_by, invited_name, sent_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ]], { invite.id, groupId, invite.target_cid, invite.invited_by, invite.invited_name, invite.sent_at })
    return affected ~= nil
end

---Drops a single invite by its id (PK); idempotent. Non-string / empty ids return false.
---@param inviteId string
---@return boolean removed
function store.removeInvite(inviteId)
    if type(inviteId) ~= 'string' or inviteId == '' then return false end
    local affected = MySQL.update.await('DELETE FROM phone_group_invites WHERE id = ?', { inviteId })
    return (affected or 0) > 0
end

---Returns true iff there's an outstanding invite to `targetCid` on `groupId`.
---@param groupId string
---@param targetCid string
---@return boolean
function store.hasPendingInvite(groupId, targetCid)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_group_invites WHERE group_id = ? AND target_cid = ? LIMIT 1',
        { groupId, targetCid }) ~= nil
end

---Pending-invite count for a group.
---@param groupId string
---@return number
function store.countInvitesForGroup(groupId)
    return MySQL.scalar.await('SELECT COUNT(*) FROM phone_group_invites WHERE group_id = ?', { groupId }) or 0
end

---Counts a player's pending group invites across all groups.
---@param citizenid string
---@return number
function store.pendingInviteCount(citizenid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM phone_group_invites WHERE target_cid = ?', { citizenid }) or 0
end

---Returns the active group id stored for this player (phone_settings row), or nil.
---@param citizenid string
---@return string|nil
function store.getActiveGroupId(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT active_group_id FROM phone_settings WHERE citizenid = ?',
        { citizenid }
    )
    return row and row.active_group_id or nil
end

---Sets (or clears) the active group for a player (upsert); nil/empty clears the selection.
---@param citizenid string
---@param groupId string|nil
---@return boolean
function store.setActiveGroupId(citizenid, groupId)
    if not citizenid or citizenid == '' then return false end
    local affected = MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, active_group_id) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE active_group_id = VALUES(active_group_id)
    ]], { citizenid, groupId })
    return affected ~= nil
end

---Clears the active group for every player who had this group set as active.
---@param groupId string
function store.clearActiveGroupEverywhere(groupId)
    if not groupId or groupId == '' then return end
    MySQL.update.await(
        'UPDATE phone_settings SET active_group_id = NULL WHERE active_group_id = ?',
        { groupId }
    )
end

---Clears the active group for one player only when it's currently set to `groupId`.
---@param citizenid string
---@param groupId string
function store.clearActiveGroupForPlayer(citizenid, groupId)
    if not citizenid or citizenid == '' or not groupId then return end
    MySQL.update.await([[
        UPDATE phone_settings
        SET active_group_id = NULL
        WHERE citizenid = ? AND active_group_id = ?
    ]], { citizenid, groupId })
end

return store
