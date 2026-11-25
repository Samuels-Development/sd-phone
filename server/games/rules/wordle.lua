---@type integer, integer Word length and guesses allowed; match web/src/apps/wordle/engine.ts.
local COLS, ROWS = 5, 6

---@type string[] Answers the server draws from. Mirrors WORDS in web/src/apps/wordle/words.ts,
---which solo play draws from. Guesses are not limited to it: like solo, any five letters count.
local WORDS = {
    'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again',
    'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alike', 'alive', 'allow', 'alone',
    'along', 'alter', 'angel', 'anger', 'angle', 'angry', 'apart', 'apple', 'apply', 'arena',
    'argue', 'arise', 'array', 'aside', 'asset', 'audio', 'audit', 'avoid', 'award', 'aware',
    'badly', 'baker', 'bases', 'beach', 'began', 'begin', 'being', 'below', 'bench', 'birth',
    'black', 'blame', 'blank', 'blast', 'blind', 'block', 'blood', 'board', 'boost', 'booth',
    'bound', 'brain', 'brand', 'brave', 'bread', 'break', 'breed', 'brief', 'bring', 'broad',
    'broke', 'brown', 'brush', 'build', 'built', 'buyer', 'cabin', 'cable', 'candy', 'cargo',
    'carry', 'catch', 'cause', 'chain', 'chair', 'chaos', 'charm', 'chart', 'chase', 'cheap',
    'check', 'chess', 'chest', 'chief', 'child', 'civil', 'claim', 'class', 'clean', 'clear',
    'click', 'cliff', 'climb', 'clock', 'close', 'cloud', 'coach', 'coast', 'could', 'count',
    'court', 'cover', 'crack', 'craft', 'crash', 'crazy', 'cream', 'crime', 'cross', 'crowd',
    'crown', 'crude', 'curve', 'cycle', 'daily', 'dance', 'dealt', 'death', 'delay', 'depth',
    'doing', 'doubt', 'dozen', 'draft', 'drama', 'drank', 'dream', 'dress', 'drink', 'drive',
    'drove', 'dying', 'eager', 'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy',
    'enter', 'entry', 'equal', 'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith',
    'false', 'fault', 'favor', 'fence', 'fewer', 'fiber', 'field', 'fifth', 'fifty', 'fight',
    'final', 'first', 'fixed', 'flame', 'flash', 'fleet', 'floor', 'fluid', 'focus', 'force',
    'forth', 'forty', 'forum', 'found', 'frame', 'frank', 'fraud', 'fresh', 'front', 'frost',
    'fruit', 'fully', 'funny', 'ghost', 'giant', 'given', 'glass', 'globe', 'glory', 'grace',
    'grade', 'grain', 'grand', 'grant', 'grass', 'grave', 'great', 'green', 'gross', 'group',
    'grown', 'guard', 'guess', 'guest', 'guide', 'happy', 'harsh', 'heart', 'heavy', 'hello',
    'horse', 'hotel', 'house', 'human', 'humor', 'hurry', 'ideal', 'image', 'imply', 'index',
    'inner', 'input', 'issue', 'joint', 'judge', 'juice', 'known', 'label', 'labor', 'large',
    'laser', 'later', 'laugh', 'layer', 'learn', 'least', 'leave', 'legal', 'lemon', 'level',
    'light', 'limit', 'lobby', 'local', 'logic', 'loose', 'lower', 'lucky', 'lunch', 'lyric',
    'magic', 'major', 'maker', 'march', 'match', 'maybe', 'mayor', 'meant', 'medal', 'media',
    'metal', 'meter', 'might', 'minor', 'minus', 'mixed', 'model', 'money', 'month', 'moral',
    'motor', 'mount', 'mouse', 'mouth', 'movie', 'music', 'naked', 'nerve', 'never', 'newly',
    'night', 'noise', 'north', 'noted', 'novel', 'nurse', 'ocean', 'offer', 'often', 'order',
    'other', 'ought', 'paint', 'panel', 'paper', 'party', 'peace', 'phase', 'phone', 'photo',
    'piano', 'piece', 'pilot', 'pitch', 'place', 'plain', 'plane', 'plant', 'plate', 'point',
    'pound', 'power', 'press', 'price', 'pride', 'prime', 'print', 'prior', 'prize', 'proof',
    'proud', 'prove', 'queen', 'quick', 'quiet', 'quite', 'radio', 'raise', 'range', 'rapid',
    'ratio', 'reach', 'react', 'ready', 'realm', 'rebel', 'refer', 'relax', 'reply', 'rifle',
    'right', 'rigid', 'rival', 'river', 'robot', 'rough', 'round', 'route', 'royal', 'rural',
    'scale', 'scene', 'scope', 'score', 'sense', 'serve', 'seven', 'shall', 'shape', 'share',
    'sharp', 'sheet', 'shelf', 'shell', 'shift', 'shine', 'shirt', 'shock', 'shoot', 'short',
    'shown', 'sight', 'silly', 'since', 'sixth', 'sixty', 'sized', 'skill', 'sleep', 'slide',
    'small', 'smart', 'smile', 'smoke', 'snake', 'solar', 'solid', 'solve', 'sorry', 'sound',
    'south', 'space', 'spare', 'speak', 'speed', 'spend', 'spent', 'spice', 'split', 'spoke',
    'sport', 'staff', 'stage', 'stake', 'stand', 'start', 'state', 'steam', 'steel', 'steep',
    'steer', 'stern', 'stick', 'still', 'stock', 'stone', 'stood', 'store', 'storm', 'story',
    'strip', 'stuck', 'study', 'stuff', 'style', 'sugar', 'suite', 'super', 'sweet', 'swift',
    'swing', 'table', 'taken', 'taste', 'taxes', 'teach', 'thank', 'theft', 'their', 'theme',
    'there', 'these', 'thick', 'thing', 'think', 'third', 'those', 'three', 'threw', 'throw',
    'tiger', 'tight', 'tired', 'title', 'today', 'token', 'topic', 'total', 'touch', 'tough',
    'tower', 'trace', 'track', 'trade', 'trail', 'train', 'treat', 'trend', 'trial', 'tribe',
    'trick', 'tried', 'truck', 'truly', 'trust', 'truth', 'twice', 'twist', 'ultra', 'uncle',
    'under', 'union', 'unite', 'unity', 'until', 'upper', 'upset', 'urban', 'usual', 'valid',
    'value', 'video', 'virus', 'visit', 'vital', 'voice', 'waste', 'watch', 'water', 'wheel',
    'where', 'which', 'while', 'white', 'whole', 'whose', 'woman', 'world', 'worry', 'worse',
    'worst', 'worth', 'would', 'wound', 'write', 'wrong', 'wrote', 'yield', 'young', 'youth',
}

for i, w in ipairs(WORDS) do WORDS[i] = w:upper() end

---@type table Wordle rules; the table returned at end of file. The server picks the word and keeps
---it until the game is over, colours every guess itself and times both players on its own clock, so
---a client can neither read the answer nor claim a solve it did not make.
local rules = { turnBased = false, timed = true }

---Colours a guess against the answer the way the client's scoreGuess does: greens first, then
---yellows from the letters the greens left over.
---@param guess string upper-case, COLS letters
---@param answer string upper-case, COLS letters
---@return string[] row 'correct' | 'present' | 'absent' per letter
function rules.score(guess, answer)
    local res, counts = {}, {}
    for i = 1, COLS do
        local ch = answer:sub(i, i)
        counts[ch] = (counts[ch] or 0) + 1
        res[i] = 'absent'
    end
    for i = 1, COLS do
        local ch = guess:sub(i, i)
        if ch == answer:sub(i, i) then
            res[i] = 'correct'
            counts[ch] = counts[ch] - 1
        end
    end
    for i = 1, COLS do
        local ch = guess:sub(i, i)
        if res[i] ~= 'correct' and (counts[ch] or 0) > 0 then
            res[i] = 'present'
            counts[ch] = counts[ch] - 1
        end
    end
    return res
end

---Orders two finished players: a solve beats no solve, then fewer tries, then the earlier finish.
---@return integer 1 when a wins, -1 when b wins, 0 for a draw
local function compare(a, b)
    if a.solved ~= b.solved then return a.solved and 1 or -1 end
    if not a.solved then return 0 end
    if a.tries ~= b.tries then return a.tries < b.tries and 1 or -1 end
    if a.finishMs ~= b.finishMs then return a.finishMs < b.finishMs and 1 or -1 end
    return 0
end

---The outcome once both players are done. Returns nothing while either is still guessing.
---@return table|nil res { winner?, draw?, reason }
local function decide(state)
    local s1, s2 = state.sides[1], state.sides[2]
    local a, b = state.players[s1], state.players[s2]
    if not (a.done and b.done) then return nil end
    local c = compare(a, b)
    if c == 0 then return { draw = true, reason = 'draw' } end
    return { winner = c > 0 and s1 or s2, reason = 'win' }
end

---A fresh race to one word.
---@param sides string[] the engine's side pair
---@param ctx table { now = fun(): integer, random = fun(n: integer): integer, limitMs = integer }
---@return table state
function rules.new(sides, ctx)
    local players = {}
    for _, side in ipairs(sides) do
        players[side] = { rows = {}, guesses = {}, solved = false, done = false, tries = 0, finishMs = 0 }
    end
    return {
        sides = sides, players = players, now = ctx.now, limitMs = ctx.limitMs,
        word = WORDS[ctx.random(#WORDS)], startedAt = ctx.now(),
    }
end

---Takes one guess from side: any five letters A-Z, in either case, as solo play allows. The letter
---check is an explicit A-Z class because %u follows the C locale. The mover sees its letters and
---colours; the opponent sees only the colours, so watching the other board never gives the word
---away.
---@param state table
---@param side string
---@param move any client payload { guess }
---@return table|nil res { mover, opponent, winner?, draw?, reason? }, or nil when refused
---@return string|nil key locale key when refused
---@return string|nil message English text when refused
function rules.move(state, side, move)
    local p = state.players[side]
    if p.done then return nil, 'games.alreadyFinished', 'You already finished' end
    local elapsed = state.now() - state.startedAt
    if elapsed > state.limitMs then return nil, 'games.timeUp', "Time's up" end
    local guess = type(move) == 'table' and type(move.guess) == 'string' and move.guess:upper() or ''
    if #guess ~= COLS or not guess:match('^[A-Z]+$') then return nil, 'games.badMove', 'Bad move' end

    local row = rules.score(guess, state.word)
    p.rows[#p.rows + 1] = row
    p.guesses[#p.guesses + 1] = guess
    p.solved = guess == state.word
    if p.solved or #p.rows >= ROWS then
        p.done, p.tries, p.finishMs = true, #p.rows, elapsed
    end
    local failed = p.done and not p.solved
    local res = decide(state) or {}
    res.mover    = { side = side, guess = guess, row = row, solved = p.solved, failed = failed, tries = p.tries }
    res.opponent = { side = side, row = row, solved = p.solved, failed = failed, tries = p.tries }
    return res
end

---The clock ran out: everyone still guessing is out, and the race is decided as it stands.
---@param state table
---@return table res { winner?, draw?, reason }
function rules.expire(state)
    for _, p in pairs(state.players) do
        if not p.done then p.done, p.tries, p.finishMs = true, #p.rows, state.limitMs end
    end
    local res = decide(state)
    res.reason = 'time'
    return res
end

---The word and both boards, sent with the result once the game is over.
---@param state table
---@return table reveal { word, progress = { [side] = { rows, solved, failed, tries, finishMs } } }
function rules.reveal(state)
    local progress = {}
    for side, p in pairs(state.players) do
        progress[side] = { rows = p.rows, solved = p.solved, failed = p.done and not p.solved, tries = p.tries, finishMs = p.finishMs }
    end
    return { word = state.word, progress = progress }
end

return rules
