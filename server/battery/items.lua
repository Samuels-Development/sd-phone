---@type table Main config (configs.config).
local config = require 'configs.config'
---@type table Battery policy (server.battery.actions).
local actions = require 'server.battery.actions'
---@type table Inventory bridge (bridge.server.inventory): usable registration + removal.
local inv = require 'bridge.server.inventory'

local items = {}

---@type table<number, boolean> Sources mid-ramp, so a spammed power bank cannot stack charges.
local ramping = {}

---Applies a power bank's charge, instantly or ramped one percent at a time.
---@param source number player server id
local function usePowerBank(source)
    local cfg = config.Battery.PowerBank
    if ramping[source] then return end

    if (cfg.Seconds or 0) <= 0 then
        actions.charge(source, cfg.Charge)
        return
    end

    ramping[source] = true
    local step = math.max(1, math.floor(cfg.Seconds / math.max(1, cfg.Charge)))
    CreateThread(function()
        for _ = 1, cfg.Charge do
            Wait(step * 1000)
            if not ramping[source] then return end
            actions.charge(source, 1)
        end
        ramping[source] = nil
    end)
end

AddEventHandler('playerDropped', function()
    ramping[source] = nil
end)

CreateThread(function()
    if not config.Battery or not config.Battery.Enabled then return end

    local bank = config.Battery.PowerBank
    if bank and bank.Enabled then
        inv.registerUsable(bank.Item, function(source)
            usePowerBank(source)
            if bank.Consume then inv.remove(source, bank.Item, 1) end
        end)
    end

    local cable = config.Battery.Cable
    if cable and cable.Enabled then
        inv.registerUsable(cable.Item, function(source)
            TriggerClientEvent('sd-phone:client:battery:cable', source)
        end)
    end
end)

return items
