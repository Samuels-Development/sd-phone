---@type table Store module; the table returned at end of file.
local store = {}

local util = require 'server.util'
local isTruthy = util.truthy
local function newId() return util.newId(9) end

store.newId = newId

-- Server-side pepper folded into every password hash.
---@type string Static hash pepper; changing it invalidates every stored Birdy-side hash.
local PEPPER = 'sd-phone-v1::birdy::do-not-leak-this-string'

---Hashes a password into a stable 24-char hex digest. Also registered with the accounts engine
---as Birdy's legacy hasher.
---@param password string
---@return string
function store.hashPassword(password)
    local input = password .. PEPPER
    local h1, h2, h3 = 0x12345678, 0x87654321, 0xABCDEF01
    for i = 1, #input do
        local b = input:byte(i)
        h1 = (h1 * 31 + b) & 0xFFFFFFFF
        h2 = ((h2 ~ ((b << (i % 8)) & 0xFFFFFFFF)) + 0x9E3779B9) & 0xFFFFFFFF
        h3 = (((h3 << 5) | (h3 >> 27)) + b * (h1 + 1)) & 0xFFFFFFFF
    end
    return ('%08x%08x%08x'):format(h1, h2, h3)
end

---Creates every Birdy table idempotently and back-fills columns added after first release. Runs
---once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_profiles (
            citizenid    VARCHAR(64)  NOT NULL,
            handle       VARCHAR(32)  NOT NULL,
            display_name VARCHAR(64)  NOT NULL,
            password     VARCHAR(64)  NOT NULL DEFAULT '',
            bio          VARCHAR(200) NOT NULL DEFAULT '',
            verified     TINYINT(1)   NOT NULL DEFAULT 0,
            logged_in    TINYINT(1)   NOT NULL DEFAULT 0,
            join_label   VARCHAR(32)  NOT NULL DEFAULT '',
            protected    TINYINT(1)   NOT NULL DEFAULT 0,
            created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid),
            UNIQUE KEY uq_phone_birdy_handle (handle)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_posts (
            id         VARCHAR(16) NOT NULL,
            author_cid VARCHAR(64) NOT NULL,
            body       TEXT        NOT NULL,
            parent_id  VARCHAR(16) NULL,
            images     TEXT        NULL,
            views      INT         NOT NULL DEFAULT 0,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_birdy_posts_author  (author_cid),
            INDEX idx_birdy_posts_parent  (parent_id),
            INDEX idx_birdy_posts_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_likes (
            post_id    VARCHAR(16) NOT NULL,
            citizenid  VARCHAR(64) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, citizenid),
            INDEX idx_birdy_likes_post (post_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Mirrors phone_birdy_likes; the composite PK makes reposts idempotent.
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_reposts (
            post_id    VARCHAR(16) NOT NULL,
            citizenid  VARCHAR(64) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, citizenid),
            INDEX idx_birdy_reposts_post (post_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_follows (
            follower_cid VARCHAR(64) NOT NULL,
            target_cid   VARCHAR(64) NOT NULL,
            created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follower_cid, target_cid),
            INDEX idx_birdy_follows_target (target_cid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_dms (
            id         VARCHAR(16) NOT NULL,
            from_cid   VARCHAR(64) NOT NULL,
            to_cid     VARCHAR(64) NOT NULL,
            body       TEXT        NOT NULL,
            kind       VARCHAR(16) NOT NULL DEFAULT 'text',
            meta       TEXT        NULL,
            reactions  TEXT        NULL,
            read_flag  TINYINT(1)  NOT NULL DEFAULT 0,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_birdy_dms_from (from_cid),
            INDEX idx_birdy_dms_to   (to_cid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_notifications (
            id            VARCHAR(16) NOT NULL,
            recipient_cid VARCHAR(64) NOT NULL,
            kind          VARCHAR(16) NOT NULL,
            actor_cid     VARCHAR(64) NOT NULL,
            post_id       VARCHAR(16) NULL,
            seen          TINYINT(1)  NOT NULL DEFAULT 0,
            created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_birdy_notifs_recipient (recipient_cid, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    ---@return boolean added true when the column was missing and has just been created
    local function ensureColumn(tbl, name, ddl)
        local present = MySQL.scalar.await([[
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
        ]], { tbl, name })
        if (tonumber(present) or 0) == 0 then
            MySQL.query.await(('ALTER TABLE %s ADD COLUMN %s'):format(tbl, ddl))
            return true
        end
        return false
    end
    ensureColumn('phone_birdy_profiles', 'password',   "password VARCHAR(64) NOT NULL DEFAULT ''")
    ensureColumn('phone_birdy_profiles', 'bio',        "bio VARCHAR(200) NOT NULL DEFAULT ''")
    ensureColumn('phone_birdy_profiles', 'logged_in',  'logged_in TINYINT(1) NOT NULL DEFAULT 0')
    ensureColumn('phone_birdy_profiles', 'join_label', "join_label VARCHAR(32) NOT NULL DEFAULT ''")
    ensureColumn('phone_birdy_profiles', 'protected',  'protected TINYINT(1) NOT NULL DEFAULT 0')
    ensureColumn('phone_birdy_posts',    'images',     'images TEXT NULL')
    ensureColumn('phone_birdy_dms',      'kind',       "kind VARCHAR(16) NOT NULL DEFAULT 'text'")
    ensureColumn('phone_birdy_dms',      'meta',       'meta TEXT NULL')
    ensureColumn('phone_birdy_dms',      'reactions',  'reactions TEXT NULL')
    ensureColumn('phone_birdy_profiles', 'avatar',     'avatar VARCHAR(512) NULL')
    ensureColumn('phone_birdy_profiles', 'banner',     'banner VARCHAR(512) NULL')

    -- Backfill history as already-seen, or every existing row would count as unread.
    if ensureColumn('phone_birdy_notifications', 'seen', 'seen TINYINT(1) NOT NULL DEFAULT 0') then
        MySQL.update.await('UPDATE phone_birdy_notifications SET seen = 1')
    end
    util.ensureIndex('phone_birdy_notifications', 'idx_birdy_notifs_unseen', '(recipient_cid, seen)')
end

---Decodes a JSON column into a Lua table, tolerating nil / empty / corrupt values (always
---returns a table).
---@param value any
---@return table
function store.decodeJson(value)
    if value == nil then return {} end
    if type(value) == 'table' then return value end
    if type(value) == 'string' and value ~= '' then
        local ok, decoded = pcall(json.decode, value)
        if ok and type(decoded) == 'table' then return decoded end
    end
    return {}
end

---Reshapes a raw profile row, normalising every TINYINT flag to a boolean.
---@param row table|nil
---@return { citizenid: string, handle: string, displayName: string, verified: boolean }|nil
local function hydrateProfile(row)
    if not row then return nil end
    return {
        citizenid   = row.citizenid,
        handle      = row.handle,
        displayName = row.display_name,
        password    = row.password,
        bio         = row.bio,
        verified    = isTruthy(row.verified),
        loggedIn    = isTruthy(row.logged_in),
        joinLabel   = row.join_label,
        avatar      = row.avatar,
        banner      = row.banner,
        -- Authoritative signup time; joinLabel is a legacy fallback.
        createdTs   = tonumber(row.created_ts),
        protected   = isTruthy(row.protected),
    }
end

---A profile by its owning citizenid, or nil.
---@param citizenid string
---@return table|nil
function store.getProfile(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT citizenid, handle, display_name, password, bio, verified, logged_in, join_label, protected, avatar, banner, UNIX_TIMESTAMP(created_at) AS created_ts FROM phone_birdy_profiles WHERE citizenid = ?',
        { citizenid }
    )
    return hydrateProfile(row)
end

---Looks up a profile by its unique handle.
---@param handle string
---@return table|nil
function store.getProfileByHandle(handle)
    return hydrateProfile(MySQL.single.await(
        'SELECT citizenid, handle, display_name, password, bio, verified, logged_in, join_label, protected, avatar, banner, UNIX_TIMESTAMP(created_at) AS created_ts FROM phone_birdy_profiles WHERE handle = ?',
        { handle }
    ))
end

---Searches accounts by handle or display name (substring), excluding the viewer.
---@param query string
---@param viewerCid string
---@param limit number
---@return table[] {citizenid, handle, displayName, verified}
function store.searchProfiles(query, viewerCid, limit)
    local like = '%' .. query .. '%'
    local rows = MySQL.query.await([[
        SELECT citizenid, handle, display_name, verified, avatar FROM phone_birdy_profiles
        WHERE (handle LIKE ? OR display_name LIKE ?) AND citizenid <> ?
        ORDER BY created_at DESC LIMIT ?
    ]], { like, like, viewerCid or '', limit }) or {}
    local out = {}
    for i = 1, #rows do
        local r = rows[i]
        out[i] = { citizenid = r.citizenid, handle = r.handle, displayName = r.display_name, verified = isTruthy(r.verified), avatar = r.avatar }
    end
    return out
end

---Creates a fresh, signed-in profile row for a citizenid; a duplicate handle fails the UNIQUE
---key and returns false.
---@param citizenid string
---@param handle string
---@param displayName string
---@param passwordHash string
---@param bio string
---@param verified boolean
---@param joinLabel string
---@return boolean
function store.insertAccount(citizenid, handle, displayName, passwordHash, bio, verified, joinLabel)
    return MySQL.insert.await([[
        INSERT INTO phone_birdy_profiles (citizenid, handle, display_name, password, bio, verified, logged_in, join_label)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ]], { citizenid, handle, displayName, passwordHash, bio, verified and 1 or 0, joinLabel or '' }) ~= nil
end

---Updates the editable profile fields (name, bio, join label, protected).
---@param citizenid string
---@param displayName string
---@param bio string
---@param joinLabel string
---@param protected boolean
function store.updateProfileFields(citizenid, displayName, bio, joinLabel, protected, avatar, banner)
    MySQL.update.await([[
        UPDATE phone_birdy_profiles
        SET display_name = ?, bio = ?, join_label = ?, protected = ?, avatar = ?, banner = ?
        WHERE citizenid = ?
    ]], { displayName, bio, joinLabel, protected and 1 or 0, avatar, banner, citizenid })
end

---Replace a citizenid's legacy profile-row password hash (kept in sync with the engine hash).
---@param citizenid string
---@param passwordHash string
function store.setPassword(citizenid, passwordHash)
    MySQL.update.await('UPDATE phone_birdy_profiles SET password = ? WHERE citizenid = ?', { passwordHash, citizenid })
end

---@param citizenid string
---@return number following count
function store.countFollowing(citizenid)
    return tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM phone_birdy_follows WHERE follower_cid = ?', { citizenid })) or 0
end

---@param citizenid string
---@return number follower count
function store.countFollowers(citizenid)
    return tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM phone_birdy_follows WHERE target_cid = ?', { citizenid })) or 0
end

---Reshapes a joined POST_SELECT row into the hydrated post table. `images` decodes from a JSON
---array string to a Lua array, falling back to nil.
---@param row table|nil
---@return table|nil
local function hydratePost(row)
    if not row then return nil end
    local images = nil
    if type(row.images) == 'string' and row.images ~= '' then
        local okj, decoded = pcall(json.decode, row.images)
        if okj and type(decoded) == 'table' and #decoded > 0 then images = decoded end
    end
    return {
        id          = row.id,
        authorCid   = row.author_cid,
        handle      = row.handle,
        displayName = row.display_name,
        verified    = isTruthy(row.verified),
        avatar      = row.avatar,
        body        = row.body,
        parentId    = row.parent_id,
        images      = images,
        views       = tonumber(row.views) or 0,
        createdMs   = (tonumber(row.created_s) or 0) * 1000,
        replies     = tonumber(row.reply_count) or 0,
        likes       = tonumber(row.like_count) or 0,
        liked       = (tonumber(row.liked) or 0) > 0,
        reposts     = tonumber(row.repost_count) or 0,
        reposted    = (tonumber(row.reposted) or 0) > 0,
    }
end

---@type string SELECT prefix producing hydratePost-shaped rows. The viewer cid is params #1 AND
---#2 (the `liked` and `reposted` flags), so every caller must pass it twice, ahead of its own
---parameters.
local POST_SELECT = [[
    SELECT
        p.id, p.author_cid, p.body, p.parent_id, p.images, p.views,
        UNIX_TIMESTAMP(p.created_at) AS created_s,
        pr.handle, pr.display_name, pr.verified, pr.avatar,
        (SELECT COUNT(*) FROM phone_birdy_likes l  WHERE l.post_id   = p.id) AS like_count,
        (SELECT COUNT(*) FROM phone_birdy_posts r  WHERE r.parent_id = p.id) AS reply_count,
        (SELECT COUNT(*) FROM phone_birdy_reposts rp WHERE rp.post_id = p.id) AS repost_count,
        (SELECT COUNT(*) FROM phone_birdy_likes lv WHERE lv.post_id  = p.id AND lv.citizenid = ?) AS liked,
        (SELECT COUNT(*) FROM phone_birdy_reposts rv WHERE rv.post_id = p.id AND rv.citizenid = ?) AS reposted
    FROM phone_birdy_posts p
    JOIN phone_birdy_profiles pr ON pr.citizenid = p.author_cid
]]

---Lists a single author's posts for a profile tab, newest first. 'replies' = posts with a
---parent; 'media' = any post carrying images; anything else = top-level only.
---@param authorCid string
---@param kind string
---@param viewerCid string
---@param limit number
---@return table[]
function store.listPostsBy(authorCid, kind, viewerCid, limit)
    local clause
    if kind == 'replies' then
        clause = 'p.parent_id IS NOT NULL'
    elseif kind == 'media' then
        clause = "p.images IS NOT NULL AND p.images <> ''"
    else
        clause = 'p.parent_id IS NULL'
    end
    local rows = MySQL.query.await(
        POST_SELECT .. (' WHERE p.author_cid = ? AND %s ORDER BY p.created_at DESC LIMIT ?'):format(clause),
        { viewerCid, viewerCid, authorCid, limit }
    ) or {}
    for i = 1, #rows do rows[i] = hydratePost(rows[i]) end
    return rows
end

---List posts a citizenid has liked, most-recently-liked first.
---@param likerCid string
---@param viewerCid string
---@param limit number
---@return table[]
function store.listLikedBy(likerCid, viewerCid, limit)
    local rows = MySQL.query.await(
        POST_SELECT .. [[
            JOIN phone_birdy_likes lk ON lk.post_id = p.id AND lk.citizenid = ?
            ORDER BY lk.created_at DESC LIMIT ?
        ]],
        { viewerCid, viewerCid, likerCid, limit }
    ) or {}
    for i = 1, #rows do rows[i] = hydratePost(rows[i]) end
    return rows
end

---Deletes an account and every row it owns or references: likes and reposts (its own, and
---others' on its posts), posts, follows, DMs, notifications, then the profile row.
---@param citizenid string
function store.deleteAccount(citizenid)
    MySQL.update.await('DELETE FROM phone_birdy_likes WHERE citizenid = ?', { citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_likes WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author_cid = ?)', { citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_reposts WHERE citizenid = ?', { citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_reposts WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author_cid = ?)', { citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_posts WHERE author_cid = ?', { citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_follows WHERE follower_cid = ? OR target_cid = ?', { citizenid, citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_dms WHERE from_cid = ? OR to_cid = ?', { citizenid, citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_notifications WHERE recipient_cid = ? OR actor_cid = ?', { citizenid, citizenid })
    MySQL.update.await('DELETE FROM phone_birdy_profiles WHERE citizenid = ?', { citizenid })
end

---Overwrites an existing profile's editable fields and signs it in.
---@param citizenid string
---@param handle string
---@param displayName string
---@param passwordHash string
---@param bio string
function store.updateAccount(citizenid, handle, displayName, passwordHash, bio)
    MySQL.update.await([[
        UPDATE phone_birdy_profiles
        SET handle = ?, display_name = ?, password = ?, bio = ?, logged_in = 1
        WHERE citizenid = ?
    ]], { handle, displayName, passwordHash, bio, citizenid })
end

---Flips a citizenid's informational signed-in flag.
---@param citizenid string
---@param value boolean
function store.setLoggedIn(citizenid, value)
    MySQL.update.await(
        'UPDATE phone_birdy_profiles SET logged_in = ? WHERE citizenid = ?',
        { value and 1 or 0, citizenid }
    )
end

---Batch-loads profiles keyed by citizenid.
---@param cids string[]
---@return table<string, table>
function store.getProfilesByCids(cids)
    local out = {}
    if not cids or #cids == 0 then return out end
    local marks = {}
    for i = 1, #cids do marks[i] = '?' end
    local rows = MySQL.query.await(
        ('SELECT citizenid, handle, display_name, verified, avatar FROM phone_birdy_profiles WHERE citizenid IN (%s)')
            :format(table.concat(marks, ',')),
        cids
    ) or {}
    for i = 1, #rows do
        local p = hydrateProfile(rows[i])
        if p then out[p.citizenid] = p end
    end
    return out
end

---A single post by id, hydrated for `viewerCid`'s liked flag.
---@param id string
---@param viewerCid string
---@return table|nil
function store.getPost(id, viewerCid)
    return hydratePost(MySQL.single.await(
        POST_SELECT .. ' WHERE p.id = ? LIMIT 1', { viewerCid, viewerCid, id }
    ))
end

---Hydrated posts for many ids in one query. Returns an id -> hydrated post map (missing ids
---absent). Read-only.
---@param ids string[] post ids
---@param viewerCid string viewer citizenid (for the liked flag)
---@return table<string, table> id -> hydrated post
function store.postsByIds(ids, viewerCid)
    local out = {}
    if type(ids) ~= 'table' or #ids == 0 then return out end
    local seen, list = {}, {}
    for i = 1, #ids do
        local id = ids[i]
        if id and id ~= '' and not seen[id] then seen[id] = true; list[#list + 1] = id end
    end
    if #list == 0 then return out end
    local marks = {}
    for i = 1, #list do marks[i] = '?' end
    local params = { viewerCid, viewerCid }
    for i = 1, #list do params[#params + 1] = list[i] end
    local rows = MySQL.query.await(
        POST_SELECT .. (' WHERE p.id IN (%s)'):format(table.concat(marks, ',')), params) or {}
    for i = 1, #rows do
        local post = hydratePost(rows[i])
        if post then out[rows[i].id] = post end
    end
    return out
end

---Lists top-level posts newest-first, optionally limited to accounts the viewer follows.
---@param viewerCid string
---@param limit number
---@param onlyFollowing boolean
---@return table[]
function store.listFeed(viewerCid, limit, onlyFollowing)
    local rows
    if onlyFollowing then
        rows = MySQL.query.await(POST_SELECT .. [[
            WHERE p.parent_id IS NULL
              AND p.author_cid IN (SELECT target_cid FROM phone_birdy_follows WHERE follower_cid = ?)
            ORDER BY p.created_at DESC LIMIT ?
        ]], { viewerCid, viewerCid, viewerCid, limit }) or {}
    else
        -- Protected authors are visible only to themselves and their followers.
        rows = MySQL.query.await(POST_SELECT .. [[
            WHERE p.parent_id IS NULL
              AND (pr.protected = 0 OR p.author_cid = ?
                   OR p.author_cid IN (SELECT target_cid FROM phone_birdy_follows WHERE follower_cid = ?))
            ORDER BY p.created_at DESC LIMIT ?
        ]], { viewerCid, viewerCid, viewerCid, viewerCid, limit }) or {}
    end
    for i = 1, #rows do rows[i] = hydratePost(rows[i]) end
    return rows
end

---@param parentId string
---@param viewerCid string
---@return table[] replies oldest-first
function store.listReplies(parentId, viewerCid)
    local rows = MySQL.query.await(
        POST_SELECT .. ' WHERE p.parent_id = ? ORDER BY p.created_at ASC',
        { viewerCid, viewerCid, parentId }
    ) or {}
    for i = 1, #rows do rows[i] = hydratePost(rows[i]) end
    return rows
end

---Inserts a post row.
---@param id string
---@param authorCid string
---@param body string
---@param parentId string|nil
---@param images string[]|nil up to 3 image URLs, stored as a JSON array
---@return boolean
function store.insertPost(id, authorCid, body, parentId, images)
    local imagesJson = (type(images) == 'table' and #images > 0) and json.encode(images) or nil
    return MySQL.insert.await([[
        INSERT INTO phone_birdy_posts (id, author_cid, body, parent_id, images) VALUES (?, ?, ?, ?, ?)
    ]], { id, authorCid, body, parentId, imagesJson }) ~= nil
end

---Increments a post's view count, but never for the author's own views.
---@param id string
---@param viewerCid string
function store.bumpViews(id, viewerCid)
    MySQL.update.await(
        'UPDATE phone_birdy_posts SET views = views + 1 WHERE id = ? AND author_cid <> ?',
        { id, viewerCid }
    )
end

---@param id string
---@return string|nil author citizenid
function store.getPostAuthor(id)
    return MySQL.scalar.await('SELECT author_cid FROM phone_birdy_posts WHERE id = ?', { id })
end

---Adds a like. INSERT IGNORE makes replays a no-op.
---@param postId string
---@param cid string
function store.addLike(postId, cid)
    MySQL.insert.await('INSERT IGNORE INTO phone_birdy_likes (post_id, citizenid) VALUES (?, ?)', { postId, cid })
end

---@param postId string
---@param cid string
function store.removeLike(postId, cid)
    MySQL.update.await('DELETE FROM phone_birdy_likes WHERE post_id = ? AND citizenid = ?', { postId, cid })
end

---Adds a repost. INSERT IGNORE makes replays a no-op.
---@param postId string
---@param cid string
function store.addRepost(postId, cid)
    MySQL.insert.await('INSERT IGNORE INTO phone_birdy_reposts (post_id, citizenid) VALUES (?, ?)', { postId, cid })
end

---@param postId string
---@param cid string
function store.removeRepost(postId, cid)
    MySQL.update.await('DELETE FROM phone_birdy_reposts WHERE post_id = ? AND citizenid = ?', { postId, cid })
end

---@param postId string
---@param cid string
---@return boolean true when `cid` has reposted the post
function store.isReposted(postId, cid)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_birdy_reposts WHERE post_id = ? AND citizenid = ? LIMIT 1', { postId, cid }
    ) ~= nil
end

---@param postId string
---@param cid string
---@return boolean true when `cid` has liked the post
function store.isLiked(postId, cid)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_birdy_likes WHERE post_id = ? AND citizenid = ? LIMIT 1', { postId, cid }
    ) ~= nil
end

---Citizenids of everyone following `targetCid`, for notification fan-out. Read-only.
---@param targetCid string
---@return string[]
function store.followerCids(targetCid)
    local rows = MySQL.query.await('SELECT follower_cid FROM phone_birdy_follows WHERE target_cid = ?', { targetCid }) or {}
    local out = {}
    for i = 1, #rows do out[#out + 1] = rows[i].follower_cid end
    return out
end

---Add a follow edge. INSERT IGNORE onto the composite primary key makes replays a no-op.
---@param follower string
---@param target string
function store.addFollow(follower, target)
    MySQL.insert.await('INSERT IGNORE INTO phone_birdy_follows (follower_cid, target_cid) VALUES (?, ?)', { follower, target })
end

---@param follower string
---@param target string
function store.removeFollow(follower, target)
    MySQL.update.await('DELETE FROM phone_birdy_follows WHERE follower_cid = ? AND target_cid = ?', { follower, target })
end

---One side of `targetCid`'s follow graph, newest first, with both reciprocal flags resolved against `viewerCid`.
---@param viewerCid string the signed-in player, for the reciprocal flags
---@param targetCid string whose list is being read
---@param kind 'followers'|'following'
---@return table[] rows
function store.followList(viewerCid, targetCid, kind)
    local joinOn, whereCol = 'pr.citizenid = f.follower_cid', 'f.target_cid'
    if kind == 'following' then
        joinOn, whereCol = 'pr.citizenid = f.target_cid', 'f.follower_cid'
    end

    return MySQL.query.await(([[
        SELECT pr.citizenid, pr.handle, pr.display_name, pr.bio, pr.verified, pr.avatar,
               EXISTS(SELECT 1 FROM phone_birdy_follows x
                      WHERE x.follower_cid = pr.citizenid AND x.target_cid = ?)   AS follows_you,
               EXISTS(SELECT 1 FROM phone_birdy_follows y
                      WHERE y.follower_cid = ? AND y.target_cid = pr.citizenid)   AS is_following
        FROM phone_birdy_follows f
        JOIN phone_birdy_profiles pr ON %s
        WHERE %s = ?
        ORDER BY f.created_at DESC
    ]]):format(joinOn, whereCol), { viewerCid, viewerCid, targetCid }) or {}
end

---@param follower string
---@param target string
---@return boolean true when `follower` follows `target`
function store.isFollowing(follower, target)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_birdy_follows WHERE follower_cid = ? AND target_cid = ? LIMIT 1', { follower, target }
    ) ~= nil
end

---Inserts a DM row; the meta table is JSON-encoded here.
---@param id string
---@param fromCid string
---@param toCid string
---@param kind string
---@param body string
---@param meta table|nil decoded metadata (gifUrl / amount / waveform / wpCode ...)
---@return boolean
function store.insertDm(id, fromCid, toCid, kind, body, meta)
    local metaJson = (type(meta) == 'table' and next(meta) ~= nil) and json.encode(meta) or nil
    return MySQL.insert.await([[
        INSERT INTO phone_birdy_dms (id, from_cid, to_cid, kind, body, meta) VALUES (?, ?, ?, ?, ?, ?)
    ]], { id, fromCid, toCid, kind or 'text', body or '', metaJson }) ~= nil
end

---Every message involving a player, oldest-first, with `created_ms` added.
---@param cid string
---@return table[]
function store.listMessagesFor(cid)
    local rows = MySQL.query.await([[
        SELECT id, from_cid, to_cid, body, kind, meta, reactions, read_flag, UNIX_TIMESTAMP(created_at) AS created_s
        FROM phone_birdy_dms WHERE from_cid = ? OR to_cid = ? ORDER BY created_at ASC
    ]], { cid, cid }) or {}
    for i = 1, #rows do rows[i].created_ms = (tonumber(rows[i].created_s) or 0) * 1000 end
    return rows
end

---Marks every message from `otherCid` to `viewerCid` as read. Idempotent.
---@param viewerCid string
---@param otherCid string
function store.markThreadRead(viewerCid, otherCid)
    if not viewerCid or viewerCid == '' or not otherCid or otherCid == '' then return end
    MySQL.update.await(
        'UPDATE phone_birdy_dms SET read_flag = 1 WHERE to_cid = ? AND from_cid = ? AND read_flag = 0',
        { viewerCid, otherCid })
end

---Messages between two players (both directions), oldest-first, with `created_ms` added.
---@param cidA string
---@param cidB string
---@return table[]
function store.listThread(cidA, cidB)
    local rows = MySQL.query.await([[
        SELECT id, from_cid, to_cid, body, kind, meta, reactions, UNIX_TIMESTAMP(created_at) AS created_s
        FROM phone_birdy_dms
        WHERE (from_cid = ? AND to_cid = ?) OR (from_cid = ? AND to_cid = ?)
        ORDER BY created_at ASC
    ]], { cidA, cidB, cidB, cidA }) or {}
    for i = 1, #rows do rows[i].created_ms = (tonumber(rows[i].created_s) or 0) * 1000 end
    return rows
end

---A single DM row by id, with `created_ms` added.
---@param id string
---@return table|nil
function store.getDm(id)
    local row = MySQL.single.await([[
        SELECT id, from_cid, to_cid, body, kind, meta, reactions, UNIX_TIMESTAMP(created_at) AS created_s
        FROM phone_birdy_dms WHERE id = ?
    ]], { id })
    if row then row.created_ms = (tonumber(row.created_s) or 0) * 1000 end
    return row
end

---Overwrites a DM's reactions (a JSON object of emoji -> array of citizenids); an empty table
---stores NULL.
---@param id string
---@param reactions table
function store.updateDmReactions(id, reactions)
    local rjson = (type(reactions) == 'table' and next(reactions) ~= nil) and json.encode(reactions) or nil
    MySQL.update.await('UPDATE phone_birdy_dms SET reactions = ? WHERE id = ?', { rjson, id })
end

---@param id string
---@param recipientCid string
---@param kind string
---@param actorCid string
---@param postId string|nil
function store.insertNotification(id, recipientCid, kind, actorCid, postId)
    MySQL.insert.await([[
        INSERT INTO phone_birdy_notifications (id, recipient_cid, kind, actor_cid, post_id)
        VALUES (?, ?, ?, ?, ?)
    ]], { id, recipientCid, kind, actorCid, postId })
end

---@param recipientCid string
---@param limit number
---@return table[] rows with `created_ms` added
function store.listNotifications(recipientCid, limit)
    local rows = MySQL.query.await([[
        SELECT id, kind, actor_cid, post_id, UNIX_TIMESTAMP(created_at) AS created_s
        FROM phone_birdy_notifications WHERE recipient_cid = ?
        ORDER BY created_at DESC LIMIT ?
    ]], { recipientCid, limit }) or {}
    for i = 1, #rows do rows[i].created_ms = (tonumber(rows[i].created_s) or 0) * 1000 end
    return rows
end

---Marks every unseen notification seen.
---@param recipientCid string
function store.markNotificationsSeen(recipientCid)
    MySQL.update.await('UPDATE phone_birdy_notifications SET seen = 1 WHERE recipient_cid = ? AND seen = 0', { recipientCid })
end

---Unseen-notification count, for the Bell tab and the springboard badge. Read-only.
---@param recipientCid string
---@return integer
function store.unseenNotificationCount(recipientCid)
    return tonumber(MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_birdy_notifications WHERE recipient_cid = ? AND seen = 0', { recipientCid }
    )) or 0
end

return store
