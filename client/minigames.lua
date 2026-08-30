---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Minigame config (configs/minigames.lua).
local MINIGAMES = type(config.Minigames) == 'table' and config.Minigames or {}

---@type boolean Whether the minigame exports do anything on this server.
local ENABLED = MINIGAMES.Enabled == true

---@type integer Seconds added to a round's own clock before the client gives up waiting for the
---server to call it. Only reached when the round is lost to a disconnect or a resource restart.
local WAIT_GRACE = 20

---@type table? The round on screen right now: its id, the promise the export is waiting on, the
---outcome the server sent, whether the phone was already open when it started, and the moment the
---takeover stops holding the phone shut.
local current = nil

---@type table Minigames module; the table returned at end of file.
local minigames = {}

---Whether a minigame is on screen. Read by the phone's close paths, which must refuse while a
---round is live: the game is a takeover, and closing out of it would strand the caller.
---@return boolean
function minigames.active()
    return current ~= nil and GetGameTimer() < current.deadline
end

---Settles the export's caller with the server's verdict and puts the phone back how it was found.
---@param win boolean
---@param receipt string?
local function settle(win, receipt)
    local round = current
    if not round then return end
    current = nil

    SendNUIMessage({ action = 'sd-phone:minigames:stop' })
    if not round.wasOpen then exports['sd-phone']:close() end

    round.done:resolve({ win = win, receipt = receipt })
end

---Starts a round and blocks until the server calls it, the player closes the result, or the wait
---grace runs out.
---@param gameId string
---@param params table?
---@return boolean win
---@return string? receipt the proof to hand a server event, present on a finished round
local function run(gameId, params)
    if not ENABLED or type(gameId) ~= 'string' or current then return false, nil end

    local res = lib.callback.await('sd-phone:server:minigames:open', false, {
        gameId = gameId,
        params = type(params) == 'table' and params or {},
    })
    if type(res) ~= 'table' or not res.success or type(res.data) ~= 'table' then return false, nil end

    local round = res.data
    local wasOpen = exports['sd-phone']:isOpen() == true

    local limit = (tonumber(round.options and round.options.time) or 60) + WAIT_GRACE

    current = {
        roundId  = round.roundId,
        done     = promise.new(),
        wasOpen  = wasOpen,
        outcome  = nil,
        payload  = round,
        deadline = GetGameTimer() + (limit * 1000),
    }

    if not wasOpen then exports['sd-phone']:open() end
    SendNUIMessage({ action = 'sd-phone:minigames:start', data = round })

    CreateThread(function()
        Wait(limit * 1000)
        if current and current.roundId == round.roundId then
            settle(current.outcome ~= nil and current.outcome or false, current.receipt)
        end
    end)

    local out = Citizen.Await(current and current.done or promise.new())
    return out.win == true, out.receipt
end

-- The server calls the round, never the page: this event is what the export's caller is told, so a
-- tampered NUI can report any score it likes and still not change the answer given here.
RegisterNetEvent('sd-phone:client:minigames:done', function(data)
    if type(data) ~= 'table' or not current or current.roundId ~= data.roundId then return end
    current.outcome = data.win == true
    current.receipt = type(data.receipt) == 'string' and data.receipt or nil
end)

---Hands the page the round it should be drawing. The page asks on mount, which is what recovers a
---round opened while the interface was still booting: SendNUIMessage has no replay, so a start sent
---into a page that has not subscribed yet is simply lost.
RegisterNUICallback('sd-phone:minigames:sync', function(_, cb)
    cb({ round = current and current.payload or nil })
end)

---Submits one answer and hands the page whatever the server made of it.
RegisterNUICallback('sd-phone:minigames:answer', function(data, cb)
    if not current then return cb({ success = false, message = 'No round' }) end
    cb(lib.callback.await('sd-phone:server:minigames:answer', false, {
        roundId = current.roundId,
        answer  = data and data.answer,
    }))
end)

---Gives the round up, for a clock that ran out on screen.
RegisterNUICallback('sd-phone:minigames:forfeit', function(_, cb)
    if not current then return cb({ success = false, message = 'No round' }) end
    cb(lib.callback.await('sd-phone:server:minigames:forfeit', false, { roundId = current.roundId }))
end)

---Dismisses the finished round, which is what releases the export's caller.
RegisterNUICallback('sd-phone:minigames:close', function(_, cb)
    if current then settle(current.outcome == true, current.receipt) end
    cb('ok')
end)

---Starts a round on behalf of the /minigame dev command and hands the receipt back for the server
---to redeem, which walks exactly the path a heist script takes.
RegisterNetEvent('sd-phone:client:minigames:test', function(data)
    if type(data) ~= 'table' then return end
    CreateThread(function()
        local win, receipt = run(data.gameId, data.params)
        TriggerServerEvent('sd-phone:server:minigames:tested', receipt, win)
    end)
end)

---Runs a minigame on this player's phone. The phone opens itself, the game takes the screen, and
---nothing closes it until the round is called. Pass a callback for an async round, or omit it to
---block the calling thread.
---@param gameId string a game in configs/minigames.lua Games
---@param params table? per-round options overriding the config defaults
---@param cb fun(win: boolean, receipt: string?)? called when the round ends
---@return boolean win false immediately when a callback was supplied
---@return string? receipt
exports('minigame', function(gameId, params, cb)
    if type(cb) == 'function' then
        CreateThread(function() cb(run(gameId, params)) end)
        return false, nil
    end
    return run(gameId, params)
end)

---Whether this player is in a minigame right now.
---@return boolean
exports('isMinigameOpen', function()
    return minigames.active()
end)

return minigames
