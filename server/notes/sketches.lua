---@type table Sketch validation for Notes: pure string checks with no natives, so the test harness
---loads it unchanged. A sketch is an image the phone drew, carried as a base64 data URL.
local sketches = {}

---@type { head: string, magic: fun(s: string, at: integer): boolean }[] The formats a sketch may be:
---the data URL prefix, and a check that the payload opens with that format's file signature, so a
---string that only claims to be a PNG is still refused.
local FORMATS = {
    {
        head  = 'data:image/png;base64,',
        magic = function(s, at) return s:sub(at, at + 10) == 'iVBORw0KGgo' end,
    },
    {
        head  = 'data:image/webp;base64,',
        magic = function(s, at) return s:sub(at, at + 4) == 'UklGR' and s:sub(at + 12, at + 15) == 'RUJQ' end,
    },
}

---Whether a value is a sketch the server will store: a PNG or WebP base64 data URL of at most
---`maxBytes`, whose payload is well-formed base64 (only the alphabet, whole quads, padding only at
---the end) and starts with the format's signature.
---@param s any client-supplied value
---@param maxBytes integer largest data URL accepted
---@return boolean ok
function sketches.valid(s, maxBytes)
    if type(s) ~= 'string' or #s > maxBytes then return false end
    for i = 1, #FORMATS do
        local format = FORMATS[i]
        local head = format.head
        if s:sub(1, #head) == head then
            local at = #head + 1
            local payload = #s - #head
            if payload == 0 or payload % 4 ~= 0 then return false end
            if s:find('[^A-Za-z0-9+/=]', at) then return false end
            local pad = s:find('=', at, true)
            if pad and (pad < #s - 1 or s:sub(pad) ~= ('='):rep(#s - pad + 1)) then return false end
            return format.magic(s, at)
        end
    end
    return false
end

---Keeps the valid sketches from a client-supplied list, at most `maxCount` of them. Anything else
---is dropped rather than repaired, so a half-written or forged entry never reaches the column. At
---most four times `maxCount` entries are looked at, so a padded list cannot buy a long scan.
---@param list any client-supplied array
---@param maxCount integer most sketches kept
---@param maxBytes integer largest single sketch accepted
---@return string[] kept valid sketches, in order
function sketches.clean(list, maxCount, maxBytes)
    local out = {}
    if type(list) ~= 'table' or maxCount <= 0 then return out end
    for i = 1, math.min(#list, maxCount * 4) do
        if sketches.valid(list[i], maxBytes) then
            out[#out + 1] = list[i]
            if #out >= maxCount then break end
        end
    end
    return out
end

---How many entries a stored sketches column holds, without decoding megabytes of JSON: a sketch is
---base64, which never contains a quote, so every entry is exactly one pair of quotes.
---@param raw string|nil stored JSON array text
---@return integer count
function sketches.countStored(raw)
    if type(raw) ~= 'string' or raw == '' then return 0 end
    local _, quotes = raw:gsub('"', '')
    return quotes // 2
end

return sketches
