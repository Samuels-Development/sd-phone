---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'
---@type table Identity translation (server.compat.qssmartphone.identify): scope/number -> source.
local identify = require 'server.compat.qssmartphone.identify'

---@type table Notification module; the table returned at end of file. Every qs-smartphone banner
---shape funnels through one delivery so the three generations behave identically.
local notifications = {}

local registerExport, registerPro, warnOnce = shim.registerExport, shim.registerPro, shim.warnOnce

---@type table<string, string> qs-smartphone app name -> sd-phone app id, spanning all three
---generations: V3's renamed apps, the legacy Config.Battery ids and the PRO spellings. Names with
---no sd-phone counterpart are deliberately absent, which renders as a generic banner rather than a
---refusal.
local APP_MAP = {
    tweedle         = 'birdy',
    twitter         = 'birdy',
    pictagram       = 'photogram',
    instagram       = 'photogram',
    beatzy          = 'music',
    spotify         = 'music',
    music           = 'music',
    chitchat        = 'messages',
    whatsapp        = 'messages',
    messages        = 'messages',
    finder          = 'marketplace',
    advert          = 'pages',
    yellowpages     = 'pages',
    zapp            = 'ryde',
    uber            = 'ryde',
    uberdriver      = 'ryde',
    qchat           = 'groups',
    ['group-chats'] = 'groups',
    darkchat        = 'darkchat',
    darkweb         = 'darkchat',
    weazel          = 'weazelnews',
    tiktok          = 'vibez',
    tinder          = 'cherry',
    business        = 'services',
    society         = 'services',
    state           = 'documents',
    meos            = 'emsmdt',
    garage          = 'garages',
    rentel          = 'garages',
    store           = 'appstore',
    ping            = 'maps',
    phone           = 'phone',
    mail            = 'mail',
    bank            = 'bank',
    photos          = 'photos',
    camera          = 'camera',
    clock           = 'clock',
    calendar        = 'calendar',
    notes           = 'notes',
    calculator      = 'calculator',
    settings        = 'settings',
    racing          = 'racing',
    flappy          = 'flappy',
}

---Maps a qs-smartphone app reference onto an sd-phone app id. The same field carries a bare app
---name, a './img/apps/whatsapp.png' path inside the phone's own NUI, or an absolute URL, so a path
---is reduced to its file stem before the lookup.
---@param app any
---@return string|nil
function notifications.appId(app)
    if type(app) ~= 'string' or app == '' then return nil end
    local key = app:match('([^/\\]+)%.%w+$') or app
    key = key:lower():gsub('[%s_]+', '')
    return APP_MAP[key]
end

---Whether a value looks like an image to show on the banner rather than an app name: any path or
---URL, which is how the legacy notification docs spell the icon field.
---@param v any
---@return string|nil
local function imageOf(v)
    if type(v) ~= 'string' or v == '' then return nil end
    if v:find('/', 1, true) or v:find('\\', 1, true) then return v end
    return nil
end

---Pushes one banner at a connected player. Accepts every qs-smartphone payload spelling at once:
---title/head, text/msg/description, appId/app/icon.
---@param src number|nil player server id
---@param data table|nil qs-smartphone notification payload
---@return boolean sent
function notifications.deliver(src, data)
    if type(src) ~= 'number' or type(data) ~= 'table' then return false end

    local app   = notifications.appId(data.appId or data.app or data.icon)
    local title = shim.str(data.title or data.head or data.sender or '')
    local body  = shim.str(data.text or data.msg or data.message or data.description or '')
    if title == '' and body == '' then return false end
    if title == '' then title, body = body, '' end

    TriggerClientEvent('sd-phone:client:notify', src, {
        app   = app,
        appId = app,
        title = title,
        body  = body ~= '' and body or nil,
        image = imageOf(data.icon or data.image or data.app),
    })
    return true
end

---Reads the (target, payload) pair out of an undocumented legacy call. Those exports are known only
---from public call sites, which pass either (source, table) or a lone table addressed by a source /
---number field, so both are accepted.
---@param a any
---@param b any
---@return number|nil src, table|nil data
function notifications.looseArgs(a, b)
    if type(a) == 'table' then
        local src = tonumber(a.source or a.src or a.player)
            or identify.sourceOfNumber(a.number or a.phoneNumber)
        return src, a
    end
    local src = tonumber(a) or identify.sourceOfNumber(a)
    return src, type(b) == 'table' and b or nil
end

---sendPhoneNotification(source, { appId, title, text }): the V3 native push, addressed by server id.
registerExport('sendPhoneNotification', function(source, notification)
    return notifications.deliver(tonumber(source), notification)
end)

---sendPhoneNotificationToScope(scopeId, { appId, title, text }): the same push addressed by the
---phone scope identifier getPhoneScopeIdentifier hands out.
registerExport('sendPhoneNotificationToScope', function(scopeId, notification)
    return notifications.deliver(identify.sourceOfScope(scopeId), notification)
end)

---SendNotification(...): legacy, never documented. Only the call sites are known, so the arguments
---are read loosely and both shapes the era used are accepted.
registerExport('SendNotification', function(a, b)
    warnOnce('SendNotification', ('SendNotification is an undocumented legacy export (called by %s); its arguments were read loosely as a target plus a { title/head, text/msg, app } payload'):format(GetInvokingResource() or 'unknown'))
    return notifications.deliver(notifications.looseArgs(a, b))
end)

---PhoneNotification(...): legacy, never documented; the { head, msg, app } spelling of the same push.
registerExport('PhoneNotification', function(a, b)
    warnOnce('PhoneNotification', ('PhoneNotification is an undocumented legacy export (called by %s); its arguments were read loosely as a target plus a { head, msg, app } payload'):format(GetInvokingResource() or 'unknown'))
    return notifications.deliver(notifications.looseArgs(a, b))
end)

---sendNotification(phoneNumber, { app, msg, head }, disableTempNotification): the PRO Dynamic Island
---push, addressed by phone number.
---
---sd-phone has no Dynamic Island, so the banner is the only presentation there is and the third
---argument, which suppresses the island's pop-up half, has nothing to suppress.
---@param phoneNumber any
---@param notification table
---@param disableTempNotification any
---@return boolean sent
local function proNotify(phoneNumber, notification, disableTempNotification)
    if disableTempNotification ~= nil then
        warnOnce('sendNotification.disableTemp', ('sendNotification disableTempNotification is ignored (called by %s); sd-phone has no Dynamic Island pop-up to suppress, so the banner was shown'):format(GetInvokingResource() or 'unknown'))
    end
    return notifications.deliver(identify.sourceOfNumber(phoneNumber), notification)
end

registerPro('sendNotification', proNotify)
registerPro('sendNotificationOld', proNotify)

---sendPhoneNotification(source, notification) again on the PRO name: the V3 spelling reaches PRO
---installs through community bridges, which pick the resource name from their own config.
registerPro('sendPhoneNotification', function(source, notification)
    return notifications.deliver(tonumber(source), notification)
end)

return notifications
