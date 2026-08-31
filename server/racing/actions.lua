---@type table Player bridge (bridge.server.player): citizenid and display-name lookups.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): envelopes, string caps, rate limits.
local util   = require 'server.util'
---@type table Racing persistence (server.racing.store): tracks, profiles, results.
local store  = require 'server.racing.store'
---@type table Racing config (configs/racing.lua): classes, vehicles, limits, aces.
local config = require 'configs.racing'
---@type table Toast bridge (bridge.server.notify): a live nudge for a creator who is online now.
local notify = require 'bridge.server.notify'
---@type table Notifications module (server.notifications.init): identity-addressed banner routing.
local notifications = require 'server.notifications.init'

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

---@type table Refusal for a caller whose character has not finished loading.
local LOADING = fail('racing.characterStillLoading', 'Your character is still loading')
---@type table Refusal for a track that is gone, unpublished, or was never a real id.
local NO_TRACK = fail('racing.trackNoLongerAvailable', 'That track is no longer available')
---@type table Refusal for a caller who is not an Racing admin.
local NOT_ADMIN = fail('racing.notAllowedManageTracks', 'You are not allowed to manage tracks')

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
        scale           = lib.math.clamp(scale, HUD_SCALE_MIN, HUD_SCALE_MAX),
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

---Whether a player holds the creator Ace. Separate from canCreate below because the two questions
---diverge once Access is 'everyone': holding the ace no longer decides whether someone may create
---a track, only whether the one they create publishes immediately or lands in the pending queue.
---@param src integer player server id
---@return boolean
local function hasCreatorAce(src)
    if type(src) ~= 'number' or src <= 0 then return false end
    -- Truthy, NOT `== true`. This native answers with the NUMBER 1, and `1 == true` is false in
    -- Lua, so the strict comparison refused every player who genuinely held the ace: the command
    -- itself is gated by FiveM's own restricted-command check and let them through, and only this
    -- re-check at save time turned them away. isAdmin above tests the same native truthily.
    return IsPlayerAceAllowed(src, CREATOR_ACE) and true or false
end

---Whether a player may open the creator and save tracks with it at all. 'everyone' access still
---respects the master Enabled switch and still needs a real player id; it just drops the ace check
---that 'ace' access (the default) requires.
---@param src integer player server id
---@return boolean
local function canCreate(src)
    if CREATOR.Enabled == false then return false end
    if type(src) ~= 'number' or src <= 0 then return false end
    if CREATOR.Access == 'everyone' then return true end
    return hasCreatorAce(src)
end

---Public alias of the check above: the phone's "Start creating" button opens the same recorder the
---/createtrack command does, so init.lua re-checks the same rule here before it fires the client
---event, rather than trusting the button having been hidden from an unprivileged caller.
---@param src integer player server id
---@return boolean
actions.canCreate = canCreate

---Whether a creator's tracks skip the queue and publish the moment they are saved. Admins are
---trusted because they are the same people the queue would send the track to, so making them wait
---on their own review buys nothing. The creator Ace stays a second trusted path, for a server that
---wants named track makers publishing straight away without handing them the admin panel too.
---@param src integer player server id
---@return boolean
local function isTrustedCreator(src)
    if actions.isAdmin(src) then return true end
    return hasCreatorAce(src)
end

---Whether a track src is about to create needs admin approval before it goes live: true only when
---Access is 'everyone' and this particular caller is not a trusted creator. An 'ace' server gates
---creation on the Ace up front, so nobody who reaches the creator there is ever untrusted.
---@param src integer player server id
---@return boolean
local function needsApproval(src)
    return CREATOR.Access == 'everyone' and not isTrustedCreator(src)
end

---Everything the tablet needs to render its shell: the caller's driver card, their HUD, the two
---gates the UI hides tabs behind, and the catalogs its forms are built from.
---@param src integer player server id
---@return table envelope
function actions.bootstrap(src)
    local cid = cidOf(src)
    if not cid then return LOADING end

    local row  = store.profileRow(cid)
    local name = player.getName(src)
    if type(name) == 'string' and name ~= '' and row.name ~= name then
        store.saveProfileName(cid, name)
        row.name = name
    end

    local pending = store.pendingNotifications(cid)
    for i = 1, #pending do
        local notif    = pending[i]
        local approved = notif.notification_type == 'approved'
        local title    = approved and ('Track approved: ' .. notif.track_name)
            or ('Track rejected: ' .. notif.track_name)
        local body = approved and 'Your track passed review and is now live.'
            or ('Rejected: ' .. (notif.rejection_reason or 'See details in app'))
        notifications.notifyCid(cid, {
            app   = 'Racing',
            appId = 'racing',
            title = title,
            body  = body,
        })
        store.markNotificationDelivered(notif.id)
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
        -- Whether a track this player creates right now would need admin approval, so the
        -- create-track sheet can tell them upfront instead of surprising them after they save.
        creatorNeedsApproval = needsApproval(src),
        classes = CLASS_CATALOG,
        limits  = LIMIT_CATALOG,
    })
end

---Every lobby the caller can see, with their own registration folded into each card.
---@param src integer player server id
---@return table envelope
function actions.races(src)
    local cid = cidOf(src)
    if not cid then return LOADING end
    return ok({ races = lobbies().payload(cid) })
end

---One page of the track list.
---@param src integer player server id
---@param payload table { query, sort, verifiedOnly, page }
---@return table envelope
function actions.tracks(src, payload)
    local cid = cidOf(src)
    if not cid then return LOADING end

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
    if not trackId then return NO_TRACK end

    local row = store.trackRow(trackId)
    if not row or util.truthy(row.deleted) then return NO_TRACK end

    local detail = store.trackDetail(trackId)
    if not detail then return NO_TRACK end

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

---The caller's best lap on a track and the splits that made it, for the HUD's live delta. Answers
---with an empty table rather than a refusal when they have never set one: a racer on a new track
---simply has nothing to chase yet.
---@param source number player server id
---@param payload table client-supplied { trackId }
---@return table envelope on success data = { lapMs, sectors }
function actions.personalBest(source, payload)
    local trackId = idOf(payload.trackId)
    if not trackId then return ok({}) end

    local cid = player.getIdentifier(source)
    if not cid then return ok({}) end

    local best = store.personalBest(trackId, cid)
    if not best then return ok({}) end
    return ok({ lapMs = best.lapMs, sectors = best.sectors })
end

---One page of the ranked board. The caller's own row rides along separately when it falls outside
---the page they are looking at, so the tablet can pin it without paging blindly to find it.
---@param src integer player server id
---@param payload table { page }
---@return table envelope
function actions.rankings(src, payload)
    local cid = cidOf(src)
    if not cid then return LOADING end

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
    if not cid or not cid:match('^[%w%-_:%.]+$') then return fail('racing.racerCouldNotFound', 'That racer could not be found') end

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
    if not cid then return LOADING end

    local race = type(payload.raceId) == 'string' and lobbies().get(payload.raceId) or nil
    if not race then return fail('racing.raceHasAlreadyFinished', 'That race has already finished') end

    local standings = running().standingsFor(race.id)
    return ok({ start = race.start, standings = type(standings) == 'table' and standings or {} })
end

---Sets or clears the caller's racing alias. An alias that trims to nothing clears it.
---@param src integer player server id
---@param payload table { alias }
---@return table envelope
function actions.setAlias(src, payload)
    local cid = cidOf(src)
    if not cid then return LOADING end
    if not budget(cid, 'racing:identity', RATES.Identity) then
        return fail('racing.tooManyProfileChangesWait', 'Too many profile changes, wait a moment')
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
    if not cid then return LOADING end
    if not budget(cid, 'racing:identity', RATES.Identity) then
        return fail('racing.tooManyProfileChangesWait', 'Too many profile changes, wait a moment')
    end

    local avatar = util.limitedString(payload.avatar, int(LIMITS.AvatarUrlMax, 500))
    if avatar and not avatar:match('^https://') then
        return fail('racing.avatarLinksHaveStartWith', 'Avatar links have to start with https://')
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
    if not cid then return LOADING end
    if not budget(cid, 'racing:identity', RATES.Identity) then
        return fail('racing.tooManyProfileChangesWait', 'Too many profile changes, wait a moment')
    end

    local raw = util.smallTable(payload.hud, 16, 2048)
    if not raw then return fail('racing.thoseHudSettingsCouldNot', 'Those HUD settings could not be saved') end

    local hud = hudFrom(raw)
    store.saveHud(cid, json.encode(hud))
    return ok({ hud = hud })
end

---Saves a track recorded with the in-game creator. The ace is re-checked here because the callback
---is reachable by any client regardless of who was allowed to run the command.
---@param src integer player server id
---Checks one track payload against the creator's own rules: a usable name, a gate count inside
---CREATOR.MinGates/MaxGates, and two finite 3D points per gate. Shared by the in-world creator and
---the JSON importer so an imported track can never bypass a limit the creator enforces.
---@param payload table { name, mode, gates }
---@return string|nil name nil when the payload is unusable
---@return table|nil gates normalised gate list, nil when the payload is unusable
---@return table|nil refusal keyed refusal envelope, set only when name is nil
local function validateTrack(payload)
    if type(payload) ~= 'table' then
        return nil, nil, fail('racing.trackNotReadable', 'That track is not readable')
    end

    local name = util.limitedString(payload.name, int(LIMITS.TrackNameMax, 60))
    if not name then return nil, nil, fail('racing.giveTrackName', 'Give the track a name') end

    local recorded = type(payload.gates) == 'table' and payload.gates or nil
    if not recorded then return nil, nil, fail('racing.trackHasNoGates', 'That track has no gates') end

    local minGates, maxGates = int(CREATOR.MinGates, 2), int(CREATOR.MaxGates, 512)
    local count = #recorded
    if count < minGates then
        return nil, nil, fail('racing.trackNeedsLeastGates', 'A track needs at least {n} gates', { n = minGates })
    end
    if count > maxGates then
        return nil, nil, fail('racing.trackHoldAtMostGates', 'A track can hold at most {n} gates', { n = maxGates })
    end

    local gates = {}
    for i = 1, count do
        local gate = recorded[i]
        local a    = type(gate) == 'table' and gate[1] or nil
        local b    = type(gate) == 'table' and gate[2] or nil
        if type(a) ~= 'table' or type(b) ~= 'table' then
            return nil, nil, fail('racing.trackHasDamagedGate', 'That track has a damaged gate')
        end

        local ax, ay, az = tonumber(a[1]), tonumber(a[2]), tonumber(a[3])
        local bx, by, bz = tonumber(b[1]), tonumber(b[2]), tonumber(b[3])
        if not (util.finite(ax) and util.finite(ay) and util.finite(az)
            and util.finite(bx) and util.finite(by) and util.finite(bz)) then
            return nil, nil, fail('racing.trackHasDamagedGate', 'That track has a damaged gate')
        end
        gates[i] = { { ax, ay, az }, { bx, by, bz } }
    end
    return name, gates, nil
end

---@param payload table { name, mode, gates }
---@return table envelope
function actions.createTrack(src, payload)
    if CREATOR.Enabled == false then return fail('racing.trackCreatorSwitchedOff', 'The track creator is switched off') end
    if not canCreate(src) then return fail('racing.notAllowedCreateTracks', 'You are not allowed to create tracks') end

    local cid = cidOf(src)
    if not cid then return LOADING end
    if not budget(cid, 'racing:create', RATES.Create) then
        return fail('racing.tooManyTracksSavedWait', 'Too many tracks saved, wait a moment')
    end

    local name, gates, refusal = validateTrack(payload)
    if not name then return refusal end

    local publishStatus = needsApproval(src) and 'pending' or 'published'

    local id = store.createTrack(name, payload.mode == 'sprint', gates, cid, player.getName(src) or '', publishStatus)
    if not id then return fail('racing.trackCouldNotSaved', 'That track could not be saved') end

    store.invalidateTrackCache()
    local message = publishStatus == 'pending' and 'Track saved! Waiting for admin approval.' or 'Track saved!'
    return ok({ id = id, message = message })
end

---@type integer Tracks accepted in one import. A paste is a single deliberate act, so this is a
---guard against one call inserting thousands of rows, not a quota.
local IMPORT_MAX <const> = 50

---Normalises what an importer was handed into a list of track payloads. A single track object and
---an array of them are both accepted, so one file serves a player sharing one track and an owner
---seeding a pack.
---@param data any decoded JSON
---@return table[] list empty when nothing usable was passed
local function importList(data)
    if type(data) ~= 'table' then return {} end
    if data.gates ~= nil or data.name ~= nil then return { data } end

    local list = {}
    for i = 1, #data do
        if type(data[i]) == 'table' then list[#list + 1] = data[i] end
    end
    return list
end

---Fills the {placeholder} spans of a keyed refusal. The importer lists one plain reason per track
---rather than handing the NUI a key it could translate, so it resolves the English here.
---@param refusal table|nil refusal envelope from validateTrack
---@return string|nil reason
local function filled(refusal)
    local message = refusal and refusal.message
    if not message then return nil end
    local vars = refusal.messageVars
    if not vars then return message end
    return (message:gsub('{(%w+)}', function(name)
        local v = vars[name]
        return v ~= nil and tostring(v) or ('{' .. name .. '}')
    end))
end

---Imports one or more tracks from decoded JSON, credited to the given citizenid and author name.
---Every entry goes through the creator's own validation, so an import cannot save a track the
---creator would refuse. A bad entry is reported and skipped rather than failing the whole batch:
---a pack with one damaged track still lands the other forty-nine.
---@param data any decoded JSON: one track object or an array of them
---@param cid string|nil owning citizenid, nil for a server-side import with no owner
---@param authorName string credited author
---@return table result { imported = integer, failed = { index, name, reason }[] }
function actions.importTracks(data, cid, authorName)
    local list = importList(data)
    local result = { imported = 0, failed = {} }
    if #list == 0 then
        result.failed[1] = { index = 0, name = '', reason = 'No tracks found in that JSON' }
        return result
    end

    for i = 1, math.min(#list, IMPORT_MAX) do
        local entry = list[i]
        local name, gates, refusal = validateTrack(entry)
        if not name then
            result.failed[#result.failed + 1] = {
                index  = i,
                name   = type(entry) == 'table' and tostring(entry.name or '') or '',
                reason = filled(refusal) or 'That track is not readable',
            }
        else
            local id = store.createTrack(name, entry.mode == 'sprint', gates, cid, authorName)
            if id then
                result.imported = result.imported + 1
            else
                result.failed[#result.failed + 1] = { index = i, name = name, reason = 'That track could not be saved' }
            end
        end
    end

    if #list > IMPORT_MAX then
        result.failed[#result.failed + 1] = {
            index  = IMPORT_MAX + 1,
            name   = '',
            reason = ('Only the first %d tracks were imported'):format(IMPORT_MAX),
        }
    end

    if result.imported > 0 then store.invalidateTrackCache() end
    return result
end

---Player-facing import: the JSON arrives as text from the app's paste box. Held to the same gate
---as the in-world creator, since importing a track and recording one both add a row.
---@param src integer
---@param payload table { json: string }
---@return table
function actions.importTracksFor(src, payload)
    if CREATOR.Enabled == false then return fail('racing.trackCreatorSwitchedOff', 'The track creator is switched off') end
    if not canCreate(src) then return fail('racing.notAllowedCreateTracks', 'You are not allowed to create tracks') end

    local cid = cidOf(src)
    if not cid then return LOADING end
    if not budget(cid, 'racing:create', RATES.Create) then
        return fail('racing.tooManyTracksSavedWait', 'Too many tracks saved, wait a moment')
    end

    local text = type(payload) == 'table' and payload.json or nil
    if type(text) ~= 'string' or text == '' then return fail('racing.pasteTrackFirst', 'Paste a track first') end

    local okJson, decoded = pcall(json.decode, text)
    if not okJson or type(decoded) ~= 'table' then return fail('racing.notValidJson', 'That is not valid JSON') end

    local result = actions.importTracks(decoded, cid, player.getName(src) or '')
    if result.imported == 0 then
        local firstFailure = result.failed[1]
        if firstFailure then return fail(firstFailure.reason) end
        return fail('racing.nothingCouldImported', 'Nothing could be imported')
    end
    return ok(result)
end

---Exports a track as the JSON the importer accepts. Any track the caller can already see may be
---exported: a published track's gates are coordinates the player can drive past anyway.
---@param _ integer
---@param payload table { trackId }
---@return table
function actions.exportTrack(_, payload)
    local trackId = idOf(payload and payload.trackId)
    if not trackId then return NO_TRACK end

    local row = store.trackRow(trackId)
    if not row or util.truthy(row.deleted) then return NO_TRACK end

    local gates = store.gatesFor(trackId)
    if #gates == 0 then return fail('racing.trackHasNoGatesExport', 'That track has no gates to export') end

    return ok({ track = {
        name  = row.name or '',
        mode  = util.truthy(row.is_sprint) and 'sprint' or 'circuit',
        gates = gates,
    } })
end

---One page of the admin track list, unpublished tracks included.
---@param src integer player server id
---@param payload table { query, page }
---@return table envelope
function actions.adminTracks(src, payload)
    if not actions.isAdmin(src) then return NOT_ADMIN end

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
    if not actions.isAdmin(src) then return NOT_ADMIN end

    local cid = cidOf(src)
    if not budget(cid, 'racing:admin', RATES.Admin) then
        return fail('racing.tooManyChangesWaitMoment', 'Too many changes, wait a moment')
    end

    local trackId = idOf(payload.trackId)
    if not trackId or not TRACK_FLAGS[payload.flag] then return NO_TRACK end
    if not store.setTrackFlag(trackId, payload.flag, payload.value == true) then
        return fail('racing.trackCouldNotUpdated', 'That track could not be updated')
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
    if not actions.isAdmin(src) then return NOT_ADMIN end

    local cid = cidOf(src)
    if not budget(cid, 'racing:admin', RATES.Admin) then
        return fail('racing.tooManyChangesWaitMoment', 'Too many changes, wait a moment')
    end

    local trackId = idOf(payload.trackId)
    if not trackId then return NO_TRACK end
    if not store.softDeleteTrack(trackId) then return fail('racing.trackCouldNotRemoved', 'That track could not be removed') end

    store.invalidateTrackCache()
    return ok()
end

---Tells a track's creator what an admin decided. Notifications are saved to a persistent queue
---so they reach offline players when they log in. Mail is attempted as a secondary channel for
---players who have set up mail accounts. Toast is a best-effort nudge for online players.
---@param citizenid string|nil the track's creator; a nil or blank id (a server-generated track) is a no-op
---@param trackId integer track id for the notification
---@param trackName string track name for the notification
---@param notificationType 'approved'|'rejected'
---@param rejectionReason string|nil reason if rejected
---@param toast string toast shown if the creator happens to be online right now
---@param toastType 'success'|'error'
local function notifyCreator(citizenid, trackId, trackName, notificationType, rejectionReason, toast, toastType)
    if type(citizenid) ~= 'string' or citizenid == '' then return end

    store.saveNotification(citizenid, trackId, trackName, notificationType, rejectionReason)

    local subject, body
    if notificationType == 'approved' then
        subject = 'Track approved: ' .. trackName
        body = ('Your track "%s" passed review and is now live on the board.'):format(trackName)
    else
        subject = 'Track rejected: ' .. trackName
        body = ('Your track "%s" was not approved.\n\nReason: %s\n\nYou can make another one with the track creator.'):format(trackName, rejectionReason or 'No reason provided')
    end

    local addresses = exports[GetCurrentResourceName()]:getMailAddresses(citizenid)
    if type(addresses) == 'table' and #addresses > 0 then
        local to = {}
        for i = 1, #addresses do to[i] = addresses[i].email end
        exports[GetCurrentResourceName()]:sendMail({
            to      = to,
            from    = { name = 'Racing Board' },
            subject = subject,
            body    = body,
        })
    end

    local src = player.getSourceByIdentifier(citizenid)
    if src then notify.to(src, toast, toastType) end
end

---One page of the approval queue. Kept apart from adminTracks because a pending track is held
---out of every track list by design, the admin one included, so this is the only way to reach it.
---@param src integer player server id
---@param payload table { page }
---@return table envelope
function actions.adminPendingTracks(src, payload)
    if not actions.isAdmin(src) then return NOT_ADMIN end

    local rows, total = store.pendingTracksPage({
        page = pageOf(payload.page),
        perPage = int(LIMITS.TracksPerPage, 20),
    })

    local out = {}
    for i = 1, #rows do
        local raw = rows[i]
        out[i] = {
            id           = raw.id,
            name         = raw.name or '',
            author       = (raw.author_name and raw.author_name ~= '') and raw.author_name or 'Unknown',
            mode         = util.truthy(raw.is_sprint) and 'sprint' or 'circuit',
            gates        = math.floor(tonumber(raw.gate_count) or 0),
            citizenid    = raw.citizenid or '',
            createdAt    = seconds(raw.created_at),
            rejectionReason = raw.rejection_reason or nil,
        }
    end
    return ok({ rows = out, total = int(total, #out) })
end

---Publishes a track out of the approval queue and tells its creator. The store guards on the row
---still being pending, so two admins tapping at once refuses the second rather than notifying twice.
---@param src integer player server id
---@param payload table { trackId }
---@return table envelope
function actions.adminApproveTrack(src, payload)
    if not actions.isAdmin(src) then return NOT_ADMIN end

    local cid = cidOf(src)
    if not budget(cid, 'racing:admin', RATES.Admin) then
        return fail('racing.tooManyChangesWaitMoment', 'Too many changes, wait a moment')
    end

    local trackId = idOf(payload.trackId)
    if not trackId then return NO_TRACK end

    local row = store.trackRow(trackId)
    if not store.approveTrack(trackId) then
        return fail('racing.trackCouldNotApprovedNot', 'That track could not be approved (not pending)')
    end

    store.invalidateTrackCache()

    if row then
        local name = row.name or 'Your track'
        notifyCreator(row.citizenid, trackId, name, 'approved', nil,
            ('%s was approved and published.'):format(name), 'success')
    end

    return ok()
end

---Refuses a track out of the approval queue, with a reason the creator is told. The reason is
---required: a refusal the creator cannot act on is worse than no answer at all.
---@param src integer player server id
---@param payload table { trackId, reason }
---@return table envelope
function actions.adminRejectTrack(src, payload)
    if not actions.isAdmin(src) then return NOT_ADMIN end

    local cid = cidOf(src)
    if not budget(cid, 'racing:admin', RATES.Admin) then
        return fail('racing.tooManyChangesWaitMoment', 'Too many changes, wait a moment')
    end

    local trackId = idOf(payload.trackId)
    if not trackId then return NO_TRACK end

    local reason = util.limitedString(payload.reason, 500)
    if not reason then return fail('racing.rejectionReasonRequired', 'A rejection reason is required') end

    local row = store.trackRow(trackId)
    if not store.rejectTrack(trackId, reason) then
        return fail('racing.trackCouldNotRejectedNot', 'That track could not be rejected (not pending)')
    end

    store.invalidateTrackCache()

    if row then
        local name = row.name or 'Your track'
        notifyCreator(row.citizenid, trackId, name, 'rejected', reason,
            ('%s was rejected: %s'):format(name, reason), 'error')
    end

    return ok()
end

return actions
