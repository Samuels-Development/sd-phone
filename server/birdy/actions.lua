---@type table sd-phone config root (configs/config.lua): Birdy bounds + the mail domain for email sign-in.
local config = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid lookups + cid -> online source resolution.
local player = require 'bridge.server.player'
---@type table Birdy persistence layer (server.birdy.store): profile/post/like/follow/DM/notification CRUD.
local store = require 'server.birdy.store'
---@type table Accounts engine store (server.accounts.store): global credential rows + per-app sessions.
local acctStore = require 'server.accounts.store'
---@type table Accounts engine actions (server.accounts.actions): createAccount + verifyPassword.
local acctActions = require 'server.accounts.actions'
---@type table Settings persistence (server.settings.store): citizenid -> phone number for money DMs.
local settings = require 'server.settings.store'
---@type table Banking actions (server.banking.actions): authoritative money transfer for money DMs.
local banking = require 'server.banking.actions'

---@type table Birdy config (config.Birdy): field bounds + feed/notification limits.
local birdyCfg = config.Birdy

---@type table Actions module; the table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail = util.ok, util.fail

---Trims surrounding whitespace. Returns nil for non-strings.
---@param s any
---@return string|nil
local function trimmed(s)
    if type(s) ~= 'string' then return nil end
    return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

---Coerces an untrusted callback payload into a table; scalars collapse to {}.
---@param payload any
---@return table
local function tbl(payload)
    return type(payload) == 'table' and payload or {}
end

---Normalises a user-supplied username into a handle: lowercase, keeping only letters, digits
---and underscores.
---@param raw any
---@return string|nil
local function normalizeHandle(raw)
    if type(raw) ~= 'string' then return nil end
    return (raw:lower():gsub('[^a-z0-9_]', ''))
end

---Cleans a client-supplied image list into at most 3 non-empty URL strings (each capped at 512
---chars), or nil.
---@param raw any
---@return string[]|nil
local function sanitizeImages(raw)
    if type(raw) ~= 'table' then return nil end
    local out = {}
    for i = 1, #raw do
        local u = raw[i]
        if type(u) == 'string' then
            u = (u:gsub('^%s+', ''):gsub('%s+$', ''))
            if #u > 0 and #u <= 512 then
                out[#out + 1] = u
                if #out >= 3 then break end
            end
        end
    end
    if #out == 0 then return nil end
    return out
end

---Compact relative label ("now", "5m", "2h", "3d", "2w") for a ms timestamp.
---@param ms number
---@return string
local function relativeLabel(ms)
    local secs = math.max(0, os.time() - math.floor(ms / 1000))
    if secs < 60 then return 'now' end
    local mins = math.floor(secs / 60)
    if mins < 60 then return mins .. 'm' end
    local hours = math.floor(mins / 60)
    if hours < 24 then return hours .. 'h' end
    local days = math.floor(hours / 24)
    if days < 7 then return days .. 'd' end
    return math.floor(days / 7) .. 'w'
end

---HH:MM clock label for a ms timestamp.
---@param ms number
---@return string
local function timeLabel(ms)
    return os.date('%H:%M', math.floor(ms / 1000))
end

---Resolves the requesting player's signed-in Birdy profile through the shared accounts engine
---session. Returns nil when signed out.
---@param source number player server id
---@return table|nil profile
local function viewer(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    local acc = acctStore.getSessionAccount('birdy', cid)
    if not acc then return nil end
    return store.getProfileByHandle(acc.username)
end

---Resolves a viewer citizenid for the public read actions: the signed-in account's cid, or ''
---for a guest.
---@param source number player server id
---@return string viewerCid '' = anonymous guest
local function optionalViewerCid(source)
    local prof = viewer(source)
    return prof and prof.citizenid or ''
end

---Public author shape embedded in posts, notifications and conversation heads.
---@param profile table
---@return { name: string, handle: string, verified: boolean }
local function serializeAuthor(profile)
    return { name = profile.displayName, handle = profile.handle, verified = profile.verified }
end

---Shapes a full profile (with live follow counts) for the profile page.
---@param profile table
---@return table
local function serializeProfile(profile)
    return {
        name      = profile.displayName,
        handle    = profile.handle,
        verified  = profile.verified,
        bio       = profile.bio or '',
        -- Derived from created_at; join_label was client-writable.
        joined    = profile.createdTs and os.date('%B %Y', profile.createdTs) or (profile.joinLabel or ''),
        protected = profile.protected == true,
        following = store.countFollowing(profile.citizenid),
        followers = store.countFollowers(profile.citizenid),
    }
end

---Shapes a hydrated post row into the React `BirdyPost` form. `images` is nil or the
---store-decoded array of up to 3 URLs; the repost count is pinned at 0.
---@param p table
---@return table
local function serializePost(p)
    return {
        id        = p.id,
        author    = { name = p.displayName, handle = p.handle, verified = p.verified },
        body      = p.body,
        images    = p.images,
        createdAt = p.createdMs,
        replies   = p.replies,
        reposts   = p.reposts,
        reposted  = p.reposted,
        likes     = p.likes,
        liked     = p.liked,
        views     = p.views,
    }
end

---Auth state for the requesting player: whether they're signed in, and their public profile
---when they are. Read-only.
---@param source number player server id
---@return table envelope
function actions.me(source)
    local prof = viewer(source)
    if not prof then return ok({ loggedIn = false }) end
    return ok({ loggedIn = true, me = serializeAuthor(prof) })
end

---Registers a new Birdy account and signs the character in. Handle uniqueness is checked
---against both stores; every field is trimmed and bounds-checked against config.Birdy.
---@param source number player server id
---@param payload { name?: string, username?: string, password?: string, bio?: string, email?: string, phone?: string }
---@return table envelope
function actions.register(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end
    payload = tbl(payload)

    local name = trimmed(payload.name)
    if not name or #name < 1 then return fail('Name is required') end
    if #name > birdyCfg.MaxNameLength then return fail('Name is too long') end

    local handle = normalizeHandle(payload.username)
    if not handle or #handle < birdyCfg.MinHandleLength then
        return fail(('Username needs at least %d letters, numbers or _'):format(birdyCfg.MinHandleLength))
    end
    if #handle > birdyCfg.MaxHandleLength then
        return fail(('Username must be %d characters or fewer'):format(birdyCfg.MaxHandleLength))
    end

    local password = payload.password
    if type(password) ~= 'string' or #password < birdyCfg.MinPasswordLength then
        return fail(('Password must be at least %d characters'):format(birdyCfg.MinPasswordLength))
    end
    if #password > birdyCfg.MaxPasswordLength then return fail('Password is too long') end

    local bio = trimmed(payload.bio) or ''
    if #bio > birdyCfg.MaxBioLength then return fail('Bio is too long') end

    if not trimmed(payload.email) or trimmed(payload.email) == '' then
        return fail('Email is required so you can recover the account')
    end

    if store.getProfileByHandle(handle) or acctStore.getAccount('birdy', handle) then
        return fail('That username is taken')
    end
    if store.getProfile(cid) then
        return fail('This character already created a Birdy account. Log into it instead')
    end

    local acctRes = acctActions.createAccount('birdy', {
        username = handle, password = password, name = name,
        email = payload.email, phone = payload.phone,
    })
    if not acctRes.success then return acctRes end

    if not store.insertAccount(cid, handle, name, store.hashPassword(password), bio, birdyCfg.DefaultVerified == true, os.date('%B %Y')) then
        acctStore.deleteAccount(acctRes.data.account.id)
        return fail('Failed to create the account')
    end
    acctStore.setSession('birdy', cid, acctRes.data.account.id)
    store.setLoggedIn(cid, true)

    return ok({ me = serializeAuthor(store.getProfile(cid)) })
end

---Signs in to any existing Birdy account by handle + password. Accepts the handle or the linked
---email; a bare handle that matches no account retries as handle@<mail domain>.
---@param source number player server id
---@param payload { username?: string, password?: string }
---@return table envelope
function actions.login(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end
    payload = tbl(payload)

    local raw = trimmed(payload.username) or ''
    local acc
    if raw:find('@', 1, true) then
        local matches = acctStore.findAccountsByContact('birdy', raw:lower(), nil)
        if #matches == 1 then acc = matches[1] end
    else
        local handle = normalizeHandle(raw)
        if handle and handle ~= '' then
            acc = acctStore.getAccount('birdy', handle)
            if not acc then
                local matches = acctStore.findAccountsByContact('birdy', handle .. '@' .. config.Mail.Domain, nil)
                if #matches == 1 then acc = matches[1] end
            end
        end
    end
    if not acc or not acctActions.verifyPassword(acc, payload.password) then
        return fail('Wrong username or password')
    end
    local prof = store.getProfileByHandle(acc.username)
    if not prof then return fail('That account has no Birdy profile') end

    acctStore.setSession('birdy', cid, acc.id)
    store.setLoggedIn(prof.citizenid, true)
    return ok({ me = serializeAuthor(prof) })
end

---Signs out: keeps the account, drops this character's engine session. Idempotent.
---@param source number player server id
---@return table envelope
function actions.logout(source)
    local cid = player.getIdentifier(source)
    if cid then
        acctStore.clearSession('birdy', cid)
        store.setLoggedIn(cid, false)
    end
    return ok()
end

---A profile page: another account's when payload.handle is given, otherwise the signed-in
---viewer's own. isFollowing is only computed for a signed-in viewer. Read-only.
---@param source number player server id
---@param payload { handle?: string }|nil
---@return table envelope
function actions.profile(source, payload)
    payload = tbl(payload)
    local viewerCid = optionalViewerCid(source)
    local handle = payload and payload.handle and normalizeHandle(payload.handle)
    local prof
    if handle and handle ~= '' then
        prof = store.getProfileByHandle(handle)
    elseif viewerCid ~= '' then
        prof = store.getProfile(viewerCid)
    end
    if not prof then return fail('Profile not found') end

    local data = serializeProfile(prof)
    local isMe = viewerCid ~= '' and prof.citizenid == viewerCid
    data.isMe = isMe
    data.isFollowing = ((not isMe) and viewerCid ~= '' and store.isFollowing(viewerCid, prof.citizenid)) or false
    return ok({ profile = data })
end

---Posts for a profile tab: 'posts', 'replies', 'media', or 'likes'. targetCid = whose posts,
---viewerCid = whose like-state colours the hearts. Read-only.
---@param source number player server id
---@param payload { kind?: string, handle?: string }|nil
---@return table envelope
function actions.profilePosts(source, payload)
    payload = tbl(payload)
    local viewerCid = optionalViewerCid(source)
    local handle = payload and payload.handle and normalizeHandle(payload.handle)
    local targetCid
    if handle and handle ~= '' then
        local tp = store.getProfileByHandle(handle)
        targetCid = tp and tp.citizenid
    elseif viewerCid ~= '' then
        targetCid = viewerCid
    end
    if not targetCid then return fail('Profile not found') end
    local kind = (payload and payload.kind) or 'posts'

    local rows
    if kind == 'likes' then
        rows = store.listLikedBy(targetCid, viewerCid, birdyCfg.FeedLimit)
    else
        rows = store.listPostsBy(targetCid, kind, viewerCid, birdyCfg.FeedLimit)
    end

    local posts = {}
    for i = 1, #rows do posts[i] = serializePost(rows[i]) end
    return ok({ posts = posts })
end

---Searches accounts by handle/display name substring for the Search tab (query capped at 64
---chars). Read-only.
---@param source number player server id
---@param payload { query?: string }|nil
---@return table envelope
function actions.search(source, payload)
    payload = tbl(payload)
    local viewerCid = optionalViewerCid(source)
    local q = trimmed(payload and payload.query)
    if not q or #q == 0 then return ok({ users = {} }) end
    local rows = store.searchProfiles(q:sub(1, 64), viewerCid, 20)
    local users = {}
    for i = 1, #rows do
        users[i] = { name = rows[i].displayName, handle = rows[i].handle, verified = rows[i].verified }
    end
    return ok({ users = users })
end

---Updates the signed-in user's editable profile fields. Missing fields keep their current
---value; everything is trimmed and bounds-checked.
---@param source number player server id
---@param payload { name?: string, bio?: string, protected?: boolean }|nil
---@return table envelope
function actions.updateProfile(source, payload)
    local prof = viewer(source); if not prof then return fail('Not signed in') end
    payload = tbl(payload)

    local name = trimmed(payload.name) or prof.displayName
    if #name < 1 then return fail('Name is required') end
    if #name > birdyCfg.MaxNameLength then return fail('Name is too long') end

    local bio = trimmed(payload.bio) or ''
    if #bio > birdyCfg.MaxBioLength then return fail('Bio is too long') end

    -- joinLabel is ignored; the join date is derived from created_at.
    store.updateProfileFields(prof.citizenid, name, bio, prof.joinLabel or '', payload.protected == true)
    return ok({ profile = serializeProfile(store.getProfile(prof.citizenid)) })
end

---Changes the signed-in user's password, syncing the engine hash, the Passwords-app vault copy,
---and Birdy's legacy profile-row hash.
---@param source number player server id
---@param payload { password?: string }|nil
---@return table envelope
function actions.changePassword(source, payload)
    local cid = player.getIdentifier(source)
    local acc = cid and acctStore.getSessionAccount('birdy', cid) or nil
    if not acc then return fail('Not signed in') end
    payload = tbl(payload)
    local password = payload and payload.password
    if type(password) ~= 'string' or #password < birdyCfg.MinPasswordLength then
        return fail(('Password must be at least %d characters'):format(birdyCfg.MinPasswordLength))
    end
    if #password > birdyCfg.MaxPasswordLength then return fail('Password is too long') end
    acctStore.setPassword(acc.id, acctStore.hashPassword(password))
    acctStore.syncVaultPassword('birdy', acc.username, password)
    local prof = store.getProfileByHandle(acc.username)
    if prof then store.setPassword(prof.citizenid, store.hashPassword(password)) end
    return ok()
end

---Permanently deletes the signed-in user's account and all of its content: content rows first,
---then the engine account.
---@param source number player server id
---@return table envelope
function actions.deleteAccount(source)
    local cid = player.getIdentifier(source)
    local acc = cid and acctStore.getSessionAccount('birdy', cid) or nil
    if not acc then return fail('Not signed in') end
    local prof = store.getProfileByHandle(acc.username)
    if prof then store.deleteAccount(prof.citizenid) end
    acctStore.deleteAccount(acc.id)
    return ok()
end

---Top-level feed, newest first. The "Following" filter needs a signed-in viewer; guests always
---get the public "all" feed. Read-only.
---@param source number player server id
---@param payload { following?: boolean }|nil
---@return table envelope
function actions.feed(source, payload)
    payload = tbl(payload)
    local viewerCid = optionalViewerCid(source)
    local following = viewerCid ~= '' and payload and payload.following == true
    local rows = store.listFeed(viewerCid, birdyCfg.FeedLimit, following)
    local posts = {}
    for i = 1, #rows do posts[i] = serializePost(rows[i]) end
    return ok({ posts = posts })
end

---A single post with its reply thread. The view counter bumps for non-authors before the read.
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.post(source, payload)
    payload = tbl(payload)
    local viewerCid = optionalViewerCid(source)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' then return fail('Post id required') end

    store.bumpViews(id, viewerCid)
    local row = store.getPost(id, viewerCid)
    if not row then return fail('Post not found') end

    local post = serializePost(row)
    local replyRows = store.listReplies(id, viewerCid)
    local thread = {}
    for i = 1, #replyRows do thread[i] = serializePost(replyRows[i]) end
    post.thread = thread

    return ok({ post = post })
end

---Creates a top-level post as the session profile. A post needs text OR at least one image; the
---body is trimmed and capped, images are whitelisted, and the row id is server-generated.
---@param source number player server id
---@param payload { body?: string, images?: string[] }|nil
---@return table envelope
function actions.create(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local body = trimmed(payload and payload.body) or ''
    local images = sanitizeImages(payload and payload.images)
    if body == '' and not images then return fail('Post cannot be empty') end
    if #body > birdyCfg.MaxPostLength then return fail('Post is too long') end

    local id = store.newId()
    if not store.insertPost(id, prof.citizenid, body, nil, images) then return fail('Failed to post') end

    -- First-party hook: one server-local event per created post; the payload carries a citizenid.
    TriggerEvent('sd-phone:server:birdy:post', {
        id = id, source = source, citizenid = prof.citizenid,
        username = prof.handle, displayName = prof.displayName,
        body = body, images = images,
    })

    -- The TriggerEvent above is server-local; this is what reaches players.
    TriggerClientEvent('sd-phone:client:birdy:feedChanged', -1, {})

    return ok({ post = serializePost(store.getPost(id, prof.citizenid)) })
end

---Replies to a post; the parent must exist. Returns the new reply plus the recipient citizenid
---for the parent-author notification (never for self-replies).
---@param source number player server id
---@param payload { parentId?: string, body?: string }|nil
---@return table envelope
function actions.reply(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local parentId = payload and payload.parentId
    local body = trimmed(payload and payload.body)
    if type(parentId) ~= 'string' or parentId == '' then return fail('Missing post') end
    if not body or body == '' then return fail('Reply cannot be empty') end
    if #body > birdyCfg.MaxPostLength then return fail('Reply is too long') end

    local parentAuthor = store.getPostAuthor(parentId)
    if not parentAuthor then return fail('Post not found') end

    local id = store.newId()
    if not store.insertPost(id, prof.citizenid, body, parentId, nil) then return fail('Failed to reply') end

    local notifyCid = nil
    if parentAuthor ~= prof.citizenid then
        store.insertNotification(store.newId(), parentAuthor, 'reply', prof.citizenid, id)
        notifyCid = parentAuthor
    end

    return ok({ post = serializePost(store.getPost(id, prof.citizenid)), notifyCid = notifyCid })
end

---Toggles the viewer's like on a post. Returns the new liked state plus the author citizenid to
---notify when a like was just added (not on unlike, never for self-likes).
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.toggleLike(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' then return fail('Missing post') end

    local author = store.getPostAuthor(id)
    if not author then return fail('Post not found') end

    local nowLiked
    if store.isLiked(id, prof.citizenid) then
        store.removeLike(id, prof.citizenid)
        nowLiked = false
    else
        store.addLike(id, prof.citizenid)
        nowLiked = true
    end

    local notifyCid = nil
    if nowLiked and author ~= prof.citizenid then
        store.insertNotification(store.newId(), author, 'like', prof.citizenid, id)
        notifyCid = author
    end

    return ok({ liked = nowLiked, notifyCid = notifyCid })
end

---Toggles a repost of a post. Mirrors toggleLike: idempotent per (post, citizen), and notifies
---the post's author on a new repost (never on un-repost, never for self-reposts).
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.toggleRepost(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' then return fail('Missing post') end

    local author = store.getPostAuthor(id)
    if not author then return fail('Post not found') end

    local nowReposted
    if store.isReposted(id, prof.citizenid) then
        store.removeRepost(id, prof.citizenid)
        nowReposted = false
    else
        store.addRepost(id, prof.citizenid)
        nowReposted = true
    end

    local notifyCid = nil
    if nowReposted and author ~= prof.citizenid then
        store.insertNotification(store.newId(), author, 'repost', prof.citizenid, id)
        notifyCid = author
    end

    return ok({ reposted = nowReposted, notifyCid = notifyCid })
end

---Followers or following for a handle (defaulting to the viewer's own profile), shaped for the
---FollowList screen. Read-only.
---@param source number player server id
---@param payload { kind?: 'followers'|'following', handle?: string }|nil
---@return table envelope
function actions.followList(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)

    local kind = payload.kind == 'following' and 'following' or 'followers'

    -- No handle means own list; an unknown handle is empty, not an error.
    local targetCid = prof.citizenid
    local handle = payload.handle and normalizeHandle(payload.handle)
    if handle and handle ~= '' and handle ~= prof.handle then
        local tp = store.getProfileByHandle(handle)
        if not tp then return ok({ users = {} }) end
        targetCid = tp.citizenid
    end

    local users = {}
    for _, row in ipairs(store.followList(prof.citizenid, targetCid, kind)) do
        users[#users + 1] = {
            name        = row.display_name,
            handle      = row.handle,
            verified    = tonumber(row.verified) == 1,
            bio         = row.bio or '',
            followsYou  = tonumber(row.follows_you) == 1,
            isFollowing = tonumber(row.is_following) == 1,
        }
    end
    return ok({ users = users })
end

---Toggles following another account, addressed by handle (preferred) or citizenid. Self-follows
---are rejected. Returns the target to notify on a new follow (not on unfollow).
---@param source number player server id
---@param payload { handle?: string, targetCid?: string }|nil
---@return table envelope
function actions.toggleFollow(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local handle = payload and payload.handle and normalizeHandle(payload.handle)
    local target = payload and payload.targetCid
    if handle and handle ~= '' then
        local tp = store.getProfileByHandle(handle)
        target = tp and tp.citizenid
    end
    if type(target) ~= 'string' or target == '' or #target > 64 then return fail('Missing account') end
    if target == prof.citizenid then return fail('You cannot follow yourself') end

    local notifyCid = nil
    local nowFollowing
    if store.isFollowing(prof.citizenid, target) then
        store.removeFollow(prof.citizenid, target)
        nowFollowing = false
    else
        store.addFollow(prof.citizenid, target)
        nowFollowing = true
        store.insertNotification(store.newId(), target, 'follow', prof.citizenid, nil)
        notifyCid = target
    end

    return ok({ following = nowFollowing, notifyCid = notifyCid })
end

---Lists the viewer's notifications, serialized into the React union shape. Reply notifications
---embed the reply post; like/follow rows resolve the actor's public profile. Read-only.
---@param source number player server id
---@return table envelope
function actions.notifications(source)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    local rows = store.listNotifications(prof.citizenid, birdyCfg.NotificationLimit)

    local actorCids = {}
    for i = 1, #rows do actorCids[#actorCids + 1] = rows[i].actor_cid end
    local profiles = store.getProfilesByCids(actorCids)

    local replyPostIds = {}
    for i = 1, #rows do
        if rows[i].kind == 'reply' and rows[i].post_id then replyPostIds[#replyPostIds + 1] = rows[i].post_id end
    end
    local replyPosts = store.postsByIds(replyPostIds, prof.citizenid)

    local items = {}
    for i = 1, #rows do
        local r = rows[i]
        if r.kind == 'reply' and r.post_id then
            local postRow = replyPosts[r.post_id]
            if postRow then
                items[#items + 1] = { id = r.id, kind = 'reply', post = serializePost(postRow) }
            end
        else
            local ap = profiles[r.actor_cid]
            local user = ap and serializeAuthor(ap) or { name = 'Someone', handle = 'someone', verified = false }
            if r.kind == 'like' then
                items[#items + 1] = { id = r.id, kind = 'like', user = user, text = 'liked your post' }
            elseif r.kind == 'repost' then
                items[#items + 1] = { id = r.id, kind = 'repost', user = user, text = 'reposted your post' }
            elseif r.kind == 'follow' then
                items[#items + 1] = { id = r.id, kind = 'follow', user = user }
            end
        end
    end

    return ok({ notifications = items })
end

-- Rich DM messages (text / image / gif / money / location / voice).
---@type table<string, boolean> Whitelist of DM kinds a client may send; anything else sends as text.
local VALID_DM_KINDS = { text = true, image = true, gif = true, money = true, location = true, voice = true }

---Clamps/coerces composer metadata per kind: only whitelisted fields survive, strings are
---length-capped, numbers floored + clamped, money amounts reject non-finite doubles.
---@param kind string validated DM kind (a VALID_DM_KINDS member)
---@param payload table raw client payload
---@return table meta whitelisted, clamped metadata
local function sanitizeDmMeta(kind, payload)
    local meta = {}
    if kind == 'image' or kind == 'gif' then
        local url = trimmed(payload.gifUrl) or ''
        if url ~= '' then meta.gifUrl = url:sub(1, 512) end
    elseif kind == 'money' then
        local amount = tonumber(payload.amount) or 0
        if amount == math.huge then amount = 0 end
        meta.amount = math.max(0, math.floor(amount))
        if payload.requested == true then meta.requested = true end
    elseif kind == 'voice' then
        meta.duration = math.max(0, math.min(36000, math.floor(tonumber(payload.duration) or 0)))
        local audio = trimmed(payload.audioUrl) or ''
        if audio ~= '' then meta.audio = audio:sub(1, 512) end
        if type(payload.waveform) == 'table' then
            local bars = {}
            for i = 1, math.min(#payload.waveform, 64) do
                bars[i] = math.max(0, math.min(100, math.floor(tonumber(payload.waveform[i]) or 0)))
            end
            if #bars > 0 then meta.waveform = bars end
        end
    elseif kind == 'location' then
        local code = trimmed(payload.wpCode) or ''
        local sub  = trimmed(payload.wpSub) or ''
        if code ~= '' then meta.wpCode = code:sub(1, 256) end
        if sub  ~= '' then meta.wpSub  = sub:sub(1, 128) end
    end
    return meta
end

---True when a message of `kind` carries content: text needs a body, media a URL, money a
---positive amount, voice a positive duration, location a body or waypoint code.
---@param kind string
---@param body string
---@param meta table
---@return boolean
local function dmHasContent(kind, body, meta)
    if kind == 'text'                   then return body ~= '' end
    if kind == 'image' or kind == 'gif' then return meta.gifUrl ~= nil end
    if kind == 'money'                  then return (meta.amount or 0) > 0 end
    if kind == 'voice'                  then return (meta.duration or 0) > 0 end
    if kind == 'location'               then return body ~= '' or meta.wpCode ~= nil end
    return body ~= ''
end

---DB row -> the client DM message shape: `fromMe` from the viewer's perspective plus whichever
---rich fields the bubble renders. Reactions are re-shaped per viewer.
---@param row table
---@param viewerCid string
---@return table
local function serializeDm(row, viewerCid)
    local meta = store.decodeJson(row.meta)
    local msg = {
        id     = row.id,
        fromMe = row.from_cid == viewerCid,
        body   = row.body or '',
        kind   = row.kind or 'text',
        ts     = row.created_ms or 0,
        at     = timeLabel(row.created_ms or 0),
    }
    if meta.gifUrl    then msg.gifUrl    = meta.gifUrl end
    if meta.amount    then msg.amount    = meta.amount end
    if meta.requested then msg.requested = true end
    if meta.duration  then msg.duration  = meta.duration end
    if meta.audio     then msg.audioUrl  = meta.audio end
    if meta.waveform  then msg.waveform  = meta.waveform end
    if meta.wpCode    then msg.wpCode    = meta.wpCode end
    if meta.wpSub     then msg.wpSub     = meta.wpSub end

    local reactions = store.decodeJson(row.reactions)
    if next(reactions) ~= nil then
        local out = {}
        for emoji, users in pairs(reactions) do
            local mine = false
            for _, u in ipairs(users) do if u == viewerCid then mine = true break end end
            if #users > 0 then out[#out + 1] = { emoji = emoji, count = #users, mine = mine } end
        end
        if #out > 0 then msg.reactions = out end
    end
    return msg
end

---Lists the viewer's DM conversations (one row per other party, latest message as the preview),
---newest-first. Unread counts only messages to the viewer that they haven't opened. Read-only.
---@param source number player server id
---@return table envelope
function actions.dmList(source)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    local msgs = store.listMessagesFor(prof.citizenid)

    local function isRead(v) return v == true or v == 1 or v == '1' end

    local lastByOther, unreadByOther = {}, {}
    for i = 1, #msgs do
        local m = msgs[i]
        local other = (m.from_cid == prof.citizenid) and m.to_cid or m.from_cid
        lastByOther[other] = m
        if m.to_cid == prof.citizenid and not isRead(m.read_flag) then
            unreadByOther[other] = (unreadByOther[other] or 0) + 1
        end
    end

    local others = {}
    for other in pairs(lastByOther) do others[#others + 1] = other end
    table.sort(others, function(a, b) return lastByOther[a].created_ms > lastByOther[b].created_ms end)

    local profiles = store.getProfilesByCids(others)
    local convos = {}
    for i = 1, #others do
        local other = others[i]
        local last  = lastByOther[other]
        local p     = profiles[other]
        convos[i] = {
            id       = other,
            user     = p and serializeAuthor(p) or { name = 'Unknown', handle = 'unknown', verified = false },
            updated  = relativeLabel(last.created_ms),
            unread   = unreadByOther[other] or 0,
            messages = { serializeDm(last, prof.citizenid) },
        }
    end

    return ok({ conversations = convos })
end

---Full message thread with one other party (conversation id = their cid). Opening the thread
---clears its unread flags.
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.dmThread(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local other = payload and payload.id
    if type(other) ~= 'string' or other == '' then return fail('Missing conversation') end

    local rows = store.listThread(prof.citizenid, other)
    local messages = {}
    for i = 1, #rows do messages[i] = serializeDm(rows[i], prof.citizenid) end

    store.markThreadRead(prof.citizenid, other)

    local op = store.getProfile(other)
    return ok({
        id       = other,
        user     = op and serializeAuthor(op) or { name = 'Unknown', handle = 'unknown', verified = false },
        messages = messages,
    })
end

---Marks a conversation read without fetching it; only messages to the viewer flip. Idempotent.
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.markRead(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local other = payload and payload.id
    if type(other) ~= 'string' or other == '' then return fail('Missing conversation') end
    store.markThreadRead(prof.citizenid, other)
    return ok()
end

---Sends a DM of any kind. Returns the sender's own message + the recipient's copy + the routing
---data init needs. Money clears through banking.send before the row is stored.
---@param source number player server id
---@param payload table { toCid, kind, body, gifUrl, amount, requested, duration, audioUrl, waveform, wpCode, wpSub }
---@return table envelope
function actions.dmSend(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local toCid = payload.toCid
    if type(toCid) ~= 'string' or toCid == '' or #toCid > 64 then return fail('Missing recipient') end

    local kind = VALID_DM_KINDS[payload.kind] and payload.kind or 'text'
    local body = (trimmed(payload.body) or ''):sub(1, birdyCfg.MaxDmLength)
    local meta = sanitizeDmMeta(kind, payload)
    if not dmHasContent(kind, body, meta) then return fail('Message cannot be empty') end

    if kind == 'money' and not meta.requested then
        local tsrc = player.getSourceByIdentifier(toCid)
        if not tsrc then return fail('They need to be online to receive money') end
        local number = settings.getPhoneNumber(toCid)
        if not number then return fail('Payment failed') end
        local res = banking.send(source, { number = number, amount = meta.amount, note = 'Birdy payment' })
        if not res or not res.success then return fail(res and res.message or 'Payment failed') end
    end

    local id = store.newId()
    if not store.insertDm(id, prof.citizenid, toCid, kind, body, meta) then return fail('Failed to send') end

    local row = store.getDm(id)
    return ok({
        message         = serializeDm(row, prof.citizenid),
        messageForOther = serializeDm(row, toCid),
        toCid           = toCid,
        fromCid         = prof.citizenid,
        fromProfile     = serializeAuthor(prof),
    })
end

---Toggles the viewer's reaction on a DM; both parties get the new set. Only a participant may
---react; the emoji key is length-capped. conversationId = the caller's cid.
---@param source number player server id
---@param payload { id?: string, emoji?: string }|nil
---@return table envelope
function actions.dmReact(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local row = type(payload.id) == 'string' and store.getDm(payload.id) or nil
    if not row then return fail('Message not found') end
    if row.from_cid ~= prof.citizenid and row.to_cid ~= prof.citizenid then return fail('Message not found') end

    local emoji = tostring(payload.emoji or '')
    if emoji == '' or #emoji > 16 then return fail('Invalid reaction') end

    local reactions = store.decodeJson(row.reactions)
    local users = reactions[emoji] or {}
    local found
    for i, u in ipairs(users) do if u == prof.citizenid then found = i break end end
    if found then table.remove(users, found) else users[#users + 1] = prof.citizenid end
    if #users > 0 then reactions[emoji] = users else reactions[emoji] = nil end
    store.updateDmReactions(row.id, reactions)

    local fresh = store.getDm(row.id)
    local other = (row.from_cid == prof.citizenid) and row.to_cid or row.from_cid
    return ok({
        id             = row.id,
        reactions      = serializeDm(fresh, prof.citizenid).reactions or {},
        otherCid       = other,
        otherReactions = serializeDm(fresh, other).reactions or {},
        conversationId = prof.citizenid,
    })
end

return actions
