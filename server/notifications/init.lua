---@type table Player bridge (bridge.server.player): connected-source lookup from a citizenid.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone-number -> citizenid lookups.
local settingsStore = require 'server.settings.store'

---@type table Notifications module; returned so sibling modules can route identity-addressed banners.
local notifications = {}

---Shared relay behind both notification exports: shape-checks the payload, then pushes the
---banner. Returns false on a non-number source, non-table data, or missing title.
---@param source number player server id
---@param data table notification payload
---@return boolean sent
local function relay(source, data)
    if type(source) ~= 'number' then return false end
    if type(data) ~= 'table' or type(data.title) ~= 'string' then return false end
    TriggerClientEvent('sd-phone:client:notify', source, data)
    return true
end

---Sends an iOS-style phone notification to a player from any resource. `data.title` is
---required; optional fields are `app`, `image`, `body`, `time`, and `appId`.
---@param source number player server id
---@param data table notification payload
---@return boolean sent
exports('notify', function(source, data)
    return relay(source, data)
end)

---Delivers a notification to the player acting as `cid`. When the identity instead sits on a
---phone in their POCKET (carried, not active - unique phones), a transient "pocket buzz"
---banner tagged with that phone's colour goes out instead, flagged `otherPhone` so the NUI
---keeps it off the active phone's lockscreen stack and badges.
---@param cid string data identity the notification belongs to
---@param data table notification payload (title required)
---@return boolean sent
function notifications.notifyCid(cid, data)
    if type(cid) ~= 'string' or cid == '' then return false end
    local src = player.getSourceByIdentifier(cid)
    if src then return relay(src, data) end
    if type(data) ~= 'table' or type(data.title) ~= 'string' then return false end

    local anySrc = player.getAnySourceByIdentifier(cid)
    if not anySrc then return false end
    local entry
    local s = require('server.sim.session').resolve(anySrc)
    if s then
        for _, e in ipairs(s.sims) do
            if e.identity == cid then entry = e break end
        end
    end
    local color = entry and entry.color or nil
    return relay(anySrc, {
        app        = color and (color:gsub('^%l', string.upper) .. ' Phone') or 'Other Phone',
        appId      = data.appId,
        image      = data.image,
        title      = data.title,
        body       = data.body,
        time       = data.time,
        otherPhone = true,
        -- The buzzing phone's frame colour (peek shell tint) and its NUI profile key (device
        -- identity, or the number in legacy mode) so the banner can be parked on THAT phone's
        -- banked lockscreen stack for its next open.
        phoneColor = color,
        profileKey = require('server.sim.state').device and cid or (entry and entry.number) or nil,
    })
end

---Sends the same notification addressed by phone number instead of server id. The number is
---digit-normalised before lookup; an unassigned number or offline owner returns false. A
---number on a pocketed (non-active) phone arrives as a colour-tagged transient buzz.
---@param number string phone number in any formatting
---@param data table notification payload
---@return boolean sent
exports('notifyNumber', function(number, data)
    local digits = (tostring(number or ''):gsub('%D', ''))
    if digits == '' then return false end
    local cid = settingsStore.getCitizenByNumber(digits)
    if not cid then return false end
    return notifications.notifyCid(cid, data)
end)

---/phonenotif-to <playerId> pushes a canned test notification at one player. Ace-restricted;
---the console gets a usage hint when the target argument is missing.
---@param src number caller server id (0 = console)
---@param args string[] raw command args
RegisterCommand('phonenotif-to', function(src, args)
    local target = tonumber(args[1])
    if not target then
        if src ~= 0 then return end
        print('^3usage:^0 phonenotif-to <playerId>')
        return
    end
    TriggerClientEvent('sd-phone:client:notify', target, {
        app   = 'messages',
        title = 'Notification',
        body  = 'Test notification from the server.',
        time  = 'now',
        appId = 'messages',
    })
end, true)

return notifications
