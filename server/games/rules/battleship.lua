---@type integer Board edge; matches web/src/apps/battleship/logic.ts (cell = row * GRID + col).
local GRID = 8

---@type table[] The fleet every player must deploy, by id; matches FLEET in logic.ts.
local FLEET = {
    { id = 'carrier',   name = 'Carrier',   size = 4 },
    { id = 'cruiser',   name = 'Cruiser',   size = 3 },
    { id = 'submarine', name = 'Submarine', size = 3 },
    { id = 'destroyer', name = 'Destroyer', size = 2 },
}

---@type table<string, table> Fleet entries by ship id.
local BY_ID = {}
---@type integer Cells a fleet covers; sinking this many wins.
local FLEET_CELLS = 0
for _, def in ipairs(FLEET) do
    BY_ID[def.id] = def
    FLEET_CELLS = FLEET_CELLS + def.size
end

---@type table Battleship rules; the table returned at end of file. Both fleets live on the server
---from deployment on, so a shot is resolved against the defender's real ships and neither client
---ever reports its own damage.
local rules = { turnBased = true, requiresSetup = true }

---Reads a cell index 0..63 from a client value; nil for anything else.
---@return integer|nil
local function cellOf(v)
    v = tonumber(v)
    if not v or v ~= v or v % 1 ~= 0 or v < 0 or v >= GRID * GRID then return nil end
    return math.tointeger(v)
end

---Checks one ship's cells form a straight, unbroken line of the right length.
---@param raw any client cell list
---@param size integer
---@return integer[]|nil cells sorted ascending
local function lineOf(raw, size)
    if type(raw) ~= 'table' or #raw ~= size then return nil end
    local cells = {}
    for i = 1, size do
        local c = cellOf(raw[i])
        if not c then return nil end
        cells[i] = c
    end
    table.sort(cells)
    local r0, c0 = cells[1] // GRID, cells[1] % GRID
    local horiz = size == 1 or cells[2] == cells[1] + 1
    for i = 2, size do
        local r, c = cells[i] // GRID, cells[i] % GRID
        if horiz then
            if r ~= r0 or c ~= c0 + i - 1 then return nil end
        elseif c ~= c0 or r ~= r0 + i - 1 then
            return nil
        end
    end
    return cells
end

---A fresh game: no fleets yet, no shots fired.
---@param sides string[] the engine's side pair
---@return table state
function rules.new(sides)
    return {
        sides = sides,
        fleets = {},
        board  = { [sides[1]] = {}, [sides[2]] = {} },
        shots  = { [sides[1]] = {}, [sides[2]] = {} },
        hits   = { [sides[1]] = 0, [sides[2]] = 0 },
    }
end

---Takes a side's deployment. Every ship of the fleet must appear once, in a straight line inside
---the board, with no two ships sharing a cell. A side deploys once.
---@param state table
---@param side string
---@param fleet any client payload: { { id, cells = {..} }, ... }
---@return boolean ok
---@return string|nil key locale key when refused
---@return string|nil message English text when refused
function rules.setup(state, side, fleet)
    if state.fleets[side] then return true end
    if type(fleet) ~= 'table' or #fleet ~= #FLEET then return false, 'games.badFleet', 'That fleet is not valid' end
    local ships, board, seen = {}, {}, {}
    for i = 1, #fleet do
        local entry = fleet[i]
        local def = type(entry) == 'table' and type(entry.id) == 'string' and BY_ID[entry.id]
        if not def or seen[def.id] then return false, 'games.badFleet', 'That fleet is not valid' end
        seen[def.id] = true
        local cells = lineOf(entry.cells, def.size)
        if not cells then return false, 'games.badFleet', 'That fleet is not valid' end
        local ship = { id = def.id, name = def.name, size = def.size, cells = cells, hits = 0 }
        for _, c in ipairs(cells) do
            if board[c] then return false, 'games.badFleet', 'That fleet is not valid' end
            board[c] = ship
        end
        ships[#ships + 1] = ship
    end
    state.fleets[side], state.board[side] = ships, board
    return true
end

---Fires one shot for side at the other side's fleet. The engine only calls this once both
---fleets are down and it is side's turn.
---@param state table
---@param side string shooter
---@param move any client payload { cell }
---@return table|nil res { mover, opponent, winner?, reason? }, or nil when refused
---@return string|nil key locale key when refused
---@return string|nil message English text when refused
function rules.move(state, side, move)
    local cell = cellOf(type(move) == 'table' and move.cell)
    if not cell then return nil, 'games.badMove', 'Bad move' end
    if state.shots[side][cell] then return nil, 'games.alreadyFired', 'You already fired there' end
    local defender = side == state.sides[1] and state.sides[2] or state.sides[1]
    local ship = state.board[defender][cell]
    state.shots[side][cell] = true
    local view = { by = side, cell = cell, hit = ship ~= nil }
    if ship then
        ship.hits = ship.hits + 1
        state.hits[side] = state.hits[side] + 1
        if ship.hits >= ship.size then view.sunk = ship.name end
    end
    local res = { mover = view, opponent = view }
    if state.hits[side] >= FLEET_CELLS then res.winner, res.reason = side, 'win' end
    return res
end

---Both fleets, revealed in the result push once the game is over.
---@param state table
---@return table reveal { fleets = { [side] = { { id, cells } } } }
function rules.reveal(state)
    local fleets = {}
    for side, ships in pairs(state.fleets) do
        local list = {}
        for i, s in ipairs(ships) do list[i] = { id = s.id, name = s.name, size = s.size, cells = s.cells } end
        fleets[side] = list
    end
    return { fleets = fleets }
end

return rules
