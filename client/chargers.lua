---@type table Main config (configs.config).
local config = require 'configs.config'
---@type table Battery runtime (client.battery).
local battery = require 'client.battery'
---@type table Target bridge (bridge.client.target).
local target = require 'bridge.client.target'

---@type table<string, boolean> Active charging sources. Charging stays on while ANY is true, so
---stepping out of a car while plugged into a wall does not stop the charge.
local sources = { cable = false, vehicle = false, prop = false, zone = false }

---Recomputes the latch from every source.
local function sync()
    battery.setCharging(sources.cable or sources.vehicle or sources.prop or sources.zone)
end

---@param key string
---@param on boolean
local function setSource(key, on)
    if sources[key] == on then return end
    sources[key] = on
    sync()
end

RegisterNetEvent('sd-phone:client:battery:cable', function()
    setSource('cable', not sources.cable)
end)

CreateThread(function()
    if not config.Battery or not config.Battery.Enabled then return end

    local cfg = config.Battery.Cable
    if not cfg or not cfg.Enabled then return end

    for _, model in ipairs(cfg.Props or {}) do
        target.addModel(model, {
            {
                label   = 'Plug in phone',
                icon    = 'fas fa-bolt',
                onSelect = function() setSource('prop', not sources.prop) end,
            },
        })
    end
end)

CreateThread(function()
    if not config.Battery or not config.Battery.Enabled then return end

    local cfg = config.Battery.Vehicle
    if not cfg or not cfg.Enabled then return end

    while true do
        Wait(2000)

        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)
        local seated = veh ~= 0

        if seated and cfg.DriverOnly then
            seated = GetPedInVehicleSeat(veh, -1) == ped
        end
        if seated and cfg.Classes then
            local class = GetVehicleClass(veh)
            local match = false
            for _, allowed in ipairs(cfg.Classes) do
                if allowed == class then
                    match = true
                    break
                end
            end
            seated = match
        end

        setSource('vehicle', seated)
    end
end)

CreateThread(function()
    if not config.Battery or not config.Battery.Enabled then return end

    local cfg = config.Battery.Cable
    if not cfg or not cfg.Zones or #cfg.Zones == 0 then return end

    while true do
        Wait(2000)

        local pos = GetEntityCoords(PlayerPedId())
        local near = false
        for _, zone in ipairs(cfg.Zones) do
            local c = zone.coords
            if c then
                local dx, dy, dz = pos.x - c.x, pos.y - c.y, pos.z - c.z
                if (dx * dx + dy * dy + dz * dz) <= ((zone.radius or 2.0) ^ 2) then
                    near = true
                    break
                end
            end
        end
        setSource('zone', near)
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    battery.setCharging(false)
end)
