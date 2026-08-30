---@type table Shared server helpers (server.util): the numeric guard.
local util = require 'server.util'

---@type table Game module; the table returned at end of file.
local memory = {}

---@type integer Smallest grid side the game will build.
local MIN_GRID = 3
---@type integer Largest grid side the game will build.
local MAX_GRID = 6
---@type integer Fewest tiles a pattern may light.
local MIN_TARGETS = 2
---@type integer Shortest preview, in seconds.
local MIN_PREVIEW = 1
---@type integer Longest preview, in seconds.
local MAX_PREVIEW = 10
---@type integer Shortest clock a round may run, in seconds.
local MIN_TIME = 5
---@type integer Longest clock a round may run, in seconds.
local MAX_TIME = 300
---@type integer Most wrong tiles a round may forgive.
local MAX_MISTAKES = 5

---Reads a number into a whole value inside a range, falling back when it is unusable.
---@param value any
---@param fallback integer
---@param low integer
---@param high integer
---@return integer
local function clamp(value, fallback, low, high)
    local n = tonumber(value)
    if not n or not util.finite(n) then n = fallback end
    n = math.floor(n)
    if n < low then return low end
    if n > high then return high end
    return n
end

---Settles the options a round runs with. The target count is capped against the grid it has to fit
---in, so a caller asking for twenty tiles on a three-by-three still gets a playable board.
---@param params table caller options already merged over the config defaults
---@return table
function memory.normalise(params)
    local grid = clamp(params.grid, 5, MIN_GRID, MAX_GRID)
    local tiles = grid * grid

    return {
        grid     = grid,
        targets  = clamp(params.targets, 5, MIN_TARGETS, tiles - 1),
        preview  = clamp(params.preview, 3, MIN_PREVIEW, MAX_PREVIEW),
        time     = clamp(params.time, 20, MIN_TIME, MAX_TIME),
        mistakes = clamp(params.mistakes, 2, 0, MAX_MISTAKES),
    }
end

---Lights the pattern. Unlike the code games the client has to be told which tiles these are, so it
---can draw the preview; the server keeps the list to judge against rather than to hide.
---@param params table normalised options
---@return table state
---@return table puzzle the tiles the client draws
function memory.create(params)
    local tiles = params.grid * params.grid
    local pool = {}
    for i = 1, tiles do pool[i] = i end

    for i = tiles, 2, -1 do
        local j = math.random(1, i)
        pool[i], pool[j] = pool[j], pool[i]
    end

    local pattern = {}
    for i = 1, params.targets do pattern[i] = pool[i] end
    table.sort(pattern)

    return { pattern = pattern }, { pattern = pattern }
end

---Reads a submitted tap list into tile numbers, refusing anything off the board or longer than the
---board itself.
---@param raw any
---@param tiles integer
---@return integer[]?
local function tapsOf(raw, tiles)
    if type(raw) ~= 'table' then return nil end
    local out = {}
    for i = 1, tiles do
        local value = raw[i]
        if value == nil then break end
        local n = tonumber(value)
        if not n or n ~= math.floor(n) or n < 1 or n > tiles then return nil end
        out[#out + 1] = n
    end
    if raw[tiles + 1] ~= nil then return nil end
    return out
end

---Judges a whole round. The client plays the taps back in the order they were made and the server
---replays them against the pattern, so the verdict never depends on what the page believed.
---@param state table round state from create
---@param params table normalised options
---@param raw any the client's tap list
---@param _ integer attempt count, unused: the round is one submission
---@return boolean resolved
---@return boolean win
---@return table? feedback
function memory.answer(state, params, raw, _)
    local taps = tapsOf(raw, params.grid * params.grid)
    if not taps then return false, false, nil end

    local wanted = {}
    for _, tile in ipairs(state.pattern) do wanted[tile] = true end

    local seen, hits, misses = {}, 0, 0
    for _, tile in ipairs(taps) do
        if not seen[tile] then
            seen[tile] = true
            if wanted[tile] then hits = hits + 1 else misses = misses + 1 end
        end
    end

    return true, hits == params.targets and misses <= params.mistakes, {
        taps   = taps,
        hits   = hits,
        misses = misses,
    }
end

---The pattern, shown once the round is over.
---@param state table
---@return integer[]
function memory.reveal(state)
    return state.pattern
end

return memory
