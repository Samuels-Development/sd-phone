---@type table Option helpers (server.minigames.opts): clamping and sampling.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local maze = {}

---@type integer Milliseconds between steps. A maze is walked a cell at a time, so the shared floor
---for answers would cap the player at five steps a second.
maze.gap = 60

---@type integer Wall bits, one per compass point. A set bit means that side is closed.
local NORTH, EAST, SOUTH, WEST = 1, 2, 4, 8

---@type table<string, table> Each heading: its wall bit, the bit facing back, and the step it takes.
local HEADINGS = {
    n = { bit = NORTH, back = SOUTH, dr = -1, dc = 0 },
    e = { bit = EAST,  back = WEST,  dr = 0,  dc = 1 },
    s = { bit = SOUTH, back = NORTH, dr = 1,  dc = 0 },
    w = { bit = WEST,  back = EAST,  dr = 0,  dc = -1 },
}

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function maze.normalise(params)
    local width = opts.clamp(params.width, 12, 5, 30)
    local height = opts.clamp(params.height, 14, 5, 30)

    return {
        width  = width,
        height = height,
        sight  = opts.clamp(params.sight, 2, 1, 6),
        nodes  = opts.clamp(params.nodes, 3, 0, math.max(0, math.floor((width * height) / 8))),
        time   = opts.clamp(params.time, 80, 15, 300),
    }
end

---The cell index a row and column share.
---@param row integer
---@param col integer
---@param width integer
---@return integer
local function indexOf(row, col, width)
    return ((row - 1) * width) + col
end

---Carves a perfect maze with a depth-first walk, so exactly one route joins any two cells.
---@param width integer
---@param height integer
---@return integer[] wall masks by cell index
local function carve(width, height)
    local cells = {}
    for i = 1, width * height do cells[i] = NORTH | EAST | SOUTH | WEST end

    local seen = { [1] = true }
    local stack = { { row = 1, col = 1 } }

    while #stack > 0 do
        local at = stack[#stack]
        local options = {}

        for _, heading in pairs(HEADINGS) do
            local row, col = at.row + heading.dr, at.col + heading.dc
            if row >= 1 and row <= height and col >= 1 and col <= width
                and not seen[indexOf(row, col, width)] then
                options[#options + 1] = { heading = heading, row = row, col = col }
            end
        end

        if #options == 0 then
            table.remove(stack)
        else
            local step = options[math.random(#options)]
            local from = indexOf(at.row, at.col, width)
            local to = indexOf(step.row, step.col, width)

            cells[from] = cells[from] & ~step.heading.bit
            cells[to] = cells[to] & ~step.heading.back
            seen[to] = true
            stack[#stack + 1] = { row = step.row, col = step.col }
        end
    end

    return cells
end

---@type integer[] Every wall bit, for counting how boxed in a cell is.
local WALL_BITS = { NORTH, EAST, SOUTH, WEST }

---@type number Share of the maze's span a key must sit from the entrance. Keys dropped beside the
---spawn make the run trivial, so the near third of the board is ruled out before anything else.
local SPAWN_GAP = 0.34

---@type integer How many of the best hiding places to choose between. Always taking the very best
---would put the keys in the same corners every round.
local PICK_FROM = 4

---How many walls box a cell in. Dead ends have three and are the places worth hiding a key.
---@param mask integer
---@return integer
local function wallsAround(mask)
    local walls = 0
    for _, bit in ipairs(WALL_BITS) do
        if mask & bit ~= 0 then walls = walls + 1 end
    end
    return walls
end

---Hides the keys in dead ends far from the entrance, keeping them off the entrance and the exit.
---Falls back towards the spawn only if the board is too small to keep its distance.
---@param params table normalised options
---@param cells integer[] the carved board
---@return table<integer, boolean>
local function scatter(params, cells)
    local last = params.width * params.height
    local reach = math.max(2, math.floor((params.width + params.height) * SPAWN_GAP))
    local pool = {}

    while reach >= 0 do
        pool = {}
        for index = 2, last - 1 do
            local dist = math.floor((index - 1) / params.width) + ((index - 1) % params.width)
            if dist >= reach then
                pool[#pool + 1] = { cell = index, walls = wallsAround(cells[index]), dist = dist }
            end
        end
        if #pool >= params.nodes then break end
        reach = reach - 2
    end

    table.sort(pool, function(a, b)
        if a.walls ~= b.walls then return a.walls > b.walls end
        if a.dist ~= b.dist then return a.dist > b.dist end
        return a.cell < b.cell
    end)

    local nodes = {}
    for _ = 1, params.nodes do
        if #pool == 0 then break end
        local at = math.random(1, math.min(PICK_FROM, #pool))
        nodes[pool[at].cell] = true
        table.remove(pool, at)
    end

    return nodes
end

---What a position can make out: the cells around it, and any keys still lying in them.
---@param state table
---@param params table
---@return table cells
---@return integer[] nodes
local function inSight(state, params)
    local row = math.floor((state.pos - 1) / params.width) + 1
    local col = ((state.pos - 1) % params.width) + 1

    local cells, nodes = {}, {}
    for r = row - params.sight, row + params.sight do
        for c = col - params.sight, col + params.sight do
            if r >= 1 and r <= params.height and c >= 1 and c <= params.width then
                local index = indexOf(r, c, params.width)
                cells[#cells + 1] = { i = index, w = state.cells[index] }
                if state.nodes[index] then nodes[#nodes + 1] = index end
            end
        end
    end

    return cells, nodes
end

---Builds the maze and hands back only what the entrance can see. The rest of the board, and where
---the keys lie, stays here.
---@param params table normalised options
---@return table state
---@return table puzzle
function maze.create(params)
    local board = carve(params.width, params.height)
    local state = {
        cells = board,
        nodes = scatter(params, board),
        pos   = 1,
        got   = 0,
        exit  = params.width * params.height,
    }

    local cells, nodes = inSight(state, params)

    return state, {
        width  = params.width,
        height = params.height,
        sight  = params.sight,
        total  = params.nodes,
        pos    = state.pos,
        exit   = state.exit,
        cells  = cells,
        nodes  = nodes,
    }
end

---Takes one step. Walls refuse it, keys are picked up by walking over them, and the exit only opens
---once every key is carried.
---@param state table round state from create
---@param params table normalised options
---@param raw any { dir }
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function maze.answer(state, params, raw, _)
    local heading = type(raw) == 'table' and HEADINGS[raw.dir] or nil
    if not heading then return false, false, nil end

    local blocked = {
        pos = state.pos, blocked = true, cells = {}, nodes = {}, got = state.got,
    }

    if state.cells[state.pos] & heading.bit ~= 0 then return false, false, blocked end

    local row = math.floor((state.pos - 1) / params.width) + 1 + heading.dr
    local col = ((state.pos - 1) % params.width) + 1 + heading.dc
    if row < 1 or row > params.height or col < 1 or col > params.width then
        return false, false, blocked
    end

    state.pos = indexOf(row, col, params.width)

    if state.nodes[state.pos] then
        state.nodes[state.pos] = nil
        state.got = state.got + 1
    end

    local cells, nodes = inSight(state, params)
    local win = state.pos == state.exit and state.got >= params.nodes

    return win, win, {
        pos     = state.pos,
        blocked = false,
        cells   = cells,
        nodes   = nodes,
        got     = state.got,
    }
end

return maze
