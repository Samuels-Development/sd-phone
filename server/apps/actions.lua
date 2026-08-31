---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player   = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone_settings row CRUD.
local settings = require 'server.settings.store'

---@type table Actions module; the table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail = util.ok, util.fail


-- Downloadable = every enabled app NOT flagged `base`, built once from config.Apps.Apps. A
-- disabled app drops out of this set, so sanitize() also strips it from stored installed
-- lists on every read - disabling an app removes it from phones that had it.
---@type table<string, boolean> Set of app ids a player may install/uninstall.
local DOWNLOADABLE = {}
for _, app in ipairs(config.Apps.Apps or {}) do
    if app.id and app.base ~= true and app.enabled ~= false then DOWNLOADABLE[app.id] = true end
end

-- Apps pinned to one Wi-Fi network by `wifi` in configs/apps.lua. The ssid is resolved once here
-- so a refusal can name the network the way the player reads it on screen.
---@type table<string, { id: string, ssid: string }> App id -> required network id + ssid.
local WIFI_GATED = {}
do
    local wifiCfg = type(config.Wifi) == 'table' and config.Wifi or {}
    local ssids = {}
    for _, net in ipairs(type(wifiCfg.Networks) == 'table' and wifiCfg.Networks or {}) do
        if type(net.id) == 'string' then
            ssids[net.id] = type(net.ssid) == 'string' and net.ssid or net.id
        end
    end
    for _, app in ipairs(config.Apps.Apps or {}) do
        if app.id and type(app.wifi) == 'string' and app.wifi ~= '' then
            WIFI_GATED[app.id] = { id = app.wifi, ssid = ssids[app.wifi] or app.wifi }
        end
    end
end

-- Retired app ids folded into the app that replaced them. sanitize() drops anything DOWNLOADABLE
-- no longer lists, so without this remap every player who owned the old app silently loses it and
-- has to re-download the replacement. Applied on read, so the next layout save heals the row.
---@type table<string, string> Retired app id -> the id that supersedes it.
local LEGACY_APP_IDS = { blackjack = 'casino' }

---Drops ids that aren't currently valid downloadables and de-dupes, preserving order, remapping
---retired ids first. Runs on every read of the stored list.
---@param ids string[] stored app ids
---@return string[] clean valid, de-duped ids
local function sanitize(ids)
    local out, seen = {}, {}
    for _, stored in ipairs(ids or {}) do
        local id = LEGACY_APP_IDS[stored] or stored
        if DOWNLOADABLE[id] and not seen[id] then
            seen[id] = true
            out[#out + 1] = id
        end
    end
    return out
end

---The caller's installed downloadable apps + saved home-screen layout, scoped to the citizenid
---resolved from src. Read-only.
---@param source number player server id
---@return table result { success, data = { installed, layout } }
function actions.list(source)
    local cid = player.getIdentifier(source)
    if not cid then return fail('apps.playerNotFound', 'Player not found') end
    return ok({
        installed = sanitize(settings.getInstalledApps(cid)),
        layout    = settings.getHomeLayout(cid),
    })
end

---Installs one downloadable app for the caller: whitelist-checked against DOWNLOADABLE, and
---refused for a `wifi` app unless the server itself puts the player on that network. Idempotent.
---@param source number player server id
---@param payload { id?: string } client payload
---@return table result { success, data = { installed } }
function actions.install(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('apps.playerNotFound', 'Player not found') end

    local id = payload.id
    if type(id) ~= 'string' or not DOWNLOADABLE[id] then
        return fail('apps.appCanTDownloaded', 'That app can\'t be downloaded')
    end

    local gate = WIFI_GATED[id]
    if gate and not exports['sd-phone']:hasWifiAccess(source, gate.id) then
        return fail('apps.onlyAvailableOn', 'Only available on {network}', { network = gate.ssid })
    end

    local installed = sanitize(settings.getInstalledApps(cid))
    for _, existing in ipairs(installed) do
        if existing == id then return ok({ installed = installed }) end
    end
    installed[#installed + 1] = id
    settings.setInstalledApps(cid, installed)
    return ok({ installed = installed })
end

---Uninstalls one app for the caller; the id is an equality filter over the already-sanitized
---list. Idempotent.
---@param source number player server id
---@param payload { id?: string } client payload
---@return table result { success, data = { installed } }
function actions.uninstall(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('apps.playerNotFound', 'Player not found') end

    local id = payload.id
    if type(id) ~= 'string' or not DOWNLOADABLE[id] then
        return fail('apps.appCanTUninstalled', 'That app can\'t be uninstalled')
    end

    local installed = sanitize(settings.getInstalledApps(cid))
    local remaining = {}
    for _, existing in ipairs(installed) do
        if existing ~= id then remaining[#remaining + 1] = existing end
    end
    -- Nothing was removed: skip the write AND the teardown fan-out, which costs an online-player
    -- map plus several queries in every listening module.
    if #remaining == #installed then return ok({ installed = installed }) end
    settings.setInstalledApps(cid, remaining)

    -- First-party hook: lets stateful apps (groups, etc.) tear down their per-player data.
    TriggerEvent('sd-phone:server:apps:uninstalled', { source = source, citizenid = cid, appId = id })

    return ok({ installed = remaining })
end

-- One player has one layout column but may own several devices, and a layout only means anything
-- against the grid it was arranged on: the slot array's page boundaries are that device's
-- cols * rows, 24 on the phone against 36 on the tablet. So the column holds an envelope,
-- { devices = { <id> = '<layout json>' } }, one opaque string per device.
---@type table<string, boolean> Device ids allowed to own a layout slice.
local LAYOUT_DEVICES = { phone = true, tablet = true }

---@type integer Cap on the merged envelope, sitting under the TEXT column's 65535 bytes with room
---for the escaping the nesting adds - two full-size layouts still fit.
local MAX_LAYOUT_COLUMN = 60000

---Reads the layout column as a device -> layout-string map. The layout strings stay opaque: they
---are never decoded here, because a slot array is full of nulls and a Lua table cannot hold those
---without turning the array into holes and re-encoding it as something else entirely.
---@param stored string|nil raw column value
---@return table<string, string> devices device id -> layout JSON
local function decodeLayouts(stored)
    if type(stored) ~= 'string' or stored == '' then return {} end
    local parsed, decoded = pcall(json.decode, stored)
    if parsed and type(decoded) == 'table' and type(decoded.devices) == 'table' then
        local out = {}
        for id, layout in pairs(decoded.devices) do
            if LAYOUT_DEVICES[id] and type(layout) == 'string' then out[id] = layout end
        end
        return out
    end
    -- No envelope: written when the phone was the only device, so it is the phone's layout and is
    -- carried over under that id rather than dropped.
    return { phone = stored }
end

---Persists the caller's home-screen layout for one device, an opaque JSON string from the UI,
---merged into the envelope so the other device's layout survives. Validation is type + a 16k size
---cap; scoped to the citizenid resolved from src.
---@param source number player server id
---@param payload { layout?: string, device?: string } client payload
---@return table result { success }
function actions.saveLayout(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('apps.playerNotFound', 'Player not found') end

    -- The home screen already debounces a rearrange into one save every 500ms, so this only ever
    -- bites a script: a 16KB TEXT column rewrite is the most expensive write the phone can ask for.
    if not util.rateLimit(cid, 'apps:saveLayout', 10000, 30) then return fail('apps.tooManyChangesOnce', 'Too many changes at once') end

    local layout = payload.layout
    if type(layout) ~= 'string' or #layout > 16000 then return fail('apps.invalidLayout', 'Invalid layout') end

    -- An absent or unrecognised device is the phone: that is what every caller predating the
    -- tablet sent, so an older NUI bundle keeps writing exactly the slice it always wrote.
    local deviceId = LAYOUT_DEVICES[payload.device] and payload.device or 'phone'
    local devices = decodeLayouts(settings.getHomeLayout(cid))
    devices[deviceId] = layout

    local encoded = json.encode({ devices = devices })
    if #encoded > MAX_LAYOUT_COLUMN then return fail('apps.invalidLayout', 'Invalid layout') end
    settings.setHomeLayout(cid, encoded)
    return ok()
end

return actions
