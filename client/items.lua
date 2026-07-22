---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Notify bridge (bridge.client.notify): backend-agnostic on-screen toasts.
local notify = require 'bridge.client.notify'

---True when the inventory "SIM Tray" button / stash path is live (ox + UseContainers, not eSIM).
---@return boolean
local function simTrayEnabled()
    return config.Sim
        and config.Sim.Enabled ~= false
        and config.Sim.UseContainers == true
        and config.Sim.BuiltInNumbers ~= true
end

---ox_inventory client.export for every configured phone item: USE opens the phone UI (and
---marks that slot active). Distinct from the "SIM Tray" inventory button, which opens the
---per-device stash without opening the phone.
---@param _itemData table ox item definition (unused; colour comes from the slot's item name)
---@param slotData { name: string, slot: number, metadata: table }
local function usePhone(_itemData, slotData)
    if type(slotData) ~= 'table' then return end
    local slot = tonumber(slotData.slot)
    local name = slotData.name
    if not slot or type(name) ~= 'string' then return end
    TriggerServerEvent('sd-phone:server:usePhoneItem', slot, name)
end

---ox_inventory buttons[].action(slot) / export: opens the SIM tray for that phone slot.
---Only meaningful when UseContainers is on and the item def includes the SIM Tray button
---(see configs/ox_inventory_items.lua — two item variants).
---@param slotOrNil number|nil slot when called from buttons[].action
---@param context { slot?: number }|nil optional context from export-style calls
local function openSimTray(slotOrNil, context)
    if not simTrayEnabled() then
        notify.show({
            description = 'SIM trays are disabled. Use the SIM card item to install a number.',
            type = 'error',
        })
        return
    end

    local slot = tonumber(slotOrNil)
    if not slot and type(context) == 'table' then slot = tonumber(context.slot) end
    if not slot then
        notify.show({ description = 'Could not open the SIM tray.', type = 'error' })
        return
    end

    local hadFocus = exports['sd-phone']:isOpen()
    if hadFocus then SetNuiFocus(false, false) end

    local res = lib.callback.await('sd-phone:server:sim:openTray', false, { slot = slot })
    if not res or not res.success then
        notify.show({ description = (res and res.message) or 'Could not open the SIM tray.', type = 'error' })
        if hadFocus and exports['sd-phone']:isOpen() then SetNuiFocus(true, true) end
        return
    end

    if hadFocus then
        CreateThread(function()
            while LocalPlayer.state.invOpen do Wait(150) end
            Wait(100)
            if exports['sd-phone']:isOpen() then SetNuiFocus(true, true) end
        end)
    end
end

exports('usePhone', usePhone)
exports('openSimTray', openSimTray)

---ox client.export for sim_card: forwards to the server usable (blank cards mint a number).
---Kept as a client entry-point so USE always reaches sd-phone even if server.export is missing
---from a custom items.lua.
---@param _itemData table
---@param slotData { name: string, slot: number, metadata: table }
local function useSimCard(_itemData, slotData)
    if type(slotData) ~= 'table' then return end
    local slot = tonumber(slotData.slot)
    if not slot then return end
    TriggerServerEvent('sd-phone:server:useSimItem', slot)
end

exports('useSimCard', useSimCard)

-- Coloured variants share the same open path; ox items point each name at usePhone.
for _, entry in ipairs(config.Phone.Items or {}) do
    if entry.item ~= 'phone' then
        -- Export name must match bridge registerUsable's 'use' .. Item pattern for server
        -- registration; client.export in items.lua should still use 'sd-phone.usePhone'.
        local exportName = 'use' .. entry.item:gsub('^%l', string.upper)
        exports(exportName, usePhone)
    end
end

return {
    usePhone    = usePhone,
    openSimTray = openSimTray,
    useSimCard  = useSimCard,
}
