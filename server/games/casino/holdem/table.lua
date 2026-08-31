---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Chip wallet (server.games.chips): buy-in escrow and cash-out only, never mid-hand.
local chips  = require 'server.games.chips'
---@type table Stats board (server.games.stats): the per-hand chip swing for every seat dealt in.
local stats  = require 'server.games.stats'
---@type table Casino helpers (server.games.casino.shared): the stats verdict for a signed swing.
local shared = require 'server.games.casino.shared'
---@type table Shoe (server.games.casino.deck): the shared shuffled deck, server-owned.
local deck   = require 'server.games.casino.deck'
---@type table Hand strength (server.games.casino.holdem.eval): 5-of-7 scoring at showdown.
local eval   = require 'server.games.casino.holdem.eval'
---@type table Pot layering (server.games.casino.holdem.pot): side pots and odd-chip awards.
local pot    = require 'server.games.casino.holdem.pot'
---@type table Shared server helpers (server.util): the keyed refusal envelope.
local util   = require 'server.util'
---@type fun(key: string, message?: string, vars?: table): table Keyed refusal envelope builder.
local fail   = util.fail

---@type table Hold'em settings (config.Casino.Holdem), hoisted with defaults so a config written
---before this section existed cannot leave a table with no action clock.
local C = (config.Casino or {}).Holdem or {}
---@type integer Seconds a seat has to act before the table acts for it.
local ACTION_SECONDS = C.ActionSeconds or 20
---@type boolean Whether a seat is told the category of the hand it currently holds. Read per view,
---so the answer is only ever about the seat asking and never leaks another hand.
local SHOW_HAND_STRENGTH = C.ShowHandStrength ~= false
---@type integer Grace on top of the action clock (ms), covering the round trip to a phone.
local ACTION_GRACE = 5000
---@type integer Seats at every table.
local SEATS = 6
---@type integer Consecutive missed turns before a seat is sat out.
local MISS_LIMIT = 3
---@type integer Pause between hands (ms), so a table does not deal over its own showdown.
local HAND_GAP = 3000
---@type integer Poll gap while a table is idle (ms) before it looks for players again.
local IDLE_GAP = 1000

---@type table[] Table definitions, from config. The house rooms are persistent rather than
---lobbies: hands run continuously and players sit and stand, which is what a casino floor does and
---what removes every line of invite / ready / rematch machinery. Player-opened tables below are
---the same object with an owner on it, so they inherit all of that behaviour for free.
local DEFS = C.Tables or {
    { id = 'low',  name = 'Sandy Shores', sb = 25,  bb = 50,   minBuyIn = 2000,  maxBuyIn = 10000 },
    { id = 'mid',  name = 'Vinewood',     sb = 100, bb = 200,  minBuyIn = 8000,  maxBuyIn = 40000 },
    { id = 'high', name = 'Diamond',      sb = 500, bb = 1000, minBuyIn = 40000, maxBuyIn = 200000 },
}

---@type table Player-table settings (config.Casino.Holdem.PlayerTables), hoisted with defaults for
---the same reason ACTION_SECONDS is: a config written before this section existed still boots.
local PT = C.PlayerTables or {}
---@type boolean Whether players may open tables of their own at all.
local PT_ENABLED = PT.Enabled ~= false
---@type integer Tables one character may have open at a time.
local PT_MAX_PER_PLAYER = math.max(1, math.floor(PT.MaxPerPlayer or 1))
---@type integer Player tables allowed on the floor at once; the house rooms do not count.
local PT_MAX_TOTAL = math.max(1, math.floor(PT.MaxTotal or 8))
---@type integer Smallest small blind a player may pick.
local PT_MIN_BLIND = math.max(1, math.floor(PT.MinBlind or 5))
---@type integer Largest small blind a player may pick.
local PT_MAX_BLIND = math.max(PT_MIN_BLIND, math.floor(PT.MaxBlind or 2500))
---@type integer Floor on the min buy-in, counted in big blinds. Twenty big blinds is the shortest
---stack that can still play a hand rather than shove it.
local PT_MIN_BUYIN_BB = math.max(2, math.floor(PT.MinBuyInBB or 20))
---@type integer Ceiling on the max buy-in, counted in big blinds.
local PT_MAX_BUYIN_BB = math.max(PT_MIN_BUYIN_BB, math.floor(PT.MaxBuyInBB or 400))
---@type integer Characters kept from the name the creator typed.
local PT_NAME_MAX = math.max(3, math.floor(PT.NameMax or 24))
---@type integer How long a player table may sit with every chair empty (ms) before it is closed.
local PT_EMPTY_MS = math.max(30000, math.floor((tonumber(PT.EmptyMinutes) or 5) * 60000))
---@type integer Largest multiple of the small blind a big blind may be set to. Two is the real
---game and three is as far as a straddled table ever stretches; past that it is a different game
---and the numbers on the lobby row stop meaning what a player reads them to mean.
local PT_BB_MAX_RATIO = 3
---@type integer[] Small blinds the create sheet offers, the standard ladder trimmed to the config
---range. The server owns the ladder so the phone can only ever offer a stake this file accepts.
local PT_BLIND_LADDER = {}
for _, step in ipairs({ 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000 }) do
    if step >= PT_MIN_BLIND and step <= PT_MAX_BLIND then PT_BLIND_LADDER[#PT_BLIND_LADDER + 1] = step end
end
if #PT_BLIND_LADDER == 0 then PT_BLIND_LADDER[1] = PT_MIN_BLIND end

---@type table<string, string> Street to the one that follows it.
local NEXT_STREET = { preflop = 'flop', flop = 'turn', turn = 'river' }
---@type table<string, integer> Board cards dealt when a street opens.
local STREET_CARDS = { flop = 3, turn = 1, river = 1 }

---@type table Hold'em module; the table returned at end of file. Owns every rule and all pot
---arithmetic: the client sends an intent and renders what it is told, and the legal actions its
---buttons are drawn from are computed here too, so a tampered client can only ask for a move the
---server was going to refuse anyway.
local holdem = {}

---@type table<string, table> Live tables by id.
local rooms = {}
---@type table[] The same tables in config order, for the lobby list and the tick.
local order = {}
---@type table<string, string> citizenid -> the table id they are seated at. One seat per character
---across the whole casino: two seats would let one player act on both sides of the same pot.
local seated = {}
---@type integer Serial behind player table ids. Never reused inside a session, so a table that has
---just been closed cannot have a stale phone still pointed at its id find the new one in its place.
local nextTableId = 0

holdem.rooms = rooms

---@param i integer seat index
---@return table seat a blank seat, the only shape an unoccupied chair ever has
local function emptySeat(i)
    return {
        i = i, cid = nil, src = nil, name = nil, stack = 0, committed = 0, contributed = 0,
        hole = nil, best = nil, cat = nil, revealed = false, acted = false, mayRaise = true,
        state = 'empty', misses = 0, leaving = false, buying = false, dealtIn = false,
    }
end

---Builds a room. House rooms and player rooms differ only in the owner fields, so every rule below
---this line reads one shape and no path has to ask which kind of table it is holding.
---@param def table definition { id, name, sb, bb, minBuyIn, maxBuyIn }
---@param owner string|nil citizenid of the player who opened it, nil for a house room
---@param ownerName string|nil display name of that player
---@return table T
local function newRoom(def, owner, ownerName)
    local T = {
        id = tostring(def.id), name = tostring(def.name or def.id),
        sb = math.floor(def.sb or 25), bb = math.floor(def.bb or 50),
        minBuyIn = math.floor(def.minBuyIn or 1000), maxBuyIn = math.floor(def.maxBuyIn or 10000),
        seats = {}, button = 0, handId = 0, street = 'idle', board = {}, shoe = nil,
        betToCall = 0, minRaise = 0, actor = nil, deadline = 0, nextStartAt = 0,
        pots = {}, frozen = false, escrow = 0, lastAggressor = nil,
        owner = owner, ownerName = ownerName, emptySince = nil,
    }
    for i = 1, SEATS do T.seats[i] = emptySeat(i) end
    return T
end

for n = 1, #DEFS do
    local T = newRoom(DEFS[n], nil, nil)
    rooms[T.id] = T
    order[#order + 1] = T
end

---@param s table seat
---@return boolean live true when the seat can still be asked to act
local function isLive(s) return s.state == 'in' end
---@param s table seat
---@return boolean contender true when the seat can still win chips this hand
local function isContender(s) return s.state == 'in' or s.state == 'allin' end
---Predicate for the seats this table would deal into. One big blind is the bar rather than one
---chip: a shorter stack could only post a token all-in blind and be swept out again at hand end,
---which is a hand nobody at the table asked for. sweepSeats stands those seats up instead, so a
---chair is never left holding a stack it can do nothing with.
---@param T table table
---@return fun(seat: table): boolean ready
local function readyAt(T)
    return function(s)
        return s.cid ~= nil and not s.leaving and not s.buying and s.stack >= T.bb and s.state ~= 'sitout'
    end
end
---@param _ table seat
---@return boolean always true, for a full ring walk
local function anySeat(_) return true end

---@param i integer seat index
---@return integer index the seat one place anticlockwise
local function prevIndex(i) return ((i - 2) % SEATS) + 1 end

---Next seat clockwise from `from` (exclusive) that `match` accepts. A `from` of 0 starts at seat 1.
---@param T table table
---@param from integer seat index to start after
---@param match fun(seat: table): boolean
---@return integer|nil seat index, nil when no seat matches
local function nextSeat(T, from, match)
    for step = 1, SEATS do
        local i = ((from - 1 + step) % SEATS) + 1
        if match(T.seats[i]) then return i end
    end
    return nil
end

---Every matching seat clockwise from `from` (exclusive). Blind order, postflop action order and the
---odd-chip order are all this one walk, so they cannot drift apart.
---@param T table table
---@param from integer seat index to start after
---@param match fun(seat: table): boolean
---@return integer[] seats
local function ringFrom(T, from, match)
    local out = {}
    for step = 1, SEATS do
        local i = ((from - 1 + step) % SEATS) + 1
        if match(T.seats[i]) then out[#out + 1] = i end
    end
    return out
end

---@param T table table
---@param match fun(seat: table): boolean
---@return integer count seats matching
local function count(T, match)
    local n = 0
    for i = 1, SEATS do
        if match(T.seats[i]) then n = n + 1 end
    end
    return n
end

---@param T table table
---@param cid string citizenid
---@return table|nil seat the seat that character occupies at this table
local function seatOf(T, cid)
    for i = 1, SEATS do
        if T.seats[i].cid == cid then return T.seats[i] end
    end
    return nil
end

---Every chip the table escrowed is either in a stack or in the pot. Checked at each street boundary
---and at hand end because it is the single assertion that catches a rule change minting or burning
---chips, long before a player notices.
---@param T table table
---@return boolean balanced
local function balanced(T)
    local sum = 0
    for i = 1, SEATS do sum = sum + T.seats[i].stack + T.seats[i].contributed end
    return sum == T.escrow
end

---Stops a table dead and stops paying anybody. A pot that does not add up is chips minted or
---burned, and the only safe move is to leave every stack where it is and say so loudly.
---@param T table table
---@param why string reason for the console line
local function freeze(T, why)
    T.frozen = true
    T.actor = nil
    print(("^1[sd-phone] hold'em table %s frozen: %s^7"):format(T.id, why))
end

---@type fun(T: table) Pushes the per-seat view; assigned below holdem.view, which it reads.
local push

---Takes a seat's chips out of the table's escrow and hands the amount to the caller to credit. The
---wallet write is the caller's because it awaits: the table thread must never block on the
---database, and the leave callback wants the balance the wallet returned.
---@param T table table
---@param s table seat
---@return integer amount chips removed from the table
local function takeStack(T, s)
    local amount = s.stack > 0 and s.stack or 0
    s.stack = 0
    T.escrow = T.escrow - amount
    return amount
end

---Credits a stack back off-thread. Used by every path that is not a player waiting on a callback.
---@param cid string|nil citizenid
---@param amount integer chips
local function creditLater(cid, amount)
    if not cid or amount <= 0 then return end
    CreateThread(function() chips.add(cid, amount) end)
end

---Stands up every seat that asked to leave, sat out, or is short of a big blind. Only ever called
---between hands: a seat with chips in a live pot has to stay until that pot is settled. The short
---stack goes back to the wallet rather than sitting in a chair that can no longer be dealt into,
---so buying back in is the player's decision and not something the table quietly did for them.
---@param T table table
local function sweepSeats(T)
    for i = 1, SEATS do
        local s = T.seats[i]
        if s.cid and not s.buying and (s.leaving or s.state == 'sitout' or s.stack < T.bb) then
            local cid = s.cid
            local amount = takeStack(T, s)
            seated[cid] = nil
            T.seats[i] = emptySeat(i)
            creditLater(cid, amount)
        end
    end
end

---Moves chips from a seat's stack into the pot. The only place a stack shrinks during a hand, so
---the all-in flip lives here and cannot be forgotten by a caller.
---@param s table seat
---@param amount integer chips to put in
local function commit(s, amount)
    amount = math.floor(amount)
    if amount < 0 then amount = 0 end
    if amount > s.stack then amount = s.stack end
    s.stack = s.stack - amount
    s.committed = s.committed + amount
    s.contributed = s.contributed + amount
    if s.stack == 0 then s.state = 'allin' end
end

---What a seat may do right now. The client renders its buttons straight off this, so the same
---function answers "what can I press" and "was that press allowed".
---@param T table table
---@param s table seat
---@return table legal { fold, check, call, callAmount, minRaiseTo, maxRaiseTo }
local function legalFor(T, s)
    local toCall = T.betToCall - s.committed
    if toCall < 0 then toCall = 0 end
    local minTo, maxTo = 0, 0
    if s.mayRaise and s.stack > 0 and (s.committed + s.stack) > T.betToCall then
        maxTo = s.committed + s.stack
        minTo = math.min(T.betToCall + T.minRaise, maxTo)
    end
    return {
        fold = true,
        check = toCall == 0,
        call = toCall > 0 and s.stack > 0,
        callAmount = math.min(toCall, s.stack),
        minRaiseTo = minTo,
        maxRaiseTo = maxTo,
    }
end

---The pot layers as they stand, built from what has already been swept in off closed streets. This
---street's bets sit in front of the seats instead, which is where the felt puts them.
---@param T table table
---@return table[] pots
local function potsFor(T)
    local contrib, folded = {}, {}
    for i = 1, SEATS do
        local s = T.seats[i]
        if s.dealtIn then
            contrib[i] = s.contributed
            folded[i] = s.state == 'folded'
        end
    end
    local layers = pot.build(contrib, folded)
    return layers
end

---One seat's view of the table. Every other seat's hole cards are absent until they are revealed at
---showdown, so the secret half of the game never leaves the server for the wrong phone.
---@param T table table
---@param cid string|nil citizenid of the viewer (nil for a player who has not sat down)
---@return table view HoldemStatePush
---The category of the hand a seat currently holds, as an i18n key for handCatLabel. Preflop there
---are only two cards, which best7 refuses to score, so the pocket pair is read off directly.
---@param s table seat
---@param board table[] community cards so far
---@return string? key nil when the seat has no cards or the feature is off
local function rankFor(s, board)
    if not SHOW_HAND_STRENGTH or not s.hole or #s.hole < 2 then return nil end
    if #board == 0 then
        return s.hole[1].rank == s.hole[2].rank and 'pair' or 'highCard'
    end
    local cards = { s.hole[1], s.hole[2] }
    for i = 1, #board do cards[#cards + 1] = board[i] end
    return eval.describe((eval.best7(cards)))
end

function holdem.view(T, cid)
    local seats = {}
    for i = 1, SEATS do
        local s = T.seats[i]
        local me = cid ~= nil and s.cid == cid
        seats[i] = {
            i = i,
            name = s.name,
            stack = s.stack,
            committed = s.committed,
            state = s.state,
            hole = ((me or s.revealed) and s.hole) or nil,
            me = me,
        }
    end
    local handRank
    for i = 1, SEATS do
        local s = T.seats[i]
        if cid and s.cid == cid and (s.state == 'in' or s.state == 'allin') then
            handRank = rankFor(s, T.board)
        end
    end

    local legal
    local actorSeat = T.actor and T.seats[T.actor]
    if actorSeat and cid and actorSeat.cid == cid and actorSeat.state == 'in' then
        legal = legalFor(T, actorSeat)
    end
    return {
        tableId = T.id, handId = T.handId, street = T.street, button = T.button,
        actor = T.actor, deadline = T.deadline, now = GetGameTimer(),
        board = T.board, pots = T.pots, seats = seats, legal = legal,
        handRank = handRank, sb = T.sb, bb = T.bb,
    }
end

push = function(T)
    for i = 1, SEATS do
        local s = T.seats[i]
        if s.src and s.cid and GetPlayerName(s.src) then
            TriggerClientEvent('sd-phone:client:holdem:state', s.src, holdem.view(T, s.cid))
        end
    end
end

---A street is over when every seat that can still act has acted and matched the bet. That one
---condition already covers "action came back round to the aggressor", so no separate bookkeeping
---decides when to deal the next card.
---@param T table table
---@return boolean closed
local function streetClosed(T)
    for i = 1, SEATS do
        local s = T.seats[i]
        if s.state == 'in' and (not s.acted or s.committed ~= T.betToCall) then return false end
    end
    return true
end

---Opens the next street: sweeps the bets in, deals the board and hands action to the first live
---seat after the button.
---@param T table table
---@param street string street to open
local function openStreet(T, street)
    for i = 1, SEATS do
        local s = T.seats[i]
        s.committed = 0
        s.acted = false
        s.mayRaise = true
    end
    T.betToCall = 0
    T.minRaise = T.bb
    T.lastAggressor = nil
    T.street = street
    T.pots = potsFor(T)
    for _ = 1, (STREET_CARDS[street] or 0) do
        T.board[#T.board + 1] = deck.draw(T.shoe)
    end
    T.actor = nextSeat(T, T.button, isLive)
    if not balanced(T) then freeze(T, 'stacks and pot do not match the buy-ins at the ' .. street) end
end

---Closes the hand out: the last push, the seat states everyone goes back to, and the stand-up
---sweep for anyone who left, sat out or busted.
---@param T table table
---@param layers table[] final pot layers
---@param awards table[] { seat, amount } per winning seat
---@param shown table[] revealed hands in showdown order
local function finishHand(T, layers, awards, shown)
    T.pots = layers
    T.street = 'showdown'
    T.actor = nil
    T.deadline = 0
    T.nextStartAt = GetGameTimer() + HAND_GAP

    local payload = { tableId = T.id, handId = T.handId, pots = layers, awards = awards, shown = shown }
    for i = 1, SEATS do
        local s = T.seats[i]
        if s.src and s.cid and GetPlayerName(s.src) then
            TriggerClientEvent('sd-phone:client:holdem:hand', s.src, payload)
        end
    end

    for i = 1, SEATS do
        local s = T.seats[i]
        s.acted, s.mayRaise = false, true
        if s.cid then
            if s.state ~= 'sitout' then s.state = 'sitting' end
            if s.misses >= MISS_LIMIT then s.state = 'sitout' end
        end
    end
    if not balanced(T) then freeze(T, 'stacks and pot do not match the buy-ins after the award') end
    push(T)
    sweepSeats(T)
    push(T)
end

---Settles the hand: layers the pot, evaluates whatever is left, awards it and records the swing.
---@param T table table
local function settle(T)
    local contenders = ringFrom(T, T.button, isContender)

    if #contenders == 0 then
        -- Every dealt-in seat folded or walked away. There is nobody to award the pot to, so each
        -- seat takes back exactly what it put in rather than the chips going nowhere.
        for i = 1, SEATS do
            local s = T.seats[i]
            s.stack = s.stack + s.contributed
            s.contributed, s.committed = 0, 0
        end
        return finishHand(T, {}, {}, {})
    end

    local contrib, folded = {}, {}
    for i = 1, SEATS do
        local s = T.seats[i]
        if s.dealtIn then
            contrib[i] = s.contributed
            folded[i] = s.state == 'folded'
        end
    end
    local layers, refunds, ok = pot.build(contrib, folded)
    if not ok then
        freeze(T, 'the pot layers do not add up to the contributions')
        push(T)
        return
    end

    local scores, shown = {}, {}
    if #contenders > 1 then
        for _, i in ipairs(contenders) do
            local s = T.seats[i]
            local seven = { s.hole[1], s.hole[2] }
            for k = 1, #T.board do seven[#seven + 1] = T.board[k] end
            local score, best = eval.best7(seven)
            scores[i] = score
            s.revealed = true
            s.best = best
            s.cat = eval.describe(score)
        end
        -- Last aggressor on the river shows first, then clockwise; a checked-through river starts at
        -- the first live seat after the button. Every live hand is revealed: a hidden losing hand on
        -- a public server only ever reads as the house cheating.
        local from = T.lastAggressor and prevIndex(T.lastAggressor) or T.button
        for _, i in ipairs(ringFrom(T, from, isContender)) do
            local s = T.seats[i]
            shown[#shown + 1] = { seat = i, hole = s.hole, best = s.best, cat = s.cat }
        end
    end

    local ring = ringFrom(T, T.button, anySeat)
    local _, totals = pot.award(layers, scores, ring)

    local records, awards = {}, {}
    for i = 1, SEATS do
        local s = T.seats[i]
        local back = (refunds[i] or 0) + (totals[i] or 0)
        if s.dealtIn and s.cid then
            records[#records + 1] = { cid = s.cid, name = s.name, net = back - s.contributed }
        end
        s.stack = s.stack + back
        s.contributed, s.committed = 0, 0
    end
    for _, i in ipairs(ring) do
        if (totals[i] or 0) > 0 then awards[#awards + 1] = { seat = i, amount = totals[i] } end
    end

    -- The wallet only moves at sit and stand, so the boards would otherwise never see a hand. The
    -- record awaits and the table thread must not, so it is spawned with everything already copied.
    if #records > 0 then
        CreateThread(function()
            for k = 1, #records do
                local r = records[k]
                stats.record(r.cid, 'holdem', 'online', shared.resultFor(r.net), r.name, r.net)
            end
        end)
    end

    finishHand(T, layers, awards, shown)
end

---Carries the hand as far as it can go without another player action: closing streets, dealing the
---board out when nobody can bet any more, and settling. Called after every action.
---@param T table table
local function run(T)
    while not T.frozen do
        if count(T, isContender) <= 1 then return settle(T) end
        if T.actor and not streetClosed(T) then
            T.deadline = GetGameTimer() + ACTION_SECONDS * 1000 + ACTION_GRACE
            return push(T)
        end
        if not NEXT_STREET[T.street] then return settle(T) end
        openStreet(T, NEXT_STREET[T.street])
        -- One seat left with chips behind and everyone else all-in: there is no bet to make, so the
        -- rest of the board runs out with no action rather than offering a pointless bet button.
        if count(T, isLive) < 2 then T.actor = nil end
    end
end

---Applies a validated action to the acting seat.
---@param T table table
---@param s table seat
---@param action any client-supplied action
---@param to any client-supplied raise total (ignored for every other action)
---@return boolean applied false when the action was not legal for this seat
local function applyAction(T, s, action, to)
    local legal = legalFor(T, s)

    if action == 'fold' then
        s.state = 'folded'
        s.acted = true
        return true
    end

    if action == 'check' then
        if not legal.check then return false end
        s.acted = true
        return true
    end

    if action == 'call' then
        if not legal.call then return false end
        commit(s, legal.callAmount)
        s.acted = true
        return true
    end

    if action ~= 'raise' then return false end
    if legal.maxRaiseTo <= 0 then return false end
    local total = tonumber(to)
    if not total or total ~= total or total == math.huge or total == -math.huge then return false end
    total = math.floor(total)
    if total > legal.maxRaiseTo then total = legal.maxRaiseTo end
    if total <= T.betToCall then return false end
    -- A raise is legal at the full increment, or as an all-in for whatever is left. legal.minRaiseTo
    -- is already clamped to the stack, so the full-raise threshold is recomputed here rather than
    -- read back off it: a short all-in must never be mistaken for a full raise.
    local fullTo = T.betToCall + T.minRaise
    if total < fullTo and total ~= s.committed + s.stack then return false end

    commit(s, total - s.committed)
    s.acted = true

    if total >= fullTo then
        T.minRaise = total - T.betToCall
        T.betToCall = total
        for i = 1, SEATS do
            local o = T.seats[i]
            if o ~= s and o.state == 'in' then
                o.acted = false
                o.mayRaise = true
            end
        end
    else
        -- An all-in for less than a full raise does not reopen the betting. The seats behind it
        -- still owe the difference, so they act again, but a seat that had already acted may only
        -- call or fold. Handing that seat its raise button back is what quietly gives pots away.
        T.betToCall = total
        for i = 1, SEATS do
            local o = T.seats[i]
            if o ~= s and o.state == 'in' and o.committed < T.betToCall then
                if o.acted then o.mayRaise = false end
                o.acted = false
            end
        end
    end
    T.lastAggressor = s.i
    return true
end

---Deals a hand. Returns false when the table cannot fill two seats, which leaves it idle.
---@param T table table
---@return boolean started
local function startHand(T)
    if T.frozen then return false end
    sweepSeats(T)
    if count(T, readyAt(T)) < 2 then
        T.street = 'idle'
        T.actor = nil
        T.nextStartAt = GetGameTimer() + IDLE_GAP
        return false
    end

    T.handId = T.handId + 1
    T.board = {}
    T.pots = {}
    T.shoe = deck.fresh(1)
    T.street = 'preflop'
    T.lastAggressor = nil

    local ready = readyAt(T)
    for i = 1, SEATS do
        local s = T.seats[i]
        s.committed, s.contributed = 0, 0
        s.acted, s.mayRaise, s.revealed = false, true, false
        s.hole, s.best, s.cat = nil, nil, nil
        s.dealtIn = false
        if ready(s) then
            s.state = 'in'
            s.dealtIn = true
        elseif s.cid and s.state ~= 'sitout' then
            s.state = 'sitting'
        end
    end

    -- The button moves to the next seat actually in the hand, so an empty chair or a player who
    -- just busted never swallows a rotation.
    T.button = nextSeat(T, T.button, function(s) return s.dealtIn end) or T.button
    local dealt = ringFrom(T, T.button, function(s) return s.dealtIn end)

    for _ = 1, 2 do
        for k = 1, #dealt do
            local s = T.seats[dealt[k]]
            s.hole = s.hole or {}
            s.hole[#s.hole + 1] = deck.draw(T.shoe)
        end
    end

    -- Heads-up, the button posts the small blind and acts first before the flop, then acts last on
    -- every street after it. This is the rule most often inverted; ringFrom starts after the button
    -- so dealt[1] is the other seat, and both orders fall out of that same walk.
    local sbSeat, bbSeat
    if #dealt == 2 then
        sbSeat, bbSeat = T.button, dealt[1]
    else
        sbSeat, bbSeat = dealt[1], dealt[2]
    end
    commit(T.seats[sbSeat], T.sb)
    commit(T.seats[bbSeat], T.bb)

    -- A blind larger than a short stack posts all-in for what is there, and the bet to call stays
    -- the big blind: a short blind does not make the hand cheaper for everybody else.
    T.betToCall = T.bb
    for k = 1, #dealt do
        local s = T.seats[dealt[k]]
        if s.committed > T.betToCall then T.betToCall = s.committed end
    end
    T.minRaise = T.bb
    T.lastAggressor = bbSeat
    -- The big blind's option: it has matched the bet but has not acted, so it may still raise.
    T.seats[bbSeat].acted = false
    T.actor = nextSeat(T, bbSeat, isLive)

    if not balanced(T) then freeze(T, 'stacks and pot do not match the buy-ins at the deal') end
    run(T)
    return true
end

---Takes a seat off the table. In a hand the seat folds first: chips already in the pot were bet,
---not deposited, so only the stack in front of it comes back - and it comes back now rather than at
---hand end, which is what stops the same chips walking into another seat in the same hand.
---
---A seat that is already all-in is left in the hand instead. It has no stack to hand back and no
---decision left to make, and folding it would gift away a pot it may well have won.
---@param T table table
---@param s table seat
---@return integer amount chips taken off the table
local function dropSeat(T, s)
    local cid = s.cid
    local wasActor = T.actor == s.i
    local wasContender = isContender(s)
    local liveHand = s.dealtIn and T.street ~= 'idle' and T.street ~= 'showdown'

    if s.state == 'in' then
        s.state = 'folded'
        s.acted = true
    end
    s.leaving = true
    local amount = takeStack(T, s)

    if liveHand then
        -- The chair stays until the pot is settled. Emptying it here would take this seat's
        -- contribution out of the pot with it, which is chips vanishing off the table.
        if wasContender then
            if wasActor then T.actor = nextSeat(T, s.i, isLive) end
            run(T)
        end
    else
        seated[cid] = nil
        T.seats[s.i] = emptySeat(s.i)
    end
    push(T)
    return amount
end

---Sits a character down with a buy-in escrowed out of the chip wallet. The stack then lives in
---server memory for the whole session: one debit here and one credit on the way out, which is what
---makes the chip invariant a single subtraction instead of a per-hand ledger.
---@param src integer player server id
---@param cid string citizenid
---@param name string display name
---@param tableId any client-supplied table id
---@param seatIndex any client-supplied seat index
---@param buyIn any client-supplied buy-in
---@return table|nil view seat view, nil on refusal
---@return table? refusal keyed refusal envelope when view is nil
function holdem.sit(src, cid, name, tableId, seatIndex, buyIn)
    local T = rooms[tostring(tableId)]
    if not T then return nil, fail('games.tableNotFound', 'Table not found') end
    if T.frozen then return nil, fail('games.tableClosed', 'Table is closed') end
    if seated[cid] then return nil, fail('games.alreadySeatedTable', 'You are already seated at a table') end

    local index = tonumber(seatIndex)
    index = index and math.floor(index) or 0
    if index < 1 or index > SEATS then return nil, fail('games.seatNotFound', 'Seat not found') end
    local s = T.seats[index]
    if s.cid then return nil, fail('games.seatTaken', 'Seat taken') end

    local amount = tonumber(buyIn)
    if not amount or amount ~= amount or amount == math.huge or amount == -math.huge then
        return nil, fail('games.enterValidAmount', 'Enter a valid amount')
    end
    amount = math.floor(amount)
    if amount < T.minBuyIn or amount > T.maxBuyIn then
        return nil, fail('games.buyOutsideTableLimits', 'Buy in is outside the table limits')
    end

    -- Claimed before the debit: chips.remove awaits, and a second holdemSit inside that window would
    -- otherwise buy the same chair twice. `buying` also keeps the stand-up sweep off a chair that is
    -- legitimately holding a zero stack for the length of one database round trip.
    seated[cid] = T.id
    s.cid, s.name, s.src, s.state, s.buying = cid, name, src, 'sitting', true

    local bal = chips.remove(cid, amount)
    if not bal then
        seated[cid] = nil
        T.seats[index] = emptySeat(index)
        return nil, fail('games.notEnoughChips', 'Not enough chips')
    end

    s.buying = false
    s.stack = amount
    T.escrow = T.escrow + amount
    if (T.street == 'idle' or T.street == 'showdown') and count(T, readyAt(T)) >= 2 then
        local soon = GetGameTimer() + HAND_GAP
        if T.nextStartAt > soon then T.nextStartAt = soon end
    end
    push(T)
    return holdem.view(T, cid), nil
end

---Stands a character up. The caller credits the returned amount, because that write awaits.
---@param cid string citizenid
---@return integer|nil amount chips coming off the table, nil when they are not seated
---@return table? refusal keyed refusal envelope when amount is nil
function holdem.leave(cid)
    local tableId = seated[cid]
    if not tableId then return nil, fail('games.notSeated', 'Not seated') end
    local T = rooms[tableId]
    if not T then
        seated[cid] = nil
        return nil, fail('games.notSeated', 'Not seated')
    end
    local s = seatOf(T, cid)
    if not s then
        seated[cid] = nil
        return nil, fail('games.notSeated', 'Not seated')
    end
    return dropSeat(T, s)
end

---A dropped connection is a leave: the same fold, the same immediate credit. Refunding the pot
---instead would make pulling the plug a free option on every losing hand.
---@param cid string|nil citizenid
function holdem.dropped(cid)
    if not cid then return end
    local tableId = seated[cid]
    if not tableId then return end
    local T = rooms[tableId]
    if not T then
        seated[cid] = nil
        return
    end
    local s = seatOf(T, cid)
    if not s then
        seated[cid] = nil
        return
    end
    creditLater(cid, dropSeat(T, s))
end

---Plays one action for the seat whose turn it is.
---@param cid string citizenid
---@param tableId any client-supplied table id
---@param handId any client-supplied hand id, the stale-action guard
---@param action any client-supplied action
---@param to any client-supplied raise total
---@return table|nil result empty on success (the state arrives by push), nil on refusal
---@return table? refusal keyed refusal envelope when result is nil
function holdem.act(cid, tableId, handId, action, to)
    local T = rooms[tostring(tableId)]
    if not T then return nil, fail('games.tableNotFound', 'Table not found') end
    if T.frozen then return nil, fail('games.tableClosed', 'Table is closed') end
    local hand = tonumber(handId)
    if not hand or math.floor(hand) ~= T.handId then return nil, fail('games.handHasMovedOn', 'That hand has moved on') end

    local s = T.actor and T.seats[T.actor]
    if not s or s.cid ~= cid or s.state ~= 'in' then return nil, fail('games.notTurn', 'Not your turn') end
    if not applyAction(T, s, action, to) then return nil, fail('games.moveNotAllowed', 'That move is not allowed') end

    s.misses = 0
    T.actor = nextSeat(T, s.i, isLive)
    run(T)
    return {}
end

---The view for a late join or an app re-open, and where a reconnected player's source is refreshed
---so the pushes find them again.
---@param cid string citizenid
---@param tableId any client-supplied table id
---@param src integer player server id
---@return table|nil view, nil when the table id is not one of ours
---@return table? refusal keyed refusal envelope when view is nil
function holdem.sync(cid, tableId, src)
    local T = rooms[tostring(tableId)]
    if not T then return nil, fail('games.tableNotFound', 'Table not found') end
    local s = seatOf(T, cid)
    if s then s.src = src end
    return holdem.view(T, cid), nil
end

---@param v any client-supplied number
---@param fallback integer used when the client sent something that is not a finite number
---@return integer n
local function intOr(v, fallback)
    local n = tonumber(v)
    if not n or n ~= n or n == math.huge or n == -math.huge then return fallback end
    return math.floor(n)
end

---@param n integer value
---@param lo integer floor
---@param hi integer ceiling
---@return integer clamped
local function clamp(n, lo, hi)
    if n < lo then return lo end
    if n > hi then return hi end
    return n
end

---Trims a client-supplied table name down to something safe to print on a lobby row. Control
---characters go (one newline is enough to break the row apart), colour codes go (a table could
---otherwise repaint the list around it), whitespace runs collapse, and what is left is cut to
---PT_NAME_MAX whole characters. The cut counts characters and not bytes: slicing a multi-byte
---sequence in half produces a string the JSON encoder cannot represent, which would take the whole
---lobby reply down rather than just one name.
---@param raw any client-supplied name
---@param fallback string name used when nothing printable survives
---@return string name
local function cleanName(raw, fallback)
    local text = type(raw) == 'string' and raw or ''
    text = text:gsub('%^%d', ' '):gsub('%c', ' ')
    if not utf8.len(text) then text = text:gsub('[\128-\255]', '') end
    text = text:gsub('%s+', ' '):gsub('^ ', ''):gsub(' $', '')

    local len = utf8.len(text) or #text
    if len > PT_NAME_MAX then
        local cut = utf8.offset(text, PT_NAME_MAX + 1)
        text = (cut and text:sub(1, cut - 1) or text:sub(1, PT_NAME_MAX)):gsub(' $', '')
    end
    if text == '' then return fallback end
    return text
end

---@param cid string|nil citizenid to count tables for, nil to count only the floor total
---@return integer mine tables this character owns
---@return integer total player tables open
local function countPlayerTables(cid)
    local mine, total = 0, 0
    for n = 1, #order do
        local T = order[n]
        if T.owner then
            total = total + 1
            if cid and T.owner == cid then mine = mine + 1 end
        end
    end
    return mine, total
end

---@return table limits the bounds the create sheet is allowed to offer
function holdem.createLimits()
    return {
        enabled = PT_ENABLED,
        nameMax = PT_NAME_MAX,
        blinds = PT_BLIND_LADDER,
        bbRatioMax = PT_BB_MAX_RATIO,
        minBuyInBB = PT_MIN_BUYIN_BB,
        maxBuyInBB = PT_MAX_BUYIN_BB,
    }
end

---Opens a table on the settings a player asked for. Nothing in `opts` is believed: every number is
---clamped into the config bounds and the name is sanitised, so the worst a tampered phone can do is
---open a table it could have opened through the sheet anyway. The blind ratio is held near 2x
---because the lobby row shows one stake line and a 40x big blind would make that line a lie, and
---the buy-in is squared onto whole big blinds so a stack always covers a round number of them.
---@param cid string citizenid of the creator
---@param ownerName string display name of the creator
---@param opts any client-supplied { name, sb, bb, minBuyIn, maxBuyIn }
---@return string|nil id the new table id, nil on refusal
---@return table? refusal keyed refusal envelope when id is nil
function holdem.create(cid, ownerName, opts)
    if not PT_ENABLED then
        return nil, fail('games.playersCannotOpenTables', 'Players cannot open tables here')
    end
    opts = type(opts) == 'table' and opts or {}

    local mine, total = countPlayerTables(cid)
    if mine >= PT_MAX_PER_PLAYER then
        if PT_MAX_PER_PLAYER == 1 then
            return nil, fail('games.alreadyHaveTableOpen', 'You already have a table open. Close that one first.')
        end
        return nil, fail('games.alreadyHaveTablesOpen', 'You already have {n} tables open', { n = mine })
    end
    if total >= PT_MAX_TOTAL then
        return nil, fail('games.floorFullRightNow', 'The floor is full right now, try again when a table closes')
    end

    local sb = clamp(intOr(opts.sb, PT_MIN_BLIND), PT_MIN_BLIND, PT_MAX_BLIND)
    local bb = clamp(intOr(opts.bb, sb * 2), sb * 2, sb * PT_BB_MAX_RATIO)
    local floorBuyIn, ceilBuyIn = bb * PT_MIN_BUYIN_BB, bb * PT_MAX_BUYIN_BB
    local minBuyIn = clamp(intOr(opts.minBuyIn, floorBuyIn), floorBuyIn, ceilBuyIn)
    minBuyIn = math.max(floorBuyIn, minBuyIn - (minBuyIn % bb))
    local maxBuyIn = clamp(intOr(opts.maxBuyIn, minBuyIn * 4), minBuyIn, ceilBuyIn)
    maxBuyIn = math.max(minBuyIn, maxBuyIn - (maxBuyIn % bb))

    local owner = tostring(ownerName or 'A player')
    local id
    repeat
        nextTableId = nextTableId + 1
        id = ('pt%d'):format(nextTableId)
    until not rooms[id]

    local T = newRoom({
        id = id, name = cleanName(opts.name, owner .. "'s table"),
        sb = sb, bb = bb, minBuyIn = minBuyIn, maxBuyIn = maxBuyIn,
    }, cid, owner)
    T.emptySince = GetGameTimer()
    rooms[id] = T
    order[#order + 1] = T
    return id, nil
end

---@return table[] tables the lobby list
function holdem.tables()
    local out = {}
    for n = 1, #order do
        local T = order[n]
        local nSeated, nPlaying = 0, 0
        for i = 1, SEATS do
            local s = T.seats[i]
            if s.cid then nSeated = nSeated + 1 end
            if s.dealtIn and isContender(s) then nPlaying = nPlaying + 1 end
        end
        out[n] = {
            id = T.id, name = T.name, sb = T.sb, bb = T.bb,
            minBuyIn = T.minBuyIn, maxBuyIn = T.maxBuyIn,
            seated = nSeated, playing = nPlaying,
            custom = T.owner ~= nil, ownerName = T.ownerName,
        }
    end
    return out
end

---Closes player tables nobody is sitting at. A table opened for a game that never filled would
---otherwise stay on the lobby list for the rest of the session, and the list would only ever grow.
---House rooms are skipped, and a table is only removed with every chair empty, so this can never
---take a stack or a live pot with it.
---@param now integer game timer (ms)
local function sweepPlayerTables(now)
    for n = #order, 1, -1 do
        local T = order[n]
        if T.owner then
            local busy = false
            for i = 1, SEATS do
                if T.seats[i].cid then
                    busy = true
                    break
                end
            end
            if busy then
                T.emptySince = nil
            else
                T.emptySince = T.emptySince or now
                if now - T.emptySince >= PT_EMPTY_MS then
                    rooms[T.id] = nil
                    table.remove(order, n)
                end
            end
        end
    end
end

---One pass of the table clock: expired action timers first, then hands that are due to start. The
---countdown itself is client-local from `deadline` and `now`, so no clock is ever broadcast.
function holdem.tick()
    local now = GetGameTimer()
    for n = 1, #order do
        local T = order[n]
        if not T.frozen then
            if T.actor and T.street ~= 'idle' and T.street ~= 'showdown' and now >= T.deadline then
                local s = T.seats[T.actor]
                if s and s.state == 'in' then
                    -- Checking is free, so a seat that can check is never folded out of a hand it is
                    -- still in for nothing.
                    local legal = legalFor(T, s)
                    applyAction(T, s, legal.check and 'check' or 'fold')
                    s.misses = s.misses + 1
                end
                T.actor = nextSeat(T, (s and s.i) or T.actor, isLive)
                run(T)
            elseif (T.street == 'idle' or T.street == 'showdown') and now >= T.nextStartAt then
                if count(T, readyAt(T)) >= 2 then
                    startHand(T)
                else
                    sweepSeats(T)
                    T.street = 'idle'
                    T.actor = nil
                    T.nextStartAt = now + IDLE_GAP
                end
            end
        end
    end
    sweepPlayerTables(now)
end

---Empties every table and hands back what each character had on it, stack and live pot alike. A
---seated stack lives in server memory between the buy-in debit and the stand-up credit, so a
---resource stop would otherwise destroy it outright; a hand in progress is abandoned rather than
---settled, because nobody is left to show a card to.
---@return table<string, integer> owed citizenid -> chips to credit back
function holdem.releaseAll()
    local owed = {}
    for n = 1, #order do
        local T = order[n]
        for i = 1, SEATS do
            local s = T.seats[i]
            local amount = s.stack + s.contributed
            if s.cid and amount > 0 then owed[s.cid] = (owed[s.cid] or 0) + amount end
            if s.cid then seated[s.cid] = nil end
            T.seats[i] = emptySeat(i)
        end
        T.escrow, T.street, T.actor, T.pots, T.board = 0, 'idle', nil, {}, {}
        T.frozen = true
    end
    return owed
end

holdem.SEATS = SEATS
holdem.startHand = startHand
holdem.legalFor = legalFor
holdem.seatOf = seatOf
holdem.balanced = balanced

return holdem
