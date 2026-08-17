---@type table Secret app catalog root (configs/secret_apps.lua).
local config = require 'configs.secret_apps'
---@type table Custom third-party app registry (client.customapps): add/remove/message + lifecycle.
local customApps = require 'client.customapps'

---@type string This resource, passed to customApps.add as the owning resource.
local RESOURCE = GetCurrentResourceName()

---@type table<string, table> Secret app id -> def, built once from configs/secret_apps.lua.
local BY_ID = {}
for _, app in ipairs(config.Apps or {}) do
    if type(app.id) == 'string' and app.id ~= '' then BY_ID[app.id] = app end
end

---Registers one secret app as a custom app on this client only. `defaultApp` marks it already
---installed (see web/src/App.tsx's `a.base ||` check), so it appears on the home screen the
---moment it's registered - no separate App Store "Get" step.
---@param app table secret app def from configs/secret_apps.lua
local function register(app)
    if customApps.has(app.id) then return end
    local appResource = app.resource or (app.ui and app.ui:match('^([^/]+)/')) or app.id
    customApps.add({
        identifier  = app.id,
        name        = app.label or app.id,
        description = app.description,
        icon        = app.icon,
        ui          = app.ui,
        defaultApp  = true,
    }, appResource)
end

local function loadSecretApps()
    local ok, ids = pcall(lib.callback.await, 'sd-phone:server:secretapps:list', false)
    if not ok or type(ids) ~= 'table' then return end
    for _, id in ipairs(ids) do
        local app = BY_ID[id]
        if app then register(app) end
    end
end

-- Fetch unlocked apps on thread start (if resource restarted while already in-game)
CreateThread(function()
    Wait(500)
    loadSecretApps()
end)

-- Fetch unlocked apps whenever a player character loads / relogs
RegisterNetEvent('qbx_core:client:playerLoaded', function()
    Wait(500)
    loadSecretApps()
end)

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    Wait(500)
    loadSecretApps()
end)

-- Live unlock: server/secretapps/init.lua fires this the moment the item is used, so the app
-- shows up without a relog.
RegisterNetEvent('sd-phone:client:secretapps:unlocked', function(app)
    if type(app) ~= 'table' or type(app.id) ~= 'string' then return end
    register(BY_ID[app.id] or app)
end)

---Unregisters one secret app from custom apps on this client.
---@param appId string secret app id
local function unregister(appId)
    if not customApps.has(appId) then return end
    local app = BY_ID[appId]
    local appResource = app and (app.resource or (app.ui and app.ui:match('^([^/]+)/')) or app.id) or appId
    customApps.remove(appId, appResource)
end

-- Live removal: server fires this when a secret app is removed/uninstalled.
RegisterNetEvent('sd-phone:client:secretapps:removed', function(appId)
    if type(appId) ~= 'string' or appId == '' then return end
    unregister(appId)
end)

