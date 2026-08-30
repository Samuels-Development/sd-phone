---@type table Option helpers (server.minigames.opts): clamping and sampling.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local scanner = {}

---@type integer Tallest a signature bar can stand, on a scale the client reads as a percentage.
local PEAK = 100

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function scanner.normalise(params)
    return {
        bars     = opts.clamp(params.bars, 7, 4, 12),
        options  = opts.clamp(params.options, 6, 2, 9),
        attempts = opts.clamp(params.attempts, 2, 1, 6),
        time     = opts.clamp(params.time, 30, 10, 300),
    }
end

---A fresh signature: one bar height per reading.
---@param bars integer
---@return integer[]
local function signature(bars)
    local out = {}
    for i = 1, bars do out[i] = math.random(18, PEAK) end
    return out
end

---A copy of a signature with a couple of readings nudged, so it looks right at a glance and wrong
---on a proper look.
---@param source integer[]
---@return integer[]
local function nudged(source)
    local copy = {}
    for i, height in ipairs(source) do copy[i] = height end

    local changes = math.random(1, 2)
    for _ = 1, changes do
        local at = math.random(1, #copy)
        local shift = math.random(14, 30) * (math.random(2) == 1 and 1 or -1)
        copy[at] = math.min(PEAK, math.max(10, copy[at] + shift))
    end

    return copy
end

---Builds the target and a lineup with exactly one true match.
---@param params table normalised options
---@return table state
---@return table puzzle
function scanner.create(params)
    local target = signature(params.bars)
    local match = math.random(1, params.options)

    local lineup = {}
    for i = 1, params.options do
        lineup[i] = i == match and target or nudged(target)
    end

    return { match = match, attempts = 0 }, { target = target, lineup = lineup }
end

---Judges one pick from the lineup.
---@param state table round state from create
---@param params table normalised options
---@param raw any the option the player read as the match
---@param attempt integer answers taken so far, this one included
---@return boolean resolved
---@return boolean win
---@return table? feedback
function scanner.answer(state, params, raw, attempt)
    local pick = tonumber(raw)
    if not pick or pick ~= math.floor(pick) or pick < 1 or pick > params.options then
        return false, false, nil
    end

    local win = pick == state.match
    return win or attempt >= params.attempts, win, { pick = pick, right = win }
end

---Which one it was, shown once the round is over.
---@param state table
---@return integer[]
function scanner.reveal(state)
    return { state.match }
end

return scanner
