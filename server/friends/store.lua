---@type table Store module; the table returned at end of file.
local store = {}

---Creates the phone_friends table if it doesn't exist and back-fills the `pending` column. Each
---row is one directed edge: `owner` added `friend`; `share` = owner broadcasts to friend.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_friends` (
            `owner`      VARCHAR(60) NOT NULL,
            `friend`     VARCHAR(60) NOT NULL,
            `share`      TINYINT(1)  NOT NULL DEFAULT 1,
            `pending`    TINYINT(1)  NOT NULL DEFAULT 0,
            `created_at` VARCHAR(40) NOT NULL,
            PRIMARY KEY (`owner`, `friend`),
            INDEX idx_phone_friends_friend (`friend`, `share`, `pending`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    local pcol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'phone_friends'
          AND column_name = 'pending'
    ]])
    if not pcol or tonumber(pcol.n) == 0 then
        MySQL.query.await('ALTER TABLE `phone_friends` ADD COLUMN pending TINYINT(1) NOT NULL DEFAULT 0')
    end

    local fidx = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = 'phone_friends'
          AND index_name = 'idx_phone_friends_friend'
    ]])
    if not fidx or tonumber(fidx.n) == 0 then
        MySQL.query.await('ALTER TABLE `phone_friends` ADD INDEX idx_phone_friends_friend (`friend`, `share`, `pending`)')
    end
end

---Edges the owner has added: `{ { friend = cid, share = 0|1, pending = 0|1 }, ... }`.
---Caller normalises the TINYINT flags. Read-only.
---@param owner string owner citizenid
---@return table[] rows
function store.friendsOf(owner)
    return MySQL.query.await('SELECT friend, share, pending FROM `phone_friends` WHERE owner = ?', { owner }) or {}
end

---Set of citizenids currently sharing their location WITH `cid` (reverse edges with share = 1,
---pending excluded). Read-only.
---@param cid string citizenid
---@return table<string, boolean> set of sharer citizenids
function store.sharersOf(cid)
    local rows = MySQL.query.await('SELECT owner FROM `phone_friends` WHERE friend = ? AND share = 1 AND pending = 0', { cid }) or {}
    local set = {}
    for i = 1, #rows do set[rows[i].owner] = true end
    return set
end

---Whether the owner already holds a directed edge to `friend` (pending or accepted). Read-only.
---@param owner string owner citizenid
---@param friend string friend citizenid
---@return boolean exists
function store.exists(owner, friend)
    return MySQL.scalar.await('SELECT 1 FROM `phone_friends` WHERE owner = ? AND friend = ?', { owner, friend }) ~= nil
end

---Citizenids with a share request awaiting `cid`'s answer (reverse edges still pending) -
---surfaced in the Maps roster as incoming requests. Read-only.
---@param cid string citizenid
---@return string[] requester citizenids
function store.requestsFor(cid)
    local rows = MySQL.query.await('SELECT owner FROM `phone_friends` WHERE friend = ? AND pending = 1', { cid }) or {}
    local out = {}
    for i = 1, #rows do out[i] = rows[i].owner end
    return out
end

---One directed edge, or nil: `{ share = 0|1, pending = 0|1 }`. Caller normalises the flags.
---Read-only.
---@param owner string owner citizenid
---@param friend string friend citizenid
---@return table|nil edge row
function store.edge(owner, friend)
    return MySQL.single.await('SELECT share, pending FROM `phone_friends` WHERE owner = ? AND friend = ?', { owner, friend })
end

---How many edges the owner holds (pending requests count toward the MaxFriends cap). Read-only.
---@param owner string owner citizenid
---@return integer count
function store.count(owner)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `phone_friends` WHERE owner = ?', { owner }) or 0
end

---Inserts a directed edge with sharing on (upsert on the (owner, friend) primary key).
---@param owner string owner citizenid
---@param friend string friend citizenid
---@param createdAt string ISO-8601 creation stamp
---@param pending boolean whether the edge starts as an unaccepted request
function store.add(owner, friend, createdAt, pending)
    MySQL.query.await([[
        INSERT INTO `phone_friends` (owner, friend, share, pending, created_at)
        VALUES (?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE share = 1, pending = VALUES(pending)
    ]], { owner, friend, pending and 1 or 0, createdAt })
end

---Accepts the requester's share request: the requester's edge goes live and the target gains a
---reverse edge via the store.add upsert.
---@param requester string requesting citizenid (their edge flips live)
---@param target string accepting citizenid (gains the reverse edge)
---@param createdAt string ISO-8601 creation stamp for the reverse edge
function store.accept(requester, target, createdAt)
    MySQL.update.await('UPDATE `phone_friends` SET pending = 0 WHERE owner = ? AND friend = ?', { requester, target })
    store.add(target, requester, createdAt, false)
end

---Deletes the owner's directed edge to `friend`; a no-op when the edge doesn't exist.
---@param owner string owner citizenid
---@param friend string friend citizenid
function store.remove(owner, friend)
    MySQL.query.await('DELETE FROM `phone_friends` WHERE owner = ? AND friend = ?', { owner, friend })
end

---Flips whether `owner` broadcasts their location to `friend`; a no-op when the edge doesn't
---exist.
---@param owner string owner citizenid
---@param friend string friend citizenid
---@param share boolean broadcast on/off
function store.setShare(owner, friend, share)
    MySQL.query.await('UPDATE `phone_friends` SET share = ? WHERE owner = ? AND friend = ?',
        { share and 1 or 0, owner, friend })
end

return store
