---@type table Framework detection (bridge.shared.framework): name for the self-test line.
local framework = require 'bridge.shared.framework'
---@type table Command-name arbitration (server.compat.commandnames): stops two shims claiming one name.
local commandNames = require 'server.compat.commandnames'
---@type table Player bridge (bridge.server.player): identity + display name.
local player = require 'bridge.server.player'
---@type table Authoritative admin handlers (server.admin.actions): the Birdy verification write.
local admin = require 'server.admin.actions'
---@type table SIM mode state (server.sim.state): what the self-test reports about unique phones.
local simState = require 'server.sim.state'
---@type table Shared server helpers (server.util): number formatting for the self-test.
local util = require 'server.util'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

-- /givesim and /phoneadmin are deliberately NOT registered here: sd-phone already owns both names
-- with the same meaning (server/sim/init.lua and server/admin/init.lua), and re-registering either
-- would replace the real command with this shim's copy.

---Prints a line back to the invoking console or player.
---@param src number 0 for console
---@param message string
local function say(src, message)
    if src == 0 then
        print(('^3[sd-phone]^0 %s'):format(message))
    else
        TriggerClientEvent('chat:addMessage', src, { args = { 'sd-phone', message } })
    end
end

---Registers a command under RoadPhone's own name, so an admin's muscle memory and any server
---scripts that shell out to these keep working. `gate` true requires the matching command ace.
---@param name string command name
---@param help string help text
---@param params table[] ox_lib-style parameter descriptors
---@param gate boolean whether the command is ace-restricted
---@param handler fun(src: number, args: table)
local function command(name, help, params, gate, handler)
    if not commandNames.claim('roadphone', name) then return end
    RegisterCommand(name, function(src, rawArgs)
        if gate and src ~= 0 and not IsPlayerAceAllowed(src, 'command.' .. name) then
            say(src, 'You do not have permission to use that command.')
            return
        end
        handler(src, rawArgs)
    end, gate)
    TriggerEvent('chat:addSuggestion', '/' .. name, help, params)
end

command('waveverify', 'Grant or revoke a TweetWave verification badge', {
    { name = 'value', help = 'true or false' },
    { name = 'username', help = 'account handle' },
}, true, function(src, args)
    local grant = tostring(args[1] or ''):lower() == 'true'
    local handle = tostring(args[2] or ''):gsub('^@', '')
    if handle == '' then return say(src, 'Give a handle.') end

    local result = admin.birdySetVerified(src, { handle = handle, type = grant and 'blue' or 'none' })
    say(src, result.success
        and ('@%s %s on Birdy, which is sd-phone\'s TweetWave.'):format(handle, grant and 'verified' or 'unverified')
        or (result.message or 'Could not change that badge.'))
end)

-- Connect (Photogram on sd-phone) has no verification badge; only Birdy does. The command registers
-- so an admin's muscle memory reports that rather than landing on "unknown command".
command('connectverify', 'Not supported on sd-phone', {
    { name = 'value', help = 'unused' },
    { name = 'username', help = 'unused' },
}, true, function(src)
    say(src, 'Photogram (sd-phone\'s Connect) has no verification badge. Birdy does: use /birdyverify or /waveverify.')
end)

-- Music approval is not a permission in sd-phone: the Music app plays each player's own library
-- rather than a moderated server catalogue, so there is nobody to grant approval rights to.
command('music-verify', 'Not supported on sd-phone', {
    { name = 'playerId', help = 'unused' },
}, true, function(src)
    say(src, 'sd-phone has no music approval queue: the Music app plays each player\'s own library, so there is no permission to toggle.')
end)

command('TogglePhone', 'Open or close the phone', {}, false, function(src)
    if src == 0 then return say(src, 'Run this in-game: the console holds no phone.') end
    TriggerClientEvent('sd-phone:client:compat:roadphone:toggle', src)
end)

command('stopphone', 'Force-close the phone UI', {}, false, function(src)
    if src == 0 then return say(src, 'Run this in-game: the console holds no phone.') end
    TriggerClientEvent('sd-phone:client:compat:roadphone:stop', src)
end)

command('fixphoneprop', 'Delete every object attached to your ped', {}, false, function(src)
    if src == 0 then return say(src, 'Run this in-game: the console has no ped.') end
    TriggerClientEvent('sd-phone:client:compat:roadphone:fixprop', src)
end)

command('fixphone', 'Reload your phone data', {}, false, function(src)
    if src == 0 then return say(src, 'Run this in-game: the console holds no phone.') end

    sd:pushBadges(src)
    TriggerClientEvent('sd-phone:client:profileReset', src)
    say(src, 'Phone data reloaded.')
end)

command('rpselftest', 'Print a phone diagnosis to the server console', {}, false, function(src)
    if src == 0 then return say(src, 'Run this in-game: the self-test reports on the caller\'s own phone.') end

    local cid = player.getIdentifier(src)
    local number = sd:getPhoneNumber(src)
    print(('^3[sd-phone]^0 roadphone selftest for %s (%d)'):format(player.getName(src), src))
    print(('  framework     : %s'):format(framework.name or 'standalone'))
    print(('  unique phones : %s'):format(simState.active and (simState.device and 'on, device identity' or 'on, SIM identity') or 'off'))
    print(('  identity      : %s'):format(cid or 'unresolved'))
    print(('  phone item    : %s'):format(sd:hasPhone(src) or 'none owned'))
    print(('  phone number  : %s'):format(number and util.formatNumber(number) or 'none'))
    print(('  mail accounts : %d'):format(#(sd:getMailAccounts(src) or {})))
    say(src, 'Phone diagnosis printed to the server console.')
end)

-- The remaining RoadPhone commands answer for features sd-phone does not have. Each registers so it
-- reports what to use instead rather than reading as an unknown command.
command('ringtest', 'Not supported on sd-phone', {
    { name = 'seconds', help = 'unused' },
}, true, function(src)
    say(src, 'sd-phone has no shared 3D ringtone to range-test: a ringtone plays on the owner\'s phone only.')
end)

command('loopselftest', 'Not supported on sd-phone', {}, true, function(src)
    say(src, 'sd-phone ships no Loop app. Its short-video app is Vibez, which has no self-test.')
end)

command('phonemigrate', 'Not supported on sd-phone', {}, true, function(src)
    say(src, 'sd-phone stores phone data in its own tables rather than in inventory metadata, so there is nothing to migrate. To import from another phone, use /sdphone:migrate.')
end)
