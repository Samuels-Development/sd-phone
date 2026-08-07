---@type table Player bridge (bridge.server.player): citizenid and display-name lookups.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): envelopes, string caps, rate limits.
local util   = require 'server.util'
---@type table Racing persistence (server.racing.store): tracks, profiles, results.
local store  = require 'server.racing.store'
---@type table Racing config (configs/racing.lua): classes, vehicles, limits, aces.
local config = require 'configs.racing'

---@type table Actions module; the table returned at end of file.
local actions = {}

local ok, fail = util.ok, util.fail

---@type table|nil Race lobbies (server.racing.racegen), resolved on first use. racegen reads the
---class resolver below at load, so taking it at file scope here would close the require loop.
local racegen
---@type table|nil Live race state (server.racing.races), resolved on first use, same reason.
local races

---@return table racegen
local function lobbies()
    racegen = racegen or require 'server.racing.racegen'
    return racegen
end

---@return table races
local function running()
    races = races or require 'server.racing.races'
    return races
end

---@type table<string, integer> Race-class ladder, lowest to highest. A race's class is a ceiling,
---so an S race admits every vehicle while a C race admits only C and D.
local CLASS_RANK = { D = 1, C = 2, B = 3, A = 4, S = 5 }

---@type table Class definitions (Config.Classes), defaulted so a config without the block loads.
local CLASSES  = type(config.Classes) == 'table' and config.Classes or {}
---@type table Vehicle-to-class mapping (Config.Vehicles).
local VEHICLES = type(config.Vehicles) == 'table' and config.Vehicles or {}
---@type table Validation caps (Config.Limits).
local LIMITS   = type(config.Limits) == 'table' and config.Limits or {}
---@type table Rolling-window budgets (Config.RateLimits).
local RATES    = type(config.RateLimits) == 'table' and config.RateLimits or {}
---@type table Track creator settings (Config.Creator).
local CREATOR  = type(config.Creator) == 'table' and config.Creator or {}
---@type table Admin gate (Config.Admin).
local ADMIN    = type(config.Admin) == 'table' and config.Admin or {}

---@type integer Rating a racer starts on (Config.MMR.Base).
local BASE_MMR = math.floor(tonumber((config.MMR or {}).Base) or 1000)

---@type integer Highest page number any paged read will honour. A page past the end simply reads
---empty, so this only bounds the OFFSET a client can ask the database to skip.
local MAX_PAGE = 500

---Whole number from a config or client value, falling back when it is unusable.
---@param v any
---@param fallback integer
---@return integer
local function int(v, fallback)
    local n = tonumber(v)
    if not util.finite(n) then return fallback end
    return math.floor(n)
end

---A 1-based page number from a client value.
---@param v any
---@return integer page
local function pageOf(v)
    local n = int(v, 1)
    if n < 1 then return 1 end
    if n > MAX_PAGE then return MAX_PAGE end
    return n
end

---A positive integer track id from a client value, or nil when it is not one.
---@param v any
---@return integer|nil
local function idOf(v)
    local n = tonumber(v)
    if not util.finite(n) then return nil end
    n = math.floor(n)
    return n > 0 and n or nil
end

---Coerces a stored timestamp (seconds or milliseconds) to whole seconds; 0 when absent.
---@param v any
---@return integer seconds
local function seconds(v)
    local n = tonumber(v)
    if not util.finite(n) then return 0 end
    if n > 1e11 then n = n / 1000 end
    return math.floor(n)
end

---Applies one of the Config.RateLimits budgets. A block the config does not define never refuses.
---@param cid string|nil citizenid the budget is keyed on
---@param key string limiter name
---@param bucket table|nil { window, max }
---@return boolean allowed
local function budget(cid, key, bucket)
    if type(bucket) ~= 'table' then return true end
    return util.rateLimit(cid, key, bucket.window, bucket.max)
end

---Wraps a hash to the unsigned 32-bit range. joaat hands back unsigned values while the client's
---GetEntityModel can hand back the signed form of the same hash, and both must land on one key.
---@param n number
---@return integer
local function u32(n)
    return math.floor(n) % 0x100000000
end

---@type table<integer, string> Model hash to class letter, built once from Config.Vehicles.Models
---so resolving a joiner's class is a table read rather than a walk over model names.
local MODEL_CLASS = {}
for model, class in pairs(VEHICLES.Models or {}) do
    if CLASS_RANK[class] then MODEL_CLASS[u32(joaat(model))] = class end
end

---@type table<integer, string> GTA vehicle class to race class, for models with no override.
local NATIVE_CLASS = type(VEHICLES.FromNativeClass) == 'table' and VEHICLES.FromNativeClass or {}
---@type string Class a model falls back to when nothing else matches.
local DEFAULT_CLASS = CLASS_RANK[VEHICLES.Default] and VEHICLES.Default or 'D'

---@type table<string, table> Class catalog the tablet renders from, rebuilt so a config field the
---frontend does not know about never reaches it.
local CLASS_CATALOG = {}
for letter, def in pairs(CLASSES) do
    if CLASS_RANK[letter] and type(def) == 'table' then
        CLASS_CATALOG[letter] = {
            level = int(def.level, 1),
            label = type(def.label) == 'string' and def.label or letter,
            color = type(def.color) == 'string' and def.color or '#9ca3af',
        }
    end
end

---@type table Numeric bounds the race-setup form clamps against, mirrored to the tablet so it can
---refuse a bad value before the round trip. The server clamps again regardless.
local LIMIT_CATALOG = {
    delayMin    = int(LIMITS.DelayMin, 10),
    delayMax    = int(LIMITS.DelayMax, 600),
    lapsMin     = int(LIMITS.LapsMin, 1),
    lapsMax     = int(LIMITS.LapsMax, 20),
    buyInMin    = int(LIMITS.BuyInMin, 0),
    buyInMax    = int(LIMITS.BuyInMax, 100000),
    phaseSecMin = int(LIMITS.PhaseSecMin, 5),
    phaseSecMax = int(LIMITS.PhaseSecMax, 300),
}

---@type string Ace that grants the Racing admin tools.
local ADMIN_ACE = type(ADMIN.Ace) == 'string' and ADMIN.Ace or 'command.racingadmin'
---@type table<string, boolean> Raw identifiers (license:, steam:, ...) granted admin in config.
local ADMIN_IDS = {}
for _, id in ipairs(ADMIN.Identifiers or {}) do
    if type(id) == 'string' then ADMIN_IDS[id] = true end
end

---@type string Ace that grants the in-game track creator and the save it posts.
local CREATOR_ACE = type(CREATOR.Ace) == 'string' and CREATOR.Ace or 'command.createtrack'

---@type table<string, boolean> Sort keys the tracks list accepts, whitelisted here so no client
---string ever reaches an ORDER BY.
local TRACK_SORTS = { name = true, plays = true, gates = true, newest = true }

---@type table<string, boolean> Track flags the admin pane may toggle, whitelisted for the same reason.
local TRACK_FLAGS = { verified = true, featured = true, published = true }

---@type table<string, boolean> HUD layouts the driver page offers.
local HUD_STYLES = { simple = true, casual = true, advanced = true }

---@type table<string, boolean> The nine HUD anchors.
local HUD_ANCHORS = {
    ['top-left']    = true, ['top-center']    = true, ['top-right']    = true,
    ['middle-left'] = true, ['middle-center'] = true, ['middle-right'] = true,
    ['bottom-left'] = true, ['bottom-center'] = true, ['bottom-right'] = true,
}

---@type table HUD every driver starts on, mirroring DEFAULT_HUD on the frontend.
local HUD_DEFAULT = {
    style           = 'casual',
    position        = 'top-left',
    scale           = 1.15,
    checkpointColor = '#0BF2B4',
    closestColor    = '#FFD60A',
    inAirWaypoints  = true,
}

---@type number, number HUD scale bounds, mirroring HUD_SCALE_MIN/MAX on the frontend.
local HUD_SCALE_MIN, HUD_SCALE_MAX = 0.7, 1.8

---@type string Refusal for a caller whose character has not finished loading.
local LOADING = 'Your character is still loading'
---@type string Refusal for a track that is gone, unpublished, or was never a real id.
local NO_TRACK = 'That track is no longer available'
---@type string Refusal for a caller who is not an Racing admin.
local NOT_ADMIN = 'You are not allowed to manage tracks'

---Whether a value is a usable CSS hex colour (3 or 6 digits).
---@param v any
---@param fallback string
---@return string
local function hexColor(v, fallback)
    if type(v) ~= 'string' then return fallback end
    local s = util.trim(v)
    if s:match('^#%x%x%x$') or s:match('^#%x%x%x%x%x%x$') then return s end
    return fallback
end

---Normalises a stored or client-supplied HUD block field by field against the defaults, so a
---partial, stale or hostile blob still produces a HUD the overlay can render.
---@param v any
---@return table hud
local function hudFrom(v)
    local t     = type(v) == 'table' and v or {}
    local scale = tonumber(t.scale)
    if not util.finite(scale) then scale = HUD_DEFAULT.scale end
    return {
        style           = HUD_STYLES[t.style] and t.style or HUD_DEFAULT.style,
        position        = HUD_ANCHORS[t.position] and t.position or HUD_DEFAULT.position,
        scale           = math.min(HUD_SCALE_MAX, math.max(HUD_SCALE_MIN, scale)),
        checkpointColor = hexColor(t.checkpointColor, HUD_DEFAULT.checkpointColor),
        closestColor    = hexColor(t.closestColor, HUD_DEFAULT.closestColor),
        inAirWaypoints  = t.inAirWaypoints ~= false,
    }
end

---The HUD stored on a profile row, defaulted when the column is empty or holds unusable JSON.
---@param row table profile row from store.profileRow
---@return table hud
local function hudOf(row)
    if type(row.hud) ~= 'string' or row.hud == '' then return hudFrom(nil) end
    local decoded, value = pcall(json.decode, row.hud)
    return hudFrom(decoded and value or nil)
end

---The name a racer is listed under: their chosen alias, then their character name.
---@param row table profile row
---@return string
local function displayName(row)
    return row.alias or row.name or 'Unknown'
end

---The caller's citizenid, or nil while their character is still loading.
---@param src integer player server id
---@return string|nil
local function cidOf(src)
    return player.getIdentifier(src)
end

---Builds one TrackRow from a stored row, folding in the start coords the track cache derives.
---@param row table stored track row
---@param byId table<string, table>|nil track cache index
---@return table trackRow
local function trackRow(row, byId)
    local id     = int(row.id, 0)
    local cached = byId and byId[tostring(id)] or nil
    local author = row.author_name
    return {
        id       = id,
        name     = row.name or '',
        author   = (type(author) == 'string' and author ~= '') and author or 'Unknown',
        mode     = util.truthy(row.is_sprint) and 'sprint' or 'circuit',
        gates    = int(row.gate_count, 0),
        plays    = int(row.plays, 0),
        verified = util.truthy(row.verified),
        featured = util.truthy(row.featured),
        coords   = cached and cached.coords or nil,
    }
end

---The race class a vehicle model belongs to. The only class resolver on the server: every caller
---sends a model hash and this decides, so a client can never name its own class.
---@param modelHash any joaat hash of the vehicle model, signed or unsigned
---@return string class 'D'|'C'|'B'|'A'|'S'
function actions.classForModel(modelHash)
    local hash = tonumber(modelHash)
    if not util.finite(hash) or hash == 0 then return DEFAULT_CLASS end

    local override = MODEL_CLASS[u32(hash)]
    if override then return override end

    -- Only newer server builds carry the model-name class lookup; without it every model that has
    -- no explicit override falls to the configured default rather than erroring.
    if type(GetVehicleClassFromName) == 'function' then
        local called, native = pcall(GetVehicleClassFromName, math.floor(hash))
        if called and NATIVE_CLASS[native] then return NATIVE_CLASS[native] end
    end
    return DEFAULT_CLASS
end

---Where a class sits on the ladder. An unknown letter reads as the lowest rung, so it can only
---ever be admitted, never used to enter a race above its station.
---@param class any
---@return integer rank
function actions.classRank(class)
    return CLASS_RANK[class] or 1
end

---Whether a player may use the Racing admin tools: the configured ace, or one of their identifiers
---listed in Config.Admin.Identifiers. Console is refused. Re-checked inside every admin handler.
---@param src integer player server id
---@return boolean
function actions.isAdmin(src)
    if type(src) ~= 'number' or src <= 0 then return false end
    if IsPlayerAceAllowed(src, ADMIN_ACE) then return true end
    if next(ADMIN_IDS) == nil then return false end
    for _, id in ipairs(GetPlayerIdentifiers(src) or {}) do
        if ADMIN_IDS[id] then return true end
    end
    return false
end

---Whether a player may save tracks built with the in-game creator.
---@param src integer player server id
---@return boolean
local function canCreate(src)
    if CREATOR.Enabled == false then return false end
    if type(src) ~= 'number' or src <= 0 then return false end
    return IsPlayerAceAllowed(src, CREATOR_ACE) == true
end

---Everything the tablet needs to render its shell: the caller's driver card, their HUD, the two
---gates the UI hides tabs behind, and the catalogs its forms are built from.
---@param src integer player server id
---@return table envelope
function actions.bootstrap(src)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end

    local row  = store.profileRow(cid)
    local name = player.getName(src)
    if type(name) == 'string' and name ~= '' and row.name ~= name then
        store.saveProfileName(cid, name)
        row.name = name
    end

    return ok({
        me = {
            citizenid = cid,
            name      = row.name or 'Unknown',
            alias     = row.alias,
            avatar    = row.avatar,
            mmr       = int(row.mmr, BASE_MMR),
            rank      = store.rankOf(cid),
        },
        hud     = hudOf(row),
        admin   = actions.isAdmin(src),
        creator = canCreate(src),
        classes = CLASS_CATALOG,
        limits  = LIMIT_CATALOG,
    })
end

---Every lobby the caller can see, with their own registration folded into each card.
---@param src integer player server id
---@return table envelope
function actions.races(src)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end
    return ok({ races = lobbies().payload(cid) })
end

---One page of the track list.
---@param src integer player server id
---@param payload table { query, sort, verifiedOnly, page }
---@return table envelope
function actions.tracks(src, payload)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end

    local rows, total = store.tracksPage({
        query              = util.limitedString(payload.query, 64),
        sort               = TRACK_SORTS[payload.sort] and payload.sort or 'name',
        verifiedOnly       = payload.verifiedOnly == true,
        page               = pageOf(payload.page),
        perPage            = int(LIMITS.TracksPerPage, 20),
        includeUnpublished = false,
    })

    local _, byId = store.trackCache()
    local out = {}
    for i = 1, #rows do out[i] = trackRow(rows[i], byId) end
    return ok({ rows = out, total = int(total, #out) })
end

---One track's record board, play chart and totals.
---@param _ integer player server id
---@param payload table { trackId }
---@return table envelope
function actions.track(_, payload)
    local trackId = idOf(payload.trackId)
    if not trackId then return fail(NO_TRACK) end

    local row = store.trackRow(trackId)
    if not row or util.truthy(row.deleted) then return fail(NO_TRACK) end

    local detail = store.trackDetail(trackId)
    if not detail then return fail(NO_TRACK) end

    local _, byId = store.trackCache()
    row.plays = store.playCounts()[tostring(trackId)] or detail.timesPlayed or 0

    return ok({
        track        = trackRow(row, byId),
        timesPlayed  = int(detail.timesPlayed, 0),
        totalTimeSec = int(detail.totalTimeSec, 0),
        chart        = detail.chart or {},
        fastestSec   = tonumber(detail.fastestSec) or 0,
        holder       = detail.holder,
        records      = detail.records or {},
    })
end

---A track's gate list as map points. The store hands back the flat client layout, so the shape the
---tablet draws from is built here rather than duplicated in the query.
---@param _ integer player server id
---@param payload table { trackId }
---@return table envelope
function actions.trackRoute(_, payload)
    local trackId = idOf(payload.trackId)
    if not trackId then return ok({ points = {} }) end

    local points, out = store.routeFor(trackId) or {}, {}
    for i = 1, #points do
        local p = points[i]
        out[i] = {
            x  = p[1], y  = p[2], z  = p[3],
            ax = p[4], ay = p[5], az = p[6],
            bx = p[7], by = p[8], bz = p[9],
        }
    end
    return ok({ points = out })
end

---One page of the ranked board. The caller's own row rides along separately when it falls outside
---the page they are looking at, so the tablet can pin it without paging blindly to find it.
---@param src integer player server id
---@param payload table { page }
---@return table envelope
function actions.rankings(src, payload)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end

    local perPage     = int(LIMITS.RanksPerPage, 25)
    local page        = pageOf(payload.page)
    local rows, total = store.leaderboardPage(page, perPage)
    local offset      = (page - 1) * perPage

    local out, onPage = {}, false
    for i = 1, #rows do
        local r    = rows[i]
        local mine = r.citizenid == cid
        onPage     = onPage or mine
        out[i] = {
            rank      = int(r.rank, offset + i),
            citizenid = r.citizenid,
            name      = r.name or 'Unknown',
            mmr       = int(r.mmr, BASE_MMR),
            races     = int(r.races, 0),
            wins      = int(r.wins, 0),
            you       = mine,
        }
    end

    local me
    if not onPage then
        local row     = store.profileRow(cid)
        local mmr     = int(row.mmr, BASE_MMR)
        local totals  = store.racerProfile(cid, mmr) or {}
        me = {
            rank      = store.rankOf(cid) or (int(total, #out) + 1),
            citizenid = cid,
            name      = displayName(row),
            mmr       = mmr,
            races     = int(totals.racesCompleted, 0),
            wins      = int(totals.racesWon, 0),
            you       = true,
        }
    end

    return ok({ rows = out, total = int(total, #out), me = me })
end

---One racer's card: totals, rating history and their recent races.
---@param _ integer player server id
---@param payload table { citizenid }
---@return table envelope
function actions.racer(_, payload)
    local cid = util.limitedString(payload.citizenid, 64)
    if not cid or not cid:match('^[%w%-_:%.]+$') then return fail('That racer could not be found') end

    local row  = store.profileRow(cid)
    local mmr  = int(row.mmr, BASE_MMR)
    local data = store.racerProfile(cid, mmr) or {}

    return ok({
        citizenid       = cid,
        name            = row.name or 'Unknown',
        alias           = row.alias,
        avatar          = row.avatar,
        mmr             = mmr,
        rank            = store.rankOf(cid),
        racesCompleted  = int(data.racesCompleted, 0),
        racesWon        = int(data.racesWon, 0),
        racesDnf        = int(data.racesDnf, 0),
        avgPosition     = tonumber(data.avgPosition) or 0,
        mostUsedVehicle = data.mostUsedVehicle or '',
        totalTimeSec    = int(data.totalTimeSec, 0),
        chart           = data.chart or {},
        pastRaces       = data.pastRaces or {},
    })
end

---A live race's start point and current order, for the spectate button.
---@param src integer player server id
---@param payload table { raceId }
---@return table envelope
function actions.spectate(src, payload)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end

    local race = type(payload.raceId) == 'string' and lobbies().get(payload.raceId) or nil
    if not race then return fail('That race has already finished') end

    local standings = running().standingsFor(race.id)
    return ok({ start = race.start, standings = type(standings) == 'table' and standings or {} })
end

---Sets or clears the caller's racing alias. An alias that trims to nothing clears it.
---@param src integer player server id
---@param payload table { alias }
---@return table envelope
function actions.setAlias(src, payload)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end
    if not budget(cid, 'racing:identity', RATES.Identity) then
        return fail('Too many profile changes, wait a moment')
    end

    local alias = util.limitedString(payload.alias, int(LIMITS.AliasMax, 24))
    local row   = store.profileRow(cid)
    store.saveIdentity(cid, alias, row.avatar)
    return ok({ alias = alias })
end

---Sets or clears the caller's avatar. Only https links are stored: the tablet renders the URL
---straight into an image, so a plain http one would be a mixed-content hole.
---@param src integer player server id
---@param payload table { avatar }
---@return table envelope
function actions.setAvatar(src, payload)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end
    if not budget(cid, 'racing:identity', RATES.Identity) then
        return fail('Too many profile changes, wait a moment')
    end

    local avatar = util.limitedString(payload.avatar, int(LIMITS.AvatarUrlMax, 500))
    if avatar and not avatar:match('^https://') then
        return fail('Avatar links have to start with https://')
    end

    local row = store.profileRow(cid)
    store.saveIdentity(cid, row.alias, avatar)
    return ok({ avatar = avatar })
end

---Saves the caller's HUD settings. Every field is clamped to its own enum or range before it is
---encoded, so what comes back is always renderable whatever was posted.
---@param src integer player server id
---@param payload table { hud }
---@return table envelope
function actions.setHud(src, payload)
    local cid = cidOf(src)
    if not cid then return fail(LOADING) end
    if not budget(cid, 'racing:identity', RATES.Identity) then
        return fail('Too many profile changes, wait a moment')
    end

    local raw = util.smallTable(payload.hud, 16, 2048)
    if not raw then return fail('Those HUD settings could not be saved') end

    local hud = hudFrom(raw)
    store.saveHud(cid, json.encode(hud))
    return ok({ hud = hud })
end

---Saves a track recorded with the in-game creator. The ace is re-checked here because the callback
---is reachable by any client regardless of who was allowed to run the command.
---@param src integer player server id
---@param payload table { name, mode, gates }
---@return table envelope
function actions.createTrack(src, payload)
    if CREATOR.Enabled == false then return fail('The track creator is switched off') end
    if not canCreate(src) then return fail('You are not allowed to create tracks') end

    local cid = cidOf(src)
    if not cid then return fail(LOADING) end
    if not budget(cid, 'racing:create', RATES.Create) then
        return fail('Too many tracks saved, wait a moment')
    end

    local name = util.limitedString(payload.name, int(LIMITS.TrackNameMax, 60))
    if not name then return fail('Give the track a name') end

    local recorded = type(payload.gates) == 'table' and payload.gates or nil
    if not recorded then return fail('That track has no gates') end

    local minGates, maxGates = int(CREATOR.MinGates, 2), int(CREATOR.MaxGates, 512)
    local count = #recorded
    if count < minGates then return fail(('A track needs at least %d gates'):format(minGates)) end
    if count > maxGates then return fail(('A track can hold at most %d gates'):format(maxGates)) end

    local gates = {}
    for i = 1, count do
        local gate = recorded[i]
        local a    = type(gate) == 'table' and gate[1] or nil
        local b    = type(gate) == 'table' and gate[2] or nil
        if type(a) ~= 'table' or type(b) ~= 'table' then return fail('That track has a damaged gate') end

        local ax, ay, az = tonumber(a[1]), tonumber(a[2]), tonumber(a[3])
        local bx, by, bz = tonumber(b[1]), tonumber(b[2]), tonumber(b[3])
        if not (util.finite(ax) and util.finite(ay) and util.finite(az)
            and util.finite(bx) and util.finite(by) and util.finite(bz)) then
            return fail('That track has a damaged gate')
        end
        gates[i] = { { ax, ay, az }, { bx, by, bz } }
    end

    local id = store.createTrack(name, payload.mode == 'sprint', gates, cid, player.getName(src) or '')
    if not id then return fail('That track could not be saved') end

    store.invalidateTrackCache()
    return ok({ id = id })
end

---One page of the admin track list, unpublished tracks included.
---@param src integer player server id
---@param payload table { query, page }
---@return table envelope
function actions.adminTracks(src, payload)
    if not actions.isAdmin(src) then return fail(NOT_ADMIN) end

    local rows, total = store.tracksPage({
        query              = util.limitedString(payload.query, 64),
        sort               = 'newest',
        verifiedOnly       = false,
        page               = pageOf(payload.page),
        perPage            = int(LIMITS.TracksPerPage, 20),
        includeUnpublished = true,
    })

    local _, byId = store.trackCache()
    local out = {}
    for i = 1, #rows do
        local raw = rows[i]
        local row = trackRow(raw, byId)
        row.published = raw.published == nil or util.truthy(raw.published)
        row.createdAt = seconds(raw.created_at)
        out[i] = row
    end
    return ok({ rows = out, total = int(total, #out) })
end

---Toggles one of a track's flags. The tablet hides the admin tab from everyone else, but that is
---presentation: this check is the wall.
---@param src integer player server id
---@param payload table { trackId, flag, value }
---@return table envelope
function actions.adminSetFlag(src, payload)
    if not actions.isAdmin(src) then return fail(NOT_ADMIN) end

    local cid = cidOf(src)
    if not budget(cid, 'racing:admin', RATES.Admin) then
        return fail('Too many changes, wait a moment')
    end

    local trackId = idOf(payload.trackId)
    if not trackId or not TRACK_FLAGS[payload.flag] then return fail(NO_TRACK) end
    if not store.setTrackFlag(trackId, payload.flag, payload.value == true) then
        return fail('That track could not be updated')
    end

    store.invalidateTrackCache()
    return ok()
end

---Unpublishes a track. The row and its results stay, so races already scheduled on it still run
---and the record board it earned is not lost.
---@param src integer player server id
---@param payload table { trackId }
---@return table envelope
function actions.adminDelete(src, payload)
    if not actions.isAdmin(src) then return fail(NOT_ADMIN) end

    local cid = cidOf(src)
    if not budget(cid, 'racing:admin', RATES.Admin) then
        return fail('Too many changes, wait a moment')
    end

    local trackId = idOf(payload.trackId)
    if not trackId then return fail(NO_TRACK) end
    if not store.softDeleteTrack(trackId) then return fail('That track could not be removed') end

    store.invalidateTrackCache()
    return ok()
end

return actions
