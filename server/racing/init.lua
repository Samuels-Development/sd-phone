---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot    = require 'server.boot'
---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Shared server helpers (server.util): the refusal envelope.
local util    = require 'server.util'
---@type table Player bridge (bridge.server.player): citizenid lookups for the lobby calls.
local player  = require 'bridge.server.player'
---@type table Racing persistence (server.racing.store): schema, tracks, profiles, results.
local store   = require 'server.racing.store'
---@type table Racing handlers (server.racing.actions): browse, profile, admin, validation.
local actions = require 'server.racing.actions'
---@type table Live race state machine (server.racing.races).
local races   = require 'server.racing.races'
---@type table Race lobbies and the generator (server.racing.racegen).
local racegen = require 'server.racing.racegen'

---@type table Racing config (configs/racing.lua): the enable switch, the creator command and its ace.
local RACING = type(config.Racing) == 'table' and config.Racing or {}

---@type table Track creator settings (Config.Creator): the command that toggles it.
local CREATOR = type(RACING.Creator) == 'table' and RACING.Creator or {}

---@type boolean Whether Racing runs at all. Read from configs/racing.lua alone rather than through
---util.appEnabled('racing'): Racing is laid out for a tablet, so configs/apps.lua ships it with
---enabled = false and a companion device switches it on in its own catalog. Reading sd-phone's
---catalog here would turn the whole feature off on every server, exactly as it would for the MDT.
local ENABLED = RACING.Enabled == true

---@type string Refusal every callback answers with while Racing is switched off. Registering a
---refusal rather than nothing is the point: an unregistered callback never answers, so the tablet
---would sit on its loading screen instead of reaching a readable error.
local DISABLED = 'Racing is not available on this server'

---@type string Refusal for a caller whose character has not finished loading.
local LOADING = 'Your character is still loading'

---Registers one Racing callback under the app's prefix, normalising a non-table payload at the
---boundary and refusing outright while the app is off.
---@param action string callback name suffix
---@param fn fun(src: integer, payload: table): table
local function register(action, fn)
    lib.callback.register('sd-phone:server:racing:' .. action, function(src, payload)
        if not ENABLED then return util.fail(DISABLED) end
        if type(payload) ~= 'table' then payload = {} end
        return fn(src, payload)
    end)
end

register('bootstrap',    function(src)          return actions.bootstrap(src) end)
register('races',        function(src)          return actions.races(src) end)
register('tracks',       function(src, payload) return actions.tracks(src, payload) end)
register('track',        function(src, payload) return actions.track(src, payload) end)
register('trackRoute',   function(src, payload) return actions.trackRoute(src, payload) end)
register('spectate',     function(src, payload) return actions.spectate(src, payload) end)
register('rankings',     function(src, payload) return actions.rankings(src, payload) end)
register('racer',        function(src, payload) return actions.racer(src, payload) end)
register('setAlias',     function(src, payload) return actions.setAlias(src, payload) end)
register('setAvatar',    function(src, payload) return actions.setAvatar(src, payload) end)
register('setHud',       function(src, payload) return actions.setHud(src, payload) end)
register('createTrack',  function(src, payload) return actions.createTrack(src, payload) end)
register('adminTracks',  function(src, payload) return actions.adminTracks(src, payload) end)
register('adminSetFlag', function(src, payload) return actions.adminSetFlag(src, payload) end)
register('adminDelete',  function(src, payload) return actions.adminDelete(src, payload) end)

register('boards', function(src)
    local cid = player.getIdentifier(src)
    if not cid then return util.fail(LOADING) end
    return util.ok({ boards = racegen.boards(cid) })
end)

register('join', function(src, payload)
    local cid = player.getIdentifier(src)
    if not cid then return util.fail(LOADING) end
    return racegen.join(src, cid, payload.raceId, payload.modelHash)
end)

register('leave', function(src, payload)
    local cid = player.getIdentifier(src)
    if not cid then return util.fail(LOADING) end
    return racegen.leave(src, cid, payload.raceId)
end)

register('host', function(src, payload)
    local cid = player.getIdentifier(src)
    if not cid then return util.fail(LOADING) end
    return racegen.host(src, cid, payload)
end)

---A racer reached a gate. The index is advisory until races.checkpoint has vetted it.
RegisterNetEvent('sd-phone:server:racing:checkpoint', function(raceId, index, clientMs)
    if not ENABLED then return end
    races.checkpoint(source, raceId, index, clientMs)
end)

---A racer crossed the line. The model hash is what decides their class; the elapsed time is
---recomputed server-side, so clientMs only ever reaches the display deltas.
RegisterNetEvent('sd-phone:server:racing:finish', function(raceId, modelHash, clientMs)
    if not ENABLED then return end
    races.finish(source, raceId, modelHash, clientMs)
end)

---A joined racer's client reporting whether they are lined up at the start.
RegisterNetEvent('sd-phone:server:racing:ready', function(raceId, ready)
    if not ENABLED then return end
    local cid = player.getIdentifier(source)
    if cid then racegen.setReady(cid, raceId, ready == true) end
end)

if ENABLED then
    -- Schema bootstrap. The dispatcher and the generator both read tracks, so they only come up
    -- once the tables they read from exist.
    CreateThread(function()
        local success, err = pcall(store.ensureSchema)
        if not success then
            boot.schemaFailed('racing', err)
            return
        end
        boot.schemaReady()
        races.start()
        racegen.start()
    end)

    if CREATOR.Enabled ~= false and type(CREATOR.Command) == 'string' then
        ---Toggles the in-game gate creator. Registered restricted, which is what makes ox_lib gate
        ---it on the `command.<name>` ace that Config.Creator.Ace names.
        ---@param source integer player server id
        lib.addCommand(CREATOR.Command, {
            help = 'Toggle the in-game track creator',
            restricted = true,
        }, function(source)
            TriggerClientEvent('sd-phone:client:racing:creator', source)
        end)
    end

    ---Frees a leaving player's seats and takes the loss on any run they were mid-way through.
    AddEventHandler('playerDropped', function()
        local src = source
        local cid = player.getIdentifier(src)
        races.dropPlayer(src, cid)
        if cid then racegen.dropPlayer(cid) end
    end)

    ---Pays back every buy-in sitting in a lobby that will not survive the restart. Lobbies live
    ---only in memory, so a stop destroys them; an offline member's seat money is the one loss that
    ---cannot be repaid here.
    ---@param resource string name of the resource that stopped
    AddEventHandler('onResourceStop', function(resource)
        if resource ~= GetCurrentResourceName() then return end

        local refunds = racegen.collectPendingRefunds()
        for i = 1, #refunds do
            local refund = refunds[i]
            local src    = player.getSourceByIdentifier(refund.citizenid)
            if src then races.refundBuyIn(src, refund.account, refund.amount) end
        end
    end)
end
