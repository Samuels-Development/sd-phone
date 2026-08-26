---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'

---@type table Custom-app module; the table returned at end of file. qs-smartphone registers custom
---apps from the SERVER for every player at once, where sd-phone registers them per client, so this
---holds the server-side registry and relays it to the client half.
local customapps = {}

---@type table<string, { config: table, resource: string }> Registered apps by app id.
local registry = {}

---@type string Net event the client half listens on; carries one { action, app|id } instruction.
local RELAY <const> = 'sd-phone:client:compat:qs:customApps'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---Translates a qs-smartphone app config onto sd-phone's registration shape. qs keys an app on `id`
---and nests its page under `iframe.url`, where sd-phone uses `identifier` and a flat `ui`.
---
---`price` has no counterpart: sd-phone gates an app with `requires` (an item, job, metadata or a
---server check) rather than selling it, so a priced app simply appears.
---@param cfg any
---@return table|nil translated
local function translate(cfg)
    if type(cfg) ~= 'table' then return nil end

    local id = cfg.id or cfg.identifier or cfg.appId
    if type(id) ~= 'string' or id == '' then return nil end

    if cfg.price ~= nil then
        warnOnce('addCustomApp.price', ('custom app `price` is not supported (called by %s); sd-phone gates an app with `requires` rather than selling it, so the app was registered as freely available'):format(GetInvokingResource() or 'unknown'))
    end

    local ui = cfg.ui
    if type(cfg.iframe) == 'table' then ui = cfg.iframe.url or ui end

    return {
        identifier = id,
        name       = cfg.label or cfg.name or id,
        ui         = ui,
        icon       = type(cfg.icon) == 'table' and (cfg.icon.url or cfg.icon.default) or cfg.icon,
    }
end

---Pushes one registry instruction to every connected client, or to one when `target` is given.
---@param instruction table { action: 'add'|'remove', app?: table, id?: string }
---@param target number|nil
local function relay(instruction, target)
    TriggerClientEvent(RELAY, target or -1, instruction)
end

---Every registered app in sd-phone's registration shape, for a client that has just started and
---missed the live pushes.
---@return table[]
function customapps.snapshot()
    local out = {}
    for _, entry in pairs(registry) do out[#out + 1] = entry.config end
    return out
end

---Registers one app for every player. Re-registering an id is only allowed from the resource that
---owns it, matching sd-phone's own attribution rule.
---@param cfg any qs-smartphone app config
---@return boolean added
function customapps.add(cfg)
    local app = translate(cfg)
    if not app then return false end

    local resource = GetInvokingResource() or 'unknown'
    local existing = registry[app.identifier]
    if existing and existing.resource ~= resource then return false end

    registry[app.identifier] = { config = app, resource = resource }
    relay({ action = 'add', app = app })
    return true
end

---addCustomApp(appConfig): registers a third-party app on every phone.
registerExport('addCustomApp', function(appConfig)
    return customapps.add(appConfig)
end)

---addCustomAppsBatch(appConfigs): the same registration for an array of configs; returns how many
---of them were accepted.
registerExport('addCustomAppsBatch', function(appConfigs)
    if type(appConfigs) ~= 'table' then return 0 end
    local added = 0
    for _, cfg in ipairs(appConfigs) do
        if customapps.add(cfg) then added = added + 1 end
    end
    return added
end)

---updateCustomApp(appId, config): a partial update, so only the fields given change.
registerExport('updateCustomApp', function(appId, config)
    local entry = type(appId) == 'string' and registry[appId] or nil
    if not entry or type(config) ~= 'table' then return false end
    if entry.resource ~= (GetInvokingResource() or 'unknown') then return false end

    local patch = translate({ id = appId, label = config.label or config.name, icon = config.icon,
        ui = config.ui, iframe = config.iframe, price = config.price })
    if not patch then return false end

    for key, value in pairs(patch) do
        if value ~= nil and key ~= 'identifier' then entry.config[key] = value end
    end
    relay({ action = 'add', app = entry.config })
    return true
end)

---removeCustomApp(appId): removes a registered app from every phone. Only the owning resource may.
registerExport('removeCustomApp', function(appId)
    local entry = type(appId) == 'string' and registry[appId] or nil
    if not entry then return false end
    if entry.resource ~= (GetInvokingResource() or 'unknown') then return false end

    registry[appId] = nil
    relay({ action = 'remove', id = appId })
    return true
end)

---getCustomApps(): every custom app registered by every running resource, keyed by app id so a
---caller's `pairs` walk reads the same as it does on qs-smartphone.
registerExport('getCustomApps', function()
    local out = {}
    for id, entry in pairs(registry) do
        out[id] = { id = id, label = entry.config.name, ui = entry.config.ui,
            icon = entry.config.icon, resource = entry.resource }
    end
    return out
end)

---Drops a stopping resource's apps, which is what qs-smartphone does when the owning resource stops.
AddEventHandler('onResourceStop', function(resource)
    for id, entry in pairs(registry) do
        if entry.resource == resource then
            registry[id] = nil
            relay({ action = 'remove', id = id })
        end
    end
end)

return customapps
