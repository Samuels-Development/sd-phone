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

---Drops ids that aren't currently valid downloadables and de-dupes, preserving order. Runs on
---every read of the stored list.
---@param ids string[] stored app ids
---@return string[] clean valid, de-duped ids
local function sanitize(ids)
    local out, seen = {}, {}
    for _, id in ipairs(ids or {}) do
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
    if not cid then return fail('Player not found') end
    return ok({
        installed = sanitize(settings.getInstalledApps(cid)),
        layout    = settings.getHomeLayout(cid),
    })
end

---Installs one downloadable app for the caller. The id is whitelist-checked against DOWNLOADABLE
---and the stored list re-sanitized before the append. Idempotent.
---@param source number player server id
---@param payload { id?: string } client payload
---@return table result { success, data = { installed } }
function actions.install(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local id = payload.id
    if type(id) ~= 'string' or not DOWNLOADABLE[id] then
        return fail('That app can\'t be downloaded')
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
    if not cid then return fail('Player not found') end

    local id = payload.id
    local installed = sanitize(settings.getInstalledApps(cid))
    local remaining = {}
    for _, existing in ipairs(installed) do
        if existing ~= id then remaining[#remaining + 1] = existing end
    end
    settings.setInstalledApps(cid, remaining)

    -- First-party hook: lets stateful apps (groups, etc.) tear down their per-player data.
    TriggerEvent('sd-phone:server:apps:uninstalled', { source = source, citizenid = cid, appId = id })

    return ok({ installed = remaining })
end

---Persists the caller's home-screen layout, an opaque JSON string from the UI. Validation is
---type + a 16k size cap; scoped to the citizenid resolved from src.
---@param source number player server id
---@param payload { layout?: string } client payload
---@return table result { success }
function actions.saveLayout(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local layout = payload.layout
    if type(layout) ~= 'string' or #layout > 16000 then return fail('Invalid layout') end
    settings.setHomeLayout(cid, layout)
    return ok()
end

return actions
