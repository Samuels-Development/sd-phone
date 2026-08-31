---@type table Shared server helpers (server.util): envelopes, finite checks, rate limits.
local util    = require 'server.util'
---@type table Racing persistence (server.racing.store): the cached published-track list.
local store   = require 'server.racing.store'
---@type table Racing handlers (server.racing.actions): the server-side class resolver.
local actions = require 'server.racing.actions'
---@type table Racing config (configs/racing.lua): the generator, classes and lobby limits.
local config  = require 'configs.racing'

---@type table Lobby registry; the table returned at end of file.
local racegen = {}

---@type table|nil Live race state (server.racing.races), resolved on first use. That module takes
---this one at load to drive its dispatcher, so the money calls below cannot take it at file scope.
local races

---@return table races
local function running()
    races = races or require 'server.racing.races'
    return races
end

---@type table Generator settings (Config.RaceGen), defaulted so a config without the block loads.
local GEN     = type(config.RaceGen) == 'table' and config.RaceGen or {}
---@type table Class definitions (Config.Classes).
local CLASSES = type(config.Classes) == 'table' and config.Classes or {}
---@type table Validation caps (Config.Limits).
local LIMITS  = type(config.Limits) == 'table' and config.Limits or {}
---@type table Rolling-window budgets (Config.RateLimits).
local RATES   = type(config.RateLimits) == 'table' and config.RateLimits or {}
---@type table Ranked-event settings (Config.Ranked): phasing and the forced camera.
local RANKED  = type(config.Ranked) == 'table' and config.Ranked or {}

---@type table<string, boolean> Camera options the race-setup screen may pick.
local CAMERAS = { none = true, first = true, third = true }

---@type string Client event prefix every Racing push goes out under.
local EV = 'sd-phone:client:racing:'

---@type integer Seconds a dispatched race stays listed before the emptiness check can retire it.
---Its run is opened immediately after collectStarting returns, so a sweep landing in that gap
---would otherwise drop the race the moment it went live.
local LIVE_GRACE = 15

---@type integer Hard ceiling on how long a live race stays listed, whatever its run reports.
local LIVE_MAX_AGE = math.max(60, math.floor(tonumber((config.Race or {}).RunMaxAgeSeconds) or 3600))

---@type integer How long the seeder waits for the first verified track before giving up and
---leaving the interval loop to pick it up (ms).
local SEED_WAIT_MS = 20000

---@type string[] Name halves generated races are built from.
local PREFIXES = type(GEN.NamePrefixes) == 'table' and GEN.NamePrefixes or { 'Apex' }
local SUFFIXES = type(GEN.NameSuffixes) == 'table' and GEN.NameSuffixes or { 'Run' }

---@type table<string, table> Lobbies open for registration, keyed by race id.
local Races = {}
---@type table<string, table> Races whose start has been dispatched, kept while their run is still
---going so the tablet can list and spectate them.
local Live = {}
---@type integer Monotonic race-id counter.
local counter = 0

---Whole number from a config or client value, falling back when it is unusable.
---@param v any
---@param fallback integer
---@return integer
local function int(v, fallback)
    local n = tonumber(v)
    if not util.finite(n) then return fallback end
    return math.floor(n)
end

---A whole number from a client value, clamped into a range.
---@param v any
---@param low integer
---@param high integer
---@param fallback integer
---@return integer
local function clamp(v, low, high, fallback)
    local n = int(v, fallback)
    if n < low then return low end
    if n > high then return high end
    return n
end

---@param a integer
---@param b integer
---@return integer
local function rnd(a, b)
    if b < a then return a end
    return math.random(a, b)
end

---@param t table
---@return any
local function pick(t)
    return t[math.random(#t)]
end

---@type fun(t: table): table Fisher-Yates shuffle, in place, returning the same table. ox_lib's is
---the same algorithm down to the draw order, so the sequence for a given RNG state is unchanged.
local shuffle = lib.table.shuffle

---Applies one of the Config.RateLimits budgets. A block the config does not define never refuses.
---@param cid string|nil citizenid the budget is keyed on
---@param key string limiter name
---@param bucket table|nil { window, max }
---@return boolean allowed
local function budget(cid, key, bucket)
    if type(bucket) ~= 'table' then return true end
    return util.rateLimit(cid, key, bucket.window, bucket.max)
end

---Tells every phone on the server that the lobby list moved.
local function broadcastChanged()
    TriggerClientEvent(EV .. 'racesChanged', -1)
end

---Every configured class letter.
---@return string[]
local function classKeys()
    local keys = {}
    for letter in pairs(CLASSES) do keys[#keys + 1] = letter end
    if #keys == 0 then keys[1] = 'D' end
    return keys
end

---The configured ranked phasing, validated into a (mode, seconds) pair.
---@return string mode 'off'|'full'|'timed'
---@return integer seconds
local function rankedPhasing()
    local phasing = type(RANKED.Phasing) == 'table' and RANKED.Phasing or {}
    local mode    = (phasing.mode == 'off' or phasing.mode == 'timed') and phasing.mode or 'full'
    return mode, math.max(1, int(phasing.seconds, 30))
end

---The camera mode generated races enforce.
---@return string camera 'none'|'first'|'third'
local function rankedCamera()
    return (RANKED.Camera == 'first' or RANKED.Camera == 'third') and RANKED.Camera or 'none'
end

---Lap count for a generated circuit, sized to the track: aims for Laps.TargetCheckpoints gates per
---race and clamps to Laps.min/max, so a short loop runs several laps while a long one runs once.
---@param gates integer the track's gate count
---@return integer laps
local function circuitLaps(gates)
    local laps   = type(GEN.Laps) == 'table' and GEN.Laps or {}
    local low    = math.max(1, int(laps.min, 1))
    local high   = math.max(low, int(laps.max, 4))
    local target = tonumber(laps.TargetCheckpoints)
    if not target or gates <= 0 then return rnd(low, high) end

    local count = lib.math.round(target / gates)
    if count < low then return low end
    if count > high then return high end
    return count
end

---Prize pool for a generated race, scaled by length and class: (Base + PerCheckpoint x gates x
---laps) x the class multiplier, jittered, then rounded to the nearest $50.
---@param class string race class letter
---@param gates integer
---@param laps integer
---@return integer pool
local function rankedPrizePool(class, gates, laps)
    local prize = type(GEN.PrizePool) == 'table' and GEN.PrizePool or {}
    local base  = tonumber(prize.Base) or 1000
    local per   = tonumber(prize.PerCheckpoint) or 60
    local mult  = (type(prize.ClassMultiplier) == 'table' and tonumber(prize.ClassMultiplier[class])) or 1.0
    local pool  = (base + per * gates * laps) * mult

    local jitter = tonumber(prize.Jitter) or 0
    if jitter > 0 then pool = pool * (1 + (math.random() * 2 - 1) * jitter) end
    return math.max(0, lib.math.round(pool / 50) * 50)
end

---Rough race length in kilometres, from the gate count. Cosmetic: the tablet shows it next to the
---lap count, and no real distance is ever measured along the route.
---@param gates integer
---@param laps integer
---@return number
local function distanceOf(gates, laps)
    return tonumber(('%.1f'):format(gates * 0.2 * laps)) or 0.0
end

---Published tracks eligible for generation: verified only, unless the config opts out. Ranked
---events should not run on tracks nobody has vetted.
---@return table[] tracks
local function eligibleTracks()
    local list = store.trackCache()
    if GEN.VerifiedOnly == false then return list end

    local out = {}
    for i = 1, #list do
        if list[i].verified then out[#out + 1] = list[i] end
    end
    return out
end

---Creates and stores one lobby on a track, starting `startInSeconds` from now.
---@param track table cached track entry from store.trackCache
---@param startInSeconds integer
---@param class string|nil race class letter; random when nil
---@return table race
local function createRace(track, startInSeconds, class)
    counter = counter + 1

    local id                     = 'gen_' .. counter
    local mode                   = track.mode == 'sprint' and 'sprint' or 'circuit'
    local gates                  = math.max(0, int(track.gates, 0))
    local laps                   = mode == 'sprint' and 1 or circuitLaps(gates)
    local letter                 = class or pick(classKeys())
    local phasingMode, phasingSeconds = rankedPhasing()
    local fee                    = type(GEN.EntryFee) == 'table' and GEN.EntryFee or {}
    local grid                   = type(GEN.MaxRacers) == 'table' and GEN.MaxRacers or {}
    local seed                   = type(GEN.BaseRegistered) == 'table' and GEN.BaseRegistered or {}

    local race = {
        id             = id,
        name           = pick(PREFIXES) .. ' ' .. pick(SUFFIXES),
        trackId        = int(track.id, 0),
        trackName      = track.name or '',
        author         = track.author or 'Unknown',
        class          = letter,
        mode           = mode,
        laps           = laps,
        gates          = gates,
        entryFee       = rnd(int(fee.min, 250), int(fee.max, 2500)),
        prizePool      = rankedPrizePool(letter, gates, laps),
        maxRacers      = math.max(1, rnd(int(grid.min, 6), int(grid.max, 16))),
        baseRegistered = math.max(0, rnd(int(seed.min, 0), int(seed.max, 0))),
        phasingMode    = phasingMode,
        phasingSeconds = phasingSeconds,
        camera         = rankedCamera(),
        startsAt       = os.time() + startInSeconds,
        start          = track.coords and { x = track.coords.x, y = track.coords.y, z = track.coords.z or 0.0 } or nil,
        heading        = track.heading,
        members        = {},
        joinedCount    = 0,
        isCustom       = false,
    }

    Races[id] = race
    return race
end

---Generates one batch, each race on a track no other race in the batch uses.
---@return integer generated
local function generateBatch()
    local tracks = eligibleTracks()
    if #tracks == 0 then return 0 end

    local pool = {}
    for i = 1, #tracks do pool[i] = tracks[i] end
    shuffle(pool)

    local low   = math.max(1, int(GEN.StartsInMinMinutes, 10))
    local high  = math.max(low, int(GEN.StartsInMaxMinutes, 75))
    local count = lib.math.clamp(int(GEN.RacesPerBatch, 10), 0, #pool)
    for i = 1, count do
        createRace(pool[i], rnd(low, high) * 60)
    end
    return count
end

---Drops lobbies whose start has been dispatched or whose start time is well past, and retires live
---races once their run reports nothing left to show.
local function prune()
    local now = os.time()
    for id, race in pairs(Races) do
        if race.startedFired or race.startsAt <= now - 5 then Races[id] = nil end
    end

    for id, race in pairs(Live) do
        local age = now - (race.liveAt or race.startsAt)
        if age > LIVE_GRACE then
            local called, standings = pcall(running().standingsFor, id)
            local over = not called or type(standings) ~= 'table' or #standings == 0
            if over or age > LIVE_MAX_AGE then Live[id] = nil end
        end
    end
end

---Seats a racer, remembering which account their buy-in came out of so a refund can go back there.
---@param race table
---@param cid string
---@param account string|nil
local function addMember(race, cid, account)
    if race.members[cid] then return end
    race.members[cid] = account or true
    race.joinedCount  = race.joinedCount + 1
end

---Frees a racer's seat.
---@param race table
---@param cid string
local function removeMember(race, cid)
    if not race.members[cid] then return end
    race.members[cid] = nil
    race.joinedCount  = math.max(0, race.joinedCount - 1)
end

---One lobby as the tablet renders it.
---@param race table
---@param cid string citizenid the `joined` flag is answered for
---@param status string 'registering'|'live'
---@return table card
local function cardFor(race, cid, status)
    local def = CLASSES[race.class]
    return {
        id            = race.id,
        name          = race.name,
        trackId       = race.trackId,
        trackName     = race.trackName,
        author        = race.author,
        class         = race.class,
        mode          = race.mode,
        status        = status,
        laps          = race.laps,
        gates         = race.gates,
        distance      = distanceOf(race.gates, race.laps),
        startsAt      = race.startsAt,
        entryFee      = race.entryFee,
        prizePool     = race.isCustom and (race.entryFee * race.joinedCount) or race.prizePool,
        maxRacers     = race.maxRacers,
        registered    = math.min(race.maxRacers, race.baseRegistered + race.joinedCount),
        joined        = race.members[cid] ~= nil,
        custom        = race.isCustom == true,
        phasing       = race.phasingMode,
        camera        = race.camera,
        requiredLevel = (type(def) == 'table' and int(def.level, 1)) or 1,
        start         = race.start,
    }
end

---One lobby by id, live races included so a spectator can still resolve a race that has begun.
---@param raceId any
---@return table|nil race
function racegen.get(raceId)
    if type(raceId) ~= 'string' then return nil end
    return Races[raceId] or Live[raceId]
end

---@param race table
---@return boolean
function racegen.hasStarted(race)
    return race.startedFired == true or race.startsAt <= os.time()
end

---@param race table
---@param cid string
---@return boolean
function racegen.isMember(race, cid)
    return race.members[cid] ~= nil
end

---The account a member's buy-in was taken from ('cash'|'bank'), or nil when it was free.
---@param race table
---@param cid string
---@return string|nil
function racegen.memberAccount(race, cid)
    local account = race.members[cid]
    return type(account) == 'string' and account or nil
end

---Real racers only: the seeded count is a display flourish, and counting it here would hand a
---generated race a grid of players who do not exist and turn anyone away behind them.
---@param race table
---@return boolean
function racegen.isFull(race)
    return race.joinedCount >= race.maxRacers
end

---Every lobby the caller can see, soonest first.
---@param cid string citizenid
---@return table[] races
function racegen.payload(cid)
    prune()

    local out = {}
    for _, race in pairs(Races) do out[#out + 1] = cardFor(race, cid, 'registering') end
    for _, race in pairs(Live)  do out[#out + 1] = cardFor(race, cid, 'live') end

    table.sort(out, function(a, b)
        if a.startsAt ~= b.startsAt then return a.startsAt < b.startsAt end
        return a.id < b.id
    end)
    return out
end

---Lobbies close enough to the green light to be worth standing a board at, each carrying the start
---point and the bearing down the first gate so the client can face the board at oncoming traffic.
---Live races are excluded: a board is a sign-up post, and sign-ups have closed by then.
---@param cid string citizenid
---@return table[] boards
function racegen.boards(cid)
    prune()

    local now  = os.time()
    local lead = math.max(0, int(GEN.BoardLeadMinutes, 5)) * 60

    local out = {}
    for _, race in pairs(Races) do
        local due = int(race.startsAt, 0) - now
        if race.start and due <= lead then
            local card = cardFor(race, cid, 'registering')
            card.heading = race.heading
            out[#out + 1] = card
        end
    end

    table.sort(out, function(a, b)
        if a.startsAt ~= b.startsAt then return a.startsAt < b.startsAt end
        return a.id < b.id
    end)
    return out
end

---Registers the caller for a lobby and takes their buy-in. The only place an entry fee is ever
---charged: if anything after the debit refuses the seat, the money goes back in the same call.
---@param src integer player server id
---@param cid string citizenid
---@param raceId any
---@param modelHash any joaat hash of the vehicle they are sitting in, 0 on foot
---@return table envelope
function racegen.join(src, cid, raceId, modelHash)
    local race = racegen.get(raceId)
    if not race then return util.fail('racing.raceNoLongerAvailable', 'That race is no longer available') end
    if racegen.hasStarted(race) then return util.fail('racing.raceHasAlreadyStarted', 'That race has already started') end
    if racegen.isMember(race, cid) then return util.fail('racing.alreadyRegisteredRace', 'You are already registered for that race') end
    if racegen.isFull(race) then return util.fail('racing.raceFull', 'That race is full') end

    local mine = actions.classForModel(modelHash)
    if actions.classRank(mine) > actions.classRank(race.class) then
        return util.fail('racing.vehicleClassRaceTopsOut', 'Your vehicle is class {yours} and this race tops out at class {max}', { yours = mine, max = race.class })
    end

    if not budget(cid, 'racing:join', RATES.Join) then
        return util.fail('racing.tooManyRaceSignUps', 'Too many race sign-ups, wait a moment')
    end

    local fee = math.max(0, int(race.entryFee, 0))
    local paid, account = running().chargeBuyIn(src, cid, fee)
    if not paid then return util.fail('racing.cannotAffordBuyRace', 'You cannot afford the buy-in for that race') end

    addMember(race, cid, account)
    if not racegen.isMember(race, cid) then
        if fee > 0 then running().refundBuyIn(src, account, fee) end
        return util.fail('racing.couldNotRegisteredRace', 'You could not be registered for that race')
    end

    broadcastChanged()
    return util.ok({ races = racegen.payload(cid), start = race.start })
end

---Gives up a seat and pays the buy-in back to the account it came from.
---@param src integer player server id
---@param cid string citizenid
---@param raceId any
---@return table envelope
function racegen.leave(src, cid, raceId)
    local race = racegen.get(raceId)
    if not race or not racegen.isMember(race, cid) then
        return util.fail('racing.notRegisteredRace', 'You are not registered for that race')
    end
    if racegen.hasStarted(race) then return util.fail('racing.raceHasAlreadyStarted', 'That race has already started') end
    if not budget(cid, 'racing:leave', RATES.Leave) then
        return util.fail('racing.tooManyChangesWaitMoment', 'Too many changes, wait a moment')
    end

    local account = racegen.memberAccount(race, cid)
    local fee     = math.max(0, int(race.entryFee, 0))
    removeMember(race, cid)
    if fee > 0 then running().refundBuyIn(src, account, fee) end

    broadcastChanged()
    return util.ok({ races = racegen.payload(cid) })
end

---Opens a lobby on a specific track with the caller's own settings. The host is NOT seated: like
---everyone else they join, and pay, from the race card.
---@param src integer player server id
---@param cid string citizenid
---@param payload table { trackId, delay, laps, phasing, phasingSeconds, buyIn, vehicleClass, camera }
---@return table envelope
function racegen.host(src, cid, payload)
    local trackId = tonumber(payload.trackId)
    if not util.finite(trackId) then return util.fail('racing.trackNoLongerAvailable', 'That track is no longer available') end

    local _, byId = store.trackCache()
    local track   = byId[tostring(math.floor(trackId))]
    if not track then return util.fail('racing.trackNoLongerAvailable', 'That track is no longer available') end

    if not budget(cid, 'racing:host', RATES.Host) then
        return util.fail('racing.tooManyRacesHostedWait', 'Too many races hosted, wait a moment')
    end

    local delay   = clamp(payload.delay, int(LIMITS.DelayMin, 10), int(LIMITS.DelayMax, 600), 30)
    local laps    = clamp(payload.laps, int(LIMITS.LapsMin, 1), int(LIMITS.LapsMax, 20), 1)
    local buyIn   = clamp(payload.buyIn, int(LIMITS.BuyInMin, 0), int(LIMITS.BuyInMax, 100000), 0)
    local phasing = (payload.phasing == 'off' or payload.phasing == 'timed') and payload.phasing or 'full'
    local seconds = phasing == 'timed'
        and clamp(payload.phasingSeconds, int(LIMITS.PhaseSecMin, 5), int(LIMITS.PhaseSecMax, 300), 30)
        or 0

    -- 'all' is the setup screen's open-to-everyone option, which is the top of the ladder: a class
    -- ceiling of S admits every vehicle.
    local class = payload.vehicleClass == 'all' and 'S'
        or (CLASSES[payload.vehicleClass] and payload.vehicleClass)
        or 'S'

    local race = createRace(track, delay, class)
    race.name           = track.name or race.name
    race.laps           = race.mode == 'sprint' and 1 or laps
    race.entryFee       = buyIn
    race.prizePool      = 0
    race.baseRegistered = 0
    race.phasingMode    = phasing
    race.phasingSeconds = seconds
    race.camera         = CAMERAS[payload.camera] and payload.camera or 'none'
    race.isCustom       = true

    broadcastChanged()
    return util.ok({ race = cardFor(race, cid, 'registering'), start = race.start })
end

---Records whether a member's client says they are lined up. Members who never report default to
---ready, so a racer who joined at the line and stayed put is never left behind.
---@param cid string citizenid
---@param raceId any
---@param ready boolean
function racegen.setReady(cid, raceId, ready)
    local race = racegen.get(raceId)
    if not race or not race.members[cid] then return end
    race.notReady = race.notReady or {}
    race.notReady[cid] = (not ready) or nil
end

---Frees a leaving player's seats across every lobby.
---@param cid string citizenid
function racegen.dropPlayer(cid)
    local freed = false
    for _, race in pairs(Races) do
        if race.members[cid] then
            removeMember(race, cid)
            freed = true
        end
    end
    if freed then broadcastChanged() end
end

---Marks and returns every lobby whose start time has just arrived, fired once each. Each entry
---carries the members to open a run for and the members who were out of position, whose buy-ins
---the caller refunds.
---@return table[] starting
function racegen.collectStarting()
    local now, out = os.time(), {}

    for _, race in pairs(Races) do
        if not race.startedFired and race.startsAt <= now then
            race.startedFired = true
            race.liveAt       = now

            local members, skipped = {}, {}
            for cid, account in pairs(race.members) do
                if race.notReady and race.notReady[cid] then
                    skipped[#skipped + 1] = {
                        citizenid = cid,
                        account   = type(account) == 'string' and account or nil,
                        amount    = math.max(0, int(race.entryFee, 0)),
                    }
                else
                    members[#members + 1] = cid
                end
            end

            Live[race.id] = race
            out[#out + 1] = {
                id             = race.id,
                name           = race.name,
                trackId        = race.trackId,
                trackName      = race.trackName,
                class          = race.class,
                mode           = race.mode,
                laps           = race.laps,
                gates          = race.gates,
                entryFee       = math.max(0, int(race.entryFee, 0)),
                prizePool      = race.isCustom and (race.entryFee * race.joinedCount) or race.prizePool,
                maxRacers      = race.maxRacers,
                phasingMode    = race.phasingMode,
                phasingSeconds = race.phasingSeconds,
                camera         = race.camera,
                isCustom       = race.isCustom == true,
                members        = members,
                skipped        = skipped,
            }
        end
    end

    if #out > 0 then broadcastChanged() end
    return out
end

---Every paid registration in a lobby that has not started. Lobbies live only in memory, so a
---resource stop destroys them: these racers get their buy-ins back rather than paying into a race
---that will never run.
---@return table[] refunds each { citizenid, account, amount }
function racegen.collectPendingRefunds()
    local out = {}
    for _, race in pairs(Races) do
        local fee = math.max(0, int(race.entryFee, 0))
        if not race.startedFired and fee > 0 then
            for cid, account in pairs(race.members) do
                out[#out + 1] = {
                    citizenid = cid,
                    account   = type(account) == 'string' and account or nil,
                    amount    = fee,
                }
            end
        end
    end
    return out
end

---Generates one race that starts very soon. An explicitly named track bypasses the verified-only
---filter, because whoever passed it asked for that track by name.
---@param seconds integer|nil seconds until the green light (default 60)
---@param class string|nil race class letter; random when nil
---@param track table|nil a specific cached track entry; random when nil
---@return table|nil race
function racegen.generateSoon(seconds, class, track)
    local chosen = track
    if not chosen then
        local tracks = eligibleTracks()
        if #tracks == 0 then return nil end
        chosen = tracks[math.random(#tracks)]
    end

    local race = createRace(chosen, math.max(5, int(seconds, 60)), class)
    broadcastChanged()
    return race
end

---Seeds one batch, then keeps generating on the configured interval. Idles harmlessly while no
---eligible track exists, so a fresh server costs nothing until somebody verifies a track.
function racegen.start()
    if GEN.Enabled == false then return end

    local interval = math.max(1, int(GEN.IntervalMinutes, 20)) * 60 * 1000

    CreateThread(function()
        local waited = 0
        while #eligibleTracks() == 0 and waited < SEED_WAIT_MS do
            Wait(1000)
            waited = waited + 1000
        end
        generateBatch()

        while true do
            Wait(interval)
            prune()
            generateBatch()
        end
    end)
end

return racegen
