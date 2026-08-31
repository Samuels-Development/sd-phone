---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Shared server helpers (server.util): envelope builders + the per-character cooldown.
local util   = require 'server.util'
---@type table Chip wallet (server.games.chips): the shared casino balance debited/credited here.
local chips  = require 'server.games.chips'
---@type table Stats board (server.games.stats): win/loss/draw + chip-swing record per character.
local stats  = require 'server.games.stats'
---@type table Casino helpers (server.games.casino.shared): identity, wager sanitiser, stats verdict.
local shared = require 'server.games.casino.shared'
---@type table Shoe builder (server.games.casino.deck): the shuffled multi-deck shoe.
local deck   = require 'server.games.casino.deck'

---@type table Baccarat module; the table returned at end of file. Punto Banco, one player against
---the house, resolved end to end inside a single callback: the shoe is built, both hands are drawn
---by the fixed tableau, the spots are paid and the shoe is discarded before the reply is sent. No
---round state survives the call, so a second request can never settle the same hand twice.
local baccarat = {}

---@type table Casino limits (config.Casino.Baccarat); defaults match configs/casino.lua so a
---missing config file cannot silently uncap the table.
local C = (config.Casino or {}).Baccarat or {}
---@type integer Smallest accepted bet on any spot.
local MIN_BET   = C.MinBet or 25
---@type integer Ceiling on a single main spot (Player / Banker / Tie).
local MAX_BET   = C.MaxBet or 100000
---@type integer Ceiling on a single pair spot.
local MAX_SIDE  = C.MaxSideBet or 10000
---@type integer Table limit, summed across every spot on one hand.
local MAX_TOTAL = C.MaxTotal or 200000
---@type integer Minimum gap between hands per character (ms).
local COOLDOWN  = C.DealCooldown or 800

---@type integer Decks in the shoe. A fresh shoe per hand means there is nothing to count, so the
---8-deck size is only here to keep the pair odds at their real 10.36% edge.
local SHOE_DECKS = 8

---@type string[] Every spot on the felt, in the order the response reports them.
local SPOTS = { 'player', 'banker', 'tie', 'ppair', 'bpair' }

---@type table<string, integer> Per-spot ceiling; the pair spots take a tenth of a main spot.
local SPOT_MAX = {
    player = MAX_BET, banker = MAX_BET, tie = MAX_BET,
    ppair  = MAX_SIDE, bpair = MAX_SIDE,
}

---@type table<string, integer> Baccarat point value per rank: ace is 1, pips are face value and
---every ten-count card is 0. Nothing here is a blackjack value; the two must not be shared.
local POINTS = {
    A = 1, ['2'] = 2, ['3'] = 3, ['4'] = 4, ['5'] = 5, ['6'] = 6, ['7'] = 7,
    ['8'] = 8, ['9'] = 9, ['10'] = 0, J = 0, Q = 0, K = 0,
}

---@param rank string card rank
---@return integer points 0..9
function baccarat.pointsOf(rank) return POINTS[rank] or 0 end

---@param cards table[] hand of { rank, suit }
---@return integer total the hand's point total, modulo ten
function baccarat.totalOf(cards)
    local sum = 0
    for i = 1, #cards do sum = sum + baccarat.pointsOf(cards[i].rank) end
    return sum % 10
end

---The Player half of the tableau: draws on 0-5, stands on 6-7. Only reached when neither hand
---holds a natural, which is checked before either side acts.
---@param total integer Player's two-card total
---@return boolean draws
function baccarat.playerDraws(total) return total <= 5 end

---The Banker half of the tableau, the part that is routinely written wrong. When the Player stood
---the Banker plays the Player's own rule (draw 0-5, stand 6-7). When the Player drew, the Banker's
---decision depends on the POINT VALUE of that third card, not on the Player's new total.
---@param total integer Banker's two-card total
---@param playerThird integer|nil point value of the Player's third card, nil when the Player stood
---@return boolean draws
function baccarat.bankerDraws(total, playerThird)
    if total >= 7 then return false end
    if playerThird == nil then return total <= 5 end
    if total <= 2 then return true end
    if total == 3 then return playerThird ~= 8 end
    if total == 4 then return playerThird >= 2 and playerThird <= 7 end
    if total == 5 then return playerThird >= 4 and playerThird <= 7 end
    return playerThird == 6 or playerThird == 7
end

---Deals and plays one hand off a shoe. Deal order is Player, Banker, Player, Banker; a two-card 8
---or 9 on either side is a natural and freezes both hands where they are.
---@param shoe table[] shuffled shoe, mutated
---@return table hand { player, banker, outcome, natural, ppair, bpair }
function baccarat.resolveHand(shoe)
    local p = { deck.draw(shoe) }
    local b = { deck.draw(shoe) }
    p[2] = deck.draw(shoe)
    b[2] = deck.draw(shoe)

    local pt, bt = baccarat.totalOf(p), baccarat.totalOf(b)
    local natural = pt >= 8 or bt >= 8
    if not natural then
        local playerThird
        if baccarat.playerDraws(pt) then
            p[3] = deck.draw(shoe)
            playerThird = baccarat.pointsOf(p[3].rank)
            pt = baccarat.totalOf(p)
        end
        -- bt is deliberately still the two-card total here: the tableau keys off the Banker's
        -- total BEFORE its own draw, and off the Player's third card rather than the Player's total.
        if baccarat.bankerDraws(bt, playerThird) then
            b[3] = deck.draw(shoe)
            bt = baccarat.totalOf(b)
        end
    end

    local outcome = 'tie'
    if pt > bt then outcome = 'player' elseif bt > pt then outcome = 'banker' end

    return {
        player  = { cards = p, total = pt },
        banker  = { cards = b, total = bt },
        outcome = outcome,
        natural = natural,
        -- A pair is two cards of the same RANK, so K+K pairs and K+10 does not, even though both
        -- cards are worth zero.
        ppair   = p[1].rank == p[2].rank,
        bpair   = b[1].rank == b[2].rank,
    }
end

---Gross chips returned per spot for a settled hand, stake included: the stake was debited before
---the deal, so a push has to hand it back and a win has to hand back stake plus profit.
---@param bets table<string, integer> accepted amount per spot, 0 where unbet
---@param res table hand from baccarat.resolveHand
---@return table<string, integer> pays gross return per spot
---@return integer win summed gross return
function baccarat.payouts(bets, res)
    local pays = { player = 0, banker = 0, tie = 0, ppair = 0, bpair = 0 }
    local outcome = res.outcome

    if bets.player > 0 then
        if outcome == 'player' then pays.player = bets.player * 2
        elseif outcome == 'tie' then pays.player = bets.player end
    end
    if bets.banker > 0 then
        -- 5% commission in whole chips, rounded to the nearest. Rounding it toward the house
        -- instead would cost a 25-chip bet a whole extra chip and quietly turn the 1.06% edge the
        -- paytable prints into 2.4% at the table minimum.
        if outcome == 'banker' then pays.banker = bets.banker + (bets.banker * 95 + 50) // 100
        elseif outcome == 'tie' then pays.banker = bets.banker end
    end
    if bets.tie > 0 and outcome == 'tie' then pays.tie = bets.tie * 9 end
    if bets.ppair > 0 and res.ppair then pays.ppair = bets.ppair * 12 end
    if bets.bpair > 0 and res.bpair then pays.bpair = bets.bpair * 12 end

    local win = 0
    for i = 1, #SPOTS do win = win + pays[SPOTS[i]] end
    return pays, win
end

---Sanitises every spot on the payload into whole chips. The whole hand is rejected on the first
---bad entry rather than the entry being dropped: a player who mistypes one spot must not have the
---rest of the layout charged for a hand they did not mean to place.
---@param payload table client payload keyed by spot id
---@return table<string, integer>|nil bets accepted amounts, nil when an entry is unusable
---@return integer stake summed accepted amount
local function readBets(payload)
    local bets, stake = {}, 0
    for i = 1, #SPOTS do
        local spot   = SPOTS[i]
        local raw    = payload[spot]
        local amount = 0
        if raw ~= nil and raw ~= 0 then
            amount = shared.wager(raw, MIN_BET, SPOT_MAX[spot])
            if not amount then return nil, 0 end
        end
        bets[spot] = amount
        stake = stake + amount
    end
    return bets, stake
end

---Plays one hand: cooldown, sanitise every spot, debit the whole stake, deal from a fresh shoe,
---credit the gross return and record the net swing.
---@param src integer player server id
---@param payload table client payload { player, banker, tie, ppair, bpair }
---@return table envelope { success, message?, data? }
function baccarat.deal(src, payload)
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.cooldown(cid, 'games:baccaratDeal', COOLDOWN) then return util.fail('games.slowDown', 'Slow down') end

    local bets, stake = readBets(payload)
    if not bets then return util.fail('games.enterValidAmount', 'Enter a valid amount') end
    if stake <= 0 then return util.fail('games.placeBet', 'Place a bet') end
    if stake > MAX_TOTAL then return util.fail('games.tableLimit', 'Table limit') end

    local bal = chips.remove(cid, stake)
    if not bal then return util.fail('games.notEnoughChips', 'Not enough chips') end

    local res       = baccarat.resolveHand(deck.fresh(SHOE_DECKS))
    local pays, win = baccarat.payouts(bets, res)
    if win > 0 then bal = chips.add(cid, win) end

    local net = win - stake
    stats.record(cid, 'baccarat', 'cpu', shared.resultFor(net), shared.nameOf(src), net)

    return util.ok({
        bets    = bets,
        stake   = stake,
        player  = res.player,
        banker  = res.banker,
        outcome = res.outcome,
        natural = res.natural,
        ppair   = res.ppair,
        bpair   = res.bpair,
        pays    = pays,
        win     = win,
        net     = net,
        chips   = bal,
    })
end

lib.callback.register('sd-phone:server:games:baccaratDeal', function(src, payload)
    if not shared.enabled('baccarat') then return shared.shut() end
    payload = type(payload) == 'table' and payload or {}
    return baccarat.deal(src, payload)
end)

return baccarat
