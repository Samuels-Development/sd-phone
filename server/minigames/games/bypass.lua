---@type table Shared server helpers (server.util): the numeric guard.
local util = require 'server.util'

---@type table Game module; the table returned at end of file.
local bypass = {}

---@type integer Shortest code the game will build.
local MIN_DIGITS = 3
---@type integer Longest code the game will build. Ten digits with no repeats is the hard ceiling.
local MAX_DIGITS = 6
---@type integer Fewest guesses a round may allow.
local MIN_ATTEMPTS = 1
---@type integer Most guesses a round may allow.
local MAX_ATTEMPTS = 12
---@type integer Shortest clock a round may run, in seconds.
local MIN_TIME = 10
---@type integer Longest clock a round may run, in seconds.
local MAX_TIME = 300

---Reads a number into a whole value inside a range, falling back when it is unusable.
---@param value any
---@param fallback integer
---@param low integer
---@param high integer
---@return integer
local function clamp(value, fallback, low, high)
    local n = tonumber(value)
    if not n or not util.finite(n) then n = fallback end
    n = math.floor(n)
    if n < low then return low end
    if n > high then return high end
    return n
end

---Settles the options a round runs with. Everything the player is told about the puzzle comes from
---here, so this shape is safe to send to the client.
---@param params table caller options already merged over the config defaults
---@return table
function bypass.normalise(params)
    return {
        digits   = clamp(params.digits, 4, MIN_DIGITS, MAX_DIGITS),
        attempts = clamp(params.attempts, 6, MIN_ATTEMPTS, MAX_ATTEMPTS),
        time     = clamp(params.time, 45, MIN_TIME, MAX_TIME),
        repeats  = params.repeats == true,
    }
end

---Builds the secret code. The returned state never leaves the server.
---@param params table normalised options
---@return table state
function bypass.create(params)
    local code, used = {}, {}
    for i = 1, params.digits do
        local digit = math.random(0, 9)
        if not params.repeats then
            while used[digit] do digit = math.random(0, 9) end
            used[digit] = true
        end
        code[i] = digit
    end
    return { code = code }
end

---Reads a submitted answer into a digit list, refusing anything that is not exactly the right
---count of single digits.
---@param raw any
---@param digits integer
---@return integer[]?
local function guessOf(raw, digits)
    if type(raw) ~= 'table' then return nil end
    local out = {}
    for i = 1, digits do
        local n = tonumber(raw[i])
        if not n or n ~= math.floor(n) or n < 0 or n > 9 then return nil end
        out[i] = n
    end
    if raw[digits + 1] ~= nil then return nil end
    return out
end

---Scores a guess: how many digits sit in the right place, and how many appear in the code
---somewhere else.
---@param code integer[]
---@param guess integer[]
---@return integer exact
---@return integer present
local function score(code, guess)
    local exact, present = 0, 0
    local codeLeft, guessLeft = {}, {}
    for i = 1, #code do
        if code[i] == guess[i] then
            exact = exact + 1
        else
            codeLeft[code[i]] = (codeLeft[code[i]] or 0) + 1
            guessLeft[guess[i]] = (guessLeft[guess[i]] or 0) + 1
        end
    end
    for digit, count in pairs(guessLeft) do
        local available = codeLeft[digit] or 0
        present = present + (count < available and count or available)
    end
    return exact, present
end

---Judges one guess. The round ends when the code is matched or the last attempt is spent.
---@param state table round state from create
---@param params table normalised options
---@param raw any the client's answer
---@param attempt integer answers taken so far, this one included
---@return boolean resolved
---@return boolean win
---@return table? feedback the row the player is shown, nil when the answer was malformed
function bypass.answer(state, params, raw, attempt)
    local guess = guessOf(raw, params.digits)
    if not guess then return false, false, nil end

    local exact, present = score(state.code, guess)
    local win = exact == params.digits

    return win or attempt >= params.attempts, win, { guess = guess, exact = exact, present = present }
end

---The code itself, shown to the player once the round is over.
---@param state table
---@return integer[]
function bypass.reveal(state)
    return state.code
end

return bypass
