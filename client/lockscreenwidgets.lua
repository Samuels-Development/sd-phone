local customApps = require 'client.customapps'

local active = {}
local callbacks = {}

local function key(appId, widgetId)
    return appId .. ':' .. widgetId
end

local function registered(appId, widgetId, resource)
    local list = customApps.list and customApps.list() or nil
    if type(list) ~= 'table' then return false end
    for _, app in ipairs(list) do
        if app.id == appId and app.resource == resource then
            for _, widget in ipairs(app.lockscreenWidgets or {}) do
                if widget.id == widgetId then return true end
            end
        end
    end
    return false
end

exports('showLockscreenWidget', function(appId, widgetId, data, onAction)
    local resource = GetInvokingResource()
    if type(appId) ~= 'string' or type(widgetId) ~= 'string'
        or not registered(appId, widgetId, resource) then return false end
    local id = key(appId, widgetId)
    active[id] = resource
    callbacks[id] = type(onAction) == 'function' and onAction or nil
    SendNUIMessage({ action = 'sd-phone:lockscreenWidget:show', data = {
        key = id, appId = appId, widgetId = widgetId, payload = type(data) == 'table' and data or {},
    } })
    return true
end)

exports('hideLockscreenWidget', function(appId, widgetId)
    local id = type(appId) == 'string' and type(widgetId) == 'string' and key(appId, widgetId) or nil
    if not id or active[id] ~= GetInvokingResource() then return false end
    active[id], callbacks[id] = nil, nil
    SendNUIMessage({ action = 'sd-phone:lockscreenWidget:hide', data = { key = id } })
    return true
end)

RegisterNUICallback('sd-phone:lockscreenWidget:action', function(data, cb)
    local fn = data and callbacks[data.key]
    if fn then pcall(fn, data.action, data.value, data.data) end
    cb('ok')
end)

AddEventHandler('onResourceStop', function(resource)
    for id, owner in pairs(active) do
        if owner == resource then
            active[id], callbacks[id] = nil, nil
            SendNUIMessage({ action = 'sd-phone:lockscreenWidget:hide', data = { key = id } })
        end
    end
end)
