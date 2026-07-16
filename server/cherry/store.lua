---@type table Store module; the table returned at end of file.
local store = {}

---@type string Alphabet for generated ids (lowercase base-36).
local ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'

---7-char base-36 id, same shape as the messages/contacts ids.
---@return string id
function store.newId()
    local out = {}
    for i = 1, 7 do
        local n = math.random(1, #ID_CHARS)
        out[i] = ID_CHARS:sub(n, n)
    end
    return table.concat(out)
end

---Decodes a JSON column into a table; accepts strings or already-decoded tables and returns {}
---for anything absent or invalid.
---@param value any raw column value
---@return table decoded
function store.decodeJson(value)
    if value == nil then return {} end
    if type(value) == 'table' then return value end
    if type(value) == 'string' then
        local ok, decoded = pcall(json.decode, value)
        if ok and type(decoded) == 'table' then return decoded end
    end
    return {}
end

---Encodes a table for a JSON column; empty or absent tables store NULL. Also exported as
---store.encodeJson.
---@param tbl table|nil source table
---@return string|nil json
local function encodeJson(tbl)
    if not tbl or next(tbl) == nil then return nil end
    return json.encode(tbl)
end

store.encodeJson = encodeJson

---Creates the cherry tables if they don't exist. Runs once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cherry_profiles (
            username    VARCHAR(64)  NOT NULL,
            name        VARCHAR(50)  NOT NULL DEFAULT '',
            age         INT          NOT NULL DEFAULT 21,
            about       VARCHAR(300) NOT NULL DEFAULT '',
            gender      VARCHAR(12)  NOT NULL DEFAULT 'Man',
            interested  VARCHAR(12)  NOT NULL DEFAULT 'Everyone',
            visible     TINYINT(1)   NOT NULL DEFAULT 1,
            photos      JSON         NULL,
            updated_at  BIGINT       NOT NULL DEFAULT 0,
            PRIMARY KEY (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cherry_swipes (
            swiper      VARCHAR(64) NOT NULL,
            target      VARCHAR(64) NOT NULL,
            liked       TINYINT(1)  NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (swiper, target),
            INDEX idx_cherry_swipes_target (target, liked)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cherry_matches (
            id          VARCHAR(16) NOT NULL,
            a           VARCHAR(64) NOT NULL,
            b           VARCHAR(64) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_cherry_pair (a, b)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cherry_blocks (
            blocker     VARCHAR(64) NOT NULL,
            blocked     VARCHAR(64) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (blocker, blocked)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cherry_messages (
            id          VARCHAR(16) NOT NULL,
            match_id    VARCHAR(16) NOT NULL,
            sender      VARCHAR(64) NOT NULL,
            kind        VARCHAR(16) NOT NULL DEFAULT 'text',
            body        TEXT        NULL,
            meta        JSON        NULL,
            reactions   JSON        NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_cherry_msgs_thread (match_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---A profile row by username (nil if none).
---@param username string account username
---@return table|nil row
function store.getProfile(username)
    return MySQL.single.await('SELECT * FROM phone_cherry_profiles WHERE username = ?', { username })
end

---Profiles for many usernames in one query. Returns a username -> row map (missing usernames
---absent). Read-only.
---@param list string[] usernames
---@return table<string, table> username -> profile row
function store.profilesByUsernames(list)
    local out = {}
    if type(list) ~= 'table' then return out end
    local seen, ph, args = {}, {}, {}
    for i = 1, #list do
        local u = list[i]
        if u and u ~= '' and not seen[u] then seen[u] = true; ph[#ph + 1] = '?'; args[#args + 1] = u end
    end
    if #args == 0 then return out end
    local rows = MySQL.query.await(
        ('SELECT * FROM phone_cherry_profiles WHERE username IN (%s)'):format(table.concat(ph, ',')), args) or {}
    for i = 1, #rows do out[rows[i].username] = rows[i] end
    return out
end

---Inserts-or-updates a profile.
---@param username string account username
---@param p table clamped profile fields { name, age, about, gender, interested, visible, photos }
function store.upsertProfile(username, p)
    MySQL.query.await([[
        INSERT INTO phone_cherry_profiles (username, name, age, about, gender, interested, visible, photos, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name), age = VALUES(age), about = VALUES(about),
            gender = VALUES(gender), interested = VALUES(interested),
            visible = VALUES(visible), photos = VALUES(photos), updated_at = VALUES(updated_at)
    ]], {
        username, p.name, p.age, p.about, p.gender, p.interested,
        p.visible and 1 or 0, encodeJson(p.photos), os.time(),
    })
end

---Every visible profile except the viewer's own and anyone they've already swiped on, matched
---with, or blocked in either direction.
---@param username string viewer's username
---@param limit integer max rows (server-side constant)
---@return table[] rows profile rows
function store.deckCandidates(username, limit)
    return MySQL.query.await(([[
        SELECT p.* FROM phone_cherry_profiles p
        WHERE p.username <> ?
          AND p.visible = 1
          AND NOT EXISTS (SELECT 1 FROM phone_cherry_swipes s WHERE s.swiper = ? AND s.target = p.username)
          AND NOT EXISTS (
              SELECT 1 FROM phone_cherry_matches m
              WHERE (m.a = ? AND m.b = p.username) OR (m.b = ? AND m.a = p.username)
          )
          AND NOT EXISTS (
              SELECT 1 FROM phone_cherry_blocks b
              WHERE (b.blocker = ? AND b.blocked = p.username) OR (b.blocked = ? AND b.blocker = p.username)
          )
        ORDER BY p.updated_at DESC
        LIMIT %d
    ]]):format(math.floor(tonumber(limit) or 30)), { username, username, username, username, username, username }) or {}
end

---Like deckCandidates, but ignoring the viewer's swipes.
---@param username string viewer's username
---@param limit integer max rows (server-side constant)
---@return table[] rows profile rows
function store.potentialCandidates(username, limit)
    return MySQL.query.await(([[
        SELECT p.* FROM phone_cherry_profiles p
        WHERE p.username <> ?
          AND p.visible = 1
          AND NOT EXISTS (
              SELECT 1 FROM phone_cherry_matches m
              WHERE (m.a = ? AND m.b = p.username) OR (m.b = ? AND m.a = p.username)
          )
          AND NOT EXISTS (
              SELECT 1 FROM phone_cherry_blocks b
              WHERE (b.blocker = ? AND b.blocked = p.username) OR (b.blocked = ? AND b.blocker = p.username)
          )
        LIMIT %d
    ]]):format(math.floor(tonumber(limit) or 50)), { username, username, username, username, username }) or {}
end

---True when either side has blocked the other.
---@param x string username
---@param y string username
---@return boolean blocked
function store.isBlocked(x, y)
    return MySQL.scalar.await([[
        SELECT 1 FROM phone_cherry_blocks
        WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)
        LIMIT 1
    ]], { x, y, y, x }) ~= nil
end

---Everyone `blocker` has blocked, joined with their profile card fields.
---@param blocker string blocker's username
---@return table[] rows { username, name, age, photos }
function store.blockedBy(blocker)
    return MySQL.query.await([[
        SELECT b.blocked AS username, p.name, p.age, p.photos
        FROM phone_cherry_blocks b
        LEFT JOIN phone_cherry_profiles p ON p.username = b.blocked
        WHERE b.blocker = ?
        ORDER BY b.created_at DESC
    ]], { blocker }) or {}
end

---Removes one block row, scoped to the blocker.
---@param blocker string blocker's username
---@param blocked string blocked username
function store.removeBlock(blocker, blocked)
    MySQL.update.await('DELETE FROM phone_cherry_blocks WHERE blocker = ? AND blocked = ?', { blocker, blocked })
end

---Adds a block row. Idempotent (INSERT IGNORE).
---@param blocker string blocker's username
---@param blocked string blocked username
function store.addBlock(blocker, blocked)
    MySQL.query.await(
        'INSERT IGNORE INTO phone_cherry_blocks (blocker, blocked, created_at) VALUES (?, ?, ?)',
        { blocker, blocked, os.time() }
    )
end

---Forgets the pair's swipes on each other.
---@param x string username
---@param y string username
function store.clearPairSwipes(x, y)
    MySQL.update.await(
        'DELETE FROM phone_cherry_swipes WHERE (swiper = ? AND target = ?) OR (swiper = ? AND target = ?)',
        { x, y, y, x }
    )
end

---Records (or overwrites) a swipe.
---@param swiper string swiper's username
---@param target string swiped profile's username
---@param liked boolean like (true) or nope (false)
function store.recordSwipe(swiper, target, liked)
    MySQL.query.await([[
        INSERT INTO phone_cherry_swipes (swiper, target, liked, created_at)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE liked = VALUES(liked), created_at = VALUES(created_at)
    ]], { swiper, target, liked and 1 or 0, os.time() })
end

---True if `swiper` has a live like on `target`.
---@param swiper string the side whose like is being checked
---@param target string the side being liked
---@return boolean liked
function store.hasLiked(swiper, target)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_cherry_swipes WHERE swiper = ? AND target = ? AND liked = 1',
        { swiper, target }
    ) ~= nil
end

---Drops one specific swipe.
---@param swiper string swiper's username
---@param target string swiped profile's username
function store.deleteSwipe(swiper, target)
    MySQL.update.await('DELETE FROM phone_cherry_swipes WHERE swiper = ? AND target = ?', { swiper, target })
end

---The match row (id only) between two users, if any; the pair is normalized before lookup.
---@param x string username
---@param y string username
---@return table|nil row { id }
function store.matchBetween(x, y)
    local a, b = x, y
    if b < a then a, b = b, a end
    return MySQL.single.await('SELECT id FROM phone_cherry_matches WHERE a = ? AND b = ?', { a, b })
end

---Clears every swipe by this user. Matches persist.
---@param swiper string swiper's username
function store.clearSwipes(swiper)
    MySQL.update.await('DELETE FROM phone_cherry_swipes WHERE swiper = ?', { swiper })
end

---Normalizes the pair into sorted order (a < b).
---@param x string username
---@param y string username
---@return string a, string b sorted pair (a < b)
local function pairOf(x, y)
    if x < y then return x, y end
    return y, x
end

---Creates the pair's match idempotently; a pair that already matched keeps its existing row,
---whose id is re-read and returned.
---@param x string username
---@param y string username
---@return string id match id (the existing one when the pair already matched)
function store.createMatch(x, y)
    local a, b = pairOf(x, y)
    local id = store.newId()
    MySQL.query.await([[
        INSERT IGNORE INTO phone_cherry_matches (id, a, b, created_at) VALUES (?, ?, ?, ?)
    ]], { id, a, b, os.time() })
    local row = MySQL.single.await('SELECT id FROM phone_cherry_matches WHERE a = ? AND b = ?', { a, b })
    return row and row.id or id
end

---A match row by id.
---@param id string match id
---@return table|nil row
function store.getMatch(id)
    return MySQL.single.await('SELECT * FROM phone_cherry_matches WHERE id = ?', { id })
end

---Delete a match and its whole thread, for both sides.
---@param id string match id
function store.deleteMatch(id)
    MySQL.update.await('DELETE FROM phone_cherry_messages WHERE match_id = ?', { id })
    MySQL.update.await('DELETE FROM phone_cherry_matches WHERE id = ?', { id })
end

---All of a user's matches, newest activity first: ordered by each thread's newest message time,
---falling back to the match creation time for messageless matches.
---@param username string viewer's username
---@return table[] rows match rows (+ last_at)
function store.matchesFor(username)
    local rows = MySQL.query.await([[
        SELECT m.id, m.a, m.b, m.created_at,
               (SELECT MAX(c.created_at) FROM phone_cherry_messages c WHERE c.match_id = m.id) AS last_at
        FROM phone_cherry_matches m
        WHERE m.a = ? OR m.b = ?
        ORDER BY COALESCE(last_at, m.created_at) DESC
    ]], { username, username }) or {}
    return rows
end

---The newest message of a thread (nil when empty).
---@param matchId string match id
---@return table|nil row
function store.lastMessage(matchId)
    return MySQL.single.await(
        'SELECT * FROM phone_cherry_messages WHERE match_id = ? ORDER BY created_at DESC LIMIT 1',
        { matchId }
    )
end

---Inserts one chat message row.
---@param id string message id
---@param matchId string match id
---@param sender string sender's username
---@param kind string whitelisted message kind
---@param body string trimmed body
---@param meta table sanitized meta (stored as JSON, NULL when empty)
---@param createdAt integer unix seconds
function store.insertMessage(id, matchId, sender, kind, body, meta, createdAt)
    MySQL.insert.await([[
        INSERT INTO phone_cherry_messages (id, match_id, sender, kind, body, meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ]], { id, matchId, sender, kind, body, encodeJson(meta), createdAt })
end

---Newest `limit` messages of a thread, returned oldest-first.
---@param matchId string match id
---@param limit integer max rows (server-side constant)
---@return table[] rows oldest-first
function store.threadMessages(matchId, limit)
    local n = math.floor(tonumber(limit) or 100)
    if n < 1 then n = 1 end
    local rows = MySQL.query.await(([[
        SELECT * FROM phone_cherry_messages
        WHERE match_id = ?
        ORDER BY created_at DESC
        LIMIT %d
    ]]):format(n), { matchId }) or {}
    local out, len = {}, #rows
    for i = len, 1, -1 do out[len - i + 1] = rows[i] end
    return out
end

---A message row by id.
---@param id string message id
---@return table|nil row
function store.getMessage(id)
    return MySQL.single.await('SELECT * FROM phone_cherry_messages WHERE id = ?', { id })
end

---Overwrite a message's reactions JSON (emoji -> usernames map; NULL once the last reaction is
---removed).
---@param id string message id
---@param reactions table emoji -> username[] map
function store.updateReactions(id, reactions)
    MySQL.update.await('UPDATE phone_cherry_messages SET reactions = ? WHERE id = ?', { encodeJson(reactions), id })
end

---Deletes everything but a thread's newest `keep` rows.
---@param matchId string match id
---@param keep integer rows to retain
function store.pruneThread(matchId, keep)
    local n = math.floor(tonumber(keep) or 200)
    MySQL.update.await(([[
        DELETE FROM phone_cherry_messages
        WHERE match_id = ? AND id NOT IN (
            SELECT id FROM (
                SELECT id FROM phone_cherry_messages
                WHERE match_id = ? ORDER BY created_at DESC LIMIT %d
            ) AS keep_rows
        )
    ]]):format(n), { matchId, matchId })
end

---Removes every trace of a user: their match threads, matches, swipes (both directions), blocks
---(both directions) and profile.
---@param username string account username
function store.wipeUser(username)
    local matches = MySQL.query.await(
        'SELECT id FROM phone_cherry_matches WHERE a = ? OR b = ?', { username, username }) or {}
    for _, m in ipairs(matches) do
        MySQL.update.await('DELETE FROM phone_cherry_messages WHERE match_id = ?', { m.id })
    end
    MySQL.update.await('DELETE FROM phone_cherry_matches WHERE a = ? OR b = ?', { username, username })
    MySQL.update.await('DELETE FROM phone_cherry_swipes WHERE swiper = ? OR target = ?', { username, username })
    MySQL.update.await('DELETE FROM phone_cherry_blocks WHERE blocker = ? OR blocked = ?', { username, username })
    MySQL.update.await('DELETE FROM phone_cherry_profiles WHERE username = ?', { username })
end

return store
