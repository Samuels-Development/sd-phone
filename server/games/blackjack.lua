---@type table Player bridge (bridge.server.player): identity + display name from a trusted source.
local player = require 'bridge.server.player'
---@type table Chip wallet (server.games.chips): the shared casino balance debited/credited here.
local chips  = require 'server.games.chips'
---@type table Stats board (server.games.stats): win/loss/draw + chip-swing record per character.
local stats  = require 'server.games.stats'

---@type table Blackjack module. Solo, server-authoritative: the server owns the deck, deals, plays
---the dealer and settles chips. Clients send intents and render what they are told; nothing a client
---asserts is trusted, so the old client-reported chip settle is gone.
local bj = {}

---@type integer Largest single wager accepted; bounds payouts and keeps one hand sane.
local BET_MAX = 1000000

---@type table<string, table> Live hand per character: { deck, player, dealer, bet, doubled, bal }.
---In-memory only; a resource restart or disconnect drops it and forfeits the (already debited) wager.
local hands = {}

local RANKS = { 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K' }
local SUITS = { 'S', 'H', 'D', 'C' }

---@return string|nil citizenid for a server-trusted src
local function cidOf(src)  return player.getIdentifier(src) end
---@return string display name for the stats board (server-resolved, capped)
local function nameOf(src) return (player.getName(src) or ('Player ' .. tostring(src))):sub(1, 64) end

---A fresh, shuffled 52-card deck. Fisher-Yates over server RNG; a client can never see or bias it.
---@return table[] deck array of { rank, suit }
local function freshDeck()
    local deck, n = {}, 0
    for _, s in ipairs(SUITS) do
        for _, r in ipairs(RANKS) do n = n + 1; deck[n] = { rank = r, suit = s } end
    end
    for i = n, 2, -1 do
        local j = math.random(i)
        deck[i], deck[j] = deck[j], deck[i]
    end
    return deck
end

---Draws the top card off a deck (mutates it).
---@param deck table[] deck to draw from
---@return table card { rank, suit }
local function draw(deck) return table.remove(deck) end

---Best value of a hand, treating aces as 11 then demoting to 1 while busting.
---@param cards table[] hand
---@return integer total
---@return boolean soft true when an ace still counts as 11
local function handValue(cards)
    local total, aces = 0, 0
    for _, c in ipairs(cards) do
        local r = c.rank
        if r == 'A' then aces = aces + 1; total = total + 11
        elseif r == 'K' or r == 'Q' or r == 'J' or r == '10' then total = total + 10
        else total = total + tonumber(r) end
    end
    local soft = aces
    while total > 21 and soft > 0 do total = total - 10; soft = soft - 1 end
    return total, soft > 0
end

---@param cards table[] hand
---@return boolean isBlackjack a two-card 21
local function isBlackjack(cards) return #cards == 2 and (handValue(cards)) == 21 end
---@param cards table[] hand
---@return boolean isBust over 21
local function isBust(cards) return (handValue(cards)) > 21 end
---@param dealer table[] dealer hand
---@return boolean shouldHit dealer draws below 17 (stands on all 17)
local function dealerShouldHit(dealer) return (handValue(dealer)) < 17 end

---Outcome of the player's hand versus the dealer's final hand.
---@param p table[] player hand
---@param d table[] dealer hand
---@return string outcome 'win' | 'lose' | 'push' | 'blackjack'
local function outcomeVsDealer(p, d)
    local pt = handValue(p)
    local dt = handValue(d)
    local pbj, dbj = isBlackjack(p), isBlackjack(d)
    if pbj and dbj then return 'push' end
    if pbj then return 'blackjack' end
    if dbj then return 'lose' end
    if pt > 21 then return 'lose' end
    if dt > 21 then return 'win' end
    if pt > dt then return 'win' end
    if pt < dt then return 'lose' end
    return 'push'
end

---Chips returned to the player and the net swing for a bet + outcome. Credit includes the returned
---stake (the stake was debited on deal), so net is the profit shown to the player and the boards.
---@param bet integer wager for this hand
---@param outcome string outcome from outcomeVsDealer
---@return integer credit chips to add back to the wallet
---@return integer net signed profit (credit - bet)
local function payoutFor(bet, outcome)
    if outcome == 'blackjack' then local w = math.floor(bet * 1.5 + 0.5); return bet + w, w end
    if outcome == 'win'  then return bet * 2, bet end
    if outcome == 'push' then return bet, 0 end
    return 0, -bet
end

---@param outcome string outcome from outcomeVsDealer
---@return string result 'win' | 'loss' | 'draw' for stats.record
local function statResultFor(outcome)
    if outcome == 'win' or outcome == 'blackjack' then return 'win' end
    if outcome == 'push' then return 'draw' end
    return 'loss'
end

---Closes out the caller's hand: optionally plays the dealer, decides the outcome, credits the
---payout, records the result and clears the session.
---@param src integer player server id
---@param cid string citizenid
---@param playDealer boolean draw the dealer to 17 (false on a player bust / natural)
---@return table result { phase = 'result', player, dealer, outcome, net, chips, bet }
local function resolve(src, cid, playDealer)
    local s = hands[cid]
    if playDealer then
        while dealerShouldHit(s.dealer) do s.dealer[#s.dealer + 1] = draw(s.deck) end
    end
    local outcome     = outcomeVsDealer(s.player, s.dealer)
    local credit, net = payoutFor(s.bet, outcome)
    local bal = s.bal
    if credit > 0 then bal = chips.add(cid, credit) end
    stats.record(cid, 'blackjack', 'cpu', statResultFor(outcome), nameOf(src), net)
    local result = { phase = 'result', player = s.player, dealer = s.dealer, outcome = outcome, net = net, chips = bal, bet = s.bet }
    hands[cid] = nil
    return result
end

---Starts a hand: sanitises + debits the wager, deals two cards each, and resolves immediately on a
---natural. Rejects (returns nil) with a hand already live or an unaffordable / invalid wager.
---@param src integer player server id
---@param bet any client-supplied wager
---@return table|nil result playing state or a resolved hand, nil on rejection
function bj.deal(src, bet)
    local cid = cidOf(src); if not cid then return nil end
    -- Any hand still open (app closed mid-hand) is abandoned here: its wager was already debited,
    -- so it simply forfeits and a fresh hand begins. Each deal charges its own wager, so overwriting
    -- can never mint chips - only cost another stake.
    hands[cid] = nil
    bet = tonumber(bet); if not bet or bet ~= bet then return nil end
    bet = math.floor(bet)
    if bet < 1 then return nil end
    if bet > BET_MAX then bet = BET_MAX end
    local bal = chips.remove(cid, bet)
    if not bal then return nil end
    local deck = freshDeck()
    local playerHand = { draw(deck), draw(deck) }
    local dealerHand = { draw(deck), draw(deck) }
    hands[cid] = { deck = deck, player = playerHand, dealer = dealerHand, bet = bet, doubled = false, bal = bal }
    if isBlackjack(playerHand) or isBlackjack(dealerHand) then return resolve(src, cid, false) end
    return { phase = 'playing', player = playerHand, dealer = { dealerHand[1] }, chips = bal, bet = bet }
end

---Draws one card to the player; a bust resolves the hand as a loss (the dealer does not draw).
---@param src integer player server id
---@return table|nil result playing state or a resolved hand, nil when no hand is live
function bj.hit(src)
    local cid = cidOf(src); if not cid then return nil end
    local s = hands[cid]; if not s then return nil end
    s.player[#s.player + 1] = draw(s.deck)
    if isBust(s.player) then return resolve(src, cid, false) end
    return { phase = 'playing', player = s.player, dealer = { s.dealer[1] }, chips = s.bal, bet = s.bet }
end

---Stands: reveals the hole, plays the dealer to 17 and settles.
---@param src integer player server id
---@return table|nil result resolved hand, nil when no hand is live
function bj.stand(src)
    local cid = cidOf(src); if not cid then return nil end
    if not hands[cid] then return nil end
    return resolve(src, cid, true)
end

---Doubles: debits a second equal wager, draws exactly one card, then stands (unless it busts).
---Rejects when the hand isn't two cards, is already doubled, or the second wager is unaffordable.
---@param src integer player server id
---@return table|nil result resolved hand, nil on rejection
function bj.double(src)
    local cid = cidOf(src); if not cid then return nil end
    local s = hands[cid]; if not s then return nil end
    if #s.player ~= 2 or s.doubled then return nil end
    local bal = chips.remove(cid, s.bet)
    if not bal then return nil end
    s.bal     = bal
    s.doubled = true
    s.bet     = s.bet * 2
    s.player[#s.player + 1] = draw(s.deck)
    if isBust(s.player) then return resolve(src, cid, false) end
    return resolve(src, cid, true)
end

---A departing player forfeits any live hand (the wager was already debited on deal).
AddEventHandler('playerDropped', function()
    local cid = cidOf(source)
    if cid then hands[cid] = nil end
end)

local function wrap(fn)
    return function(src)
        local r = fn(src)
        if not r then return { success = false } end
        return { success = true, data = r }
    end
end

lib.callback.register('sd-phone:server:games:bjDeal', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local r = bj.deal(src, payload.bet)
    if not r then return { success = false } end
    return { success = true, data = r }
end)
lib.callback.register('sd-phone:server:games:bjHit',    wrap(bj.hit))
lib.callback.register('sd-phone:server:games:bjStand',  wrap(bj.stand))
lib.callback.register('sd-phone:server:games:bjDouble', wrap(bj.double))

-- One-shot boot thread: seed server RNG for the shuffle.
CreateThread(function() math.randomseed(GetGameTimer()) end)

return bj
