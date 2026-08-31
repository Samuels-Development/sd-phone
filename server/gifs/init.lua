---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid for the per-character fetch budget.
local player = require 'bridge.server.player'

---@type string GIPHY v1 API base URL; every request is proxied through the server.
local GIPHY = 'https://api.giphy.com/v1/'

local util = require 'server.util'
local ok, fail = util.ok, util.fail

---@type integer Minimum gap between outbound cache misses per character (ms). A caller that
---arrives inside the gap waits it out rather than being refused, so a real search never comes
---back empty.
local FETCH_COOLDOWN = 300
---@type integer, integer Rolling budget of cache misses per character. Every miss is one outbound
---GIPHY request against the owner's quota. Pacing already holds a typed phrase to about five
---fetches, so 45 a minute covers a player working through nine of them and still bounds a burn.
local FETCH_WINDOW, FETCH_MAX = 60000, 45

---@type table<string, { p: table, at: integer }> In-flight GIPHY fetches by cache key. Without
---this a cold cache lets every concurrent caller issue its own request, which is what burns the
---quota.
local inflight = {}
---@type integer After this an in-flight entry is treated as abandoned, so an owner that died
---mid-fetch cannot wedge the key for the rest of the server's uptime.
local INFLIGHT_STALE = 20000

---Runs `fetch` once for `key` however many callers arrive together: the first owns the request and
---the rest await its result.
---@param key string dedupe key
---@param fetch fun(): any the work, run only by the first caller
---@return any result whatever `fetch` returned
local function once(key, fetch)
    local pending = inflight[key]
    if pending and (GetGameTimer() - pending.at) < INFLIGHT_STALE then return Citizen.Await(pending.p) end

    local entry = { p = promise.new(), at = GetGameTimer() }
    inflight[key] = entry
    -- Resolved even when the fetch raises, or every caller already awaiting this key would hang
    -- on a promise nothing ever settles.
    local ran, result = pcall(fetch)
    if inflight[key] == entry then inflight[key] = nil end
    entry.p:resolve(ran and result or nil)
    return ran and result or nil
end

---@type table<string, integer> Character -> GetGameTimer ms its next outbound fetch may leave.
local nextFetchAt = {}
---@type table<string, integer> Character -> ordinal of the newest caller parked on its slot.
local fetchSeq = {}

---Paces a cache miss against the caller's fetch budget; a hit never reaches this, so browsing
---cached content is never throttled. A caller arriving inside the gap parks until the slot frees
---instead of being refused, and is displaced only by a newer call from the same character - the
---picker re-searches on every keystroke and renders only its newest reply, so the search a player
---actually finished typing is always the one that fetches.
---@param src integer player server id
---@return boolean ok true when the outbound request may be made
local function mayFetch(src)
    local cid = player.getIdentifier(src)
    if type(cid) ~= 'string' or cid == '' then return true end

    local now  = GetGameTimer()
    local wait = (nextFetchAt[cid] or 0) - now
    if wait > 0 and wait <= FETCH_COOLDOWN then
        local seq = (fetchSeq[cid] or 0) + 1
        fetchSeq[cid] = seq
        Wait(wait)
        if fetchSeq[cid] ~= seq then return false end
        fetchSeq[cid] = nil
        now = GetGameTimer()
    end

    nextFetchAt[cid] = now + FETCH_COOLDOWN
    -- Charged after the wait so a displaced caller, whose result is discarded anyway, never
    -- spends a slice of the budget a real search needs.
    return util.rateLimit(cid, 'gifs:fetch', FETCH_WINDOW, FETCH_MAX)
end

util.onCleanup(function(_, cid)
    if cid then nextFetchAt[cid], fetchSeq[cid] = nil, nil end
end)


---@return table Giphy config (configs/giphy.lua): Limit, Rating (the API key is in config.ApiKeys).
local function cfg() return config.Giphy or {} end

---The GIPHY API key, read from the server-only configs/server/apikeys.lua (merged into
---config.ApiKeys server-side).
---@return string key the API key, or '' when unconfigured
local function apiKey() return (config.ApiKeys or {}).Giphy or '' end

---@return boolean true when a GIPHY API key is configured (the picker is disabled without one)
local function hasKey()
    return apiKey() ~= ''
end

---Percent-encodes a value for use as a single query-string parameter.
---@param s any value to encode (tostring'd; nil becomes '')
---@return string encoded
local function urlencode(s)
    return (tostring(s or ''):gsub('[^%w%-_%.~]', function(c)
        return ('%%%02X'):format(c:byte())
    end))
end

---Calls a GIPHY v1 endpoint and returns the decoded JSON, or nil on any failure. The API key and
---content rating are appended here, and every param value is urlencoded.
---@param path string endpoint path under the v1 base
---@param params? table<string, string> extra query parameters
---@return table|nil decoded response body
local function giphyGet(path, params)
    local key = apiKey()
    if key == '' then return nil end
    local c = cfg()

    local query = {
        'api_key=' .. urlencode(key),
        'rating='  .. urlencode(c.Rating or 'pg-13'),
    }
    for k, v in pairs(params or {}) do
        query[#query + 1] = k .. '=' .. urlencode(v)
    end

    local url = GIPHY .. path .. '?' .. table.concat(query, '&')
    local p = promise.new()
    PerformHttpRequest(url, function(status, body)
        if status ~= 200 or not body then return p:resolve(nil) end
        local success, data = pcall(json.decode, body)
        p:resolve(success and data or nil)
    end, 'GET')
    return Citizen.Await(p)
end

---Flattens GIPHY's `images` renditions into the { id, preview, full } shape the UI wants;
---renditions fall back through each other and an entry with no usable full URL is dropped.
---@param results table[]|nil GIPHY result objects
---@return table[] gifs { id: string, preview: string, full: string }[]
local function mapGifs(results)
    local out = {}
    for i = 1, #(results or {}) do
        local r   = results[i]
        local img = r.images or {}
        local preview = (img.fixed_width and img.fixed_width.url)
            or (img.fixed_width_small and img.fixed_width_small.url)
            or (img.downsized and img.downsized.url)
        local full = (img.downsized and img.downsized.url)
            or (img.original and img.original.url)
            or (img.fixed_width and img.fixed_width.url)
        if full then
            out[#out + 1] = { id = tostring(r.id or i), preview = preview or full, full = full }
        end
    end
    return out
end

-- Browse-grid categories: live trending search terms, falling back to this built-in set.
---@type string[] Category terms used when the trending-searches request fails.
local FALLBACK_CATEGORIES = {
    'happy', 'lol', 'love', 'excited', 'sad', 'dance', 'no', 'yes',
    'hello', 'bye', 'hug', 'wow', 'thank you', 'sorry', 'facepalm', 'wink',
}

---@type integer Max category tiles resolved per refresh.
local CATEGORY_LIMIT = 14
---@type table|nil, integer Resolved category list shared by all players + the GetGameTimer ms it
---was resolved at (0 = never).
local categoriesCache, categoriesCacheAt = nil, 0
---@type integer Category cache lifetime in ms (30 minutes).
local CATEGORIES_TTL = 30 * 60 * 1000

---First GIF rendition URL from a /gifs/search response (a category tile), or ''.
---@param data table|nil decoded search response
---@return string url preview URL, '' when none
local function firstPreview(data)
    local first = data and data.data and data.data[1]
    local img   = first and first.images
    if not img then return '' end
    return (img.fixed_width and img.fixed_width.url)
        or (img.downsized and img.downsized.url)
        or (img.original and img.original.url)
        or ''
end

---Browse-grid categories for the GIF picker: live trending search terms, each resolved to a tile
---image via one limit=1 search. Cached for CATEGORIES_TTL and shared by every player. Read-only.
lib.callback.register('sd-phone:server:gifs:categories', function(src)
    if not hasKey() then return fail('gifs.giphyApiKeyNotConfigured', 'GIPHY API key not configured') end

    if categoriesCache and (GetGameTimer() - categoriesCacheAt) < CATEGORIES_TTL then
        return ok(categoriesCache)
    end
    if not mayFetch(src) then return ok(categoriesCache or {}) end

    local resolved = once('categories', function()
        local data  = giphyGet('trending/searches')
        local terms = (data and data.data) or {}
        if #terms == 0 then terms = FALLBACK_CATEGORIES end
        if #terms > CATEGORY_LIMIT then
            local trimmed = {}
            for i = 1, CATEGORY_LIMIT do trimmed[i] = terms[i] end
            terms = trimmed
        end

        local c, key, jobs = cfg(), apiKey(), {}
        for i = 1, #terms do
            local p = promise.new()
            jobs[i] = p
            local url = GIPHY .. 'gifs/search?' .. table.concat({
                'api_key=' .. urlencode(key),
                'rating='  .. urlencode(c.Rating or 'pg-13'),
                'q='       .. urlencode(tostring(terms[i])),
                'limit=1',
            }, '&')
            PerformHttpRequest(url, function(status, body)
                if status ~= 200 or not body then return p:resolve(nil) end
                local s, d = pcall(json.decode, body)
                p:resolve(s and d or nil)
            end, 'GET')
        end

        local out = {}
        for i = 1, #terms do
            local term = tostring(terms[i])
            out[#out + 1] = { name = term, term = term, image = firstPreview(Citizen.Await(jobs[i])) }
        end

        categoriesCache, categoriesCacheAt = out, GetGameTimer()
        return out
    end)
    return ok(resolved or categoriesCache or {})
end)

---@type table|nil, integer Cached trending payload shared by all players + the GetGameTimer ms it
---was fetched (0 = never).
local featuredCache, featuredCacheAt = nil, 0
---@type integer Featured cache lifetime in ms (5 minutes).
local FEATURED_TTL = 5 * 60 * 1000

---Trending GIFs for the picker's featured tab, served from a shared 5-minute cache; the page size
---comes from config. A failed fetch is not cached. Read-only.
lib.callback.register('sd-phone:server:gifs:featured', function(src)
    if not hasKey() then return fail('gifs.giphyApiKeyNotConfigured', 'GIPHY API key not configured') end
    if featuredCache and (GetGameTimer() - featuredCacheAt) < FEATURED_TTL then return ok(featuredCache) end
    if not mayFetch(src) then return ok(featuredCache or { gifs = {}, next = '' }) end

    local resolved = once('featured', function()
        local data = giphyGet('gifs/trending', { limit = tostring(cfg().Limit or 24) })
        local payload = { gifs = mapGifs(data and data.data), next = '' }
        if data and data.data then featuredCache, featuredCacheAt = payload, GetGameTimer() end
        return payload
    end)
    return ok(resolved or featuredCache or { gifs = {}, next = '' })
end)

---@type table<string, { at: integer, payload: table }> Search results shared by every player,
---keyed by the normalised query + offset.
local searchCache = {}
---@type integer Live entries currently held in searchCache.
local searchCacheN = 0
---@type integer Search cache lifetime in ms. Long enough that the handful of terms a server
---actually searches stay resident, short enough that trending results still move.
local SEARCH_TTL = 2 * 60 * 1000
---@type integer Distinct queries held before the cache is swept, so it cannot become its own
---unbounded map.
local SEARCH_CACHE_MAX = 200

---Drops every expired search entry, and the whole cache when expiry alone did not get it back
---under the ceiling.
local function sweepSearchCache()
    local now, kept = GetGameTimer(), 0
    for k, entry in pairs(searchCache) do
        if (now - entry.at) >= SEARCH_TTL then searchCache[k] = nil else kept = kept + 1 end
    end
    if kept >= SEARCH_CACHE_MAX then searchCache, kept = {}, 0 end
    searchCacheN = kept
end

---Searches GIFs. `q` and `pos` reach GIPHY only as urlencoded, length-capped single query values;
---the page size comes from config. Results are shared across players for SEARCH_TTL. Read-only.
---@param payload table { q?: string, pos?: string|number }
lib.callback.register('sd-phone:server:gifs:search', function(src, payload)
    if not hasKey() then return fail('gifs.giphyApiKeyNotConfigured', 'GIPHY API key not configured') end
    if type(payload) ~= 'table' then payload = {} end
    local q = util.trim(tostring(payload.q or ''):sub(1, 128))
    if q == '' then return fail('gifs.emptyQuery', 'Empty query') end

    -- Digits only: the offset is a number to GIPHY, and the old substring let arbitrary text
    -- through into the query string.
    local pos = util.digits(payload.pos):sub(1, 12)
    if pos == '' then pos = '0' end
    local key = q:lower() .. '|' .. pos

    local hit = searchCache[key]
    if hit and (GetGameTimer() - hit.at) < SEARCH_TTL then return ok(hit.payload) end
    if not mayFetch(src) then return ok(hit and hit.payload or { gifs = {}, next = '' }) end

    local resolved = once('search|' .. key, function()
        local data = giphyGet('gifs/search', {
            q      = q,
            limit  = tostring(cfg().Limit or 24),
            offset = pos,
        })
        local payloadOut = { gifs = mapGifs(data and data.data), next = '' }
        if data and data.data then
            if searchCacheN >= SEARCH_CACHE_MAX then sweepSearchCache() end
            if not searchCache[key] then searchCacheN = searchCacheN + 1 end
            searchCache[key] = { at = GetGameTimer(), payload = payloadOut }
        end
        return payloadOut
    end)
    return ok(resolved or { gifs = {}, next = '' })
end)
