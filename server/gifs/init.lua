---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type string GIPHY v1 API base URL; every request is proxied through the server.
local GIPHY = 'https://api.giphy.com/v1/'

local util = require 'server.util'
local ok, fail = util.ok, util.fail


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
lib.callback.register('sd-phone:server:gifs:categories', function()
    if not hasKey() then return fail('GIPHY API key not configured') end

    local now = GetGameTimer()
    if categoriesCache and (now - categoriesCacheAt) < CATEGORIES_TTL then
        return ok(categoriesCache)
    end

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

    categoriesCache, categoriesCacheAt = out, now
    return ok(out)
end)

---@type table|nil, integer Cached trending payload shared by all players + the GetGameTimer ms it
---was fetched (0 = never).
local featuredCache, featuredCacheAt = nil, 0
---@type integer Featured cache lifetime in ms (5 minutes).
local FEATURED_TTL = 5 * 60 * 1000

---Trending GIFs for the picker's featured tab, served from a shared 5-minute cache; the page size
---comes from config. A failed fetch is not cached. Read-only.
lib.callback.register('sd-phone:server:gifs:featured', function()
    if not hasKey() then return fail('GIPHY API key not configured') end
    local now = GetGameTimer()
    if featuredCache and (now - featuredCacheAt) < FEATURED_TTL then return ok(featuredCache) end
    local data = giphyGet('gifs/trending', { limit = tostring(cfg().Limit or 24) })
    local payload = { gifs = mapGifs(data and data.data), next = '' }
    if data and data.data then featuredCache, featuredCacheAt = payload, now end
    return ok(payload)
end)

---Searches GIFs. `q` and `pos` reach GIPHY only as urlencoded, length-capped single query values;
---the page size comes from config. Read-only.
---@param payload table { q?: string, pos?: string|number }
lib.callback.register('sd-phone:server:gifs:search', function(_, payload)
    if not hasKey() then return fail('GIPHY API key not configured') end
    if type(payload) ~= 'table' then payload = {} end
    local q = tostring(payload.q or ''):sub(1, 128)
    if q == '' then return fail('Empty query') end
    local data = giphyGet('gifs/search', {
        q      = q,
        limit  = tostring(cfg().Limit or 24),
        offset = tostring(payload.pos or '0'):sub(1, 16),
    })
    return ok({ gifs = mapGifs(data and data.data), next = '' })
end)
