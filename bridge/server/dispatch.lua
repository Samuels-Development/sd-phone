---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Shared server helpers (server.util): string caps, finite(), the rolling rate limiter.
local util = require 'server.util'
---@type table Player identity (bridge.server.player): the citizenid every limiter is keyed on.
local player = require 'bridge.server.player'
---@type table CAD (server.mdt.dispatch): createCall is the only way onto the call board.
local mdt = require 'server.mdt.dispatch'

---@type table Dispatch ingest module; the table returned at end of file. Mirrors the alerts a
---third-party dispatch resource raises onto the MDT call board. One-way and read-only: nothing here
---answers, acknowledges, attaches or writes back to the resource an alert came from.
local ingest = {}

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt or {}
---@type table Dispatch config (configs/mdt.lua Dispatch).
local DISPATCH = MDT.Dispatch or {}
---@type table Ingest config (configs/mdt.lua Dispatch.Ingest): the switches and the guards.
local IN = DISPATCH.Ingest or {}

---@type boolean Whether alerts are mirrored at all. The terminal being off gates this too - with no
---board there is nothing to mirror onto.
local ENABLED = MDT.Enabled == true and IN.Enabled ~= false
---@type table<string, boolean> Per-system switches; a system runs unless it is explicitly false.
local SYSTEMS = type(IN.Systems) == 'table' and IN.Systems or {}
---@type integer Ceiling on the dedupe window. Config sets the length, but an operator typo of a
---value in hours would hold one key per alert for that long, and the table below is bounded.
local MAX_DEDUPE_MS = 5 * 60 * 1000
---@type integer Milliseconds a repeat of the same alert is swallowed for.
local DEDUPE_MS = math.min(MAX_DEDUPE_MS, math.max(1000, math.floor(tonumber(IN.DedupeSeconds) or 45) * 1000))
---@type integer Rolling rate-limit window, in milliseconds.
local RATE_WINDOW = math.max(1000, math.floor(tonumber(IN.RateWindow) or 10000))
---@type integer Alerts one source may land on the board inside a window.
local RATE_MAX = math.max(1, math.floor(tonumber(IN.RateMax) or 12))
---@type boolean Whether police and medical share one board (configs/mdt.lua Dispatch.Shared).
local SHARED = DISPATCH.Shared == true
---@type string Board an alert lands on when its job list names nothing this server runs.
local DEFAULT_DOMAIN = IN.DefaultDomain == 'ems' and 'ems' or 'leo'
---@type integer Board priority for an alert whose payload ranks it as routine, or not at all.
local DEFAULT_PRIORITY = 3
---@type integer Job names read off one payload. A cap, because the list is caller-supplied.
local MAX_JOBS = 16
---@type integer Entries scanned while reading that list. Separate from MAX_JOBS, which only counts
---the names KEPT: a payload of a hundred thousand integers keeps none and would otherwise be walked
---in full before the alert is even rejected.
local MAX_JOB_SCAN = 128
---@type integer Bytes of one job name that are read. Longer than any framework job, and it stops
---`entry:lower()` allocating a copy of whatever the payload put in the list.
local MAX_JOB_LEN = 32
---@type number Metres a coordinate may sit from the world origin before it reads as garbage.
local WORLD_LIMIT = 20000.0

---@type integer Seconds a board call lives (configs/mdt.lua Dispatch.CallTTL), read the same way
---server.mdt.dispatch reads it. Only the load-time warning uses it.
local CALL_TTL = math.max(30, math.floor(tonumber(DISPATCH.CallTTL) or 900))
---@type integer Calls the board holds at once (configs/mdt.lua Dispatch.MaxCalls).
local MAX_CALLS = math.max(1, math.floor(tonumber(DISPATCH.MaxCalls) or 60))
---@type integer Live mirrored calls the board allows at once. The board OWNS this number and
---enforces it itself: past it the oldest mirrored call is evicted, so a flood can only ever push
---out its own traffic. Read from there rather than recomputed, so the load-time warning below
---cannot quote a share the board does not keep.
local INGEST_BUDGET = math.max(1, math.floor(tonumber(mdt.ingestBudget) or (MAX_CALLS / 2)))
---@type integer Dedupe keys held at once. A cap rather than a target: the sweep keeps the table far
---below this, so reaching it means the ingest is being fed keys that all differ.
local MAX_SEEN = 512
---@type string The one supported system that publishes to clients only, so the client half has to
---relay it. Named once, because the relay is gated on this resource running AND on this key's own
---switch in Dispatch.Ingest.Systems.
local RELAY_RESOURCE = 'aty_dispatchv2'
---@type integer Minimum gap between relays accepted off one player, in ms. Charged before the
---payload is looked at, so malformed junk costs the sender the same as a real alert.
local RELAY_COOLDOWN_MS = 250
---@type number Metres a relayed alert's coordinates may sit from the player relaying it. The client
---half only ever forwards an alert its own game raised, so coordinates anywhere else are forged.
local RELAY_RANGE = 200.0
---@type integer Minimum gap between drop reports, so a flood is one console line a minute.
local DROP_LOG_MS = 60000

---@type table<string, string> Framework job name -> board domain, built from the departments this
---server actually runs. A `doj` department has no call board, so it never appears here.
local DOMAIN_OF = {}
for _, dept in ipairs(MDT.Departments or {}) do
    local kind = (dept.type == 'ems' and 'ems') or (dept.type == 'leo' and 'leo') or nil
    if kind and type(dept.job) == 'string' then DOMAIN_OF[dept.job:lower()] = kind end
end

---@type table<string, string> Service words dispatch resources send in place of a job name. Every
---one of these systems mixes job TYPES and job NAMES in the same list, and a name this server does
---not run still says which service was being called.
local DOMAIN_ALIAS = {
    leo = 'leo', police = 'leo', cop = 'leo', cops = 'leo', sheriff = 'leo', bcso = 'leo',
    sasp = 'leo', state = 'leo', trooper = 'leo', patrol = 'leo', traffic = 'leo', doc = 'leo',
    ems = 'ems', ambulance = 'ems', medic = 'ems', fire = 'ems', fd = 'ems', doctor = 'ems',
    hospital = 'ems',
}

---@type table<string, boolean> Alert slugs that are a critical by definition. ps-dispatch and the
---qb-dispatch lineage both force these to their top priority INSIDE their own handler, which runs
---after this one, so mirroring the list is the only way the board agrees with their UI.
local CRITICAL_CODES = {
    officerdown = true, officerdistress = true, emsdown = true, civdown = true,
    bankrobbery = true, pacificbankrobbery = true, paletobankrobbery = true,
    vangelicorobbery = true, humanelabsrobbery = true, unionrobbery = true, prisonbreak = true,
}

---@type table<string, integer> rcore_dispatch's string priority scale mapped onto the board's. It
---has three levels and the board has four, so the top of a three-level scale reads as urgent rather
---than critical: priority 1 stays for the alerts a system names as one.
local RCORE_PRIORITY = { high = 2, medium = 3, low = 4 }

---@type table<string, string> The numeric gender the qb-dispatch lineage sends in place of a word.
---Its own UI renders 0 and 2 as female, and a bare digit on the board reads as part of the vehicle.
local GENDER_WORD = { ['0'] = 'Female', ['1'] = 'Male', ['2'] = 'Female' }

---A payload string, trimmed and byte-capped. Numbers coerce, because half of these payloads carry a
---plate, a callsign or a gender as one.
---@param v any raw payload value
---@param max integer maximum byte length
---@return string|nil
local function text(v, max)
    -- An integral float loses its '.0' tail first: under Lua 5.4 tostring(2.0) is '2.0', and these
    -- payloads carry the gender digit, a plate and a callsign as numbers. '%.0f' rather than '%d'
    -- because a float far outside the integer range has no integer representation and would raise.
    if type(v) == 'number' then
        v = (math.type and math.type(v) == 'float' and v % 1 == 0) and ('%.0f'):format(v) or tostring(v)
    end
    return util.limitedString(v, max)
end

---A payload string, minus the placeholder several of these systems send for a field they could not
---read. Printing "Unknown" on the board reads worse than leaving the field blank.
---@param v any raw payload value
---@param max integer maximum byte length
---@return string|nil
local function known(v, max)
    local s = text(v, max)
    if not s or s:lower() == 'unknown' then return nil end
    return s
end

---A machine slug turned back into words, for the systems whose only headline is one. 'shooting' is
---a key in their config, not a line an officer should read off a call board.
---@param v any raw slug
---@return string|nil label
local function humanise(v)
    local s = text(v, 64)
    if not s then return nil end
    s = s:gsub('[_%-%.]+', ' '):gsub('%s+', ' ')
    s = s:gsub('(%a[%w]*)', function(word) return word:sub(1, 1):upper() .. word:sub(2) end)
    return util.limitedString(s, 64)
end

---A gender fragment for the suspect line. The qb lineage documents 0 and 2 as female and 1 as male
---and sends the digit itself, so it is mapped rather than printed.
---@param v any raw gender
---@return string|nil
local function genderText(v)
    local s = known(v, 32)
    if not s then return nil end
    return GENDER_WORD[s] or s
end

---Whether a string reads as a radio code rather than as a title. Shape decides it, because these
---systems disagree on which of their two fields holds which.
---@param s string|nil candidate
---@return boolean
local function isTenCode(s)
    if not s or #s > 12 then return false end
    return s:match('^%d+%-%w+$') ~= nil or s:match('^%d%d%d$') ~= nil or s:match('^[Pp]%d$') ~= nil
end

---Splits a '<code> - <label>' title, which is how cd_dispatch and rcore_dispatch carry both halves
---in one field.
---@param raw any title
---@return string|nil code nil when the first half is not a radio code
---@return string|nil label the remainder, or the whole string when it does not split
local function splitTitle(raw)
    local s = text(raw, 200)
    if not s then return nil, nil end
    local code, label = s:match('^(.-)%s+%-%s+(.+)$')
    if code and label and isTenCode(code) then return code, label end
    return nil, s
end

---Sorts a system's code-ish and label-ish fields into the board's `code` and `type`. Half of these
---resources put a title in the code field and a radio code in the label, and their own examples show
---it both ways round, so shape decides rather than the key a value arrived under.
---@param rawCode any the system's code field
---@param rawLabel any the system's label field
---@return string|nil code radio code, nil when neither field held one
---@return string|nil kind headline
local function codeAndType(rawCode, rawLabel)
    local code = text(rawCode, 200)
    local label = text(rawLabel, 64)

    -- '10-15 - Store Robbery' in one field: the half it splits into beats whatever the label field
    -- held, which on those systems is a blip caption written for the map rather than for a board.
    if code and not isTenCode(code) then
        local inner, rest = splitTitle(code)
        if inner then code, label = inner, rest or label end
    end

    if code and not isTenCode(code) then
        if isTenCode(label) then
            code, label = label, text(code, 64)
        else
            -- The label field is the documented title on every system here (ps `message`, qb
            -- `dispatchMessage`), so it keeps the headline; an unrecognised code field is a caller's
            -- own routing word ('DIRECT') and only fills in when there is no title at all.
            label, code = label or text(code, 64), nil
        end
    end

    return code and text(code, 12) or nil, label
end

---Maps a numeric priority (0 critical, ascending to least urgent) onto the board's 1-4 scale. A
---value outside that range reads as routine rather than as its index: tier 0 exists only in current
---ps-dispatch, and most third-party callers only ever emit 1 or 2.
---@param v any raw priority
---@return integer priority 1-4
local function numericPriority(v)
    local n = tonumber(v)
    if not util.finite(n) then return DEFAULT_PRIORITY end
    n = math.floor(n)
    if n <= 0 then return 1 end
    if n == 1 then return 2 end
    if n == 2 then return 3 end
    if n == 3 then return 4 end
    return DEFAULT_PRIORITY
end

---Position from any of the three shapes these payloads use: a vector3, a hand-built { x, y, z }
---table, or a { [1], [2], [3] } array. Clamped to the world, because a client-relayed alert can
---carry anything.
---@param v any raw coordinate value
---@return { x: number, y: number, z: number }|nil coords nil when unusable
local function coordsOf(v)
    local t = type(v)
    if t ~= 'table' and t ~= 'vector3' and t ~= 'vector4' then return nil end

    local x, y, z = tonumber(v.x), tonumber(v.y), tonumber(v.z)
    if t == 'table' and (x == nil or y == nil) then
        x, y, z = tonumber(v[1]), tonumber(v[2]), tonumber(v[3])
    end
    if not util.finite(x) or not util.finite(y) then return nil end
    if math.abs(x) > WORLD_LIMIT or math.abs(y) > WORLD_LIMIT then return nil end

    local height = (util.finite(z) and math.abs(z) <= WORLD_LIMIT) and z + 0.0 or 0.0
    return { x = x + 0.0, y = y + 0.0, z = height }
end

---A plate, trimmed of the padding GTA writes it with and labelled, so the board reads as a sentence.
---@param v any raw plate
---@return string|nil
local function plateOf(v)
    local s = known(v, 16)
    return s and ('Plate ' .. s:upper()) or nil
end

---Joins the fragments a system carries about a suspect or a vehicle into one line. Blank, duplicate
---and placeholder fragments drop out, so a sparse payload does not render as a row of commas.
---Variadic rather than array-taking, because a missing middle fragment is nil and `#` on an array
---with a nil hole is undefined: the array form silently dropped whichever half of the line the
---interpreter's length operator landed before.
---@param ... any fragments in the order they should read
---@return string|nil line
local function detail(...)
    local count = select('#', ...)
    local out, seen = {}, {}
    for i = 1, count do
        local s = known((select(i, ...)), 120)
        if s and not seen[s:lower()] then
            seen[s:lower()] = true
            out[#out + 1] = s
        end
    end
    if #out == 0 then return nil end
    return util.limitedString(table.concat(out, ', '), 120)
end

---One job name off a payload list, lowercased, or nil when the entry is not one. The length is
---checked BEFORE anything reads the string: util.limitedString trims first and truncates second, so
---a byte cap on its own still runs a pattern over whatever the payload put in the list, once per
---entry scanned. Longer than any framework job is not a job name at all, so it is dropped rather
---than cut down to one.
---@param v any raw list entry
---@return string|nil job lowercased name
local function jobName(v)
    if type(v) ~= 'string' or #v > MAX_JOB_LEN then return nil end
    local s = util.limitedString(v, MAX_JOB_LEN)
    return s and s:lower() or nil
end

---Job names off a payload, in the three shapes these systems send: an array, a bare string, or an
---array holding one nested array (`job = { Config.PoliceJobs }` is a caller bug common enough that
---every bridge in the wild flattens it). Both loops are bounded on entries SCANNED as well as on
---names kept, because a payload of nothing but numbers keeps none and would otherwise be walked to
---its end before the alert is rejected.
---@param v any raw job field
---@return string[] jobs lowercased names, empty when the payload named none
local function jobList(v)
    local out = {}
    if type(v) == 'string' then
        local s = jobName(v)
        if s then out[1] = s end
        return out
    end
    if type(v) ~= 'table' then return out end

    local scanned = 0
    for _, entry in pairs(v) do
        scanned = scanned + 1
        if #out >= MAX_JOBS or scanned >= MAX_JOB_SCAN then break end
        local s = jobName(entry)
        if s then
            out[#out + 1] = s
        elseif type(entry) == 'table' then
            for _, nested in pairs(entry) do
                scanned = scanned + 1
                if #out >= MAX_JOBS or scanned >= MAX_JOB_SCAN then break end
                local inner = jobName(nested)
                if inner then out[#out + 1] = inner end
            end
        end
    end
    return out
end

---Which board(s) an alert belongs on. Every one of these systems addresses alerts by job, so the
---police/medical split is decided by whether the named jobs are this server's police departments,
---its medical ones, or both.
---@param jobs string[] normalised job names
---@return string[] domains 'leo' and/or 'ems', never empty
local function domainsFor(jobs)
    local leo, ems = false, false
    for i = 1, #jobs do
        local d = DOMAIN_OF[jobs[i]] or DOMAIN_ALIAS[jobs[i]]
        if d == 'ems' then ems = true elseif d == 'leo' then leo = true end
    end
    if not leo and not ems then return { DEFAULT_DOMAIN } end

    local out = {}
    if leo then out[#out + 1] = 'leo' end
    if ems then out[#out + 1] = 'ems' end
    return out
end

---cd_dispatch carries no priority field at all, so severity is read off the two flags its callers
---use in place of one: the panic tone and the flashing alert are what an officer-down alert sets.
---Both flags are sent as a boolean by some callers and as 1 by others.
---@param data table raw payload
---@param blip table the payload's blip sub-table (empty when it sent none)
---@return integer priority 1-4
local function cdPriority(data, blip)
    if tonumber(data.sound) == 4 or tonumber(blip.sound) == 4 then return 1 end
    if data.flash == true or tonumber(data.flash) == 1 then return 1 end
    if blip.flashes == true or tonumber(blip.flashes) == 1 then return 2 end
    return DEFAULT_PRIORITY
end

-- One entry per supported dispatch resource. `normalise` is pure: it reads a payload and returns the
-- createCall shape plus `jobs` (which decides the board), or nil to reject. An adapter with no
-- `event` is reached only through the client relay. Nothing else in this file branches per system.
---@type { key: string, event: string?, relay: boolean?, normalise: fun(payload: table): table? }[]
local ADAPTERS = {
    {
        key = 'ps-dispatch',
        event = 'ps-dispatch:server:notify',
        ---@param data table raw ps-dispatch alert
        ---@return table call
        normalise = function(data)
            local code, kind = codeAndType(data.code, data.message)
            local slug = text(data.codeName, 32)
            slug = slug and slug:lower() or nil
            return {
                code = code,
                -- The slug is a config key ('shooting'), so it is only a headline once it reads as
                -- one, and only when the alert carried no message to use instead.
                type = kind or (slug ~= 'none' and humanise(slug) or nil),
                priority = (slug and CRITICAL_CODES[slug]) and 1 or numericPriority(data.priority or 2),
                location = text(data.street, 120),
                coords = coordsOf(data.coords),
                direction = known(data.heading, 60),
                -- `color` is the vehicle's paint here but the BLIP colour in CustomAlert's input, so
                -- it is only read when it arrived as a string.
                suspect = detail(
                    genderText(data.gender), data.vehicle, plateOf(data.plate),
                    type(data.color) == 'string' and data.color or nil,
                    data.class, data.information
                ),
                weapon = known(data.weapon, 60),
                jobs = jobList(data.jobs),
            }
        end,
    },

    {
        key = 'qb-dispatch',
        event = 'dispatch:server:notify',
        ---@param data table raw qb-dispatch alert
        ---@return table call
        normalise = function(data)
            local code, kind = codeAndType(data.dispatchCode, data.dispatchMessage)
            local slug = text(data.dispatchcodename, 32)
            slug = slug and slug:lower() or nil
            return {
                code = code,
                type = kind or humanise(slug),
                priority = (slug and CRITICAL_CODES[slug]) and 1 or numericPriority(data.priority or 2),
                location = text(data.firstStreet, 120),
                coords = coordsOf(data.origin),
                direction = known(data.heading, 60),
                -- `gender` is a string from every shipped caller and the documented 0/1/2 digit from
                -- third-party ones; genderText takes either rather than printing a bare digit.
                suspect = detail(
                    genderText(data.gender), data.model, plateOf(data.plate),
                    data.firstColor, data.information
                ),
                jobs = jobList(data.job),
            }
        end,
    },

    {
        key = 'cd_dispatch',
        event = 'cd_dispatch:AddNotification',
        ---@param data table raw cd_dispatch alert
        ---@return table call
        normalise = function(data)
            local blip = type(data.blip) == 'table' and data.blip or {}
            local code, kind = codeAndType(data.title, blip.text)
            return {
                code = code,
                type = kind,
                priority = cdPriority(data, blip),
                coords = coordsOf(data.coords),
                -- The street, the suspect and everything else are concatenated into `message` by each
                -- caller in its own format, so it goes on the board whole rather than parsed.
                suspect = text(data.message, 120),
                jobs = jobList(data.job_table),
            }
        end,
    },

    {
        key = 'qs-dispatch',
        event = 'qs-dispatch:server:CreateDispatchCall',
        ---@param data table raw qs-dispatch alert
        ---@return table call
        normalise = function(data)
            local cc = type(data.callCode) == 'table' and data.callCode or {}
            local blip = type(data.blip) == 'table' and data.blip or {}
            local code, kind = codeAndType(cc.code, cc.snippet)
            -- Its own callers set the flashing blip either on the payload or inside `blip`, and that
            -- flag is the only urgency signal this payload carries. Sent as a boolean by some
            -- callers and as 1 by others, exactly like the cd_dispatch flags.
            local urgent = data.flashes == true or tonumber(data.flashes) == 1
                or blip.flashes == true or tonumber(blip.flashes) == 1
            return {
                code = code,
                type = kind or text(blip.text, 64),
                priority = urgent and 2 or DEFAULT_PRIORITY,
                coords = coordsOf(data.callLocation),
                suspect = text(data.message, 120),
                jobs = jobList(data.job),
            }
        end,
    },

    {
        key = 'rcore_dispatch',
        event = 'rcore_dispatch:server:sendAlert',
        ---@param data table raw rcore_dispatch alert
        ---@return table call
        normalise = function(data)
            local blip = type(data.blip) == 'table' and data.blip or {}
            local code, kind = codeAndType(data.code, blip.text)
            local level = text(data.default_priority, 12)
            return {
                code = code,
                -- `type` on this payload is a statistics bucket ('alerts', 'car_robbery'), not a
                -- headline, so it is deliberately not read as one.
                type = kind,
                priority = (level and RCORE_PRIORITY[level:lower()]) or DEFAULT_PRIORITY,
                coords = coordsOf(data.coords),
                suspect = text(data.text, 120),
                jobs = jobList(data.job),
            }
        end,
    },

    {
        -- No `event`: aty_dispatchv2 announces an alert to CLIENTS only, so the client half relays
        -- it and there is no server-side event of its own to listen for.
        key = 'aty_dispatchv2',
        relay = true,
        ---@param data table raw aty_dispatchv2 alert
        ---@return table call
        normalise = function(data)
            local info = type(data.information) == 'table' and data.information or {}
            local code, kind = codeAndType(data.code, data.title)
            return {
                code = code,
                type = kind,
                priority = data.urgent == true and 2 or DEFAULT_PRIORITY,
                location = text(info.street, 120),
                coords = coordsOf(data.coords),
                suspect = detail(info.description, info.caller, genderText(info.gender), data.message),
                -- Deliberately no `jobs`: this payload only ever reaches here across a client that
                -- rebuilt it field by field, so the job list it names is attacker-chosen. accept()
                -- would ignore it anyway - the relay path always lands on DEFAULT_DOMAIN - and
                -- reading it here would only make it look as though it were consulted.
            }
        end,
    },
}

---@type table Adapter behind the mdtMirrorCall export. No `event` and no `relay`, so nothing routes
---to it on its own: it is reached only through ingest.mirrorCall. That export is what an operator's
---own forwarder calls for an export-only dispatch resource (tk_dispatch, codem-dispatch,
---fd_dispatch), and that forwarder runs in their resource and passes on a payload their CLIENT half
---handed it. What arrives is therefore exactly as untrusted as anything on the five events above, and it
---takes the same quarantine, rate limit and dedupe. mdtCreateCall stays trusted and unchanged for
---genuine server-side callers.
---@type { key: string, normalise: fun(payload: table): table? }
local EXPORT_ADAPTER = {
    key = 'export',
    ---@param data table mirror payload, in the same field shape as mdtCreateCall
    ---@return table call
    normalise = function(data)
        -- The board's own 1-4 scale, not the 0-ascending one third-party payloads use, because this
        -- is the shape the export documents. Clamped here rather than left to createCall, which
        -- floors a non-integral or infinite value straight into an error.
        local p = tonumber(data.priority)
        p = util.finite(p) and math.max(1, math.min(4, math.floor(p))) or DEFAULT_PRIORITY

        -- `domain` is how the export shape names a board and `jobs` is how the five adapters do; the
        -- alias table already maps 'leo' and 'ems', so both go through the one resolver rather than
        -- a second routing rule that could disagree with it.
        local named = text(data.domain, 8)
        named = named and named:lower() or nil

        return {
            code = text(data.code, 12),
            type = text(data.type, 64),
            priority = p,
            location = text(data.location, 120),
            coords = coordsOf(data.coords),
            direction = known(data.direction, 60),
            suspect = known(data.suspect, 120),
            weapon = known(data.weapon, 60),
            -- Deliberately no `ttl`: a mirrored call takes the board's own lifetime, so a forged
            -- payload cannot pin one of the mirrored slots for the six hours createCall would allow.
            jobs = (named == 'leo' or named == 'ems') and { named } or jobList(data.jobs or data.job),
        }
    end,
}

---@type table<string, table> Adapters the client relay may reach, keyed by system.
local RELAYS = {}
for i = 1, #ADAPTERS do
    if ADAPTERS[i].relay then RELAYS[ADAPTERS[i].key] = ADAPTERS[i] end
end

---@type table<string, integer> Dedupe key -> GetGameTimer() the key stops swallowing repeats at.
local seen = {}
---@type integer Live entries in `seen`, tracked because counting a hash part is O(n).
local seenCount = 0
---@type table<string, integer> "<reason> <system>" -> alerts refused for it since it last printed.
local drops = {}
---@type table<string, integer> The same keys -> GetGameTimer() that reason's window opened at. Per
---reason rather than one stamp for all of them: a shared stamp lets whichever reason drops next
---flush the tally, so the count explaining an outage is printed under another reason's name, or -
---when the outage is the only thing dropping and it stops - never printed at all.
local droppedAt = {}

---Prints the tally for every reason whose window has closed. Called on each drop and from the sweep
---thread, because a reason that stops dropping is exactly the one an operator needs the count for:
---an ingest that has stopped mirroring otherwise looks identical to a dispatch resource that
---stopped firing.
---@param now integer GetGameTimer() reading to measure the windows against
---@return nil
local function flushDrops(now)
    local parts = {}
    for label, count in pairs(drops) do
        local opened = droppedAt[label] or 0
        -- `now < opened` is GetGameTimer wrapping on a server with weeks of uptime: a window that
        -- opened before the wrap would otherwise never close.
        if now < opened or now - opened >= DROP_LOG_MS then
            parts[#parts + 1] = ('%s x%d'):format(label, count)
            drops[label] = nil
            droppedAt[label] = now
        end
    end
    if #parts == 0 then return end

    table.sort(parts)
    print(('^3[sd-phone]^0 mdt ingest refused %s'):format(table.concat(parts, ', ')))
end

---Records a refused alert, and prints that reason's tally at most once a minute.
---@param reason string short reason slug
---@param system string adapter key the alert claimed
---@return nil
local function dropped(reason, system)
    local k = reason .. ' ' .. system
    drops[k] = (drops[k] or 0) + 1

    local now = GetGameTimer()
    -- The first drop opens the window rather than printing, so one refused alert is a tally and a
    -- flood is still one console line a minute.
    if droppedAt[k] == nil then droppedAt[k] = now end
    flushDrops(now)
end

---A short, stable digest of an alert's body. djb2 with arithmetic only, so this file loads the same
---under LuaJIT and under 5.4 and needs no native.
---@param s string
---@return string digest
local function digest(s)
    local h = 5381
    for i = 1, #s do h = (h * 33 + s:byte(i)) % 4294967296 end
    return ('%x'):format(math.floor(h))
end

---Key an alert is deduplicated on: its system, its source class, a digest of its whole body and a
---coarse map cell. The body is folded in because the code and the type alone are far too broad a
---key - two unrelated /911 calls in one cell share both, and a payload with no coordinates lands
---every system's alerts in one map-wide cell - while an identical body IS the repeat this is here to
---swallow, whether that is one incident re-fired or the copy every receiving player relays. The
---class keeps the two paths apart, so a client replaying a predictable alert cannot burn the stamp
---the genuine server-raised one needs.
---@param system string adapter key
---@param class string source class, 'client' or 'server'
---@param call table normalised call
---@return string key
local function dedupeKey(system, class, call)
    -- Rounded to a 25m cell, the scale ps-dispatch's own call merge works at: one incident reported
    -- twice is never reported from the same metre twice.
    local c = call.coords
    local cell = c and ('%d:%d'):format(math.floor(c.x / 25), math.floor(c.y / 25)) or 'nocoords'
    local body = digest(table.concat({
        call.code or '', call.type or '', call.location or '', call.direction or '',
        call.suspect or '', call.weapon or '', tostring(call.priority or ''),
    }, '\0'))
    return ('%s|%s|%s|%s'):format(system, class, body, cell)
end

---Drops every dedupe stamp that has expired, and every stamp that sits further ahead than one full
---window. The second case is GetGameTimer wrapping on a server with weeks of uptime: without it a
---pre-wrap stamp is permanently in the future, so its key blocks forever and never sweeps.
---@return nil
local function sweepSeen()
    local now, kept = GetGameTimer(), 0
    for key, until_ in pairs(seen) do
        if now >= until_ or until_ - now > DEDUPE_MS then
            seen[key] = nil
        else
            kept = kept + 1
        end
    end
    seenCount = kept
end

---Whether an alert is new enough to put on the board. Read-only: the stamp is burned only once a
---call has actually been created, so an alert the guards refuse does not suppress the real one.
---@param key string dedupe key
---@return boolean fresh
local function isFresh(key)
    local until_ = seen[key]
    if not until_ then return true end

    local now = GetGameTimer()
    if now >= until_ or until_ - now > DEDUPE_MS then
        seen[key] = nil
        seenCount = seenCount - 1
        return true
    end
    return false
end

---Makes room in the dedupe table for `key`, sweeping first and evicting the oldest stamp when the
---table is still full afterwards. Refusing instead fails closed for the whole server - every system
---and every source at once - on a table that is only 512 keys wide and reachable the moment an
---operator raises MaxCalls. The oldest stamp is the one closest to expiring anyway, so dropping it
---costs at most one swallowed repeat.
---@param key string dedupe key
---@return nil
local function makeRoom(key)
    if seen[key] ~= nil or seenCount < MAX_SEEN then return end
    sweepSeen()
    if seen[key] ~= nil or seenCount < MAX_SEEN then return end

    local oldestKey, oldestAt
    for k, until_ in pairs(seen) do
        if not oldestAt or until_ < oldestAt then oldestKey, oldestAt = k, until_ end
    end
    if not oldestKey then return end

    seen[oldestKey] = nil
    seenCount = seenCount - 1
end

---Burns the dedupe stamp for a key that has just produced a board call, making room for it first.
---@param key string dedupe key
---@return nil
local function stamp(key)
    makeRoom(key)
    if seen[key] == nil then seenCount = seenCount + 1 end
    seen[key] = GetGameTimer() + DEDUPE_MS
end

---Rate-limit bucket an alert is charged to. A client-sourced alert is charged to the CHARACTER, not
---to the server id, because util.rateLimit is keyed by citizenid precisely so that dropping and
---reconnecting cannot hand a flooding client a fresh budget. A server-side trigger is charged to the
---resource that fired it, so two dispatch resources on one server never spend each other's budget
---and one of them flooding is visible as itself.
---@param src integer server id, 0 for a server-side trigger
---@return string bucket always a non-empty string, because util.rateLimit never blocks anything else
local function bucketFor(src)
    if src > 0 then
        local cid = player.getRealIdentifier(src)
        if type(cid) == 'string' and cid ~= '' then return 'cid:' .. cid end
        -- ONE bucket for every sender with no character behind them yet, not one each. A player is
        -- connected but unloaded for several seconds of every join, and a per-id fallback hands a
        -- fresh budget out on each of them: cycling server ids would buy a budget per id.
        return 'cid:unidentified'
    end

    local res = GetInvokingResource and GetInvokingResource() or nil
    return 'res:' .. (type(res) == 'string' and res or 'server')
end

---Whether a relayed payload's coordinates are close enough to the sender to have been raised around
---them. This range check is the only thing tying a relayed alert to the player relaying it, so a
---payload with no usable coordinates - none at all, junk, or a position outside the world - is
---REFUSED rather than waved through: waving it through made the whole guard opt-out, and omitting a
---field is the cheapest thing a forged payload can do.
---@param src integer server id of the relaying player
---@param payload table raw payload
---@return boolean ok
local function nearSender(src, payload)
    local c = coordsOf(payload.coords)
    if not c then return false end

    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return false end
    local at = GetEntityCoords(ped)
    if not at then return false end

    local dx, dy = c.x - at.x, c.y - at.y
    return (dx * dx + dy * dy) <= (RELAY_RANGE * RELAY_RANGE)
end

---Turns one third-party alert into board calls: normalise, guard, mark, create. Every payload
---reaching here is untrusted - the server-side hooks are net events any client may trigger, and the
---relay is client-sourced by definition - so nothing lands on the board that this file or
---createCall has not clamped, and everything that does is marked as mirrored. That mark is what
---makes this one-way ingest additive: a mirrored call cannot evict, outrank or misdirect a call the
---MDT raised itself, whoever fired the event and whatever they put in it.
---@param adapter table the adapter owning the event
---@param src integer server id of the player whose client fired it, 0 for a server-side trigger
---@param payload any first event argument
---@return integer created board calls the alert produced
local function accept(adapter, src, payload)
    if SYSTEMS[adapter.key] == false then return 0 end

    -- Charged before the payload is inspected, so a malformed flood costs the sender the same as a
    -- real alert instead of being free. ONE budget per source, covering every system at once: the
    -- key used to carry the adapter as well, which multiplied a source's real ceiling by the number
    -- of systems installed - a character firing the five events in rotation bought five budgets and
    -- landed RateMax x 5 alerts in a window the config promises RateMax for. Keeping two dispatch
    -- resources out of each other's budget is the BUCKET's job, not the key's, and that is unchanged:
    -- a client-sourced alert is charged to the character and a server-sourced one to the resource
    -- that fired it.
    if not util.rateLimit(bucketFor(src), 'mdt:ingest', RATE_WINDOW, RATE_MAX) then
        dropped('rate', adapter.key)
        return 0
    end
    if type(payload) ~= 'table' then return 0 end

    local ok, call = pcall(adapter.normalise, payload)
    if not ok or type(call) ~= 'table' then return 0 end
    -- An alert with neither is a payload shape this adapter does not understand rather than a call
    -- for service, and createCall would refuse it anyway.
    if not call.code and not call.type then return 0 end

    -- The source class is half the key, so the two paths never share a stamp. Sharing one let a
    -- client replay a byte-identical copy of a predictable alert first and have the genuine
    -- server-raised one swallowed as its own repeat - a suppression channel that costs one alert
    -- per dedupe window and sits well inside RateMax.
    local key = dedupeKey(adapter.key, (src > 0) and 'client' or 'server', call)
    if not isFresh(key) then return 0 end

    -- The quarantine mark. server.mdt.dispatch holds every marked call to its own share of the
    -- board, evicts marked calls ahead of genuine ones and floors their priority below the top
    -- tier, so nothing this file files can evict, outrank or misdirect a call an officer or a
    -- trusted export raised. The id is per ALERT, so an alert filed to both boards is two rows and
    -- one mirrored call, and is evicted as one.
    call.ingested = true
    call.ingestId = util.newId(8)

    -- The job list picks the board, which is the documented routing every one of these systems
    -- uses: they raise their alerts from the CLIENT that witnessed the incident, so refusing a
    -- client-sourced list would put every genuine medical alert on the police board. A forged list
    -- can now only choose which board a call appears on, and the quarantine already guarantees that
    -- call cannot evict, outrank or displace a genuine one on either.
    --
    -- The RELAY is the exception and keeps the forced board: nothing raises that payload on the
    -- server at all, so what arrives is a shape a client reconstructed field by field rather than
    -- an alert a dispatch resource wrote.
    local domains = adapter.relay and { DEFAULT_DOMAIN } or domainsFor(call.jobs)
    local created = 0
    for i = 1, #domains do
        call.domain = domains[i]
        if mdt.createCall(call) then created = created + 1 end
        -- With one shared board every terminal already sees the call, so an alert addressed to both
        -- services must not be filed twice.
        if SHARED then break end
    end

    -- Stamped only once a call exists: a stamp burned by an alert the guards refused would suppress
    -- the real one for the whole dedupe window.
    if created > 0 then stamp(key) end
    return created
end

---Mirrors one alert from a dispatch resource that publishes through an export instead of an event
---(exports['sd-phone']:mdtMirrorCall). Three supported systems do, and an export call cannot be
---observed from outside the resource that made it, so a snippet in the operator's own resource is
---the only way to reach the board from them. That snippet is fed by a client, so this takes the
---quarantine mark, the rate limit and the dedupe rather than the trusted mdtCreateCall path: the
---documented snippet used to call mdtCreateCall, which meant 120 forged calls could clear a board of
---genuine ones.
---@param payload any mirror payload, in the same field shape as mdtCreateCall
---@return boolean mirrored true when the alert reached at least one board
function ingest.mirrorCall(payload)
    if not ENABLED then return false end
    -- Source 0: no player fired this, so it is charged to the calling RESOURCE like any other
    -- server-side trigger and is routed by the jobs (or the domain) it names.
    return accept(EXPORT_ADAPTER, 0, payload) > 0
end

---Dispatch resources this build mirrors, for a console or a config check to read.
---@return string[] systems adapter keys
function ingest.systems()
    local out = {}
    for i = 1, #ADAPTERS do out[i] = ADAPTERS[i].key end
    return out
end

---@type boolean True once the client relay has been registered, so a resource restart never leaves
---two handlers on one event.
local relayRegistered = false
---@type any Handler cookie RegisterNetEvent returned, so the relay can be taken back down.
local relayHandler = nil

---Registers the relay from bridge/client/dispatch.lua, for the systems that only ever announce an
---alert to clients. Gated on the relayed resource actually running AND on that system's own switch
---in Dispatch.Ingest.Systems: registering it otherwise hands every client a writer onto the call
---board on a server that never installed the resource or asked for it to be mirrored, and clamping
---a field is not the same as being allowed to set it.
---@return nil
local function registerRelay()
    if relayRegistered then return end
    if SYSTEMS[RELAY_RESOURCE] == false then return end
    if GetResourceState(RELAY_RESOURCE) ~= 'started' then return end
    relayRegistered = true

    ---@param key any adapter key the client claims to be relaying
    ---@param payload any raw dispatch payload
    ---@return nil
    relayHandler = RegisterNetEvent('sd-phone:server:mdt:dispatchRelay', function(key, payload)
        local src = tonumber(source) or 0
        if src <= 0 then return end
        -- Ahead of every table lookup and every type check, so junk cannot be spammed for free: the
        -- adapter table below is indexed with a client-supplied string.
        if not util.cooldown(bucketFor(src), 'mdt:relay', RELAY_COOLDOWN_MS) then return end

        local adapter = type(key) == 'string' and RELAYS[key] or nil
        if not adapter then return end
        if type(payload) ~= 'table' then return end
        if not nearSender(src, payload) then
            dropped('far', adapter.key)
            return
        end

        accept(adapter, src, payload)
    end)
end

---Takes the relay back down when the resource it relays stops. The registration flag used to be set
---and never cleared, so stopping or removing that resource left a client-writable net event live
---for the rest of the server's uptime, mirroring a system nobody was running any more.
---@return nil
local function unregisterRelay()
    if not relayRegistered then return end
    -- The flag is only cleared once the handler is really gone: clearing it while the handler still
    -- ran would add a SECOND one the next time that resource started, and one alert would mirror
    -- twice for the rest of the uptime.
    if relayHandler == nil or type(RemoveEventHandler) ~= 'function' then return end

    RemoveEventHandler(relayHandler)
    relayRegistered, relayHandler = false, nil
end

---Warns when the configured flood ceiling can outrun the board it feeds. A rolling window is a poor
---bound on a board with a TTL: over one CallTTL a source may spend RateMax many times over, which on
---the shipped values is 1080 alerts against 60 slots, and no RateMax anyone would actually run makes
---that product fit. The mirrored share is what really bounds it, so the warning fires on the case
---that share cannot absorb - one window on its own filling every slot mirroring is allowed - and
---carries the whole-TTL figure so the number is visible. Nothing genuine is lost when it happens,
---because mirrored calls only ever evict each other; what is lost is the mirror's own usefulness,
---as one noisy source cycles every mirrored slot before an officer has read any of them.
---
---RateMax IS the whole per-source ceiling to compare against, which it was not while the limiter
---carried the adapter in its key: a source held one budget per system then, so this comparison
---silently understated what one of them could land by however many systems were installed.
---@return nil
local function checkBudget()
    if RATE_MAX <= INGEST_BUDGET then return end
    local perTtl = math.floor(RATE_MAX * ((CALL_TTL * 1000) / RATE_WINDOW))
    print(('^3[sd-phone]^0 mdt ingest: Dispatch.Ingest.RateMax %d per %dms lets one source cycle all %d mirrored slot(s) in a single window (and land %d alert(s) inside a %ds call TTL, against a %d-call board). Mirrored calls past that share evict the oldest mirrored call, so lower RateMax rather than leaving the board cap to do the work.')
        :format(RATE_MAX, RATE_WINDOW, INGEST_BUDGET, perTtl, CALL_TTL, MAX_CALLS))
end

if ENABLED then
    checkBudget()

    for i = 1, #ADAPTERS do
        local adapter = ADAPTERS[i]
        if adapter.event then
            -- Marked net-safe BEFORE the handler goes on. Every one of these five systems raises
            -- its alert from the client with TriggerServerEvent - that is their documented API -
            -- and the scheduler gates an incoming net event on a PER-RESOURCE flag that only
            -- RegisterNetEvent sets. The resource that owns the event marking its own copy net-safe
            -- does nothing for this one, so with AddEventHandler alone every client-raised alert
            -- was refused before it arrived and the mirror saw only server-side traffic.
            RegisterNetEvent(adapter.event)
            -- Registered whether or not that resource is installed: one that is not running never
            -- fires its event, and a server running two dispatch systems should see both mirrored.
            ---@param payload any raw dispatch payload
            ---@return nil
            AddEventHandler(adapter.event, function(payload)
                accept(adapter, tonumber(source) or 0, payload)
            end)
        end
    end

    registerRelay()
    ---@param resource string the resource that just started
    ---@return nil
    AddEventHandler('onResourceStart', function(resource)
        if resource == RELAY_RESOURCE then registerRelay() end
    end)

    ---@param resource string the resource that just stopped
    ---@return nil
    AddEventHandler('onResourceStop', function(resource)
        if resource == RELAY_RESOURCE then unregisterRelay() end
    end)

    -- A dedupe stamp rebuilds identically once its window has passed, so the table is swept instead
    -- of being held for the server's uptime: it is keyed by map cell and grows with traffic. The
    -- drop tally rides the same tick, because the reason an operator most needs the count for is
    -- the one that has stopped dropping - a flush driven only by the next drop never prints it.
    CreateThread(function()
        while true do
            Wait(math.max(DEDUPE_MS, 60000))
            sweepSeen()
            flushDrops(GetGameTimer())
        end
    end)
end

return ingest
