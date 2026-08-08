---@type table Shared server helpers (server.util): TINYINT reads, string caps, schema bootstrap.
local util       = require 'server.util'
---@type table Post-0.9.0 column back-fills (server.migrations), applied right after each CREATE.
local migrations = require 'server.migrations'
---@type table sd-phone config root (configs/config.lua); read for the base rating and board cap.
local config     = require 'configs.config'

---@type table Store module; the table returned at end of file. Every phone_racing_* read and write:
---tracks, driver profiles, finished results. Persistence only, so there are no permission checks,
---no envelopes and no pushes here; the callers own those.
local store = {}

---@type table Racing settings (configs/racing.lua), reached through the config root.
local RACING = type(config.Racing) == 'table' and config.Racing or {}

---@type integer Rating a profile is created with (Racing.MMR.Base).
local BASE_MMR     = math.floor(tonumber((RACING.MMR or {}).Base) or 1000)
---@type integer Rows the cached leaderboard holds (Racing.Limits.LeaderboardMax).
local BOARD_MAX    = math.floor(tonumber((RACING.Limits or {}).LeaderboardMax) or 500)
---@type integer Tracks a page serves when the caller names no size (Racing.Limits.TracksPerPage).
local TRACK_PAGE   = math.floor(tonumber((RACING.Limits or {}).TracksPerPage) or 20)
---@type integer Ranks a page serves when the caller names no size (Racing.Limits.RanksPerPage).
local RANK_PAGE    = math.floor(tonumber((RACING.Limits or {}).RanksPerPage) or 25)

---@type integer How long the play-count and leaderboard caches serve before a rebuild (ms).
local CACHE_TTL_MS = 30000
---@type integer Largest page any read here will serve, whatever the caller asks for.
local MAX_PER_PAGE = 100
---@type integer Finishes scanned for a track's record board before they are deduplicated by racer.
local RECORD_SCAN  = 50
---@type integer Records the board keeps, one per racer.
local RECORD_ROWS  = 10
---@type integer Ranked finishes the rating chart is drawn from.
local CHART_ROWS   = 15
---@type integer Finishes the racer profile lists.
local PAST_RACES   = 8

---@type table<string, string> Sort name -> ORDER BY fragment. The client's sort word is only ever a
---key into this table, so the sole text interpolated into the statement is one of these four.
local TRACK_ORDER = {
    name   = 't.featured DESC, t.name ASC, t.id ASC',
    plays  = 'plays DESC, t.name ASC, t.id ASC',
    gates  = 't.gate_count DESC, t.name ASC, t.id ASC',
    newest = 't.created_at DESC, t.id DESC',
}

---@type table<string, string> Flag name -> its column. A flag outside this map is refused, so a
---payload can never name a column.
local TRACK_FLAGS = { verified = 'verified', featured = 'featured', published = 'published' }

---@type string Filter shared by the track count and the track page so the two can never disagree.
---Takes includeUnpublished, verifiedOnly, like, like. The unfiltered name match is the empty string
---rather than NULL: a trailing nil would shorten the parameter array and leave a placeholder unfed.
local TRACK_FILTER = [[
        t.deleted = 0
          AND (? = 1 OR t.published = 1)
          AND (? = 0 OR t.verified = 1)
          AND (? = '' OR t.name LIKE ?)
]]

---Creates the three Racing tables idempotently, then brings an install that predates a column, an
---index or the explicit collation up to date. Run once at boot from server/racing/init.lua.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_racing_tracks (
            id           INT          NOT NULL AUTO_INCREMENT,
            name         VARCHAR(60)  NOT NULL,
            citizenid    VARCHAR(64)  NULL,
            author_name  VARCHAR(64)  NOT NULL DEFAULT '',
            checkpoints  LONGTEXT     NOT NULL,
            gate_count   INT          NOT NULL DEFAULT 0,
            is_sprint    TINYINT(1)   NOT NULL DEFAULT 0,
            published    TINYINT(1)   NOT NULL DEFAULT 1,
            verified     TINYINT(1)   NOT NULL DEFAULT 0,
            featured     TINYINT(1)   NOT NULL DEFAULT 0,
            deleted      TINYINT(1)   NOT NULL DEFAULT 0,
            created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_racing_tracks_live    (deleted, published, featured, name),
            INDEX idx_racing_tracks_creator (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_racing_tracks')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_racing_profiles (
            citizenid  VARCHAR(64)  NOT NULL,
            name       VARCHAR(64)  NULL,
            alias      VARCHAR(24)  NULL,
            avatar     VARCHAR(500) NULL,
            mmr        INT          NOT NULL DEFAULT 1000,
            hud        TEXT         NULL,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid),
            INDEX idx_racing_profiles_mmr (mmr)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_racing_profiles')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_racing_results (
            id          INT          NOT NULL AUTO_INCREMENT,
            track_id    INT          NOT NULL,
            citizenid   VARCHAR(64)  NOT NULL,
            name        VARCHAR(64)  NOT NULL DEFAULT '',
            time_ms     INT          NOT NULL DEFAULT 0,
            vehicle     VARCHAR(64)  NULL,
            class       VARCHAR(4)   NULL,
            position    INT          NULL,
            racers      INT          NULL,
            mmr_delta   INT          NULL,
            mmr_after   INT          NULL,
            dnf         TINYINT(1)   NOT NULL DEFAULT 0,
            ranked      TINYINT(1)   NOT NULL DEFAULT 0,
            finished_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_racing_results_board  (track_id, dnf, time_ms),
            INDEX idx_racing_results_recent (track_id, dnf, finished_at),
            INDEX idx_racing_results_racer  (citizenid, finished_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    migrations.apply('phone_racing_results')

    util.ensureCollation('phone_racing_tracks')
    util.ensureCollation('phone_racing_profiles')
    util.ensureCollation('phone_racing_results')

    util.ensureIndex('phone_racing_tracks', 'idx_racing_tracks_live', '(deleted, published, featured, name)')
    util.ensureIndex('phone_racing_tracks', 'idx_racing_tracks_creator', '(citizenid)')
    util.ensureIndex('phone_racing_profiles', 'idx_racing_profiles_mmr', '(mmr)')
    util.ensureIndex('phone_racing_results', 'idx_racing_results_board', '(track_id, dnf, time_ms)')
    util.ensureIndex('phone_racing_results', 'idx_racing_results_recent', '(track_id, dnf, finished_at)')
    util.ensureIndex('phone_racing_results', 'idx_racing_results_racer', '(citizenid, finished_at)')
end

---A whole page number, at least 1.
---@param value any
---@return integer
local function pageOf(value)
    return math.max(1, math.floor(tonumber(value) or 1))
end

---A whole page size inside the module's cap.
---@param value any requested size
---@param fallback integer size used when the caller names none
---@return integer
local function sizeOf(value, fallback)
    local n = math.floor(tonumber(value) or fallback)
    return lib.math.clamp(n, 1, MAX_PER_PAGE)
end

---A positive row id, or nil when the value is not one.
---@param value any
---@return integer|nil
local function idOf(value)
    local n = math.floor(tonumber(value) or 0)
    return n > 0 and n or nil
end

---A whole number, or nil so the column stores NULL rather than a coerced zero.
---@param value any
---@return integer|nil
local function intOrNil(value)
    local n = tonumber(value)
    if not util.finite(n) then return nil end
    return math.floor(n)
end

---Turns raw search text into a LIKE pattern with the wildcards escaped, or '' when there is nothing
---to match on.
---@param query any raw client text
---@return string pattern
local function likeFor(query)
    local text = util.limitedString(query, 60)
    if not text then return '' end
    return '%' .. (text:gsub('[%%_\\]', '\\%0')) .. '%'
end

---Decodes a stored checkpoint blob into its gate list. Unusable JSON reads as no gates rather than
---raising, so one hand-edited row cannot take the whole tracks list down.
---@param raw any `checkpoints` column value
---@return table[] gates `{ {ax,ay,az}, {bx,by,bz} }` per entry
local function decodeGates(raw)
    if type(raw) ~= 'string' or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---The centre of one gate: the midpoint of its two edges, or the single edge it has.
---@param gate any one entry of a decoded gate list
---@return { x: number, y: number, z: number }|nil
local function gateCentre(gate)
    if type(gate) ~= 'table' then return nil end
    local a, b = gate[1], gate[2]
    if type(a) ~= 'table' then return nil end
    local ax, ay = tonumber(a[1]), tonumber(a[2])
    if not ax or not ay then return nil end
    local az = tonumber(a[3]) or 0.0

    if type(b) ~= 'table' then return { x = ax, y = ay, z = az } end
    local bx, by = tonumber(b[1]), tonumber(b[2])
    if not bx or not by then return { x = ax, y = ay, z = az } end
    local bz = tonumber(b[3]) or 0.0
    return { x = (ax + bx) / 2, y = (ay + by) / 2, z = (az + bz) / 2 }
end

---@type table[]|nil Cached published-track entries, nil when dirty.
local trackList = nil
---@type table<string, table>|nil The same entries keyed by id as a string, nil when dirty.
local trackById = nil
---@type table<string, integer>|nil Cached trackId -> non-DNF finish count, nil when dirty.
local playCounts = nil
---@type integer Game-timer stamp of the last play-count rebuild.
local playCountsAt = 0
---@type table[]|nil Cached ranked board, nil when dirty.
local board = nil
---@type integer Game-timer stamp of the last board rebuild.
local boardAt = 0

---Forces the next trackCache read to rebuild from the database.
function store.invalidateTrackCache()
    trackList, trackById = nil, nil
end

---Forces the next leaderboard read to rebuild from the database.
function store.invalidateLeaderboard()
    board = nil
end

---Every published, undeleted track with the start coordinates and heading derived from its first
---two gates: the start point is gate one's centre, the heading is the bearing from there to gate
---two's centre. Held until a track write invalidates it. Treated read-only by callers.
---@return table[] list ordered featured first, then by name
---@return table<string, table> byId the same entries keyed by track id as a string
function store.trackCache()
    if trackList and trackById then return trackList, trackById end

    local rows = MySQL.query.await([[
        SELECT id, name, author_name, gate_count, is_sprint, verified, featured, checkpoints
        FROM phone_racing_tracks
        WHERE deleted = 0 AND published = 1
        ORDER BY featured DESC, name ASC, id ASC
    ]]) or {}

    local list, byId = {}, {}
    for i = 1, #rows do
        local r      = rows[i]
        local gates  = decodeGates(r.checkpoints)
        local coords = gateCentre(gates[1])
        local next2  = gateCentre(gates[2])

        local heading
        if coords and next2 and (next2.x ~= coords.x or next2.y ~= coords.y) then
            heading = math.deg(math.atan(-(next2.x - coords.x), next2.y - coords.y)) % 360
        end

        local entry = {
            id       = tostring(r.id),
            name     = r.name or '',
            author   = (r.author_name and r.author_name ~= '') and r.author_name or 'Unknown',
            verified = util.truthy(r.verified),
            featured = util.truthy(r.featured),
            mode     = util.truthy(r.is_sprint) and 'sprint' or 'circuit',
            gates    = math.floor(tonumber(r.gate_count) or #gates),
            coords   = coords,
            heading  = heading,
        }
        list[#list + 1] = entry
        byId[entry.id] = entry
    end

    trackList, trackById = list, byId
    return list, byId
end

---One page of tracks with each track's finish count, plus the total the filter matched. The sort
---word is mapped through TRACK_ORDER, so nothing the client sent is ever concatenated into SQL.
---@param opts { query: string|nil, sort: string|nil, verifiedOnly: boolean|nil, page: integer|nil, perPage: integer|nil, includeUnpublished: boolean|nil }
---@return table[] rows { id, name, citizenid, author_name, gate_count, is_sprint, verified, featured, published, plays, created_at }
---@return integer total rows the filter matched
function store.tracksPage(opts)
    opts = type(opts) == 'table' and opts or {}

    local order   = TRACK_ORDER[opts.sort] or TRACK_ORDER.name
    local perPage = sizeOf(opts.perPage, TRACK_PAGE)
    local page    = pageOf(opts.page)
    local unpub   = opts.includeUnpublished and 1 or 0
    local only    = opts.verifiedOnly and 1 or 0
    local like    = likeFor(opts.query)

    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_racing_tracks t WHERE %s'):format(TRACK_FILTER),
        { unpub, only, like, like })) or 0
    if total == 0 then return {}, 0 end

    local rows = MySQL.query.await(([[
        SELECT t.id, t.name, t.citizenid, t.author_name, t.gate_count, t.is_sprint,
               t.verified, t.featured, t.published,
               UNIX_TIMESTAMP(t.created_at) AS created_at,
               COALESCE(p.plays, 0) AS plays
        FROM phone_racing_tracks t
        LEFT JOIN (
            SELECT track_id, COUNT(*) AS plays
            FROM phone_racing_results
            WHERE dnf = 0
            GROUP BY track_id
        ) p ON p.track_id = t.id
        WHERE %s
        ORDER BY %s
        LIMIT ? OFFSET ?
    ]]):format(TRACK_FILTER, order),
        { unpub, only, like, like, perPage, (page - 1) * perPage }) or {}

    local out = {}
    for i = 1, #rows do
        local r = rows[i]
        out[i] = {
            id          = math.floor(tonumber(r.id) or 0),
            name        = r.name or '',
            citizenid   = (r.citizenid and r.citizenid ~= '') and r.citizenid or nil,
            author_name = r.author_name or '',
            gate_count  = math.floor(tonumber(r.gate_count) or 0),
            is_sprint   = util.truthy(r.is_sprint),
            verified    = util.truthy(r.verified),
            featured    = util.truthy(r.featured),
            published   = util.truthy(r.published),
            plays       = math.floor(tonumber(r.plays) or 0),
            created_at  = math.floor(tonumber(r.created_at) or 0),
        }
    end
    return out, total
end

---One track row exactly as it is stored, TINYINT flags included: a caller reading `verified`,
---`featured`, `published`, `is_sprint` or `deleted` off this row puts it through util.truthy.
---@param trackId integer|string
---@return table|nil row
function store.trackRow(trackId)
    local id = idOf(trackId)
    if not id then return nil end
    return MySQL.single.await('SELECT * FROM phone_racing_tracks WHERE id = ?', { id })
end

---Inserts a track built in the creator: published straight away but unverified, so an admin still
---has to pass it before the generator can schedule a race on it. The gate count is denormalised
---here so no later read has to measure the JSON.
---@param name string display name, already capped by the caller
---@param isSprint boolean point to point rather than a circuit
---@param gates table[] `{ {ax,ay,az}, {bx,by,bz} }` per gate, already validated
---@param citizenid string|nil creator, nil for a track the server generated
---@param authorName string|nil creator's display name at the time
---@return integer|nil id new row id
function store.createTrack(name, isSprint, gates, citizenid, authorName)
    local id = MySQL.insert.await([[
        INSERT INTO phone_racing_tracks
            (name, citizenid, author_name, checkpoints, gate_count, is_sprint, published, verified)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0)
    ]], {
        name,
        citizenid,
        util.limitedString(authorName, 64) or '',
        json.encode(gates),
        #gates,
        isSprint and 1 or 0,
    })
    if id then store.invalidateTrackCache() end
    return id
end

---Sets one of the three admin flags on a track.
---@param trackId integer|string
---@param flag 'verified'|'featured'|'published'
---@param value boolean
---@return boolean changed false for an unknown flag, an unknown track, or a value already set
function store.setTrackFlag(trackId, flag, value)
    local id     = idOf(trackId)
    local column = TRACK_FLAGS[flag]
    if not id or not column then return false end

    local changed = tonumber(MySQL.update.await(
        ('UPDATE phone_racing_tracks SET `%s` = ? WHERE id = ?'):format(column),
        { value and 1 or 0, id })) or 0
    if changed > 0 then store.invalidateTrackCache() end
    return changed > 0
end

---Retires a track: it leaves every list, but the row and its results stay, so this is reversible
---by hand with `published = 1, deleted = 0`.
---@param trackId integer|string
---@return boolean removed
function store.softDeleteTrack(trackId)
    local id = idOf(trackId)
    if not id then return false end

    local changed = tonumber(MySQL.update.await(
        'UPDATE phone_racing_tracks SET published = 0, deleted = 1 WHERE id = ?', { id })) or 0
    if changed > 0 then store.invalidateTrackCache() end
    return changed > 0
end

---A track's route in the layout the race client and the map both read: one nine-number array per
---gate, the centre first and then each edge. Empty when the track or its JSON is unusable.
---@param trackId integer|string
---@return number[][] points `{ midX, midY, midZ, aX, aY, aZ, bX, bY, bZ }` per gate
function store.routeFor(trackId)
    local id = idOf(trackId)
    if not id then return {} end

    local gates = decodeGates(MySQL.scalar.await(
        'SELECT checkpoints FROM phone_racing_tracks WHERE id = ?', { id }))

    local points = {}
    for i = 1, #gates do
        local gate = gates[i]
        local a    = type(gate) == 'table' and gate[1] or nil
        local ax   = type(a) == 'table' and tonumber(a[1]) or nil
        local ay   = type(a) == 'table' and tonumber(a[2]) or nil
        if ax and ay then
            local az = tonumber(a[3]) or 0.0
            local b  = gate[2]
            local bx = type(b) == 'table' and tonumber(b[1]) or nil
            local by = type(b) == 'table' and tonumber(b[2]) or nil
            if bx and by then
                local bz = tonumber(b[3]) or 0.0
                points[#points + 1] = {
                    (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2,
                    ax, ay, az,
                    bx, by, bz,
                }
            else
                points[#points + 1] = { ax, ay, az, ax, ay, az, ax, ay, az }
            end
        end
    end
    return points
end

---Finish counts per track for the tracks list, cached briefly because it aggregates the whole
---results table. Rebuilt on demand and dropped by every saved result.
---@return table<string, integer> counts track id as a string -> non-DNF finishes
function store.playCounts()
    local now = GetGameTimer()
    if playCounts and (now - playCountsAt) < CACHE_TTL_MS then return playCounts end

    local rows = MySQL.query.await([[
        SELECT track_id, COUNT(*) AS plays
        FROM phone_racing_results
        WHERE dnf = 0
        GROUP BY track_id
    ]]) or {}

    local map = {}
    for i = 1, #rows do
        map[tostring(rows[i].track_id)] = math.floor(tonumber(rows[i].plays) or 0)
    end

    playCounts, playCountsAt = map, now
    return map
end

---Normalises a raw profile row: empty strings become nil so a caller can test one field.
---@param cid string citizenid
---@param row table|nil
---@return table|nil
local function shapeProfile(cid, row)
    if not row then return nil end
    return {
        citizenid = cid,
        name      = (row.name and row.name ~= '') and row.name or nil,
        alias     = (row.alias and row.alias ~= '') and row.alias or nil,
        avatar    = (row.avatar and row.avatar ~= '') and row.avatar or nil,
        mmr       = math.floor(tonumber(row.mmr) or BASE_MMR),
        hud       = (row.hud and row.hud ~= '') and row.hud or nil,
    }
end

---Reads a profile straight from the database.
---@param cid string citizenid
---@return table|nil
local function readProfile(cid)
    return shapeProfile(cid, MySQL.single.await(
        'SELECT name, alias, avatar, mmr, hud FROM phone_racing_profiles WHERE citizenid = ?', { cid }))
end

---A racer's profile, created at the configured base rating the first time they are seen.
---@param citizenid string
---@return table row { citizenid, name, alias, avatar, mmr, hud }
function store.profileRow(citizenid)
    local existing = readProfile(citizenid)
    if existing then return existing end

    MySQL.query.await(
        'INSERT IGNORE INTO phone_racing_profiles (citizenid, mmr) VALUES (?, ?)',
        { citizenid, BASE_MMR })
    store.invalidateLeaderboard()

    return readProfile(citizenid) or {
        citizenid = citizenid,
        mmr       = BASE_MMR,
    }
end

---Stores the character name the board falls back to when a racer has set no alias.
---@param citizenid string
---@param name string|nil
function store.saveProfileName(citizenid, name)
    MySQL.query.await([[
        INSERT INTO phone_racing_profiles (citizenid, name, mmr) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
    ]], { citizenid, name, BASE_MMR })
    store.invalidateLeaderboard()
end

---Stores a racer's chosen alias and avatar. Either may be nil to clear it.
---@param citizenid string
---@param alias string|nil
---@param avatar string|nil
function store.saveIdentity(citizenid, alias, avatar)
    MySQL.query.await([[
        INSERT INTO phone_racing_profiles (citizenid, alias, avatar, mmr) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE alias = VALUES(alias), avatar = VALUES(avatar)
    ]], { citizenid, alias, avatar, BASE_MMR })
    store.invalidateLeaderboard()
end

---Stores a racer's HUD settings as the caller encoded them. nil clears the row back to the
---frontend's defaults.
---@param citizenid string
---@param hudJson string|nil already-encoded settings blob
function store.saveHud(citizenid, hudJson)
    MySQL.query.await([[
        INSERT INTO phone_racing_profiles (citizenid, hud, mmr) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE hud = VALUES(hud)
    ]], { citizenid, hudJson, BASE_MMR })
end

---Stores a racer's rating.
---@param citizenid string
---@param mmr integer
function store.saveMmr(citizenid, mmr)
    MySQL.query.await([[
        INSERT INTO phone_racing_profiles (citizenid, mmr) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE mmr = VALUES(mmr)
    ]], { citizenid, math.floor(tonumber(mmr) or BASE_MMR) })
    store.invalidateLeaderboard()
end

---A racer's place on the board: one more than the number of racers rated strictly above them, so
---ties share a place. nil when they have no profile row yet.
---@param citizenid string
---@return integer|nil rank
function store.rankOf(citizenid)
    local mmr = MySQL.scalar.await(
        'SELECT mmr FROM phone_racing_profiles WHERE citizenid = ?', { citizenid })
    if mmr == nil then return nil end

    local higher = MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_racing_profiles WHERE mmr > ?', { mmr })
    return (tonumber(higher) or 0) + 1
end

---Rebuilds the ranked board, or serves the cached one. Capped at BOARD_MAX rows because the race
---and win counts aggregate the whole results table, which is far too much work to repeat per open.
---@return table[] rows
local function rankedBoard()
    local now = GetGameTimer()
    if board and (now - boardAt) < CACHE_TTL_MS then return board end

    local rows = MySQL.query.await([[
        SELECT p.citizenid, p.mmr,
               COALESCE(NULLIF(p.alias, ''), NULLIF(p.name, ''), 'Racer') AS display_name,
               COALESCE(r.races, 0) AS races,
               COALESCE(r.wins, 0)  AS wins
        FROM phone_racing_profiles p
        LEFT JOIN (
            SELECT citizenid,
                   SUM(dnf = 0) AS races,
                   SUM(dnf = 0 AND position = 1) AS wins
            FROM phone_racing_results
            GROUP BY citizenid
        ) r ON r.citizenid = p.citizenid
        ORDER BY p.mmr DESC, display_name ASC
        LIMIT ?
    ]], { BOARD_MAX }) or {}

    local out = {}
    for i = 1, #rows do
        local r = rows[i]
        out[i] = {
            rank      = i,
            citizenid = r.citizenid,
            name      = r.display_name or 'Racer',
            mmr       = math.floor(tonumber(r.mmr) or 0),
            races     = math.floor(tonumber(r.races) or 0),
            wins      = math.floor(tonumber(r.wins) or 0),
        }
    end

    board, boardAt = out, now
    return out
end

---One page of the ranked board. Rows are copies, so a caller stamping a "this is you" marker on one
---cannot leak that marker into the next player's page through the cache.
---@param page integer 1-based
---@param perPage integer|nil rows per page, defaulted from config
---@return table[] rows { rank, citizenid, name, mmr, races, wins }
---@return integer total ranked racers the board holds
function store.leaderboardPage(page, perPage)
    local rows  = rankedBoard()
    local size  = sizeOf(perPage, RANK_PAGE)
    local first = (pageOf(page) - 1) * size + 1
    local last  = math.min(#rows, first + size - 1)

    local out = {}
    for i = first, last do
        local r = rows[i]
        out[#out + 1] = {
            rank      = r.rank,
            citizenid = r.citizenid,
            name      = r.name,
            mmr       = r.mmr,
            races     = r.races,
            wins      = r.wins,
        }
    end
    return out, #rows
end

---The citizenid behind a display name: the racer whose alias or character name matches, and on a
---tie the higher rated of them. nil when nothing matches.
---@param alias string
---@return string|nil citizenid
function store.resolveByAlias(alias)
    if type(alias) ~= 'string' or alias == '' then return nil end
    return MySQL.scalar.await([[
        SELECT citizenid FROM phone_racing_profiles
        WHERE alias = ? OR name = ?
        ORDER BY mmr DESC
        LIMIT 1
    ]], { alias, alias })
end

---Records one finished race, DNFs included. The caller has already derived the elapsed time and the
---rating change; nothing here recomputes them.
---@param result { trackId: integer, citizenid: string, name: string|nil, timeMs: integer|nil, vehicle: string|nil, class: string|nil, position: integer|nil, racers: integer|nil, mmrDelta: integer|nil, mmrAfter: integer|nil, dnf: boolean|nil, ranked: boolean|nil }
function store.saveResult(result)
    MySQL.insert.await([[
        INSERT INTO phone_racing_results
            (track_id, citizenid, name, time_ms, vehicle, class, position, racers,
             mmr_delta, mmr_after, dnf, ranked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        math.floor(tonumber(result.trackId) or 0),
        result.citizenid,
        util.limitedString(result.name, 64) or '',
        math.max(0, math.floor(tonumber(result.timeMs) or 0)),
        util.limitedString(result.vehicle, 64),
        util.limitedString(result.class, 4),
        intOrNil(result.position),
        intOrNil(result.racers),
        intOrNil(result.mmrDelta),
        intOrNil(result.mmrAfter),
        result.dnf and 1 or 0,
        result.ranked and 1 or 0,
    })

    -- Both caches carry a figure this row just moved: the track's play count, and the racer's race
    -- and win totals on the board.
    playCounts = nil
    store.invalidateLeaderboard()
end

---Everything the track detail pane shows: how often the track has been run, the time spent on it,
---the last seven days of finishes, and the record board (each racer's best time, fastest first).
---@param trackId integer|string
---@return table|nil detail { timesPlayed, totalTimeSec, chart, fastestSec, holder, records }
function store.trackDetail(trackId)
    local id = idOf(trackId)
    if not id then return nil end

    local stats = MySQL.single.await([[
        SELECT COUNT(*) AS played, COALESCE(SUM(time_ms), 0) AS total_ms
        FROM phone_racing_results
        WHERE track_id = ? AND dnf = 0
    ]], { id }) or {}

    local chart = { 0, 0, 0, 0, 0, 0, 0 }
    local days  = MySQL.query.await([[
        SELECT DATEDIFF(CURDATE(), DATE(finished_at)) AS days_ago, COUNT(*) AS finishes
        FROM phone_racing_results
        WHERE track_id = ? AND dnf = 0 AND finished_at >= CURDATE() - INTERVAL 6 DAY
        GROUP BY days_ago
    ]], { id }) or {}
    for i = 1, #days do
        local slot = 7 - (tonumber(days[i].days_ago) or 0)
        if slot >= 1 and slot <= 7 then chart[slot] = math.floor(tonumber(days[i].finishes) or 0) end
    end

    local rows = MySQL.query.await([[
        SELECT citizenid, name, time_ms, vehicle, class,
               UNIX_TIMESTAMP(finished_at) AS at
        FROM phone_racing_results
        WHERE track_id = ? AND dnf = 0
        ORDER BY time_ms ASC, id ASC
        LIMIT ?
    ]], { id, RECORD_SCAN }) or {}

    local records, seen = {}, {}
    for i = 1, #rows do
        local r = rows[i]
        if not seen[r.citizenid] then
            seen[r.citizenid] = true
            records[#records + 1] = {
                rank      = #records + 1,
                racer     = (r.name and r.name ~= '') and r.name or 'Racer',
                citizenid = r.citizenid,
                timeSec   = (tonumber(r.time_ms) or 0) / 1000,
                vehicle   = (r.vehicle and r.vehicle ~= '') and r.vehicle or 'Unknown',
                class     = (r.class and r.class ~= '') and r.class or 'D',
                at        = math.floor(tonumber(r.at) or 0),
            }
            if #records >= RECORD_ROWS then break end
        end
    end

    return {
        timesPlayed  = math.floor(tonumber(stats.played) or 0),
        totalTimeSec = math.floor((tonumber(stats.total_ms) or 0) / 1000),
        chart        = chart,
        fastestSec   = records[1] and records[1].timeSec or 0,
        holder       = records[1] and records[1].racer or nil,
        records      = records,
    }
end

---Everything the racer profile shows, aggregated from that racer's stored finishes. Rows written
---before a column existed simply drop out of the averages and the chart.
---@param citizenid string
---@param currentMmr integer live rating, the chart's end point
---@return table data { mmr, racesCompleted, racesWon, racesDnf, avgPosition, mostUsedVehicle, totalTimeSec, chart, pastRaces }
function store.racerProfile(citizenid, currentMmr)
    local mmr = math.floor(tonumber(currentMmr) or BASE_MMR)

    local agg = MySQL.single.await([[
        SELECT COALESCE(SUM(dnf = 0), 0) AS races,
               COALESCE(SUM(dnf = 1), 0) AS dnfs,
               COALESCE(SUM(dnf = 0 AND position = 1), 0) AS wins,
               AVG(CASE WHEN dnf = 0 THEN position END) AS avg_pos,
               COALESCE(SUM(CASE WHEN dnf = 0 THEN time_ms ELSE 0 END), 0) AS total_ms
        FROM phone_racing_results
        WHERE citizenid = ?
    ]], { citizenid }) or {}

    local topVehicle = MySQL.single.await([[
        SELECT vehicle, COUNT(*) AS used
        FROM phone_racing_results
        WHERE citizenid = ? AND vehicle IS NOT NULL AND vehicle <> '' AND vehicle <> 'Unknown'
        GROUP BY vehicle
        ORDER BY used DESC
        LIMIT 1
    ]], { citizenid })

    -- Ranked rows only: an unranked custom race moves nothing, so charting it would draw a flat
    -- step that never happened.
    local rated = MySQL.query.await([[
        SELECT mmr_after, mmr_delta
        FROM phone_racing_results
        WHERE citizenid = ? AND ranked = 1 AND mmr_after IS NOT NULL
        ORDER BY finished_at DESC, id DESC
        LIMIT ?
    ]], { citizenid, CHART_ROWS }) or {}

    local chart = {}
    for i = #rated, 1, -1 do chart[#chart + 1] = math.floor(tonumber(rated[i].mmr_after) or 0) end
    if #rated > 0 then
        local oldest = rated[#rated]
        table.insert(chart, 1, math.floor((tonumber(oldest.mmr_after) or 0) - (tonumber(oldest.mmr_delta) or 0)))
    end
    if #chart == 0 or chart[#chart] ~= mmr then chart[#chart + 1] = mmr end
    if #chart == 1 then table.insert(chart, 1, chart[1]) end

    local recent = MySQL.query.await([[
        SELECT r.position, r.mmr_delta, r.vehicle, r.dnf, r.ranked,
               UNIX_TIMESTAMP(r.finished_at) AS at,
               t.name AS track_name, t.is_sprint
        FROM phone_racing_results r
        LEFT JOIN phone_racing_tracks t ON t.id = r.track_id
        WHERE r.citizenid = ?
        ORDER BY r.finished_at DESC, r.id DESC
        LIMIT ?
    ]], { citizenid, PAST_RACES }) or {}

    local pastRaces = {}
    for i = 1, #recent do
        local r = recent[i]
        pastRaces[i] = {
            trackName = (r.track_name and r.track_name ~= '') and r.track_name or 'Unknown Track',
            mode      = util.truthy(r.is_sprint) and 'sprint' or 'circuit',
            position  = intOrNil(r.position),
            delta     = intOrNil(r.mmr_delta),
            dnf       = util.truthy(r.dnf),
            ranked    = util.truthy(r.ranked),
            vehicle   = (r.vehicle and r.vehicle ~= '') and r.vehicle or 'Unknown',
            at        = math.floor(tonumber(r.at) or 0),
        }
    end

    local avgPos = tonumber(agg.avg_pos)
    return {
        mmr             = mmr,
        racesCompleted  = math.floor(tonumber(agg.races) or 0),
        racesWon        = math.floor(tonumber(agg.wins) or 0),
        racesDnf        = math.floor(tonumber(agg.dnfs) or 0),
        avgPosition     = avgPos and lib.math.round(avgPos, 1) or 0,
        mostUsedVehicle = (topVehicle and topVehicle.vehicle) or 'Unknown',
        totalTimeSec    = math.floor((tonumber(agg.total_ms) or 0) / 1000),
        chart           = chart,
        pastRaces       = pastRaces,
    }
end

return store
