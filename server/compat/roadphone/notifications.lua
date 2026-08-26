---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table<string, string> RoadPhone router name -> sd-phone app id, for the names that differ.
---RoadPhone names its apps after its own products, so almost none of them match ours.
local APP_MAP = {
    connect     = 'photogram',
    instagram   = 'photogram',
    tweetwave   = 'birdy',
    twitter     = 'birdy',
    loop        = 'vibez',
    dateme      = 'cherry',
    dating      = 'cherry',
    tinder      = 'cherry',
    gallery     = 'photos',
    news        = 'weazelnews',
    yellowpages = 'pages',
    taxi        = 'ryde',
    crypto      = 'stocks',
    valet       = 'garages',
    garage      = 'garages',
    wallet      = 'bank',
    email       = 'mail',
    service     = 'services',
}

---Maps a RoadPhone app or router name onto an sd-phone app id. Nil when nothing matches, which the
---banner funnel renders as a generic notification rather than refusing it.
---@param app any
---@return string|nil
local function mapApp(app)
    if type(app) ~= 'string' or app == '' then return nil end
    local key = app:lower():gsub('%s+', ''):gsub('^/', '')
    return APP_MAP[key] or key
end

---Projects RoadPhone's notification options onto sd-phone's banner payload.
---
---`banner` and `lockscreen` are dropped: sd-phone shows a banner while the phone is open and banks
---it on the lockscreen while it is closed, and picks between the two itself.
---@param opts table RoadPhone notification options
---@return table|nil data sd-phone banner payload, nil when the options carry no title
local function banner(opts)
    if type(opts) ~= 'table' then return nil end

    local title = opts.title or opts.apptitle
    if type(title) ~= 'string' or title == '' then return nil end

    if opts.path ~= nil or opts.banner ~= nil or opts.lockscreen ~= nil then
        warnOnce('notify.opts', ('notification path/banner/lockscreen options are not supported (called by %s); the banner was shown with sd-phone\'s own placement'):format(GetInvokingResource() or 'unknown'))
    end

    local app = mapApp(opts.app or opts.path)
    return {
        app   = app,
        appId = app,
        title = title,
        body  = opts.message,
        image = type(opts.img) == 'string' and opts.img or nil,
    }
end

---PhoneNotifyPlayer(source, opts): pushes a phone notification at a connected player.
registerExport('PhoneNotifyPlayer', function(source, opts)
    local src = shim.source(source)
    local data = src and banner(opts) or nil
    if not data then return end
    sd:notify(src, data)
end)

---PhoneNotifyNumber(phoneNumber, opts): the same notification addressed by phone number. A number
---on a pocketed phone arrives as a colour-tagged buzz, exactly as sd-phone's own notifyNumber does.
---
---An offline owner is dropped rather than queued: sd-phone has no offline notification spool, so
---nothing would ever drain it.
registerExport('PhoneNotifyNumber', function(phoneNumber, opts)
    local number = shim.digits(phoneNumber)
    local data = number and banner(opts) or nil
    if not data then return end

    if not sd:notifyNumber(number, data) then
        warnOnce('PhoneNotifyNumber.offline', ('PhoneNotifyNumber cannot queue for an offline or unassigned number (called by %s); the notification was dropped instead of spooled'):format(GetInvokingResource() or 'unknown'))
    end
end)
