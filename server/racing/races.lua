---@type table Racing config (configs/racing.lua): currency, classes, MMR, DNF, prize splits, timings.
local config  = require 'configs.racing'
---@type table Player bridge (bridge.server.player): citizenid and live-source resolution.
local player  = require 'bridge.server.player'
---@type table Money bridge (bridge.server.money): the only entry-fee debit and prize credit path.
local money   = require 'bridge.server.money'
---@type table Shared server helpers (server.util): amount coercion, rate limits, disconnect sweeps.
local util    = require 'server.util'
---@type table Racing persistence (server.racing.store): profiles, MMR writes, result rows, routes.
local store   = require 'server.racing.store'
---@type table Racing handlers (server.racing.actions): the server-side vehicle class resolver.
local actions = require 'server.racing.actions'

---@type table Races module; the table returned at end of file. The live race state machine, and
---the only place in the app that moves money or MMR.
local races = {}

---@type table|nil Race lobbies (server.racing.racegen), taken on the first dispatcher tick rather
---than at file scope: racegen requires this module at load, so closing that loop here would never
---finish resolving either side.
local racegen

---@type table<string, table> Live runs keyed by race id. In memory only; a restart ends them.
local ActiveRuns = {}

---@type table<string, table> Solo timed runs keyed by citizenid. One at a time: opening a second
---replaces the first, which is what abandoning a run and starting again amounts to.
local Trials = {}

---@type string Client event prefix every Racing push goes out under.
local EV = 'sd-phone:client:racing:'

---@type integer Dispatcher period (ms): sweep, DNF deadlines, then the races whose clock ran out.
local TICK_MS = 1000

---@type integer, integer Standings fan-out budget per racer. A checkpoint that lands outside it
---still counts towards progress, only the broadcast is skipped, so a client replaying a whole gate
---list cannot turn one race into thousands of events.
local BROADCAST_WINDOW, BROADCAST_MAX = 10000, 30

---@type integer, integer Finish-report budget per racer. A finish can only land once, so this only
---bounds the rejected retries a client can force.
local FINISH_WINDOW, FINISH_MAX = 60000, 10

---@type table Rating rules (configs/racing.lua MMR.Gain): mode, K, spread, minPlayers, customRaces.
local GAIN = (config.MMR or {}).Gain or {}
---@type integer Rating a racer the store has never seen starts on.
local BASE_MMR = math.floor(tonumber((config.MMR or {}).Base) or 1000)
---@type table DNF rules (configs/racing.lua DNF): enable flag, arming trigger, grace seconds.
local DNF = config.DNF or {}
---@type table<integer, number> Ranked payout share by finishing place (Ranked.PrizeSplit).
local PRIZE_SPLIT = (config.Ranked or {}).PrizeSplit or {}
---@type string Account buy-ins and prizes move through by default.
local CURRENCY = config.Currency or 'bank'
---@type string The other side of the cash/bank pair, tried when the default cannot cover a buy-in.
local FALLBACK_ACCOUNT = CURRENCY == 'cash' and 'bank' or 'cash'
---@type integer Seconds of 3-2-1 the client runs between the dispatch and the green light.
local COUNTDOWN = math.max(0, math.floor(tonumber((config.Race or {}).CountdownSeconds) or 3))
---@type integer Seconds before an abandoned run is swept out of memory.
local RUN_MAX_AGE = math.max(60, math.floor(tonumber((config.Race or {}).RunMaxAgeSeconds) or 3600))

---Normalises a model hash to unsigned 32 bit, so a client's signed GetEntityModel and the server's
---own joaat of a configured model name always land on the same key.
---@param v any raw hash
---@return integer|nil
local function hashKey(v)
    local n = tonumber(v)
    if not util.finite(n) then return nil end
    return math.floor(n) % 4294967296
end

---@type table<integer, string> Model hash -> display label. The client sends a hash and never a
---label, so the configured model list is the only vehicle name the server can vouch for.
local MODEL_NAMES = {}
for name in pairs((config.Vehicles or {}).Models or {}) do
    local key = hashKey(joaat(name))
    if key then MODEL_NAMES[key] = name:sub(1, 1):upper() .. name:sub(2) end
end

---Current server id for a citizenid, or nil when they are offline.
---@param cid string|nil
---@return integer|nil
local function srcOf(cid) return cid and player.getSourceByIdentifier(cid) or nil end

---Pushes an Racing event straight to a player by citizenid. A no-op when they are offline.
---@param cid string|nil
---@param event string suffix appended to EV
---@param data table
local function pushTo(cid, event, data)
    local src = srcOf(cid)
    if src then TriggerClientEvent(EV .. event, src, data) end
end

---Whether a run moves ratings: generated events always do, player-hosted races only when the
---config opts them in.
---@param run table
---@return boolean ranked
local function isRanked(run)
    return not run.isCustom or GAIN.customRaces == true
end

---The rating a racer carried into the run, from the snapshot taken at the green light.
---@param run table
---@param cid string
---@return integer
local function ratingOf(run, cid)
    return (run.ratings and run.ratings[cid]) or BASE_MMR
end

---Ordered standings for a run: furthest through the gates first, the earlier arrival breaking a
---tie. `deltaMs` is the gap to the leader at the same gate, and is absent for the leader and for
---anyone the leader has not yet been measured against.
---@param run table
---@return table[] entries { pos, name, deltaMs?, citizenid, you }
local function buildStandings(run)
    local sorted = {}
    for cid in pairs(run.memberSet) do
        local p = run.progress[cid]
        local idx = p and p.idx or 0
        sorted[#sorted + 1] = { cid = cid, idx = idx, t = (p and p.times[idx]) or 0 }
    end
    table.sort(sorted, function(a, b)
        if a.idx ~= b.idx then return a.idx > b.idx end
        if a.t ~= b.t then return a.t < b.t end
        return a.cid < b.cid
    end)

    local leader      = sorted[1]
    local leaderTimes = leader and run.progress[leader.cid] and run.progress[leader.cid].times or {}
    local entries     = {}
    for i, e in ipairs(sorted) do
        local deltaMs
        if i > 1 and e.idx > 0 and leaderTimes[e.idx] then
            deltaMs = math.max(0, e.t - leaderTimes[e.idx])
        end
        entries[i] = { pos = i, name = run.names[e.cid] or 'Racer', deltaMs = deltaMs, citizenid = e.cid, you = false }
    end
    return entries
end

---Sends a run's standings to every online member, with each recipient's own row flagged.
---@param raceId string
---@param run table
local function broadcastStandings(raceId, run)
    local base = buildStandings(run)
    for cid in pairs(run.memberSet) do
        local src = srcOf(cid)
        if src then
            local entries = {}
            for i = 1, #base do
                local b = base[i]
                entries[i] = { pos = b.pos, name = b.name, deltaMs = b.deltaMs, you = b.citizenid == cid }
            end
            TriggerClientEvent(EV .. 'standings', src, { raceId = raceId, entries = entries })
        end
    end
end

---Drops a run once every member carries a finish marker.
---@param raceId string
---@param run table
local function retireIfDone(raceId, run)
    for cid in pairs(run.memberSet) do
        if run.finished[cid] == nil then return end
    end
    ActiveRuns[raceId] = nil
end

---Marks one unfinished racer as a loss: a zero finish marker so the run can complete, the rating
---penalty on ranked runs, and a DNF result row so the race still shows in their history while
---staying out of the track records and play counts.
---@param run table
---@param cid string
---@return integer delta the applied rating change
local function applyLoss(run, cid)
    run.finished[cid] = 0

    local ranked = isRanked(run)
    local row    = store.profileRow(cid)
    local before = math.floor(tonumber(row and row.mmr) or BASE_MMR)
    local after  = before
    local delta  = 0

    if ranked then
        after = math.max(0, before + races.computeDnfDelta(run, cid))
        store.saveMmr(cid, after)
        delta = after - before
    end

    if run.trackId then
        store.saveResult({
            trackId   = run.trackId,
            citizenid = cid,
            name      = run.names[cid] or 'Racer',
            timeMs    = 0,
            vehicle   = nil,
            class     = nil,
            position  = nil,
            racers    = run.racerCount,
            mmrDelta  = ranked and delta or nil,
            mmrAfter  = ranked and after or nil,
            dnf       = true,
            ranked    = ranked,
        })
    end

    return delta
end

---Finishers required before the DNF countdown arms, per Config.DNF.Trigger.
---@param run table
---@return integer required
local function dnfRequiredFinishers(run)
    local trig  = DNF.Trigger or {}
    local field = run.racerCount or 1
    if trig.mode == 'percent' then
        return math.max(1, math.ceil(field * (tonumber(trig.value) or 50) / 100))
    end
    return math.max(1, math.floor(tonumber(trig.value) or 1))
end

---Arms the DNF countdown once enough racers are home: everyone still driving gets Config.DNF.Seconds
---to cross the line and is told so. The dispatcher enforces the deadline.
---@param run table
local function armDnf(run)
    if not DNF.Enabled or run.dnfAt then return end
    if (run.finishCount or 0) < dnfRequiredFinishers(run) then return end

    local unfinished = {}
    for cid in pairs(run.memberSet) do
        if run.finished[cid] == nil then unfinished[#unfinished + 1] = cid end
    end
    if #unfinished == 0 then return end

    local seconds = math.max(10, math.floor(tonumber(DNF.Seconds) or 120))
    run.dnfAt = os.time() + seconds
    for i = 1, #unfinished do
        pushTo(unfinished[i], 'dnfStarted', { seconds = seconds })
    end
end

---Gates per lap for a run. The route the client drives is the authority: gate 1 is the start line
---and never a target, so a track's own point list settles the count without trusting a denormalised
---field on the lobby record.
---@param trackId integer|nil
---@param race table the racegen entry
---@return integer cpPerLap at least 1
local function checkpointsPerLap(trackId, race)
    local points = trackId and store.routeFor(trackId) or nil
    local count  = points and #points or 0
    if count < 2 then count = math.floor(tonumber(race.gates) or 0) end
    return math.max(1, count - 1)
end

---Takes an amount from one account, but only when the balance actually covers it. The pre-check
---matters: the money bridge reports success on ESX regardless of balance.
---@param src integer
---@param account string
---@param amount integer
---@return boolean taken
local function debit(src, account, amount)
    if (tonumber(money.get(src, account)) or 0) < amount then return false end
    return money.remove(src, account, amount, 'Race buy-in') == true
end

---Racers who were not lined up when the clock hit zero: the race leaves without them, so the
---buy-in goes straight back with a heads-up.
---@param race table a racegen.collectStarting entry
local function refundSkipped(race)
    local fee = util.wholeAmount(race.entryFee)
    for _, miss in ipairs(race.skipped or {}) do
        local src = srcOf(miss.citizenid or miss.identifier)
        if src then
            if fee > 0 then races.refundBuyIn(src, miss.account, fee) end
            TriggerClientEvent('ox_lib:notify', src, {
                title = 'Racing',
                description = fee > 0
                    and ('The race started without you. Your $%d buy-in has been refunded.'):format(fee)
                    or 'The race started without you: you were not lined up at the start.',
                type = 'error',
            })
        end
    end
end

---Rating change for one finisher, per Config.MMR.Gain.
---
---'elo' (the default): every opponent is a head-to-head duel scored against the ratings snapshotted
---at the green light. An opponent already carrying a real finish crossed the line first, so that
---duel is lost; everyone else, still driving or gone, is beaten. The summed surprise is averaged so
---one race can never move a rating by more than K.
---
---'linear', and the fallback when a run predates its ratings snapshot: a gain of K for first scaling
---linearly to a loss of K for last across the field that started, opponents' ratings ignored.
---@param run table
---@param citizenid string
---@param place integer 1 for the winner
---@return integer delta signed rating change, 0 for a field below minPlayers
function races.computeMmrDelta(run, citizenid, place)
    local K          = tonumber(GAIN.K) or 25
    local minPlayers = math.max(2, math.floor(tonumber(GAIN.minPlayers) or 2))
    local fieldSize  = run.racerCount or 1
    if fieldSize < minPlayers then return 0 end

    if GAIN.mode ~= 'linear' and run.ratings then
        local spread = tonumber(GAIN.spread) or 400
        local mine   = ratingOf(run, citizenid)
        local surprise, opponents = 0, 0
        for id, rating in pairs(run.ratings) do
            if id ~= citizenid then
                opponents = opponents + 1
                local expected = 1 / (1 + 10 ^ ((rating - mine) / spread))
                local actual   = (run.finished[id] and run.finished[id] > 0) and 0 or 1
                surprise = surprise + (actual - expected)
            end
        end
        if opponents == 0 then return 0 end
        return lib.math.round(K * surprise / opponents)
    end

    return lib.math.round(K * (fieldSize - 2 * place + 1) / (fieldSize - 1))
end

---Rating change for a racer who did not finish, whether they timed out or left the server. Same
---duel loop as a finish, but a non-finisher only ties with the other non-finishers instead of
---beating them. The linear fallback is a flat last-place loss.
---@param run table
---@param citizenid string
---@return integer delta signed rating change, 0 for a field below minPlayers
function races.computeDnfDelta(run, citizenid)
    local K          = tonumber(GAIN.K) or 25
    local minPlayers = math.max(2, math.floor(tonumber(GAIN.minPlayers) or 2))
    local fieldSize  = run.racerCount or 1
    if fieldSize < minPlayers then return 0 end

    if GAIN.mode ~= 'linear' and run.ratings then
        local spread = tonumber(GAIN.spread) or 400
        local mine   = ratingOf(run, citizenid)
        local surprise, opponents = 0, 0
        for id, rating in pairs(run.ratings) do
            if id ~= citizenid then
                opponents = opponents + 1
                local expected = 1 / (1 + 10 ^ ((rating - mine) / spread))
                local actual   = (run.finished[id] and run.finished[id] > 0) and 0 or 0.5
                surprise = surprise + (actual - expected)
            end
        end
        if opponents == 0 then return 0 end
        return lib.math.round(K * surprise / opponents)
    end

    return -K
end

---Share of the prize pool a finishing place takes. Player-hosted races are winner-takes-all, since
---their pool is only the combined buy-ins; ranked events pay out down the configured split.
---@param isCustom boolean
---@param place integer
---@return number share 0 to 1
function races.prizeShare(isCustom, place)
    if isCustom then return place == 1 and 1.0 or 0.0 end
    return tonumber(PRIZE_SPLIT[place]) or 0
end

---Charges a race buy-in. The configured currency is tried first, then the other of cash and bank.
---This is the only debit in the app; racegen.join is its only caller.
---@param src integer player server id
---@param cid string citizenid
---@param amount integer
---@return boolean ok false when nothing could cover the fee
---@return string|nil account the account charged, kept so a refund goes back where it came from
function races.chargeBuyIn(src, cid, amount)
    amount = util.wholeAmount(amount)
    if amount <= 0 then return true, nil end
    if not src or type(cid) ~= 'string' or cid == '' then return false, nil end

    if debit(src, CURRENCY, amount) then return true, CURRENCY end
    if debit(src, FALLBACK_ACCOUNT, amount) then return true, FALLBACK_ACCOUNT end
    return false, nil
end

---Repays a buy-in to the account it came from. The only credit path for entry fees: leaving a
---lobby, being left behind at the line, and a resource stop all land here.
---@param src integer player server id
---@param account string|nil the account the fee was charged to
---@param amount integer
function races.refundBuyIn(src, account, amount)
    amount = util.wholeAmount(amount)
    if not src or amount <= 0 then return end
    money.add(src, account or CURRENCY, amount, 'Race buy-in refund')
end

---Opens a run for a race whose clock has just run out: snapshots the ratings on ranked runs, tells
---every online member to start driving, and broadcasts the opening standings.
---@param race table the racegen entry that just fired
---@param members string[] citizenids on the grid
---@param now integer os.time() of the dispatch tick
function races.beginRun(race, members, now)
    if type(race) ~= 'table' or type(race.id) ~= 'string' then return end
    if type(members) ~= 'table' or #members == 0 then return end

    local ranked   = not (race.isCustom == true) or GAIN.customRaces == true
    local names    = {}
    local memberSet = {}
    local ratings  = ranked and {} or nil
    for i = 1, #members do
        local cid = members[i]
        local row = store.profileRow(cid)
        memberSet[cid] = true
        names[cid] = (row and (row.alias or row.name)) or 'Racer'
        if ratings then ratings[cid] = math.floor(tonumber(row and row.mmr) or BASE_MMR) end
    end

    local trackId  = tonumber(race.trackId)
    local isCustom = race.isCustom == true
    local run = {
        id          = race.id,
        trackId     = trackId,
        memberSet   = memberSet,
        names       = names,
        progress    = {},
        finished    = {},
        finishCount = 0,
        ratings     = ratings,
        racerCount  = #members,
        cpPerLap    = checkpointsPerLap(trackId, race),
        laps        = math.max(1, math.floor(tonumber(race.laps) or 1)),
        prizePool   = isCustom and (util.wholeAmount(race.entryFee) * #members) or util.wholeAmount(race.prizePool),
        isCustom    = isCustom,
        -- The green light is the client's, not the dispatcher's: the countdown runs before anyone
        -- moves, so the server clock has to start where the racers do or every recorded time would
        -- carry the countdown on top of it.
        startedAt   = GetGameTimer() + COUNTDOWN * 1000,
        createdAt   = now or os.time(),
    }
    ActiveRuns[race.id] = run

    local sources = {}
    for i = 1, #members do
        local src = srcOf(members[i])
        if src then sources[#sources + 1] = src end
    end

    local payload = {
        id      = race.id,
        name    = race.name,
        class   = race.class,
        mode    = race.mode,
        trackId = trackId,
        laps    = run.laps,
        phasing = { mode = race.phasingMode or 'off', seconds = race.phasingSeconds or 0 },
        camera  = race.camera or 'none',
        racers  = sources,
    }
    for i = 1, #members do
        pushTo(members[i], 'raceStart', payload)
    end

    broadcastStandings(race.id, run)
end

---A racer reported a checkpoint. The index must be strictly ahead of the one already stored and
---within the run's gate count; a replayed or out-of-order index is discarded without a broadcast.
---`clientMs` is advisory and only ever feeds the display gaps in the standings.
---@param src integer player server id
---@param raceId string
---@param index integer overall checkpoint index across every lap
---@param clientMs integer the racer's own race clock at the gate
function races.checkpoint(src, raceId, index, clientMs)
    local cid = player.getIdentifier(src)
    if not cid then return end

    local run = type(raceId) == 'string' and ActiveRuns[raceId] or nil
    if not run or not run.memberSet[cid] or run.finished[cid] ~= nil then return end

    local idx = util.wholeAmount(index)
    if idx <= 0 or idx > run.cpPerLap * run.laps then return end

    local p = run.progress[cid]
    if not p then
        p = { idx = 0, times = {} }
        run.progress[cid] = p
    end
    if idx <= p.idx then return end

    p.idx = idx
    p.times[idx] = util.wholeAmount(clientMs)

    if util.rateLimit(cid, 'racing:standings', BROADCAST_WINDOW, BROADCAST_MAX) then
        broadcastStandings(raceId, run)
    end
end

---A racer crossed the line: settles their rating, writes the result row and pays their share of the
---pool. The finish is only real when the racer reported every gate on the way to it, the time is
---the server's own clock rather than anything the client sent, and the class comes from the model
---hash through the one server-side resolver.
---@param src integer player server id
---@param raceId string
---@param modelHash integer GetEntityModel of the finishing vehicle
---@param clientMs integer the racer's own race clock, kept for display gaps only
function races.finish(src, raceId, modelHash, clientMs)
    local cid = player.getIdentifier(src)
    if not cid then return end
    if not util.rateLimit(cid, 'racing:finish', FINISH_WINDOW, FINISH_MAX) then return end

    local run = type(raceId) == 'string' and ActiveRuns[raceId] or nil
    if not run or not run.memberSet[cid] or run.finished[cid] ~= nil then return end

    local p = run.progress[cid]
    if not p or p.idx ~= run.cpPerLap * run.laps then return end

    local elapsedMs = math.max(1, GetGameTimer() - run.startedAt)
    p.times[p.idx] = util.wholeAmount(clientMs)

    run.finished[cid] = elapsedMs
    run.finishCount   = run.finishCount + 1
    local place       = run.finishCount

    local ranked = isRanked(run)
    local row    = store.profileRow(cid)
    local before = math.floor(tonumber(row and row.mmr) or BASE_MMR)
    local after  = before
    local delta  = 0
    if ranked then
        after = math.max(0, before + races.computeMmrDelta(run, cid, place))
        store.saveMmr(cid, after)
        delta = after - before
    end

    if run.trackId then
        local key = hashKey(modelHash)
        store.saveResult({
            trackId   = run.trackId,
            citizenid = cid,
            name      = run.names[cid] or 'Racer',
            timeMs    = elapsedMs,
            vehicle   = (key and MODEL_NAMES[key]) or 'Unknown',
            class     = actions.classForModel(modelHash),
            position  = place,
            racers    = run.racerCount,
            mmrDelta  = ranked and delta or nil,
            mmrAfter  = ranked and after or nil,
            dnf       = false,
            ranked    = ranked,
        })
    end

    local payout = 0
    local share  = races.prizeShare(run.isCustom, place)
    if share > 0 and run.prizePool > 0 then
        payout = lib.math.round(run.prizePool * share)
        if payout > 0 then money.add(src, CURRENCY, payout, 'Race prize') end
    end

    TriggerClientEvent(EV .. 'raceResult', src, {
        dnf      = false,
        position = place,
        racers   = run.racerCount,
        timeMs   = elapsedMs,
        mmrDelta = delta,
        mmrAfter = after,
        payout   = payout,
    })

    armDnf(run)
    retireIfDone(raceId, run)
end

---A player left the server. Leaving mid-race is a DNF, so the loss lands on every run they were
---still driving in. Safe to call twice: a racer who already carries a finish marker is skipped.
---@param src integer player server id
---@param citizenid string|nil best effort, the character may already have unloaded
function races.dropPlayer(src, citizenid)
    local cid = citizenid or (src and player.getIdentifier(src))
    if type(cid) ~= 'string' or cid == '' then return end

    Trials[cid] = nil

    for raceId, run in pairs(ActiveRuns) do
        if run.memberSet[cid] and run.finished[cid] == nil then
            applyLoss(run, cid)
            retireIfDone(raceId, run)
        end
    end
end

---Opens a solo run against the clock. The clock is stamped HERE rather than taken from the client
---at the end: a trial has no other racers to contradict it, so a client-reported time would be a
---world record for anyone willing to edit one number.
---@param src integer player server id
---@param payload table client-supplied { trackId }
---@return table envelope
function races.trialStart(src, payload)
    local cid = player.getIdentifier(src)
    if not cid then return util.fail('racing.playerNotFound', 'Player not found') end

    local trackId = math.floor(tonumber(payload.trackId) or 0)
    if trackId <= 0 then return util.fail('racing.trackNoLongerAvailable', 'That track is no longer available') end

    local track = store.trackRow(trackId)
    if not track or util.truthy(track.deleted) or not util.truthy(track.published) then
        return util.fail('racing.trackNoLongerAvailable', 'That track is no longer available')
    end

    Trials[cid] = { trackId = trackId, startedAt = GetGameTimer() }
    return util.ok({ trackId = trackId })
end

---Closes a trial and writes it to the record board. Unranked by definition: no rating moves, no
---payout, no position - the row exists so the time can stand on the track's board beside the
---times set in traffic.
---@param src integer player server id
---@param payload table client-supplied { bestLapMs, sectors, modelHash }
---@return table envelope on success data = { timeMs, bestLapMs, personalBest, record }
function races.trialFinish(src, payload)
    local cid = player.getIdentifier(src)
    if not cid then return util.fail('racing.playerNotFound', 'Player not found') end
    if not util.rateLimit(cid, 'racing:finish', FINISH_WINDOW, FINISH_MAX) then
        return util.fail('racing.tooManyRunsWaitMoment', 'Too many runs, wait a moment')
    end

    local trial = Trials[cid]
    if not trial then return util.fail('racing.notTimedRun', 'You are not on a timed run') end
    Trials[cid] = nil

    local elapsedMs = math.max(1, GetGameTimer() - trial.startedAt)

    -- Everything below the elapsed time is client-reported and only ever shown back to the racer
    -- who sent it, so it is clamped into the run rather than trusted or rejected.
    local bestLapMs = math.floor(tonumber(payload.bestLapMs) or 0)
    if bestLapMs <= 0 or bestLapMs > elapsedMs then bestLapMs = elapsedMs end

    local splits, last = {}, 0
    if type(payload.sectors) == 'table' then
        for i = 1, #payload.sectors do
            local ms = math.floor(tonumber(payload.sectors[i]) or 0)
            if ms > last and ms <= bestLapMs then
                splits[#splits + 1] = ms
                last = ms
            end
        end
    end

    local before = store.personalBest(trial.trackId, cid)
    local key    = hashKey(payload.modelHash)

    store.saveResult({
        trackId   = trial.trackId,
        citizenid = cid,
        name      = (store.profileRow(cid) or {}).name or 'Racer',
        timeMs    = elapsedMs,
        vehicle   = (key and MODEL_NAMES[key]) or 'Unknown',
        class     = actions.classForModel(payload.modelHash),
        position  = 1,
        racers    = 1,
        bestLapMs = bestLapMs,
        sectors   = #splits > 0 and table.concat(splits, ',') or nil,
        dnf       = false,
        ranked    = false,
    })

    local best = before and before.lapMs or 0
    return util.ok({
        timeMs       = elapsedMs,
        bestLapMs    = bestLapMs,
        personalBest = best > 0 and best or nil,
        improved     = best <= 0 or bestLapMs < best,
    })
end

---Takes a racer out of a run they were never let into: not in the driver's seat, facing the wrong
---way, past the line or nowhere near it when the flag dropped.
---
---Deliberately NOT dropPlayer. That marks a loss, moves the rating and writes a DNF row, all of
---which are a verdict on how someone drove. This racer never turned a wheel, so the run simply
---forgets them: no result, no rating change, nothing in their history. Their buy-in stays in the
---pot, which is the one thing that cannot be undone here - the pool was fixed from the entry count
---when the run began, so paying it back while the pool keeps their share would mint the difference.
---@param cid string citizenid
---@param raceId string
---@return boolean withdrawn
function races.withdraw(cid, raceId)
    if type(cid) ~= 'string' or cid == '' then return false end
    local run = ActiveRuns[raceId]
    if not run or not run.memberSet[cid] or run.finished[cid] ~= nil then return false end

    run.memberSet[cid] = nil
    run.names[cid]     = nil
    run.progress[cid]  = nil
    if run.ratings then run.ratings[cid] = nil end
    run.racerCount = math.max(0, (tonumber(run.racerCount) or 1) - 1)

    -- The grid may now be empty, or everyone left may already be home.
    if next(run.memberSet) == nil then
        ActiveRuns[raceId] = nil
        return true
    end

    retireIfDone(raceId, run)
    if ActiveRuns[raceId] then broadcastStandings(raceId, run) end
    return true
end

---The run a racer is currently driving in, if any.
---@param citizenid string
---@return string|nil raceId
function races.activeFor(citizenid)
    if type(citizenid) ~= 'string' then return nil end
    for raceId, run in pairs(ActiveRuns) do
        if run.memberSet[citizenid] and run.finished[citizenid] == nil then return raceId end
    end
    return nil
end

---Current standings for a run, for a spectator rather than a racer: no row is flagged as theirs and
---the citizenids stay on the server.
---@param raceId string
---@return table[] entries
function races.standingsFor(raceId)
    local run = type(raceId) == 'string' and ActiveRuns[raceId] or nil
    if not run then return {} end

    local entries = buildStandings(run)
    for i = 1, #entries do entries[i].citizenid = nil end
    return entries
end

---Starts the dispatcher. Called once from init.lua when the app is enabled, so nothing here ticks
---on a server that has Racing switched off.
function races.start()
    util.onCleanup(function(src, cid) races.dropPlayer(src, cid) end)

    CreateThread(function()
        while true do
            Wait(TICK_MS)
            local now = os.time()

            for raceId, run in pairs(ActiveRuns) do
                if now - run.createdAt > RUN_MAX_AGE then ActiveRuns[raceId] = nil end
            end

            for raceId, run in pairs(ActiveRuns) do
                if run.dnfAt and now >= run.dnfAt then
                    run.dnfAt = nil
                    for cid in pairs(run.memberSet) do
                        if run.finished[cid] == nil then
                            pushTo(cid, 'raceDnf', { dnf = true, mmrDelta = applyLoss(run, cid) })
                        end
                    end
                    ActiveRuns[raceId] = nil
                end
            end

            racegen = racegen or require 'server.racing.racegen'
            local starting = racegen.collectStarting()
            for i = 1, #starting do
                local race = starting[i]
                refundSkipped(race)
                races.beginRun(race, race.members or {}, now)
            end
        end
    end)
end

return races
