---@type table sd-phone config root (configs/config.lua), read here only for the Debug flag.
local config = require 'configs.config'

---@type {list: string[], set: table<string, true>} Canonical built-in app ids, reserved from custom apps.
local appIds = require 'client.appids'

---@type table<string, {def: table, resource: string, onOpen: function?, onClose: function?, onDelete: function?}>
---Registered third-party apps keyed by identifier. onOpen also covers lb-phone's onUse alias.
local registry = {}

---@type string[] Identifiers in registration order, so the pushed list is stable.
local order = {}

---@type table<string, string> Optional def fields and the Lua type each must have. `wifi` is a
---network id from configs/wifi.lua the phone must be on before the app can be downloaded.
local FIELD_TYPES = {
    description = 'string',
    developer   = 'string',
    icon        = 'string',
    ui          = 'string',
    wifi        = 'string',
    size        = 'number',
    price       = 'number',
    defaultApp  = 'boolean',
    game        = 'boolean',
    fixBlur     = 'boolean',
    keepOpen    = 'boolean',
    landscape   = 'boolean',
}

---@type table Public module surface; the table returned at end of file.
local M = {}

---Prints debug output when config.Debug is enabled.
---@param ... any values to print
local function debugPrint(...)
    if config.Debug then
        print('[sd-phone:client]', ...)
    end
end

---Records an identifier in the order list once.
---@param id string
local function addOrder(id)
    for i = 1, #order do
        if order[i] == id then return end
    end
    order[#order + 1] = id
end

---Drops an identifier from the order list.
---@param id string
local function removeOrder(id)
    for i = 1, #order do
        if order[i] == id then
            table.remove(order, i)
            return
        end
    end
end

---Builds the sanitized def array in registration order.
---@return table[] list
local function currentList()
    local list = {}
    for i = 1, #order do
        local entry = registry[order[i]]
        if entry then list[#list + 1] = entry.def end
    end
    return list
end

---Pushes the full sanitized app list to the NUI.
local function pushSet()
    SendNUIMessage({ action = 'customApps:set', data = currentList() })
end

---Whether an exact identifier is currently registered.
---@param identifier any
---@return boolean
function M.has(identifier)
    return type(identifier) == 'string' and registry[identifier] ~= nil
end

---Registers or replaces a third-party app. Re-registering an identifier is allowed only from the
---resource that first claimed it; built-in app ids are reserved and an unresolved caller is rejected.
---@param data table lb-phone-shaped app definition
---@param resource string invoking resource name
---@return boolean ok, string? err
function M.add(data, resource)
    if type(data) ~= 'table' then
        return false, 'app data must be a table'
    end
    if type(resource) ~= 'string' or resource == '' then
        return false, 'could not determine the calling resource'
    end
    local identifier = data.identifier
    if type(identifier) ~= 'string' or identifier == '' then
        return false, 'identifier is required and must be a non-empty string'
    end
    if identifier == 'any' then
        return false, "identifier 'any' is reserved for broadcast messages"
    end
    if appIds.set[identifier] then
        return false, ('identifier %s is reserved by a built-in app'):format(identifier)
    end
    if type(data.name) ~= 'string' or data.name == '' then
        return false, 'name is required and must be a non-empty string'
    end
    local existing = registry[identifier]
    if existing and existing.resource ~= resource then
        return false, ('identifier already registered by %s'):format(existing.resource)
    end

    local def = { id = identifier, name = data.name, resource = resource }
    for field, expected in pairs(FIELD_TYPES) do
        if type(data[field]) == expected then def[field] = data[field] end
    end
    if type(data.images) == 'table' then
        local images = {}
        for _, value in ipairs(data.images) do
            if type(value) == 'string' then images[#images + 1] = value end
        end
        def.images = images
    end

    local onOpen = data.onOpen
    if type(onOpen) ~= 'function' then onOpen = data.onUse end
    registry[identifier] = {
        def      = def,
        resource = resource,
        onOpen   = type(onOpen) == 'function' and onOpen or nil,
        onClose  = type(data.onClose) == 'function' and data.onClose or nil,
        onDelete = type(data.onDelete) == 'function' and data.onDelete or nil,
    }
    addOrder(identifier)
    pushSet()
    debugPrint(('registered custom app %s from %s'):format(identifier, resource))
    return true
end

---Removes a registered app. Only the resource that owns the identifier may remove it.
---@param identifier any
---@param resource string invoking resource name
---@return boolean ok, string? err
function M.remove(identifier, resource)
    if type(identifier) ~= 'string' or identifier == '' then
        return false, 'identifier must be a non-empty string'
    end
    local entry = registry[identifier]
    if not entry then
        return false, ('no custom app registered with identifier %s'):format(identifier)
    end
    if type(resource) ~= 'string' or resource == '' then
        return false, 'could not determine the calling resource'
    end
    if entry.resource ~= resource then
        return false, ('custom app %s is owned by %s'):format(identifier, entry.resource)
    end
    registry[identifier] = nil
    removeOrder(identifier)
    pushSet()
    debugPrint(('removed custom app %s'):format(identifier))
    return true
end

---Pushes a Lua-originated message into a registered app's UI. The reserved identifier 'any'
---broadcasts to every custom app; otherwise only the owning resource may message its own app.
---@param identifier any
---@param message any
---@param resource string invoking resource name
---@return boolean ok, string? err
function M.sendMessage(identifier, message, resource)
    if type(identifier) ~= 'string' or identifier == '' then
        return false, 'identifier must be a non-empty string'
    end
    if identifier == 'any' then
        SendNUIMessage({ action = 'customApps:message', data = { id = 'any', message = message } })
        return true
    end
    local entry = registry[identifier]
    if not entry then
        return false, ('no custom app registered with identifier %s'):format(identifier)
    end
    if type(resource) ~= 'string' or resource == '' then
        return false, 'could not determine the calling resource'
    end
    if entry.resource ~= resource then
        return false, ('custom app %s is owned by %s'):format(identifier, entry.resource)
    end
    SendNUIMessage({ action = 'customApps:message', data = { id = identifier, message = message } })
    return true
end

---Frontend boot hydration: the full sanitized app list.
---@param _ any unused payload
---@param cb fun(list: table[]) NUI response
RegisterNUICallback('customApps/get', function(_, cb)
    cb(currentList())
end)

---Lifecycle relay from the UI. open/close dispatch the registered onOpen/onClose under pcall;
---install and uninstall are acknowledged only (the frontend persists install state itself).
---@param data table|nil { id: string, action: 'open'|'close'|'install'|'uninstall' }
---@param cb fun(ok: boolean) NUI response
RegisterNUICallback('customApps/lifecycle', function(data, cb)
    local id     = type(data) == 'table' and data.id or nil
    local action = type(data) == 'table' and data.action or nil
    local entry  = type(id) == 'string' and registry[id] or nil
    if entry then
        if action == 'open' and entry.onOpen then
            local ok, err = pcall(entry.onOpen)
            if not ok then debugPrint(('onOpen for %s errored: %s'):format(id, err)) end
        elseif action == 'close' and entry.onClose then
            local ok, err = pcall(entry.onClose)
            if not ok then debugPrint(('onClose for %s errored: %s'):format(id, err)) end
        elseif action == 'uninstall' and entry.onDelete then
            local ok, err = pcall(entry.onDelete)
            if not ok then debugPrint(('onDelete for %s errored: %s'):format(id, err)) end
        end
    end
    cb(true)
end)

---Resource-stop cleanup: drops every app the stopped resource registered and refreshes the UI.
---@param stopped string name of the resource that stopped
AddEventHandler('onResourceStop', function(stopped)
    if stopped == GetCurrentResourceName() then return end
    local changed = false
    for id, entry in pairs(registry) do
        if entry.resource == stopped then
            registry[id] = nil
            removeOrder(id)
            changed = true
        end
    end
    if changed then pushSet() end
end)

return M
