---@type table Shared shim helpers (server.compat.qssmartphone.shared): arg sanitising.
local shim = require 'server.compat.qssmartphone.shared'
---@type table Command-name arbitration (server.compat.commandnames): stops two shims claiming one name.
local commandNames = require 'server.compat.commandnames'
---@type table Mail delivery (server.compat.qssmartphone.mail): the system send behind /sendmail.
local mail = require 'server.compat.qssmartphone.mail'
---@type table Authoritative company handlers (server.services.actions): the job inbox.
local services = require 'server.services.actions'
---@type table Authoritative invoice handlers (server.services.invoices): /sendbill.
local invoices = require 'server.services.invoices'

---@type string Job the /sos command alerts, matching PRO's Config.SOSJob default.
local SOS_JOB <const> = 'ambulance'

---@type string Job the /911 command alerts, matching qs-smartphone's Config.PoliceJob default.
local POLICE_JOB <const> = 'police'

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

---Registers a player command under qs-smartphone's own name, so a player's muscle memory and any
---script that shells out to these keeps working.
---@param name string command name
---@param help string help text
---@param params table[] ox_lib-style parameter descriptors
---@param handler fun(src: number, args: table)
local function command(name, help, params, handler)
    if not commandNames.claim('qs-smartphone', name) then return end
    RegisterCommand(name, handler, false)
    TriggerEvent('chat:addSuggestion', '/' .. name, help, params)
end

---Registers an ace-gated admin command under qs-smartphone's own name.
---@param name string command name
---@param help string help text
---@param params table[] ox_lib-style parameter descriptors
---@param handler fun(src: number, args: table)
local function admin(name, help, params, handler)
    if not commandNames.claim('qs-smartphone', name) then return end
    RegisterCommand(name, function(src, args)
        if src ~= 0 and not IsPlayerAceAllowed(src, 'command.' .. name) then
            say(src, 'You do not have permission to use that command.')
            return
        end
        handler(src, args)
    end, true)
    TriggerEvent('chat:addSuggestion', '/' .. name, help, params)
end

---Registers a command qs-smartphone has and sd-phone cannot answer, so it reports what to do
---instead rather than reading as an unknown command.
---@param name string command name
---@param help string help text
---@param message string what to do instead
local function unsupported(name, help, message)
    command(name, help, {}, function(src)
        say(src, message)
    end)
end

---Opens or closes the caller's phone. The client half owns the toggle, the phone shell being
---client-side.
---@param src number
local function togglePhone(src)
    if src == 0 then return end
    TriggerClientEvent('sd-phone:client:compat:qs:toggle', src)
end

command('togglephone', 'Open or close your phone', {}, function(src) togglePhone(src) end)
command('TogglePhone', 'Open or close your phone', {}, function(src) togglePhone(src) end)
command('phone:toggle', 'Open or close your phone', {}, function(src) togglePhone(src) end)

---Calls the police: an emergency message into their company inbox, which is the queue their
---employees read. The trailing words are the report, so /911 alone still raises a bare alert.
command('911', 'Call the police', {
    { name = 'message', help = 'what you are reporting' },
}, function(src, args)
    if src == 0 then return say(src, 'Run this in-game: an emergency call comes from a character.') end

    local body = shim.str(table.concat(args, ' '))
    if body == '' then body = 'Emergency - I need the police.' end

    local result = services.messageCompany(src, { job = POLICE_JOB, body = body })
    say(src, result.success and 'Emergency call sent.' or (result.message or 'Could not send that call.'))
end)

---Raises a bill from the caller to a player, which sd-phone models as a personal invoice the target
---pays from their Wallet.
command('sendbill', 'Bill a player', {
    { name = 'id', help = 'target player server id' },
    { name = 'price', help = 'amount' },
    { name = 'reason', help = 'what the bill is for' },
}, function(src, args)
    if src == 0 then return say(src, 'Run this in-game: a bill is raised by a character.') end

    local target, amount = tonumber(args[1]), tonumber(args[2])
    if not target or not amount then return say(src, 'Usage: /sendbill [id] [price] [reason]') end

    local note = table.concat(args, ' ', 3)
    local result = invoices.personalCreate(src, { serverId = target, amount = amount, note = note })
    say(src, result.success and ('Bill for %d sent to %d.'):format(amount, target)
        or (result.message or 'Could not send that bill.'))
end)

---Sends an SOS to the ambulance job's company inbox, which is the queue its employees read.
command('sos', 'Send an SOS to the medics', {}, function(src)
    if src == 0 then return say(src, 'Run this in-game: an SOS comes from a character.') end
    local result = services.messageCompany(src, { job = SOS_JOB, body = 'SOS - I need medical help.' })
    say(src, result.success and 'SOS sent.' or (result.message or 'Could not send that SOS.'))
end)

---Broadcast mail to every connected player. sd-phone stores mail per mailbox rather than
---broadcasting, so this is one send per online player with an account; players who are offline are
---not reached, which is the one place it differs from qs-smartphone.
admin('sendmail', 'Send an administrative mail to every online player', {
    { name = 'title', help = 'mail subject' },
    { name = 'subject', help = 'mail body' },
}, function(src, args)
    local title = shim.str(args[1])
    local body = shim.str(args[2])
    if title == '' then return say(src, 'Usage: /sendmail "Title" "Body"') end

    local sent = 0
    for _, target in ipairs(GetPlayers()) do
        if mail.send(tonumber(target), title, body, 'Administration', nil) then sent = sent + 1 end
    end
    say(src, ('Mail delivered to %d mailbox(es). Offline players were not reached: sd-phone writes mail per mailbox and has no broadcast path.'):format(sent))
end)

-- Commands qs-smartphone ships that sd-phone has no counterpart for. Each is registered so it
-- reports what to do instead rather than reading as an unknown command.
unsupported('propfix', 'Remove a stuck phone prop',
    'sd-phone clears its own phone prop when the phone closes, so there is nothing stuck to fix. Close and reopen the phone if a prop is still in hand.')
unsupported('resetZoom', 'Reset phone zoom',
    'sd-phone keeps phone size in Settings > Display, where it can be reset directly.')
unsupported('resetPhonePos', 'Reset phone position',
    'sd-phone keeps phone size and position in Settings > Display, where they can be reset directly.')
unsupported('givecontact', 'Share your contact card',
    'sd-phone shares a contact card through AirShare in the Contacts app rather than a command.')
unsupported('deleteallapps', 'Reset the app cache on every phone',
    'sd-phone has no app download cache to reset; app visibility is decided live by configs/apps.lua and its gates.')
unsupported('deleteUsersPhone', 'Delete every phone cache on the server',
    'sd-phone wipes phone data from its own Admin app, which is auditable and scoped to one character at a time.')
unsupported('deleteUserPhone', 'Delete one player\'s phone cache',
    'sd-phone wipes phone data from its own Admin app, which is auditable and scoped to one character at a time.')
unsupported('adminbattery', 'Recharge a player\'s battery',
    'the sd-phone battery is a cosmetic status-bar drain with no stored charge, so there is nothing to recharge.')
unsupported('chargePhone', 'Recharge a player\'s battery',
    'the sd-phone battery is a cosmetic status-bar drain with no stored charge, so there is nothing to recharge.')
unsupported('giveverify', 'Verify a social account',
    'sd-phone has no verified badges on its social apps, so there is nothing to grant.')
unsupported('takeverify', 'Remove a social verification',
    'sd-phone has no verified badges on its social apps, so there is nothing to remove.')
unsupported('giveinstaverify', 'Verify a Photogram account',
    'sd-phone has no verified badges on its social apps, so there is nothing to grant.')
unsupported('givetwitterverify', 'Verify a Squawk account',
    'sd-phone has no verified badges on its social apps, so there is nothing to grant.')
unsupported('clearalarms', 'Delete your alarms',
    'sd-phone alarms are deleted from the Clock app itself.')
unsupported('recipe', 'Show your phone balance plan',
    'sd-phone has no phone balance plan; service is decided by cell tower coverage instead.')
unsupported('deletemarket', 'Reset a Market entry',
    'sd-phone Marketplace listings are managed from the app and its Admin panel, not by config id.')
unsupported('setcryptoworth', 'Set the crypto price',
    'sd-phone crypto prices come from its own market simulation and are not set by command.')
unsupported('checkcryptoworth', 'Show the crypto price',
    'sd-phone shows crypto prices in the Crypto section of the Bank app.')
unsupported('crypto', 'Show your crypto total',
    'sd-phone shows your crypto holdings in the Crypto section of the Bank app.')
