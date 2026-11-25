---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Health settings (configs/health.lua): goal, retention, leaderboard, flush ceilings.
local H <const> = config.Health or {}
---@type table Per-flush ceilings; a missing config falls back to the sampler's own maxima.
local LIMITS <const> = H.Limits or {}
---@type number Steps a second of elapsed time can justify.
local MAX_STEPS_PER_S <const> = tonumber(LIMITS.StepsPerSecond) or 3.4
---@type number Metres a second of elapsed time can justify.
local MAX_METRES_PER_S <const> = tonumber(LIMITS.MetresPerSecond) or 7.5
---@type integer Seconds of a single flush that may count toward those ceilings.
local MAX_ELAPSED_S <const> = math.floor(tonumber(LIMITS.MaxElapsedSeconds) or 120)
---@type integer Days of daily rows kept per player.
local RETENTION_DAYS <const> = math.floor(tonumber(H.RetentionDays) or 30)
---@type integer Highest heart rate accepted as a daily peak.
local MAX_HR <const> = 220

---@type table Store module; the table returned at end of file.
local store = {}

---Creates the daily totals table and the (day, steps) index the leaderboard ranks on.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_health_daily (
            citizenid  VARCHAR(64)       NOT NULL,
            day        DATE              NOT NULL,
            name       VARCHAR(64)       NOT NULL DEFAULT '',
            steps      INT UNSIGNED      NOT NULL DEFAULT 0,
            distance_m INT UNSIGNED      NOT NULL DEFAULT 0,
            active_ms  INT UNSIGNED      NOT NULL DEFAULT 0,
            peak_hr    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (citizenid, day),
            INDEX idx_health_day_steps (day, steps)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Drops daily rows past the retention window. Runs once on boot.
function store.prune()
    if RETENTION_DAYS <= 0 then return end
    MySQL.update.await('DELETE FROM phone_health_daily WHERE day < (CURDATE() - INTERVAL ? DAY)', { RETENTION_DAYS })
end

---A claimed delta reduced to what the elapsed time could physically produce. Negative and
---non-numeric claims read as zero.
---@param claimed any value the client reported
---@param perSecond number ceiling per second of elapsed time
---@param elapsed number seconds since that player's previous flush
---@return integer accepted
function store.cap(claimed, perSecond, elapsed)
    local n = tonumber(claimed)
    if not n or n ~= n or n <= 0 then return 0 end
    local seconds = math.min(math.max(elapsed, 0), MAX_ELAPSED_S)
    local ceiling = perSecond * seconds
    return math.floor(math.min(n, ceiling))
end

---One client flush reduced to what the server accepts: every amount capped against the time it
---had to happen in, the heart rate clamped to a plausible peak.
---@param delta { steps: any, distanceM: any, activeMs: any, heartRate: any }
---@param elapsed number seconds since that player's previous flush
---@return { steps: integer, distanceM: integer, activeMs: integer, peakHr: integer } accepted
function store.accept(delta, elapsed)
    local hr = tonumber(delta.heartRate) or 0
    if hr ~= hr or hr < 0 then hr = 0 elseif hr > MAX_HR then hr = MAX_HR end
    return {
        steps     = store.cap(delta.steps,     MAX_STEPS_PER_S,  elapsed),
        distanceM = store.cap(delta.distanceM, MAX_METRES_PER_S, elapsed),
        activeMs  = store.cap(delta.activeMs,  1000,             elapsed),
        peakHr    = math.floor(hr),
    }
end

---@type integer Rows one banking statement carries.
local BANK_CHUNK <const> = 100

---@type string One row's placeholders in the banking statement.
local BANK_ROW <const> = '(?, CURDATE(), ?, ?, ?, ?, ?)'

---Adds accumulated activity to today's rows, many players per statement, creating a row on its
---first write of the day and storing the display name the board shows. Totals add up; the peak
---heart rate keeps the higher. Fire-and-forget when `detached` is set, for the resource stopping,
---where an awaited write would never be resumed.
---@param rows { citizenid: string, name: string, steps: integer, distanceM: integer, activeMs: integer, peakHr: integer }[]
---@param detached boolean|nil true to send without waiting for the result
---@return integer written rows sent
function store.bankMany(rows, detached)
    local written = 0
    for first = 1, #rows, BANK_CHUNK do
        local last = math.min(first + BANK_CHUNK - 1, #rows)
        local holes, params = {}, {}
        for i = first, last do
            local r = rows[i]
            holes[#holes + 1] = BANK_ROW
            params[#params + 1] = r.citizenid
            params[#params + 1] = tostring(r.name or ''):sub(1, 64)
            params[#params + 1] = math.floor(r.steps or 0)
            params[#params + 1] = math.floor(r.distanceM or 0)
            params[#params + 1] = math.floor(r.activeMs or 0)
            params[#params + 1] = math.floor(r.peakHr or 0)
        end
        local sql = ([[
            INSERT INTO phone_health_daily (citizenid, day, name, steps, distance_m, active_ms, peak_hr)
            VALUES %s
            ON DUPLICATE KEY UPDATE
                name       = VALUES(name),
                steps      = steps + VALUES(steps),
                distance_m = distance_m + VALUES(distance_m),
                active_ms  = active_ms + VALUES(active_ms),
                peak_hr    = GREATEST(peak_hr, VALUES(peak_hr))
        ]]):format(table.concat(holes, ', '))
        if detached then MySQL.update(sql, params) else MySQL.update.await(sql, params) end
        written = written + (last - first + 1)
    end
    return written
end

---The player's last `days` daily rows, oldest first, with missing days filled in as zeroes.
---@param citizenid string
---@param days integer
---@return { day: string, steps: integer, distanceM: integer, activeMs: integer, peakHr: integer }[]
function store.history(citizenid, days)
    local span = math.max(1, math.floor(days))
    local rows = MySQL.query.await([[
        SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, steps, distance_m, active_ms, peak_hr
        FROM phone_health_daily
        WHERE citizenid = ? AND day > (CURDATE() - INTERVAL ? DAY)
        ORDER BY day ASC
    ]], { citizenid, span }) or {}

    local byDay = {}
    for i = 1, #rows do byDay[rows[i].day] = rows[i] end

    local today = MySQL.scalar.await("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d')")
    local y, m, d = tostring(today or ''):match('^(%d+)-(%d+)-(%d+)$')
    local midday = os.time({ year = tonumber(y) or 1970, month = tonumber(m) or 1, day = tonumber(d) or 1, hour = 12 })

    local out = {}
    for back = span - 1, 0, -1 do
        local key = os.date('%Y-%m-%d', midday - back * 86400)
        local row = byDay[key]
        out[#out + 1] = {
            day       = key,
            steps     = row and tonumber(row.steps) or 0,
            distanceM = row and tonumber(row.distance_m) or 0,
            activeMs  = row and tonumber(row.active_ms) or 0,
            peakHr    = row and tonumber(row.peak_hr) or 0,
        }
    end
    return out
end

---Today's ranked steps, plus the caller's own standing whether or not they made the cut.
---@param citizenid string
---@param size integer how many ranked rows to return
---@return { top: { citizenid: string, steps: integer }[], rank: integer|nil, steps: integer }
function store.leaderboard(citizenid, size)
    local limit = math.max(1, math.floor(size))
    local top = MySQL.query.await([[
        SELECT citizenid, name, steps FROM phone_health_daily
        WHERE day = CURDATE() AND steps > 0
        ORDER BY steps DESC, citizenid ASC
        LIMIT ?
    ]], { limit }) or {}

    local mine = MySQL.single.await(
        'SELECT steps FROM phone_health_daily WHERE citizenid = ? AND day = CURDATE()', { citizenid })
    local steps = mine and tonumber(mine.steps) or 0

    local rank
    if steps > 0 then
        local counted = tonumber(MySQL.scalar.await([[
            SELECT COUNT(*) + 1 FROM phone_health_daily
            WHERE day = CURDATE() AND (steps > ? OR (steps = ? AND citizenid < ?))
        ]], { steps, steps, citizenid }))
        rank = counted and math.floor(counted) or nil
    end

    return { top = top, rank = rank, steps = steps }
end

return store
