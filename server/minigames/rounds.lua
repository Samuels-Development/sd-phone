---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Shared server helpers (server.util): id minting.
local util = require 'server.util'
---@type table<string, table> Game id -> module (server.minigames.registry).
local registry = require 'server.minigames.registry'

---@type table Minigame config (configs/minigames.lua).
local MINIGAMES = type(config.Minigames) == 'table' and config.Minigames or {}

---@type table<string, table> Per-game option defaults from the config.
local DEFAULTS = type(MINIGAMES.Games) == 'table' and MINIGAMES.Games or {}

---@type integer Seconds an unfinished round survives before the sweeper drops it.
local ROUND_TIMEOUT = tonumber(MINIGAMES.RoundTimeout) or 180

---@type integer Seconds a finished round's receipt stays redeemable.
local RECEIPT_LIFETIME = tonumber(MINIGAMES.ReceiptLifetime) or 60

---@type integer Shortest gap between two answers, in milliseconds.
local MIN_ANSWER_GAP = tonumber(MINIGAMES.MinAnswerGap) or 200

---@type number Seconds of slack added to a round's own clock before the server calls time, so a
---player who answers on the buzzer is not robbed by the round trip.
local CLOCK_GRACE = 1.5

---@type table<string, table> Round id -> the open round. Server-side only: the answer lives here
---and is never sent to a client.
local live = {}

---@type table<integer, string> Player source -> their open round, so nobody holds two at once.
local bySource = {}

---@type table<string, table> Receipt -> the finished round it proves.
local receipts = {}

---@type table Rounds module; the table returned at end of file.
local rounds = {}

---Milliseconds since the server started, the clock every timing decision here reads.
---@return integer
local function now()
    return GetGameTimer()
end

---The options a round runs with: the config defaults for the game with the caller's on top.
---@param gameId string
---@param params table?
---@return table
local function merged(gameId, params)
    local out = {}
    for key, value in pairs(type(DEFAULTS[gameId]) == 'table' and DEFAULTS[gameId] or {}) do
        out[key] = value
    end
    for key, value in pairs(type(params) == 'table' and params or {}) do
        out[key] = value
    end
    return out
end

---Forgets a round and the source that owned it.
---@param roundId string
local function drop(roundId)
    local round = live[roundId]
    if not round then return end
    if bySource[round.src] == roundId then bySource[round.src] = nil end
    live[roundId] = nil
end

---Mints the one-time proof a finished round hands the calling resource.
---@param round table
---@param win boolean
---@return string
local function mintReceipt(round, win)
    local receipt = util.newId(12) .. util.newId(12)
    receipts[receipt] = { src = round.src, gameId = round.gameId, win = win, at = now() }
    return receipt
end

---Whether a game id names a game this server can run.
---@param gameId any
---@return boolean
function rounds.known(gameId)
    return type(gameId) == 'string' and registry[gameId] ~= nil
end

---Opens a round for a player and returns what the client needs to draw it.
---@param src integer player server id
---@param gameId string
---@param params table? caller options
---@return table? round { roundId, gameId, options, puzzle }
---@return string? message refusal reason
function rounds.open(src, gameId, params)
    local game = rounds.known(gameId) and registry[gameId] or nil
    if not game then return nil, 'Unknown minigame' end
    if bySource[src] then return nil, 'A minigame is already running' end

    local options = game.normalise(merged(gameId, params))
    local roundId = util.newId(12)
    local state, puzzle = game.create(options)

    live[roundId] = {
        src        = src,
        gameId     = gameId,
        options    = options,
        state      = state,
        openedAt   = now(),
        answeredAt = 0,
        attempts   = 0,
    }
    bySource[src] = roundId

    return { roundId = roundId, gameId = gameId, options = options, puzzle = puzzle }
end

---Whether a round's own clock has run out, latency grace included.
---@param round table
---@return boolean
local function expired(round)
    local limit = tonumber(round.options.time)
    if not limit then return false end
    return (now() - round.openedAt) > ((limit + CLOCK_GRACE) * 1000)
end

---Ends a round and mints the receipt that proves how it went.
---@param round table
---@param roundId string
---@param win boolean
---@param feedback table?
---@return table
local function finish(round, roundId, win, feedback)
    local game = registry[round.gameId]
    local reveal = type(game.reveal) == 'function' and game.reveal(round.state) or nil
    drop(roundId)
    return {
        done     = true,
        win      = win,
        feedback = feedback,
        reveal   = reveal,
        receipt  = mintReceipt(round, win),
    }
end

---Judges one answer against an open round.
---@param src integer player server id
---@param roundId any
---@param answer any
---@return table? result { done, win, feedback, reveal, receipt, attempts }
---@return string? message refusal reason
function rounds.answer(src, roundId, answer)
    local round = type(roundId) == 'string' and live[roundId] or nil
    if not round or round.src ~= src then return nil, 'No such round' end

    if expired(round) then return finish(round, roundId, false, nil) end

    local game = registry[round.gameId]
    local gap = tonumber(game.gap) or MIN_ANSWER_GAP

    local at = now()
    if round.answeredAt > 0 and (at - round.answeredAt) < gap then
        return nil, 'Too fast'
    end
    round.answeredAt = at

    local attempt = round.attempts + 1
    local resolved, win, feedback = game.answer(round.state, round.options, answer, attempt, at - round.openedAt)
    if not feedback then return nil, 'Bad answer' end

    round.attempts = attempt
    if resolved then return finish(round, roundId, win, feedback) end

    return { done = false, win = false, feedback = feedback, attempts = attempt }
end

---Ends a player's open round as a loss, for a clock that ran out or a player who walked away.
---@param src integer player server id
---@param roundId any nil ends whatever round the player holds
---@return table? result
function rounds.give(src, roundId)
    local id = type(roundId) == 'string' and roundId or bySource[src]
    local round = id and live[id] or nil
    if not round or round.src ~= src then return nil end
    return finish(round, id, false, nil)
end

---Reads a receipt exactly once, telling the caller how the round it proves actually ended.
---@param src integer the player the round must belong to
---@param receipt any
---@return boolean? win nil when the receipt is unknown, expired, spent or another player's
function rounds.redeem(src, receipt)
    local entry = type(receipt) == 'string' and receipts[receipt] or nil
    if not entry then return nil end
    receipts[receipt] = nil
    if entry.src ~= src then return nil end
    if (now() - entry.at) > (RECEIPT_LIFETIME * 1000) then return nil end
    return entry.win
end

---Drops every round and receipt a player owns.
---@param src integer player server id
function rounds.clear(src)
    local roundId = bySource[src]
    if roundId then drop(roundId) end
    for receipt, entry in pairs(receipts) do
        if entry.src == src then receipts[receipt] = nil end
    end
end

---Clears rounds whose player never came back and receipts nobody redeemed.
function rounds.sweep()
    local at = now()
    for roundId, round in pairs(live) do
        if (at - round.openedAt) > (ROUND_TIMEOUT * 1000) then drop(roundId) end
    end
    for receipt, entry in pairs(receipts) do
        if (at - entry.at) > (RECEIPT_LIFETIME * 1000) then receipts[receipt] = nil end
    end
end

return rounds
