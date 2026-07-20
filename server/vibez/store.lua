---@type table Shared server helpers (server.util): the ensureIndex drop-in upgrade helper.
local util = require 'server.util'

---@type table Store module; the table returned at end of file.
local store = {}

---A fresh random 7-char base36 id for any vibez row (post/comment/notification).
---@return string id
function store.newId()
    return util.newId(7)
end

---Creates every vibez table if missing. Runs once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_profiles (
            username      VARCHAR(64)  NOT NULL,
            display_name  VARCHAR(64)  NOT NULL DEFAULT '',
            bio           VARCHAR(160) NOT NULL DEFAULT '',
            avatar        VARCHAR(512) NULL,
            verified      TINYINT(1)   NOT NULL DEFAULT 0,
            created_at    BIGINT       NOT NULL DEFAULT 0,
            PRIMARY KEY (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_posts (
            id          VARCHAR(16)  NOT NULL,
            author      VARCHAR(64)  NOT NULL,
            video       VARCHAR(512) NOT NULL,
            thumb       VARCHAR(512) NULL,
            caption     VARCHAR(300) NOT NULL DEFAULT '',
            sound       VARCHAR(120) NOT NULL DEFAULT '',
            views       INT UNSIGNED NOT NULL DEFAULT 0,
            created_at  BIGINT       NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_vibez_posts_author (author, created_at),
            INDEX idx_vibez_posts_created (created_at),
            INDEX idx_vibez_posts_views (views)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_likes (
            post_id     VARCHAR(16) NOT NULL,
            username    VARCHAR(64) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (post_id, username),
            INDEX idx_vibez_likes_user (username, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_saves (
            post_id     VARCHAR(16) NOT NULL,
            username    VARCHAR(64) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (username, post_id),
            INDEX idx_vibez_saves_user (username, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_comments (
            id          VARCHAR(16)  NOT NULL,
            post_id     VARCHAR(16)  NOT NULL,
            author      VARCHAR(64)  NOT NULL,
            body        VARCHAR(500) NOT NULL,
            created_at  BIGINT       NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_vibez_comments_post (post_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_comment_likes (
            comment_id  VARCHAR(16) NOT NULL,
            username    VARCHAR(64) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (comment_id, username),
            INDEX idx_vibez_comment_likes_c (comment_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_follows (
            follower    VARCHAR(64) NOT NULL,
            target      VARCHAR(64) NOT NULL,
            created_at  BIGINT      NOT NULL,
            PRIMARY KEY (follower, target),
            INDEX idx_vibez_follows_target (target)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_vibez_notifications (
            id          VARCHAR(16)  NOT NULL,
            recipient   VARCHAR(64)  NOT NULL,
            kind        VARCHAR(16)  NOT NULL,
            actor       VARCHAR(64)  NOT NULL,
            post_id     VARCHAR(16)  NULL,
            preview     VARCHAR(200) NULL,
            seen        TINYINT(1)   NOT NULL DEFAULT 0,
            created_at  BIGINT       NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_vibez_notifs_recipient (recipient, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    util.ensureIndex('phone_vibez_notifications', 'idx_vibez_notifs_unseen', '(recipient, seen)')
end

---A profile row by exact username, nil when the handle doesn't exist. Read-only.
---@param username string account handle
---@return table|nil row
function store.getProfile(username)
    return MySQL.single.await('SELECT * FROM phone_vibez_profiles WHERE username = ?', { username })
end

---Inserts or updates a profile. ON DUPLICATE leaves verified and created_at untouched.
---@param username string account handle
---@param p table { displayName?, bio?, avatar?, verified?, createdAt? }
function store.upsertProfile(username, p)
    MySQL.query.await([[
        INSERT INTO phone_vibez_profiles (username, display_name, bio, avatar, verified, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name), bio = VALUES(bio), avatar = VALUES(avatar)
    ]], {
        username, p.displayName or '', p.bio or '', p.avatar,
        p.verified and 1 or 0, p.createdAt or os.time(),
    })
end

---Matches accounts by handle or display name.
---@param query string search text
---@param limit? integer max rows (default 20)
---@return table[] rows
function store.searchProfiles(query, limit)
    local n = math.floor(tonumber(limit) or 20)
    local like = '%' .. query .. '%'
    return MySQL.query.await(([[
        SELECT * FROM phone_vibez_profiles
        WHERE username LIKE ? OR display_name LIKE ?
        ORDER BY username ASC
        LIMIT %d
    ]]):format(n), { like, like }) or {}
end

---How many posts an author has (profile header stat). Read-only.
---@param username string account handle
---@return integer n
function store.countPosts(username)
    local row = MySQL.single.await('SELECT COUNT(*) AS n FROM phone_vibez_posts WHERE author = ?', { username })
    return row and tonumber(row.n) or 0
end

---Follower count for the profile header. Read-only.
---@param username string account handle
---@return integer n
function store.countFollowers(username)
    local row = MySQL.single.await('SELECT COUNT(*) AS n FROM phone_vibez_follows WHERE target = ?', { username })
    return row and tonumber(row.n) or 0
end

---Following count for the profile header. Read-only.
---@param username string account handle
---@return integer n
function store.countFollowing(username)
    local row = MySQL.single.await('SELECT COUNT(*) AS n FROM phone_vibez_follows WHERE follower = ?', { username })
    return row and tonumber(row.n) or 0
end

---Total hearts an author's posts have collected (profile header stat). Read-only.
---@param username string account handle
---@return integer n
function store.countLikesReceived(username)
    local row = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM phone_vibez_likes l
        JOIN phone_vibez_posts p ON p.id = l.post_id
        WHERE p.author = ?
    ]], { username })
    return row and tonumber(row.n) or 0
end

---True when follower currently follows target. Read-only.
---@param follower string account handle
---@param target string account handle
---@return boolean following
function store.isFollowing(follower, target)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_vibez_follows WHERE follower = ? AND target = ?',
        { follower, target }
    ) ~= nil
end

---Creates a follow edge. INSERT IGNORE makes a replay idempotent.
---@param follower string account handle
---@param target string account handle
---@param createdAt integer unix seconds
function store.addFollow(follower, target, createdAt)
    MySQL.query.await('INSERT IGNORE INTO phone_vibez_follows (follower, target, created_at) VALUES (?, ?, ?)', { follower, target, createdAt })
end

---Delete a follow edge (no-op when absent).
---@param follower string account handle
---@param target string account handle
function store.removeFollow(follower, target)
    MySQL.update.await('DELETE FROM phone_vibez_follows WHERE follower = ? AND target = ?', { follower, target })
end

---Accounts that follow `username` (any kind value) or that `username` follows
---(kind='following'), each row a full profile card. Read-only.
---@param username string account handle
---@param kind string 'following' for the following list; anything else means followers
---@return table[] profile rows
function store.followList(username, kind)
    if kind == 'following' then
        return MySQL.query.await([[
            SELECT pr.* FROM phone_vibez_follows f
            JOIN phone_vibez_profiles pr ON pr.username = f.target
            WHERE f.follower = ?
            ORDER BY f.created_at DESC
        ]], { username }) or {}
    end
    return MySQL.query.await([[
        SELECT pr.* FROM phone_vibez_follows f
        JOIN phone_vibez_profiles pr ON pr.username = f.follower
        WHERE f.target = ?
        ORDER BY f.created_at DESC
    ]], { username }) or {}
end

---Usernames of everyone who follows `username`.
---@param username string account handle
---@return string[] follower usernames
function store.followerUsernames(username)
    local rows = MySQL.query.await('SELECT follower FROM phone_vibez_follows WHERE target = ?', { username }) or {}
    local out = {}
    for _, r in ipairs(rows) do out[#out + 1] = r.follower end
    return out
end

---@type string Shared post projection: the post row + its author's card fields + live counts +
---the viewer's own liked/saved/following flags. Binds the viewer THREE times up front (liked,
---saved, following_author); every caller passes viewer, viewer, viewer first, then its own params.
local POST_SELECT = [[
    SELECT p.id, p.author, p.video, p.thumb, p.caption, p.sound, p.views, p.created_at,
           pr.display_name, pr.avatar, pr.verified,
           (SELECT COUNT(*) FROM phone_vibez_likes l WHERE l.post_id = p.id) AS like_count,
           (SELECT COUNT(*) FROM phone_vibez_comments cc WHERE cc.post_id = p.id) AS comment_count,
           (SELECT COUNT(*) FROM phone_vibez_saves sv WHERE sv.post_id = p.id) AS save_count,
           (SELECT COUNT(*) FROM phone_vibez_likes lv WHERE lv.post_id = p.id AND lv.username = ?) AS liked,
           (SELECT COUNT(*) FROM phone_vibez_saves svv WHERE svv.post_id = p.id AND svv.username = ?) AS saved,
           (SELECT COUNT(*) FROM phone_vibez_follows fw WHERE fw.follower = ? AND fw.target = p.author) AS following_author
    FROM phone_vibez_posts p
    JOIN phone_vibez_profiles pr ON pr.username = p.author
]]

---Persists a new post.
---@param id string post id (store.newId)
---@param author string account handle
---@param video string video URL
---@param thumb string|nil thumbnail URL
---@param caption string caption text
---@param sound string sound label
---@param createdAt integer unix seconds
function store.insertPost(id, author, video, thumb, caption, sound, createdAt)
    MySQL.insert.await([[
        INSERT INTO phone_vibez_posts (id, author, video, thumb, caption, sound, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ]], { id, author, video, thumb, caption, sound, createdAt })
end

---One post through the viewer projection (nil when the id doesn't exist). Read-only.
---@param viewer string viewing account handle
---@param id string post id
---@return table|nil row
function store.getPost(viewer, id)
    return MySQL.single.await(POST_SELECT .. ' WHERE p.id = ? LIMIT 1', { viewer, viewer, viewer, id })
end

---Plain post row (no projection). Read-only.
---@param id string post id
---@return table|nil row { id, author }
function store.getPostRow(id)
    return MySQL.single.await('SELECT id, author FROM phone_vibez_posts WHERE id = ?', { id })
end

---For You feed: recent posts from everyone but the viewer, newest first. Read-only.
---@param viewer string viewing account handle
---@param limit? integer max rows (default 60, server-supplied)
---@return table[] rows
function store.forYouPosts(viewer, limit)
    local n = math.floor(tonumber(limit) or 60)
    return MySQL.query.await((POST_SELECT .. [[
        WHERE p.author <> ?
        ORDER BY p.created_at DESC
        LIMIT %d
    ]]):format(n), { viewer, viewer, viewer, viewer }) or {}
end

---Following feed: posts from accounts the viewer follows, newest first. Read-only.
---@param viewer string viewing account handle
---@param limit? integer max rows (default 60, server-supplied)
---@return table[] rows
function store.followingPosts(viewer, limit)
    local n = math.floor(tonumber(limit) or 60)
    return MySQL.query.await((POST_SELECT .. [[
        WHERE p.author IN (SELECT target FROM phone_vibez_follows WHERE follower = ?)
        ORDER BY p.created_at DESC
        LIMIT %d
    ]]):format(n), { viewer, viewer, viewer, viewer }) or {}
end

---Discover grid: recent posts ranked by view count, never the viewer's own. Read-only.
---@param viewer string viewing account handle
---@param limit? integer max rows (default 30, server-supplied)
---@return table[] rows
function store.trendingPosts(viewer, limit)
    local n = math.floor(tonumber(limit) or 30)
    return MySQL.query.await((POST_SELECT .. [[
        WHERE p.author <> ?
        ORDER BY p.views DESC, p.created_at DESC
        LIMIT %d
    ]]):format(n), { viewer, viewer, viewer, viewer }) or {}
end

---A single author's posts (profile grid), newest first. Read-only.
---@param viewer string viewing account handle
---@param author string profile being viewed
---@param limit? integer max rows (default 60, server-supplied)
---@return table[] rows
function store.postsBy(viewer, author, limit)
    local n = math.floor(tonumber(limit) or 60)
    return MySQL.query.await((POST_SELECT .. [[
        WHERE p.author = ?
        ORDER BY p.created_at DESC
        LIMIT %d
    ]]):format(n), { viewer, viewer, viewer, author }) or {}
end

---Posts the viewer has liked, newest-liked first. Read-only.
---@param viewer string viewing account handle
---@param limit? integer max rows (default 60, server-supplied)
---@return table[] rows
function store.likedPosts(viewer, limit)
    local n = math.floor(tonumber(limit) or 60)
    return MySQL.query.await((POST_SELECT .. [[
        JOIN phone_vibez_likes lk ON lk.post_id = p.id AND lk.username = ?
        ORDER BY lk.created_at DESC
        LIMIT %d
    ]]):format(n), { viewer, viewer, viewer, viewer }) or {}
end

---Posts the viewer has saved/bookmarked, newest-saved first. Read-only.
---@param viewer string viewing account handle
---@param limit? integer max rows (default 60, server-supplied)
---@return table[] rows
function store.savedPosts(viewer, limit)
    local n = math.floor(tonumber(limit) or 60)
    return MySQL.query.await((POST_SELECT .. [[
        JOIN phone_vibez_saves sf ON sf.post_id = p.id AND sf.username = ?
        ORDER BY sf.created_at DESC
        LIMIT %d
    ]]):format(n), { viewer, viewer, viewer, viewer }) or {}
end

---Captions of the most recent posts (Discover hashtag mining). Read-only.
---@param limit? integer max rows (default 100)
---@return string[] captions
function store.recentCaptions(limit)
    local n = math.floor(tonumber(limit) or 100)
    local rows = MySQL.query.await(([[
        SELECT caption FROM phone_vibez_posts
        WHERE caption <> ''
        ORDER BY created_at DESC
        LIMIT %d
    ]]):format(n)) or {}
    local out = {}
    for _, r in ipairs(rows) do out[#out + 1] = r.caption end
    return out
end

---Bumps a post's view counter by one.
---@param id string post id
function store.addView(id)
    MySQL.update.await('UPDATE phone_vibez_posts SET views = views + 1 WHERE id = ?', { id })
end

---Deletes a post and every dependent row, children before parents (comment likes, comments,
---likes, saves, notifications, then the post).
---@param id string post id
function store.deletePost(id)
    MySQL.update.await('DELETE FROM phone_vibez_comment_likes WHERE comment_id IN (SELECT id FROM phone_vibez_comments WHERE post_id = ?)', { id })
    MySQL.update.await('DELETE FROM phone_vibez_comments WHERE post_id = ?', { id })
    MySQL.update.await('DELETE FROM phone_vibez_likes WHERE post_id = ?', { id })
    MySQL.update.await('DELETE FROM phone_vibez_saves WHERE post_id = ?', { id })
    MySQL.update.await('DELETE FROM phone_vibez_notifications WHERE post_id = ?', { id })
    MySQL.update.await('DELETE FROM phone_vibez_posts WHERE id = ?', { id })
end

---Whether `username` currently likes a post. Read-only.
---@param postId string post id
---@param username string account handle
---@return boolean liked
function store.isLiked(postId, username)
    return MySQL.scalar.await('SELECT 1 FROM phone_vibez_likes WHERE post_id = ? AND username = ?', { postId, username }) ~= nil
end

---Records a like. INSERT IGNORE makes a replayed like idempotent.
---@param postId string post id
---@param username string account handle
---@param createdAt integer unix seconds
function store.addLike(postId, username, createdAt)
    MySQL.query.await('INSERT IGNORE INTO phone_vibez_likes (post_id, username, created_at) VALUES (?, ?, ?)', { postId, username, createdAt })
end

---Remove a like (no-op when absent).
---@param postId string post id
---@param username string account handle
function store.removeLike(postId, username)
    MySQL.update.await('DELETE FROM phone_vibez_likes WHERE post_id = ? AND username = ?', { postId, username })
end

---Whether `username` has saved a post. Read-only.
---@param postId string post id
---@param username string account handle
---@return boolean saved
function store.isSaved(postId, username)
    return MySQL.scalar.await('SELECT 1 FROM phone_vibez_saves WHERE post_id = ? AND username = ?', { postId, username }) ~= nil
end

---Records a save. INSERT IGNORE makes a replay idempotent.
---@param postId string post id
---@param username string account handle
---@param createdAt integer unix seconds
function store.addSave(postId, username, createdAt)
    MySQL.query.await('INSERT IGNORE INTO phone_vibez_saves (post_id, username, created_at) VALUES (?, ?, ?)', { postId, username, createdAt })
end

---Remove a save (no-op when absent).
---@param postId string post id
---@param username string account handle
function store.removeSave(postId, username)
    MySQL.update.await('DELETE FROM phone_vibez_saves WHERE post_id = ? AND username = ?', { postId, username })
end

---Persists a comment.
---@param id string comment id (store.newId)
---@param postId string parent post id
---@param author string account handle
---@param body string comment text
---@param createdAt integer unix seconds
function store.insertComment(id, postId, author, body, createdAt)
    MySQL.insert.await([[
        INSERT INTO phone_vibez_comments (id, post_id, author, body, created_at)
        VALUES (?, ?, ?, ?, ?)
    ]], { id, postId, author, body, createdAt })
end

---A post's comments, oldest first, each with its author card, live like count, and a per-viewer
---liked flag. Read-only.
---@param postId string post id
---@param viewer string viewing account handle
---@param limit? integer max rows (default 200, server-supplied)
---@return table[] rows
function store.commentsFor(postId, viewer, limit)
    local n = math.floor(tonumber(limit) or 200)
    return MySQL.query.await(([[
        SELECT c.id, c.post_id, c.author, c.body, c.created_at,
               pr.display_name, pr.avatar, pr.verified,
               (SELECT COUNT(*) FROM phone_vibez_comment_likes cl WHERE cl.comment_id = c.id) AS like_count,
               (SELECT COUNT(*) FROM phone_vibez_comment_likes clv WHERE clv.comment_id = c.id AND clv.username = ?) AS liked
        FROM phone_vibez_comments c
        JOIN phone_vibez_profiles pr ON pr.username = c.author
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
        LIMIT %d
    ]]):format(n), { viewer, postId }) or {}
end

---Plain comment row. Read-only.
---@param id string comment id
---@return table|nil row { id, post_id, author }
function store.getCommentRow(id)
    return MySQL.single.await('SELECT id, post_id, author FROM phone_vibez_comments WHERE id = ?', { id })
end

---Whether `username` currently likes a comment. Read-only.
---@param commentId string comment id
---@param username string account handle
---@return boolean liked
function store.isCommentLiked(commentId, username)
    return MySQL.scalar.await('SELECT 1 FROM phone_vibez_comment_likes WHERE comment_id = ? AND username = ?', { commentId, username }) ~= nil
end

---Records a comment like. INSERT IGNORE makes a replay idempotent.
---@param commentId string comment id
---@param username string account handle
---@param createdAt integer unix seconds
function store.addCommentLike(commentId, username, createdAt)
    MySQL.query.await('INSERT IGNORE INTO phone_vibez_comment_likes (comment_id, username, created_at) VALUES (?, ?, ?)', { commentId, username, createdAt })
end

---Remove a comment like (no-op when absent).
---@param commentId string comment id
---@param username string account handle
function store.removeCommentLike(commentId, username)
    MySQL.update.await('DELETE FROM phone_vibez_comment_likes WHERE comment_id = ? AND username = ?', { commentId, username })
end

---Live like count for one comment. Read-only.
---@param commentId string comment id
---@return integer n
function store.commentLikeCount(commentId)
    local row = MySQL.single.await('SELECT COUNT(*) AS n FROM phone_vibez_comment_likes WHERE comment_id = ?', { commentId })
    return row and tonumber(row.n) or 0
end

---Persists an Inbox notification.
---@param id string notification id (store.newId)
---@param recipient string account handle receiving it
---@param kind string notification kind (like/comment/mention/follow/post)
---@param actor string account handle that caused it
---@param postId string|nil related post id
---@param preview string|nil short body preview
---@param createdAt integer unix seconds
function store.insertNotification(id, recipient, kind, actor, postId, preview, createdAt)
    MySQL.insert.await([[
        INSERT INTO phone_vibez_notifications (id, recipient, kind, actor, post_id, preview, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ]], { id, recipient, kind, actor, postId, preview, createdAt })
end

---A recipient's notifications, newest first, each with the actor's profile card. Read-only.
---@param recipient string account handle
---@param limit? integer max rows (default 60, server-supplied)
---@return table[] rows
function store.notificationsFor(recipient, limit)
    local n = math.floor(tonumber(limit) or 60)
    return MySQL.query.await(([[
        SELECT n.id, n.kind, n.actor, n.post_id, n.preview, n.seen, n.created_at,
               pr.display_name, pr.avatar, pr.verified
        FROM phone_vibez_notifications n
        LEFT JOIN phone_vibez_profiles pr ON pr.username = n.actor
        WHERE n.recipient = ?
        ORDER BY n.created_at DESC
        LIMIT %d
    ]]):format(n), { recipient }) or {}
end

---Marks every unseen notification seen.
---@param recipient string account handle
function store.markNotificationsSeen(recipient)
    MySQL.update.await('UPDATE phone_vibez_notifications SET seen = 1 WHERE recipient = ? AND seen = 0', { recipient })
end

---Deletes one of the recipient's own notifications, scoped to the owner.
---@param id string notification id
---@param recipient string owning account handle
function store.deleteNotification(id, recipient)
    MySQL.update.await('DELETE FROM phone_vibez_notifications WHERE id = ? AND recipient = ?', { id, recipient })
end

---Unseen-notification count for the app badge. Read-only.
---@param recipient string account handle
---@return integer n
function store.unseenNotificationCount(recipient)
    local row = MySQL.single.await('SELECT COUNT(*) AS n FROM phone_vibez_notifications WHERE recipient = ? AND seen = 0', { recipient })
    return row and tonumber(row.n) or 0
end

---Thumbnails (thumb, falling back to the video URL) for many posts in one query. Returns a
---postId -> url map; ids with no post are absent. Read-only.
---@param postIds string[]
---@return table<string, string> postId -> thumb/video url
function store.thumbsFor(postIds)
    if type(postIds) ~= 'table' then return {} end
    local seen, list = {}, {}
    for i = 1, #postIds do
        local id = postIds[i]
        if id and id ~= '' and not seen[id] then seen[id] = true; list[#list + 1] = id end
    end
    if #list == 0 then return {} end
    local placeholders = ('?,'):rep(#list):sub(1, -2)
    local rows = MySQL.query.await(
        'SELECT id, video, thumb FROM phone_vibez_posts WHERE id IN (' .. placeholders .. ')', list) or {}
    local out = {}
    for i = 1, #rows do
        local r = rows[i]
        out[r.id] = (r.thumb and r.thumb ~= '') and r.thumb or r.video
    end
    return out
end

---Erases every trace of an account: the user's own rows plus other users' rows that hang off
---them, children before parents.
---@param username string account handle being wiped
function store.wipeUser(username)
    MySQL.update.await('DELETE FROM phone_vibez_comment_likes WHERE comment_id IN (SELECT id FROM phone_vibez_comments WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?))', { username })
    MySQL.update.await('DELETE FROM phone_vibez_comment_likes WHERE comment_id IN (SELECT id FROM phone_vibez_comments WHERE author = ?)', { username })
    MySQL.update.await('DELETE FROM phone_vibez_comment_likes WHERE username = ?', { username })
    MySQL.update.await('DELETE FROM phone_vibez_comments WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?)', { username })
    MySQL.update.await('DELETE FROM phone_vibez_comments WHERE author = ?', { username })
    MySQL.update.await('DELETE FROM phone_vibez_likes WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?)', { username })
    MySQL.update.await('DELETE FROM phone_vibez_likes WHERE username = ?', { username })
    MySQL.update.await('DELETE FROM phone_vibez_saves WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?)', { username })
    MySQL.update.await('DELETE FROM phone_vibez_saves WHERE username = ?', { username })
    MySQL.update.await('DELETE FROM phone_vibez_notifications WHERE recipient = ? OR actor = ?', { username, username })
    MySQL.update.await('DELETE FROM phone_vibez_follows WHERE follower = ? OR target = ?', { username, username })
    MySQL.update.await('DELETE FROM phone_vibez_posts WHERE author = ?', { username })
    MySQL.update.await('DELETE FROM phone_vibez_profiles WHERE username = ?', { username })
end

return store
