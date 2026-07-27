---@type table sd-phone config root (configs/config.lua); read for the number format + length.
local config = require 'configs.config'

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
-- Linear, and it has to stay that way. The obvious `s:gsub('%s+$', '')` is
-- quadratic on interior whitespace: for 'x' .. (' '):rep(n) .. 'x' the matcher
-- re-expands the run at every start position and backtracks it against `$`.
-- Measured on Lua 5.4: n=50k took 12.8s, n=100k 58s, n=200k 235s, all of it on
-- the server thread. trim runs before every length cap, so the cap cannot save
-- us; the trim itself must be safe on unbounded input.
function util.trim(s)
    if type(s) ~= 'string' then return '' end
    local from = s:match('^%s*()')
    return from > #s and '' or s:match('.*%S', from)
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

---@type table Number settings (config.Phone.Number), defaulted so a config written before this
---section existed keeps the original US shape.
local NUMBER = (type(config.Phone) == 'table' and type(config.Phone.Number) == 'table')
    and config.Phone.Number or {}

---@type table<number, string> Display pattern per digit count, from config.
local FORMATS = type(NUMBER.Formats) == 'table' and NUMBER.Formats or { [10] = '(XXX) XXX-XXXX' }

---@type integer Digits in a newly generated number.
local LENGTH = math.floor(tonumber(NUMBER.Length) or 10)
if LENGTH < 3 then LENGTH = 3 end
if LENGTH > 15 then LENGTH = 15 end

---Renders digits into a display pattern: every X takes the next digit, every other character is
---literal. Digits past the pattern's last X are appended so nothing is ever silently dropped.
---@param pattern string
---@param d string bare digits
---@return string
local function applyPattern(pattern, d)
    local out, i = {}, 1
    for c in pattern:gmatch('.') do
        if c == 'X' then
            if i > #d then break end
            out[#out + 1] = d:sub(i, i)
            i = i + 1
        else
            out[#out + 1] = c
        end
    end
    if i <= #d then out[#out + 1] = d:sub(i) end
    return table.concat(out)
end

---Formats raw digits for display using config.Phone.Number.Formats. A digit count with no
---configured pattern (short codes, a length the server has since changed away from) passes
---through as bare digits rather than being forced into the wrong shape.
---@param number any
---@return string
function util.formatNumber(number)
    local d = util.digits(number)
    local pattern = FORMATS[#d]
    if type(pattern) ~= 'string' or pattern == '' then return d end
    return applyPattern(pattern, d)
end

---A random phone number as bare digits, at the configured length. The leading digit avoids 0 and
---1 so numbers still read like real ones (and so the digit count never shrinks through a
---tonumber round-trip somewhere downstream).
---@return string number bare digits, `config.Phone.Number.Length` of them
function util.randomNumber()
    local out = { tostring(math.random(2, 9)) }
    for i = 2, LENGTH do out[i] = tostring(math.random(0, 9)) end
    return table.concat(out)
end

---@type integer Digits a newly generated number gets; exposed for callers that report it.
util.numberLength = LENGTH

---@type integer[] Digit counts that count as a real number: the generated length plus every
---length with a display format, so numbers minted before a Length change stay valid. Ascending.
util.numberLengths = (function()
    local seen, out = { [LENGTH] = true }, { LENGTH }
    for length in pairs(FORMATS) do
        local n = tonumber(length)
        if n and n > 0 and not seen[n] then
            seen[n] = true
            out[#out + 1] = n
        end
    end
    table.sort(out)
    return out
end)()

---True when `digits` is a length this server accepts.
---@param digits string bare digits
---@return boolean
function util.validNumberLength(digits)
    for _, n in ipairs(util.numberLengths) do
        if #digits == n then return true end
    end
    return false
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

---Adds a UNIQUE index if absent. Distinct from ensureIndex because a unique index is a constraint,
---not just a lookup aid: it is what makes INSERT IGNORE actually ignore. Existing duplicate rows
---make the ALTER fail, so it is logged and skipped rather than fatal.
---@param tableName string
---@param indexName string
---@param columnsDDL string column list incl. parens, e.g. "(src_id)"
function util.ensureUniqueIndex(tableName, indexName, columnsDDL)
    local present = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
    ]], { tableName, indexName })
    if (tonumber(present) or 0) > 0 then return end

    local ok, err = pcall(MySQL.query.await,
        ('ALTER TABLE `%s` ADD UNIQUE INDEX %s %s'):format(tableName, indexName, columnsDDL))
    if not ok then
        print(('^3[sd-phone]^0 could not add unique index %s on %s: %s'):format(indexName, tableName, err))
    end
end

---True when a table already exists. Call BEFORE the CREATE TABLE so a module can tell a fresh
---install from an upgrade: on a fresh install the CREATE already declares every column, so the
---backfills below can be skipped entirely rather than probed for.
---@param tbl string table name
---@return boolean exists
function util.tableExists(tbl)
    local n = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ? AND table_type = 'BASE TABLE'
    ]], { tbl })
    return (tonumber(n) or 0) > 0
end

---Adds whatever columns are missing from a table, in ONE information_schema read and ONE ALTER.
---Replaces the per-column probe-then-alter pattern: a table with twenty back-filled columns used
---to cost twenty information_schema queries on every boot, forever, including on fresh installs
---where the CREATE TABLE already declares them all. Self-correcting - no version stamp to drift.
---@param tbl string table name
---@param defs table<string, string> column name -> full DDL fragment, e.g. `locale VARCHAR(8) NULL`
---@return boolean added true when at least one column was created
function util.ensureColumns(tbl, defs)
    local rows = MySQL.query.await([[
        SELECT COLUMN_NAME AS name FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
    ]], { tbl }) or {}

    local have = {}
    for i = 1, #rows do have[rows[i].name] = true end

    local add = {}
    for name, ddl in pairs(defs) do
        if not have[name] then add[#add + 1] = ('ADD COLUMN %s'):format(ddl) end
    end
    if #add == 0 then return false end

    MySQL.query.await(('ALTER TABLE `%s` %s'):format(tbl, table.concat(add, ', ')))
    return true
end

---Adds a FOREIGN KEY once, so existing installs migrate on boot with no manual SQL. Orphaned
---child rows are cleared first - they reference a parent that no longer exists, so they are
---already unreachable, and ALTER TABLE ... ADD FOREIGN KEY fails outright while any remain.
---A failure (type or collation mismatch) is logged and skipped, never fatal: the resource keeps
---running exactly as it does today, just without that constraint.
---@param child string child table
---@param col string child column
---@param parent string parent table
---@param parentCol string parent column (its primary key)
---@param name string constraint name, unique per database
---@return boolean created true when the constraint was added on this call
function util.ensureForeignKey(child, col, parent, parentCol, name)
    local present = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ?
          AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ]], { child, name })
    if (tonumber(present) or 0) > 0 then return false end

    local orphans = MySQL.update.await(([[
        DELETE c FROM `%s` c
        LEFT JOIN `%s` p ON p.`%s` = c.`%s`
        WHERE c.`%s` IS NOT NULL AND p.`%s` IS NULL
    ]]):format(child, parent, parentCol, col, col, parentCol))
    if (tonumber(orphans) or 0) > 0 then
        print(('^3[sd-phone]^0 %s: cleared %d orphaned row(s) before adding %s'):format(child, orphans, name))
    end

    -- InnoDB needs an index on the referencing column; it creates one implicitly, but naming it
    -- here keeps it visible alongside the module's other indexes.
    util.ensureIndex(child, 'idx_' .. name, ('(`%s`)'):format(col))

    local ok, err = pcall(MySQL.query.await, ([[
        ALTER TABLE `%s` ADD CONSTRAINT `%s` FOREIGN KEY (`%s`)
        REFERENCES `%s`(`%s`) ON DELETE CASCADE ON UPDATE CASCADE
    ]]):format(child, name, col, parent, parentCol))
    if not ok then
        print(('^3[sd-phone]^0 skipped foreign key %s on %s: %s'):format(name, child, err))
        return false
    end
    return true
end

---Runs a one-shot repair or backfill exactly once per database, recording it in phone_migrations
---so later boots skip it. Use for work whose predicate can't be indexed and would otherwise
---re-scan a whole table every start to match nothing.
---@param name string unique migration name
---@param fn fun(): table|nil the work; may return stats to stamp on the marker row
---@return boolean ran true when the work executed on this call
function util.runOnce(name, fn)
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_migrations (
            name       VARCHAR(64) NOT NULL,
            applied_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            stats      JSON        NULL,
            PRIMARY KEY (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    if MySQL.scalar.await('SELECT 1 FROM phone_migrations WHERE name = ? LIMIT 1', { name }) ~= nil then
        return false
    end
    local stats = fn()
    MySQL.query.await(
        'INSERT IGNORE INTO phone_migrations (name, stats) VALUES (?, ?)',
        { name, json.encode(stats or {}) }
    )
    return true
end

---Rescues a same-named table left behind by another phone resource (lb-phone shares several
---table names with sd-phone): when `tbl` exists but is missing the sd-phone marker column, it
---is renamed to `<tbl>_lb` so the following CREATE TABLE builds the real sd-phone table. The
---renamed original keeps the old data for the lb-phone importer. Call before CREATE TABLE.
---@param tbl string table name
---@param markerColumn string column only the sd-phone shape has (e.g. 'citizenid')
---@return boolean renamed true when a foreign-shaped table was moved aside
function util.rescueLegacyTable(tbl, markerColumn)
    local exists = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ? AND table_type = 'BASE TABLE'
    ]], { tbl })
    if (tonumber(exists) or 0) == 0 then return false end

    local hasMarker = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
    ]], { tbl, markerColumn })
    if (tonumber(hasMarker) or 0) > 0 then return false end

    local target = tbl .. '_lb'
    local taken = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?
    ]], { target })
    if (tonumber(taken) or 0) > 0 then
        print(('^1[sd-phone]^0 cannot rescue foreign table %s: %s already exists'):format(tbl, target))
        return false
    end

    MySQL.query.await(('RENAME TABLE `%s` TO `%s`'):format(tbl, target))
    print(('^3[sd-phone]^0 foreign-shaped table %s (no `%s` column) moved aside to %s'):format(tbl, markerColumn, target))
    return true
end

---Converts a table to utf8mb4_unicode_ci when its collation differs. Newer MariaDB defaults to
---utf8mb4_uca1400_ai_ci, and a CREATE without an explicit COLLATE then can't be joined against
---the explicitly-collated tables. A no-op when the table is absent or already matches.
---@param tbl string table name
function util.ensureCollation(tbl)
    local collation = MySQL.scalar.await([[
        SELECT table_collation FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ?
    ]], { tbl })
    if not collation or collation == 'utf8mb4_unicode_ci' then return end
    MySQL.query.await(('ALTER TABLE `%s` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'):format(tbl))
    print(('^3[sd-phone]^0 converted %s from %s to utf8mb4_unicode_ci'):format(tbl, collation))
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

---@type integer How often stale limiter buckets are swept (ms). The walk is over live buckets
---only, so this can stay infrequent without the table growing between passes.
local SWEEP_MS = 5 * 60 * 1000

---@type table<string, { last: integer, ttl: integer, events: integer[]? }>
---"<citizenid>\0<kind>\0<key>" -> bucket. Keyed by citizenid and never by source, so dropping and
---reconnecting cannot reset a limit. A stamp in the future (GetGameTimer wrapping on a server with
---weeks of uptime) counts as expired everywhere, so a wrap can never leave a limit stuck closed.
local buckets = {}

---Minimum gap between accepted calls for one citizenid + key. A blocked call is NOT recorded, so
---the gap never extends under spam: a flooding client still gets exactly one call every `ms`.
---A missing cid (server-side exports, a player still loading) is never blocked.
---@param cid string|nil citizenid, never a source (a non-string is treated as missing, so never blocked)
---@param key string limiter name, a call-site constant (a client-supplied key allocates a bucket per value)
---@param ms integer minimum gap between accepted calls
---@return boolean ok true when the call may proceed
function util.cooldown(cid, key, ms)
    if type(cid) ~= 'string' or cid == '' then return true end
    local gap = tonumber(ms) or 0
    local now = GetGameTimer()
    local k = cid .. '\0c\0' .. tostring(key)
    local b = buckets[k]
    if b then
        local since = now - b.last
        if since >= 0 and since < gap then return false end
        b.last, b.ttl = now, gap
    else
        buckets[k] = { last = now, ttl = gap }
    end
    return true
end

---Rolling-window budget for one citizenid + key: at most `maxInWindow` accepted calls in any
---`windowMs`. Blocked calls are not recorded, so a caller who backs off recovers as the window
---drains instead of serving a penalty. A missing cid is never blocked.
---@param cid string|nil citizenid, never a source (a non-string is treated as missing, so never blocked)
---@param key string limiter name, a call-site constant (a client-supplied key allocates a bucket per value)
---@param windowMs integer rolling window length in ms
---@param maxInWindow integer accepted calls allowed inside one window
---@return boolean ok true when the call may proceed
function util.rateLimit(cid, key, windowMs, maxInWindow)
    if type(cid) ~= 'string' or cid == '' then return true end
    local window = tonumber(windowMs) or 0
    local max = tonumber(maxInWindow) or 0
    local now = GetGameTimer()
    local k = cid .. '\0r\0' .. tostring(key)
    local b = buckets[k]
    if not b then
        if max < 1 then return false end
        buckets[k] = { last = now, ttl = window, events = { now } }
        return true
    end

    -- Compacted in place rather than rebuilt: the array can only hold `max` accepted stamps, so
    -- the reject path stays O(max) and allocates nothing.
    local events, kept = b.events, 0
    for i = 1, #events do
        local t = events[i]
        local age = now - t
        if age >= 0 and age < window then
            kept = kept + 1
            events[kept] = t
        end
    end
    for i = #events, kept + 1, -1 do events[i] = nil end
    if kept >= max then return false end

    events[kept + 1] = now
    b.last, b.ttl = now, window
    return true
end

-- Periodic sweep: a bucket whose window has fully elapsed rebuilds identically from scratch, so
-- drop it instead of holding one entry per citizenid per call site for the server's uptime.
CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        local now = GetGameTimer()
        for k, b in pairs(buckets) do
            local age = now - b.last
            if age < 0 or age >= b.ttl then buckets[k] = nil end
        end
    end
end)

---Cuts a byte-capped string back to the last whole UTF-8 codepoint, so a cap can never leave the
---half sequence that a utf8mb4 column rejects.
---@param s string
---@return string
local function wholeUtf8(s)
    local i = #s
    while i > 0 do
        local b = s:byte(i)
        if b < 0x80 or b >= 0xC0 then break end
        i = i - 1
    end
    if i == 0 then return s end
    local lead = s:byte(i)
    local need = lead < 0x80 and 1 or lead < 0xE0 and 2 or lead < 0xF0 and 3 or 4
    if i + need - 1 > #s then return s:sub(1, i - 1) end
    return s
end

---Trims a client string and caps it to `maxLen` BYTES, matching what the column actually stores.
---Non-strings and empty-after-trim collapse to nil so a caller rejects with one `if not v then`.
---@param v any raw client value
---@param maxLen integer maximum byte length
---@return string|nil
function util.limitedString(v, maxLen)
    if type(v) ~= 'string' then return nil end
    local s = util.trim(v)
    if s == '' then return nil end
    local max = tonumber(maxLen) or 0
    if max < 1 then return nil end
    if #s > max then s = wholeUtf8(s:sub(1, max)) end
    return s ~= '' and s or nil
end

---True when a value's JSON encoding fits in `maxBytes`. Encodes once; nil is always within budget,
---and an encode failure (a cycle, excessive nesting, a function value) counts as over budget.
---@param v any
---@param maxBytes integer
---@return boolean ok
function util.encodedSize(v, maxBytes)
    local max = tonumber(maxBytes) or 0
    if v == nil then return true end
    if type(v) == 'string' then return #v <= max end
    local ok, encoded = pcall(json.encode, v)
    if not ok or type(encoded) ~= 'string' then return false end
    return #encoded <= max
end

---Validates a client-supplied table before it is stored or relayed: a table, at most `maxEntries`
---pairs at each level, at most one level of nesting, scalar leaves only, and an encoded size
---within `maxBytes` so one huge string value cannot pass a cheap entry count.
---@param v any raw client value
---@param maxEntries integer maximum pairs at each level
---@param maxBytes integer maximum JSON-encoded size
---@return table|nil value the original table, or nil when it fails any check
function util.smallTable(v, maxEntries, maxBytes)
    if type(v) ~= 'table' then return nil end
    local max = tonumber(maxEntries) or 0
    -- String leaves are tallied as they are walked so a multi-megabyte value is refused before the
    -- encoder ever runs; a leaf can only grow under encoding, so this rejects nothing extra.
    local budget = tonumber(maxBytes) or 0
    local n, bytes = 0, 0
    for _, val in pairs(v) do
        n = n + 1
        if n > max then return nil end
        local t = type(val)
        if t == 'table' then
            local inner = 0
            for _, leaf in pairs(val) do
                inner = inner + 1
                if inner > max then return nil end
                local lt = type(leaf)
                if lt == 'table' or lt == 'function' or lt == 'userdata' or lt == 'thread' then return nil end
                if lt == 'string' then
                    bytes = bytes + #leaf
                    if bytes > budget then return nil end
                end
            end
        elseif t == 'function' or t == 'userdata' or t == 'thread' then
            return nil
        elseif t == 'string' then
            bytes = bytes + #val
            if bytes > budget then return nil end
        end
    end
    if not util.encodedSize(v, maxBytes) then return nil end
    return v
end

---@type fun(source: integer, citizenid: string|nil)[] Registered disconnect sweeps.
local cleanups = {}

---Registers a sweep to run when a player disconnects, so a module that keys a table on source can
---drop its row without adding another playerDropped handler. `citizenid` is best effort: the
---framework may already have unloaded the character, so key on `source` and treat cid as a hint.
---@param fn fun(source: integer, citizenid: string|nil)
function util.onCleanup(fn)
    if type(fn) ~= 'function' then return end
    cleanups[#cleanups + 1] = fn
end

AddEventHandler('playerDropped', function()
    local src = source
    -- Required here rather than at file scope so util stays the lowest-level module, loadable
    -- without the bridge; ox_lib caches the module so this is a table lookup after the first drop.
    local ok, cid = pcall(function() return require('bridge.server.player').getIdentifier(src) end)
    for i = 1, #cleanups do pcall(cleanups[i], src, ok and cid or nil) end
end)

return util
