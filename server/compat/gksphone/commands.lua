---@type table Shared shim helpers (server.compat.gksphone.shared): digit sanitising + text checks.
local shim = require 'server.compat.gksphone.shared'
---@type table Command-name arbitration (server.compat.commandnames): stops two shims claiming one name.
local commandNames = require 'server.compat.commandnames'
---@type table Phone-id translation (server.compat.gksphone.phones): source -> handset identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Settings persistence layer (server.settings.store): number availability checks.
local settings = require 'server.settings.store'
---@type table Birdy persistence layer (server.birdy.store): the verified badge column.
local birdy = require 'server.birdy.store'
---@type table Account persistence layer (server.accounts.store): social sign-out.
local accounts = require 'server.accounts.store'
---@type table Number-assignment half of the shim (server.compat.gksphone.sim): the SIM-aware
---renumber, so a command writes the SIM rather than the mirror unique phones rebuilds.
local sim = require 'server.compat.gksphone.sim'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---@type table<string, string> gksphone social app name -> sd-phone account app key, for the logout
---commands. gksphone names its apps after its own products, none of which match ours.
local APP_MAP = { squawk = 'birdy', snapgram = 'photogram', matchme = 'cherry' }

---@type table<string, string> sim.assign() failure reason -> the line the renumber commands print.
local ASSIGN_ERROR = {
    not_active = "That handset is not the active phone of a connected player, so its SIM cannot be renumbered.",
    no_sim     = 'That player has no SIM in their phone.',
    taken      = 'That number is already in use.',
    invalid    = 'That number was refused.',
}

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

---Registers an ace-gated command under gksphone's own name, so an admin's existing muscle memory
---and any server scripts that shell out to these keep working.
---@param name string command name
---@param help string help text
---@param params table[] chat-suggestion parameter descriptors
---@param handler fun(src: number, args: table)
local function admin(name, help, params, handler)
    if not commandNames.claim('gksphone', name) then return end
    RegisterCommand(name, function(src, rawArgs)
        if src ~= 0 and not IsPlayerAceAllowed(src, 'command.' .. name) then
            say(src, 'You do not have permission to use that command.')
            return
        end
        handler(src, rawArgs)
    end, true)
    TriggerEvent('chat:addSuggestion', '/' .. name, help, params)
end

---Registers a command every player may run, which is what gksphone's own self-service commands are.
---@param name string command name
---@param help string help text
---@param params table[] chat-suggestion parameter descriptors
---@param handler fun(src: number, args: table)
local function open(name, help, params, handler)
    RegisterCommand(name, handler, false)
    TriggerEvent('chat:addSuggestion', '/' .. name, help, params)
end

---Registers a command that only reports why sd-phone cannot answer it. Registered rather than left
---out so an admin typing a gksphone command they know gets told what happened, instead of an
---"unknown command" line that reads as the phone being broken.
---@param name string command name
---@param why string what is unsupported and what to reach for instead
local function unsupported(name, why)
    RegisterCommand(name, function(src) say(src, why) end, false)
    TriggerEvent('chat:addSuggestion', '/' .. name, 'Not supported on sd-phone', {})
end

admin('twitterverify', 'Set a Birdy verified badge', {
    { name = 'type', help = 'none | blue | yellow' },
    { name = 'username', help = 'account handle' },
}, function(src, args)
    local asked = tostring(args[1] or ''):lower()
    local handle = args[2]
    if not handle then return say(src, 'Give a badge type and a username.') end

    local vtype
    if asked == 'blue' then
        vtype = 'blue'
    elseif asked == 'yellow' or asked == 'gold' then
        vtype = 'gold'
    elseif asked ~= 'none' and asked ~= '' then
        return say(src, 'Badge type must be none, blue or yellow.')
    end

    if birdy.setVerified(handle, vtype) > 0 then
        say(src, ('@%s verified: %s'):format(handle, vtype or 'none'))
    else
        say(src, 'No such account.')
    end
end)

admin('phonenewnumber', 'Assign a phone number to a player', {
    { name = 'id', help = 'player server id' },
    { name = 'newphonenumber', help = 'the number to assign' },
}, function(src, args)
    local target = tonumber(args[1])
    local number = shim.digits(args[2])
    if not target or not number then return say(src, 'Give a player id and a number.') end
    if settings.numberExists(number) then return say(src, 'That number is already in use.') end

    local identity = phones.forSource(target)
    if not identity then return say(src, 'That player has no phone identity.') end

    local ok, reason = sim.assign(identity, number)
    if not ok then return say(src, ASSIGN_ERROR[reason] or ASSIGN_ERROR.invalid) end
    say(src, ('%s assigned to %s. sd-phone carries one number per handset, so it replaced the old one rather than joining a pick-list.'):format(number, target))
end)

admin('phonechangenumber', 'Renumber a handset by its phone id', {
    { name = 'phoneID', help = 'handset id' },
    { name = 'oldNumber', help = 'the number being replaced' },
    { name = 'newNumber', help = 'the new number' },
}, function(src, args)
    local identity = shim.text(args[1]) or settings.getCitizenByNumber(args[2] or '')
    local number = shim.digits(args[3])
    if not identity or not number then return say(src, 'Give a phone id (or the old number) and a new number.') end
    if settings.numberExists(number) then return say(src, 'That number is already in use.') end

    local ok, reason = sim.assign(identity, number)
    if not ok then return say(src, ASSIGN_ERROR[reason] or ASSIGN_ERROR.invalid) end
    say(src, ('%s renumbered to %s.'):format(identity, number))
end)

admin('phonenumberchange', 'gksphone V1 renumber: assign a number to a player', {
    { name = 'id', help = 'player server id' },
    { name = 'newnumber', help = 'the number to assign' },
}, function(src, args)
    local target = tonumber(args[1])
    local number = shim.digits(args[2])
    if not target or not number then return say(src, 'Give a player id and a number.') end
    if settings.numberExists(number) then return say(src, 'That number is already in use.') end

    local identity = phones.forSource(target)
    if not identity then return say(src, 'That player has no phone identity.') end

    local ok, reason = sim.assign(identity, number)
    if not ok then return say(src, ASSIGN_ERROR[reason] or ASSIGN_ERROR.invalid) end
    say(src, ('%s assigned to %s.'):format(number, target))
end)

---Files a dispatch message into one company inbox on the caller's behalf, which is what gksphone's
---V1 /911p and /911e do.
---@param src number caller server id
---@param job string company job name
---@param args table raw command args, joined into the report body
local function dispatchTo(src, job, args)
    if src == 0 then return say(src, 'Run this in-game: a dispatch is sent from a player.') end

    local body = table.concat(args, ' ')
    if body == '' then return say(src, 'Give a dispatch message.') end

    local result = sd:messageCompany(src, { job = job, body = body })
    if result and result.success then return say(src, 'Dispatch sent.') end
    say(src, (result and result.message) or 'Could not send that dispatch.')
end

open('911p', 'Send a dispatch message to the police', {
    { name = 'dispatchmessage', help = 'what to report' },
}, function(src, args) dispatchTo(src, 'police', args) end)

open('911e', 'Send a dispatch message to EMS', {
    { name = 'dispatchmessage', help = 'what to report' },
}, function(src, args) dispatchTo(src, 'ambulance', args) end)

---Signs the caller out of one social app, which is what gksphone's V1 /logt, /logi and /logti do.
---@param src number caller server id
---@param app string sd-phone account app key
---@param label string app name for the confirmation line
local function signOut(src, app, label)
    if src == 0 then return say(src, 'Run this in-game: a sign-out belongs to a character.') end

    local identity = phones.forSource(src)
    if not identity then return say(src, 'You have no phone identity.') end

    accounts.clearSession(app, identity)
    say(src, ('Signed out of %s.'):format(label))
end

open('logt', 'Sign out of Birdy (gksphone Squawk)', {}, function(src) signOut(src, APP_MAP.squawk, 'Birdy') end)
open('logi', 'Sign out of Photogram (gksphone SnapGram)', {}, function(src) signOut(src, APP_MAP.snapgram, 'Photogram') end)
open('logti', 'Sign out of Cherry (gksphone Match Me)', {}, function(src) signOut(src, APP_MAP.matchme, 'Cherry') end)

-- Everything below names a gksphone surface sd-phone does not carry, registered so the command
-- answers with the reason and the thing to reach for instead.
unsupported('snapgramverify', 'sd-phone puts a verified badge on Birdy only. Use /twitterverify or /birdyverify.')
unsupported('instagramverify', 'sd-phone puts a verified badge on Birdy only. Use /twitterverify or /birdyverify.')
unsupported('trendlyverify', 'sd-phone has no Trendly app, so there is no badge to set on it.')
unsupported('blocktwitter', 'sd-phone moderates posting from the admin panel: open /phoneadmin and mute the account.')
unsupported('bantwitter', 'sd-phone moderates accounts from the admin panel: open /phoneadmin and mute or delete the account.')
unsupported('blockSquawk', 'sd-phone moderates posting from the admin panel: open /phoneadmin and mute the account.')
unsupported('blockSnapgram', 'sd-phone moderates posting from the admin panel: open /phoneadmin and mute the account.')
unsupported('blockAdd', 'sd-phone moderates posting from the admin panel: open /phoneadmin and mute the account.')
unsupported('adminauth', 'sd-phone gates its admin panel on an ace rather than an in-game toggle. Grant the ace and open /phoneadmin.')
unsupported('chargephone', 'sd-phone battery is a cosmetic status-bar counter with no stored charge, so there is nothing to set.')
unsupported('charge', 'sd-phone battery is a cosmetic status-bar counter with no stored charge, so there is nothing to set.')
unsupported('endcharge', 'sd-phone models no charging, so there is no charging process to stop.')
unsupported('deletecharge', 'sd-phone models no charging stations, so there is nothing to clear before a restart.')
unsupported('streamermode', 'sd-phone keeps streamer mode in Settings on the phone itself rather than behind a command.')
unsupported('musicvolume', 'sd-phone keeps volume in Settings on the phone itself rather than behind a command.')
unsupported('raceauth', 'sd-phone lets any player build a track in Racing, so there is no authorisation to grant.')
unsupported('telfix', 'sd-phone rebuilds phone info on every open. If a handset really is stuck, use /phoneadmin.')
