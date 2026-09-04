---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name lookups from a server id.
local player  = require 'bridge.server.player'
---@type table Money bridge (bridge.server.money): framework-agnostic account credits/debits.
local money   = require 'bridge.server.money'
---@type table Streaks persistence layer (server.streaks.store): streak/post/like row CRUD.
local store   = require 'server.streaks.store'
---@type table Streaks live-push module (server.streaks.live): broadcast fan-out to open galleries.
local live    = require 'server.streaks.live'
---@type table Banking actions (server.banking.actions): addExternal appends a Wallet statement row.
local banking = require 'server.banking.actions'

---@type table Streaks app config (config.Streaks): milestone ladder, reward account, size caps.
local CFG = config.Streaks or require 'configs.streaks'

---@type table Actions module; the table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail, trim = util.ok, util.fail, util.trim

---Stable per-character key (citizenid on qb/qbx, identifier on ESX), resolved from the server id.
---@param src integer player server id
---@return string|nil citizenid nil when the player can't be resolved
local function cidOf(src) return player.getIdentifier(src) end

---Coerce a client-supplied id/cursor to a positive integer. Rejects non-numbers, NaN, infinities
---and non-positives, flooring what survives.
---@param v any client-supplied value
---@return integer|nil n positive integer, or nil when unusable
local function posInt(v)
    local n = tonumber(v)
    if not n or n ~= n or n == math.huge or n <= 0 then return nil end
    return math.floor(n)
end

---"$1,500" style for the bank notification line.
---
---The amount comes from configs/streaks.lua milestone rewards, so it is server-owner input.
---lib.math.groupdigits matches on a digit and indexes the capture, meaning an infinity or a NaN
---raises rather than formatting; util.finite keeps a mistyped reward to a wrong number instead of
---a failed payout.
---@param n number whole-dollar amount
---@return string formatted
local function fmtMoney(n)
    local v = tonumber(n)
    return '$' .. lib.math.groupdigits(util.finite(v) and math.floor(v) or 0, ',')
end

---config.Streaks.Milestones (a sparse day -> reward map) sorted ascending into the { day, reward }
---list shape the client renders.
---@return table[] milestones
local function milestoneList()
    local days = {}
    for day in pairs(CFG.Milestones) do days[#days + 1] = day end
    table.sort(days)
    local out = {}
    for _, day in ipairs(days) do out[#out + 1] = { day = day, reward = CFG.Milestones[day] } end
    return out
end

---The static app config the client renders from (milestone ladder, reward account, caption cap).
---Config-derived only - nothing player-specific.
---@return table clientConfig
local function clientConfig()
    return {
        milestones       = milestoneList(),
        rewardAccount    = CFG.RewardAccount,
        maxCaptionLength = CFG.MaxCaptionLength,
    }
end

---DB row -> the React post shape (camelCase). isMine and likedByMe are computed against the
---viewer's cid.
---@param row table post row (store's POST_SELECT projection)
---@param cid string viewer citizenid
---@return table post
local function serializePost(row, cid)
    local caption = row.caption
    if caption == '' then caption = nil end
    return {
        id        = tonumber(row.id),
        author    = row.author_name or '',
        imageUrl  = row.image_url,
        caption   = caption,
        dayStreak = tonumber(row.day_streak) or 0,
        postDate  = row.post_date,
        createdAt = tonumber(row.created_at) or 0,
        likeCount = tonumber(row.like_count) or 0,
        likedByMe = (tonumber(row.liked) or 0) > 0,
        isMine    = row.citizenid == cid,
    }
end

---The caller's streak snapshot, including today's post if they've made one. resetInSeconds counts
---down to the next server midnight. Read-only.
---@param cid string citizenid
---@param today string server-local 'YYYY-MM-DD'
---@return table state
local function buildState(cid, today)
    local s = store.getStreak(cid)
    local current = s and tonumber(s.current_streak) or 0
    local longest = s and tonumber(s.longest_streak) or 0
    local last    = s and s.last_post_date or nil

    local postedToday = false
    local todayPost = nil
    local row = store.getPost(cid, store.postForDay(cid, today) or -1)
    if row and row.post_date == today and row.citizenid == cid then
        postedToday = true
        todayPost = serializePost(row, cid)
    end

    local t = os.date('*t')
    local resetIn = 86400 - (t.hour * 3600 + t.min * 60 + t.sec)

    return {
        current        = current,
        longest        = longest,
        lastPostDate   = last,
        postedToday    = postedToday,
        todayPost      = todayPost,
        resetInSeconds = resetIn,
    }
end

---Full app snapshot for open/reopen: the caller's streak state, the static config, and the newest
---gallery page. Identity comes from src only. Read-only.
---@param src integer player server id
---@return table result
function actions.sync(src)
    local cid = cidOf(src)
    if not cid then return fail('streaks.notSigned', 'Not signed in') end

    local today = os.date('%Y-%m-%d')
    local gallery = {}
    for _, row in ipairs(store.galleryPosts(cid, nil, CFG.GalleryPageSize)) do
        gallery[#gallery + 1] = serializePost(row, cid)
    end

    return ok({
        state   = buildState(cid, today),
        config  = clientConfig(),
        gallery = gallery,
    })
end

---Create today's photo post and advance the caller's streak. A milestone day pays
---config.Streaks.Milestones[day] into config.Streaks.RewardAccount and logs a Wallet statement row.
---@param src integer player server id
---@param payload table { imageUrl: string, caption?: string }
---@return table result { state, post, reward? }
function actions.post(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = cidOf(src)
    if not cid then return fail('streaks.notSigned', 'Not signed in') end

    local imageUrl = trim(payload.imageUrl)
    if not lib.string.startsWith(imageUrl, 'http') then return fail('streaks.invalidImage', 'Invalid image') end
    imageUrl = imageUrl:sub(1, 512)

    local caption = trim(payload.caption):sub(1, CFG.MaxCaptionLength)
    if caption == '' then caption = nil end

    local today = os.date('%Y-%m-%d')
    if store.postForDay(cid, today) then return fail('streaks.haveAlreadyPostedToday', 'You have already posted today') end

    local s = store.getStreak(cid)
    local current = s and tonumber(s.current_streak) or 0
    local longest = s and tonumber(s.longest_streak) or 0
    local last    = s and s.last_post_date or nil

    local yesterday = os.date('%Y-%m-%d', os.time() - 86400)
    if last == yesterday then
        current = current + 1
    else
        current = 1
    end
    longest = math.max(longest, current)

    local authorName = player.getName(src):sub(1, 80)
    local createdAt  = os.time()
    local postId = store.insertPost(cid, authorName, imageUrl, caption, current, today, createdAt)
    if not postId then return fail('streaks.haveAlreadyPostedToday', 'You have already posted today') end

    store.upsertStreak(cid, current, longest, today)

    local reward = nil
    if CFG.Milestones[current] then
        local amount = CFG.Milestones[current]
        money.add(src, CFG.RewardAccount, amount, 'Streaks milestone reward')
        if CFG.RewardAccount == 'bank' then
            banking.addExternal(cid, {
                label        = ('Day %d streak milestone'):format(current),
                amount       = amount,
                category     = 'streaks',
                counterparty = 'Streaks',
                notify       = ('You received %s for hitting a %d day Streaks milestone!'):format(fmtMoney(amount), current),
            })
        end
        reward = { day = current, reward = amount }
    end

    live.newPost({
        id        = postId,
        author    = authorName,
        imageUrl  = imageUrl,
        caption   = caption,
        dayStreak = current,
        postDate  = today,
        createdAt = createdAt,
        likeCount = 0,
    })

    local fresh = store.getPost(cid, postId)
    return ok({
        state  = buildState(cid, today),
        post   = serializePost(fresh, cid),
        reward = reward,
    })
end

---One older page of the global gallery, keyed by the client's `before` cursor (the created_at of
---the last row it already has; absent for the first page). Read-only.
---@param src integer player server id
---@param payload table { before?: integer }
---@return table result
function actions.gallery(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = cidOf(src)
    if not cid then return fail('streaks.notSigned', 'Not signed in') end

    local before = posInt(payload.before)
    local out = {}
    for _, row in ipairs(store.galleryPosts(cid, before, CFG.GalleryPageSize)) do
        out[#out + 1] = serializePost(row, cid)
    end
    return ok(out)
end

---Toggle the caller's like on a post. The cached like_count is re-derived from a COUNT(*) after
---every toggle.
---@param src integer player server id
---@param payload table { postId: integer }
---@return table result { likeCount, likedByMe }
function actions.like(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = cidOf(src)
    if not cid then return fail('streaks.notSigned', 'Not signed in') end

    local postId = posInt(payload.postId)
    if not postId then return fail('streaks.postNotFound', 'Post not found') end
    local row = store.getPostRow(postId)
    if not row then return fail('streaks.postNotFound', 'Post not found') end

    local likedByMe
    if store.isLiked(row.id, cid) then
        store.removeLike(row.id, cid)
        likedByMe = false
    else
        store.addLike(row.id, cid)
        likedByMe = true
    end

    local count = store.likeCount(row.id)
    store.setLikeCount(row.id, count)
    live.postChanged({ postId = tonumber(row.id), likeCount = count })

    return ok({ likeCount = count, likedByMe = likedByMe })
end

---Top current streaks for the leaderboard tab. Rows carry a display name, day count and a
---server-computed isMe. Read-only.
---@param src integer player server id
---@return table result
function actions.leaderboard(src)
    local cid = cidOf(src)
    if not cid then return fail('streaks.notSigned', 'Not signed in') end

    local out = {}
    for i, row in ipairs(store.leaderboard(CFG.LeaderboardSize)) do
        out[#out + 1] = {
            rank    = i,
            name    = row.author_name or '',
            current = tonumber(row.current_streak) or 0,
            isMe    = row.citizenid == cid,
        }
    end
    return ok(out)
end

---Admin/testing: force a player's streak to a given day count. last_post_date is set to yesterday
---(when days > 0), cleared when days = 0, then pushes a live refresh. Not a client callback.
---@param src integer player server id
---@param days number day count to force (floored, clamped at 0)
---@return boolean ok, integer? days
function actions.setStreak(src, days)
    local cid = cidOf(src)
    if not cid then return false end
    days = math.max(0, math.floor(tonumber(days) or 0))
    local s = store.getStreak(cid)
    local longest  = math.max(days, s and tonumber(s.longest_streak) or 0)
    local lastDate = days > 0 and os.date('%Y-%m-%d', os.time() - 86400) or nil
    store.upsertStreak(cid, days, longest, lastDate)
    print(('^3[sd-phone:streaks]^0 setStreak cid=%s -> day %d'):format(tostring(cid), days))
    TriggerClientEvent('sd-phone:client:streaks:refresh', src)
    return true, days
end

---Admin/testing: wipe ALL streak data (every player), then live-refresh the caller's open app.
---Not a client callback.
---@param src integer|nil admin's server id (nil skips the refresh push)
---@return boolean ok
function actions.wipeAll(src)
    store.wipeAll()
    print('^1[sd-phone:streaks]^0 ALL streak data wiped')
    if src then TriggerClientEvent('sd-phone:client:streaks:refresh', src) end
    return true
end

---Admin/testing: add (or subtract, with a negative amount) days on top of the current streak.
---Delegates clamping, persistence and the refresh push to setStreak. Not a client callback.
---@param src integer player server id
---@param amount number days to add (negative reverts)
---@return boolean ok, integer? days
function actions.addStreak(src, amount)
    local cid = cidOf(src)
    if not cid then return false end
    local s = store.getStreak(cid)
    local current = s and tonumber(s.current_streak) or 0
    return actions.setStreak(src, current + (tonumber(amount) or 0))
end

return actions
