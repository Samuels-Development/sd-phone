---@type table Shared shim helpers (server.compat.lbphone.shared): export registration + warn-once.
local shim = require 'server.compat.lbphone.shared'
---@type table Player bridge (bridge.server.player): source resolution from a citizenid.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): number -> citizenid resolution.
local settings = require 'server.settings.store'

local registerLbExport, warnOnce = shim.registerLbExport, shim.warnOnce

---@type table<string, true> Every sd-phone app id the home screen knows, mirrored from
---web/src/shell/appRegistry.tsx APP_REGISTRY. Keep in sync when apps are added.
local SD_APPS = {}
for _, id in ipairs({
    'photos', 'bank', 'settings', 'clock', 'messages', 'phone', 'calendar', 'mail', 'weather',
    'maps', 'music', 'stocks', 'ryde', 'notes', 'voicememos', 'health', 'compass', 'groups',
    'services', 'pages', 'review', 'marketplace', 'radio', 'darkchat', 'cherry', 'photogram',
    'garages', 'homes', 'calculator', 'passwords', 'cookie', 'wordle', 'flappy', 'blocks',
    'blackjack', 'climber', 'railrunner', 'connectfour', 'chess', 'battleship', 'vibez',
    'weazelnews', 'streaks', 'birdy', 'appstore', 'camera',
}) do SD_APPS[id] = true end

---@type table<string, string> lb-phone app name -> sd-phone app id, for the names that differ.
---Identity names (messages, mail, ...) resolve through SD_APPS instead.
local APP_MAP = {
    twitter     = 'birdy',
    instapic    = 'photogram',
    instagram   = 'photogram',
    trendy      = 'vibez',
    tiktok      = 'vibez',
    tinder      = 'cherry',
    spotify     = 'music',
    wallet      = 'bank',
    garage      = 'garages',
    home        = 'homes',
    yellowpages = 'pages',
}

---Maps an lb-phone app name onto an sd-phone app id: known renames first, then a lowercase
---passthrough for names that already match an sd id; anything else yields nil.
---@param app any lb-phone app name
---@return string|nil
local function mapApp(app)
    if type(app) ~= 'string' or app == '' then return nil end
    local key = app:lower():gsub('%s+', '')
    return APP_MAP[key] or (SD_APPS[key] and key) or nil
end

---Shapes an lb notification payload ({ app, title, content?, thumbnail? }) into the sd banner
---funnel's shape ({ app, appId, title, body?, image? }); nil when nothing displayable exists.
---@param data any lb notification payload
---@return table|nil
local function bannerFor(data)
    if type(data) ~= 'table' then return nil end
    local title = type(data.title) == 'string' and data.title ~= '' and data.title or nil
    local body = type(data.content) == 'string' and data.content ~= '' and data.content or nil
    if not title then
        title, body = body, nil
    end
    if not title then return nil end
    local app = mapApp(data.app)
    return {
        app   = app,
        appId = app,
        title = title,
        body  = body,
        image = type(data.thumbnail) == 'string' and data.thumbnail or nil,
    }
end

---Resolves lb's dual-typed notification target: a number (or a numeric string naming an online
---player) is a server id, any other string is a phone number.
---@param target any
---@return number|nil source
local function targetSource(target)
    if type(target) == 'number' then
        return GetPlayerName(target) and target or nil
    end
    if type(target) == 'string' then
        local n = tonumber(target)
        if n and n == math.floor(n) and GetPlayerName(n) then return n end
        local cid = settings.getCitizenByNumber(target)
        return cid and player.getSourceByIdentifier(cid) or nil
    end
    return nil
end

---SendNotification(target, data): pushes an iOS-style banner through the sd client notify
---funnel. Always returns nil.
registerLbExport('SendNotification', function(target, data)
    local payload = bannerFor(data)
    if not payload then return nil end
    local src = targetSource(target)
    if not src then return nil end
    TriggerClientEvent('sd-phone:client:notify', src, payload)
    return nil
end)

---NotifyEveryone(notify, data): the same banner at every ONLINE player. The payload is whichever
---argument is a table; an 'all' scope warns once and is treated as 'online'.
registerLbExport('NotifyEveryone', function(a, b)
    local scope = type(a) == 'string' and a or (type(b) == 'string' and b or nil)
    local payload = bannerFor(type(a) == 'table' and a or b)
    if not payload then return end
    if scope == 'all' then
        warnOnce('NotifyEveryone.all', ("NotifyEveryone 'all' reaches online players only (called by %s); sd-phone has no offline notification store"):format(GetInvokingResource() or 'unknown'))
    end
    for _, src in ipairs(GetPlayers()) do
        TriggerClientEvent('sd-phone:client:notify', tonumber(src), payload)
    end
end)

---EmergencyNotification(source, data { title, content?, icon? }): a plain banner;
---title/content/icon map onto title/body/image. Returns nil.
registerLbExport('EmergencyNotification', function(source, data)
    if type(source) ~= 'number' or not GetPlayerName(source) then return nil end
    if type(data) ~= 'table' then return nil end
    local title = type(data.title) == 'string' and data.title ~= '' and data.title or 'Emergency'
    TriggerClientEvent('sd-phone:client:notify', source, {
        title = title,
        body  = type(data.content) == 'string' and data.content or nil,
        image = type(data.icon) == 'string' and data.icon or nil,
    })
    return nil
end)
