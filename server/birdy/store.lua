---@type table Store module; the table returned at end of file.
local store = {}

local util = require 'server.util'
---@type table Column back-fills for tables that predate a column (server.migrations).
local migrations = require 'server.migrations'
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

---True when a column is present on a table.
---@param tbl string
---@param column string
---@return boolean
local function hasColumn(tbl, column)
    return (tonumber(MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
    ]], { tbl, column })) or 0) > 0
end

---Drops an index when it exists; a missing one is a no-op rather than a failed ALTER.
---@param tbl string
---@param index string
local function dropIndex(tbl, index)
    local present = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
    ]], { tbl, index })
    if (tonumber(present) or 0) > 0 then
        MySQL.query.await(('ALTER TABLE `%s` DROP INDEX `%s`'):format(tbl, index))
    end
end

---Adds the handle column that replaces a citizenid column, then fills it by joining the profile
---that citizenid owned. Returns how many rows resolved to a handle.
---@param tbl string
---@param newCol string handle column being introduced
---@param oldCol string citizenid column being replaced
---@return integer mapped
local function addAndFill(tbl, newCol, oldCol)
    if not hasColumn(tbl, newCol) then
        MySQL.query.await(("ALTER TABLE `%s` ADD COLUMN `%s` VARCHAR(32) NOT NULL DEFAULT ''"):format(tbl, newCol))
    end
    return tonumber(MySQL.update.await((
        'UPDATE `%s` c JOIN phone_birdy_profiles p ON p.citizenid = c.`%s` SET c.`%s` = p.handle'
    ):format(tbl, oldCol, newCol))) or 0
end

---Rewrites the DM reaction blobs, whose JSON values are arrays of citizenids. DDL alone cannot
---reach inside the column, so every reaction would keep pointing at a dead identity.
---@param byCid table<string, string> citizenid -> handle
---@return integer rewritten
local function rekeyDmReactions(byCid)
    local rows = MySQL.query.await(
        "SELECT id, reactions FROM phone_birdy_dms WHERE reactions IS NOT NULL AND reactions <> ''") or {}
    local rewritten = 0
    for i = 1, #rows do
        local okDecode, decoded = pcall(json.decode, rows[i].reactions)
        if okDecode and type(decoded) == 'table' then
            local out = {}
            for emoji, users in pairs(decoded) do
                if type(users) == 'table' then
                    local kept = {}
                    for j = 1, #users do
                        local handle = byCid[users[j]]
                        if handle then kept[#kept + 1] = handle end
                    end
                    if #kept > 0 then out[emoji] = kept end
                end
            end
            MySQL.update.await('UPDATE phone_birdy_dms SET reactions = ? WHERE id = ?',
                { next(out) ~= nil and json.encode(out) or nil, rows[i].id })
            rewritten = rewritten + 1
        end
    end
    return rewritten
end

---Moves every Birdy table from citizenid to handle, so one character can hold several accounts.
---Rows whose citizenid owns no profile cannot be attributed to an account and are dropped.
---@return table stats
local function rekeyToHandle()
    if not util.tableExists('phone_birdy_profiles') then return { fresh = true } end

    local byCid = {}
    for _, p in ipairs(MySQL.query.await('SELECT citizenid, handle FROM phone_birdy_profiles') or {}) do
        byCid[p.citizenid] = p.handle
    end

    local stats = { profiles = 0 }
    for _ in pairs(byCid) do stats.profiles = stats.profiles + 1 end

    if hasColumn('phone_birdy_dms', 'reactions') then
        stats.reactions = rekeyDmReactions(byCid)
    end

    if hasColumn('phone_birdy_posts', 'author_cid') then
        stats.posts = addAndFill('phone_birdy_posts', 'author', 'author_cid')
        MySQL.update.await("DELETE FROM phone_birdy_posts WHERE author = ''")
        dropIndex('phone_birdy_posts', 'idx_birdy_posts_author')
        MySQL.query.await('ALTER TABLE phone_birdy_posts DROP COLUMN author_cid')
        util.ensureIndex('phone_birdy_posts', 'idx_birdy_posts_author', '(author)')
    end

    for _, tbl in ipairs({ 'phone_birdy_likes', 'phone_birdy_reposts' }) do
        if hasColumn(tbl, 'citizenid') then
            stats[tbl] = addAndFill(tbl, 'handle', 'citizenid')
            MySQL.update.await(("DELETE FROM `%s` WHERE handle = ''"):format(tbl))
            MySQL.query.await((
                'ALTER TABLE `%s` DROP PRIMARY KEY, DROP COLUMN citizenid, ADD PRIMARY KEY (post_id, handle)'
            ):format(tbl))
        end
    end

    if hasColumn('phone_birdy_follows', 'follower_cid') then
        stats.follows = addAndFill('phone_birdy_follows', 'follower', 'follower_cid')
        addAndFill('phone_birdy_follows', 'target', 'target_cid')
        MySQL.update.await("DELETE FROM phone_birdy_follows WHERE follower = '' OR target = ''")
        dropIndex('phone_birdy_follows', 'idx_birdy_follows_target')
        MySQL.query.await([[
            ALTER TABLE phone_birdy_follows
                DROP PRIMARY KEY,
                DROP COLUMN follower_cid,
                DROP COLUMN target_cid,
                ADD PRIMARY KEY (follower, target)
        ]])
        util.ensureIndex('phone_birdy_follows', 'idx_birdy_follows_target', '(target)')
    end

    if hasColumn('phone_birdy_dms', 'from_cid') then
        stats.dms = addAndFill('phone_birdy_dms', 'from_handle', 'from_cid')
        addAndFill('phone_birdy_dms', 'to_handle', 'to_cid')
        MySQL.update.await("DELETE FROM phone_birdy_dms WHERE from_handle = '' OR to_handle = ''")
        dropIndex('phone_birdy_dms', 'idx_birdy_dms_from')
        dropIndex('phone_birdy_dms', 'idx_birdy_dms_to')
        MySQL.query.await('ALTER TABLE phone_birdy_dms DROP COLUMN from_cid, DROP COLUMN to_cid')
        util.ensureIndex('phone_birdy_dms', 'idx_birdy_dms_from', '(from_handle)')
        util.ensureIndex('phone_birdy_dms', 'idx_birdy_dms_to', '(to_handle)')
    end

    if hasColumn('phone_birdy_notifications', 'recipient_cid') then
        stats.notifications = addAndFill('phone_birdy_notifications', 'recipient', 'recipient_cid')
        addAndFill('phone_birdy_notifications', 'actor', 'actor_cid')
        MySQL.update.await("DELETE FROM phone_birdy_notifications WHERE recipient = '' OR actor = ''")
        dropIndex('phone_birdy_notifications', 'idx_birdy_notifs_recipient')
        dropIndex('phone_birdy_notifications', 'idx_birdy_notifs_unseen')
        dropIndex('phone_birdy_notifications', 'idx_birdy_notifs_dedupe')
        MySQL.query.await('ALTER TABLE phone_birdy_notifications DROP COLUMN recipient_cid, DROP COLUMN actor_cid')
        util.ensureIndex('phone_birdy_notifications', 'idx_birdy_notifs_recipient', '(recipient, created_at)')
    end

    -- Last, so a failure part-way through leaves the profile table still keyed the old way and the
    -- whole migration retries from the top on the next boot.
    local pk = MySQL.scalar.await([[
        SELECT COLUMN_NAME FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'phone_birdy_profiles'
          AND index_name = 'PRIMARY' AND SEQ_IN_INDEX = 1
    ]])
    if pk == 'citizenid' then
        dropIndex('phone_birdy_profiles', 'uq_phone_birdy_handle')
        MySQL.query.await([[
            ALTER TABLE phone_birdy_profiles
                DROP PRIMARY KEY,
                MODIFY citizenid VARCHAR(64) NOT NULL DEFAULT '',
                ADD PRIMARY KEY (handle)
        ]])
        util.ensureIndex('phone_birdy_profiles', 'idx_birdy_profiles_creator', '(citizenid)')
    end

    return stats
end

---Creates every Birdy table idempotently and back-fills columns added after first release. Runs
---once at boot.
function store.ensureSchema()
    -- Before the CREATEs: they are IF NOT EXISTS, so an install still on the citizenid shape would
    -- keep it and every query below would select columns that no longer match the code.
    util.runOnce('birdy_handle_rekey', rekeyToHandle)

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_profiles (
            handle       VARCHAR(32)  NOT NULL,
            citizenid    VARCHAR(64)  NOT NULL DEFAULT '',
            display_name VARCHAR(64)  NOT NULL,
            password     VARCHAR(64)  NOT NULL DEFAULT '',
            bio          VARCHAR(200) NOT NULL DEFAULT '',
            verified     TINYINT(1)   NOT NULL DEFAULT 0,
            verified_type VARCHAR(8)   NULL,
            logged_in    TINYINT(1)   NOT NULL DEFAULT 0,
            join_label   VARCHAR(32)  NOT NULL DEFAULT '',
            protected    TINYINT(1)   NOT NULL DEFAULT 0,
            created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (handle),
            INDEX idx_birdy_profiles_creator (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- The CREATE above is the current shape for fresh installs; anything added to this table since
    -- it first shipped is back-filled here for databases that already have it.
    migrations.apply('phone_birdy_profiles')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_posts (
            id         VARCHAR(16) NOT NULL,
            author     VARCHAR(32) NOT NULL,
            body       TEXT        NOT NULL,
            parent_id  VARCHAR(16) NULL,
            images     TEXT        NULL,
            views      INT         NOT NULL DEFAULT 0,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_birdy_posts_author  (author),
            INDEX idx_birdy_posts_parent  (parent_id),
            INDEX idx_birdy_posts_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_likes (
            post_id    VARCHAR(16) NOT NULL,
            handle     VARCHAR(32) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, handle),
            INDEX idx_birdy_likes_post (post_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Mirrors phone_birdy_likes; the composite PK makes reposts idempotent.
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_reposts (
            post_id    VARCHAR(16) NOT NULL,
            handle     VARCHAR(32) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, handle),
            INDEX idx_birdy_reposts_post (post_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_follows (
            follower   VARCHAR(32) NOT NULL,
            target     VARCHAR(32) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (follower, target),
            INDEX idx_birdy_follows_target (target)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_dms (
            id          VARCHAR(16) NOT NULL,
            from_handle VARCHAR(32) NOT NULL,
            to_handle   VARCHAR(32) NOT NULL,
            body        TEXT        NOT NULL,
            kind        VARCHAR(16) NOT NULL DEFAULT 'text',
            meta        TEXT        NULL,
            reactions   TEXT        NULL,
            read_flag   TINYINT(1)  NOT NULL DEFAULT 0,
            created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_birdy_dms_from (from_handle),
            INDEX idx_birdy_dms_to   (to_handle)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- The inbox reads each side of the mailbox newest-first, so the handle indexes carry the
    -- timestamp: a range scan off the index instead of an index merge plus a filesort.
    util.ensureIndex('phone_birdy_dms', 'idx_birdy_dms_from_created', '(from_handle, created_at)')
    util.ensureIndex('phone_birdy_dms', 'idx_birdy_dms_to_created',   '(to_handle, created_at)')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_birdy_notifications (
            id         VARCHAR(16) NOT NULL,
            recipient  VARCHAR(32) NOT NULL,
            kind       VARCHAR(16) NOT NULL,
            actor      VARCHAR(32) NOT NULL,
            post_id    VARCHAR(16) NULL,
            seen       TINYINT(1)  NOT NULL DEFAULT 0,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_birdy_notifs_recipient (recipient, created_at)
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
    util.ensureIndex('phone_birdy_notifications', 'idx_birdy_notifs_unseen', '(recipient, seen)')
    util.ensureIndex('phone_birdy_notifications', 'idx_birdy_notifs_dedupe', '(recipient, kind, actor, post_id)')

    -- Referential integrity, added on boot so existing installs migrate with no manual SQL.
    -- Each is a no-op once present; orphaned children are cleared first (they point at a
    -- parent that is already gone) and a type or collation mismatch is skipped, never fatal.
    util.ensureForeignKey('phone_birdy_likes', 'post_id', 'phone_birdy_posts', 'id', 'fk_birdy_likes_post')
    util.ensureForeignKey('phone_birdy_reposts', 'post_id', 'phone_birdy_posts', 'id', 'fk_birdy_reposts_post')
    util.ensureForeignKey('phone_birdy_notifications', 'post_id', 'phone_birdy_posts', 'id', 'fk_birdy_notifications_post')
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

---Backslash-escapes LIKE wildcards in a literal.
---@param s string
---@return string
local function escapeLike(s)
    return (s:gsub('[%%_\\]', '\\%0'))
end

---Reshapes a raw profile row, normalising every TINYINT flag to a boolean. `citizenid` is the
---character that created the account, not whoever is signed into it now.
---@param row table|nil
---@return { handle: string, displayName: string, verified: boolean, citizenid: string }|nil
local function hydrateProfile(row)
    if not row then return nil end
    return {
        handle      = row.handle,
        citizenid   = row.citizenid,
        displayName = row.display_name,
        password    = row.password,
        bio         = row.bio,
        verified    = isTruthy(row.verified),
        verifiedType = row.verified_type,
        loggedIn    = isTruthy(row.logged_in),
        joinLabel   = row.join_label,
        avatar      = row.avatar,
        banner      = row.banner,
        -- Authoritative signup time; joinLabel is a legacy fallback.
        createdTs   = tonumber(row.created_ts),
        protected   = isTruthy(row.protected),
    }
end

---Looks up a profile by its handle, the account's identity.
---@param handle string
---@return table|nil
function store.getProfileByHandle(handle)
    if not handle or handle == '' then return nil end
    return hydrateProfile(MySQL.single.await(
        'SELECT handle, citizenid, display_name, password, bio, verified, verified_type, logged_in, join_label, protected, avatar, banner, UNIX_TIMESTAMP(created_at) AS created_ts FROM phone_birdy_profiles WHERE handle = ?',
        { handle }
    ))
end

---Searches accounts by handle or display name (substring), excluding the viewer. Wildcards in
---the client's text are escaped, so a bare '%' searches for a literal percent instead of
---scanning the whole table.
---@param query string
---@param viewerHandle string
---@param limit number
---@return table[] {handle, displayName, verified, avatar}
function store.searchProfiles(query, viewerHandle, limit)
    local like = '%' .. escapeLike(query) .. '%'
    local rows = MySQL.query.await([[
        SELECT handle, display_name, verified, verified_type, avatar FROM phone_birdy_profiles
        WHERE (handle LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') AND handle <> ?
        ORDER BY created_at DESC LIMIT ?
    ]], { like, like, viewerHandle or '', limit }) or {}
    local out = {}
    for i = 1, #rows do
        local r = rows[i]
        out[i] = { handle = r.handle, displayName = r.display_name, verified = isTruthy(r.verified), verifiedType = r.verified_type, avatar = r.avatar }
    end
    return out
end

---Creates a fresh, signed-in profile row; a duplicate handle fails the primary key and returns
---false. `citizenid` records the character that created the account.
---@param handle string
---@param citizenid string
---@param displayName string
---@param passwordHash string
---@param bio string
---@param verified boolean
---@param joinLabel string
---@return boolean
function store.insertAccount(handle, citizenid, displayName, passwordHash, bio, verified, joinLabel)
    return MySQL.insert.await([[
        INSERT INTO phone_birdy_profiles (handle, citizenid, display_name, password, bio, verified, logged_in, join_label)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ]], { handle, citizenid, displayName, passwordHash, bio, verified and 1 or 0, joinLabel or '' }) ~= nil
end

---Updates the editable profile fields (name, bio, join label, protected).
---@param handle string
---@param displayName string
---@param bio string
---@param joinLabel string
---@param protected boolean
function store.updateProfileFields(handle, displayName, bio, joinLabel, protected, avatar, banner)
    MySQL.update.await([[
        UPDATE phone_birdy_profiles
        SET display_name = ?, bio = ?, join_label = ?, protected = ?, avatar = ?, banner = ?
        WHERE handle = ?
    ]], { displayName, bio, joinLabel, protected and 1 or 0, avatar, banner, handle })
end

---Sets the verified badge on one account. Only ever called with a type that came back from
---verify.parse, so an unrenderable badge cannot reach the column.
---@param handle string account handle
---@param vtype string|nil badge type, or nil to clear the badge
---@return integer affected
function store.setVerified(handle, vtype)
    return tonumber(MySQL.update.await(
        'UPDATE phone_birdy_profiles SET verified = ?, verified_type = ? WHERE handle = ?',
        { vtype and 1 or 0, vtype, handle })) or 0
end

---Replace an account's legacy profile-row password hash (kept in sync with the engine hash).
---@param handle string
---@param passwordHash string
function store.setPassword(handle, passwordHash)
    MySQL.update.await('UPDATE phone_birdy_profiles SET password = ? WHERE handle = ?', { passwordHash, handle })
end

---@param handle string
---@return number following count
function store.countFollowing(handle)
    return tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM phone_birdy_follows WHERE follower = ?', { handle })) or 0
end

---@param handle string
---@return number follower count
function store.countFollowers(handle)
    return tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM phone_birdy_follows WHERE target = ?', { handle })) or 0
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
        author      = row.author,
        handle      = row.handle,
        displayName = row.display_name,
        verified    = isTruthy(row.verified),
        verifiedType = row.verified_type,
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
        repostedBy     = row.reposter,
        repostedByName = row.reposter_name,
        repostedByAvatar = row.reposter_avatar,
    }
end

---@type string Columns shared by the authored and reposted halves of a timeline. Both halves
---project the same shape so their rows can be merged and sorted together. The viewer handle is
---params #1 AND #2 (the `liked` and `reposted` flags) in either half.
local POST_COLS = [[
        p.id, p.author, p.body, p.parent_id, p.images, p.views,
        UNIX_TIMESTAMP(p.created_at) AS created_s,
        pr.handle, pr.display_name, pr.verified, pr.verified_type, pr.avatar,
        (SELECT COUNT(*) FROM phone_birdy_likes l  WHERE l.post_id   = p.id) AS like_count,
        (SELECT COUNT(*) FROM phone_birdy_posts r  WHERE r.parent_id = p.id) AS reply_count,
        (SELECT COUNT(*) FROM phone_birdy_reposts rp WHERE rp.post_id = p.id) AS repost_count,
        (SELECT COUNT(*) FROM phone_birdy_likes lv WHERE lv.post_id  = p.id AND lv.handle = ?) AS liked,
        (SELECT COUNT(*) FROM phone_birdy_reposts rv WHERE rv.post_id = p.id AND rv.handle = ?) AS reposted
]]

---@type string SELECT prefix producing hydratePost-shaped rows. The viewer handle is params #1 AND
---#2 (the `liked` and `reposted` flags), so every caller must pass it twice, ahead of its own
---parameters. `surfaced_s` is what orders a timeline: for an authored post it is simply its own
---creation time.
local POST_SELECT = [[
    SELECT
]] .. POST_COLS .. [[,
        NULL AS reposter, NULL AS reposter_name,
        UNIX_TIMESTAMP(p.created_at) AS surfaced_s
    FROM phone_birdy_posts p
    JOIN phone_birdy_profiles pr ON pr.handle = p.author
]]

---@type string The reposted half of a timeline: the same post, surfaced at the moment somebody
---reposted it rather than when it was written, carrying who did so. Outer alias is rp2 because
---POST_COLS already uses rp for the repost-count subquery. Same leading two params as POST_SELECT.
local REPOST_SELECT = [[
    SELECT
]] .. POST_COLS .. [[,
        rp2.handle AS reposter, rpr.display_name AS reposter_name, rpr.avatar AS reposter_avatar,
        UNIX_TIMESTAMP(rp2.created_at) AS surfaced_s
    FROM phone_birdy_reposts rp2
    JOIN phone_birdy_posts p ON p.id = rp2.post_id
    JOIN phone_birdy_profiles pr ON pr.handle = p.author
    JOIN phone_birdy_profiles rpr ON rpr.handle = rp2.handle
]]

---Merges an authored and a reposted result set into one timeline, newest-surfaced first, capped
---to `limit`. Done in Lua rather than as a SQL UNION so each half keeps its own readable WHERE
---and its own positional parameters; at feed-sized limits the sort is free.
---@param a table[] authored rows
---@param b table[] reposted rows
---@param limit integer
---@return table[] hydrated posts
local function mergeTimeline(a, b, limit)
    local all = {}
    for i = 1, #a do all[#all + 1] = a[i] end
    for i = 1, #b do all[#all + 1] = b[i] end
    table.sort(all, function(x, y)
        return (tonumber(x.surfaced_s) or 0) > (tonumber(y.surfaced_s) or 0)
    end)
    local out = {}
    for i = 1, math.min(#all, limit) do out[i] = hydratePost(all[i]) end
    return out
end

---Lists a single author's posts for a profile tab, newest first. 'replies' = posts with a
---parent; 'media' = any post carrying images; anything else = top-level only.
---@param author string
---@param kind string
---@param viewerHandle string
---@param limit number
---@return table[]
function store.listPostsBy(author, kind, viewerHandle, limit)
    local clause
    if kind == 'replies' then
        clause = 'p.parent_id IS NOT NULL'
    elseif kind == 'media' then
        clause = "p.images IS NOT NULL AND p.images <> ''"
    else
        clause = 'p.parent_id IS NULL'
    end
    local authored = MySQL.query.await(
        POST_SELECT .. (' WHERE p.author = ? AND %s ORDER BY p.created_at DESC LIMIT ?'):format(clause),
        { viewerHandle, viewerHandle, author, limit }
    ) or {}

    if kind == 'replies' or kind == 'media' then
        local out = {}
        for i = 1, #authored do out[i] = hydratePost(authored[i]) end
        return out
    end

    local reposted = MySQL.query.await(REPOST_SELECT .. [[
        WHERE rp2.handle = ?
          AND rp2.handle <> p.author
          AND p.parent_id IS NULL
        ORDER BY rp2.created_at DESC LIMIT ?
    ]], { viewerHandle, viewerHandle, author, limit }) or {}

    return mergeTimeline(authored, reposted, limit)
end

---List posts an account has liked, most-recently-liked first.
---@param likerHandle string
---@param viewerHandle string
---@param limit number
---@return table[]
function store.listLikedBy(likerHandle, viewerHandle, limit)
    local rows = MySQL.query.await(
        POST_SELECT .. [[
            JOIN phone_birdy_likes lk ON lk.post_id = p.id AND lk.handle = ?
            ORDER BY lk.created_at DESC LIMIT ?
        ]],
        { viewerHandle, viewerHandle, likerHandle, limit }
    ) or {}
    for i = 1, #rows do rows[i] = hydratePost(rows[i]) end
    return rows
end

---Deletes an account and every row it owns or references: likes and reposts (its own, and
---others' on its posts), posts, follows, DMs, notifications, then the profile row.
---@param handle string
function store.deleteAccount(handle)
    MySQL.update.await('DELETE FROM phone_birdy_likes WHERE handle = ?', { handle })
    MySQL.update.await('DELETE FROM phone_birdy_likes WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { handle })
    MySQL.update.await('DELETE FROM phone_birdy_reposts WHERE handle = ?', { handle })
    MySQL.update.await('DELETE FROM phone_birdy_reposts WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { handle })
    MySQL.update.await('DELETE FROM phone_birdy_posts WHERE author = ?', { handle })
    MySQL.update.await('DELETE FROM phone_birdy_follows WHERE follower = ? OR target = ?', { handle, handle })
    MySQL.update.await('DELETE FROM phone_birdy_dms WHERE from_handle = ? OR to_handle = ?', { handle, handle })
    MySQL.update.await('DELETE FROM phone_birdy_notifications WHERE recipient = ? OR actor = ?', { handle, handle })
    MySQL.update.await('DELETE FROM phone_birdy_profiles WHERE handle = ?', { handle })
    store.invalidateTrending()
end

---Flips an account's informational signed-in flag.
---@param handle string
---@param value boolean
function store.setLoggedIn(handle, value)
    MySQL.update.await(
        'UPDATE phone_birdy_profiles SET logged_in = ? WHERE handle = ?',
        { value and 1 or 0, handle }
    )
end

---Batch-loads profiles keyed by handle.
---@param handles string[]
---@return table<string, table>
function store.getProfilesByHandles(handles)
    local out = {}
    if not handles or #handles == 0 then return out end
    local marks = {}
    for i = 1, #handles do marks[i] = '?' end
    local rows = MySQL.query.await(
        ('SELECT handle, citizenid, display_name, verified, verified_type, avatar FROM phone_birdy_profiles WHERE handle IN (%s)')
            :format(table.concat(marks, ',')),
        handles
    ) or {}
    for i = 1, #rows do
        local p = hydrateProfile(rows[i])
        if p then out[p.handle] = p end
    end
    return out
end

---A single post by id, hydrated for `viewerHandle`'s liked flag.
---@param id string
---@param viewerHandle string
---@return table|nil
function store.getPost(id, viewerHandle)
    return hydratePost(MySQL.single.await(
        POST_SELECT .. ' WHERE p.id = ? LIMIT 1', { viewerHandle, viewerHandle, id }
    ))
end

---Hydrated posts for many ids in one query. Returns an id -> hydrated post map (missing ids
---absent). Read-only.
---@param ids string[] post ids
---@param viewerHandle string viewer handle (for the liked flag)
---@return table<string, table> id -> hydrated post
function store.postsByIds(ids, viewerHandle)
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
    local params = { viewerHandle, viewerHandle }
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
---@param viewerHandle string
---@param limit number
---@param onlyFollowing boolean
---@return table[]
function store.listFeed(viewerHandle, limit, onlyFollowing)
    local authored, reposted
    if onlyFollowing then
        authored = MySQL.query.await(POST_SELECT .. [[
            WHERE p.parent_id IS NULL
              AND p.author IN (SELECT target FROM phone_birdy_follows WHERE follower = ?)
            ORDER BY p.created_at DESC LIMIT ?
        ]], { viewerHandle, viewerHandle, viewerHandle, limit }) or {}

        reposted = MySQL.query.await(REPOST_SELECT .. [[
            WHERE p.parent_id IS NULL
              AND rp2.handle <> p.author
              AND rp2.handle IN (SELECT target FROM phone_birdy_follows WHERE follower = ?)
              AND (pr.protected = 0 OR p.author = ?
                   OR p.author IN (SELECT target FROM phone_birdy_follows WHERE follower = ?))
            ORDER BY rp2.created_at DESC LIMIT ?
        ]], { viewerHandle, viewerHandle, viewerHandle, viewerHandle, viewerHandle, limit }) or {}
    else
        -- Protected authors are visible only to themselves and their followers.
        authored = MySQL.query.await(POST_SELECT .. [[
            WHERE p.parent_id IS NULL
              AND (pr.protected = 0 OR p.author = ?
                   OR p.author IN (SELECT target FROM phone_birdy_follows WHERE follower = ?))
            ORDER BY p.created_at DESC LIMIT ?
        ]], { viewerHandle, viewerHandle, viewerHandle, viewerHandle, limit }) or {}

        reposted = MySQL.query.await(REPOST_SELECT .. [[
            WHERE p.parent_id IS NULL
              AND rp2.handle <> p.author
              AND (pr.protected = 0 OR p.author = ?
                   OR p.author IN (SELECT target FROM phone_birdy_follows WHERE follower = ?))
              AND (rpr.protected = 0 OR rp2.handle = ?
                   OR rp2.handle IN (SELECT target FROM phone_birdy_follows WHERE follower = ?))
            ORDER BY rp2.created_at DESC LIMIT ?
        ]], { viewerHandle, viewerHandle, viewerHandle, viewerHandle, viewerHandle, viewerHandle, limit }) or {}
    end
    return mergeTimeline(authored, reposted, limit)
end

---@param parentId string
---@param viewerHandle string
---@return table[] replies oldest-first
function store.listReplies(parentId, viewerHandle)
    local rows = MySQL.query.await(
        POST_SELECT .. ' WHERE p.parent_id = ? ORDER BY p.created_at ASC LIMIT 500',
        { viewerHandle, viewerHandle, parentId }
    ) or {}
    for i = 1, #rows do rows[i] = hydratePost(rows[i]) end
    return rows
end

---@type { at: number, data: table[]|nil } Cached trending list; dropped on every new post.
local trendingCache = { at = 0, data = nil }

---@type integer Seconds a computed trending list is served before a rescan.
local TRENDING_TTL = 60

---@type integer Most-recent posts scanned per trending computation.
local TRENDING_SCAN_CAP = 500

---Distinct lowercased hashtags in a body; optionally tallies raw casings into `casings`.
---@param body string
---@param casings table<string, table<string, number>>|nil
---@return table<string, boolean>
local function extractTags(body, casings)
    local seen = {}
    for raw in body:gmatch('#([%w_]+)') do
        local key = raw:lower()
        seen[key] = true
        if casings then
            local c = casings[key]
            if not c then c = {}; casings[key] = c end
            c[raw] = (c[raw] or 0) + 1
        end
    end
    return seen
end

---Drops the cached trending list so the next read recomputes. Deliberately NOT called from
---posting: any player's post used to zero the cache, which turned the 60 s TTL off and let two
---cheap callbacks force the 500-row hashtag rescan back to back.
function store.invalidateTrending()
    trendingCache.at, trendingCache.data = 0, nil
end

---Top hashtags across recent posts from unprotected authors, as { tag = '#Gamer', count = n }
---sorted by post count. Counts posts, not occurrences; cached for TRENDING_TTL seconds.
---@param windowDays number
---@param limit number
---@return table[]
function store.trendingHashtags(windowDays, limit)
    if trendingCache.data and (os.time() - trendingCache.at) < TRENDING_TTL then
        return trendingCache.data
    end
    local rows = MySQL.query.await([[
        SELECT p.body FROM phone_birdy_posts p
        JOIN phone_birdy_profiles pr ON pr.handle = p.author
        WHERE pr.protected = 0 AND p.body LIKE '%#%'
          AND p.created_at > NOW() - INTERVAL ? DAY
        ORDER BY p.created_at DESC LIMIT ?
    ]], { windowDays, TRENDING_SCAN_CAP }) or {}

    local counts, casings = {}, {}
    for i = 1, #rows do
        for key in pairs(extractTags(rows[i].body or '', casings)) do
            counts[key] = (counts[key] or 0) + 1
        end
    end

    local order = {}
    for key, count in pairs(counts) do order[#order + 1] = { key = key, count = count } end
    table.sort(order, function(a, b)
        if a.count ~= b.count then return a.count > b.count end
        return a.key < b.key
    end)

    local out = {}
    for i = 1, math.min(limit, #order) do
        local key = order[i].key
        local best, bestN = key, 0
        for raw, n in pairs(casings[key] or {}) do
            if n > bestN then best, bestN = raw, n end
        end
        out[i] = { tag = '#' .. best, count = order[i].count }
    end
    trendingCache.at, trendingCache.data = os.time(), out
    return out
end

---Posts and replies carrying an exact hashtag, newest first, honouring the feed's
---protected-author visibility. `tagLower` arrives lowercased without the '#'.
---@param tagLower string
---@param viewerHandle string
---@param limit number
---@return table[]
function store.postsByHashtag(tagLower, viewerHandle, limit)
    local like = '%#' .. escapeLike(tagLower) .. '%'
    local rows = MySQL.query.await(POST_SELECT .. [[
        WHERE p.body LIKE ?
          AND (pr.protected = 0 OR p.author = ?
               OR p.author IN (SELECT target FROM phone_birdy_follows WHERE follower = ?))
        ORDER BY p.created_at DESC LIMIT ?
    ]], { viewerHandle, viewerHandle, like, viewerHandle, viewerHandle, limit }) or {}

    local out = {}
    for i = 1, #rows do
        if extractTags(rows[i].body or '')[tagLower] then
            out[#out + 1] = hydratePost(rows[i])
        end
    end
    return out
end

---Inserts a post row.
---@param id string
---@param author string
---@param body string
---@param parentId string|nil
---@param images string[]|nil up to 3 image URLs, stored as a JSON array
---@return boolean
function store.insertPost(id, author, body, parentId, images)
    local imagesJson = (type(images) == 'table' and #images > 0) and json.encode(images) or nil
    return MySQL.insert.await([[
        INSERT INTO phone_birdy_posts (id, author, body, parent_id, images) VALUES (?, ?, ?, ?, ?)
    ]], { id, author, body, parentId, imagesJson }) ~= nil
end

---Increments a post's view count, but never for the author's own views.
---@param id string
---@param viewerHandle string
function store.bumpViews(id, viewerHandle)
    MySQL.update.await(
        'UPDATE phone_birdy_posts SET views = views + 1 WHERE id = ? AND author <> ?',
        { id, viewerHandle }
    )
end

---@param id string
---@return string|nil author handle
function store.getPostAuthor(id)
    return MySQL.scalar.await('SELECT author FROM phone_birdy_posts WHERE id = ?', { id })
end

---Deletes a post and everything hanging off it: its replies, and the likes, reposts and
---notifications belonging to the post or any of those replies. There is no ON DELETE CASCADE on
---these tables, so orphans would otherwise sit in the likes and notifications tables forever and
---keep counting toward reply totals.
---@param id string post id
---@return integer removed how many rows the posts table lost
function store.deletePost(id)
    local replies = MySQL.query.await('SELECT id FROM phone_birdy_posts WHERE parent_id = ?', { id }) or {}

    local ids = { id }
    for i = 1, #replies do ids[#ids + 1] = replies[i].id end

    local marks = string.rep('?', #ids, ',')
    MySQL.query.await(('DELETE FROM phone_birdy_likes WHERE post_id IN (%s)'):format(marks), ids)
    MySQL.query.await(('DELETE FROM phone_birdy_reposts WHERE post_id IN (%s)'):format(marks), ids)
    MySQL.query.await(('DELETE FROM phone_birdy_notifications WHERE post_id IN (%s)'):format(marks), ids)
    return MySQL.update.await(('DELETE FROM phone_birdy_posts WHERE id IN (%s)'):format(marks), ids) or 0
end

---Adds a like. INSERT IGNORE makes replays a no-op.
---@param postId string
---@param handle string
function store.addLike(postId, handle)
    MySQL.insert.await('INSERT IGNORE INTO phone_birdy_likes (post_id, handle) VALUES (?, ?)', { postId, handle })
end

---@param postId string
---@param handle string
function store.removeLike(postId, handle)
    MySQL.update.await('DELETE FROM phone_birdy_likes WHERE post_id = ? AND handle = ?', { postId, handle })
end

---Adds a repost. INSERT IGNORE makes replays a no-op.
---@param postId string
---@param handle string
function store.addRepost(postId, handle)
    MySQL.insert.await('INSERT IGNORE INTO phone_birdy_reposts (post_id, handle) VALUES (?, ?)', { postId, handle })
end

---@param postId string
---@param handle string
function store.removeRepost(postId, handle)
    MySQL.update.await('DELETE FROM phone_birdy_reposts WHERE post_id = ? AND handle = ?', { postId, handle })
end

---@param postId string
---@param handle string
---@return boolean true when `handle` has reposted the post
function store.isReposted(postId, handle)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_birdy_reposts WHERE post_id = ? AND handle = ? LIMIT 1', { postId, handle }
    ) ~= nil
end

---@param postId string
---@param handle string
---@return boolean true when `handle` has liked the post
function store.isLiked(postId, handle)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_birdy_likes WHERE post_id = ? AND handle = ? LIMIT 1', { postId, handle }
    ) ~= nil
end

---Handles of every account following `target`, for notification fan-out. Read-only.
---@param target string
---@return string[]
function store.followerHandles(target)
    local rows = MySQL.query.await('SELECT follower FROM phone_birdy_follows WHERE target = ?', { target }) or {}
    local out = {}
    for i = 1, #rows do out[#out + 1] = rows[i].follower end
    return out
end

---Add a follow edge. INSERT IGNORE onto the composite primary key makes replays a no-op.
---@param follower string
---@param target string
function store.addFollow(follower, target)
    MySQL.insert.await('INSERT IGNORE INTO phone_birdy_follows (follower, target) VALUES (?, ?)', { follower, target })
end

---@param follower string
---@param target string
function store.removeFollow(follower, target)
    MySQL.update.await('DELETE FROM phone_birdy_follows WHERE follower = ? AND target = ?', { follower, target })
end

---One side of `target`'s follow graph, newest first, with both reciprocal flags resolved against
---`viewerHandle`.
---@param viewerHandle string the signed-in account, for the reciprocal flags
---@param target string whose list is being read
---@param kind 'followers'|'following'
---@return table[] rows
function store.followList(viewerHandle, target, kind)
    local joinOn, whereCol = 'pr.handle = f.follower', 'f.target'
    if kind == 'following' then
        joinOn, whereCol = 'pr.handle = f.target', 'f.follower'
    end

    return MySQL.query.await(([[
        SELECT pr.handle, pr.display_name, pr.bio, pr.verified, pr.verified_type, pr.avatar,
               EXISTS(SELECT 1 FROM phone_birdy_follows x
                      WHERE x.follower = pr.handle AND x.target = ?)   AS follows_you,
               EXISTS(SELECT 1 FROM phone_birdy_follows y
                      WHERE y.follower = ? AND y.target = pr.handle)   AS is_following
        FROM phone_birdy_follows f
        JOIN phone_birdy_profiles pr ON %s
        WHERE %s = ?
        ORDER BY f.created_at DESC
    ]]):format(joinOn, whereCol), { viewerHandle, viewerHandle, target }) or {}
end

---@param follower string
---@param target string
---@return boolean true when `follower` follows `target`
function store.isFollowing(follower, target)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_birdy_follows WHERE follower = ? AND target = ? LIMIT 1', { follower, target }
    ) ~= nil
end

---Inserts a DM row; the meta table is JSON-encoded here.
---@param id string
---@param from string
---@param to string
---@param kind string
---@param body string
---@param meta table|nil decoded metadata (gifUrl / amount / waveform / wpCode ...)
---@return boolean
function store.insertDm(id, from, to, kind, body, meta)
    local metaJson = (type(meta) == 'table' and next(meta) ~= nil) and json.encode(meta) or nil
    return MySQL.insert.await([[
        INSERT INTO phone_birdy_dms (id, from_handle, to_handle, kind, body, meta) VALUES (?, ?, ?, ?, ?, ?)
    ]], { id, from, to, kind or 'text', body or '', metaJson }) ~= nil
end

---An account's most recent messages, oldest-first, with `created_ms` added. The inbox derives one
---conversation head per peer from these, so it only needs the recent tail; without the cap a
---flooded mailbox pulls every row it has ever held into Lua on each app open.
---@param handle string
---@return table[]
function store.listMessagesFor(handle)
    local rows = MySQL.query.await([[
        SELECT * FROM (
            SELECT id, from_handle, to_handle, body, kind, meta, reactions, read_flag,
                   created_at, UNIX_TIMESTAMP(created_at) AS created_s
            (SELECT id, from_handle, to_handle, body, kind, meta, reactions, read_flag,
                    created_at, UNIX_TIMESTAMP(created_at) AS created_s
             FROM phone_birdy_dms WHERE from_handle = ? ORDER BY created_at DESC LIMIT 2500)
            UNION ALL
            (SELECT id, from_handle, to_handle, body, kind, meta, reactions, read_flag,
                    created_at, UNIX_TIMESTAMP(created_at) AS created_s
             FROM phone_birdy_dms WHERE to_handle = ? ORDER BY created_at DESC LIMIT 2500)
        ) recent ORDER BY created_at ASC
    ]], { handle, handle }) or {}
    for i = 1, #rows do rows[i].created_ms = (tonumber(rows[i].created_s) or 0) * 1000 end
    return rows
end

---Marks every message from `other` to `viewerHandle` as read. Idempotent.
---@param viewerHandle string
---@param other string
function store.markThreadRead(viewerHandle, other)
    if not viewerHandle or viewerHandle == '' or not other or other == '' then return end
    MySQL.update.await(
        'UPDATE phone_birdy_dms SET read_flag = 1 WHERE to_handle = ? AND from_handle = ? AND read_flag = 0',
        { viewerHandle, other })
end

---The newest 500 messages between two accounts (both directions), oldest-first, with `created_ms`
---added.
---@param a string
---@param b string
---@return table[]
function store.listThread(a, b)
    local rows = MySQL.query.await([[
        SELECT * FROM (
            SELECT id, from_handle, to_handle, body, kind, meta, reactions,
                   created_at, UNIX_TIMESTAMP(created_at) AS created_s
            FROM phone_birdy_dms
            WHERE (from_handle = ? AND to_handle = ?) OR (from_handle = ? AND to_handle = ?)
            ORDER BY created_at DESC LIMIT 500
        ) recent ORDER BY created_at ASC
    ]], { a, b, b, a }) or {}
    for i = 1, #rows do rows[i].created_ms = (tonumber(rows[i].created_s) or 0) * 1000 end
    return rows
end

---A single DM row by id, with `created_ms` added.
---@param id string
---@return table|nil
function store.getDm(id)
    local row = MySQL.single.await([[
        SELECT id, from_handle, to_handle, body, kind, meta, reactions, UNIX_TIMESTAMP(created_at) AS created_s
        FROM phone_birdy_dms WHERE id = ?
    ]], { id })
    if row then row.created_ms = (tonumber(row.created_s) or 0) * 1000 end
    return row
end

---Overwrites a DM's reactions (a JSON object of emoji -> array of handles); an empty table
---stores NULL.
---@param id string
---@param reactions table
function store.updateDmReactions(id, reactions)
    local rjson = (type(reactions) == 'table' and next(reactions) ~= nil) and json.encode(reactions) or nil
    MySQL.update.await('UPDATE phone_birdy_dms SET reactions = ? WHERE id = ?', { rjson, id })
end

---True when the same actor already raised this kind of notification on the same post for the
---same recipient inside the last `withinSecs`. Lets the caller drop the duplicate a like, repost
---or follow toggle would otherwise mint on every flip. The postless kinds are matched through
---IFNULL because SQL treats two NULL post_ids as distinct, which is also why this is not a
---UNIQUE key.
---@param recipient string
---@param kind string
---@param actor string
---@param postId string|nil
---@param withinSecs integer age limit in seconds
---@return boolean exists
function store.recentNotification(recipient, kind, actor, postId, withinSecs)
    local n = MySQL.scalar.await([[
        SELECT 1 FROM phone_birdy_notifications
        WHERE recipient = ? AND kind = ? AND actor = ?
          AND IFNULL(post_id, '') = ?
          AND created_at > NOW() - INTERVAL ? SECOND
        LIMIT 1
    ]], { recipient, kind, actor, postId or '', withinSecs })
    return n ~= nil
end

---@param id string
---@param recipient string
---@param kind string
---@param actor string
---@param postId string|nil
function store.insertNotification(id, recipient, kind, actor, postId)
    MySQL.insert.await([[
        INSERT INTO phone_birdy_notifications (id, recipient, kind, actor, post_id)
        VALUES (?, ?, ?, ?, ?)
    ]], { id, recipient, kind, actor, postId })
end

---Inserts many notifications in one statement. The post fan-out wrote one row per follower, so
---a 100-follower post cost 100 sequential round trips. A nil/empty list is a no-op.
---Every field must be non-nil: the args are positional, and a nil would shift every following
---row's values. Notification kinds with no post (follow) use insertNotification instead.
---@param rows { id: string, recipient: string, kind: string, actor: string, postId: string }[]
function store.insertNotifications(rows)
    if type(rows) ~= 'table' or #rows == 0 then return end
    local ph, args, n = {}, {}, 0
    for i = 1, #rows do
        local r = rows[i]
        if r.id and r.recipient and r.kind and r.actor and r.postId then
            ph[#ph + 1] = '(?, ?, ?, ?, ?)'
            args[n + 1], args[n + 2], args[n + 3], args[n + 4], args[n + 5] =
                r.id, r.recipient, r.kind, r.actor, r.postId
            n = n + 5
        end
    end
    if n == 0 then return end
    MySQL.insert.await((
        'INSERT INTO phone_birdy_notifications (id, recipient, kind, actor, post_id) VALUES %s'
    ):format(table.concat(ph, ',')), args)
end

---@param recipient string
---@param limit number
---@return table[] rows with `created_ms` added
function store.listNotifications(recipient, limit)
    local rows = MySQL.query.await([[
        SELECT id, kind, actor, post_id, UNIX_TIMESTAMP(created_at) AS created_s
        FROM phone_birdy_notifications WHERE recipient = ?
        ORDER BY created_at DESC LIMIT ?
    ]], { recipient, limit }) or {}
    for i = 1, #rows do rows[i].created_ms = (tonumber(rows[i].created_s) or 0) * 1000 end
    return rows
end

---Marks every unseen notification seen.
---@param recipient string
function store.markNotificationsSeen(recipient)
    MySQL.update.await('UPDATE phone_birdy_notifications SET seen = 1 WHERE recipient = ? AND seen = 0', { recipient })
end

---Unseen-notification count, for the Bell tab and the springboard badge. Read-only.
---@param recipient string
---@return integer
function store.unseenNotificationCount(recipient)
    return tonumber(MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_birdy_notifications WHERE recipient = ? AND seen = 0', { recipient }
    )) or 0
end

return store
