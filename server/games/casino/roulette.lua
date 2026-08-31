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

---@type table Roulette module; the table returned at end of file. European single zero, 37
---pockets, resolved server-side. The client sends canonical bet ids only: the pocket set behind an
---id is derived here, so a client can never hand over its own list of winning numbers. Every
---supported bet returns pockets/37 * (odds + 1) = 36/37, a uniform 2.70% house edge.
local roulette = {}

---@type table Casino limits (config.Casino.Roulette); defaults match configs/casino.lua so a
---missing config file cannot silently uncap the table.
local C = (config.Casino or {}).Roulette or {}
---@type integer Smallest accepted amount on a single spot.
local MIN_CHIP  = C.MinChip or 5
---@type integer Table limit, summed across every bet on one spin.
local MAX_STAKE = C.MaxTotalStake or 25000
---@type integer Distinct bet entries accepted per spin.
local MAX_BETS  = C.MaxBets or 20
---@type integer Minimum gap between spins per character (ms).
local COOLDOWN  = C.SpinCooldown or 1200

---@type integer[] Pocket order clockwise from 0 on a European wheel. The response returns the
---index into this so the client can turn a result into an angle without duplicating the order.
local WHEEL = {
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
}
---@type table<integer, integer> pocket -> 0-based position in WHEEL.
local WHEEL_INDEX = {}
for i = 1, #WHEEL do WHEEL_INDEX[WHEEL[i]] = i - 1 end

---@type table<integer, boolean> The eighteen red pockets; every other pocket in 1..36 is black.
local RED = {}
for _, n in ipairs({ 1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36 }) do RED[n] = true end

---@param n integer pocket
---@return string colour 'red' | 'black' | 'green'
local function colorOf(n)
    if n == 0 then return 'green' end
    return RED[n] and 'red' or 'black'
end

---@param list integer[] pockets
---@return table<integer, boolean> set for an O(1) hit test
local function setOf(list)
    local s = {}
    for _, n in ipairs(list) do s[n] = true end
    return s
end

---@param first integer lowest pocket
---@param last integer highest pocket
---@param step integer? gap between pockets (default 1)
---@return integer[] pockets
local function span(first, last, step)
    local out = {}
    for n = first, last, step or 1 do out[#out + 1] = n end
    return out
end

---@type table<string, { pockets: table<integer, boolean>, odds: integer }> Bets with no number in
---their id, built once at load.
local STATIC = {
    bk    = { pockets = setOf({ 0, 1, 2, 3 }), odds = 8 },
    red   = { pockets = setOf(span(1, 36)),    odds = 1 },
    black = { pockets = setOf(span(1, 36)),    odds = 1 },
    odd   = { pockets = setOf(span(1, 35, 2)), odds = 1 },
    even  = { pockets = setOf(span(2, 36, 2)), odds = 1 },
    low   = { pockets = setOf(span(1, 18)),    odds = 1 },
    high  = { pockets = setOf(span(19, 36)),   odds = 1 },
}
for n = 1, 36 do
    if RED[n] then STATIC.black.pockets[n] = nil else STATIC.red.pockets[n] = nil end
end
for c = 1, 3 do
    STATIC['col:' .. c] = { pockets = setOf(span(c, c + 33, 3)), odds = 2 }
    STATIC['dz:' .. c]  = { pockets = setOf(span(12 * c - 11, 12 * c)), odds = 2 }
end

---True for the sixty split pairs an actual felt offers: side by side inside a street, one above
---the other in a column, or zero paired with 1, 2 or 3. Trios are deliberately not supported.
---@param a integer lower pocket
---@param b integer higher pocket
---@return boolean
local function validSplit(a, b)
    if a >= b then return false end
    if a == 0 then return b <= 3 end
    if b == a + 1 then return a % 3 ~= 0 and a <= 35 end
    if b == a + 3 then return a <= 33 end
    return false
end

---Turns a client-supplied bet id into the pockets it covers and its odds. Every branch re-formats
---the parsed number and compares it back to the id, so only the canonical spelling of a spot is
---accepted and 's:07' or 'p:2-1' cannot open a second, unpriced version of the same bet. The digit
---patterns are capped at two characters so an absurd id is rejected rather than reaching format().
---@param id any client-supplied bet id
---@return table<integer, boolean>|nil pockets nil when the id is not a bet this table takes
---@return integer? odds payout odds to 1
function roulette.resolve(id)
    if type(id) ~= 'string' then return nil end
    local fixed = STATIC[id]
    if fixed then return fixed.pockets, fixed.odds end

    local straight = id:match('^s:(%d%d?)$')
    if straight then
        local n = tonumber(straight)
        if n <= 36 and id == ('s:%d'):format(n) then return setOf({ n }), 35 end
        return nil
    end

    local lo, hi = id:match('^p:(%d%d?)%-(%d%d?)$')
    if lo then
        local a, b = tonumber(lo), tonumber(hi)
        if id == ('p:%d-%d'):format(a, b) and validSplit(a, b) then return setOf({ a, b }), 17 end
        return nil
    end

    local street = id:match('^t:(%d%d?)$')
    if street then
        local n = tonumber(street)
        if n >= 1 and n <= 34 and n % 3 == 1 and id == ('t:%d'):format(n) then
            return setOf({ n, n + 1, n + 2 }), 11
        end
        return nil
    end

    local corner = id:match('^c:(%d%d?)$')
    if corner then
        local n = tonumber(corner)
        if n >= 1 and n <= 32 and n % 3 ~= 0 and id == ('c:%d'):format(n) then
            return setOf({ n, n + 1, n + 3, n + 4 }), 8
        end
        return nil
    end

    local sixline = id:match('^l:(%d%d?)$')
    if sixline then
        local n = tonumber(sixline)
        if n >= 1 and n <= 31 and n % 3 == 1 and id == ('l:%d'):format(n) then
            return setOf(span(n, n + 5)), 5
        end
        return nil
    end

    return nil
end

---Plays one spin: cooldown, validate every bet, debit the whole stake, roll, credit, record. The
---entire spin is rejected on the first bad entry so a player is never charged for a slip of a
---layout the server does not recognise. No round state survives the call, so nothing can settle
---twice off one debit.
---@param src integer player server id
---@param payload table client payload { bets = { { id, amount } } }
---@return table envelope { success, message?, data? }
function roulette.spin(src, payload)
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.cooldown(cid, 'games:rouletteSpin', COOLDOWN) then return util.fail('games.slowDown', 'Slow down') end

    local placed = payload.bets
    if type(placed) ~= 'table' or #placed == 0 then return util.fail('games.placeBetFirst', 'Place a bet first') end
    if #placed > MAX_BETS then return util.fail('games.tooManyBets', 'Too many bets') end

    -- Duplicate spots merge into one entry before the stake is summed, so a client stacking the
    -- same id repeatedly pays and is paid exactly as if it had sent one larger chip.
    local order, byId, stake = {}, {}, 0
    for i = 1, #placed do
        local entry = placed[i]
        if type(entry) ~= 'table' then return util.fail('games.betNotRecognised', 'Bet not recognised') end
        local amount = shared.wager(entry.amount, MIN_CHIP, MAX_STAKE)
        if not amount then return util.fail('games.enterValidAmount', 'Enter a valid amount') end
        local pockets, odds = roulette.resolve(entry.id)
        if not pockets then return util.fail('games.betNotRecognised', 'Bet not recognised') end
        local bet = byId[entry.id]
        if bet then
            bet.amount = bet.amount + amount
        else
            bet = { id = entry.id, amount = amount, pockets = pockets, odds = odds }
            byId[entry.id] = bet
            order[#order + 1] = bet
        end
        stake = stake + amount
    end
    if stake > MAX_STAKE then return util.fail('games.tableLimitReached', 'Table limit reached') end

    local bal = chips.remove(cid, stake)
    if not bal then return util.fail('games.notEnoughChips', 'Not enough chips') end

    local pocket = math.random(0, 36)
    local hits, win = {}, 0
    for i = 1, #order do
        local bet = order[i]
        if bet.pockets[pocket] then
            local payout = bet.amount * (bet.odds + 1)
            hits[#hits + 1] = { id = bet.id, amount = bet.amount, payout = payout }
            win = win + payout
        end
    end
    if win > 0 then bal = chips.add(cid, win) end

    local net = win - stake
    stats.record(cid, 'roulette', 'cpu', shared.resultFor(net), shared.nameOf(src), net)
    return util.ok({
        pocket = pocket, index = WHEEL_INDEX[pocket], color = colorOf(pocket),
        stake = stake, hits = hits, win = win, net = net, chips = bal,
    })
end

lib.callback.register('sd-phone:server:games:rouletteSpin', function(src, payload)
    if not shared.enabled('roulette') then return shared.shut() end
    payload = type(payload) == 'table' and payload or {}
    return roulette.spin(src, payload)
end)

return roulette
