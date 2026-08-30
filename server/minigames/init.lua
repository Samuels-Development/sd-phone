---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Shared server helpers (server.util): the envelopes.
local util   = require 'server.util'
---@type table Round engine (server.minigames.rounds): opens, judges and proves rounds.
local rounds = require 'server.minigames.rounds'

---@type table Minigame config (configs/minigames.lua).
local MINIGAMES = type(config.Minigames) == 'table' and config.Minigames or {}

---@type boolean Whether the minigame surface exists on this server.
local ENABLED = MINIGAMES.Enabled == true

---@type integer Milliseconds between sweeps of abandoned rounds and unredeemed receipts.
local SWEEP_MS = 30000

---@type fun(data: any): table Success envelope (server.util.ok).
local ok = util.ok
---@type fun(message: string): table Refusal envelope (server.util.fail).
local fail = util.fail

---Registers one minigame callback under the app's prefix, normalising a non-table payload at the
---boundary so a handler never reads a field off nil.
---@param action string callback name suffix
---@param handler fun(src: integer, payload: table): table
local function register(action, handler)
    lib.callback.register('sd-phone:server:minigames:' .. action, function(source, payload)
        return handler(source, type(payload) == 'table' and payload or {})
    end)
end

---Tells the player's client how a round really ended. The export's caller is answered from this
---event rather than from anything the page reports, and the receipt travels only on this path.
---@param src integer player server id
---@param roundId any
---@param result table
local function announce(src, roundId, result)
    if not result.done then return end
    TriggerClientEvent('sd-phone:client:minigames:done', src, {
        roundId = roundId,
        win     = result.win == true,
        receipt = result.receipt,
    })
end

---The same result with the receipt taken out, which is all the page is ever shown.
---@param result table
---@return table
local function forPage(result)
    return {
        done     = result.done == true,
        win      = result.win == true,
        feedback = result.feedback,
        reveal   = result.reveal,
        attempts = result.attempts,
    }
end

-- The callback surface exists only while the feature does. `open` is deliberately absent from the
-- client's NUI callbacks: rounds are opened by the export in client/minigames.lua, so the page
-- cannot mint itself a round to farm answers against.
if ENABLED then
    register('open', function(src, payload)
        local round, message = rounds.open(src, payload.gameId, payload.params)
        if not round then return fail(message or 'That minigame could not start') end
        return ok(round)
    end)

    register('answer', function(src, payload)
        local result, message = rounds.answer(src, payload.roundId, payload.answer)
        if not result then return fail(message or 'That answer was refused') end
        announce(src, payload.roundId, result)
        return ok(forPage(result))
    end)

    register('forfeit', function(src, payload)
        local result = rounds.give(src, payload.roundId)
        if not result then return fail('No such round') end
        announce(src, payload.roundId, result)
        return ok(forPage(result))
    end)

    AddEventHandler('playerDropped', function()
        rounds.clear(source)
    end)

    CreateThread(function()
        while true do
            Wait(SWEEP_MS)
            rounds.sweep()
        end
    end)
end

---Answers the /minigame dev command with what the round was really worth, comparing the client's
---own claim against the receipt so the console shows the two side by side.
RegisterNetEvent('sd-phone:server:minigames:tested', function(receipt, claimed)
    local src = source
    local truth = rounds.redeem(src, receipt)
    if truth == nil then return end

    print(('^2[sd-phone]^0 minigame result for %s: server says %s, client claimed %s')
        :format(src, tostring(truth), tostring(claimed == true)))
    TriggerClientEvent('sd-phone:client:notify', src, {
        app   = 'phone',
        title = 'Minigame',
        body  = truth and 'Server confirmed the win' or 'Server recorded a loss',
    })
end)

---/sdphone:minigame [game] [time] - DEV TOOL: runs one minigame on your own phone and redeems its
---receipt server-side, so the console shows whether the round is genuinely trusted. Namespaced
---because a plain 'minigame' collides with the client command sd-oxyrun registers.
---@param source integer player server id
---@param args table { game?: string, time?: number }
lib.addCommand('sdphone:minigame', {
    help       = 'Dev: run a phone minigame on yourself',
    restricted = 'group.admin',
    params     = {
        { name = 'game', type = 'string', help = 'Which minigame, e.g. bypass', optional = true },
        { name = 'time', type = 'number', help = 'Seconds on the clock', optional = true },
    },
}, function(source, args)
    local gameId = (args.game or 'bypass'):lower()
    if not rounds.known(gameId) then
        print(('^3[sd-phone]^0 no minigame called %s'):format(gameId))
        return
    end

    TriggerClientEvent('sd-phone:client:minigames:test', source, {
        gameId = gameId,
        params = args.time and { time = args.time } or {},
    })
end)

---Reads a minigame receipt once, telling the calling resource how the round really ended. This is
---the only trustworthy answer: the client's own callback runs on the player's machine.
---@param src integer the player the round must belong to
---@param receipt string the receipt handed to the client-side export callback
---@return boolean? win true won, false genuinely lost, nil for a receipt that proves nothing
exports('redeemMinigame', function(src, receipt)
    if not ENABLED then return nil end
    return rounds.redeem(tonumber(src) or 0, receipt)
end)
