---@type table Option helpers (server.minigames.opts): clamping and sampling.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local varhack = {}

---@type string Characters the register values are drawn from.
local HEX = '0123456789ABCDEF'

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function varhack.normalise(params)
    return {
        columns  = opts.clamp(params.columns, 4, 2, 6),
        rows     = opts.clamp(params.rows, 7, 3, 12),
        mistakes = opts.clamp(params.mistakes, 2, 0, 8),
        time     = opts.clamp(params.time, 30, 10, 300),
    }
end

---A two-character register value.
---@return string
local function value()
    local a = math.random(1, #HEX)
    local b = math.random(1, #HEX)
    return HEX:sub(a, a) .. HEX:sub(b, b)
end

---Fills the registers and marks one row in each column as the one to pull. Every value in a column
---is unique, so the target can never be ambiguous.
---@param params table normalised options
---@return table state
---@return table puzzle
function varhack.create(params)
    local columns, targets = {}, {}

    for c = 1, params.columns do
        local seen, list = {}, {}
        while #list < params.rows do
            local v = value()
            if not seen[v] then
                seen[v] = true
                list[#list + 1] = v
            end
        end
        columns[c] = list
        targets[c] = math.random(1, params.rows)
    end

    local wanted = {}
    for c = 1, params.columns do wanted[c] = columns[c][targets[c]] end

    return { targets = targets, done = 0, mistakes = 0 }, {
        columns = columns,
        wanted  = wanted,
    }
end

---Judges one pull.
---@param state table round state from create
---@param params table normalised options
---@param raw any { column, row }
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function varhack.answer(state, params, raw, _)
    if type(raw) ~= 'table' then return false, false, nil end

    local column = tonumber(raw.column)
    local row = tonumber(raw.row)
    if not column or not row then return false, false, nil end
    if column ~= state.done + 1 or column > params.columns then return false, false, nil end
    if row < 1 or row > params.rows then return false, false, nil end

    local right = state.targets[column] == row

    if right then
        state.done = state.done + 1
    else
        state.mistakes = state.mistakes + 1
    end

    local win = state.done >= params.columns
    local burnt = state.mistakes > params.mistakes

    return win or burnt, win, {
        column   = column,
        row      = row,
        right    = right,
        done     = state.done,
        mistakes = state.mistakes,
    }
end

return varhack
