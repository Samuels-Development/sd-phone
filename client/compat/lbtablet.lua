---@type string sd_phone_lbtabletcompat convar; 'false' or '0' turns the whole shim off.
local compatConvar = GetConvar('sd_phone_lbtabletcompat', 'true')
if compatConvar == 'false' or compatConvar == '0' then return end

---Returns whether the real lb-tablet resource is started.
---@return boolean
local function realLbTabletStarted()
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == 'lb-tablet' then
            local state = GetResourceState('lb-tablet')
            return state == 'started' or state == 'starting'
        end
    end
    return false
end

if realLbTabletStarted() then return end

---@type any[] AddEventHandler cookies for every registered export handler.
local exportCookies = {}

---Registers fn on the client export registry under lb-tablet's name via the __cfx_export event.
---@param name string PascalCase lb-tablet export name
---@param fn function implementation
local function registerLbExport(name, fn)
    exportCookies[#exportCookies + 1] = AddEventHandler(('__cfx_export_lb-tablet_%s'):format(name), function(setCB)
        setCB(fn)
    end)
end

---AddDispatch(options): relays the dispatch to the server, which files it on the MDT call board.
---Returns the numeric id or false, as lb-tablet does.
registerLbExport('AddDispatch', function(options)
    if type(options) ~= 'table' then return false end
    return lib.callback.await('sd-phone:server:lbtablet:addDispatch', false, options) or false
end)

-- Popup helpers with nothing to act on here: dispatches are read on the board, not as an
-- on-screen notification, so visibility is always on and nothing is ever on screen.
registerLbExport('ToggleDispatchVisible', function(_visible) end)
registerLbExport('IsDispatchVisible', function() return true end)
registerLbExport('IsDispatchOnScreen', function() return false end)
registerLbExport('ViewDispatchInTablet', function(_id) return false end)

---Deregisters the shim's export handlers when the real lb-tablet starts mid-session.
AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= 'lb-tablet' then return end
    for i = 1, #exportCookies do RemoveEventHandler(exportCookies[i]) end
    exportCookies = {}
end)
