---@type table Photogram porter (server.migrate.port.y.photogram). Carries YSeries' Instashots
---across: accounts, posts, comments, likes and follows.
---
---Photogram is keyed by username, as Instashots is, so a username maps straight across. Instashots
---accounts carry no owner column at all; the `instashots_loggedin` table is what ties one to a
---handset, and through the identity map to a character.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged reads + the owner map.
local ystore = require 'server.migrate.ystore'
---@type table Shared helpers (server.util): trim, truthy.
local util = require 'server.util'
---@type table Attachment extraction (server.migrate.media): every foreign phone wraps its media
---differently, and a decoder that guesses wrong drops it silently.
local media = require 'server.migrate.media'

---@type integer Rows read per page.
local PAGE <const> = 2000

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
---@return { profiles: number, posts: number, comments: number, likes: number, follows: number, skipped: number }
function M.run(ctx)
    local out = { profiles = 0, posts = 0, comments = 0, likes = 0, follows = 0, skipped = 0 }
    if not ystore.table('instashots_accounts') then return out end

    local taken = store.existingPhotogramUsernames()
    local owners = ystore.accountOwners('instashots')
    local landed, logins = {}, {}

    local offset = 0
    while true do
        local page = ystore.page('instashots_accounts',
            '`username`, `display_name`, `password`, `bio`, `profile_image`, `verified`, `private`',
            offset, PAGE, '`username`')
        if #page == 0 then break end
        offset = offset + #page

        local rows, accounts = {}, {}
        for _, a in ipairs(page) do
            local username = clamp(a.username, 32)
            if not username or taken[username] then
                out.skipped = out.skipped + 1
            else
                taken[username] = true
                landed[username] = true
                rows[#rows + 1] = {
                    username, clamp(a.display_name, 64) or username, clamp(a.bio, 280),
                    clamp(a.profile_image, 512),
                    util.truthy(a.private) and 1 or 0, util.truthy(a.verified) and 1 or 0,
                    os.time(),
                }
                accounts[#accounts + 1] = {
                    'photogram', username, clamp(a.display_name, 64) or username, a.password,
                }
                out.profiles = out.profiles + 1

                local cid = ctx.imeiToCid[owners[a.username]]
                if cid then logins[#logins + 1] = { app = 'photogram', username = username, cid = cid } end
            end
        end

        if not ctx.dryRun then
            if #rows > 0 then store.insertPgProfiles(rows) end
            if #accounts > 0 then store.insertPgAccounts(accounts) end
        end
    end

    local postLanded = {}
    offset = 0
    while true do
        local page = ystore.page('instashots_posts',
            '`id`, `username`, `caption`, `attachments`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE, '`id`', '`archived` = 0')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, p in ipairs(page) do
            local username = clamp(p.username, 32)
            if not username or not landed[username] then
                out.skipped = out.skipped + 1
            else
                local id = ('yi%s'):format(p.id)
                postLanded[tostring(p.id)] = id
                rows[#rows + 1] = {
                    id, username, media.json(p.attachments), util.trim(p.caption), nil,
                    tonumber(p.ts) or os.time(),
                }
                out.posts = out.posts + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertPgPosts(rows) end
    end

    offset = 0
    while true do
        local page = ystore.page('instashots_comments',
            '`id`, `post_id`, `username`, `comment`, UNIX_TIMESTAMP(`timestamp`) AS ts', offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, c in ipairs(page) do
            local username = clamp(c.username, 32)
            local post = postLanded[tostring(c.post_id)]
            if not username or not landed[username] or not post then
                out.skipped = out.skipped + 1
            else
                rows[#rows + 1] = {
                    ('yic%s'):format(c.id), post, username, util.trim(c.comment), nil,
                    tonumber(c.ts) or os.time(),
                }
                out.comments = out.comments + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertPgComments(rows) end
    end

    offset = 0
    while true do
        local page = ystore.page('instashots_likes',
            '`post_id`, `username`, `is_comment`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE, '`post_id`, `username`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, l in ipairs(page) do
            local username = clamp(l.username, 32)
            local post = postLanded[tostring(l.post_id)]
            -- A comment like points at a comment id, not a post id, and would attach to the wrong
            -- row if it were followed through the post map.
            if util.truthy(l.is_comment) or not username or not landed[username] or not post then
                out.skipped = out.skipped + 1
            else
                rows[#rows + 1] = { post, username, tonumber(l.ts) or os.time() }
                out.likes = out.likes + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertPgLikes(rows) end
    end

    offset = 0
    while true do
        local page = ystore.page('instashots_follows', '`follower`, `followed`', offset, PAGE, '`follower`, `followed`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, f in ipairs(page) do
            local follower = clamp(f.follower, 32)
            local target = clamp(f.followed, 32)
            if not follower or not target or not landed[follower] or not landed[target] then
                out.skipped = out.skipped + 1
            else
                rows[#rows + 1] = { follower, target, 'accepted', os.time() }
                out.follows = out.follows + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertPgFollows(rows) end
    end

    if not ctx.dryRun and #logins > 0 then store.grantMigratedLogins(logins) end
    return out
end

return M
