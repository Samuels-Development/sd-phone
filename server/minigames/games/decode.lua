---@type table Option helpers (server.minigames.opts): clamping, sampling and list reading.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local decode = {}

---@type integer How many glyphs the shared alphabet holds. The client draws one shape per index.
local ALPHABET = 8

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function decode.normalise(params)
    return {
        symbols = opts.clamp(params.symbols, 4, 2, ALPHABET),
        digits  = opts.clamp(params.digits, 4, 2, 8),
        preview = opts.clamp(params.preview, 4, 1, 15),
        time    = opts.clamp(params.time, 25, 10, 300),
    }
end

---Builds the key and the code written in it. Both have to reach the client to be readable, so this
---round is judged rather than hidden: the server owns what the code translates to.
---@param params table normalised options
---@return table state
---@return table puzzle
function decode.create(params)
    local glyphs = opts.sample(params.symbols, 1, ALPHABET)
    local values = opts.sample(params.symbols, 0, 9)

    local key = {}
    for i = 1, params.symbols do
        key[i] = { glyph = glyphs[i], digit = values[i] }
    end

    local code, answer = {}, {}
    for i = 1, params.digits do
        local pick = math.random(1, params.symbols)
        code[i] = glyphs[pick]
        answer[i] = values[pick]
    end

    return { answer = answer }, { key = key, code = code }
end

---Judges the typed translation.
---@param state table round state from create
---@param params table normalised options
---@param raw any the digits the player typed
---@param _ integer attempt count, unused: one translation ends the round
---@return boolean resolved
---@return boolean win
---@return table? feedback
function decode.answer(state, params, raw, _)
    local typed = opts.list(raw, params.digits, 0, 9)
    if not typed then return false, false, nil end

    local correct = 0
    for i = 1, params.digits do
        if typed[i] == state.answer[i] then correct = correct + 1 end
    end

    return true, correct == params.digits, { typed = typed, correct = correct }
end

---The translation, shown once the round is over.
---@param state table
---@return integer[]
function decode.reveal(state)
    return state.answer
end

return decode
