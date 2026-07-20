---@type table Player bridge (bridge.server.player): citizenid/source lookups.
local player     = require 'bridge.server.player'
---@type table App-accounts engine store (server.accounts.store): account rows + per-character app sessions.
local acctStore  = require 'server.accounts.store'
---@type table Badges module (server.badges.init): server-authoritative unread-badge pushes.
local badges     = require 'server.badges.init'
---@type table Vibez persistence layer (server.vibez.store): profile/post/comment/follow CRUD.
local store      = require 'server.vibez.store'
---@type table Admin mute registry (server.admin.moderation): scope guards for posting/commenting.
local moderation = require 'server.admin.moderation'
---@type table Vibez Live module (server.vibez.live): in-memory livestream sessions.
local live       = require 'server.vibez.live'

---@type table Actions module; the table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail, trim, flag = util.ok, util.fail, util.trim, util.truthy

---The vibez account the calling player is signed into, resolved from `src` alone. nil when the
---character isn't signed in.
---@param src integer player server id
---@return table|nil account accounts-engine row (username, displayName, ...)
local function viewerAccount(src)
    local cid = player.getIdentifier(src)
    if not cid then return nil end
    return acctStore.getSessionAccount('vibez', cid)
end

---Loads (or bootstraps) the viewer's profile row. A fresh account gets a starter profile seeded
---from its display name; an existing row is returned untouched.
---@param acc table accounts-engine account row
---@return table profile phone_vibez_profiles row
local function ensureProfile(acc)
    local row = store.getProfile(acc.username)
    if row then return row end
    store.upsertProfile(acc.username, {
        displayName = (acc.displayName and acc.displayName ~= '') and acc.displayName or acc.username,
        bio = '', avatar = nil, verified = false, createdAt = os.time(),
    })
    return store.getProfile(acc.username)
end

---Online sources signed into `username`'s vibez account.
---@param username string vibez handle
---@return integer[] sources
local function sourcesFor(username)
    local acc = acctStore.getAccount('vibez', username)
    if not acc then return {} end
    local out = {}
    for _, cid in ipairs(acctStore.sessionCitizens('vibez', acc.id)) do
        local src = player.getSourceByIdentifier(cid)
        if src then out[#out + 1] = src end
    end
    return out
end

---Fans a content change out to every phone (all vibez accounts are public).
---@param event string client event suffix
---@param data table event payload
local function broadcast(event, data)
    TriggerClientEvent('sd-phone:client:vibez:' .. event, -1, data)
end

---Pushes a follow-status change to the follower's phone(s).
---@param follower string acting handle
---@param target string profile being (un)followed
---@param following boolean new state
local function pushFollowStatus(follower, target, following)
    for _, dst in ipairs(sourcesFor(follower)) do
        TriggerClientEvent('sd-phone:client:vibez:followChanged', dst, { target = target, following = following })
    end
end

---UI user card from any row carrying profile columns (author/username, avatar, verified,
---display_name) - the shape web/src/apps/vibez/data.ts renders.
---@param row table row with profile fields
---@return table card
local function userCard(row)
    return {
        id       = row.author or row.username,
        handle   = row.author or row.username,
        avatar   = row.avatar or '',
        verified = flag(row.verified),
        name     = row.display_name or '',
    }
end

---POST_SELECT row -> the React VPost shape. Unix-second timestamps become millis;
---liked/saved/following arrive as per-viewer COUNT columns the store query bound up front.
---@param row table post row
---@return table post
local function serializePost(row)
    return {
        id        = row.id,
        user      = userCard(row),
        video     = row.video,
        thumb     = (row.thumb and row.thumb ~= '') and row.thumb or nil,
        caption   = row.caption or '',
        sound     = row.sound or '',
        likes     = tonumber(row.like_count) or 0,
        liked     = (tonumber(row.liked) or 0) > 0,
        saves     = tonumber(row.save_count) or 0,
        saved     = (tonumber(row.saved) or 0) > 0,
        comments  = tonumber(row.comment_count) or 0,
        views     = tonumber(row.views) or 0,
        following = (tonumber(row.following_author) or 0) > 0,
        createdAt = (tonumber(row.created_at) or 0) * 1000,
    }
end

---Comment row -> the React VComment shape (per-viewer liked flag included by the store query).
---@param row table comment row
---@return table comment
local function serializeComment(row)
    return {
        id        = row.id,
        user      = userCard(row),
        text      = row.body,
        likes     = tonumber(row.like_count) or 0,
        liked     = (tonumber(row.liked) or 0) > 0,
        createdAt = (tonumber(row.created_at) or 0) * 1000,
    }
end

---The Inbox-row suffix per kind (the React side prepends the actor's handle).
---@param kind string notification kind
---@param preview string|nil comment preview text
---@return string suffix
local function notifSuffix(kind, preview)
    if kind == 'like'    then return 'liked your vibe.' end
    if kind == 'comment' then return (preview and preview ~= '') and ('commented: "%s"'):format(preview) or 'commented on your vibe.' end
    if kind == 'mention' then return 'mentioned you.' end
    if kind == 'follow'  then return 'started following you.' end
    if kind == 'post'    then return 'posted a new vibe.' end
    return ''
end

---Notification row -> the React VNotif shape, with the actor's card inlined and a post
---thumbnail only when the row references a post.
---@param row table notification row (actor profile columns LEFT-JOINed)
---@param thumbs table<string, string>|nil postId -> thumb url prefetch
---@return table notification
local function serializeNotif(row, thumbs)
    return {
        id        = row.id,
        kind      = row.kind,
        user      = {
            id       = row.actor,
            handle   = row.actor,
            avatar   = row.avatar or '',
            verified = flag(row.verified),
            name     = row.display_name or '',
        },
        text      = notifSuffix(row.kind, row.preview),
        thumb     = (row.post_id and row.post_id ~= '') and (thumbs and thumbs[row.post_id]) or nil,
        postId    = row.post_id,
        seen      = flag(row.seen),
        createdAt = (tonumber(row.created_at) or 0) * 1000,
    }
end

---Persists an Inbox notification and, if the recipient is online, pushes a refresh ping, a
---banner, and a fresh badge. Self-notifications and empty recipients are dropped.
---@param recipient string recipient handle
---@param kind string notification kind
---@param actor string acting handle
---@param postId string|nil related post id
---@param preview string|nil comment preview (already capped by the caller)
local function notify(recipient, kind, actor, postId, preview)
    if recipient == actor or recipient == '' then return end
    store.insertNotification(store.newId(), recipient, kind, actor, postId, preview, os.time())

    local sources = sourcesFor(recipient)
    if #sources == 0 then return end
    local actorRow  = store.getProfile(actor)
    local actorName = (actorRow and actorRow.display_name ~= '' and actorRow.display_name) or actor
    local thumb     = postId and store.thumbsFor({ postId })[postId] or nil
    for _, src in ipairs(sources) do
        TriggerClientEvent('sd-phone:client:vibez:notification', src, {})
        TriggerClientEvent('sd-phone:client:notify', src, {
            app = 'vibez', appId = 'vibez', title = 'Vibez',
            body = ('%s %s'):format(actorName, notifSuffix(kind, preview)), image = thumb,
            time = 'now', quietInApp = true,
            link = { ['vibez:tab'] = 'inbox' },
        })
        badges.push(src)
    end
end

---Refreshes the badge for a user's online sources.
---@param username string handle
local function bumpBadge(username)
    for _, src in ipairs(sourcesFor(username)) do badges.push(src) end
end

---One http(s) URL clamped to the column width, or nil.
---@param value any raw payload value
---@return string|nil url
local function sanitizeUrl(value)
    local url = trim(value)
    if url:sub(1, 4) ~= 'http' then return nil end
    return url:sub(1, 512)
end

---Handle mentions ("@name") in a caption / comment that resolve to real vibez accounts,
---deduplicated and excluding the author. Lookups cap at 50 per text.
---@param text string caption or comment body (already length-capped)
---@param exclude string author's own handle
---@return string[] handles
local function mentionsIn(text, exclude)
    local seen, out, checked = {}, {}, 0
    for handle in text:gmatch('@([%w_%.]+)') do
        local h = handle:lower()
        if not seen[h] and h ~= exclude then
            seen[h] = true
            checked = checked + 1
            if checked > 50 then break end
            if store.getProfile(h) then out[#out + 1] = h end
        end
    end
    return out
end

---A feed page: 'following' for followed authors only, anything else the For You stream.
---Bootstraps the profile on first open. Read-only.
---@param src integer player server id
---@param payload table { tab?: string }
---@return table result { posts }
function actions.feed(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    ensureProfile(acc)
    local rows = payload.tab == 'following'
        and store.followingPosts(acc.username, 60)
        or store.forYouPosts(acc.username, 60)
    local out = {}
    for _, row in ipairs(rows) do out[#out + 1] = serializePost(row) end
    return ok({ posts = out })
end

---The Discover page: most-viewed posts plus the top hashtags mined from recent captions.
---Read-only.
---@param src integer player server id
---@return table result { posts, trends }
function actions.discover(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    ensureProfile(acc)

    local out = {}
    for _, row in ipairs(store.trendingPosts(acc.username, 30)) do out[#out + 1] = serializePost(row) end

    local counts, order = {}, {}
    for _, caption in ipairs(store.recentCaptions(100)) do
        for tag in caption:gmatch('#([%w_]+)') do
            local key = tag:lower()
            if not counts[key] then counts[key] = 0; order[#order + 1] = key end
            counts[key] = counts[key] + 1
        end
    end
    table.sort(order, function(a, b) return counts[a] > counts[b] end)
    local trends = {}
    for i = 1, math.min(#order, 8) do trends[i] = '#' .. order[i] end

    return ok({ posts = out, trends = trends })
end

---A single post + its comment thread. Read-only.
---@param src integer player server id
---@param payload table { id: string }
---@return table result { post, comments }
function actions.post(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local row = store.getPost(acc.username, trim(payload.id))
    if not row then return fail('Vibe not found') end
    local comments = {}
    for _, c in ipairs(store.commentsFor(row.id, acc.username, 200)) do comments[#comments + 1] = serializeComment(c) end
    return ok({ post = serializePost(row), comments = comments })
end

---Creates a post from a hosted video URL with capped caption/sound, notifies mentions and
---followers, and pings every phone with a content-free feedChanged.
---@param src integer player server id
---@param payload table { video: string, thumb?: string, caption?: string, sound?: string }
---@return table result { post }
function actions.create(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local muted = moderation.guard(player.getIdentifier(src), 'vibez'); if muted then return muted end
    ensureProfile(acc)

    local video = sanitizeUrl(payload.video)
    if not video then return fail('Pick a video first') end
    local thumb   = sanitizeUrl(payload.thumb)
    local caption = trim(payload.caption):sub(1, 300)
    local sound   = trim(payload.sound):sub(1, 120)
    if sound == '' then sound = ('original sound — %s'):format(acc.username) end

    local id = store.newId()
    store.insertPost(id, acc.username, video, thumb, caption, sound, os.time())

    local mentioned = {}
    for _, m in ipairs(mentionsIn(caption, acc.username)) do
        mentioned[m] = true
        notify(m, 'mention', acc.username, id, nil)
    end
    for _, f in ipairs(store.followerUsernames(acc.username)) do
        if not mentioned[f] then notify(f, 'post', acc.username, id, nil) end
    end
    broadcast('feedChanged', {})
    return ok({ post = serializePost(store.getPost(acc.username, id)) })
end

---Deletes one of the viewer's own posts, ownership-checked against the signed-in handle.
---The store cascades comments/likes/saves/notifications; postRemoved broadcasts id-only.
---@param src integer player server id
---@param payload table { id: string }
---@return table result
function actions.deletePost(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local row = store.getPostRow(trim(payload.id))
    if not row then return fail('Vibe not found') end
    if row.author ~= acc.username then return fail('Not your vibe') end
    store.deletePost(row.id)
    broadcast('postRemoved', { postId = row.id })
    return ok()
end

---Toggles the viewer's like on a post. Only liking notifies the author; the fresh count returns
---to the caller and fans out to every phone.
---@param src integer player server id
---@param payload table { id: string }
---@return table result { liked, likes }
function actions.toggleLike(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local row = store.getPostRow(trim(payload.id))
    if not row then return fail('Vibe not found') end

    local nowLiked
    if store.isLiked(row.id, acc.username) then
        store.removeLike(row.id, acc.username)
        nowLiked = false
    else
        store.addLike(row.id, acc.username, os.time())
        nowLiked = true
        notify(row.author, 'like', acc.username, row.id, nil)
    end
    local fresh = store.getPost(acc.username, row.id)
    local likes = fresh and (tonumber(fresh.like_count) or 0) or 0
    broadcast('postChanged', { postId = row.id, likes = likes })
    return ok({ liked = nowLiked, likes = likes })
end

---Toggles a private bookmark on a post. Nothing is broadcast or notified.
---@param src integer player server id
---@param payload table { id: string }
---@return table result { saved, saves }
function actions.toggleSave(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local row = store.getPostRow(trim(payload.id))
    if not row then return fail('Vibe not found') end

    local nowSaved
    if store.isSaved(row.id, acc.username) then
        store.removeSave(row.id, acc.username); nowSaved = false
    else
        store.addSave(row.id, acc.username, os.time()); nowSaved = true
    end
    local fresh = store.getPost(acc.username, row.id)
    return ok({ saved = nowSaved, saves = fresh and (tonumber(fresh.save_count) or 0) or 0 })
end

---Counts one watch of a post. Fire-and-forget from the client; unknown ids are dropped.
---@param src integer player server id
---@param payload table { id: string }
---@return table result
function actions.addView(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local id = trim(payload.id)
    if id ~= '' and store.getPostRow(id) then store.addView(id) end
    return ok()
end

---A post's comment thread on its own. Read-only.
---@param src integer player server id
---@param payload table { postId: string }
---@return table result { comments }
function actions.comments(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local row = store.getPostRow(trim(payload.postId))
    if not row then return fail('Vibe not found') end
    local out = {}
    for _, c in ipairs(store.commentsFor(row.id, acc.username, 200)) do out[#out + 1] = serializeComment(c) end
    return ok({ comments = out })
end

---Adds a comment (capped) to a post, notifying the author and eligible mentions. The refreshed
---count fans out to every phone.
---@param src integer player server id
---@param payload table { postId: string, text: string }
---@return table result { comment, count }
function actions.addComment(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local muted = moderation.guard(player.getIdentifier(src), 'vibez'); if muted then return muted end

    local row = store.getPostRow(trim(payload.postId))
    if not row then return fail('Vibe not found') end

    local text = trim(payload.text):sub(1, 500)
    if text == '' then return fail('Empty comment') end

    local id = store.newId()
    store.insertComment(id, row.id, acc.username, text, os.time())

    notify(row.author, 'comment', acc.username, row.id, text:sub(1, 120))
    for _, m in ipairs(mentionsIn(text, acc.username)) do
        if m ~= row.author then notify(m, 'mention', acc.username, row.id, nil) end
    end

    local fresh = store.commentsFor(row.id, acc.username, 200)
    local serialized
    for _, c in ipairs(fresh) do if c.id == id then serialized = serializeComment(c) end end
    broadcast('postChanged', { postId = row.id, comments = #fresh })
    return ok({ comment = serialized, count = #fresh })
end

---Toggles the viewer's like on a comment.
---@param src integer player server id
---@param payload table { commentId: string }
---@return table result { liked, likes }
function actions.toggleCommentLike(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local row = store.getCommentRow(trim(payload.commentId))
    if not row then return fail('Comment not found') end

    local nowLiked
    if store.isCommentLiked(row.id, acc.username) then
        store.removeCommentLike(row.id, acc.username); nowLiked = false
    else
        store.addCommentLike(row.id, acc.username, os.time()); nowLiked = true
    end
    return ok({ liked = nowLiked, likes = store.commentLikeCount(row.id) })
end

---Full profile header for the React side: card fields + live counts + the viewer's relationship.
---@param acc table viewer's account row
---@param target string profile handle
---@return table|nil profile nil when no such profile exists
local function serializeProfile(acc, target)
    local row = store.getProfile(target)
    if not row then return nil end
    local isMe = target == acc.username
    return {
        username  = row.username,
        name      = row.display_name or '',
        bio       = row.bio or '',
        avatar    = row.avatar or '',
        verified  = flag(row.verified),
        isMe      = isMe,
        following = (not isMe) and store.isFollowing(acc.username, target) or false,
        followsMe = (not isMe) and store.isFollowing(target, acc.username) or false,
        posts     = store.countPosts(target),
        followers = store.countFollowers(target),
        followingCount = store.countFollowing(target),
        likes     = store.countLikesReceived(target),
    }
end

---A profile page header. An empty handle means the viewer's own. Read-only.
---@param src integer player server id
---@param payload table { handle?: string }
---@return table result { profile }
function actions.profile(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    ensureProfile(acc)
    local target = trim(payload.handle)
    if target == '' then target = acc.username else target = target:lower() end
    local profile = serializeProfile(acc, target)
    if not profile then return fail('Profile not found') end
    return ok({ profile = profile })
end

---A profile's post grid. Read-only.
---@param src integer player server id
---@param payload table { handle?: string }
---@return table result { posts }
function actions.profilePosts(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local target = trim(payload.handle)
    if target == '' then target = acc.username else target = target:lower() end
    local out = {}
    for _, p in ipairs(store.postsBy(acc.username, target, 60)) do out[#out + 1] = serializePost(p) end
    return ok({ posts = out })
end

---The viewer's liked posts, newest-liked first. Own grid only. Read-only.
---@param src integer player server id
---@return table result { posts }
function actions.likedPosts(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local out = {}
    for _, p in ipairs(store.likedPosts(acc.username, 60)) do out[#out + 1] = serializePost(p) end
    return ok({ posts = out })
end

---The viewer's saved posts, newest-saved first. Own grid only. Read-only.
---@param src integer player server id
---@return table result { posts }
function actions.savedPosts(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local out = {}
    for _, p in ipairs(store.savedPosts(acc.username, 60)) do out[#out + 1] = serializePost(p) end
    return ok({ posts = out })
end

---Updates the viewer's own profile; the target always comes from the session. Fields cap at
---their column widths; `verified` and created_at are preserved from the existing row.
---@param src integer player server id
---@param payload table { name?: string, bio?: string, avatar?: string }
---@return table result { profile }
function actions.updateProfile(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local existing = ensureProfile(acc)

    local name = trim(payload.name):sub(1, 64)
    if name == '' then name = existing.display_name end

    store.upsertProfile(acc.username, {
        displayName = name,
        bio         = trim(payload.bio):sub(1, 160),
        avatar      = sanitizeUrl(payload.avatar),
        verified    = flag(existing.verified),
        createdAt   = existing.created_at,
    })
    return ok({ profile = serializeProfile(acc, acc.username) })
end

---Follows / unfollows in one toggle. Self-follow and unknown targets are rejected; only a fresh
---follow notifies.
---@param src integer player server id
---@param payload table { handle: string }
---@return table result { following }
function actions.toggleFollow(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local target = trim(payload.handle):lower()
    if target == '' or target == acc.username then return fail('Bad target') end
    if not store.getProfile(target) then return fail('Account not found') end

    local following
    if store.isFollowing(acc.username, target) then
        store.removeFollow(acc.username, target)
        following = false
    else
        store.addFollow(acc.username, target, os.time())
        following = true
        notify(target, 'follow', acc.username, nil, nil)
    end
    pushFollowStatus(acc.username, target, following)
    return ok({ following = following })
end

---Followers / following list for a profile, each card carrying the viewer's relationship to
---that user. Read-only.
---@param src integer player server id
---@param payload table { handle?: string, kind?: string }
---@return table result { users }
function actions.followList(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local target = trim(payload.handle)
    if target == '' then target = acc.username else target = target:lower() end
    local kind = payload.kind == 'following' and 'following' or 'followers'

    local out = {}
    for _, r in ipairs(store.followList(target, kind)) do
        local card = userCard(r)
        card.isMe      = r.username == acc.username
        card.following = (not card.isMe) and store.isFollowing(acc.username, r.username) or false
        out[#out + 1] = card
    end
    return ok({ users = out })
end

---Searches accounts by handle or display name (LIKE '%q%', 20 rows). Empty queries skip the DB;
---the viewer is filtered out of the results. Read-only.
---@param src integer player server id
---@param payload table { query: string }
---@return table result { users }
function actions.search(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local query = trim(payload.query):sub(1, 64):lower()
    if query == '' then return ok({ users = {} }) end
    local out = {}
    for _, r in ipairs(store.searchProfiles(query, 20)) do
        if r.username ~= acc.username then
            local card = userCard(r)
            card.following = store.isFollowing(acc.username, r.username)
            out[#out + 1] = card
        end
    end
    return ok({ users = out })
end

---Active lives the viewer may watch (everyone else's), newest first. Read-only.
---@param src integer player server id
---@return table result { lives }
function actions.lives(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    return ok({ lives = live.activeForViewer(acc.username) })
end

---The Inbox feed (newest 60). Opening it marks everything seen and re-pushes the badge.
---@param src integer player server id
---@return table result { notifications }
function actions.activity(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end

    local rows = store.notificationsFor(acc.username, 60)
    local postIds = {}
    for i = 1, #rows do
        if rows[i].post_id and rows[i].post_id ~= '' then postIds[#postIds + 1] = rows[i].post_id end
    end
    local thumbs = store.thumbsFor(postIds)

    local out = {}
    for _, row in ipairs(rows) do out[#out + 1] = serializeNotif(row, thumbs) end

    store.markNotificationsSeen(acc.username)
    bumpBadge(acc.username)
    return ok({ notifications = out })
end

---Unread count for the in-app Inbox badge. Read-only - marks nothing seen.
---@param src integer player server id
---@return table result { activity }
function actions.counts(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    return ok({ activity = store.unseenNotificationCount(acc.username) })
end

---Swipe-to-dismiss one Inbox row. The delete is recipient-scoped in the store.
---@param src integer player server id
---@param payload table { id: string }
---@return table result
function actions.dismissNotification(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local id = trim(payload.id)
    if id ~= '' then store.deleteNotification(id, acc.username) end
    return ok()
end

---Wipes every trace of the viewer's vibez content (posts, comments, likes, saves, follows,
---notifications, profile), keyed to the signed-in account only.
---@param src integer player server id
---@return table result
function actions.deleteAccount(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    store.wipeUser(acc.username)
    return ok()
end

return actions
