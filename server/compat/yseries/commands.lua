---@type table Shared shim helpers (server.compat.yseries.shared): warn-once + digit sanitising.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): IMEI <-> identity resolution.
local imei = require 'server.compat.yseries.imei'
---@type table Settings persistence layer (server.settings.store): numbers + lock security.
local settings = require 'server.settings.store'
---@type table Account persistence layer (server.accounts.store): social password + verified writes.
local accounts = require 'server.accounts.store'

---@type table<string, string> YSeries social app key -> sd-phone account app key. YSeries names its
---social apps after its own products, so a server owner's muscle memory uses those names.
local APP_MAP = {
    y          = 'birdy',
    instashots = 'photogram',
    darkchat   = 'darkchat',
    lovr       = 'cherry',
    ycloud     = 'mail',
    news       = 'weazelnews',
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

---Registers an ace-gated command under YSeries' own name, so an admin's existing muscle memory and
---any server scripts that shell out to these keep working.
---@param name string command name
---@param help string help text
---@param params table[] ox_lib-style parameter descriptors
---@param handler fun(src: number, args: table)
local function admin(name, help, params, handler)
    RegisterCommand(name, function(src, rawArgs)
        if src ~= 0 and not IsPlayerAceAllowed(src, 'command.' .. name) then
            say(src, 'You do not have permission to use that command.')
            return
        end
        handler(src, rawArgs)
    end, true)
    TriggerEvent('chat:addSuggestion', '/' .. name, help, params)
end

admin('cellBroadcast', 'Send a cell broadcast alert to a player', {
    { name = 'source', help = 'target player server id' },
    { name = 'title', help = 'alert title' },
    { name = 'content', help = 'alert body' },
    { name = 'iconUrl', help = 'icon URL (optional)' },
}, function(src, args)
    local target = tonumber(args[1])
    if not target or not GetPlayerName(target) then return say(src, 'No such player.') end

    local title = args[2] or 'Alert'
    local content = args[3] or ''
    TriggerClientEvent('sd-phone:client:notify', target, {
        title = title, body = content, image = args[4],
    })
    say(src, ('Cell broadcast sent to %s.'):format(target))
end)

admin('resetPin', 'Clear a phone lock passcode by phone number', {
    { name = 'phoneId', help = 'phone number (sd-phone has no phone row id)' },
    { name = 'newPin', help = 'ignored: sd-phone clears rather than sets a passcode' },
}, function(src, args)
    local identity = imei.forNumber(args[1]) or args[1]
    if not identity or identity == '' then return say(src, 'Give a phone number.') end

    settings.setSecurity(identity, nil, false)
    say(src, ('Lock passcode cleared for %s. sd-phone clears a passcode rather than setting a new one, so the owner picks their next one on the phone.'):format(args[1]))
end)

admin('changePassword', 'Change a social account password', {
    { name = 'app', help = 'y | instashots | darkchat | lovr | ycloud | news' },
    { name = 'username', help = 'account username' },
    { name = 'password', help = 'new password, 6 characters minimum' },
}, function(src, args)
    local app = APP_MAP[tostring(args[1] or ''):lower()]
    local username, password = args[2], args[3]
    if not app then return say(src, 'Unknown app. Use one of: y, instashots, darkchat, lovr, ycloud, news.') end
    if not username or type(password) ~= 'string' or #password < 6 then
        return say(src, 'Give a username and a password of at least 6 characters.')
    end

    local account = accounts.getAccount(app, username)
    if not account then return say(src, 'No such account.') end

    accounts.setPassword(account.id, accounts.hashPassword(password))
    say(src, ('Password changed for %s on %s.'):format(username, app))
end)

admin('recoverSimCard', 'Move a phone number onto a phone by IMEI', {
    { name = 'phoneNumberToRecover', help = 'the number to move' },
    { name = 'currentPhoneImei', help = 'destination phone IMEI' },
}, function(src, args)
    local number = shim.digits(args[1])
    local identity = args[2]
    if not number or type(identity) ~= 'string' or identity == '' then
        return say(src, 'Give a phone number and a destination IMEI.')
    end

    local holder = imei.forNumber(number)
    if holder and holder ~= identity then settings.clearPhoneNumber(holder) end
    settings.setPhoneNumber(identity, number)
    say(src, ('%s recovered onto %s.'):format(number, identity))
end)

admin('changeSimCard', 'Assign a new phone number to a phone by IMEI', {
    { name = 'newPhoneNumber', help = 'the new number' },
    { name = 'currentPhoneImei', help = 'phone IMEI' },
}, function(src, args)
    local number = shim.digits(args[1])
    local identity = args[2]
    if not number or type(identity) ~= 'string' or identity == '' then
        return say(src, 'Give a phone number and an IMEI.')
    end
    if settings.numberExists(number) then return say(src, 'That number is already in use.') end

    settings.setPhoneNumber(identity, number)
    say(src, ('%s assigned to %s.'):format(number, identity))
end)

admin('createSimCard', 'Give yourself a SIM card item', {
    { name = 'simCardNumber', help = 'requested number (optional)' },
}, function(src, args)
    if src == 0 then return say(src, 'Run this in-game: a SIM card goes to a player inventory.') end

    local wanted = shim.digits(args[1])
    local issued = exports['sd-phone']:giveSimCard(src, wanted and { number = wanted } or nil)
    say(src, issued and ('SIM card %s created.'):format(issued) or 'Could not create a SIM card.')
end)

-- toggleVerified has no sd-phone equivalent: verified badges are not a concept in any of its
-- social apps, so the command registers only to report that rather than erroring as unknown.
admin('toggleVerified', 'Not supported on sd-phone', {
    { name = 'app', help = 'unused' },
    { name = 'username', help = 'unused' },
    { name = 'verified', help = 'unused' },
}, function(src)
    say(src, 'sd-phone has no verified badges on its social apps, so there is nothing to toggle.')
end)
