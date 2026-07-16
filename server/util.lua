---@type table Shared server helpers; the table returned at end of file.
local util = {}

---Success response envelope - the shape every callback/action returns on the happy path. `data`
---is optional and passed straight through to the React side.
---@param data? any payload the caller wants the frontend to receive
---@return { success: true, data?: any }
function util.ok(data) return { success = true, data = data } end

---Failure response envelope - the shape every callback/action returns when it refuses. `message`
---is the already-localised, user-facing reason the UI shows.
---@param message string user-facing failure reason
---@return { success: false, message: string }
function util.fail(message) return { success = false, message = message } end

---@type string Alphabet for generated row ids (base-36, lowercase) - matches the frontend's id shape.
local ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'

---Generates a random base-36 id of `len` characters.
---@param len integer id length in characters
---@return string
function util.newId(len)
    local out = {}
    for i = 1, len do
        local n = math.random(1, #ID_CHARS)
        out[i] = ID_CHARS:sub(n, n)
    end
    return table.concat(out)
end

---Strips everything but the digits from a value. An integral float formats as a plain integer
---first; non-string and nil inputs coerce to ''.
---@param s any
---@return string digits only
function util.digits(s)
    if math.type(s) == 'float' and s % 1 == 0 then s = ('%.0f'):format(s) end
    return (tostring(s or ''):gsub('%D', ''))
end

---Interprets a value as a boolean the way oxmysql hands back a TINYINT(1): a real boolean, the
---number 1, or the string '1' are all true; everything else is false.
---@param v any raw column value
---@return boolean
function util.truthy(v) return v == true or v == 1 or v == '1' end

---Trims leading/trailing whitespace. A non-string coerces to '' (never nil).
---@param s any
---@return string trimmed, or '' when not a string
function util.trim(s)
    if type(s) ~= 'string' then return '' end
    return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

---Two-letter uppercase initials from a display name (first letters of the first two words), for
---avatar fallbacks. Falls back to the first character, then '#'. Nil-safe.
---@param name any display name
---@return string initials (1-2 chars, or '#')
function util.initialsFor(name)
    local words = {}
    for w in tostring(name or ''):gmatch('%S+') do words[#words + 1] = w end
    local a = words[1] and words[1]:sub(1, 1) or ''
    local b = words[2] and words[2]:sub(1, 1) or ''
    local out = (a .. b):upper()
    if out == '' then out = tostring(name or ''):sub(1, 1):upper() end
    return out ~= '' and out or '#'
end

---Format raw digits as a US-style "(XXX) XXX-XXXX" phone number; anything that isn't exactly 10
---digits (short codes, partials) passes through as bare digits.
---@param number any
---@return string
function util.formatNumber(number)
    local d = util.digits(number)
    if #d == 10 then return ('(%s) %s-%s'):format(d:sub(1, 3), d:sub(4, 6), d:sub(7)) end
    return d
end

---@type string[] iOS system-colour palette, mirrored from the frontend.
local PALETTE = {
    '#0a84ff', '#30d158', '#ff375f', '#ff9f0a', '#bf5af2',
    '#ff453a', '#5e5ce6', '#64d2ff', '#ffd60a', '#636366',
}

---Deterministically picks a palette colour for a string via a 32-bit rolling hash, identical to
---the frontend hash (the & 0xffffffff wrap and the signed fold match JS).
---@param str string key to colour (a name, number, or handle)
---@return string hex colour
function util.colorFor(str)
    local h = 0
    for i = 1, #str do
        h = (h * 31 + str:byte(i)) & 0xffffffff
        if h >= 0x80000000 then h = h - 0x100000000 end
    end
    if h < 0 then h = -h end
    return PALETTE[(h % #PALETTE) + 1]
end

---True when a number is finite (not NaN, not +/-inf). Non-numbers are not finite.
---@param n any
---@return boolean
function util.finite(n)
    return type(n) == 'number' and n == n and n ~= math.huge and n ~= -math.huge
end

---Adds an index to a table if it isn't already present; a no-op when it exists. Call from
---ensureSchema after the CREATE TABLE.
---@param tableName string
---@param indexName string
---@param columnsDDL string column list incl. parens, e.g. "(recipient, seen)"
function util.ensureIndex(tableName, indexName, columnsDDL)
    local present = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
    ]], { tableName, indexName })
    if (tonumber(present) or 0) == 0 then
        MySQL.query.await(('ALTER TABLE `%s` ADD INDEX %s %s'):format(tableName, indexName, columnsDDL))
    end
end

---Coerces a client-supplied value to a whole, non-negative amount: non-numbers and NaN/inf
---collapse to 0, everything else floors and clamps at 0.
---@param v any
---@return integer amount >= 0
function util.wholeAmount(v)
    local n = tonumber(v)
    if not util.finite(n) then return 0 end
    return math.max(0, math.floor(n))
end

return util
