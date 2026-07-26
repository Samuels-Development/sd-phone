---@type table Photogram porter (server.migrate.port.photogram). Copies lb-phone's Instagram
---accounts and content into Photogram. Content is username-keyed on both sides so it copies
---without identity resolution; only the accounts-engine session needs a citizenid.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table Shared server helpers (server.util).
local util  = require 'server.util'

---@type string Id prefix, keeping migrated ids clear of natively generated 7-char base36 ids.
local P = 'i'

local function id(v) return P .. tostring(v) end
local function ts(v) return math.floor(tonumber(v) or 0) end
local function bit(v) return util.truthy(v) and 1 or 0 end

---A string capped at `len`, nil when absent or empty.
---@param v any
---@param len integer
---@return string|nil
local function str(v, len)
    if v == nil then return nil end
    local s = tostring(v)
    if s == '' then return nil end
    return s:sub(1, len)
end

---Needs no identity resolution: content is username-keyed on both sides, so it imports whole even
---when an owner cannot be matched to a character.
---@param ctx table migration context (dryRun)
---@return table counts
function M.run(ctx)
    local out = {
        profiles = 0, posts = 0, comments = 0, likes = 0, commentLikes = 0, follows = 0,
        stories = 0, views = 0, dms = 0, notifications = 0, accounts = 0, skipped = 0, orphan = 0,
    }
    local profiles, accounts = {}, {}
    local posts, comments, likes, commentLikes = {}, {}, {}, {}
    local follows, stories, views, dms, notifs = {}, {}, {}, {}, {}

    local taken = store.existingPhotogramUsernames()
    local known = {}
    -- Parents that actually made it across. A child pointing at a row that was never migrated is
    -- an orphan: sd-phone's own foreign keys either delete it on boot or refuse to install, so it
    -- must never be written. Same rule photos.lua applies to album links.
    local postIds, commentIds, storyIds = {}, {}, {}

    ---Classifies a child row that is not being imported. An account that already existed was
    ---deliberately left alone, so its content is `skipped`, not lost; only a genuinely missing
    ---parent is an `orphan`. Without the split, a re-run reports every child as an orphan and
    ---reads like data loss.
    ---@param user string|nil the child's author
    local function drop(user)
        if user and taken[user] then out.skipped = out.skipped + 1
        else out.orphan = out.orphan + 1 end
    end

    if store.lbSource('instagram_accounts') then
        for _, a in ipairs(store.lbIgAccounts()) do
            local user = str(a.username, 64)
            if user and not taken[user] then
                known[user] = true
                profiles[#profiles + 1] = {
                    user, str(a.display_name, 64) or user, str(a.bio, 200) or '',
                    str(a.profile_image, 512), bit(a.private), bit(a.verified), ts(a.ts),
                }
                out.profiles = out.profiles + 1

                -- Accounts only. Who is signed in comes from lb's logged-in state, which the
                -- sessions porter owns; signing in every account whose phone resolves would sign a
                -- player into all of their alts.
                accounts[#accounts + 1] = {
                    'photogram', user, str(a.display_name, 50) or user, str(a.password, 64) or '',
                }
                out.accounts = out.accounts + 1
            else
                out.skipped = out.skipped + 1
            end
        end
    end

    if store.lbSource('instagram_posts') then
        for _, p in ipairs(store.lbIgPosts()) do
            if known[p.username] then
                postIds[id(p.id)] = true
                posts[#posts + 1] = {
                    id(p.id), p.username, p.media, str(p.caption, 2200) or '',
                    str(p.location, 120), ts(p.ts),
                }
                out.posts = out.posts + 1
            end
        end
    end

    if store.lbSource('instagram_comments') then
        for _, c in ipairs(store.lbIgComments()) do
            if known[c.username] and postIds[id(c.post_id)] then
                commentIds[id(c.id)] = true
                comments[#comments + 1] = {
                    id(c.id), id(c.post_id), c.username, str(c.comment, 1000), nil, ts(c.ts),
                }
                out.comments = out.comments + 1
            else
                drop(c.username)
            end
        end
    end

    if store.lbSource('instagram_likes') then
        for _, l in ipairs(store.lbIgLikes()) do
            if known[l.username] and util.truthy(l.is_comment) and commentIds[id(l.id)] then
                commentLikes[#commentLikes + 1] = { id(l.id), l.username, 0 }
                out.commentLikes = out.commentLikes + 1
            elseif known[l.username] and not util.truthy(l.is_comment) and postIds[id(l.id)] then
                likes[#likes + 1] = { id(l.id), l.username, 0 }
                out.likes = out.likes + 1
            else
                drop(l.username)
            end
        end
    end

    if store.lbSource('instagram_follows') then
        for _, f in ipairs(store.lbIgFollows()) do
            if known[f.follower] and known[f.followed] then
                follows[#follows + 1] = { f.follower, f.followed, 'accepted', 0 }
                out.follows = out.follows + 1
            end
        end
    end

    if store.lbSource('instagram_follow_requests') then
        for _, r in ipairs(store.lbIgRequests()) do
            if known[r.requester] and known[r.requestee] then
                follows[#follows + 1] = { r.requester, r.requestee, 'pending', ts(r.ts) }
                out.follows = out.follows + 1
            end
        end
    end

    if store.lbSource('instagram_stories') then
        for _, s in ipairs(store.lbIgStories()) do
            if known[s.username] and s.image then
                storyIds[id(s.id)] = true
                stories[#stories + 1] = { id(s.id), s.username, str(s.image, 512), ts(s.ts) }
                out.stories = out.stories + 1
            end
        end
    end

    if store.lbSource('instagram_stories_views') then
        for _, v in ipairs(store.lbIgStoryViews()) do
            if known[v.username] and storyIds[id(v.story_id)] then
                views[#views + 1] = { id(v.story_id), v.username, ts(v.ts) }
                out.views = out.views + 1
            else
                drop(v.username)
            end
        end
    end

    if store.lbSource('instagram_messages') then
        for _, d in ipairs(store.lbIgMessages()) do
            if known[d.sender] and known[d.recipient] then
                dms[#dms + 1] = {
                    id(d.id), d.sender, d.recipient, d.content, 'text', d.attachments, nil, 1, ts(d.ts),
                }
                out.dms = out.dms + 1
            end
        end
    end

    if store.lbSource('instagram_notifications') then
        for _, n in ipairs(store.lbIgNotifications()) do
            -- post_id is nullable (a follow notification has none); when set it must point at a
            -- post that migrated, or the notifications foreign key rejects the row.
            local post = n.post_id and id(n.post_id) or nil
            if known[n.username] and (post == nil or postIds[post]) then
                notifs[#notifs + 1] = {
                    id(n.id), n.username, str(n.type, 16) or 'like', n.from_user, post, 1, ts(n.ts),
                }
                out.notifications = out.notifications + 1
            else
                drop(n.username)
            end
        end
    end

    if not ctx.dryRun then
        store.insertPgProfiles(profiles)
        store.insertPgAccounts(accounts)
        store.insertPgPosts(posts)
        store.insertPgComments(comments)
        store.insertPgLikes(likes)
        store.insertPgCommentLikes(commentLikes)
        store.insertPgFollows(follows)
        store.insertPgStories(stories)
        store.insertPgStoryViews(views)
        store.insertPgDms(dms)
        store.insertPgNotifications(notifs)
    end
    return out
end

return M
