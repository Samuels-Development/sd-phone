---@type integer, integer Board size; matches web/src/apps/connectfour/logic.ts, whose cell index
---(row * COLS + col, row 0 at the top) the server uses too.
local COLS, ROWS = 7, 6

---@type table<integer, integer[]> The four line directions a win can run in, as { dRow, dCol }.
local DIRS = { { 0, 1 }, { 1, 0 }, { 1, 1 }, { 1, -1 } }

---@type table Connect Four rules; the table returned at end of file. The server holds the board,
---so a drop is checked against the real column heights and the result is the server's own.
local rules = { turnBased = true }

---@return integer cell index for a row and column
local function idx(r, c) return r * COLS + c end

---Lowest empty row in a column, or -1 when the column is full.
---@param board table<integer, integer> cell -> disc
---@param col integer
---@return integer row
local function dropRow(board, col)
    for r = ROWS - 1, 0, -1 do
        if not board[idx(r, col)] then return r end
    end
    return -1
end

---Discs of one colour running from a cell in one direction, not counting the cell itself.
---@return integer run length
local function run(board, r, c, dr, dc, disc)
    local n = 0
    r, c = r + dr, c + dc
    while r >= 0 and r < ROWS and c >= 0 and c < COLS and board[idx(r, c)] == disc do
        n = n + 1
        r, c = r + dr, c + dc
    end
    return n
end

---True when the disc just dropped at (r, c) completes four in a row. Only lines through the new
---disc can be new, so the whole board never needs scanning.
---@return boolean
local function wins(board, r, c, disc)
    for _, d in ipairs(DIRS) do
        if 1 + run(board, r, c, d[1], d[2], disc) + run(board, r, c, -d[1], -d[2], disc) >= 4 then return true end
    end
    return false
end

---Reads a whole number in [lo, hi] from a client value; nil for anything else.
---@return integer|nil
local function intIn(v, lo, hi)
    v = tonumber(v)
    if not v or v ~= v or v % 1 ~= 0 or v < lo or v > hi then return nil end
    return math.tointeger(v)
end

---A fresh game. sides[1] drops disc 1 (red) and moves first, as on the client.
---@param sides string[] the engine's side pair
---@return table state
function rules.new(sides)
    return { sides = sides, board = {}, count = 0 }
end

---Applies one drop for side. The engine has already checked whose turn it is.
---@param state table
---@param side string mover
---@param move any client payload { col }
---@return table|nil res { opponent, winner?, draw?, reason? }, or nil when refused
---@return string|nil key locale key when refused
---@return string|nil message English text when refused
function rules.move(state, side, move)
    local col = intIn(type(move) == 'table' and move.col, 0, COLS - 1)
    if not col then return nil, 'games.badMove', 'Bad move' end
    local r = dropRow(state.board, col)
    if r < 0 then return nil, 'games.columnFull', 'That column is full' end
    local disc = side == state.sides[1] and 1 or 2
    state.board[idx(r, col)] = disc
    state.count = state.count + 1
    local res = { opponent = { col = col } }
    if wins(state.board, r, col, disc) then
        res.winner, res.reason = side, 'win'
    elseif state.count >= COLS * ROWS then
        res.draw, res.reason = true, 'draw'
    end
    return res
end

return rules
