---@type table sd-phone config root (configs/config.lua): stitches every configs/*.lua group together.
local config = require 'configs.config'
---@type table Review persistence layer (server.review.store): review/helpful-vote/override row CRUD.
local store = require 'server.review.store'
---@type table Player bridge (bridge.server.player): citizenid/name lookups + online cid map.
local player = require 'bridge.server.player'
---@type table Job bridge (bridge.server.job): framework-agnostic on-job + boss checks.
local job = require 'bridge.server.job'
---@type table Settings persistence layer (server.settings.store): per-app notification prefs.
local settings = require 'server.settings.store'

---@type table Review app config (config.Review): curated business list, length caps, categories.
local RV = config.Review

---@type table Actions module; the table returned at end of file.
local actions = {}

---@type table<string, table> Config business records keyed by id, built once at load.
local bizById = {}
for _, b in ipairs(RV.Businesses) do bizById[b.id] = b end

---Stable per-character key (citizenid on qb/qbx, identifier on ESX), resolved from src.
---@param src integer player server id
---@return string|nil citizenid, nil when the player can't be resolved
local function cidOf(src) return player.getIdentifier(src) end

local util = require 'server.util'
local trim = util.trim

---Coerce a client-supplied review id to a finite integer, or nil.
---@param id any client-supplied review id
---@return integer|nil id usable integral id, nil when the value can't be one
local function reviewIdArg(id)
    id = tonumber(id)
    if not id or id ~= id or id == math.huge or id == -math.huge then return nil end
    return math.floor(id)
end

---True when `src` is the boss of the company that owns business `b`: currently on the linked
---job and holding its boss flag. Businesses with no `job` link can never be managed in-game.
---@param src integer player server id
---@param b table config business record
---@return boolean boss
local function isBossOf(src, b)
    if not b.job or b.job == '' then return false end
    return job.isBoss(src, b.job, b.bossGrade or RV.BossGrade)
end

---Notify every online boss of `b`'s company that a new review landed, skipping the reviewer
---themselves and anyone who turned Review notifications off. No-op for businesses with no linked job.
---@param b table config business record
---@param reviewerCid string reviewer's citizenid (excluded from the push)
---@param author string reviewer display name as stamped on the review
---@param rating integer star rating 1-5
local function notifyOwners(b, reviewerCid, author, rating)
    if not b.job or b.job == '' then return end
    for cid, src in pairs(player.onlineCidMap()) do
        if cid ~= reviewerCid
            and job.isBoss(src, b.job, b.bossGrade or RV.BossGrade)
            and settings.getNotifPref(cid, 'review') then
            TriggerClientEvent('sd-phone:client:notify', src, {
                app   = 'review',
                appId = 'review',
                title = b.name,
                body  = ('%s left a %d-star review'):format(author, rating),
                time  = 'now',
            })
        end
    end
end

---Merge a saved boss override over the config business. Only hours/blurb/logo are mutable;
---everything else is fixed in config. Returns a shallow copy.
---@param b table config business record
---@param ov table|nil override row { hours?, blurb?, logo? }
---@return table merged shallow copy (or `b` itself when there's no override)
local function withOverride(b, ov)
    if not ov then return b end
    local m = {}
    for k, v in pairs(b) do m[k] = v end
    if ov.hours and ov.hours ~= '' then m.hours = ov.hours end
    if ov.blurb and ov.blurb ~= '' then m.blurb = ov.blurb end
    if ov.logo  and ov.logo  ~= '' then m.logo  = ov.logo  end
    return m
end

---"1st" / "2nd" / "11th" - English ordinal suffix for a day of month.
---@param d integer day of month
---@return string ordinal e.g. '3rd'
local function ordinal(d)
    local m100 = d % 100
    if m100 >= 11 and m100 <= 13 then return d .. 'th' end
    local m10 = d % 10
    if m10 == 1 then return d .. 'st' end
    if m10 == 2 then return d .. 'nd' end
    if m10 == 3 then return d .. 'rd' end
    return d .. 'th'
end

---Human date label for a review timestamp: 'Today' / 'Yesterday' by calendar day (not a rolling
---24h window), else 'July 3rd, 2026'.
---@param ts integer unix seconds the review was created
---@return string label
local function fmtDate(ts)
    local now   = os.time()
    local today = os.date('*t', now)
    local that  = os.date('*t', ts)
    if that.year == today.year and that.yday == today.yday then return 'Today' end
    local yd = os.date('*t', now - 86400)
    if that.year == yd.year and that.yday == yd.yday then return 'Yesterday' end
    return os.date('%B ', ts) .. ordinal(that.day) .. ', ' .. that.year
end

---Public business shape sent to the UI. Normalises the empty-string phone to nil.
---@param b table config business record (possibly override-merged)
---@param rating number|nil displayed star average (defaults 0 when unrated)
---@param count integer|nil review count (defaults 0 when unrated)
---@return table business UI row
local function pubBusiness(b, rating, count)
    return {
        id       = b.id,
        name     = b.name,
        category = b.category,
        address  = b.address,
        hours    = b.hours,
        phone    = b.phone ~= '' and b.phone or nil,
        blurb    = b.blurb,
        logo     = b.logo,
        rating   = rating or 0,
        count    = count or 0,
    }
end

---Round to one decimal place for the displayed star average.
---@param n number raw average
---@return number rounded
local function round1(n) return lib.math.round(n, 1) end

---Review row -> UI shape. `mine` is computed against the caller's citizenid; the citizenid itself
---is dropped here.
---@param row table review row (or an equivalent literal for a just-created review)
---@param cid string caller's citizenid
---@param helpfulCount integer|nil helpful votes on this review
---@param helped boolean|nil whether the caller has voted it helpful
---@return table review UI row
local function toReview(row, cid, helpfulCount, helped)
    return {
        id      = tostring(row.id),
        author  = row.author,
        rating  = row.rating,
        body    = row.body,
        image   = row.image,
        date    = fmtDate(row.created_at),
        mine    = row.citizenid == cid,
        helpful = helpfulCount or 0,
        helped  = helped or false,
    }
end

---Directory list: every configured business, override-merged and stamped with its aggregate
---rating/count, the caller's own rating, and whether they can manage it. Read-only.
---@param src integer player server id
---@return table result { success, data = { businesses, categories } }
function actions.list(src)
    local cid = cidOf(src)
    if not cid then return { success = false, data = { businesses = {}, categories = RV.Categories } } end

    local agg = {}
    for _, r in ipairs(store.aggregate()) do
        agg[r.business_id] = { count = tonumber(r.cnt) or 0, avg = round1(tonumber(r.avg) or 0) }
    end
    local mine = {}
    for _, r in ipairs(store.myRatings(cid)) do mine[r.business_id] = r.rating end

    local ovMap = {}
    for _, r in ipairs(store.overrides()) do ovMap[r.business_id] = r end

    local out = {}
    for _, b in ipairs(RV.Businesses) do
        local a = agg[b.id]
        local biz = pubBusiness(withOverride(b, ovMap[b.id]), a and a.avg or 0, a and a.count or 0)
        biz.myRating  = mine[b.id]
        biz.canManage = isBossOf(src, b)
        out[#out + 1] = biz
    end
    return { success = true, data = { businesses = out, categories = RV.Categories } }
end

---One business + its most-recent reviews, each stamped with its helpful count and the caller's
---vote state. The header rating is recomputed from the returned rows. Read-only.
---@param src integer player server id
---@param id any client-supplied business id
---@return table result { success, data = { business, reviews } }
function actions.business(src, id)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    local b = bizById[id]
    if not b then return { success = false, message = 'Unknown business' } end

    local helpMap = {}
    for _, r in ipairs(store.helpfulMapForBusiness(id)) do helpMap[tostring(r.review_id)] = tonumber(r.cnt) or 0 end
    local helpedSet = {}
    for _, r in ipairs(store.myHelpedForBusiness(id, cid)) do helpedSet[tostring(r.review_id)] = true end

    local rows = store.reviewsFor(id, RV.ReviewsPerBusiness)
    local reviews, sum = {}, 0
    for _, row in ipairs(rows) do
        local rid = tostring(row.id)
        reviews[#reviews + 1] = toReview(row, cid, helpMap[rid], helpedSet[rid])
        sum = sum + row.rating
    end
    local count  = #rows
    local rating = count > 0 and round1(sum / count) or 0

    local ov = store.overrides()
    local ovRow
    for _, r in ipairs(ov) do if r.business_id == id then ovRow = r; break end end

    local biz = pubBusiness(withOverride(b, ovRow), rating, count)
    biz.canManage = isBossOf(src, b)
    return { success = true, data = { business = biz, reviews = reviews } }
end

---Create the caller's review for a business, one per character per business. Fields are
---server-stamped from src, capped to their column widths; owners are notified after the row lands.
---@param src integer player server id
---@param payload any { businessId, rating, body, image? } - attacker-controlled
---@return table result { success, data = { review } } | { success = false, message }
function actions.create(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    local b = bizById[payload.businessId]
    if not b then return { success = false, message = 'Unknown business' } end

    if store.reviewIdFor(b.id, cid) then
        return { success = false, message = 'You have already reviewed this business' }
    end

    local rating = math.floor(tonumber(payload.rating) or 0)
    if rating ~= rating or rating < 1 or rating > 5 then return { success = false, message = 'Pick a star rating' } end

    local body = trim(payload.body)
    if #body < RV.MinBodyLength then return { success = false, message = 'Write a short review' } end
    if #body > RV.MaxBodyLength then body = body:sub(1, RV.MaxBodyLength) end

    local image = trim(payload.image)
    if image == '' then image = nil
    elseif #image > RV.MaxImageUrlLength then image = image:sub(1, RV.MaxImageUrlLength) end

    local author = player.getName(src) or 'Anonymous'
    local ts = os.time()
    local id = store.insert(b.id, cid, author, rating, body, image, ts)

    notifyOwners(b, cid, author, rating)

    return { success = true, data = { review = toReview({
        id = id, citizenid = cid, author = author, rating = rating, body = body, image = image, created_at = ts,
    }, cid, 0, false) } }
end

---Delete a review. Ownership-scoped: the row's author citizenid must match before any mutation.
---Idempotent.
---@param src integer player server id
---@param id any client-supplied review id
---@return table result { success, data = { id } } | { success = false, message }
function actions.delete(src, id)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    id = reviewIdArg(id)
    if not id then return { success = false, message = 'Bad review id' } end
    if store.ownerOf(id) ~= cid then return { success = false, message = 'Not your review' } end
    store.delete(id)
    return { success = true, data = { id = tostring(id) } }
end

---Toggle the caller's helpful vote on a review. Voting on your own review is refused. Returns the
---fresh count.
---@param src integer player server id
---@param id any client-supplied review id
---@return table result { success, data = { id, helpful, helped } } | { success = false, message }
function actions.helpful(src, id)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    id = reviewIdArg(id)
    if not id then return { success = false, message = 'Bad review id' } end

    local owner = store.ownerOf(id)
    if not owner then return { success = false, message = 'Review not found' } end
    if owner == cid then return { success = false, message = "You can't mark your own review" } end

    local helped = store.toggleHelpful(id, cid, os.time())
    return { success = true, data = { id = tostring(id), helpful = store.helpfulCount(id), helped = helped } }
end

---Boss-only: update a business's display details (hours / blurb / logo), verified server-side
---against the linked job's boss flag. Reviews are never touched. The logo must be a #RRGGBB hex colour.
---@param src integer player server id
---@param payload any { id, hours?, blurb?, logo? } - attacker-controlled
---@return table result { success, data = { business } } | { success = false, message }
function actions.manage(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    local b = bizById[payload.id]
    if not b then return { success = false, message = 'Unknown business' } end
    if not isBossOf(src, b) then return { success = false, message = 'Only the business owner can edit this' } end

    local hours = trim(payload.hours)
    if #hours > RV.MaxHoursLength then hours = hours:sub(1, RV.MaxHoursLength) end
    local blurb = trim(payload.blurb)
    if #blurb > RV.MaxBlurbLength then blurb = blurb:sub(1, RV.MaxBlurbLength) end

    local logo = trim(payload.logo):upper()
    if not logo:match('^#%x%x%x%x%x%x$') then logo = b.logo end

    if hours == '' then hours = nil end
    if blurb == '' then blurb = nil end

    store.setOverride(b.id, hours, blurb, logo, cid, os.time())

    local rows, sum = store.reviewsFor(b.id, RV.ReviewsPerBusiness), 0
    for _, r in ipairs(rows) do sum = sum + r.rating end
    local count  = #rows
    local rating = count > 0 and round1(sum / count) or 0

    local biz = pubBusiness(withOverride(b, { hours = hours, blurb = blurb, logo = logo }), rating, count)
    biz.canManage = true
    return { success = true, data = { business = biz } }
end

return actions
