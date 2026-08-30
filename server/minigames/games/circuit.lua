---@type table Option helpers (server.minigames.opts): clamping and list reading.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local circuit = {}

---@type string[] Gates a line may be built from.
local GATES = { 'and', 'or', 'xor' }

---@type integer Attempts at a board before the generator settles for what it has. A random board is
---almost always satisfiable; this only stops the loop running away.
local BUILD_TRIES = 60

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function circuit.normalise(params)
    return {
        inputs   = opts.clamp(params.inputs, 4, 3, 6),
        outputs  = opts.clamp(params.outputs, 3, 1, 5),
        attempts = opts.clamp(params.attempts, 3, 1, 10),
        time     = opts.clamp(params.time, 45, 10, 300),
    }
end

---Reads one line of the circuit against a set of switch positions.
---@param line table
---@param switches boolean[]
---@return boolean
local function evaluate(line, switches)
    local a = switches[line.a] == true
    local b = switches[line.b] == true
    if line.na then a = not a end
    if line.nb then b = not b end

    if line.gate == 'and' then return a and b end
    if line.gate == 'or' then return a or b end
    return a ~= b
end

---Whether some arrangement of the switches lights every line at once.
---@param lines table[]
---@param inputs integer
---@return boolean
local function satisfiable(lines, inputs)
    for combo = 0, (1 << inputs) - 1 do
        local switches = {}
        for i = 1, inputs do switches[i] = (combo >> (i - 1)) & 1 == 1 end

        local all = true
        for _, line in ipairs(lines) do
            if not evaluate(line, switches) then all = false break end
        end
        if all then return true end
    end
    return false
end

---Wires a board, rejecting any that cannot be solved at all.
---@param params table normalised options
---@return table state
---@return table puzzle
function circuit.create(params)
    local lines

    for _ = 1, BUILD_TRIES do
        lines = {}
        for i = 1, params.outputs do
            local a = math.random(1, params.inputs)
            local b = math.random(1, params.inputs)
            while b == a do b = math.random(1, params.inputs) end
            lines[i] = {
                a    = a,
                b    = b,
                na   = math.random(2) == 1,
                nb   = math.random(2) == 1,
                gate = GATES[math.random(#GATES)],
            }
        end
        if satisfiable(lines, params.inputs) then break end
    end

    return { lines = lines }, { lines = lines }
end

---Judges one arrangement of the switches.
---@param state table round state from create
---@param params table normalised options
---@param raw any one 0 or 1 per switch
---@param attempt integer answers taken so far, this one included
---@return boolean resolved
---@return boolean win
---@return table? feedback
function circuit.answer(state, params, raw, attempt)
    local flags = opts.list(raw, params.inputs, 0, 1)
    if not flags then return false, false, nil end

    local switches = {}
    for i = 1, params.inputs do switches[i] = flags[i] == 1 end

    local live, lit = {}, 0
    for i, line in ipairs(state.lines) do
        live[i] = evaluate(line, switches)
        if live[i] then lit = lit + 1 end
    end

    local win = lit >= #state.lines
    return win or attempt >= params.attempts, win, { live = live, lit = lit }
end

return circuit
