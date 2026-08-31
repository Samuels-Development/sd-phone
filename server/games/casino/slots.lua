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

---@type table Slots module; the table returned at end of file. Three reels, three visible rows,
---five fixed paylines, resolved entirely server-side: the client sends a line bet and renders the
---grid it is handed back, so a tampered client can change nothing but the (validated) stake.
---Returns 95.35% over time (house edge 4.65%), set by the strip composition and the paytable
---below; changing either without redoing that arithmetic changes the edge invisibly.
local slots = {}

---@type table Casino limits (config.Casino.Slots); defaults match configs/casino.lua so a missing
---config file cannot silently uncap the table.
local C = (config.Casino or {}).Slots or {}
---@type integer Smallest accepted line bet.
local MIN_BET  = C.MinLineBet or 5
---@type integer Largest accepted line bet; the stake is five times this.
local MAX_BET  = C.MaxLineBet or 5000
---@type integer Minimum gap between spins per character (ms).
local COOLDOWN = C.SpinCooldown or 700

---@type table<string, string> Reel-strip shorthand to symbol id. The strips below are written in
---the shorthand so all three line up as a column and a miscount is visible on sight.
local CODE = {
    CR = 'crown', S7 = 'seven', HS = 'horseshoe', BL = 'bell',
    DI = 'diamond', CL = 'club', HE = 'heart', SP = 'spade',
}

---@type string[] The three reel strips, in shorthand. Every strip is 32 stops and carries the same
---multiset (crown 1, seven 2, horseshoe 3, bell 4, diamond 5, club 5, heart 6, spade 6); only the
---order differs, so the reels read as distinct while the odds per reel stay identical. Must match
---web/src/apps/casino/slots/strips.ts or the client animates onto the wrong symbols.
local STRIP_SRC = {
    'SP HE DI BL SP CL HE S7 SP DI HE HS CL SP HE BL DI CR SP CL HE DI BL HS SP CL HE S7 DI CL BL HS',
    'HE SP CL DI HE BL SP HS CL HE DI SP S7 HE CL BL SP DI HE HS CL SP BL DI CR HE SP CL S7 DI BL HS',
    'DI HE SP CL BL HE SP DI HS CL HE SP BL DI S7 HE CL SP HS DI HE BL SP CL HE CR DI SP S7 CL BL HS',
}

---@type string[][] The strips expanded to symbol ids, reel 1..3.
local STRIPS = {}
for r = 1, #STRIP_SRC do
    local strip = {}
    for code in STRIP_SRC[r]:gmatch('%S+') do strip[#strip + 1] = CODE[code] end
    STRIPS[r] = strip
end

---@type integer Stops per strip; the RNG range and the wrap modulus.
local STRIP_LEN = #STRIPS[1]
---@type integer Reels on the machine.
local REELS = 3

---@type integer[][] Payline row per reel, 0 = top row, 1 = middle, 2 = bottom. Order is the order
---the client draws them in, so L1 is the middle line.
local PAYLINES = {
    { 1, 1, 1 },
    { 0, 0, 0 },
    { 2, 2, 2 },
    { 0, 1, 2 },
    { 2, 1, 0 },
}
---@type integer Paylines played every spin; the stake is the line bet times this.
local LINES = #PAYLINES

---@type table<string, integer> Multiple of the line bet paid for three of a kind. Changing any
---value here moves the house edge, so the 95.35% figure in the module header moves with it.
local TRIPLE = {
    crown = 300, seven = 100, horseshoe = 50, bell = 25,
    diamond = 15, club = 12, heart = 10, spade = 8,
}
---@type table<string, boolean> The four card-pip symbols that make the mixed-suits combo.
local SUIT = { spade = true, heart = true, diamond = true, club = true }
---@type integer Multiple of the line bet paid for three suits that are not all the same symbol.
local SUITS_PAY = 2

---Reads a strip position, wrapping both ends so the window either side of stop 1 or 32 is real.
---@param strip string[] reel strip
---@param i integer position, may sit outside 1..STRIP_LEN
---@return string symbol id
local function at(strip, i) return strip[((i - 1) % STRIP_LEN) + 1] end

---Spins every reel off server RNG. The stop is the symbol shown in the middle row; the window is
---the stop and its two neighbours.
---@return integer[] stops 1-based strip index of the middle row, per reel
---@return string[][] grid row-major, grid[1] is the TOP row and grid[row][reel] is a symbol id
local function roll()
    local stops, grid = {}, { {}, {}, {} }
    for r = 1, REELS do
        local strip = STRIPS[r]
        local stop  = math.random(1, STRIP_LEN)
        stops[r] = stop
        grid[1][r] = at(strip, stop - 1)
        grid[2][r] = at(strip, stop)
        grid[3][r] = at(strip, stop + 1)
    end
    return stops, grid
end

---Scores every payline. A line pays the triple or the mixed-suits combo, never both, so three of
---the same suit takes the (larger) triple.
---@param grid string[][] row-major window from roll()
---@param bet integer line bet
---@return table[] lines hits as { line, kind, symbol, pay }, empty on a dead spin
---@return integer win gross chips won across all lines
function slots.evaluate(grid, bet)
    local lines, win = {}, 0
    for i = 1, LINES do
        local rows = PAYLINES[i]
        local a = grid[rows[1] + 1][1]
        local b = grid[rows[2] + 1][2]
        local c = grid[rows[3] + 1][3]
        local mult, kind, symbol
        if a == b and b == c then
            mult, kind, symbol = TRIPLE[a], 'triple', a
        elseif SUIT[a] and SUIT[b] and SUIT[c] then
            mult, kind, symbol = SUITS_PAY, 'suits', 'suits'
        end
        if mult then
            local pay = mult * bet
            lines[#lines + 1] = { line = i, kind = kind, symbol = symbol, pay = pay }
            win = win + pay
        end
    end
    return lines, win
end

---@type string[][] Exposed so the RTP harness can recompute the return from the real strips
---instead of trusting the figure in the header.
slots.strips = STRIPS

---Plays one spin: cooldown, sanitise, debit, resolve, credit, record. No round state survives the
---call, so two interleaved spins each pay their own stake and neither can settle twice off one
---debit; chips.remove is a single conditional UPDATE, so the debit itself cannot double-spend.
---@param src integer player server id
---@param payload table client payload { bet }
---@return table envelope { success, message?, data? }
function slots.spin(src, payload)
    if not shared.enabled('slots') then return shared.shut() end
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.cooldown(cid, 'games:slotsSpin', COOLDOWN) then return util.fail('games.slowDown', 'Slow down') end
    local bet = shared.wager(payload.bet, MIN_BET, MAX_BET)
    if not bet then return util.fail('games.enterValidAmount', 'Enter a valid amount') end
    local stake = bet * LINES
    local bal = chips.remove(cid, stake)
    if not bal then return util.fail('games.notEnoughChips', 'Not enough chips') end
    local stops, grid = roll()
    local lines, win  = slots.evaluate(grid, bet)
    if win > 0 then bal = chips.add(cid, win) end
    local net = win - stake
    stats.record(cid, 'slots', 'cpu', shared.resultFor(net), shared.nameOf(src), net)
    return util.ok({
        bet = bet, stake = stake, stops = stops, grid = grid,
        lines = lines, win = win, net = net, chips = bal,
    })
end

lib.callback.register('sd-phone:server:games:slotsSpin', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return slots.spin(src, payload)
end)

return slots
