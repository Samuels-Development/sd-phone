---@type table Chess rules; the table returned at end of file. A port of the move generator in
---web/src/apps/chess/logic.ts (squares 0..63, a8 = 0, h1 = 63; white pieces upper case), so the
---server accepts exactly the moves the board offers and calls mate and stalemate the same way.
local rules = { turnBased = true }

---@type string[] Starting position, a8 first; '' is an empty square.
local INITIAL = {
    'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
    'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '',
    '', '', '', '', '', '', '', '',
    'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
    'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R',
}

local KNIGHT_D = { { -2, -1 }, { -2, 1 }, { -1, -2 }, { -1, 2 }, { 1, -2 }, { 1, 2 }, { 2, -1 }, { 2, 1 } }
local KING_D   = { { -1, -1 }, { -1, 0 }, { -1, 1 }, { 0, -1 }, { 0, 1 }, { 1, -1 }, { 1, 0 }, { 1, 1 } }
local DIAG     = { { -1, -1 }, { -1, 1 }, { 1, -1 }, { 1, 1 } }
local ORTHO    = { { -1, 0 }, { 1, 0 }, { 0, -1 }, { 0, 1 } }
local QUEEN    = { DIAG[1], DIAG[2], DIAG[3], DIAG[4], ORTHO[1], ORTHO[2], ORTHO[3], ORTHO[4] }

---@type table<string, boolean> Pieces a pawn may promote to, as the mover's upper-case letter.
local PROMOS = { Q = true, R = true, B = true, N = true }

---@return integer row 0..7, 0 being rank 8
local function rowOf(sq) return sq // 8 end
---@return integer column 0..7, 0 being the a-file
local function colOf(sq) return sq % 8 end
---@return boolean true when (r, c) lies on the board
local function onBoard(r, c) return r >= 0 and r < 8 and c >= 0 and c < 8 end
---@return string 'w' for an upper-case piece, 'b' for a lower-case one
local function colorOf(p) return (p:upper() == p) and 'w' or 'b' end
---@return string the other colour
local function enemy(c) return c == 'w' and 'b' or 'w' end
---@return string piece letter in the mover's case
local function cased(c, letter) return c == 'w' and letter or letter:lower() end

---@return integer square of c's king, -1 when there is none
local function findKing(board, c)
    local k = cased(c, 'K')
    for i = 0, 63 do if board[i] == k then return i end end
    return -1
end

---True when side `by` attacks square sq on this board.
---@return boolean
local function isAttacked(board, sq, by)
    local r, c = rowOf(sq), colOf(sq)
    local pr = by == 'w' and r + 1 or r - 1
    local P = cased(by, 'P')
    if onBoard(pr, c - 1) and board[pr * 8 + c - 1] == P then return true end
    if onBoard(pr, c + 1) and board[pr * 8 + c + 1] == P then return true end

    local N, K = cased(by, 'N'), cased(by, 'K')
    for _, d in ipairs(KNIGHT_D) do
        if onBoard(r + d[1], c + d[2]) and board[(r + d[1]) * 8 + c + d[2]] == N then return true end
    end
    for _, d in ipairs(KING_D) do
        if onBoard(r + d[1], c + d[2]) and board[(r + d[1]) * 8 + c + d[2]] == K then return true end
    end

    local B, R, Q = cased(by, 'B'), cased(by, 'R'), cased(by, 'Q')
    for _, rays in ipairs({ { DIAG, B }, { ORTHO, R } }) do
        for _, d in ipairs(rays[1]) do
            local rr, cc = r + d[1], c + d[2]
            while onBoard(rr, cc) do
                local p = board[rr * 8 + cc]
                if p ~= '' then
                    if p == rays[2] or p == Q then return true end
                    break
                end
                rr, cc = rr + d[1], cc + d[2]
            end
        end
    end
    return false
end

---@return boolean true when c's king is attacked
local function inCheck(state, c)
    return isAttacked(state.board, findKing(state.board, c), enemy(c))
end

---@type table<string, table[]> Each colour's two castles: the right that allows it, the king's
---start and landing squares, the rook's home, the squares that must be empty, and the squares the
---king stands on, crosses and lands on, none of which may be attacked.
local CASTLES = {
    w = {
        { right = 'wK', king = 60, to = 62, rook = 63, between = { 61, 62 }, path = { 60, 61, 62 } },
        { right = 'wQ', king = 60, to = 58, rook = 56, between = { 59, 58, 57 }, path = { 60, 59, 58 } },
    },
    b = {
        { right = 'bK', king = 4, to = 6, rook = 7, between = { 5, 6 }, path = { 4, 5, 6 } },
        { right = 'bQ', king = 4, to = 2, rook = 0, between = { 3, 2, 1 }, path = { 4, 3, 2 } },
    },
}

---True when colour c may castle this way now. Castling out of, through or into check is refused,
---as on the client.
---@param state table
---@param c string 'w' or 'b'
---@param castle table one CASTLES entry
---@return boolean
local function canCastle(state, c, castle)
    if not state.castling[castle.right] then return false end
    if state.board[castle.rook] ~= cased(c, 'R') then return false end

    for _, sq in ipairs(castle.between) do
        if state.board[sq] ~= '' then return false end
    end

    local opp = enemy(c)
    for _, sq in ipairs(castle.path) do
        if isAttacked(state.board, sq, opp) then return false end
    end
    return true
end

---Every pseudo-legal move for colour c (own king may be left in check), in the client's shape.
---@return table[] moves { from, to, promo?, flag? }
local function genPseudo(state, c)
    local board, moves = state.board, {}
    local function pushPawn(from, to, flag)
        local tr = rowOf(to)
        if tr == 0 or tr == 7 then
            for _, promo in ipairs({ 'Q', 'R', 'B', 'N' }) do moves[#moves + 1] = { from = from, to = to, promo = promo } end
        else
            moves[#moves + 1] = { from = from, to = to, flag = flag }
        end
    end
    local function empty(sq) return board[sq] == '' end
    local function foe(sq) return board[sq] ~= '' and colorOf(board[sq]) ~= c end

    for sq = 0, 63 do
        local p = board[sq]
        if p ~= '' and colorOf(p) == c then
            local r, cc = rowOf(sq), colOf(sq)
            local kind = p:upper()
            if kind == 'P' then
                local dir = c == 'w' and -1 or 1
                local startRow = c == 'w' and 6 or 1
                local one = (r + dir) * 8 + cc
                if onBoard(r + dir, cc) and empty(one) then
                    pushPawn(sq, one)
                    local two = (r + 2 * dir) * 8 + cc
                    if r == startRow and empty(two) then moves[#moves + 1] = { from = sq, to = two, flag = '2pawn' } end
                end
                for _, dc in ipairs({ -1, 1 }) do
                    local tr, tc = r + dir, cc + dc
                    if onBoard(tr, tc) then
                        local t = tr * 8 + tc
                        if foe(t) then
                            pushPawn(sq, t)
                        elseif t == state.ep then
                            moves[#moves + 1] = { from = sq, to = t, flag = 'ep' }
                        end
                    end
                end
            elseif kind == 'N' or kind == 'K' then
                for _, d in ipairs(kind == 'N' and KNIGHT_D or KING_D) do
                    if onBoard(r + d[1], cc + d[2]) then
                        local t = (r + d[1]) * 8 + cc + d[2]
                        if empty(t) or foe(t) then moves[#moves + 1] = { from = sq, to = t } end
                    end
                end
                if kind == 'K' then
                    for _, castle in ipairs(CASTLES[c]) do
                        if sq == castle.king and canCastle(state, c, castle) then
                            moves[#moves + 1] = { from = sq, to = castle.to, flag = 'castle' }
                        end
                    end
                end
            else
                local rays = kind == 'B' and DIAG or kind == 'R' and ORTHO or QUEEN
                for _, d in ipairs(rays) do
                    local rr, c2 = r + d[1], cc + d[2]
                    while onBoard(rr, c2) do
                        local t = rr * 8 + c2
                        if empty(t) then
                            moves[#moves + 1] = { from = sq, to = t }
                        else
                            if foe(t) then moves[#moves + 1] = { from = sq, to = t } end
                            break
                        end
                        rr, c2 = rr + d[1], c2 + d[2]
                    end
                end
            end
        end
    end
    return moves
end

---The position after a move, as a new state (the old one is left untouched).
---@return table state
local function makeMove(state, move)
    local board = {}
    for i = 0, 63 do board[i] = state.board[i] end
    local piece = board[move.from]
    local c = colorOf(piece)
    board[move.from] = ''

    if move.flag == 'ep' then board[rowOf(move.from) * 8 + colOf(move.to)] = '' end
    if move.flag == 'castle' then
        if move.to == 62 then board[61], board[63] = board[63], ''
        elseif move.to == 58 then board[59], board[56] = board[56], ''
        elseif move.to == 6 then board[5], board[7] = board[7], ''
        elseif move.to == 2 then board[3], board[0] = board[0], '' end
    end
    board[move.to] = move.promo and cased(c, move.promo) or piece

    local cs = state.castling
    local castling = { wK = cs.wK, wQ = cs.wQ, bK = cs.bK, bQ = cs.bQ }
    for _, sq in ipairs({ move.from, move.to }) do
        if sq == 60 then castling.wK, castling.wQ = false, false end
        if sq == 4 then castling.bK, castling.bQ = false, false end
        if sq == 63 then castling.wK = false end
        if sq == 56 then castling.wQ = false end
        if sq == 7 then castling.bK = false end
        if sq == 0 then castling.bQ = false end
    end

    local ep = move.flag == '2pawn' and (move.from + move.to) // 2 or nil
    return { board = board, turn = enemy(c), castling = castling, ep = ep }
end

---Every legal move for the side to move.
---@return table[] moves
local function legalMoves(state)
    local c, out = state.turn, {}
    for _, m in ipairs(genPseudo(state, c)) do
        local after = makeMove(state, m)
        if not isAttacked(after.board, findKing(after.board, c), enemy(c)) then out[#out + 1] = m end
    end
    return out
end

---Where the side to move stands: 'playing', 'check', 'checkmate' or 'stalemate'.
---@return string
local function status(state)
    local any = #legalMoves(state) > 0
    local checked = inCheck(state, state.turn)
    if any then return checked and 'check' or 'playing' end
    return checked and 'checkmate' or 'stalemate'
end

---True when neither side can ever mate: bare kings, or a lone bishop or knight against a bare
---king. The client has no such rule, so the result push is what tells both boards.
---@return boolean
local function deadPosition(board)
    local minors = 0
    for i = 0, 63 do
        local p = board[i]
        if p ~= '' then
            local k = p:upper()
            if k == 'B' or k == 'N' then minors = minors + 1
            elseif k ~= 'K' then return false end
        end
    end
    return minors <= 1
end

---Reads a square index 0..63 from a client value; nil for anything else.
---@return integer|nil
local function square(v)
    v = tonumber(v)
    if not v or v ~= v or v % 1 ~= 0 or v < 0 or v > 63 then return nil end
    return math.tointeger(v)
end

---A fresh game in the starting position, white to move.
---@param sides string[] the engine's side pair, { 'w', 'b' }
---@return table state
function rules.new(sides)
    local board = {}
    for i = 1, 64 do board[i - 1] = INITIAL[i] end
    return { sides = sides, board = board, turn = 'w', castling = { wK = true, wQ = true, bK = true, bQ = true }, ep = nil }
end

---Plays one move for side if it is legal. Only from, to and promo are read from the client; the
---flag is the server's own, so a forged castle or en passant flag changes nothing.
---@param state table
---@param side string 'w' or 'b'
---@param move any client payload { from, to, promo? }
---@return table|nil res { opponent, winner?, draw?, reason? }, or nil when refused
---@return string|nil key locale key when refused
---@return string|nil message English text when refused
function rules.move(state, side, move)
    if type(move) ~= 'table' or side ~= state.turn then return nil, 'games.badMove', 'Bad move' end
    local from, to = square(move.from), square(move.to)
    local promo = type(move.promo) == 'string' and PROMOS[move.promo] and move.promo or nil
    if not from or not to then return nil, 'games.badMove', 'Bad move' end
    local chosen
    for _, m in ipairs(legalMoves(state)) do
        if m.from == from and m.to == to and (m.promo == nil or m.promo == promo) then chosen = m break end
    end
    if not chosen then return nil, 'games.illegalMove', 'That move is not legal' end

    local after = makeMove(state, chosen)
    state.board, state.turn, state.castling, state.ep = after.board, after.turn, after.castling, after.ep

    local res = { opponent = { from = chosen.from, to = chosen.to, promo = chosen.promo, flag = chosen.flag } }
    local st = status(state)
    if st == 'checkmate' then res.winner, res.reason = side, 'win'
    elseif st == 'stalemate' then res.draw, res.reason = true, 'draw'
    elseif deadPosition(state.board) then res.draw, res.reason = true, 'material' end
    return res
end

rules.legalMoves = legalMoves

return rules
