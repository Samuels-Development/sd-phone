---@type table Shared server helpers (server.util): index, column and constraint bootstrap.
local util = require 'server.util'
---@type table Post-0.9.0 column back-fills (server.migrations), applied right after each CREATE.
local migrations = require 'server.migrations'

---@type table Store module; the table returned at end of file.
local store = {}

---Create the three Streaks tables if they don't exist. Run once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_streaks (
            citizenid       VARCHAR(64) NOT NULL,
            current_streak  INT         NOT NULL DEFAULT 0,
            longest_streak  INT         NOT NULL DEFAULT 0,
            last_post_date  DATE        NULL,
            reward_streak   INT         NOT NULL DEFAULT 0,
            reward_date     DATE        NULL,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_streaks')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_streak_posts (
            id          INT          NOT NULL AUTO_INCREMENT,
            citizenid   VARCHAR(64)  NOT NULL,
            author_name VARCHAR(80)  NOT NULL,
            image_url   VARCHAR(512) NOT NULL,
            caption     VARCHAR(160) NULL,
            day_streak  INT          NOT NULL,
            post_date   DATE         NOT NULL,
            like_count  INT          NOT NULL DEFAULT 0,
            created_at  INT          NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uniq_player_day (citizenid, post_date),
            KEY idx_created (created_at),
            KEY idx_cid (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_streak_likes (
            post_id     INT         NOT NULL,
            citizenid   VARCHAR(64) NOT NULL,
            UNIQUE KEY uniq_like (post_id, citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Referential integrity, added on boot so existing installs migrate with no manual SQL.
    -- Each is a no-op once present; orphaned children are cleared first (they point at a
    -- parent that is already gone) and a type or collation mismatch is skipped, never fatal.
    util.ensureForeignKey('phone_streak_likes', 'post_id', 'phone_streak_posts', 'id', 'fk_streak_likes_post')
end

---A character's streak row (nil if they've never posted). last_post_date is read back as a
---'YYYY-MM-DD' string via DATE_FORMAT. Read-only.
---@param cid string citizenid
---@return table|nil row { citizenid, current_streak, longest_streak, last_post_date }
function store.getStreak(cid)
    return MySQL.single.await([[
        SELECT citizenid, current_streak, longest_streak,
               DATE_FORMAT(last_post_date, '%Y-%m-%d') AS last_post_date
        FROM phone_streaks WHERE citizenid = ?
    ]], { cid })
end

---Persist a character's streak counters + last post date (upsert).
---@param cid string citizenid
---@param current integer current consecutive-day streak
---@param longest integer lifetime best streak
---@param postDate string|nil 'YYYY-MM-DD' of the latest post (nil clears it)
function store.upsertStreak(cid, current, longest, postDate)
    MySQL.query.await([[
        INSERT INTO phone_streaks (citizenid, current_streak, longest_streak, last_post_date)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            current_streak = VALUES(current_streak),
            longest_streak = VALUES(longest_streak),
            last_post_date = VALUES(last_post_date)
    ]], { cid, current, longest, postDate })
end

---A character's milestone counter: the consecutive days they have posted on ANY phone, and the
---last day counted, read off the phone_streaks row of their real identity. Under unique phones
---that row carries no posts of its own (current_streak 0 keeps it off the leaderboard); without
---them it is the one row the character posts under. Read-only.
---@param realCid string the character's real identifier (player.getRealIdentifier)
---@return table|nil row { reward_streak, reward_date } with reward_date as 'YYYY-MM-DD' or nil
function store.getRewardStreak(realCid)
    return MySQL.single.await([[
        SELECT reward_streak, DATE_FORMAT(reward_date, '%Y-%m-%d') AS reward_date
        FROM phone_streaks WHERE citizenid = ?
    ]], { realCid })
end

---Counts `day` for a character at `streak`, creating their row when it is missing. Only a day
---later than the last one counted is written, so two posts on one day (two phones, or two calls in
---flight) count it once: true for the call that counted it, false for every other.
---@param realCid string the character's real identifier
---@param streak integer the counter value `day` brings them to
---@param day string 'YYYY-MM-DD'
---@return boolean counted
function store.claimRewardDay(realCid, streak, day)
    MySQL.update.await('INSERT IGNORE INTO phone_streaks (citizenid) VALUES (?)', { realCid })
    local changed = MySQL.update.await([[
        UPDATE phone_streaks SET reward_streak = ?, reward_date = ?
        WHERE citizenid = ? AND (reward_date IS NULL OR reward_date < ?)
    ]], { streak, day, realCid, day })
    return (tonumber(changed) or 0) > 0
end

---@type string Shared post projection. Binds the viewer's cid once up front (the `liked` subquery
---powering likedByMe); every caller passes viewer first, then its own params. post_date is read
---back as a 'YYYY-MM-DD' string via DATE_FORMAT.
local POST_SELECT = [[
    SELECT p.id, p.citizenid, p.author_name, p.image_url, p.caption,
           p.day_streak, p.like_count, p.created_at,
           DATE_FORMAT(p.post_date, '%Y-%m-%d') AS post_date,
           (SELECT COUNT(*) FROM phone_streak_likes l WHERE l.post_id = p.id AND l.citizenid = ?) AS liked
    FROM phone_streak_posts p
]]

---Insert a day's post. Returns nil when the insert fails (notably on the uniq_player_day key),
---which the caller treats as "already posted today".
---@param cid string author citizenid
---@param authorName string display-name snapshot (VARCHAR(80))
---@param imageUrl string photo url (VARCHAR(512))
---@param caption string|nil optional caption (VARCHAR(160))
---@param dayStreak integer streak day this post represents
---@param postDate string 'YYYY-MM-DD' server-local date
---@param createdAt integer unix seconds
---@return integer|nil id new post id, nil on failure
function store.insertPost(cid, authorName, imageUrl, caption, dayStreak, postDate, createdAt)
    local ok, id = pcall(MySQL.insert.await, [[
        INSERT INTO phone_streak_posts
            (citizenid, author_name, image_url, caption, day_streak, post_date, like_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    ]], { cid, authorName, imageUrl, caption, dayStreak, postDate, createdAt })
    if not ok then return nil end
    return id
end

---One post by id, projected for a specific viewer (likedByMe). Read-only.
---@param viewer string viewer citizenid
---@param id integer post id
---@return table|nil row POST_SELECT projection
function store.getPost(viewer, id)
    return MySQL.single.await(POST_SELECT .. ' WHERE p.id = ? LIMIT 1', { viewer, id })
end

---Plain post row (no viewer projection) for ownership / existence checks. Read-only.
---@param id integer post id
---@return table|nil row { id, citizenid, like_count }
function store.getPostRow(id)
    return MySQL.single.await('SELECT id, citizenid, like_count FROM phone_streak_posts WHERE id = ?', { id })
end

---The character's post id for a given day, if any. Read-only.
---@param cid string citizenid
---@param postDate string 'YYYY-MM-DD'
---@return integer|nil id
function store.postForDay(cid, postDate)
    return MySQL.scalar.await('SELECT id FROM phone_streak_posts WHERE citizenid = ? AND post_date = ?', { cid, postDate })
end

---A page of the global gallery, newest first. `before` (a created_at unix int) pages backward;
---nil/0 means the first page. Read-only.
---@param viewer string viewer citizenid (for likedByMe)
---@param before integer|nil created_at cursor - only strictly older rows return
---@param limit integer page size (config-fed)
---@return table[] rows post rows (empty on none / query failure)
function store.galleryPosts(viewer, before, limit)
    local n = math.floor(tonumber(limit) or 30)
    if before and tonumber(before) and tonumber(before) > 0 then
        return MySQL.query.await(
            POST_SELECT .. ' WHERE p.created_at < ? ORDER BY p.created_at DESC LIMIT ' .. n,
            { viewer, before }
        ) or {}
    end
    return MySQL.query.await(
        POST_SELECT .. ' ORDER BY p.created_at DESC LIMIT ' .. n,
        { viewer }
    ) or {}
end

---Whether a character has liked a post. Read-only.
---@param postId integer post id
---@param cid string citizenid
---@return boolean liked
function store.isLiked(postId, cid)
    return MySQL.scalar.await('SELECT 1 FROM phone_streak_likes WHERE post_id = ? AND citizenid = ?', { postId, cid }) ~= nil
end

---Record a like. INSERT IGNORE + the uniq_like key make a replayed add idempotent.
---@param postId integer post id
---@param cid string citizenid
function store.addLike(postId, cid)
    MySQL.query.await('INSERT IGNORE INTO phone_streak_likes (post_id, citizenid) VALUES (?, ?)', { postId, cid })
end

---Remove a like, scoped to the (post, character) pair.
---@param postId integer post id
---@param cid string citizenid
function store.removeLike(postId, cid)
    MySQL.update.await('DELETE FROM phone_streak_likes WHERE post_id = ? AND citizenid = ?', { postId, cid })
end

---Persist the cached like_count display column.
---@param postId integer post id
---@param count integer authoritative like total
function store.setLikeCount(postId, count)
    MySQL.update.await('UPDATE phone_streak_posts SET like_count = ? WHERE id = ?', { count, postId })
end

---Authoritative like total: COUNT(*) over the likes table, not the cached column. Read-only.
---@param postId integer post id
---@return integer count
function store.likeCount(postId)
    local row = MySQL.single.await('SELECT COUNT(*) AS n FROM phone_streak_likes WHERE post_id = ?', { postId })
    return row and tonumber(row.n) or 0
end

---Top current streaks (only players actively on one), best first. The display name is the
---author_name of the character's most recent post. Read-only.
---@param limit integer row cap (config-fed)
---@return table[] rows { citizenid, current_streak, author_name }
function store.leaderboard(limit)
    local n = math.floor(tonumber(limit) or 25)
    return MySQL.query.await([[
        SELECT s.citizenid, s.current_streak,
               (SELECT pp.author_name FROM phone_streak_posts pp
                WHERE pp.citizenid = s.citizenid
                ORDER BY pp.created_at DESC LIMIT 1) AS author_name
        FROM phone_streaks s
        WHERE s.current_streak > 0
        ORDER BY s.current_streak DESC
        LIMIT ]] .. n) or {}
end

---Admin/testing: wipe every Streaks table (all players). Not a client callback.
function store.wipeAll()
    MySQL.query.await('DELETE FROM phone_streak_likes')
    MySQL.query.await('DELETE FROM phone_streak_posts')
    MySQL.query.await('DELETE FROM phone_streaks')
end

return store
