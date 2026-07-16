---@type table Maps app config (configs/maps.lua): pin caps + label length.
local config = require 'configs.maps'
---@type table Maps persistence layer (server.maps.store): one JSON row per citizenid.
local store  = require 'server.maps.store'
---@type table Player bridge (bridge.server.player): citizenid/name lookups from src.
local player = require 'bridge.server.player'
---@type table AirShare core (server.share.core): nearby-target validation + the
---request/accept handshake every share kind rides on.
local share  = require 'server.share.core'

---@type table Actions module; the table returned at end of file.
local actions = {}

-- Icon keys the UI exposes (mirrors ICON_KEYS in web/src/apps/maps/data.ts).
---@type table<string, boolean> Whitelist of pin icon keys accepted from the client.
local ICON_KEYS = {
    MapPin = true, Home = true, Star = true, Flag = true, Skull = true,
    DollarSign = true, Car = true, Crosshair = true, Heart = true,
    Wrench = true, ShoppingCart = true, Fuel = true,
}

---@type string Default swatch when a payload's colour isn't a valid #rrggbb (first entry of
---COLOR_SWATCHES in web/src/apps/maps/data.ts).
local DEFAULT_COLOR = '#f0c43a'

---Actor identity for every handler: the caller's citizenid, resolved from src via the player
---bridge.
---@param src number player server id
---@return string|nil citizenid or nil when the character isn't loaded
local function cidOf(src) return player.getIdentifier(src) end

---Returns a cleaned marker, or nil to drop it: coordinates must be finite numbers in world
---range, the label is trimmed and clamped to config.MaxLabel, and icon/colour are whitelisted.
---@param m any client-supplied marker candidate
---@return table|nil marker cleaned { id, label, x, y, icon, color }, nil when malformed
local function sanitizeMarker(m)
    if type(m) ~= 'table' then return nil end

    local id = m.id
    if type(id) ~= 'string' or id == '' or #id > 40 then return nil end

    local x, y = tonumber(m.x), tonumber(m.y)
    if not x or not y then return nil end
    if x ~= x or y ~= y then return nil end
    if x < -20000 or x > 20000 or y < -20000 or y > 20000 then return nil end

    local label = type(m.label) == 'string' and (m.label:gsub('^%s+', ''):gsub('%s+$', '')) or ''
    if label == '' then return nil end
    if #label > config.MaxLabel then label = label:sub(1, config.MaxLabel) end

    local icon  = (type(m.icon) == 'string' and ICON_KEYS[m.icon]) and m.icon or 'MapPin'
    local color = (type(m.color) == 'string' and m.color:match('^#%x%x%x%x%x%x$')) and m.color or DEFAULT_COLOR

    return { id = id, label = label, x = x + 0.0, y = y + 0.0, icon = icon, color = color }
end

---Lists the caller's saved pins, scoped to their citizenid. Always returns an array in `data`;
---a row that fails to JSON-decode degrades to an empty list. Read-only.
---@param src number player server id
---@return table result { success, data = marker[] }
function actions.list(src)
    local cid = cidOf(src)
    if not cid then return { success = false, data = {} } end

    local raw = store.forPlayer(cid)
    if not raw or raw == '' then return { success = true, data = {} } end

    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return { success = true, data = {} } end

    return { success = true, data = decoded }
end

---Persists the caller's whole pin array. Every marker passes sanitizeMarker or is silently
---dropped, and the array is capped at config.MaxMarkers.
---@param src number player server id
---@param payload { markers: table } client payload
---@return table result { success, message? }
function actions.save(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end

    local incoming = type(payload) == 'table' and payload.markers or nil
    if type(incoming) ~= 'table' then return { success = false, message = 'Bad payload' } end

    local clean = {}
    for i = 1, #incoming do
        local m = sanitizeMarker(incoming[i])
        if m then
            clean[#clean + 1] = m
            if #clean >= config.MaxMarkers then break end
        end
    end

    store.save(cid, json.encode(clean), os.date('!%Y-%m-%dT%H:%M:%S.000Z'))
    return { success = true }
end

---Sends an AirShare request offering one pin to a nearby, phone-open player. The marker is
---sanitized at request time; delivery happens only if the recipient accepts.
---@param src number sender server id
---@param target number recipient server id (client-chosen, validated by share.request)
---@param payload { marker: table } client payload
---@return table result { success, message? }
function actions.requestShare(src, target, payload)
    local m = sanitizeMarker(type(payload) == 'table' and payload.marker or nil)
    if not m then return { success = false, message = 'Invalid pin' } end

    local okSent, msg = share.request(src, target, 'pin', m)
    if not okSent then return { success = false, message = msg or 'Could not send request' } end
    return { success = true }
end

---Delivers an accepted pin share into the recipient's saved pins under a freshly rolled id, then
---live-pushes it. Refused (false) at the config.MaxMarkers cap or with no loaded character.
---@param targetSrc number recipient server id
---@param m table sanitized marker from the stored share request
---@return boolean delivered
function actions.deliverShare(targetSrc, m)
    local cid = cidOf(targetSrc)
    if not cid then return false end

    local cur = {}
    local raw = store.forPlayer(cid)
    if raw and raw ~= '' then
        local okd, decoded = pcall(json.decode, raw)
        if okd and type(decoded) == 'table' then cur = decoded end
    end
    if #cur >= config.MaxMarkers then return false end

    local marker = {
        id = ('m%07x'):format(math.random(0, 0xFFFFFFF)),
        label = m.label, x = m.x, y = m.y, icon = m.icon, color = m.color,
    }
    table.insert(cur, 1, marker)
    store.save(cid, json.encode(cur), os.date('!%Y-%m-%dT%H:%M:%S.000Z'))

    TriggerClientEvent('sd-phone:client:maps:pinAdded', targetSrc, marker)

    TriggerClientEvent('sd-phone:client:notify', targetSrc, {
        app = 'maps', appId = 'maps', title = 'Maps',
        body = ('Pin "%s" was added to your Maps.'):format(m.label),
        time = 'now',
    })
    return true
end

return actions
