---@type table Option helpers (server.minigames.opts): clamping, sampling and list reading.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local sweep = {}

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function sweep.normalise(params)
    local grid = opts.clamp(params.grid, 5, 4, 7)
    return {
        grid     = grid,
        live     = opts.clamp(params.live, 4, 1, math.floor((grid * grid) / 3)),
        mistakes = opts.clamp(params.mistakes, 1, 0, 5),
        time     = opts.clamp(params.time, 50, 10, 300),
    }
end

---Hides the live nodes. The grid never leaves the server: a probe is answered with a count of
---neighbours and nothing else.
---@param params table normalised options
---@return table state
---@return table puzzle
function sweep.create(params)
    local live = {}
    for _, cell in ipairs(opts.sample(params.live, 1, params.grid * params.grid)) do
        live[cell] = true
    end

    return { live = live, mistakes = 0 }, { grid = params.grid, live = params.live }
end

---How many of a cell's eight neighbours are live.
---@param live table<integer, boolean>
---@param cell integer
---@param grid integer
---@return integer
local function neighbours(live, cell, grid)
    local row = math.floor((cell - 1) / grid)
    local col = (cell - 1) % grid
    local count = 0

    for dr = -1, 1 do
        for dc = -1, 1 do
            local r, c = row + dr, col + dc
            if (dr ~= 0 or dc ~= 0) and r >= 0 and r < grid and c >= 0 and c < grid then
                if live[(r * grid) + c + 1] then count = count + 1 end
            end
        end
    end

    return count
end

---Judges a probe or a submitted set of flags.
---@param state table round state from create
---@param params table normalised options
---@param raw any { action, cell } or { action, flags }
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function sweep.answer(state, params, raw, _)
    if type(raw) ~= 'table' then return false, false, nil end
    local cells = params.grid * params.grid

    if raw.action == 'probe' then
        local cell = tonumber(raw.cell)
        if not cell or cell ~= math.floor(cell) or cell < 1 or cell > cells then
            return false, false, nil
        end

        if state.live[cell] then
            state.mistakes = state.mistakes + 1
            return state.mistakes > params.mistakes, false, {
                action   = 'probe',
                cell     = cell,
                hot      = true,
                mistakes = state.mistakes,
            }
        end

        return false, false, {
            action = 'probe',
            cell   = cell,
            hot    = false,
            near   = neighbours(state.live, cell, params.grid),
        }
    end

    if raw.action ~= 'flag' then return false, false, nil end

    local flags = opts.list(raw.flags, params.live, 1, cells)
    if not flags then return false, false, nil end

    local seen, matched = {}, 0
    for _, cell in ipairs(flags) do
        if seen[cell] then return false, false, nil end
        seen[cell] = true
        if state.live[cell] then matched = matched + 1 end
    end

    return true, matched >= params.live, { action = 'flag', matched = matched }
end

---Every live node, shown once the round is over.
---@param state table
---@return integer[]
function sweep.reveal(state)
    local out = {}
    for cell in pairs(state.live) do out[#out + 1] = cell end
    table.sort(out)
    return out
end

return sweep
