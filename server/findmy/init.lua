---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot    = require 'server.boot'

---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Find My persistence layer (server.findmy.store): schema bootstrap + row CRUD.
local store   = require 'server.findmy.store'
---@type table Authoritative Find My handlers (server.findmy.actions): sightings + Lost Mode.
local actions = require 'server.findmy.actions'

---@type table Find My app config (config.FindMy): master switch + sighting cadence. Falls back to
---the group's own file, so a configs/config.lua predating this app still reads the owner's real
---settings rather than erroring on the first sighting tick.
local CFG = config.FindMy or require 'configs.findmy'

-- Boot thread: creates the device-sightings table.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('findmy', err)
        return
    end
    boot.schemaReady()
end)

---/findmyclear <citizenid> - turns Lost Mode off on every device that character owns. The
---recovery hatch for a player locked out of their own phone; admins only.
---@param source integer caller server id
---@param args table parsed command args { citizenid: string }
lib.addCommand('findmyclear', {
    help = 'Turn Lost Mode off on every device a character owns',
    params = { { name = 'citizenid', type = 'string', help = 'The owner citizenid' } },
    restricted = 'group.admin',
}, function(source, args)
    local cleared = actions.clearLostFor(tostring(args.citizenid))
    local msg = ('Lost Mode cleared on %d device(s).'):format(cleared)
    if source == 0 then
        print('[sd-phone:findmy] ' .. msg)
    else
        TriggerClientEvent('ox_lib:notify', source, { title = 'Find My', description = msg, type = 'success' })
    end
end)

---Register one Find My callback under the app's 'sd-phone:server:findmy:' prefix.
---@param action string callback name suffix
---@param fn function handler fun(src, payload?): table
local function register(action, fn)
    lib.callback.register('sd-phone:server:findmy:' .. action, fn)
end

-- App callbacks: thin delegates into server.findmy.actions.
register('list',      function(src) return actions.list(src) end)
register('playSound', function(src, payload) return actions.playSound(src, payload) end)
register('setLost',   function(src, payload) return actions.setLost(src, payload) end)
register('clearLost', function(src, payload) return actions.clearLost(src, payload) end)
register('erase',     function(src, payload) return actions.erase(src, payload) end)
register('unlock',    function(src, payload) return actions.unlock(src, payload) end)

---A device announcing that its screen went up or down. The phone fires this from its own open and
---close hooks; a companion device (sd-tablet) fires it when it takes or releases the screen.
---@param kind string 'phone' | 'tablet'
---@param on boolean whether the screen is now up
RegisterNetEvent('sd-phone:server:findmy:presence', function(kind, on)
    actions.presence(source, type(kind) == 'string' and kind or 'phone', on == true)
end)

---Drops a departing player's open screens; their last sighting is already recorded.
AddEventHandler('playerDropped', function()
    actions.dropped(source)
end)

-- Sighting tick: re-records where every OPEN device is. The walk is over open screens only, so a
-- server whose phones are all pocketed does no work here.
CreateThread(function()
    local interval = math.max(5000, tonumber(CFG.SightingInterval) or 60000)
    while true do
        Wait(interval)
        if CFG.Enabled ~= false then
            local ok, err = pcall(actions.tick)
            if not ok then print(('^1[sd-phone:findmy]^0 sighting tick failed: %s'):format(err)) end
        end
    end
end)
