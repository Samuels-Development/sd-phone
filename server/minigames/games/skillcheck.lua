---@type table Option helpers (server.minigames.opts): clamping.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local skillcheck = {}

---@type integer Milliseconds past the server's clock a reported press may sit before it is refused.
---The dial is drawn on the client, so the moment of the press is the client's to report.
local SANITY_MS = 1000

---@type integer How many keys the dial can call for.
local KEYS = 4

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function skillcheck.normalise(params)
    return {
        rounds = opts.clamp(params.rounds, 3, 1, 8),
        period = opts.clamp(params.period, 1500, 600, 5000),
        window = opts.clamp(params.window, 15, 4, 45),
        shrink = opts.clamp(params.shrink, 82, 45, 100),
        time   = opts.clamp(params.time, 25, 10, 300),
    }
end

---Places each gate on the dial and picks the key it wants. The client draws these, so they travel
---with the round; what it cannot fake is the key it was asked for.
---@param params table normalised options
---@return table state
---@return table puzzle
function skillcheck.create(params)
    local gates = {}
    for i = 1, params.rounds do
        gates[i] = { at = math.random(10, 90) / 100, key = math.random(1, KEYS) }
    end

    return { gates = gates, cleared = 0 }, {
        gates  = gates,
        period = params.period,
        window = params.window,
        shrink = params.shrink,
    }
end

---Where the needle sits on the dial at a moment, sweeping once per period.
---@param elapsedMs number
---@param period integer
---@return number 0..1
local function needleAt(elapsedMs, period)
    return (elapsedMs % period) / period
end

---How wide the gate is on a given round, after every narrowing so far.
---@param params table
---@param index integer
---@return number
local function widthFor(params, index)
    local width = params.window / 100
    for _ = 2, index do width = width * (params.shrink / 100) end
    return math.max(0.04, width)
end

---Judges one press.
---@param state table round state from create
---@param params table normalised options
---@param raw any { at, key }
---@param _ integer attempt count, unused
---@param elapsed integer milliseconds the server has had the round open
---@return boolean resolved
---@return boolean win
---@return table? feedback
function skillcheck.answer(state, params, raw, _, elapsed)
    if type(raw) ~= 'table' then return false, false, nil end

    local at = tonumber(raw.at)
    local key = tonumber(raw.key)
    if not at or at < 0 or at > elapsed + SANITY_MS then return false, false, nil end
    if not key or key < 1 or key > KEYS then return false, false, nil end

    local index = state.cleared + 1
    local gate = state.gates[index]
    if not gate then return false, false, nil end

    local position = needleAt(at, params.period)
    local reach = widthFor(params, index) / 2
    local inGate = math.abs(position - gate.at) <= reach
        or math.abs(position - gate.at) >= (1 - reach)
    local caught = inGate and key == gate.key

    if caught then state.cleared = state.cleared + 1 end
    local win = state.cleared >= params.rounds

    return win or not caught, win, {
        index    = index,
        position = position,
        caught   = caught,
        rightKey = key == gate.key,
        cleared  = state.cleared,
    }
end

return skillcheck
