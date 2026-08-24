---@type table Clout porter (server.migrate.port.vibez). Copies lb-phone's Trendy accounts and
---videos into Clout. Content is username-keyed on both sides so it copies without identity
---resolution; only the accounts-engine session needs a citizenid.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table Shared server helpers (server.util).
local util  = require 'server.util'

---@type string Id prefix, keeping migrated ids clear of natively generated 7-char base36 ids.
local P = 'v'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end
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

---@type table<string, string> lb notification type -> the kind Clout stores. lb sends `like_comment`
---and `reply`, which Clout folds into the comment kind because it renders them the same way.
local NOTIF_KIND = {
    like         = 'like',
    comment      = 'comment',
    follow       = 'follow',
    save         = 'save',
    reply        = 'comment',
    like_comment = 'comment',
}

---Content needs no identity resolution: it is username-keyed on both sides, so it imports whole even
---when an owner cannot be matched to a character. Ownership is only consulted to hand the owner a
---usable password for the account.
---@param ctx table migration context (numberToCid, dryRun)
---@return table counts
function M.run(ctx)
    local out = {
        profiles = 0, posts = 0, comments = 0, likes = 0, commentLikes = 0, saves = 0,
        follows = 0, notifications = 0, accounts = 0, flattened = 0,
        skipped = 0, orphan = 0, logins = 0,
    }
    local profiles, accounts, grants = {}, {}, {}
    local posts, comments, likes, commentLikes, saves, follows, notifs = {}, {}, {}, {}, {}, {}, {}

    ---@type integer Passes started, so the panel's progress bar moves between them.
    local stage = 0

    ---Marks the start of one pass and answers whether its source table is present.
    ---@param name string lb-phone source table
    ---@return boolean
    local function section(name)
        stage = stage + 1
        if ctx.report then ctx.report(stage, 8) end
        return store.lbSource(name) and true or false
    end

    local taken = store.existingVibezUsernames()
    ---@type table<string, boolean> Accounts a previous run left without a usable password.
    local passwordless = store.accountsMissingLogin('vibez')
    local known = {}
    -- Parents that actually made it across. A child pointing at a row that was never migrated is an
    -- orphan and must never be written, the same rule the Photogram porter applies.
    local postIds, commentIds = {}, {}

    ---Classifies a child row that is not being imported. An account that already existed was
    ---deliberately left alone, so its content is `skipped`, not lost; only a genuinely missing
    ---parent is an `orphan`.
    ---@param user string|nil the child's author
    local function drop(user)
        if user and taken[user] then out.skipped = out.skipped + 1
        else out.orphan = out.orphan + 1 end
    end

    if section('tiktok_accounts') then
        for _, a in ipairs(store.lbTkAccounts()) do
            local user = str(a.username, 64)
            if user and not taken[user] then
                known[user] = true
                profiles[#profiles + 1] = {
                    user, str(a.display_name, 64) or user, str(a.bio, 160) or '',
                    str(a.avatar, 512), bit(a.verified), ts(a.ts),
                }
                out.profiles = out.profiles + 1

                -- Accounts only. Who is signed in comes from lb's logged-in state, which the
                -- sessions porter owns; signing in every account whose phone resolves would sign a
                -- player into all of their alts.
                accounts[#accounts + 1] = {
                    'vibez', user, str(a.display_name, 50) or user, str(a.password, 64) or '',
                }
                out.accounts = out.accounts + 1

                -- lb's hash is bcrypt and unusable here, so the owner needs a password they can
                -- actually read and type. Granted after the insert below.
                local cid = ctx.numberToCid[digits(a.phone_number)]
                if cid then grants[#grants + 1] = { app = 'vibez', username = user, cid = cid } end
            else
                out.skipped = out.skipped + 1
                -- Already here, but possibly from a run that created the account without handing
                -- its owner a password. Re-granting only those recovers them; anyone who already
                -- has one keeps it rather than having it rotated underneath them.
                local cid = ctx.numberToCid[digits(a.phone_number)]
                if cid and user and passwordless[user] then
                    grants[#grants + 1] = { app = 'vibez', username = user, cid = cid }
                end
            end
        end
    end

    if section('tiktok_videos') then
        for _, v in ipairs(store.lbTkVideos()) do
            if known[v.username] and v.src then
                postIds[id(v.id)] = true
                -- lb keeps no poster frame, so `thumb` stays null and Clout falls back to the
                -- video's own first frame, which is what it does for a post with no thumbnail.
                posts[#posts + 1] = {
                    id(v.id), v.username, str(v.src, 512), nil, str(v.caption, 300) or '',
                    str(v.music, 120) or '', math.max(0, ts(v.views)), ts(v.ts),
                }
                out.posts = out.posts + 1
            else
                drop(v.username)
            end
        end
    end

    if section('tiktok_comments') then
        for _, c in ipairs(store.lbTkComments()) do
            if known[c.username] and postIds[id(c.video_id)] then
                commentIds[id(c.id)] = true
                -- lb threads replies through `reply_to`; Clout's comments are flat. A reply is
                -- imported as a top-level comment on the same video: the text survives and the
                -- nesting does not, which beats dropping what someone actually wrote.
                if c.reply_to then out.flattened = out.flattened + 1 end
                comments[#comments + 1] = {
                    id(c.id), id(c.video_id), c.username, str(c.comment, 500) or '', nil, ts(c.ts),
                }
                out.comments = out.comments + 1
            else
                drop(c.username)
            end
        end
    end

    if section('tiktok_likes') then
        for _, l in ipairs(store.lbTkLikes()) do
            if known[l.username] and postIds[id(l.video_id)] then
                likes[#likes + 1] = { id(l.video_id), l.username, 0 }
                out.likes = out.likes + 1
            else
                drop(l.username)
            end
        end
    end

    if section('tiktok_saves') then
        for _, s in ipairs(store.lbTkSaves()) do
            if known[s.username] and postIds[id(s.video_id)] then
                saves[#saves + 1] = { id(s.video_id), s.username, 0 }
                out.saves = out.saves + 1
            else
                drop(s.username)
            end
        end
    end

    if section('tiktok_comments_likes') then
        for _, l in ipairs(store.lbTkCommentLikes()) do
            if known[l.username] and commentIds[id(l.comment_id)] then
                commentLikes[#commentLikes + 1] = { id(l.comment_id), l.username, 0 }
                out.commentLikes = out.commentLikes + 1
            else
                drop(l.username)
            end
        end
    end

    if section('tiktok_follows') then
        for _, f in ipairs(store.lbTkFollows()) do
            if known[f.follower] and known[f.followed] then
                -- lb names the pair followed/follower; Clout stores it follower -> target.
                follows[#follows + 1] = { f.follower, f.followed, 0 }
                out.follows = out.follows + 1
            end
        end
    end

    if section('tiktok_notifications') then
        for _, n in ipairs(store.lbTkNotifications()) do
            -- video_id is nullable (a follow notification has none); when set it must point at a
            -- video that migrated, or the row would reference a post nobody can open.
            local post = n.video_id and id(n.video_id) or nil
            if known[n.username] and (post == nil or postIds[post]) then
                notifs[#notifs + 1] = {
                    id(n.id), n.username, NOTIF_KIND[tostring(n.type or ''):lower()] or 'like',
                    n.from_user, post, nil, 1, ts(n.ts),
                }
                out.notifications = out.notifications + 1
            else
                drop(n.username)
            end
        end
    end

    if not ctx.dryRun then
        store.insertVzProfiles(profiles)
        store.insertPgAccounts(accounts)
        store.insertVzPosts(posts)
        store.insertVzComments(comments)
        store.insertVzLikes(likes)
        store.insertVzSaves(saves)
        store.insertVzCommentLikes(commentLikes)
        store.insertVzFollows(follows)
        store.insertVzNotifications(notifs)
        out.logins = store.grantMigratedLogins(grants)
    end
    return out
end

return M
