---@type table Shared server helpers (server.util): envelope builders, limiters, cleanup hook.
local util   = require 'server.util'
---@type table Casino helpers (server.games.casino.shared): identity and display name from a
---server-trusted source only.
local shared = require 'server.games.casino.shared'
---@type table Chip wallet (server.games.chips): the awaited credit when a player stands up.
local chips  = require 'server.games.chips'
---@type table Table engine (server.games.casino.holdem.table): every rule and all pot arithmetic.
local holdem = require 'server.games.casino.holdem.table'

---@type boolean Whether the Casino app is switched on in configs/apps.lua. A disabled app costs no
---threads and no ticks.
local APP_ENABLED = util.appEnabled('casino')
---@type integer Table clock cadence (ms). The action countdown is drawn client-side off a deadline,
---so quarter-second resolution is all the server needs to expire one.
local TICK_MS = 250
---@type integer, integer Rolling budget for holdemAct. One human action per turn tops out far under
---this even at six tables of fast play.
local ACT_WINDOW, ACT_MAX = 10000, 40
---@type integer Minimum gap between sit attempts per character (ms); each one is a wallet debit.
local SIT_COOLDOWN = 1000
---@type integer Minimum gap between table creations per character (ms). The per-player cap already
---stops a flood, but this keeps a stuck button from spending the floor allowance on retries.
local CREATE_COOLDOWN = 5000

lib.callback.register('sd-phone:server:games:holdemTables', function(src)
    if not shared.enabled('holdem') then return shared.shut() end
    if not APP_ENABLED then return util.fail('games.casinoClosed', 'The casino is closed') end
    if not shared.cidOf(src) then return util.fail('games.playerNotFound', 'Player not found') end
    return util.ok({ tables = holdem.tables(), create = holdem.createLimits() })
end)

lib.callback.register('sd-phone:server:games:holdemCreate', function(src, payload)
    if not shared.enabled('holdem') then return shared.shut() end
    payload = type(payload) == 'table' and payload or {}
    if not APP_ENABLED then return util.fail('games.casinoClosed', 'The casino is closed') end
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.cooldown(cid, 'games:holdemCreate', CREATE_COOLDOWN) then return util.fail('games.slowDown', 'Slow down') end
    local tableId, refusal = holdem.create(cid, shared.nameOf(src), payload)
    if not tableId then
        return refusal or util.fail('games.couldNotOpenTable', 'Could not open the table')
    end
    return util.ok({ tableId = tableId })
end)

lib.callback.register('sd-phone:server:games:holdemSit', function(src, payload)
    if not shared.enabled('holdem') then return shared.shut() end
    payload = type(payload) == 'table' and payload or {}
    if not APP_ENABLED then return util.fail('games.casinoClosed', 'The casino is closed') end
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.cooldown(cid, 'games:holdemSit', SIT_COOLDOWN) then return util.fail('games.slowDown', 'Slow down') end
    local view, refusal = holdem.sit(src, cid, shared.nameOf(src), payload.tableId, payload.seat, payload.buyIn)
    if not view then return refusal or util.fail('games.couldNotSitDown', 'Could not sit down') end
    return util.ok(view)
end)

lib.callback.register('sd-phone:server:games:holdemLeave', function(src)
    if not APP_ENABLED then return util.fail('games.casinoClosed', 'The casino is closed') end
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    local amount, refusal = holdem.leave(cid)
    if not amount then return refusal or util.fail('games.notSeated', 'Not seated') end
    -- The stack came off the table before this yield, so a second holdemLeave finds no seat and the
    -- same chips cannot be credited twice.
    local balance = amount > 0 and chips.add(cid, amount) or chips.get(cid)
    return util.ok({ chips = balance })
end)

lib.callback.register('sd-phone:server:games:holdemAct', function(src, payload)
    if not shared.enabled('holdem') then return shared.shut() end
    payload = type(payload) == 'table' and payload or {}
    if not APP_ENABLED then return util.fail('games.casinoClosed', 'The casino is closed') end
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    if not util.rateLimit(cid, 'holdem:act', ACT_WINDOW, ACT_MAX) then return util.fail('games.slowDown', 'Slow down') end
    local result, refusal = holdem.act(cid, payload.tableId, payload.handId, payload.action, payload.to)
    if not result then return refusal or util.fail('games.moveNotAllowed', 'That move is not allowed') end
    return util.ok(result)
end)

lib.callback.register('sd-phone:server:games:holdemSync', function(src, payload)
    if not shared.enabled('holdem') then return shared.shut() end
    payload = type(payload) == 'table' and payload or {}
    if not APP_ENABLED then return util.fail('games.casinoClosed', 'The casino is closed') end
    local cid = shared.cidOf(src); if not cid then return util.fail('games.playerNotFound', 'Player not found') end
    local view, refusal = holdem.sync(cid, payload.tableId, src)
    if not view then return refusal or util.fail('games.tableNotFound', 'Table not found') end
    return util.ok(view)
end)

---A dropped player folds and takes their stack with them, exactly as a voluntary leave does.
util.onCleanup(function(_, cid) holdem.dropped(cid) end)

---Every seated stack is written back to the chip wallet before the resource goes away. Guarded to
---this resource only, and to one statement, because a shutdown is not a good moment to be halfway
---through a loop of database round trips.
---@param resource string name of the resource that stopped
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    local ok, err = pcall(function() chips.creditMany(holdem.releaseAll()) end)
    if not ok then print(("^1[sd-phone] hold'em stacks were not returned: %s^7"):format(err)) end
end)

-- One table clock for every room: action timers and the gap between hands. Guarded because a raised
-- error here would kill the thread and leave every table frozen mid-hand with chips in the pot.
CreateThread(function()
    if not APP_ENABLED then return end
    while true do
        Wait(TICK_MS)
        local ok, err = pcall(holdem.tick)
        if not ok then print(("^1[sd-phone] hold'em tick failed: %s^7"):format(err)) end
    end
end)

return holdem
