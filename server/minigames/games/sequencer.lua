---@type table Option helpers (server.minigames.opts): clamping, sampling and list reading.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local sequencer = {}

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function sequencer.normalise(params)
    local steps = opts.clamp(params.steps, 5, 3, 7)
    return {
        steps = steps,
        rules = opts.clamp(params.rules, 3, 1, steps + 1),
        time  = opts.clamp(params.time, 45, 10, 300),
    }
end

---Writes the rules from a running order it picked, so the set can never contradict itself. Any
---order satisfying every rule wins, not only the one the rules were drawn from.
---@param params table normalised options
---@return table state
---@return table puzzle
function sequencer.create(params)
    local order = opts.sample(params.steps, 1, params.steps)
    local place = {}
    for slot, step in ipairs(order) do place[step] = slot end

    local rules = {}
    while #rules < params.rules do
        local kind = math.random(3)

        if kind == 1 then
            local a = math.random(1, params.steps)
            local b = math.random(1, params.steps)
            if place[a] < place[b] then rules[#rules + 1] = { kind = 'before', a = a, b = b } end
        elseif kind == 2 then
            rules[#rules + 1] = { kind = 'last', a = order[params.steps] }
        else
            local a = math.random(1, params.steps)
            if place[a] ~= 1 then rules[#rules + 1] = { kind = 'notFirst', a = a } end
        end
    end

    return { rules = rules }, { steps = params.steps, rules = rules }
end

---Whether one rule holds for a running order.
---@param rule table
---@param place table<integer, integer> step -> slot
---@param steps integer
---@return boolean
local function holds(rule, place, steps)
    if rule.kind == 'before' then return place[rule.a] < place[rule.b] end
    if rule.kind == 'last' then return place[rule.a] == steps end
    return place[rule.a] ~= 1
end

---Judges a running order against every rule.
---@param state table round state from create
---@param params table normalised options
---@param raw any the steps in the order the player set
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function sequencer.answer(state, params, raw, _)
    local order = opts.list(raw, params.steps, 1, params.steps)
    if not order then return false, false, nil end

    local place = {}
    for slot, step in ipairs(order) do
        if place[step] then return false, false, nil end
        place[step] = slot
    end

    local broken = {}
    for index, rule in ipairs(state.rules) do
        if not holds(rule, place, params.steps) then broken[#broken + 1] = index end
    end

    return true, #broken == 0, { broken = broken }
end

return sequencer
