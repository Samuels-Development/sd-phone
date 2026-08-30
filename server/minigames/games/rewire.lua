---@type table Option helpers (server.minigames.opts): clamping and sampling.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local rewire = {}

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function rewire.normalise(params)
    return {
        ports    = opts.clamp(params.ports, 5, 3, 7),
        mistakes = opts.clamp(params.mistakes, 2, 0, 6),
        time     = opts.clamp(params.time, 30, 10, 300),
    }
end

---Wires the junction box. The mapping stays here: the player is told only whether the pair they
---tried was live, so the box cannot be read off the page.
---@param params table normalised options
---@return table state
function rewire.create(params)
    local order = opts.sample(params.ports, 1, params.ports)
    local map = {}
    for left = 1, params.ports do map[left] = order[left] end
    return { map = map, solved = {}, found = 0, mistakes = 0 }
end

---Judges one attempted connection.
---@param state table round state from create
---@param params table normalised options
---@param raw any { left, right }
---@param _ integer attempt count, unused: the round runs until the box is wired or burnt out
---@return boolean resolved
---@return boolean win
---@return table? feedback
function rewire.answer(state, params, raw, _)
    if type(raw) ~= 'table' then return false, false, nil end

    local left = tonumber(raw.left)
    local right = tonumber(raw.right)
    if not left or not right then return false, false, nil end
    if left < 1 or left > params.ports or right < 1 or right > params.ports then return false, false, nil end
    if left ~= math.floor(left) or right ~= math.floor(right) then return false, false, nil end
    if state.solved[left] then return false, false, nil end

    local correct = state.map[left] == right
    if correct then
        state.solved[left] = right
        state.found = state.found + 1
    else
        state.mistakes = state.mistakes + 1
    end

    local win = state.found >= params.ports
    local burnt = state.mistakes > params.mistakes

    return win or burnt, win, {
        left     = left,
        right    = right,
        correct  = correct,
        found    = state.found,
        mistakes = state.mistakes,
    }
end

---The finished wiring, shown once the round is over.
---@param state table
---@return integer[]
function rewire.reveal(state)
    return state.map
end

return rewire
