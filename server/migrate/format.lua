---@type table Import phrasing (server.migrate.format). Every number the import reports reaches a
---human through here, so the console run and the admin panel word the same result identically.
local format = {}

---@type integer Rows per second the import sustains, measured against a production dump. Only ever
---used to set expectations before a long run, never to make a decision.
format.ROWS_PER_SECOND = 8000

---Thousands-separated, so six and seven figure counts stay readable. lib.math groups outward from
---the first digit rather than inward from the end of the string, so a sign stays ahead of the
---leading group instead of collecting a separator of its own.
---@param n integer
---@return string
function format.comma(n)
    return lib.math.groupdigits(math.floor(n), ',')
end

---Seconds a row count is expected to take at the measured throughput.
---@param rows integer
---@return number
function format.seconds(rows)
    return rows / format.ROWS_PER_SECOND
end

---A rough human duration for a row count.
---@param rows integer
---@return string
function format.estimate(rows)
    return format.duration(format.seconds(rows))
end

---A rough human duration for a number of seconds.
---@param secs number
---@return string
function format.duration(secs)
    if secs < 90 then return ('~%ds'):format(math.max(1, lib.math.round(secs))) end
    return ('~%dm'):format(math.max(1, lib.math.round(secs / 60)))
end

---`3 contacts` / `1 contact`. Nouns ending in a consonant + y, or in a sibilant, do not take a
---bare `s`, which produced "storys" and "mailboxs".
---@param n integer
---@param noun string singular form
---@param pluralForm? string irregular plural, for phrases whose head noun is not the last word
---@return string
function format.plural(n, noun, pluralForm)
    if n == 1 then return ('%s %s'):format(format.comma(n), noun) end
    if pluralForm then return ('%s %s'):format(format.comma(n), pluralForm) end
    local suffixed
    if noun:match('[^aeiou]y$') then
        suffixed = noun:sub(1, -2) .. 'ies'
    elseif noun:match('([sxz])$') or noun:match('([cs]h)$') then
        suffixed = noun .. 'es'
    else
        suffixed = noun .. 's'
    end
    return ('%s %s'):format(format.comma(n), suffixed)
end

---@type table<string, { [1]: string, [2]: string, [3]: string|nil }[]> What to show per domain in
---the closing summary: the counter each porter returns, paired with a human noun. Counters that
---are zero are left out, so a server without a given app produces no line for it.
local SUMMARY_FIELDS = {
    numbers    = { { 'set', 'phone number' } },
    contacts   = { { 'migrated', 'contact' } },
    blocked    = { { 'migrated', 'blocked number' } },
    calls      = { { 'migrated', 'call' } },
    messages   = { { 'migrated', 'message' }, { 'groups', 'group chat' } },
    reactions  = { { 'imported', 'reaction' } },
    photos     = { { 'photos', 'photo' }, { 'albums', 'album' }, { 'links', 'album photo' } },
    notes      = { { 'migrated', 'note' } },
    settings   = { { 'imported', 'settings profile' } },
    photogram  = {
        { 'profiles', 'Photogram account' }, { 'posts', 'post' }, { 'comments', 'comment' },
        { 'stories', 'story' }, { 'dms', 'direct message' }, { 'follows', 'follow' },
    },
    birdy      = {
        { 'profiles', 'Squawk account' }, { 'posts', 'post' }, { 'likes', 'like' },
        { 'reposts', 'repost' }, { 'follows', 'follow' }, { 'dms', 'direct message' },
    },
    vibez      = {
        { 'profiles', 'Clout account' }, { 'posts', 'video' }, { 'comments', 'comment' },
        { 'likes', 'like' }, { 'saves', 'save' }, { 'follows', 'follow' },
    },
    mail       = { { 'accounts', 'mailbox' }, { 'messages', 'email' } },
    wallet     = { { 'imported', 'wallet transaction' } },
    voicememos = { { 'imported', 'voice memo' } },
    marketplace = { { 'migrated', 'listing' } },
    pages      = { { 'migrated', 'advert' } },
    sessions   = {
        { 'written', 'signed-in account' },
        { 'deferred', 'login held for Squawk', 'logins held for Squawk' },
    },
}

---A one-line human summary of what a domain actually brought across, or nil when it brought
---nothing. Reads the counters the porter returned rather than what it was asked to process, so the
---figures are what landed.
---@param key string domain key
---@param res table|nil counts returned by the porter
---@return string|nil
function format.summarise(key, res)
    if type(res) ~= 'table' then return nil end
    local parts = {}
    for _, field in ipairs(SUMMARY_FIELDS[key] or {}) do
        local n = tonumber(res[field[1]]) or 0
        if n > 0 then parts[#parts + 1] = format.plural(n, field[2], field[3]) end
    end
    if #parts == 0 then return nil end
    return table.concat(parts, ', ')
end

---@type table<string, table<string, string>> Why a domain leaves rows behind, in plain words.
---
---`skipped` and `orphan` read like data loss when they are almost always the opposite: a row that
---was already covered, or one whose parent never came across and which sd-phone's foreign keys
---would delete on the next boot anyway. Saying so where the number is printed stops an operator
---going looking for a fault that is not there.
local SKIP_REASONS = {
    numbers    = { skipped = 'a second phone whose owner already has a number' },
    contacts   = { skipped = 'the same contact already saved on another of that player\'s phones' },
    blocked    = { skipped = 'the same number already blocked on another of that player\'s phones' },
    calls      = { skipped = 'a call on a number that belongs to no character here' },
    messages   = { skipped = 'a thread whose number belongs to no character here' },
    reactions  = { skipped = 'a reaction on a message that did not come across',
                   orphan  = 'a reaction whose message did not come across' },
    photos     = { skipped = 'a photo already in that player\'s gallery',
                   inlineSkipped = 'a photo stored inline as base64 rather than as a link' },
    marketplace = { skipped = 'a listing whose seller matches no character here' },
    pages      = { skipped = 'an advert whose poster matches no character here' },
    notes      = { skipped = 'a note already saved by that player' },
    settings   = { skipped = 'a phone whose owner already has settings here' },
    photogram  = { skipped = 'an account whose username is already taken on this server',
                   orphan  = 'a post, like or comment whose account did not come across' },
    birdy      = { skipped = 'an account whose handle is already taken, or whose phone matches no character',
                   orphan  = 'a post, like or repost whose account did not come across' },
    vibez      = { skipped = 'an account whose username is already taken on this server',
                   orphan  = 'a video, like or comment whose account did not come across' },
    mail       = { skipped = 'a message addressed to a mailbox that did not come across',
                   collided = 'two lb addresses that become the same address on this domain' },
    wallet     = { skipped = 'a transaction on a number that belongs to no character here' },
    voicememos = { skipped = 'a recording already in that player\'s memos' },
    sessions   = { skipped = 'a login for an app this phone has no counterpart for (Dark Chat)',
                   orphan  = 'a login whose account did not come across',
                   deferred = 'a Squawk login held until Squawk itself has been imported' },
}

---Plain-English lines explaining a domain's non-imported counters, or an empty table when it left
---nothing behind.
---@param key string domain key
---@param res table|nil counts returned by the porter
---@return string[]
function format.reasons(key, res)
    if type(res) ~= 'table' then return {} end
    local out = {}
    for counter, why in pairs(SKIP_REASONS[key] or {}) do
        local n = tonumber(res[counter]) or 0
        if n > 0 then out[#out + 1] = ('%s %s: %s'):format(format.comma(n), counter, why) end
    end
    table.sort(out)
    return out
end

---@type string[] Counter names worth leading with, in the order they read best.
local DESCRIBE_ORDER = {
    'imported', 'accounts', 'profiles', 'posts', 'written', 'messages', 'sessions',
    'comments', 'likes', 'commentLikes', 'follows', 'stories', 'views', 'dms',
    'notifications', 'deferred', 'set', 'conflict', 'skipped',
}

---A porter's counts as `5 imported, 2 skipped`, ordered so the headline number reads first.
---@param res table|nil counts returned by a porter
---@return string
function format.describe(res)
    if type(res) ~= 'table' then return 'done' end
    local seen, parts = {}, {}
    for _, key in ipairs(DESCRIBE_ORDER) do
        local v = res[key]
        if type(v) == 'number' and v > 0 then
            seen[key] = true
            parts[#parts + 1] = ('%d %s'):format(v, key)
        end
    end
    for key, v in pairs(res) do
        if not seen[key] and type(v) == 'number' and v > 0 then
            parts[#parts + 1] = ('%d %s'):format(v, key)
        end
    end
    if #parts == 0 then return 'nothing to import' end
    return table.concat(parts, ', ')
end

---Elapsed seconds since a GetGameTimer() reading, to one decimal.
---@param since integer
---@return string
function format.elapsed(since) return ('%.1fs'):format((GetGameTimer() - since) / 1000) end

return format
