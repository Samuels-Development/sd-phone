---@type table Option helpers (server.minigames.opts): clamping.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local router = {}

---@type integer Open-side bits, one per compass point.
local NORTH, EAST, SOUTH, WEST = 1, 2, 4, 8

---@type table<integer, integer> The bit facing back from each direction.
local OPPOSITE = { [NORTH] = SOUTH, [EAST] = WEST, [SOUTH] = NORTH, [WEST] = EAST }

---@type integer[] Shapes dropped on tiles the packet never has to cross.
local FILLER = { NORTH | EAST, NORTH | SOUTH, EAST | SOUTH, NORTH | EAST | SOUTH }

---Turns a tile one quarter clockwise, carrying the west opening around to north.
---@param mask integer
---@return integer
local function turn(mask)
    return ((mask << 1) & 15) | ((mask & WEST) >> 3)
end

---Turns a tile a number of quarters.
---@param mask integer
---@param times integer
---@return integer
local function turned(mask, times)
    for _ = 1, times % 4 do mask = turn(mask) end
    return mask
end

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function router.normalise(params)
    return {
        grid = opts.clamp(params.grid, 4, 3, 6),
        time = opts.clamp(params.time, 45, 10, 300),
    }
end

---Walks a route from the top-left tile to the bottom-right one, only ever going east or south so
---the path can never cross itself.
---@param grid integer
---@return integer[] cell indexes in order
local function routeThrough(grid)
    local row, col = 1, 1
    local path = { 1 }

    while row < grid or col < grid do
        local goEast = col < grid and (row >= grid or math.random(2) == 1)
        if goEast then col = col + 1 else row = row + 1 end
        path[#path + 1] = (row - 1) * grid + col
    end

    return path
end

---Lays the board out, then spins every tile so the route it hides has to be rebuilt by hand.
---@param params table normalised options
---@return table state
---@return table puzzle
function router.create(params)
    local grid = params.grid
    local path = routeThrough(grid)

    local masks = {}
    for i = 1, grid * grid do masks[i] = FILLER[math.random(#FILLER)] end

    masks[path[1]] = WEST
    for step = 1, #path - 1 do
        local from, to = path[step], path[step + 1]
        local dir = (to - from == 1) and EAST or SOUTH
        masks[from] = masks[from] | dir
        masks[to] = OPPOSITE[dir]
    end
    masks[path[#path]] = masks[path[#path]] | EAST

    local shown = {}
    for i = 1, grid * grid do shown[i] = turned(masks[i], math.random(0, 3)) end

    return { shown = shown, grid = grid }, { grid = grid, tiles = shown }
end

---Whether the packet can cross the board once the player's turns are applied.
---@param tiles integer[]
---@param grid integer
---@return boolean
local function connected(tiles, grid)
    if tiles[1] & WEST == 0 then return false end

    local seen, queue = { [1] = true }, { 1 }
    while #queue > 0 do
        local cell = table.remove(queue)
        local row = math.floor((cell - 1) / grid) + 1
        local col = ((cell - 1) % grid) + 1

        if cell == grid * grid and tiles[cell] & EAST ~= 0 then return true end

        local steps = {
            { dir = NORTH, next = cell - grid, ok = row > 1 },
            { dir = SOUTH, next = cell + grid, ok = row < grid },
            { dir = WEST,  next = cell - 1,    ok = col > 1 },
            { dir = EAST,  next = cell + 1,    ok = col < grid },
        }

        for _, step in ipairs(steps) do
            if step.ok and not seen[step.next]
                and tiles[cell] & step.dir ~= 0
                and tiles[step.next] & OPPOSITE[step.dir] ~= 0 then
                seen[step.next] = true
                queue[#queue + 1] = step.next
            end
        end
    end

    return false
end

---Judges a submitted board by rebuilding it from the turns the player reports and walking it.
---@param state table round state from create
---@param params table normalised options
---@param raw any one turn count per tile
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function router.answer(state, params, raw, _)
    local cells = params.grid * params.grid
    local turns = opts.list(raw, cells, 0, 3)
    if not turns then return false, false, nil end

    local tiles = {}
    for i = 1, cells do tiles[i] = turned(state.shown[i], turns[i]) end

    return true, connected(tiles, params.grid), { turns = turns }
end

return router
