---@type table Option helpers (server.minigames.opts): clamping.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local vent = {}

---@type integer Milliseconds per replay step. The client draws on the same step, so both sides walk
---the needle through identical arithmetic.
local STEP_MS = 50

---@type number Where the needle starts, on a 0..100 gauge.
local START = 50

---@type number How far the band swings either side of the middle of the gauge.
local SWING = 26

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function vent.normalise(params)
    return {
        need  = opts.clamp(params.need, 4, 1, 60),
        rise  = opts.clamp(params.rise, 15, 4, 90),
        vent  = opts.clamp(params.vent, 27, 6, 120),
        band  = opts.clamp(params.band, 18, 6, 60),
        drift = opts.clamp(params.drift, 5200, 1500, 20000),
        time  = opts.clamp(params.time, 20, 10, 300),
    }
end

---Seeds the band's drift. Both sides derive the band from this, so nothing about it is secret; what
---the server keeps is the ability to replay the player's own inputs and see where the needle went.
---@param _ table normalised options, unused: the band is seeded, not configured
---@return table state
---@return table puzzle
function vent.create(_)
    local seed = math.random(0, 999) / 100
    return { seed = seed }, {
        seed  = seed,
        step  = STEP_MS,
        start = START,
        swing = SWING,
    }
end

---The middle of the safe band at a moment in the round.
---@param elapsedMs number
---@param params table
---@param seed number
---@return number
local function bandAt(elapsedMs, params, seed)
    return 50 + SWING * math.sin((elapsedMs / params.drift) * math.pi * 2 + seed)
end

---Whether the player was holding the vent open at a moment, given the intervals they reported.
---@param holds table[] { { from, to } }
---@param at number milliseconds
---@return boolean
local function holdingAt(holds, at)
    for i = 1, #holds do
        local hold = holds[i]
        if at >= hold.from and at < hold.to then return true end
    end
    return false
end

---Reads the reported hold intervals, refusing anything out of order or off the clock.
---@param raw any
---@param params table
---@return table[]?
local function holdsOf(raw, params)
    if type(raw) ~= 'table' then return nil end

    local limit = params.time * 1000
    local out, last = {}, 0
    for i = 1, #raw do
        local hold = raw[i]
        if type(hold) ~= 'table' then return nil end
        local from = tonumber(hold.from)
        local to = tonumber(hold.to)
        if not from or not to or from < last or to <= from or to > limit + 1000 then return nil end
        out[i] = { from = from, to = to }
        last = to
    end
    return out
end

---Replays the round from the player's own inputs and decides whether the needle spent long enough
---in the band. The client's score is never read: only the buttons it says were pressed.
---@param state table round state from create
---@param params table normalised options
---@param raw any the reported hold intervals
---@param _ integer attempt count, unused
---@param elapsed integer milliseconds the server has had the round open
---@return boolean resolved
---@return boolean win
---@return table? feedback
function vent.answer(state, params, raw, _, elapsed)
    local holds = holdsOf(raw, params)
    if not holds then return false, false, nil end

    local needle, inBand = START, 0
    local last = math.min(elapsed, params.time * 1000)

    for at = 0, last, STEP_MS do
        local delta = (STEP_MS / 1000) * (holdingAt(holds, at) and -params.vent or params.rise)
        needle = math.min(100, math.max(0, needle + delta))
        if math.abs(needle - bandAt(at, params, state.seed)) <= (params.band / 2) then
            inBand = inBand + STEP_MS
        end
    end

    local held = inBand / 1000
    return true, held >= params.need, { held = held, needle = needle }
end

return vent
