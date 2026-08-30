---@type table Option helpers (server.minigames.opts): clamping and list reading.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local anagram = {}

---@type string[] Words the scrambler draws from. Kept to plain technical nouns so a player reading
---a second language still has a fair chance at them.
local WORDS = {
    'access', 'backup', 'binary', 'breach', 'bypass', 'cipher', 'client', 'daemon',
    'decode', 'device', 'domain', 'encode', 'exploit', 'kernel', 'keypad', 'lookup',
    'memory', 'module', 'packet', 'payload', 'proxy', 'router', 'script', 'secure',
    'server', 'signal', 'socket', 'system', 'tunnel', 'vector',
}

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function anagram.normalise(params)
    return {
        attempts = opts.clamp(params.attempts, 3, 1, 8),
        time     = opts.clamp(params.time, 45, 10, 300),
    }
end

---Scrambles a word, retrying until the letters no longer read as the word itself.
---@param word string
---@return string[]
local function shuffle(word)
    local letters = {}
    for i = 1, #word do letters[i] = word:sub(i, i) end

    for _ = 1, 12 do
        for i = #letters, 2, -1 do
            local j = math.random(1, i)
            letters[i], letters[j] = letters[j], letters[i]
        end
        if table.concat(letters) ~= word then break end
    end

    return letters
end

---Picks a word and hands over its letters out of order. The word itself never travels; the letters
---the client holds are kept here so an arrangement of them can be checked.
---@param _ table normalised options, unused: the word list is fixed
---@return table state
---@return table puzzle
function anagram.create(_)
    local word = WORDS[math.random(#WORDS)]
    local letters = shuffle(word)

    return { word = word, letters = letters }, { letters = letters }
end

---Judges an arrangement: the player sends the scrambled slots in the order they read them, and the
---letters at those slots have to spell the word.
---@param state table round state from create
---@param params table normalised options
---@param raw any the scrambled slots in the order the player set them
---@param attempt integer answers taken so far, this one included
---@return boolean resolved
---@return boolean win
---@return table? feedback
function anagram.answer(state, params, raw, attempt)
    local size = #state.letters
    local order = opts.list(raw, size, 1, size)
    if not order then return false, false, nil end

    local seen = {}
    for _, slot in ipairs(order) do
        if seen[slot] then return false, false, nil end
        seen[slot] = true
    end

    local spelled = {}
    for i, slot in ipairs(order) do spelled[i] = state.letters[slot] end

    local guess = table.concat(spelled)
    local win = guess == state.word

    local right = 0
    for i = 1, size do
        if spelled[i] == state.word:sub(i, i) then right = right + 1 end
    end

    return win or attempt >= params.attempts, win, { right = right, size = size }
end

---The word, spelled out once the round is over.
---@param state table
---@return string
function anagram.reveal(state)
    return state.word
end

return anagram
