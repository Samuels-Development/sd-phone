---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Cell tower settings (configs/celltowers.lua).
local cfg = config.CellTowers or {}
---@type table Blip settings; nothing is drawn unless Enabled is explicitly true.
local blipCfg = type(cfg.Blips) == 'table' and cfg.Blips or {}
---@type table Coverage circle settings, on unless turned off.
local radiusCfg = type(blipCfg.Radius) == 'table' and blipCfg.Radius or {}

---@type integer[] Handles for every blip drawn here, kept so a resource stop can clear them.
local created = {}

---Draws a marker on each mast plus its coverage circle. The tower list is static config, so this
---runs once rather than on a tick.
local function drawTowerBlips()
    for _, entry in ipairs(type(cfg.Towers) == 'table' and cfg.Towers or {}) do
        local pos   = type(entry) == 'table' and entry.tower or nil
        local range = tonumber(type(entry) == 'table' and entry.range or nil)
        if pos and range and range > 0 then
            -- Sized from the tower's own range rather than a separate setting, so what the map
            -- shows can never disagree with the service the maths hands out.
            if radiusCfg.Enabled ~= false then
                local circle = AddBlipForRadius(pos.x, pos.y, pos.z, range + 0.0)
                SetBlipHighDetail(circle, true)
                SetBlipColour(circle, math.floor(tonumber(radiusCfg.Color) or 3))
                SetBlipAlpha(circle, math.floor(tonumber(radiusCfg.Alpha) or 80))
                created[#created + 1] = circle
            end

            local marker = AddBlipForCoord(pos.x, pos.y, pos.z)
            SetBlipSprite(marker, math.floor(tonumber(blipCfg.Sprite) or 1))
            SetBlipColour(marker, math.floor(tonumber(blipCfg.Color) or 3))
            SetBlipScale(marker, tonumber(blipCfg.Scale) or 0.8)
            SetBlipAsShortRange(marker, true)
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentString(tostring(blipCfg.Label or 'Cell Tower'))
            EndTextCommandSetBlipName(marker)
            created[#created + 1] = marker
        end
    end
end

if blipCfg.Enabled == true then
    CreateThread(drawTowerBlips)
end

---Clears the blips when sd-phone stops, so restarting the resource never stacks a second set of
---circles on top of the first.
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for i = 1, #created do RemoveBlip(created[i]) end
    created = {}
end)
