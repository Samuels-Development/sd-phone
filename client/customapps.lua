---@type table sd-phone config root (configs/config.lua), read here only for the Debug flag.
local config = require 'configs.config'

---@type {list: string[], set: table<string, true>} Canonical built-in app ids, reserved from custom apps.
local appIds = require 'client.appids'

---@type table Client job bridge (bridge.client.job): live job name/grade plus a change hook.
local job = require 'bridge.client.job'

---@type table<string, {def: table, resource: string, jobs: table?, requires: table?, onOpen: function?, onClose: function?, onDelete: function?}>
---Registered third-party apps keyed by identifier. onOpen also covers lb-phone's onUse alias, and
---`jobs`/`requires` are the two gates that never reach the def - see the note in add().
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

---@type table<string, string> Fields of one entry in a def's optional `widgets` array, and the Lua
---type each must have. `ui` is the page the home screen frames; `id` defaults to a slug of `name`.
local WIDGET_FIELD_TYPES = {
    id          = 'string',
    name        = 'string',
    ui          = 'string',
    interactive = 'boolean',
}

---@type table<string, true> Sizes a declared widget may claim, matching the home screen's grid.
local WIDGET_SIZES = { sm = true, md = true, lg = true }

---@type string[] Sizes a widget is offered at when it declares none.
local WIDGET_SIZES_DEFAULT = { 'sm', 'md', 'lg' }

local LOCKSCREEN_WIDGET_FIELD_TYPES = {
    id = 'string', name = 'string', ui = 'string', height = 'number', interactive = 'boolean',
}

---@type string This resource, which no widget may point its frame at: a page served from the
---phone's own origin would be same-origin with the shell, and framing the shell nests it in a tile.
local PHONE_RESOURCE = GetCurrentResourceName():lower()

---@type table Public module surface; the table returned at end of file.
local M = {}

---Debug breadcrumb; config.Debug prints at info so it needs no further setup, while
---`setr ox:printlevel:sd-phone debug` turns the same output on live without a restart.
---@param ... any values to print
local function debugPrint(...)
    if config.Debug then return lib.print.info(...) end
    lib.print.debug(...)
end

---Reduces a widget name to an identifier the saved home-screen layout can key a placement on.
---@param value string
---@return string
local function slug(value)
    return (value:lower():gsub('%s+', '_'):gsub('[^%w_%-]', ''))
end

---The resource a widget's ui is served from, or nil for an outside url. A cfx-nui host is read back
---to its resource so the absolute form of a local page cannot dodge the checks below.
---@param ui string
---@return string?
local function uiResource(ui)
    local path = (ui:lower():gsub('^nui://', ''))
    local host = path:match('^https?://([^/]+)')
    if host then return (host:gsub(':%d+$', '')):match('^cfx%-nui%-(.+)') end
    if path:find('http') then return nil end
    return path:gsub('^/', ''):match('^[^/]+')
end

---Sanitizes one declared widget, or refuses it with the reason. Refusing an entry never refuses
---the app: the caller drops this widget and keeps the rest.
---@param entry any
---@param index integer position in the declared array, used when the entry has no usable name
---@return table? widget, string? err
local function readWidget(entry, index)
    if type(entry) ~= 'table' then
        return nil, ('widget #%d must be a table'):format(index)
    end

    local widget = {}
    for field, expected in pairs(WIDGET_FIELD_TYPES) do
        if type(entry[field]) == expected then widget[field] = entry[field] end
    end
    if not widget.name or widget.name == '' then
        return nil, ('widget #%d needs a non-empty name'):format(index)
    end
    if not widget.ui or widget.ui == '' then
        return nil, ('widget %s needs a ui to render'):format(widget.name)
    end
    if uiResource(widget.ui) == PHONE_RESOURCE then
        return nil, ('widget %s cannot frame %s itself'):format(widget.name, PHONE_RESOURCE)
    end

    widget.id = slug(widget.id or widget.name)
    if widget.id == '' then
        return nil, ('widget %s needs an id of letters, numbers, - or _'):format(widget.name)
    end

    local sizes = {}
    if entry.sizes == nil then
        for i = 1, #WIDGET_SIZES_DEFAULT do sizes[i] = WIDGET_SIZES_DEFAULT[i] end
    elseif type(entry.sizes) == 'table' then
        local seen = {}
        for _, size in ipairs(entry.sizes) do
            if WIDGET_SIZES[size] and not seen[size] then
                seen[size] = true
                sizes[#sizes + 1] = size
            end
        end
    end
    if #sizes == 0 then
        return nil, ('widget %s declares no usable size'):format(widget.name)
    end
    widget.sizes = sizes

    return widget
end

---Reads a def's optional `widgets` array, keeping every entry that validates and reporting the
---rest. Returns an empty list when nothing was declared or nothing survived.
---@param list any
---@param identifier string owning app, named in refusal reasons
---@return table[] widgets
local function readWidgets(list, identifier)
    local widgets = {}
    if list == nil then return widgets end
    if type(list) ~= 'table' then
        debugPrint(('%s: widgets must be an array, ignoring it'):format(identifier))
        return widgets
    end

    local claimed = {}
    for index = 1, #list do
        local widget, err = readWidget(list[index], index)
        if not widget then
            debugPrint(('%s: %s'):format(identifier, err))
        elseif claimed[widget.id] then
            debugPrint(('%s: widget id %s is declared twice'):format(identifier, widget.id))
        else
            claimed[widget.id] = true
            widgets[#widgets + 1] = widget
        end
    end
    return widgets
end

local function readLockscreenWidgets(entries)
    local out, seen = {}, {}
    if type(entries) ~= 'table' then return out end
    for index, entry in ipairs(entries) do
        if type(entry) == 'table' then
            local widget = {}
            for field, expected in pairs(LOCKSCREEN_WIDGET_FIELD_TYPES) do
                if type(entry[field]) == expected then widget[field] = entry[field] end
            end
            widget.name = widget.name or ('Lock Screen Widget ' .. index)
            widget.id = slug(widget.id or widget.name)
            widget.height = math.max(48, math.min(240, math.floor(widget.height or 84)))
            if widget.id ~= '' and widget.ui and widget.ui ~= '' and not seen[widget.id]
                and uiResource(widget.ui) ~= PHONE_RESOURCE then
                seen[widget.id] = true
                out[#out + 1] = widget
            end
        end
    end
    return out
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

---A device allow-list: non-empty lowercased strings, or nil when the caller named none. Nil means
---every device shows the app; the frontend does the matching, since one client serves both devices.
---@param value any
---@return string[]|nil
local function readDevices(value)
    if type(value) == 'string' then value = { value } end
    if type(value) ~= 'table' then return nil end
    local out = {}
    for _, entry in ipairs(value) do
        if type(entry) == 'string' and entry ~= '' then out[#out + 1] = entry:lower() end
    end
    if #out == 0 then return nil end
    return out
end

---A job gate as `{ [jobName] = minGrade }`, from a name, an array of names, or a name->grade map.
---Nil when the caller named none, which leaves the app ungated.
---@param value any
---@return table<string, integer>|nil
local function readJobs(value)
    if type(value) == 'string' then value = { value } end
    if type(value) ~= 'table' then return nil end
    local out = {}
    local count = 0
    for key, entry in pairs(value) do
        if type(key) == 'string' and key ~= '' then
            out[key] = math.max(0, math.floor(tonumber(entry) or 0))
            count = count + 1
        elseif type(entry) == 'string' and entry ~= '' then
            out[entry] = 0
            count = count + 1
        end
    end
    if count == 0 then return nil end
    return out
end

---Whether the player's current job clears an entry's gate. Ungated entries always pass; gated ones
---fail closed until the framework has a job for us.
---@param entry table
---@return boolean
local function jobAllows(entry)
    local gate = entry.jobs
    if not gate then return true end
    for name, minGrade in pairs(gate) do
        if job.has(name, minGrade) then return true end
    end
    return false
end

---@type table<string, boolean> Identifier -> the server's last verdict on its `requires` gate. Only
---the server can answer what an item or a framework metadata key says, so this caches its reply
---between refreshes. An identifier with no entry has not been answered for yet.
local verdicts = {}

---Whether the server's gate verdict clears an entry. Ungated entries always pass; a gated one that
---has not been answered for yet fails closed, so a hidden app never flashes on screen while the
---first refresh is still in flight.
---@param entry table
---@return boolean
local function gateAllows(entry)
    if not entry.requires then return true end
    return verdicts[entry.def.id] == true
end

---The sanitized def array in registration order, job and `requires` gates applied. The device gate
---is not applied here: one client serves both the phone and the tablet, so only the UI knows which
---is asking.
---@return table[] list
local function currentList()
    local list = {}
    for i = 1, #order do
        local entry = registry[order[i]]
        if entry and jobAllows(entry) and gateAllows(entry) then list[#list + 1] = entry.def end
    end
    return list
end

---Pushes the full sanitized app list to the NUI.
local function pushSet()
    SendNUIMessage({ action = 'customApps:set', data = currentList() })
end

---Re-asks the server about every gated app and re-pushes when an answer changed. Called on every
---phone open and whenever the server says an unlock moved, which is the same contract the built-in
---catalog already has - the client never decides an item question for itself.
function M.refreshGates()
    local specs, gated = {}, false
    for id, entry in pairs(registry) do
        if entry.requires then
            specs[id] = entry.requires
            gated = true
        end
    end
    if not gated then return end

    local answers = lib.callback.await('sd-phone:server:gates:custom', false, specs)
    if type(answers) ~= 'table' then return end

    local changed = false
    for id in pairs(specs) do
        local allowed = answers[id] == true
        if verdicts[id] ~= allowed then
            verdicts[id] = allowed
            changed = true
        end
    end
    if changed then pushSet() end
end

---Whether an exact identifier is currently registered.
---@param identifier any
---@return boolean
function M.has(identifier)
    return type(identifier) == 'string' and registry[identifier] ~= nil
end

function M.list()
    return currentList()
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
    local widgets = readWidgets(data.widgets, identifier)
    if #widgets > 0 then def.widgets = widgets end
    local lockscreenWidgets = readLockscreenWidgets(data.lockscreenWidgets)
    if #lockscreenWidgets > 0 then def.lockscreenWidgets = lockscreenWidgets end

    -- Devices ride on the def because the UI does that matching; the job and `requires` gates do
    -- not, so a job the player cannot hold, or an app they have not unlocked, never reaches the
    -- page at all - not its id, not its name, not the item that would unlock it.
    local devices = readDevices(data.devices)
    if devices then def.devices = devices end

    local onOpen = data.onOpen
    if type(onOpen) ~= 'function' then onOpen = data.onUse end
    local entry = {
        def      = def,
        resource = resource,
        jobs     = readJobs(data.job),
        -- Kept raw: server.gates is the only thing that reads a spec, and it sanitises what it is
        -- given. Two readers would be two chances to disagree about what a gate means.
        requires = type(data.requires) == 'table' and data.requires or nil,
        onOpen   = type(onOpen) == 'function' and onOpen or nil,
        onClose  = type(data.onClose) == 'function' and data.onClose or nil,
        onDelete = type(data.onDelete) == 'function' and data.onDelete or nil,
    }
    registry[identifier] = entry
    addOrder(identifier)
    pushSet()
    -- Deferred: add() answers an export call, and refreshGates awaits the server. Registering an app
    -- must not block the calling resource on a round trip.
    if entry.requires then CreateThread(M.refreshGates) end
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
    -- Dropped with the app: a verdict left behind would let the same identifier come back visible
    -- for the moment between a re-registration and the refresh that answers for it.
    verdicts[identifier] = nil
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

---Breadcrumbs from the app frame and from the SDK running inside a hosted app, routed here so
---they land in the same console as the Lua ones. The reply reports whether anything is being
---printed, so the frame can stop sending once it knows nobody is listening.
---@param data table|nil { message: string }
---@param cb fun(result: table) NUI response { enabled: boolean }
RegisterNUICallback('customApps/debug', function(data, cb)
    local enabled = config.Debug == true
    if not enabled then
        local level = GetConvar('ox:printlevel:' .. GetCurrentResourceName(), GetConvar('ox:printlevel', 'info'))
        enabled = level == 'debug' or level == 'verbose'
    end

    local message = type(data) == 'table' and data.message or nil
    if enabled and type(message) == 'string' and message ~= '' then
        debugPrint(('[frame] %s'):format(message:sub(1, 400)))
    end
    cb({ enabled = enabled })
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
            verdicts[id] = nil
            removeOrder(id)
            changed = true
        end
    end
    if changed then pushSet() end
end)

---Job-gated apps appear and disappear with the player's job, so every change re-pushes the list.
job.onChange(function()
    pushSet()
    -- A `requires` may name jobs too, and only the server evaluates those, so the cached verdicts
    -- are stale the moment the job moves.
    CreateThread(M.refreshGates)
end)

-- The server says an unlock moved. Sent to one player, so it costs nothing to re-ask on receipt.
RegisterNetEvent('sd-phone:client:gates:refresh', function()
    M.refreshGates()
end)

return M
