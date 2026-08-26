---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'

local registerExport = shim.registerExport

---@type table<string, any>|nil The active weather override, or nil while the phone is showing what
---the weather sync actually reports. sd-phone DERIVES its weather from whichever sync resource is
---running rather than storing any, so these exports install an override on top rather than writing
---to a store that does not exist.
local override = nil

---Pushes the current override to every client, where the compat half layers it over the reading
---the weather bridge takes from the sync resource.
local function publish()
    TriggerClientEvent('sd-phone:client:yseries:weather', -1, override)
end

---Merges a patch into the override and publishes it.
---@param patch table
local function apply(patch)
    override = override or {}
    for k, v in pairs(patch) do override[k] = v end
    publish()
end

---SetTemperature(temperature): pins the temperature shown on the phone's weather surfaces.
registerExport('SetTemperature', function(temperature)
    local n = tonumber(temperature)
    if not n then return false end
    apply({ temperature = n })
    return true
end)

---SetWeatherIcon(icon): pins the weather icon/code shown on the phone's weather surfaces.
registerExport('SetWeatherIcon', function(icon)
    if type(icon) ~= 'string' or icon == '' then return false end
    apply({ current = icon:upper(), icon = icon })
    return true
end)

---SetWeatherData(data): pins a whole weather blob. A nil or empty table releases the override and
---returns the phone to the live reading from the weather sync.
registerExport('SetWeatherData', function(data)
    if data == nil or (type(data) == 'table' and next(data) == nil) then
        override = nil
        publish()
        return true
    end
    if type(data) ~= 'table' then return false end
    apply(data)
    return true
end)

---GetWeatherData(): the active override, or nil when the phone is showing the live sync reading.
---
---Deliberately not a live weather read: the values sd-phone shows are derived on the CLIENT from
---whichever sync resource is running, and the server never holds them.
registerExport('GetWeatherData', function()
    return override
end)

---Replays the override to a joining player, whose client missed the broadcast that set it.
AddEventHandler('playerJoining', function()
    if override then TriggerClientEvent('sd-phone:client:yseries:weather', source, override) end
end)
