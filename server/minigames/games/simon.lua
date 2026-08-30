---@type table Option helpers (server.minigames.opts): clamping and list reading.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local simon = {}

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function simon.normalise(params)
    return {
        pads   = opts.clamp(params.pads, 4, 3, 6),
        length = opts.clamp(params.length, 5, 2, 12),
        pace   = opts.clamp(params.pace, 520, 200, 2000),
        time   = opts.clamp(params.time, 45, 10, 300),
    }
end

---Writes the sequence. It has to be played back to the client to be watched, so this round is
---judged rather than hidden: the server owns whether the reply matched.
---@param params table normalised options
---@return table state
---@return table puzzle
function simon.create(params)
    local order = {}
    for i = 1, params.length do order[i] = math.random(1, params.pads) end

    return { order = order }, { order = order, pace = params.pace, pads = params.pads }
end

---Judges a played-back sequence.
---@param state table round state from create
---@param params table normalised options
---@param raw any the pads in the order the player pressed them
---@param _ integer attempt count, unused: one playback ends the round
---@return boolean resolved
---@return boolean win
---@return table? feedback
function simon.answer(state, params, raw, _)
    local played = opts.list(raw, params.length, 1, params.pads)
    if not played then return false, false, nil end

    local right = 0
    for i = 1, params.length do
        if played[i] ~= state.order[i] then break end
        right = right + 1
    end

    return true, right >= params.length, { right = right, length = params.length }
end

---The sequence, shown once the round is over.
---@param state table
---@return integer[]
function simon.reveal(state)
    return state.order
end

return simon
