---@type table Option helpers (server.minigames.opts): clamping.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local tune = {}

---@type number[] Distance thresholds, as a fraction of the dial, for each signal band above the
---winning one. A reading falls into the first band it is closer than.
local BANDS = { 0.06, 0.14, 0.26, 0.44 }

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function tune.normalise(params)
    return {
        span      = opts.clamp(params.span, 100, 20, 999),
        tolerance = opts.clamp(params.tolerance, 3, 1, 40),
        attempts  = opts.clamp(params.attempts, 5, 1, 12),
        time      = opts.clamp(params.time, 30, 10, 300),
    }
end

---Picks the hidden frequency. It never leaves the server: the player is only ever told how strong
---the signal was at the point they tried.
---@param params table normalised options
---@return table state
function tune.create(params)
    return { target = math.random(0, params.span) }
end

---How strong the signal reads at a distance, from 0 (silent) up to one below a lock.
---@param distance integer
---@param params table
---@return integer
local function bandFor(distance, params)
    for level = 1, #BANDS do
        if distance <= params.span * BANDS[level] then return #BANDS + 1 - level end
    end
    return 0
end

---Judges one sweep of the dial.
---@param state table round state from create
---@param params table normalised options
---@param raw any the dial position the player locked
---@param attempt integer answers taken so far, this one included
---@return boolean resolved
---@return boolean win
---@return table? feedback
function tune.answer(state, params, raw, attempt)
    local value = tonumber(raw)
    if not value or value ~= math.floor(value) or value < 0 or value > params.span then
        return false, false, nil
    end

    local distance = math.abs(value - state.target)
    local win = distance <= params.tolerance

    return win or attempt >= params.attempts, win, {
        value = value,
        band  = win and (#BANDS + 1) or bandFor(distance, params),
        above = value > state.target,
    }
end

---The frequency itself, shown once the round is over.
---@param state table
---@return integer[]
function tune.reveal(state)
    return { state.target }
end

return tune
