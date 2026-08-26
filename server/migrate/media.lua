---@type table Attachment extraction shared by the importers; the table returned at end of file.
---Foreign phones each wrap their media differently, and getting it wrong is silent: a decoder that
---expects an array and receives an object iterates nothing, so every post imports with no image and
---the migration still reports success.
local media = {}

---@type string[] Keys an attachments OBJECT may hide its list under, in the order they are tried.
---YSeries alone uses three: `photos` on YBuy and PromoHub, `media` on Instashots, and a bare
---`photo` string on Twitter.
local LIST_KEYS <const> = { 'photos', 'media', 'images', 'attachments', 'files' }

---@type string[] Keys a single entry may hold its url under. `videoUrl` is last so a still frame
---wins over the video when a post carries both.
local URL_KEYS <const> = { 'url', 'image', 'src', 'photo', 'thumbnail', 'videoUrl' }

---@type integer Longest url worth keeping. Anything past this is not a link a column can hold.
local MAX_URL <const> = 1024

---A usable link, or nil. Inline base64 is rejected: the target columns hold references, and a data
---URI would be truncated into a broken one.
---@param value any
---@return string|nil
local function link(value)
    if type(value) ~= 'string' then return nil end
    local v = value:gsub('^%s+', ''):gsub('%s+$', '')
    if v == '' or #v > MAX_URL then return nil end
    if v:lower():sub(1, 5) == 'data:' then return nil end
    if not v:lower():find('^https?://') then return nil end
    return v
end

---Pulls a url out of one entry, which may be a plain string or an object.
---@param entry any
---@return string|nil
local function urlOf(entry)
    if type(entry) == 'string' then return link(entry) end
    if type(entry) ~= 'table' then return nil end
    for i = 1, #URL_KEYS do
        local hit = link(entry[URL_KEYS[i]])
        if hit then return hit end
    end
    return nil
end

---Every media url in a foreign attachments blob, in order, deduplicated.
---
---Accepts each shape the importers actually meet: a bare JSON array, an object wrapping the array
---under one of LIST_KEYS, an object holding a single url string, and a bare url with no JSON at all.
---@param raw any attachments value straight out of the source row
---@return string[] urls
function media.urls(raw)
    if raw == nil then return {} end

    if type(raw) == 'string' then
        local trimmed = raw:gsub('^%s+', ''):gsub('%s+$', '')
        if trimmed == '' then return {} end

        local first = trimmed:sub(1, 1)
        if first ~= '[' and first ~= '{' then
            local single = link(trimmed)
            return single and { single } or {}
        end

        local ok, decoded = pcall(json.decode, trimmed)
        if not ok or type(decoded) ~= 'table' then return {} end
        raw = decoded
    end

    if type(raw) ~= 'table' then return {} end

    local out, seen = {}, {}

    ---Appends one entry's url when it is usable and new.
    ---@param entry any
    local function take(entry)
        local url = urlOf(entry)
        if url and not seen[url] then
            seen[url] = true
            out[#out + 1] = url
        end
    end

    for i = 1, #raw do take(raw[i]) end

    for i = 1, #LIST_KEYS do
        local bucket = raw[LIST_KEYS[i]]
        if type(bucket) == 'table' then
            for j = 1, #bucket do take(bucket[j]) end
        elseif type(bucket) == 'string' then
            take(bucket)
        end
    end

    if #out == 0 then take(raw) end

    return out
end

---The same list as a JSON array string, which is what every images column stores.
---@param raw any
---@return string json
function media.json(raw)
    return json.encode(media.urls(raw))
end

---A cover image and the full list, for the two classifieds tables that store both.
---@param raw any
---@return string|nil cover, string|nil imagesJson
function media.cover(raw)
    local list = media.urls(raw)
    if #list == 0 then return nil, nil end
    return list[1], json.encode(list)
end

return media
