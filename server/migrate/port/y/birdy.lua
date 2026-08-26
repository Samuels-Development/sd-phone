---@type table Squawk porter (server.migrate.port.y.birdy). Carries YSeries' Twitter across into
---Squawk: accounts, tweets and replies, likes, retweets and follows.
---
---Squawk is keyed by handle rather than citizenid, and YSeries' Twitter is keyed by username the
---same way, so a username maps straight to a handle. Every child row is checked against the
---accounts and tweets that actually landed: sd-phone's foreign keys drop an orphan on boot, so
---writing one is a silent loss rather than a partial success.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'
---@type table Shared helpers (server.util): trim, truthy.
local util = require 'server.util'
---@type table Attachment extraction (server.migrate.media): every foreign phone wraps its media
---differently, and a decoder that guesses wrong drops it silently.
local media = require 'server.migrate.media'
---@type fun(ts: any): string DATETIME formatter (server.migrate.ystore): the phone_photos and
---phone_birdy_* created_at columns are real TIMESTAMPs, and an epoch integer lands as a zero date.
local stamp = ystore.stamp

---@type integer Rows read per page.
local PAGE <const> = 5000

---Trim and clamp to `n` chars, or nil when empty.
---@param s any
---@param n integer
---@return string|nil
local function clamp(s, n)
    local v = util.trim(s)
    if v == '' then return nil end
    return v:sub(1, n)
end

---@param ctx table migration context (imeiToCid, dryRun)
---@return { profiles: number, posts: number, likes: number, reposts: number, follows: number, skipped: number }
function M.run(ctx)
    local out = { profiles = 0, posts = 0, likes = 0, reposts = 0, follows = 0, skipped = 0 }
    if not ystore.table('twitter_accounts') then return out end

    local taken = store.existingBirdyHandles()
    local landed, logins = {}, {}

    -- The logged-in table is the authoritative account -> handset link; the account row's own imei
    -- only records the device that created it, which is not where the account lives after a swap.
    local owners = ystore.accountOwners('twitter')

    local offset = 0
    while true do
        local page = ystore.page('twitter_accounts',
            '`username`, `display_name`, `password`, `phone_imei`, `bio`, `profile_image`, `profile_header`, `verified`, UNIX_TIMESTAMP(`date_joined`) AS ts',
            offset, PAGE, '`username`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, a in ipairs(page) do
            local handle = clamp(a.username, 32)
            if not handle or taken[handle] then
                out.skipped = out.skipped + 1
            else
                taken[handle] = true
                landed[handle] = true
                local cid = ctx.imeiToCid[owners[a.username] or a.phone_imei]
                rows[#rows + 1] = {
                    handle, cid, clamp(a.display_name, 64) or handle, a.password,
                    clamp(a.bio, 280), util.truthy(a.verified) and 1 or 0, nil, 0, nil, 0,
                    clamp(a.profile_image, 512), clamp(a.profile_header, 512),
                    stamp(a.ts),
                }
                out.profiles = out.profiles + 1
                if cid then logins[#logins + 1] = { app = 'birdy', username = handle, cid = cid } end
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertBirdyProfiles(rows) end
    end

    local postLanded = {}
    offset = 0
    while true do
        local page = ystore.page('twitter_tweets',
            '`id`, `username`, `content`, `attachments`, `reply_to`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, t in ipairs(page) do
            local handle = clamp(t.username, 32)
            if not handle or not landed[handle] then
                out.skipped = out.skipped + 1
            else
                local id = ('yt%s'):format(t.id)
                postLanded[tostring(t.id)] = id
                local parent = t.reply_to and t.reply_to ~= '' and ('yt%s'):format(t.reply_to) or nil
                rows[#rows + 1] = {
                    id, handle, util.trim(t.content), parent, media.json(t.attachments), 0,
                    stamp(t.ts),
                }
                out.posts = out.posts + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertBirdyPosts(rows) end
    end

    -- A reply whose parent never landed would be dropped by the foreign key, so it is re-pointed to
    -- the top level instead of vanishing with its thread.
    for _, id in pairs(postLanded) do landed[id] = landed[id] end

    offset = 0
    while true do
        local page = ystore.page('twitter_likes', '`tweet_id`, `username`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE, '`tweet_id`, `username`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, l in ipairs(page) do
            local handle = clamp(l.username, 32)
            local post = postLanded[tostring(l.tweet_id)]
            if not handle or not landed[handle] or not post then
                out.skipped = out.skipped + 1
            else
                rows[#rows + 1] = { post, handle, stamp(l.ts) }
                out.likes = out.likes + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertBirdyLikes(rows) end
    end

    offset = 0
    while true do
        local page = ystore.page('twitter_retweets', '`tweet_id`, `username`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE, '`tweet_id`, `username`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, r in ipairs(page) do
            local handle = clamp(r.username, 32)
            local post = postLanded[tostring(r.tweet_id)]
            if not handle or not landed[handle] or not post then
                out.skipped = out.skipped + 1
            else
                rows[#rows + 1] = { post, handle, stamp(r.ts) }
                out.reposts = out.reposts + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertBirdyReposts(rows) end
    end

    offset = 0
    while true do
        local page = ystore.page('twitter_follows', '`follower`, `followed`', offset, PAGE, '`follower`, `followed`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, f in ipairs(page) do
            local follower = clamp(f.follower, 32)
            local target = clamp(f.followed, 32)
            if not follower or not target or not landed[follower] or not landed[target] then
                out.skipped = out.skipped + 1
            else
                rows[#rows + 1] = { follower, target, stamp(nil) }
                out.follows = out.follows + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertBirdyFollows(rows) end
    end

    if not ctx.dryRun and #logins > 0 then store.grantMigratedLogins(logins) end
    return out
end

return M
