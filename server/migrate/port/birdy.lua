---@type table Squawk porter (server.migrate.port.birdy). Carries lb-phone's Twitter across into
---Squawk: accounts, tweets and replies, likes, retweets, follows, DMs and notifications.
---
---Squawk is keyed by handle rather than citizenid, which is the same shape lb-phone's Twitter uses,
---so a username maps straight to a handle. Every child row is checked against the accounts and
---tweets that actually landed: sd-phone's foreign keys drop an orphan on boot, so writing one is a
---silent loss rather than a partial success.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table Shared helpers (server.util): trim, truthy, ids.
local util  = require 'server.util'

---@type fun(v: any, maxLen: integer): string|nil Trimmed text capped to maxLen bytes on a whole
---UTF-8 character, nil when empty (server.util limitedString).
local clamp = util.limitedString

---@param v any
---@return 0|1
local function bit(v) return util.truthy(v) and 1 or 0 end

---An epoch seconds value as a SQL timestamp, defaulting to now.
---@param ts any
---@return string
local function stamp(ts)
    return tostring(os.date('!%Y-%m-%d %H:%M:%S', math.floor(tonumber(ts) or os.time())))
end

---lb-phone stores tweet attachments as a JSON array of urls; Squawk stores post images the same
---way, so a well-formed list passes straight through and anything else becomes no images.
---@param raw any
---@return string|nil
local function images(raw)
    local decoded = store.decodeJson(raw)
    if type(decoded) ~= 'table' or #decoded == 0 then return nil end
    local urls = {}
    for _, u in ipairs(decoded) do
        local url = clamp(u, 512)
        if url then urls[#urls + 1] = url end
    end
    if #urls == 0 then return nil end
    return store.encodeJson(urls)
end

---@type table<string, string> lb notification type -> Squawk notification kind. lb names the
---"someone you follow posted" case `tweet` and the boost `retweet`; Squawk calls them `post` and
---`repost`. Anything outside this map is dropped rather than written with a kind the feed cannot
---render at all.
local KINDS = {
    tweet = 'post', like = 'like', retweet = 'repost', reply = 'reply', follow = 'follow',
}

---@param ctx table migration context (numberToCid, dryRun, report)
---@return table counts
function M.run(ctx)
    local out = {
        profiles = 0, accounts = 0, posts = 0, likes = 0, reposts = 0, follows = 0,
        dms = 0, notifications = 0, skipped = 0, orphan = 0,
    }

    if not store.lbSource('twitter_accounts') then return out end

    local stage = 0
    ---Marks the start of one pass and answers whether its source table is present.
    ---@param name string lb-phone source table
    ---@return boolean
    local function section(name)
        stage = stage + 1
        if ctx.report then ctx.report(stage, 7) end
        return store.lbSource(name) and true or false
    end

    -- Handles Squawk already holds. A migrated account never takes a live player's handle: the
    -- profile row is skipped and every child row that hangs off it goes with it.
    local taken = store.existingBirdyHandles()
    local known = {}

    -- Accounts an earlier run created without handing their owner a password. They are re-granted
    -- below even though the account itself is skipped, so a server that imported before this was
    -- fixed can recover simply by running Squawk again.
    local passwordless = store.accountsMissingLogin('birdy')

    local profiles, accounts, grants = {}, {}, {}

    stage = 1
    if ctx.report then ctx.report(1, 7) end
    for _, a in ipairs(store.lbTwAccounts()) do
        local handle = clamp(a.username, 32)
        local cid = ctx.numberToCid[(tostring(a.phone_number or ''):gsub('%D', ''))]
        if not handle or not cid or taken[handle] then
            out.skipped = out.skipped + 1
            if handle and cid and passwordless[handle] then
                grants[#grants + 1] = { app = 'birdy', username = handle, cid = cid }
            end
        else
            known[handle] = true
            taken[handle] = true
            profiles[#profiles + 1] = {
                handle, cid, clamp(a.display_name, 64) or handle, '',
                clamp(a.bio, 200) or '', bit(a.verified),
                util.truthy(a.verified) and 'blue' or nil,
                0, tostring(os.date('!%b %Y', math.floor(tonumber(a.ts) or os.time()))),
                bit(a.private), clamp(a.profile_image, 512), clamp(a.profile_header, 512),
                stamp(a.ts),
            }
            out.profiles = out.profiles + 1

            -- The accounts engine owns credentials and sessions for every app account. Without a
            -- row here the sessions porter has nothing to attach a login to.
            accounts[#accounts + 1] = { 'birdy', handle, clamp(a.display_name, 50) or handle, '' }
            out.accounts = out.accounts + 1
            grants[#grants + 1] = { app = 'birdy', username = handle, cid = cid }
        end
    end

    -- Tweets before their children: a like or a reply pointing at a tweet that never landed is an
    -- orphan, and sd-phone's foreign keys delete it on the next boot.
    local posts, postIds = {}, {}
    if section('twitter_tweets') then
        for _, t in ipairs(store.lbTwTweets()) do
            local id = clamp(t.id, 16)
            local author = clamp(t.username, 32)
            if id and author and known[author] then
                postIds[id] = true
                posts[#posts + 1] = {
                    id, author, tostring(t.content or ''), clamp(t.reply_to, 16),
                    images(t.attachments), 0, stamp(t.ts),
                }
                out.posts = out.posts + 1
            else
                out.orphan = out.orphan + 1
            end
        end
        -- A reply whose parent did not come across would dangle, so it becomes a top-level post
        -- rather than vanishing: the words survive, only the thread it hung under is lost.
        for _, row in ipairs(posts) do
            if row[4] and not postIds[row[4]] then row[4] = nil end
        end
    end

    local likes = {}
    if section('twitter_likes') then
        for _, l in ipairs(store.lbTwLikes()) do
            local id, who = clamp(l.tweet_id, 16), clamp(l.username, 32)
            if id and who and postIds[id] and known[who] then
                likes[#likes + 1] = { id, who, stamp(l.ts) }
                out.likes = out.likes + 1
            else
                out.orphan = out.orphan + 1
            end
        end
    end

    local reposts = {}
    if section('twitter_retweets') then
        for _, r in ipairs(store.lbTwRetweets()) do
            local id, who = clamp(r.tweet_id, 16), clamp(r.username, 32)
            if id and who and postIds[id] and known[who] then
                reposts[#reposts + 1] = { id, who, stamp(r.ts) }
                out.reposts = out.reposts + 1
            else
                out.orphan = out.orphan + 1
            end
        end
    end

    local follows = {}
    if section('twitter_follows') then
        for _, f in ipairs(store.lbTwFollows()) do
            local follower, target = clamp(f.follower, 32), clamp(f.followed, 32)
            if follower and target and known[follower] and known[target] then
                follows[#follows + 1] = { follower, target, stamp(nil) }
                out.follows = out.follows + 1
            else
                out.orphan = out.orphan + 1
            end
        end
    end

    local dms = {}
    if section('twitter_messages') then
        for _, m in ipairs(store.lbTwMessages()) do
            local id = clamp(m.id, 16)
            local from, to = clamp(m.sender, 32), clamp(m.recipient, 32)
            if id and from and to and known[from] and known[to] then
                local urls = images(m.attachments)
                dms[#dms + 1] = {
                    id, from, to, tostring(m.content or ''),
                    urls and 'image' or 'text', urls, 1, stamp(m.ts),
                }
                out.dms = out.dms + 1
            else
                out.orphan = out.orphan + 1
            end
        end
    end

    local notifs = {}
    if section('twitter_notifications') then
        for _, n in ipairs(store.lbTwNotifications()) do
            local id = clamp(n.id, 16)
            local recipient, actor = clamp(n.username, 32), clamp(n['from'], 32)
            local kind = KINDS[tostring(n.type or ''):lower()]
            local post = clamp(n.tweet_id, 16)
            if id and kind and recipient and actor and known[recipient] and known[actor] then
                notifs[#notifs + 1] = {
                    id, recipient, kind, actor, (post and postIds[post]) and post or nil,
                    1, stamp(n.ts),
                }
                out.notifications = out.notifications + 1
            else
                out.orphan = out.orphan + 1
            end
        end
    end

    stage = 7
    if ctx.report then ctx.report(7, 7) end

    if ctx.dryRun then return out end

    store.insertBirdyProfiles(profiles)
    store.insertPgAccounts(accounts)
    store.insertBirdyPosts(posts)
    store.insertBirdyLikes(likes)
    store.insertBirdyReposts(reposts)
    store.insertBirdyFollows(follows)
    store.insertBirdyDms(dms)
    store.insertBirdyNotifications(notifs)

    -- lb-phone hashes with bcrypt, which sd-phone cannot verify, so every migrated account gets a
    -- fresh readable password written to its owner's Passwords app. Squawk verifies against the
    -- accounts engine, which is what this sets; the profile row's own password column is a mirror
    -- that a later password change keeps in step, so it is left empty rather than filled with a
    -- hash nothing checks.
    out.logins = store.grantMigratedLogins(grants)

    return out
end

return M
