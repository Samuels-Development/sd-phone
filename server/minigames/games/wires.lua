---@type table Option helpers (server.minigames.opts): clamping and sampling.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local wires = {}

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function wires.normalise(params)
    local count = opts.clamp(params.wires, 5, 3, 7)
    return {
        wires = count,
        clues = opts.clamp(params.clues, 3, 1, count),
        cuts  = opts.clamp(params.cuts, 1, 1, math.max(1, count - 1)),
        time  = opts.clamp(params.time, 35, 10, 300),
    }
end

---Writes a clue that is true of the live wire, so the set can never rule it out.
---@param live integer
---@param count integer
---@return table
local function clueFor(live, count)
    local kind = math.random(3)

    if kind == 1 then
        local other = math.random(1, count)
        while other == live do other = math.random(1, count) end
        return { kind = 'notWire', a = other }
    end

    if kind == 2 and live > 1 and live < count then
        return { kind = 'notEnd' }
    end

    return { kind = live % 2 == 0 and 'even' or 'odd' }
end

---Picks the live wire and writes clues around it. Which wire is live never leaves the server; the
---clues are all the player ever gets.
---@param params table normalised options
---@return table state
---@return table puzzle
function wires.create(params)
    local live = math.random(1, params.wires)

    local clues, seen = {}, {}
    local guard = 0
    while #clues < params.clues and guard < 60 do
        guard = guard + 1
        local clue = clueFor(live, params.wires)
        local key = clue.kind .. tostring(clue.a or '')
        if not seen[key] then
            seen[key] = true
            clues[#clues + 1] = clue
        end
    end

    return { live = live, cut = {}, wrong = 0 }, { wires = params.wires, clues = clues }
end

---Judges one cut.
---@param state table round state from create
---@param params table normalised options
---@param raw any { wire }
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function wires.answer(state, params, raw, _)
    local wire = type(raw) == 'table' and tonumber(raw.wire) or nil
    if not wire or wire ~= math.floor(wire) or wire < 1 or wire > params.wires then
        return false, false, nil
    end
    if state.cut[wire] then return false, false, nil end

    state.cut[wire] = true
    local right = wire == state.live

    if right then
        return true, true, { wire = wire, right = true, wrong = state.wrong }
    end

    state.wrong = state.wrong + 1
    local blown = state.wrong >= params.cuts

    return blown, false, { wire = wire, right = false, wrong = state.wrong }
end

---The live wire, shown once the round is over.
---@param state table
---@return integer[]
function wires.reveal(state)
    return { state.live }
end

return wires
