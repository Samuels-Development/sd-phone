---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, cooldowns, batched fan-out.
local util     = require 'server.util'
---@type table Chip wallet (server.games.chips): the shared casino balance escrowed and paid here.
local chips    = require 'server.games.chips'
---@type table Stats board (server.games.stats): win/loss + chip-swing record per character.
local stats    = require 'server.games.stats'
---@type table Casino helpers (server.games.casino.shared): identity, wager sanitiser, stats verdict.
local shared   = require 'server.games.casino.shared'
---@type table Node crypto helper (server.crypto): the seed source and SHA-256 behind the commitment.
local crypto   = require 'server.crypto'
---@type table Crash curve (server.games.casino.crash.curve): bust derivation and the multiplier clock.
local curve    = require 'server.games.casino.crash.curve'
---@type table Watcher registry (server.watchers) for players with Crash on screen.
local watchers = require('server.watchers').of('crash')

---@type table Crash round module; the table returned at end of file. One round is shared by the
---whole server: the loop here owns the clock, the seed and the bust, and every client only ever
---renders what it is told. No request a player can send carries a multiplier, so there is no
---number in the protocol that could be talked up.
local round = {}

---@type table Casino limits (config.Casino.Crash); hoisted with defaults so a missing config file
---cannot silently raise a stake or shorten the betting window.
local C = (config.Casino or {}).Crash or {}
---@type integer Smallest accepted stake.
local MIN_BET      = C.MinBet or 25
---@type integer Largest accepted stake. With the multiplier ceiling this bounds a single payout.
local MAX_BET      = C.MaxBet or 50000
---@type integer Length of the betting window (ms).
local BETTING_MS   = C.BettingMs or 12000
---@type integer How long the busted board stays up before the next window opens (ms).
local BUST_HOLD_MS = C.BustHoldMs or 5000
---@type integer Finished rounds kept for the fairness panel to check against.
local HISTORY_SIZE = C.HistorySize or 20

---@type integer Tick cadence during the betting window (ms). Nothing moves, so 1Hz is plenty.
local TICK_BET_MS   = 1000
---@type integer Tick cadence while the multiplier climbs (ms).
local TICK_RUN_MS   = 250
---@type integer Minimum gap between bet requests, per character (ms).
local BET_COOLDOWN  = 400
---@type integer Minimum gap between cash out requests, per character (ms).
local CASH_COOLDOWN = 250
---@type integer Lowest auto cash out target accepted, in basis points (1.01x). A target of 1.00x
---can never be reached: the round starts there and a cash out must beat the bust strictly.
local MIN_AUTO = 101

---@type string Per-tick state push.
local EV_TICK    = 'sd-phone:client:crash:tick'
---@type string One-shot bust push carrying the seed reveal.
local EV_BUST    = 'sd-phone:client:crash:bust'
---@type string One-shot per-player settlement push (cash out, auto cash out, or bust loss).
local EV_SETTLED = 'sd-phone:client:crash:settled'

---@type table<string, string> Internal phase name to the short form the wire carries.
local WIRE_PHASE = { idle = 'idle', betting = 'bet', running = 'run', bust = 'bust' }

---@type table The live round. `bets` is keyed on citizenid rather than source so a bet survives
---the player disconnecting: it was paid for, and refunding a dropped connection would make
---pulling the plug a free option on every losing round.
local r = {
    phase = 'idle', id = '', seed = nil, commit = nil,
    bustX100 = 0, bustMs = 0, startedAt = 0, betEndsAt = 0,
    bets = {}, order = {}, cash = {}, history = {},
}

---@type { n: string, s: integer }[] Bets joined since the last tick, drained into it.
local pendingBet  = {}
---@type { n: string, m: integer, w: integer }[] Cash outs since the last tick, drained into it.
local pendingCash = {}

---The live round table. init.lua reads the phase from it and the suite drives it directly; nothing
---outside this module writes to it during a real round.
---@return table state
function round.state() return r end

---Sends one player their own settlement. Skipped for a source that has gone, which is the normal
---case for an auto cash out that paid while its owner was offline.
---@param src integer|nil player server id
---@param payload table settlement payload
local function pushSettled(src, payload)
    if not src or not GetPlayerName(src) then return end
    TriggerClientEvent(EV_SETTLED, src, payload)
end

---Pushes one state packet to everyone watching, draining the bet/cash deltas gathered since the
---last one. Draining happens even with nobody watching so the queues cannot grow unbounded; a
---late joiner is served the whole board by round.snapshot instead.
---@param withCommit boolean true to attach the round's published commitment
local function pushTick(withCommit)
    local targets = watchers.targets()
    local running = r.phase == 'running'
    local now     = GetGameTimer()
    local payload = {
        id  = r.id,
        ph  = running and 'run' or 'bet',
        ms  = running and (now - r.startedAt) or math.max(0, r.betEndsAt - now),
        now = now,
    }
    if running then
        local mx = curve.multAt(now - r.startedAt)
        payload.mx = mx < r.bustX100 and mx or r.bustX100
    end
    if withCommit and r.commit then payload.commit = r.commit end
    if pendingBet[1] then payload.bet = pendingBet; pendingBet = {} end
    if pendingCash[1] then payload.cash = pendingCash; pendingCash = {} end
    if targets[1] then util.pushMany(EV_TICK, targets, payload) end
end

---Opens a betting window: new id, new seed, and the bust decided and locked away before the first
---bet is accepted. The commitment is published; the bust is derived from the UNSALTED hash of the
---same seed, so the published value cannot be turned back into the bust it decides.
local function startBetting()
    local seed   = crypto.randomHex(32)
    local commit = seed and crypto.sha256(seed .. curve.COMMIT_SUFFIX) or nil
    local bust   = seed and curve.bustFromHash(crypto.sha256(seed)) or nil
    if not (seed and commit and bust) then
        -- No Node crypto: a verifiable commitment is impossible, so none is published and no seed
        -- is revealed. A synthesised hash would be worse than none, because it would look
        -- checkable and never check out.
        seed, commit = nil, nil
        bust = curve.bustFromX(math.random())
    end

    r.id        = util.newId(10)
    r.phase     = 'betting'
    r.seed      = seed
    r.commit    = commit
    r.bustX100  = bust
    r.bustMs    = curve.bustAtMs(bust)
    r.startedAt = 0
    r.betEndsAt = GetGameTimer() + BETTING_MS
    r.bets, r.order, r.cash = {}, {}, {}
    pendingBet, pendingCash = {}, {}
end

---Settles every live bet whose auto cash out target the curve has provably passed, paying at the
---TARGET rather than at the tick's multiplier: the target is a value the curve is guaranteed to
---have travelled through, whereas a tick only samples it every 250ms.
---@param mx integer highest multiplier the curve has reached, in basis points
local function resolveAutos(mx)
    for i = 1, #r.order do
        local bet = r.bets[r.order[i]]
        if bet and not bet.settled and bet.stake > 0 and bet.auto
            and bet.auto <= mx and bet.auto < r.bustX100 then
            -- Claimed before the credit is spawned, so a manual cash out landing in the same
            -- instant finds the bet already settled instead of being paid a second time.
            bet.settled = true
            bet.mx      = bet.auto
            bet.payout  = bet.stake * bet.auto // 100

            local entry = { n = bet.name, m = bet.auto, w = bet.payout }
            r.cash[#r.cash + 1] = entry
            pendingCash[#pendingCash + 1] = entry

            local roundId, cid, src = r.id, bet.cid, bet.src
            local name, stake, at, payout = bet.name, bet.stake, bet.auto, bet.payout
            CreateThread(function()
                local bal = chips.add(cid, payout)
                local net = payout - stake
                stats.record(cid, 'crash', 'cpu', shared.resultFor(net), name, net)
                pushSettled(src, { id = roundId, stake = stake, payout = payout, mx = at, chips = bal })
            end)
        end
    end
end

---Claims every bet still live at the bust as a loss, before anything yields, and returns the list
---for the settlement thread. The chips were taken when the bet was placed, so a loss moves no
---money: it has only a stats row and one push to write.
---@return { cid: string, src: integer|nil, name: string, stake: integer }[] losers
local function claimLosers()
    local losers = {}
    for i = 1, #r.order do
        local bet = r.bets[r.order[i]]
        if bet and not bet.settled and bet.stake > 0 then
            bet.settled = true
            losers[#losers + 1] = { cid = bet.cid, src = bet.src, name = bet.name, stake = bet.stake }
        end
    end
    return losers
end

---Writes the losing rows off the round thread, so the next betting window is never held up by a
---table full of stats inserts.
---@param roundId string round the losses belong to
---@param losers table[] claimed losing bets
local function settleLosers(roundId, losers)
    for i = 1, #losers do
        local l = losers[i]
        stats.record(l.cid, 'crash', 'cpu', 'loss', l.name, -l.stake)
        if l.src then
            pushSettled(l.src, { id = roundId, stake = l.stake, payout = 0, chips = chips.get(l.cid) })
        end
    end
end

---Files a finished round so the fairness panel can re-derive it later. Newest first, capped.
local function recordHistory()
    -- The commitment rides along with the seed: a phone opening after the bust push has gone out
    -- has no other way to get it, and without it the fairness panel has nothing to check against.
    table.insert(r.history, 1, { id = r.id, bust = r.bustX100, seed = r.seed, commit = r.commit })
    for i = #r.history, HISTORY_SIZE + 1, -1 do r.history[i] = nil end
end

---Runs exactly one round and returns: betting window, climb, bust, hold. Blocks the calling thread
---for its whole length and never awaits a wallet or a database call, so the clock it keeps is the
---clock every client is rendering against.
function round.runCycle()
    startBetting()
    pushTick(true)
    while true do
        Wait(TICK_BET_MS)
        if GetGameTimer() >= r.betEndsAt then break end
        pushTick(false)
    end

    -- Nobody to show it to and nothing staked: discard the seed rather than burn a round on an
    -- empty room. A window that took bets is always run, even once every watcher has closed the
    -- app, because those bets are paid for and their auto cash outs are owed.
    if not watchers.any() and not r.order[1] then
        r.phase, r.seed, r.commit = 'idle', nil, nil
        r.bustX100, r.bustMs = 0, 0
        r.bets, r.order, r.cash = {}, {}, {}
        pendingBet, pendingCash = {}, {}
        return
    end

    r.phase     = 'running'
    r.startedAt = GetGameTimer()
    while true do
        local elapsed = GetGameTimer() - r.startedAt
        if elapsed >= r.bustMs then break end
        local mx = curve.multAt(elapsed)
        if mx >= r.bustX100 then break end
        resolveAutos(mx)
        pushTick(false)
        Wait(TICK_RUN_MS)
    end

    -- The last tick can fall up to 250ms short of the bust, and the curve passed through every
    -- target under it in that gap. Those targets are owed, so they settle before the loss claim.
    resolveAutos(r.bustX100 - 1)
    if pendingCash[1] then pushTick(false) end

    r.phase = 'bust'
    local losers  = claimLosers()
    local roundId = r.id
    util.pushMany(EV_BUST, watchers.targets(),
        { id = roundId, bust = r.bustX100, seed = r.seed, commit = r.commit })
    CreateThread(function() settleLosers(roundId, losers) end)
    recordHistory()
    Wait(BUST_HOLD_MS)
end

---The whole board in one reply: everything a phone opening mid-round needs to draw the correct
---frame immediately. `now` lets the client hold an offset against the server clock and run the
---multiplier locally between ticks. Nothing here leaks the bust: during the climb the multiplier
---is the one already on screen everywhere else, and time remaining is only ever sent while bets
---are open.
---@param cid string|nil citizenid of the caller, for their own bet
---@return table snapshot
function round.snapshot(cid)
    local now = GetGameTimer()

    local bets = {}
    for i = 1, #r.order do
        local bet = r.bets[r.order[i]]
        if bet and bet.stake > 0 then bets[#bets + 1] = { n = bet.name, s = bet.stake } end
    end

    local cash = {}
    for i = 1, #r.cash do cash[i] = r.cash[i] end

    local mine
    local own = cid and r.bets[cid]
    if own and own.stake > 0 then
        mine = {
            stake = own.stake, auto = own.auto, settled = own.settled,
            mx = own.mx, payout = own.payout or 0,
        }
    end

    local history = {}
    for i = 1, #r.history do history[i] = r.history[i] end

    local mx = curve.MIN_X100
    if r.phase == 'running' then
        local live = curve.multAt(now - r.startedAt)
        mx = live < r.bustX100 and live or r.bustX100
    elseif r.phase == 'bust' then
        mx = r.bustX100
    end

    -- The multiplier ceiling is configurable, and the client both re-derives the bust from the seed
    -- and offers auto targets against it. Publishing it keeps a server that lowered
    -- Crash.MaxMultiplier from turning every clamped round into a failed fairness check.
    return {
        ph        = WIRE_PHASE[r.phase] or 'idle',
        id        = r.id,
        commit    = r.commit,
        max       = curve.MAX_X100,
        now       = now,
        startedAt = r.startedAt,
        msLeft    = r.phase == 'betting' and math.max(0, r.betEndsAt - now) or 0,
        mx        = mx,
        bets      = bets,
        cash      = cash,
        mine      = mine,
        history   = history,
    }
end

---Places the caller's bet on the current round. One bet per character per round, accepted only
---while the window is open, escrowed immediately so a stake cannot be staked twice.
---@param src integer player server id
---@param payload table { amount, auto }
---@return table envelope
function round.placeBet(src, payload)
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.cooldown(cid, 'games:crashBet', BET_COOLDOWN) then return util.fail('games.slowDown', 'Slow down') end
    if r.phase ~= 'betting' then return util.fail('games.betsClosed', 'Bets are closed') end
    if r.bets[cid] then return util.fail('games.alreadyHaveBetRound', 'You already have a bet this round') end

    local amount = shared.wager(payload.amount, MIN_BET, MAX_BET)
    if not amount then return util.fail('games.enterValidAmount', 'Enter a valid amount') end

    local auto
    if payload.auto ~= nil and payload.auto ~= false then
        local target = tonumber(payload.auto)
        if not util.finite(target) then return util.fail('games.enterValidAutoCashOut', 'Enter a valid auto cash out') end
        target = math.floor(target)
        -- The ceiling itself is refused: the bust is clamped to MAX_X100, and an auto only pays
        -- when it is strictly under the bust, so a target of exactly MAX_X100 could never fire.
        if target < MIN_AUTO or target >= curve.MAX_X100 then
            return util.fail('games.enterValidAutoCashOut', 'Enter a valid auto cash out')
        end
        auto = target
    end

    -- The slot is claimed before the wallet call yields, so a double tap finds a bet already on
    -- the round instead of opening a second one against the same window.
    local roundId = r.id
    local bet = {
        cid = cid, src = src, name = shared.nameOf(src),
        stake = 0, auto = auto, settled = false,
    }
    r.bets[cid] = bet

    local bal = chips.remove(cid, amount)
    if not bal then
        r.bets[cid] = nil
        return util.fail('games.notEnoughChips', 'Not enough chips')
    end
    if r.phase ~= 'betting' or r.id ~= roundId then
        -- The window shut while the debit was in flight; the stake never joined a round, so it
        -- goes straight back rather than riding a round the player did not see open.
        r.bets[cid] = nil
        chips.add(cid, amount)
        return util.fail('games.betsClosed', 'Bets are closed')
    end

    bet.stake = amount
    r.order[#r.order + 1] = cid
    pendingBet[#pendingBet + 1] = { n = bet.name, s = amount }
    return util.ok({ stake = amount, auto = auto, chips = bal })
end

---Cashes the caller out at whatever the server's own clock says the round is worth right now. The
---request carries no multiplier: the phase flag, the round id, the settled claim and the direct
---comparison against the seed-derived bust are four independent refusals, and that bust was
---committed to before the bet was ever accepted.
---@param src integer player server id
---@param payload table { id }
---@return table envelope
function round.cashout(src, payload)
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.cooldown(cid, 'games:crashCashout', CASH_COOLDOWN) then return util.fail('games.slowDown', 'Slow down') end
    if r.phase ~= 'running' then return util.fail('games.roundOver', 'Round is over') end
    if payload.id ~= r.id then return util.fail('games.roundOver', 'Round is over') end

    local bet = r.bets[cid]
    if not bet or bet.settled or bet.stake <= 0 then return util.fail('games.noLiveBet', 'No live bet') end

    local mx = curve.multAt(GetGameTimer() - r.startedAt)
    if mx >= r.bustX100 then return util.fail('games.roundOver', 'Round is over') end

    bet.settled = true
    bet.mx      = mx
    bet.payout  = bet.stake * mx // 100

    local entry = { n = bet.name, m = mx, w = bet.payout }
    r.cash[#r.cash + 1] = entry
    pendingCash[#pendingCash + 1] = entry

    local roundId, stake, payout = r.id, bet.stake, bet.payout
    local bal = chips.add(cid, payout)
    local net = payout - stake
    stats.record(cid, 'crash', 'cpu', shared.resultFor(net), bet.name, net)
    pushSettled(bet.src, { id = roundId, stake = stake, payout = payout, mx = mx, chips = bal })
    return util.ok({ mx = mx, payout = payout, chips = bal })
end

---Voids the round and hands every unsettled stake back. Only the resource stopping justifies this:
---the round can no longer be run to its bust, so nobody's stake is riding anything, and a stake
---that was debited to a wallet has to find its way back before the round holding it is gone.
---@return table<string, integer> owed citizenid -> chips to credit back
function round.releaseAll()
    local owed = {}
    for i = 1, #r.order do
        local bet = r.bets[r.order[i]]
        if bet and not bet.settled and bet.stake > 0 then
            bet.settled = true
            owed[bet.cid] = (owed[bet.cid] or 0) + bet.stake
        end
    end
    r.phase, r.bets, r.order, r.cash = 'idle', {}, {}, {}
    return owed
end

---Marks a departed player's bet as unreachable without cancelling it. The stake stays in the
---round: an auto cash out target the curve reaches still pays, and the credit lands on the offline
---character so the balance is right the moment they log back in.
---@param cid string|nil citizenid
function round.markOffline(cid)
    if not cid then return end
    local bet = r.bets[cid]
    if bet then bet.src = nil end
end

return round
