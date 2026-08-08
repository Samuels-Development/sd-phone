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
---@type table Money bridge (bridge.server.money): balance read + charge for buying the blue check.
local money = require 'bridge.server.money'
---@type table Badges module (server.badges.init): server-authoritative unread-badge pushes.
local badges = require 'server.badges.init'
---@type table Admin mute registry (server.admin.moderation): scope guards for posting/DMing.
local moderation = require 'server.admin.moderation'
---@type table Watcher registry (server.watchers): shared with server.birdy.init.
local watchers = require('server.watchers').of('birdy')

---@type table Birdy config (config.Birdy): field bounds + feed/notification limits.
local birdyCfg = config.Birdy

---@type table Actions module; the table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail = util.ok, util.fail

---@type table<string, boolean> Allowed DM reaction emoji, mirroring the four the composer offers
---(web/src/shared/chat/MessageBubble.tsx). Bounds the reactions blob to four keys.
local REACTION_SET = { ['❤️'] = true, ['👍'] = true, ['👎'] = true, ['😂'] = true }

---@type integer How long a like/repost/follow notification suppresses an identical repeat (secs).
local NOTIF_DEDUPE = 3600

---@type table<string, integer[]> Per-citizenid write budgets as { minimum gap ms, accepted calls
---per day }. Both sit far above real play; they exist so a scripted client cannot mint rows,
---notifications or broadcasts faster than a person can tap.
local WRITE_BUDGET = {
    register = { 1500, 60 },
    create   = { 2000, 200 },
    reply    = { 1000, 500 },
    like     = { 250, 3000 },
    repost   = { 250, 3000 },
    follow   = { 400, 500 },
    dm       = { 400, 1000 },
    react    = { 250, 2000 },
    verify   = { 3000, 20 },
    deletePost = { 500, 300 },
}

---@type integer Rolling window the per-day half of WRITE_BUDGET is measured over (ms).
local BUDGET_WINDOW = 86400000

---Applies the caller's write budget for `key`. nil means the call may proceed; anything else is
---the envelope to hand straight back to the client. Keyed by citizenid, never by account: a
---budget spent per account would reset every time a player switched to an alt.
---@param cid string citizenid of the acting player
---@param key string WRITE_BUDGET key
---@return table|nil refusal
local function throttle(cid, key)
    local budget = WRITE_BUDGET[key] or { 2000, 60 }
    if not util.cooldown(cid, 'birdy:' .. key, budget[1]) then return fail('Slow down') end
    if not util.rateLimit(cid, 'birdy:' .. key, BUDGET_WINDOW, budget[2]) then
        return fail('Daily limit reached')
    end
    return nil
end

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

---The Birdy account the requesting player is signed into, plus their citizenid. The profile is
---nil when signed out; the citizenid is nil only when the character cannot be resolved.
---@param source number player server id
---@return table|nil profile, string|nil cid
local function viewer(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil, nil end
    local acc = acctStore.getSessionAccount('birdy', cid)
    if not acc then return nil, cid end
    return store.getProfileByHandle(acc.username), cid
end

---Resolves a viewer handle for the public read actions: the signed-in account's handle, or ''
---for a guest.
---@param source number player server id
---@return string viewerHandle '' = anonymous guest
local function optionalViewerHandle(source)
    local prof = viewer(source)
    return prof and prof.handle or ''
end

---Online sources signed into `handle`'s Birdy account. One account can be open on several
---characters at once, so a push has to reach all of them rather than a single citizenid.
---@param handle string Birdy handle
---@param activeSrcs table<string, number>|nil prebuilt citizenid -> source map for a fan-out
---@return integer[] sources
local function sourcesFor(handle, activeSrcs)
    local acc = acctStore.getAccount('birdy', handle)
    if not acc then return {} end
    local out = {}
    for _, cid in ipairs(acctStore.sessionCitizens('birdy', acc.id)) do
        -- Indexing a prebuilt map is the same lookup getSourceByIdentifier does, minus the
        -- rescan of every connected player that it costs once per recipient.
        local src = activeSrcs and activeSrcs[cid] or nil
        if not activeSrcs then src = player.getSourceByIdentifier(cid) end
        if src then out[#out + 1] = src end
    end
    return out
end

---@type fun(handle: string, activeSrcs: table|nil): integer[] Shared with server.birdy.init for
---its DM and reaction pushes.
actions.sourcesFor = sourcesFor

---Public author shape embedded in posts, notifications and conversation heads.
---@param profile table
---@return { name: string, handle: string, verified: boolean, avatar?: string }
local function serializeAuthor(profile)
    return { name = profile.displayName, handle = profile.handle, verified = profile.verified, verifiedType = profile.verifiedType, avatar = profile.avatar }
end

---Shapes a full profile (with live follow counts) for the profile page.
---@param profile table
---@return table
local function serializeProfile(profile)
    return {
        name      = profile.displayName,
        handle    = profile.handle,
        verified  = profile.verified,
        verifiedType = profile.verifiedType,
        bio       = profile.bio or '',
        -- Derived from created_at; join_label was client-writable.
        joined    = profile.createdTs and os.date('%B %Y', profile.createdTs) or (profile.joinLabel or ''),
        protected = profile.protected == true,
        avatar    = profile.avatar,
        banner    = profile.banner,
        following = store.countFollowing(profile.handle),
        followers = store.countFollowers(profile.handle),
    }
end

---Shapes a hydrated post row into the React `BirdyPost` form. `images` is nil or the
---store-decoded array of up to 3 URLs.
---@param p table
---@return table
local function serializePost(p)
    return {
        id        = p.id,
        author    = { name = p.displayName, handle = p.handle, verified = p.verified, verifiedType = p.verifiedType, avatar = p.avatar },
        body      = p.body,
        images    = p.images,
        createdAt = p.createdMs,
        replies   = p.replies,
        reposts   = p.reposts,
        reposted  = p.reposted,
        likes     = p.likes,
        liked     = p.liked,
        views     = p.views,
        repostedBy = p.repostedBy and { handle = p.repostedBy, name = p.repostedByName, avatar = p.repostedByAvatar } or nil,
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
---against both stores; every field is trimmed and bounds-checked against config.Birdy. How many
---accounts one character may hold is the accounts engine's per-app cap (configs/accounts.lua).
---@param source number player server id
---@param payload { name?: string, username?: string, password?: string, bio?: string, email?: string, phone?: string }
---@return table envelope
function actions.register(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end
    local slow = throttle(cid, 'register'); if slow then return slow end
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

    local acctRes = acctActions.createAccount('birdy', {
        username = handle, password = password, name = name,
        email = payload.email, phone = payload.phone,
    }, cid)
    if not acctRes.success then return acctRes end

    if not store.insertAccount(handle, cid, name, store.hashPassword(password), bio, birdyCfg.DefaultVerified == true, os.date('%B %Y')) then
        acctStore.deleteAccount(acctRes.data.account.id)
        return fail('Failed to create the account')
    end
    acctStore.setSession('birdy', cid, acctRes.data.account.id)
    store.setLoggedIn(handle, true)

    return ok({ me = serializeAuthor(store.getProfileByHandle(handle)) })
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
    store.setLoggedIn(prof.handle, true)
    return ok({ me = serializeAuthor(prof) })
end

---Signs out: keeps the account, drops this character's engine session. Idempotent. The account's
---signed-in flag only clears once no character is left in it.
---@param source number player server id
---@return table envelope
function actions.logout(source)
    local cid = player.getIdentifier(source)
    if cid then
        local acc = acctStore.getSessionAccount('birdy', cid)
        acctStore.clearSession('birdy', cid)
        if acc and #acctStore.sessionCitizens('birdy', acc.id) == 0 then
            store.setLoggedIn(acc.username, false)
        end
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
    local me = optionalViewerHandle(source)
    local handle = payload and payload.handle and normalizeHandle(payload.handle)
    local prof
    if handle and handle ~= '' then
        prof = store.getProfileByHandle(handle)
    elseif me ~= '' then
        prof = store.getProfileByHandle(me)
    end
    if not prof then return fail('Profile not found') end

    local data = serializeProfile(prof)
    local isMe = me ~= '' and prof.handle == me
    data.isMe = isMe
    data.isFollowing = ((not isMe) and me ~= '' and store.isFollowing(me, prof.handle)) or false
    return ok({ profile = data })
end

---Posts for a profile tab: 'posts', 'replies', 'media', or 'likes'. target = whose posts,
---me = whose like-state colours the hearts. Read-only.
---@param source number player server id
---@param payload { kind?: string, handle?: string }|nil
---@return table envelope
function actions.profilePosts(source, payload)
    payload = tbl(payload)
    local me = optionalViewerHandle(source)
    local handle = payload and payload.handle and normalizeHandle(payload.handle)
    local target
    if handle and handle ~= '' then
        local tp = store.getProfileByHandle(handle)
        target = tp and tp.handle
    elseif me ~= '' then
        target = me
    end
    if not target then return fail('Profile not found') end
    local kind = (payload and payload.kind) or 'posts'

    -- Protected profiles expose posts only to themselves and their followers.
    if target ~= me then
        local tp = store.getProfileByHandle(target)
        if tp and tp.protected and not (me ~= '' and store.isFollowing(me, target)) then
            return ok({ posts = {}, protected = true })
        end
    end

    local rows
    if kind == 'likes' then
        rows = store.listLikedBy(target, me, birdyCfg.FeedLimit)
    else
        rows = store.listPostsBy(target, kind, me, birdyCfg.FeedLimit)
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
    local me = optionalViewerHandle(source)
    local q = trimmed(payload and payload.query)
    if not q or #q == 0 then return ok({ users = {} }) end
    local rows = store.searchProfiles(q:sub(1, 64), me, 20)
    local users = {}
    for i = 1, #rows do
        users[i] = { name = rows[i].displayName, handle = rows[i].handle, verified = rows[i].verified, verifiedType = rows[i].verifiedType }
    end
    return ok({ users = users })
end

---Top hashtags across recent posts, for the Search tab's trending list. Read-only.
---@return table envelope
function actions.trending()
    return ok({ tags = store.trendingHashtags(birdyCfg.TrendingWindowDays, 5) })
end

---Posts using an exact hashtag; the tag may arrive with or without '#'. Read-only.
---@param source number player server id
---@param payload { tag?: string }|nil
---@return table envelope
function actions.hashtag(source, payload)
    payload = tbl(payload)
    local me = optionalViewerHandle(source)
    local raw = trimmed(payload.tag)
    local tag = raw and raw:sub(1, 64):match('^#?([%w_]+)')
    if not tag then return ok({ posts = {} }) end
    local rows = store.postsByHashtag(tag:lower(), me, birdyCfg.FeedLimit)
    local posts = {}
    for i = 1, #rows do posts[i] = serializePost(rows[i]) end
    return ok({ posts = posts })
end

---Updates the signed-in account's editable profile fields. Missing fields keep their current
---value; everything is trimmed and bounds-checked.
---@param source number player server id
---@param payload { name?: string, bio?: string, protected?: boolean, avatar?: string|false, banner?: string|false }|nil
---@return table envelope
function actions.updateProfile(source, payload)
    local prof = viewer(source); if not prof then return fail('Not signed in') end
    payload = tbl(payload)

    local name = trimmed(payload.name) or prof.displayName
    if #name < 1 then return fail('Name is required') end
    if #name > birdyCfg.MaxNameLength then return fail('Name is too long') end

    local bio = trimmed(payload.bio) or ''
    if #bio > birdyCfg.MaxBioLength then return fail('Bio is too long') end

    local function imageUrl(v, fallback)
        local u = trimmed(v)
        if u and u:sub(1, 4) == 'http' then return u:sub(1, 512) end
        if v == false then return nil end
        return fallback
    end
    local avatar = imageUrl(payload.avatar, prof.avatar)
    local banner = imageUrl(payload.banner, prof.banner)

    -- joinLabel is ignored; the join date is derived from created_at.
    store.updateProfileFields(prof.handle, name, bio, prof.joinLabel or '', payload.protected == true, avatar, banner)
    return ok({ profile = serializeProfile(store.getProfileByHandle(prof.handle)) })
end

---What the Get Verified row should show: whether the blue check is on sale at all, its price, and
---whether this account already carries a badge. The price is read here rather than mirrored in
---the bundle so changing configs/birdy.lua takes effect on a restart, with no rebuild.
---@param source number player server id
---@return table envelope { enabled, price, account, verified, verifiedType }
function actions.verificationOffer(source)
    local prof = viewer(source)
    if not prof then return fail('Not signed in') end

    local cfg = birdyCfg.Verification
    return ok({
        enabled      = (cfg and cfg.Enabled) == true,
        price        = math.floor(tonumber(cfg and cfg.Price) or 0),
        account      = (cfg and cfg.Account) or 'bank',
        verified     = prof.verified == true,
        verifiedType = prof.verifiedType,
    })
end

---Buys the blue check for the signed-in account. Only blue is ever sold: gold and grey assert an
---identity someone has to have checked, so they stay staff-granted.
---@param source number player server id
---@return table envelope { me } on success
function actions.purchaseVerification(source)
    local prof, cid = viewer(source)
    if not prof or not cid then return fail('Not signed in') end

    local cfg = birdyCfg.Verification
    if not (cfg and cfg.Enabled) then return fail('Verification is not available') end
    if prof.verified then return fail('This account is already verified') end

    local slow = throttle(cid, 'verify'); if slow then return slow end

    local price   = math.floor(tonumber(cfg.Price) or 0)
    local account = cfg.Account or 'bank'

    if price > 0 then
        if (tonumber(money.get(source, account)) or 0) < price then return fail('Not enough money') end
        if not money.remove(source, account, price, 'Birdy verification') then return fail('Payment failed') end
    end

    -- Nothing here is transactional, so the charge is undone by hand if the badge write misses.
    -- Without this a player whose account vanished mid-purchase is simply out the money.
    if store.setVerified(prof.handle, 'blue') == 0 then
        if price > 0 then money.add(source, account, price, 'Birdy verification refund') end
        return fail('Could not verify this account')
    end

    return ok({ me = serializeAuthor(store.getProfileByHandle(prof.handle)) })
end

---Changes the signed-in account's password, syncing the engine hash, the Passwords-app vault
---copy, and Birdy's legacy profile-row hash.
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
    if prof then store.setPassword(prof.handle, store.hashPassword(password)) end
    return ok()
end

---Permanently deletes the signed-in account and all of its content: content rows first,
---then the engine account.
---@param source number player server id
---@return table envelope
function actions.deleteAccount(source)
    local cid = player.getIdentifier(source)
    local acc = cid and acctStore.getSessionAccount('birdy', cid) or nil
    if not acc then return fail('Not signed in') end
    local prof = store.getProfileByHandle(acc.username)
    if prof then store.deleteAccount(prof.handle) end
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
    local me = optionalViewerHandle(source)
    local following = me ~= '' and payload and payload.following == true
    local rows = store.listFeed(me, birdyCfg.FeedLimit, following)
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
    local me = optionalViewerHandle(source)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' then return fail('Post id required') end

    store.bumpViews(id, me)
    local row = store.getPost(id, me)
    if not row then return fail('Post not found') end

    local post = serializePost(row)
    local replyRows = store.listReplies(id, me)
    local thread = {}
    for i = 1, #replyRows do thread[i] = serializePost(replyRows[i]) end
    post.thread = thread

    return ok({ post = post })
end

---Creates a top-level post as the session account. A post needs text OR at least one image; the
---body is trimmed and capped, images are whitelisted, and the row id is server-generated.
---@param source number player server id
---@param payload { body?: string, images?: string[] }|nil
---@return table envelope
function actions.create(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    local muted = moderation.guard(cid, 'birdy'); if muted then return muted end
    local slow = throttle(cid, 'create'); if slow then return slow end
    payload = tbl(payload)
    local body = trimmed(payload and payload.body) or ''
    local images = sanitizeImages(payload and payload.images)
    if body == '' and not images then return fail('Post cannot be empty') end
    if #body > birdyCfg.MaxPostLength then return fail('Post is too long') end

    local id = store.newId()
    if not store.insertPost(id, prof.handle, body, nil, images) then return fail('Failed to post') end

    -- First-party hook: one server-local event per created post; the citizenid is the character
    -- who posted, which is not necessarily the one that created the account.
    TriggerEvent('sd-phone:server:birdy:post', {
        id = id, source = source, citizenid = cid,
        username = prof.handle, displayName = prof.displayName,
        body = body, images = images,
    })

    -- The TriggerEvent above is server-local; this is what reaches players. Scoped to the phones
    -- with Birdy in the foreground: every other player only refetched to discard the result.
    watchers.push('sd-phone:client:birdy:feedChanged', {})

    local preview   = body ~= '' and body:sub(1, 80) or 'shared a photo'
    local followers = store.followerHandles(prof.handle)

    if #followers == 0 then return ok({ post = serializePost(store.getPost(id, prof.handle)) }) end

    local notifs = {}
    for i = 1, #followers do
        notifs[i] = { id = store.newId(), recipient = followers[i], kind = 'post', actor = prof.handle, postId = id }
    end
    store.insertNotifications(notifs)

    -- One pass over the connected players for the whole fan-out; this resolved each follower
    -- separately, and every resolution re-scanned every player on the server.
    local activeSrcs = player.activeCidMap()
    local targets = {}
    for _, handle in ipairs(followers) do
        for _, src in ipairs(sourcesFor(handle, activeSrcs)) do targets[#targets + 1] = src end
    end

    lib.triggerClientEvent('sd-phone:client:birdy:notification', targets, {})
    lib.triggerClientEvent('sd-phone:client:notify', targets, {
        app = 'birdy', appId = 'birdy', title = 'Squawk',
        body = ('%s posted: %s'):format(prof.displayName, preview),
        time = 'now', quietInApp = true,
    })

    for _, src in ipairs(targets) do badges.pushApp(src, 'birdy') end

    return ok({ post = serializePost(store.getPost(id, prof.handle)) })
end

---Replies to a post; the parent must exist. A reply needs text OR at least one image. Returns
---the new reply plus the recipient handle for the parent-author notification (never for
---self-replies).
---@param source number player server id
---@param payload { parentId?: string, body?: string, images?: string[] }|nil
---@return table envelope
function actions.reply(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    local muted = moderation.guard(cid, 'birdy'); if muted then return muted end
    local slow = throttle(cid, 'reply'); if slow then return slow end
    payload = tbl(payload)
    local parentId = payload and payload.parentId
    local body = trimmed(payload and payload.body) or ''
    local images = sanitizeImages(payload and payload.images)
    if type(parentId) ~= 'string' or parentId == '' then return fail('Missing post') end
    if body == '' and not images then return fail('Reply cannot be empty') end
    if #body > birdyCfg.MaxPostLength then return fail('Reply is too long') end

    local parentAuthor = store.getPostAuthor(parentId)
    if not parentAuthor then return fail('Post not found') end

    local id = store.newId()
    if not store.insertPost(id, prof.handle, body, parentId, images) then return fail('Failed to reply') end

    local notify = nil
    if parentAuthor ~= prof.handle then
        store.insertNotification(store.newId(), parentAuthor, 'reply', prof.handle, id)
        notify = parentAuthor
    end

    return ok({ post = serializePost(store.getPost(id, prof.handle)), notify = notify })
end

---Deletes one of the caller's own posts, along with every reply, like, repost and notification
---hanging off it. Ownership is proved against the stored author handle rather than anything the
---client sends, so a crafted payload cannot remove someone else's post.
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.deletePost(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    payload = tbl(payload)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' then return fail('Missing post') end
    local slow = throttle(cid, 'deletePost'); if slow then return slow end

    local author = store.getPostAuthor(id)
    if not author then return fail('Post not found') end
    if author ~= prof.handle then return fail('Not your post') end

    store.deletePost(id)
    store.invalidateTrending()
    return ok({ id = id })
end

---Toggles the viewer's like on a post. Returns the new liked state plus the author handle to
---notify when a like was just added (not on unlike, never for self-likes).
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.toggleLike(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    payload = tbl(payload)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' then return fail('Missing post') end
    local slow = throttle(cid, 'like'); if slow then return slow end

    local author = store.getPostAuthor(id)
    if not author then return fail('Post not found') end

    local nowLiked
    if store.isLiked(id, prof.handle) then
        store.removeLike(id, prof.handle)
        nowLiked = false
    else
        store.addLike(id, prof.handle)
        nowLiked = true
    end

    -- Un-liking does not delete the notification, so re-liking would otherwise mint a permanent
    -- duplicate on every flip.
    local notify = nil
    if nowLiked and author ~= prof.handle
        and not store.recentNotification(author, 'like', prof.handle, id, NOTIF_DEDUPE) then
        store.insertNotification(store.newId(), author, 'like', prof.handle, id)
        notify = author
    end

    return ok({ liked = nowLiked, notify = notify })
end

---Toggles a repost of a post. Mirrors toggleLike: idempotent per (post, account), and notifies
---the post's author on a new repost (never on un-repost, never for self-reposts).
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.toggleRepost(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    payload = tbl(payload)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' then return fail('Missing post') end
    local slow = throttle(cid, 'repost'); if slow then return slow end

    local author = store.getPostAuthor(id)
    if not author then return fail('Post not found') end

    if author == prof.handle then return fail('You cannot repost your own post') end

    local nowReposted
    if store.isReposted(id, prof.handle) then
        store.removeRepost(id, prof.handle)
        nowReposted = false
    else
        store.addRepost(id, prof.handle)
        nowReposted = true
    end

    -- Un-reposting does not delete the notification, so re-reposting would otherwise mint a
    -- permanent duplicate on every flip.
    local notify = nil
    if nowReposted and author ~= prof.handle
        and not store.recentNotification(author, 'repost', prof.handle, id, NOTIF_DEDUPE) then
        store.insertNotification(store.newId(), author, 'repost', prof.handle, id)
        notify = author
    end

    watchers.push('sd-phone:client:birdy:feedChanged', {})

    return ok({ reposted = nowReposted, notify = notify })
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
    local target = prof.handle
    local handle = payload.handle and normalizeHandle(payload.handle)
    if handle and handle ~= '' and handle ~= prof.handle then
        local tp = store.getProfileByHandle(handle)
        if not tp then return ok({ users = {} }) end
        -- Protected profiles hide their follow graph from non-followers.
        if tp.protected and not store.isFollowing(prof.handle, tp.handle) then
            return ok({ users = {} })
        end
        target = tp.handle
    end

    local users = {}
    for _, row in ipairs(store.followList(prof.handle, target, kind)) do
        users[#users + 1] = {
            name        = row.display_name,
            handle      = row.handle,
            verified    = tonumber(row.verified) == 1,
            verifiedType = row.verified_type,
            bio         = row.bio or '',
            avatar      = row.avatar,
            followsYou  = tonumber(row.follows_you) == 1,
            isFollowing = tonumber(row.is_following) == 1,
        }
    end
    return ok({ users = users })
end

---Toggles following another account by handle. Self-follows are rejected. Returns the target to
---notify on a new follow (not on unfollow).
---@param source number player server id
---@param payload { handle?: string }|nil
---@return table envelope
function actions.toggleFollow(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    payload = tbl(payload)
    local handle = payload and payload.handle and normalizeHandle(payload.handle)
    if not handle or handle == '' or #handle > 32 then return fail('Missing account') end
    if handle == prof.handle then return fail('You cannot follow yourself') end
    local target = store.getProfileByHandle(handle)
    if not target then return fail('Missing account') end
    local slow = throttle(cid, 'follow'); if slow then return slow end

    local notify = nil
    local nowFollowing
    if store.isFollowing(prof.handle, target.handle) then
        store.removeFollow(prof.handle, target.handle)
        nowFollowing = false
    else
        store.addFollow(prof.handle, target.handle)
        nowFollowing = true
        -- Unfollowing does not delete the notification, so re-following would otherwise mint a
        -- permanent duplicate on every flip.
        if not store.recentNotification(target.handle, 'follow', prof.handle, nil, NOTIF_DEDUPE) then
            store.insertNotification(store.newId(), target.handle, 'follow', prof.handle, nil)
            notify = target.handle
        end
    end

    return ok({ following = nowFollowing, notify = notify })
end

---Lists the viewer's notifications, serialized into the React union shape. Reply notifications
---embed the reply post; like/follow rows resolve the actor's public profile. Read-only.
---@param source number player server id
---@return table envelope
function actions.notifications(source)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    local rows = store.listNotifications(prof.handle, birdyCfg.NotificationLimit)

    local actors = {}
    for i = 1, #rows do actors[#actors + 1] = rows[i].actor end
    local profiles = store.getProfilesByHandles(actors)

    local replyPostIds = {}
    for i = 1, #rows do
        if rows[i].kind == 'reply' and rows[i].post_id then replyPostIds[#replyPostIds + 1] = rows[i].post_id end
    end
    local replyPosts = store.postsByIds(replyPostIds, prof.handle)

    local items = {}
    for i = 1, #rows do
        local r = rows[i]
        if r.kind == 'reply' and r.post_id then
            local postRow = replyPosts[r.post_id]
            if postRow then
                items[#items + 1] = { id = r.id, kind = 'reply', post = serializePost(postRow) }
            end
        else
            local ap = profiles[r.actor]
            local user = ap and serializeAuthor(ap) or { name = 'Someone', handle = 'someone', verified = false }
            if r.kind == 'like' then
                items[#items + 1] = { id = r.id, kind = 'like', user = user, text = 'liked your post' }
            elseif r.kind == 'repost' then
                items[#items + 1] = { id = r.id, kind = 'repost', user = user, text = 'reposted your post' }
            elseif r.kind == 'post' then
                items[#items + 1] = { id = r.id, kind = 'post', user = user, text = 'shared a new post' }
            elseif r.kind == 'follow' then
                items[#items + 1] = { id = r.id, kind = 'follow', user = user }
            end
        end
    end

    store.markNotificationsSeen(prof.handle)
    badges.pushApp(source, 'birdy')

    return ok({ notifications = items })
end

---Unseen-notification count for the in-app Bell badge. Read-only.
---@param source number player server id
---@return table envelope
function actions.notificationCount(source)
    local prof = viewer(source)
    if not prof then return ok({ count = 0 }) end
    return ok({ count = store.unseenNotificationCount(prof.handle) })
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
---@param viewerHandle string
---@return table
local function serializeDm(row, viewerHandle)
    local meta = store.decodeJson(row.meta)
    local msg = {
        id     = row.id,
        fromMe = row.from_handle == viewerHandle,
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
            for _, u in ipairs(users) do if u == viewerHandle then mine = true break end end
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
    local msgs = store.listMessagesFor(prof.handle)

    local function isRead(v) return v == true or v == 1 or v == '1' end

    local lastByOther, unreadByOther = {}, {}
    for i = 1, #msgs do
        local m = msgs[i]
        local other = (m.from_handle == prof.handle) and m.to_handle or m.from_handle
        lastByOther[other] = m
        if m.to_handle == prof.handle and not isRead(m.read_flag) then
            unreadByOther[other] = (unreadByOther[other] or 0) + 1
        end
    end

    local others = {}
    for other in pairs(lastByOther) do others[#others + 1] = other end
    table.sort(others, function(a, b) return lastByOther[a].created_ms > lastByOther[b].created_ms end)

    local profiles = store.getProfilesByHandles(others)
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
            messages = { serializeDm(last, prof.handle) },
        }
    end

    return ok({ conversations = convos })
end

---Full message thread with one other party (conversation id = their handle). Opening the thread
---clears its unread flags.
---@param source number player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.dmThread(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local other = payload and payload.id
    if type(other) ~= 'string' or other == '' then return fail('Missing conversation') end

    local rows = store.listThread(prof.handle, other)
    local messages = {}
    for i = 1, #rows do messages[i] = serializeDm(rows[i], prof.handle) end

    store.markThreadRead(prof.handle, other)

    local op = store.getProfileByHandle(other)
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
    store.markThreadRead(prof.handle, other)
    return ok()
end

---Resolves a handle to its DM conversation id plus the account's author card, so the UI can open
---a thread with someone it has never messaged. Read-only.
---@param source number player server id
---@param payload { handle?: string }|nil
---@return table envelope
function actions.dmResolve(source, payload)
    local prof = viewer(source); if not prof then return fail('Player not found') end
    payload = tbl(payload)
    local tp = store.getProfileByHandle(normalizeHandle(payload.handle or '') or '')
    if not tp then return fail('Account not found') end
    if tp.handle == prof.handle then return fail('You cannot message yourself') end
    return ok({ id = tp.handle, user = serializeAuthor(tp) })
end

---Sends a DM of any kind. Returns the sender's own message + the recipient's copy + the routing
---data init needs. Money clears through banking.send before the row is stored.
---@param source number player server id
---@param payload table { to, kind, body, gifUrl, amount, requested, duration, audioUrl, waveform, wpCode, wpSub }
---@return table envelope
function actions.dmSend(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    local muted = moderation.guard(cid, 'birdy'); if muted then return muted end
    local slow = throttle(cid, 'dm'); if slow then return slow end
    payload = tbl(payload)
    local to = normalizeHandle(payload.to or payload.toHandle or '')
    if not to or to == '' or #to > 32 then return fail('Missing recipient') end
    if to == prof.handle then return fail('You cannot message yourself') end
    -- Without this a DM addressed to a made-up handle is stored forever: no owner can open it,
    -- and no account-delete or wipe path reaches it.
    if not store.getProfileByHandle(to) then return fail('Account not found') end

    local kind = VALID_DM_KINDS[payload.kind] and payload.kind or 'text'
    local body = (trimmed(payload.body) or ''):sub(1, birdyCfg.MaxDmLength)
    local meta = sanitizeDmMeta(kind, payload)
    if not dmHasContent(kind, body, meta) then return fail('Message cannot be empty') end

    if kind == 'money' and not meta.requested then
        -- The money lands in a character's account, not the Squawk account, so it needs whichever
        -- character currently has the recipient's account open.
        local acc = acctStore.getAccount('birdy', to)
        local toCid
        for _, c in ipairs(acc and acctStore.sessionCitizens('birdy', acc.id) or {}) do
            if player.getSourceByIdentifier(c) then toCid = c break end
        end
        if not toCid then return fail('They need to be online to receive money') end
        local number = settings.getPhoneNumber(toCid)
        if not number then return fail('Payment failed') end
        local res = banking.send(source, { number = number, amount = meta.amount, note = 'Birdy payment' })
        if not res or not res.success then return fail(res and res.message or 'Payment failed') end
    end

    local id = store.newId()
    if not store.insertDm(id, prof.handle, to, kind, body, meta) then return fail('Failed to send') end

    local row = store.getDm(id)
    return ok({
        message         = serializeDm(row, prof.handle),
        messageForOther = serializeDm(row, to),
        to              = to,
        from            = prof.handle,
        fromProfile     = serializeAuthor(prof),
    })
end

---Toggles the viewer's reaction on a DM; both parties get the new set. Only a participant may
---react; the emoji key is length-capped. conversationId = the caller's handle.
---@param source number player server id
---@param payload { id?: string, emoji?: string }|nil
---@return table envelope
function actions.dmReact(source, payload)
    local prof, cid = viewer(source); if not prof or not cid then return fail('Player not found') end
    payload = tbl(payload)
    local slow = throttle(cid, 'react'); if slow then return slow end
    local row = type(payload.id) == 'string' and store.getDm(payload.id) or nil
    if not row then return fail('Message not found') end
    if row.from_handle ~= prof.handle and row.to_handle ~= prof.handle then return fail('Message not found') end

    local emoji = tostring(payload.emoji or '')
    if not REACTION_SET[emoji] then return fail('Invalid reaction') end

    local reactions = store.decodeJson(row.reactions)
    local users = reactions[emoji] or {}
    local found
    for i, u in ipairs(users) do if u == prof.handle then found = i break end end
    if found then table.remove(users, found) else users[#users + 1] = prof.handle end
    if #users > 0 then reactions[emoji] = users else reactions[emoji] = nil end
    store.updateDmReactions(row.id, reactions)

    local fresh = store.getDm(row.id)
    local other = (row.from_handle == prof.handle) and row.to_handle or row.from_handle
    return ok({
        id             = row.id,
        reactions      = serializeDm(fresh, prof.handle).reactions or {},
        other          = other,
        otherReactions = serializeDm(fresh, other).reactions or {},
        conversationId = prof.handle,
    })
end

return actions
