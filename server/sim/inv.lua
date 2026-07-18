---@type table sd-phone config root (configs/config.lua).
local config      = require 'configs.config'
---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + core handle.
local framework   = require 'bridge.shared.framework'
---@type table Inventory resource detection (bridge.shared.inventory_id): first-started candidate.
local inventoryId = require 'bridge.shared.inventory_id'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod  = require 'bridge.server.player'
---@type table Shared server helpers (server.util): digits/formatNumber.
local util        = require 'server.util'

---@type table Inv module; the table returned at end of file. Slot-level inventory access for the
---SIM feature: find phone items, read/write the SIM metadata on them, and (container mode) read
---the SIM out of a phone's ox_inventory container. Kept separate from bridge/server/inventory so
---the aggregate bridge stays backend-agnostic; new backends plug in here.
local inv = {}

---@type string ox_inventory resource name.
local OX = 'ox_inventory'

---@type table<string, string> Phone item name -> frame colour, built from config.Phone.Items.
local phoneColors = {}
for _, entry in ipairs(config.Phone.Items or {}) do phoneColors[entry.item] = entry.color end

---@type boolean Latched true the first time ox_inventory is seen running.
local resolvedOx = inventoryId.name == OX

---Which slot-metadata backend is usable: 'ox' for ox_inventory, 'qb' for any inventory that
---keeps items in the QBCore PlayerData.items table (qb-inventory / ps-inventory / lj-inventory),
---nil when per-slot metadata can't be reached (feature must stay off). Resolved at CALL time,
---and ox wins whenever it is running: load-order can hide ox from the boot-time detection, and
---on QBox the PlayerData.items table is a stale mirror of ox that must never be trusted.
---@return 'ox'|'qb'|nil
function inv.backend()
    if resolvedOx then return 'ox' end
    if GetResourceState(OX) == 'started' then
        resolvedOx = true
        return 'ox'
    end
    if framework.name == 'qb' then return 'qb' end
    return nil
end

---All phone items the player carries, as { slot, name, color, metadata } rows ordered by the
---config.Phone.Items priority then slot id. Metadata is never nil.
---@param source number player server id
---@return { slot: number, name: string, color: string, metadata: table }[]
function inv.findPhones(source)
    local out = {}
    local backend = inv.backend()

    if backend == 'ox' then
        for _, entry in ipairs(config.Phone.Items or {}) do
            local slots = exports[OX]:Search(source, 'slots', entry.item)
            if type(slots) == 'table' then
                for _, row in pairs(slots) do
                    out[#out + 1] = {
                        slot     = row.slot,
                        name     = entry.item,
                        color    = entry.color,
                        metadata = row.metadata or {},
                    }
                end
            end
        end
        return out
    end

    if backend == 'qb' then
        local p = player_mod.get(source)
        local items = p and p.PlayerData and p.PlayerData.items
        if type(items) ~= 'table' then return out end
        for _, entry in ipairs(config.Phone.Items or {}) do
            for slot, item in pairs(items) do
                if item and item.name == entry.item then
                    out[#out + 1] = {
                        slot     = tonumber(item.slot) or tonumber(slot),
                        name     = entry.item,
                        color    = entry.color,
                        metadata = item.info or {},
                    }
                end
            end
        end
        return out
    end

    return out
end

---The SIM number installed in one phone row from findPhones, honouring the configured attach
---mode: container mode reads the sim_card item inside the phone's ox container, metadata mode
---reads the number written onto the phone item itself. Read-only.
---@param source number player server id
---@param phone { slot: number, metadata: table }
---@return string|nil number bare-digit SIM number, nil when no SIM is installed
function inv.getSimNumber(source, phone)
    if config.Sim.UseContainers and inv.backend() == 'ox' then
        if not phone.metadata or not phone.metadata.container then return nil end
        local ok, container = pcall(function()
            return exports[OX]:GetContainerFromSlot(source, phone.slot)
        end)
        if not ok or not container or type(container.items) ~= 'table' then return nil end
        for _, item in pairs(container.items) do
            if item and item.name == config.Sim.SimItem and item.metadata then
                local digits = util.digits(item.metadata.number)
                if digits ~= '' then return digits end
            end
        end
        return nil
    end

    local digits = util.digits(phone.metadata and phone.metadata.simNumber)
    return digits ~= '' and digits or nil
end

---Writes (or clears, with nil) the SIM number onto a phone item's metadata - metadata mode
---only. The ox path merges into the slot's existing metadata; the qb path mutates the item's
---`info` table and pushes the inventory back onto the player object.
---@param source number player server id
---@param slot number phone item slot
---@param number string|nil bare-digit SIM number, nil to eject
---@return boolean ok
function inv.setPhoneSim(source, slot, number)
    local backend = inv.backend()

    if backend == 'ox' then
        local slotData = exports[OX]:GetSlot(source, slot)
        if not slotData then return false end
        local metadata = slotData.metadata or {}
        metadata.simNumber   = number
        metadata.description = number and ('SIM: %s'):format(util.formatNumber(number)) or nil
        local ok = pcall(function() exports[OX]:SetMetadata(source, slot, metadata) end)
        return ok
    end

    if backend == 'qb' then
        local p = player_mod.get(source)
        local items = p and p.PlayerData and p.PlayerData.items
        local item = items and items[slot]
        if not item then return false end
        item.info = type(item.info) == 'table' and item.info or {}
        item.info.simNumber = number
        local ok = pcall(function()
            if p.Functions.SetInventory then
                p.Functions.SetInventory(items)
            else
                p.Functions.SetPlayerData('items', items)
            end
        end)
        return ok
    end

    return false
end

---Removes one sim_card item from a specific slot (the slot the use-callback reported), so the
---exact used item disappears rather than "a" matching stack.
---@param source number player server id
---@param slot number|nil sim item slot; nil falls back to a name-only removal
---@return boolean ok
function inv.takeSimItem(source, slot)
    local backend = inv.backend()
    local simItem = config.Sim.SimItem

    if backend == 'ox' then
        local ok, res = pcall(function()
            return exports[OX]:RemoveItem(source, simItem, 1, nil, slot)
        end)
        return ok and res == true
    end

    if backend == 'qb' then
        local p = player_mod.get(source)
        if not p then return false end
        local ok, res = pcall(function() return p.Functions.RemoveItem(simItem, 1, slot) end)
        return ok and res ~= false
    end

    return false
end

---Gives a sim_card item carrying `number` in its metadata (plus a human-readable description
---for inventories that display one).
---@param source number player server id
---@param number string bare-digit SIM number
---@return boolean ok
function inv.giveSimItem(source, number)
    local bridge = require 'bridge.server.inventory'
    return bridge.add(source, config.Sim.SimItem, 1, {
        number      = number,
        description = ('SIM: %s'):format(util.formatNumber(number)),
    }) == true
end

---Registers every configured phone item as a 1-slot ox container whitelisted to the SIM item.
---Container mode boot step; a no-op on other backends.
function inv.registerContainers()
    if inv.backend() ~= 'ox' then return end
    for _, entry in ipairs(config.Phone.Items or {}) do
        pcall(function()
            exports[OX]:setContainerProperties(entry.item, {
                slots     = 1,
                maxWeight = 1000,
                whitelist = { config.Sim.SimItem },
            })
        end)
    end
end

---@type table<string, string> Public copy of the phone item -> colour map.
inv.phoneColors = phoneColors

return inv
