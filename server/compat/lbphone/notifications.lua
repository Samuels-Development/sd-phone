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
    'services', 'pages', 'marketplace', 'radio', 'darkchat', 'cherry', 'photogram',
    'garages', 'homes', 'calculator', 'passwords', 'id', 'cookie', 'wordle', 'flappy', 'blocks',
    'casino', 'climber', 'connectfour', 'chess', 'battleship', 'vibez',
    'weazelnews', 'streaks', 'birdy', 'appstore', 'camera',
}) do SD_APPS[id] = true end

---@type table<string, string> lb-phone app name -> sd-phone app id, for the names that differ.
---Identity names (messages, mail, ...) resolve through SD_APPS instead.
local APP_MAP = {
    blackjack   = 'casino',
    roulette    = 'casino',
    slots       = 'casino',
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

---@type integer lb's broadcast sentinel. Resources pass -1 to reach everyone, which works on
---lb-phone because it hands the source straight to TriggerClientEvent and FiveM treats -1 as every
---client. This shim resolves targets itself, so it has to honour the sentinel explicitly; guarding
---on GetPlayerName alone rejected it and a broadcast reached nobody, silently.
local EVERYONE = -1

---Delivers a banner to a resolved target: every online player for the -1 sentinel, otherwise the
---one source. Shares NotifyEveryone's loop so both broadcast paths reach the same players.
---@param target number resolved source, or EVERYONE
---@param payload table banner payload for sd-phone:client:notify
local function pushBanner(target, payload)
    if target ~= EVERYONE then
        TriggerClientEvent('sd-phone:client:notify', target, payload)
        return
    end
    for _, src in ipairs(GetPlayers()) do
        TriggerClientEvent('sd-phone:client:notify', tonumber(src), payload)
    end
end

---Resolves lb's dual-typed notification target: -1 is every online player, a number (or a numeric
---string naming an online player) is a server id, any other string is a phone number.
---@param target any
---@return number|nil source resolved source, EVERYONE for a broadcast, nil when unresolvable
local function targetSource(target)
    if type(target) == 'number' then
        if target == EVERYONE then return EVERYONE end
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
    pushBanner(src, payload)
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
    pushBanner(EVERYONE, payload)
end)

---EmergencyNotification(source, data { title, content?, icon? }): a plain banner;
---title/content/icon map onto title/body/image. Dispatch resources routinely broadcast these with
---source -1, so the target goes through the shared resolver rather than a single-player guard.
---Returns nil.
registerLbExport('EmergencyNotification', function(source, data)
    if type(data) ~= 'table' then return nil end
    local src = targetSource(source)
    if not src then return nil end
    local title = type(data.title) == 'string' and data.title ~= '' and data.title or 'Emergency'
    pushBanner(src, {
        title     = title,
        body      = type(data.content) == 'string' and data.content or nil,
        image     = type(data.icon) == 'string' and data.icon or nil,
        -- lb's emergency notification is a distinct, hard-to-miss alert rather than one more
        -- banner, so it maps onto sd-phone's alert treatment instead of degrading to a plain one.
        emergency = true,
    })
    return nil
end)
