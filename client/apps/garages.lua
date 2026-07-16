---@type table Notify bridge (bridge.client.notify): local notification popups.
local notify = require 'bridge.client.notify'

---@type table<integer, string> GTA vehicle-class id -> display label for the app's class chip.
local CLASS_NAMES = {
    [0] = 'Compact',  [1] = 'Sedan',      [2] = 'SUV',        [3] = 'Coupe',
    [4] = 'Muscle',   [5] = 'Sports Classic', [6] = 'Sports', [7] = 'Super',
    [8] = 'Motorcycle', [9] = 'Off-Road', [10] = 'Industrial',[11] = 'Utility',
    [12] = 'Van',     [13] = 'Cycle',     [14] = 'Boat',      [15] = 'Helicopter',
    [16] = 'Plane',   [17] = 'Service',   [18] = 'Emergency', [19] = 'Military',
    [20] = 'Commercial', [21] = 'Train',
}

-- Vehicle-image source: toggle, default and URL template live in configs/garages.lua.
---@type table Garages app config (configs.garages): system pick, image knobs, waypoint fallbacks.
local GARAGES_CFG     = require 'configs.garages'
---@type boolean Whether players may flip photos <-> icons from the app header.
local ALLOW_TOGGLE    = GARAGES_CFG.AllowImageToggle == true
---@type boolean Default photos-on state.
local SHOW_IMAGES_DEF = GARAGES_CFG.ShowVehicleImages ~= false
---@type boolean True when images could show at all.
local IMAGES_POSSIBLE = ALLOW_TOGGLE or SHOW_IMAGES_DEF
---@type string Image URL template with a `{model}` placeholder ('' disables images).
local IMAGE_TEMPLATE  = type(GARAGES_CFG.VehicleImageUrl) == 'string' and GARAGES_CFG.VehicleImageUrl or ''

---Enriches one server vehicle row in place: resolves the raw model into a display name + class
---label, attaches the photo URL when images can show, and strips internal fields.
---@param v table vehicle row from the server list callback (mutated in place)
---@return table v the same row, for call-through convenience
local function enrich(v)
    local raw  = v.model
    local hash = nil
    if type(raw) == 'number' then
        hash = raw
    elseif type(raw) == 'string' and raw ~= '' then
        hash = GetHashKey(raw)
    end

    local display = type(raw) == 'string' and raw or nil
    local spawn = type(raw) == 'string' and raw ~= '' and raw:lower() or nil

    if hash then
        local dn = GetDisplayNameFromVehicleModel(hash)
        if dn and dn ~= '' and dn ~= 'CARNOTFOUND' then
            local label = GetLabelText(dn)
            display = (label and label ~= 'NULL' and label) or dn
            spawn = spawn or dn:lower()
        end
        local cls = GetVehicleClassFromName(hash)
        v.class = CLASS_NAMES[cls] or v.class
    end

    if IMAGES_POSSIBLE and spawn and IMAGE_TEMPLATE ~= '' then
        v.image = (IMAGE_TEMPLATE:gsub('{model}', spawn))
    end

    v.model = display or 'Vehicle'
    if not v.class or v.class == '' then
        v.class = v.garageType == 'boat' and 'Boat'
            or v.garageType == 'air' and 'Aircraft'
            or 'Vehicle'
    end
    v.garageType = nil
    v.hash = nil
    return v
end

---React -> Lua: the player's vehicle list. Forwards to the server callback, enriches each row
---(pcall'd per row), and attaches the image toggle flags.
RegisterNUICallback('sd-phone:garages:list', function(_payload, cb)
    local result = lib.callback.await('sd-phone:server:garages:list', false)
    if not result then result = { success = false, message = 'No response from server', data = {} } end
    if result.success and type(result.data) == 'table' then
        for i = 1, #result.data do
            pcall(enrich, result.data[i])
        end
    end
    result.images = { allowToggle = ALLOW_TOGGLE, default = SHOW_IMAGES_DEF }
    cb(result)
end)

---React -> Lua: drops a map waypoint at server-resolved coords; non-numeric input is rejected.
RegisterNUICallback('sd-phone:garages:waypoint', function(payload, cb)
    local x = type(payload) == 'table' and tonumber(payload.x) or nil
    local y = type(payload) == 'table' and tonumber(payload.y) or nil
    if not x or not y then return cb({ success = false }) end
    SetNewWaypoint(x + 0.0, y + 0.0)
    notify.show({ description = 'Waypoint set.', type = 'success' })
    cb({ success = true })
end)

-- Live mileage (jg-vehiclemileage), resolved on the client.
---@type string|nil Cached 'mi'/'km' from jg-vehiclemileage's getUnit.
local cachedUnit

---Returns the short unit label for mileage figures, cached after the first successful export
---read. Defaults to 'km'.
---@return string unit 'mi' or 'km'
local function unitShort()
    if cachedUnit then return cachedUnit end
    local ok, u = pcall(function() return exports['jg-vehiclemileage']:getUnit() end)
    cachedUnit = (ok and u == 'miles') and 'mi' or 'km'
    return cachedUnit
end

---Plate equality tolerant of the game's plate padding: trailing whitespace stripped and case
---ignored on both sides. nil-safe on either input.
---@param a string|nil
---@param b string|nil
---@return boolean
local function plateMatches(a, b)
    if not a or not b then return false end
    return (a:gsub('%s+$', '')):upper() == (b:gsub('%s+$', '')):upper()
end

---@type table Vehicle-key bridge (bridge.client.vehiclekeys): live lock state + fob lock/unlock
---across the supported key resources.
local vehiclekeys = require 'bridge.client.vehiclekeys'

---React -> Lua: live lock state for one of the player's vehicles; answers only for a vehicle
---streamed near the player. Read-only.
RegisterNUICallback('sd-phone:garages:lockstate', function(payload, cb)
    local plate = type(payload) == 'table' and payload.plate or nil
    if not vehiclekeys.active() or type(plate) ~= 'string' or plate == '' then return cb({ success = false }) end
    local locked = vehiclekeys.isLocked(plate)
    if locked == nil then return cb({ success = false }) end
    cb({ success = true, locked = locked })
end)

---React -> Lua: locks/unlocks a nearby spawned vehicle, chirping the hazards. Fails when the
---car isn't streamed near the player.
RegisterNUICallback('sd-phone:garages:setlock', function(payload, cb)
    local plate  = type(payload) == 'table' and payload.plate or nil
    local locked = type(payload) == 'table' and payload.locked == true
    if type(plate) ~= 'string' or plate == '' then return cb({ success = false }) end
    local applied = vehiclekeys.setLocked(plate, locked)
    if applied == nil then return cb({ success = false }) end
    cb({ success = true, locked = applied })
end)

---React -> Lua: a vehicle's odometer reading: the live export value when the player sits in
---that vehicle, else the persisted value by plate; converts km -> mi per jg's unit and floors.
RegisterNUICallback('sd-phone:garages:mileage', function(payload, cb)
    if GetResourceState('jg-vehiclemileage') ~= 'started' then return cb({ success = false }) end
    local plate = type(payload) == 'table' and payload.plate or nil
    if type(plate) ~= 'string' or plate == '' then return cb({ success = false }) end

    local km
    local veh = GetVehiclePedIsIn(PlayerPedId(), false)
    if veh ~= 0 and plateMatches(GetVehicleNumberPlateText(veh), plate) then
        local ok, v = pcall(function() return exports['jg-vehiclemileage']:getMileage() end)
        if ok and type(v) == 'number' then km = v end
    end
    if km == nil then
        local ok, v = pcall(function() return exports['jg-vehiclemileage']:getMileageByPlate(plate) end)
        if ok and type(v) == 'number' then km = v end
    end
    if type(km) ~= 'number' then return cb({ success = false }) end

    local unit = unitShort()
    local val  = unit == 'mi' and km * 0.621371 or km
    cb({ success = true, mileage = math.floor(val), unit = unit })
end)
