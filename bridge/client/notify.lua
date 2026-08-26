---@type table Framework bridge (bridge.shared.framework): detected core name ('qb'/'esx') + live core object.
local framework = require 'bridge.shared.framework'

-- Toggles for the notification backend.
---@type boolean Use ox_lib's lib.notify when ox_lib is loaded.
local USE_OX_LIB    = true
---@type boolean Use lation_ui's notify export instead (only consulted when the ox_lib path is off/unavailable).
local USE_LATION_UI = false

---@type table Notify module; the table returned at end of file. Client-side notification bridge:
---one show() over whichever toast backend the server runs (ox_lib, lation_ui, or the framework's
---native notify), plus the listener for the 'sd-phone:client:toast' net event that
---bridge/server/notify.lua fires.
local notify = {}

---Picks the notify backend once at module load: ox_lib (when loaded and enabled), lation_ui
---(opt-in), the framework's native notify, or a fallback that errors on first use.
---@return fun(data: { title?: string, description: string, type?: string, position?: string, duration?: number })
local function chooseBackend()
    if lib ~= nil and USE_OX_LIB then
        return function(data)
            lib.notify({
                title       = data.title,
                description = data.description,
                type        = data.type or 'inform',
                position    = data.position or 'top-right',
                duration    = data.duration or 3000,
            })
        end
    end

    if USE_LATION_UI then
        return function(data)
            exports.lation_ui:notify({
                title   = data.title,
                message = data.description,
                type    = data.type or 'info',
            })
        end
    end

    if framework.name == 'esx' then
        return function(data) framework.core.ShowNotification(data.description) end
    elseif framework.name == 'qbx' then
        return function(data) exports.qbx_core:Notify(data.description, data.type or 'info') end
    elseif framework.qb then
        return function(data) framework.core.Functions.Notify(data.description, data.type or 'info') end
    end

    -- Neither ox_core nor ND ships a notify of its own, but both refuse to start without ox_lib, so
    -- lib.notify is always there even when the ox_lib backend above is switched off in config.
    if (framework.name == 'ox' or framework.name == 'nd') and lib ~= nil then
        return function(data)
            lib.notify({
                title       = data.title,
                description = data.description,
                type        = data.type or 'inform',
                position    = data.position or 'top-right',
                duration    = data.duration or 3000,
            })
        end
    end

    return function(data)
        error(('Notification system not supported. message=%s type=%s'):format(
            data.description, data.type))
    end
end

---@type fun(data: table) Chosen notify backend, resolved once at module load.
local backend = chooseBackend()

---Shows a notification. Accepts a payload table or a (text, type) pair.
---@param data string|table
---@param notifyType? string
function notify.show(data, notifyType)
    if type(data) == 'string' then
        backend({ description = data, type = notifyType or 'info' })
    else
        backend(data)
    end
end

---Server -> client toast trigger, fired by bridge.server.notify.to(src, ...). Shows string or
---table payloads; drops anything else. Distinct from 'sd-phone:client:notify' (the phone banner).
---@param data string|table Notification payload (passed straight through to `notify.show`).
RegisterNetEvent('sd-phone:client:toast', function(data)
    if type(data) ~= 'string' and type(data) ~= 'table' then return end
    notify.show(data)
end)

return notify
