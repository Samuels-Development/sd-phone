---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): recipient resolution.
local imei = require 'server.compat.yseries.imei'
---@type table State bag publisher (server.statebags): server-authoritative phone lockout.
local statebags = require 'server.statebags'
---@type table Player bridge (bridge.server.player): identity -> source resolution.
local player = require 'bridge.server.player'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table<string, string> YSeries app key -> sd-phone app id, for the names that differ. YSeries
---names its social apps after its own products, none of which match ours.
local APP_MAP = {
    email      = 'mail',
    ypay       = 'bank',
    bank       = 'bank',
    y          = 'birdy',
    instashots = 'photogram',
    ybuy       = 'marketplace',
    promohub   = 'pages',
    news       = 'weazelnews',
    darkchat   = 'darkchat',
    gallery    = 'photos',
    phone      = 'phone',
    messages   = 'messages',
    settings   = 'settings',
    weather    = 'weather',
    maps       = 'maps',
    music      = 'music',
}

---Maps a YSeries app key onto an sd-phone app id; nil when nothing matches, which the banner
---funnel renders as a generic notification rather than refusing it.
---@param app any
---@return string|nil
local function mapApp(app)
    if type(app) ~= 'string' or app == '' then return nil end
    return APP_MAP[app:lower():gsub('%s+', '')]
end

---SendNotification(notification, toType, to): pushes an iOS-style banner. Returns YSeries'
---documented boolean, which reports whether the target's phone is DISABLED rather than whether the
---notification was shown.
---
---`data.serverEvent` / `data.clientEvent` (fired when the banner is tapped) are not supported and
---warn once: sd-phone banners are not tappable call-backs.
registerExport('SendNotification', function(notification, toType, to)
    if type(notification) ~= 'table' then return false end
    if type(notification.data) == 'table'
        and (notification.data.serverEvent or notification.data.clientEvent) then
        warnOnce('SendNotification.data', ('SendNotification data.serverEvent/clientEvent are not supported (called by %s); the banner was shown without a tap action'):format(GetInvokingResource() or 'unknown'))
    end

    local identity = imei.resolveRecipient(toType, to)
    local src = identity and player.getSourceByIdentifier(identity) or nil
    if not src then return false end

    local app = mapApp(notification.app)
    TriggerClientEvent('sd-phone:client:notify', src, {
        app      = app,
        appId    = app,
        title    = notification.title,
        body     = notification.text,
        image    = type(notification.icon) == 'string' and notification.icon or nil,
        duration = tonumber(notification.timeout),
    })

    return statebags.isDisabled(src)
end)

---CellBroadcast(to, title, content, iconUrl): a public-alert banner at one player, addressed by
---server id per the YSeries signature.
registerExport('CellBroadcast', function(to, title, content, iconUrl)
    local src = tonumber(to)
    if not src or not GetPlayerName(src) then return end

    TriggerClientEvent('sd-phone:client:notify', src, {
        title = title,
        body  = content,
        image = type(iconUrl) == 'string' and iconUrl or nil,
    })
end)
