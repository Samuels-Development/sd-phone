---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---Pushes one gksphone notification payload at a player as an sd-phone banner. The icon field moved
---between gksphone versions - V2 calls it `icon`, V1 calls it `img` - so both are read and whichever
---one the caller filled wins.
---
---`buttonactive` / `button` (an event fired when the banner is tapped) is dropped: sd-phone banners
---are not tappable call-backs.
---@param src any player server id
---@param data any gksphone NotifData
---@return boolean sent
local function push(src, data)
    local source = tonumber(src)
    if not source or type(data) ~= 'table' then return false end

    if data.buttonactive or data.button then
        warnOnce('Notification.button', ('notification tap buttons are not supported (called by %s); the banner was shown without one'):format(shim.invoker()))
    end

    return sd:notify(source, {
        title    = shim.text(data.title) or 'Notification',
        body     = shim.text(data.message),
        image    = shim.text(data.icon) or shim.text(data.img),
        duration = tonumber(data.duration),
    }) == true
end

---sendNotification(src, NotifData): gksphone V2's SERVER notification. Lower-case leading 's',
---which is the spelling third-party scripts written against V2 use.
registerExport('sendNotification', function(src, NotifData)
    return push(src, NotifData)
end)

---SendNotification(src, NotifData): gksphone V1's server notification, identical apart from `img`
---in place of `icon`. Registered alongside the V2 spelling so both generations of caller resolve.
registerExport('SendNotification', function(src, NotifData)
    return push(src, NotifData)
end)

---EmergencyAlert(title, message): a server-wide alert banner, delivered one push per online player
---because sd-phone has no broadcast notification path.
registerExport('EmergencyAlert', function(title, message)
    local heading = shim.text(title) or 'Emergency Alert'
    local body = shim.text(message)

    for _, raw in ipairs(GetPlayers()) do
        local src = tonumber(raw)
        if src then sd:notify(src, { title = heading, body = body }) end
    end
end)
