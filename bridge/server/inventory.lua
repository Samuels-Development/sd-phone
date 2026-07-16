---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework   = require 'bridge.shared.framework'
---@type table Inventory resource detection (bridge.shared.inventory_id): first-started candidate.
local inventoryId = require 'bridge.shared.inventory_id'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod  = require 'bridge.server.player'

---@type table Inventory module; the table returned at end of file. Server-side inventory
---operations dispatcher, bound once at module load to the detected inventory resource. `system`
---exposes the detected resource name (nil = framework-native paths).
local inventory = { system = inventoryId.name }

-- Inventory resource name aliases.
---@type string ox_inventory resource name.
local OX = 'ox_inventory'
---@type string tgiann-inventory resource name.
local TG = 'tgiann-inventory'
---@type string jaksam_inventory resource name.
local JK = 'jaksam_inventory'
---@type string qb-inventory resource name.
local QB = 'qb-inventory'
---@type string qs-inventory-pro resource name.
local QSP = 'qs-inventory-pro'
---@type string qs-inventory resource name.
local QS = 'qs-inventory'
---@type string origen_inventory resource name.
local OG = 'origen_inventory'
---@type string codem-inventory resource name.
local CD = 'codem-inventory'

---@type string|nil Detected inventory resource; nil routes every chooser to the framework paths.
local active = inventoryId.name

---Pick the inventory backend's AddItem implementation once at module load. Dedicated backends
---return their own success signal; framework paths cover the rest; with no backend, always false.
---@return fun(source: number, item: string, count: number, metadata?: table): boolean
local function chooseAdd()
    if active == OX then
        return function(src, item, count, metadata) return exports[OX]:AddItem(src, item, count, metadata) end
    end
    if active == TG then
        return function(src, item, count, metadata) return exports[TG]:AddItem(src, item, count, metadata) end
    end
    if active == JK then
        return function(src, item, count, metadata)
            local ok = exports[JK]:addItem(src, item, count, metadata)
            return ok or false
        end
    end
    if active == CD then
        return function(src, item, count, metadata) return exports[CD]:AddItem(src, item, count, metadata) end
    end
    if active == QS or active == QSP then
        local inv = active
        return function(src, item, count, metadata) return exports[inv]:AddItem(src, item, count, nil, metadata) end
    end
    if active == OG then
        return function(src, item, count, metadata) return exports[OG]:addItem(src, item, count, metadata) end
    end
    if active == QB then
        return function(src, item, count, metadata) return exports[QB]:AddItem(src, item, count, metadata) end
    end

    if framework.name == 'esx' then
        return function(src, item, count, metadata)
            local p = player_mod.get(src)
            if not p then return false end
            p.addInventoryItem(item, count, metadata)
            return true
        end
    end
    if framework.name == 'qb' then
        return function(src, item, count, metadata)
            local p = player_mod.get(src)
            if not p then return false end
            return p.Functions.AddItem(item, count, nil, metadata)
        end
    end
    return function() return false end
end

---@type fun(source: number, item: string, count: number, metadata?: table): boolean Backend AddItem, bound once at load.
inventory.add = chooseAdd()

---Pick the inventory backend's count-of-item implementation once at module load. Read-only.
---Every path answers 0, never nil, when the player or item can't be resolved.
---@return fun(source: number, item: string): number
local function chooseCount()
    if active == OX then
        return function(src, item)
            local items = exports[OX]:Search(src, 'slots', item)
            if type(items) ~= 'table' then return 0 end
            local total = 0
            for _, row in pairs(items) do total = total + (row.count or 0) end
            return total
        end
    end
    if active == TG then return function(src, item) return exports[TG]:GetItemCount(src, item) or 0 end end
    if active == JK then return function(src, item) return exports[JK]:getTotalItemAmount(src, item) or 0 end end
    if active == CD then return function(src, item) return exports[CD]:GetItemsTotalAmount(src, item) or 0 end end
    if active == OG then return function(src, item) return exports[OG]:getItemCount(src, item, false, false) or 0 end end
    if active == QB then return function(src, item) return exports[QB]:GetItemCount(src, item) or 0 end end
    if active == QS or active == QSP then
        local inv = active
        return function(src, item) return exports[inv]:GetItemTotalAmount(src, item) or 0 end
    end

    if framework.name == 'esx' then
        return function(src, item)
            local p = player_mod.get(src); if not p then return 0 end
            local data = p.getInventoryItem(item)
            return data and (data.count or data.amount) or 0
        end
    end
    if framework.name == 'qb' then
        return function(src, item)
            local p = player_mod.get(src); if not p then return 0 end
            local data = p.Functions.GetItemByName(item)
            return data and (data.amount or data.count) or 0
        end
    end
    return function() return 0 end
end

---@type fun(source: number, item: string): number Backend item-count reader, bound once at load.
inventory.count = chooseCount()

---Predicate form of `count`: true when the player has at least `amount` of `item` (default 1).
---Fails closed on a nil item name.
---@param source number
---@param item string
---@param amount? number Defaults to 1.
---@return boolean
function inventory.has(source, item, amount)
    if not item then return false end
    return inventory.count(source, item) >= (amount or 1)
end

---Pick the inventory backend's RemoveItem implementation once at module load. Dedicated backends
---report their own result; the ESX path verifies the held count first; with no backend, always false.
---@return fun(source: number, item: string, count: number, metadata?: table): boolean
local function chooseRemove()
    if active == OX then
        return function(src, item, count, metadata) return exports[OX]:RemoveItem(src, item, count, metadata) end
    end
    if active == TG then
        return function(src, item, count, metadata) return exports[TG]:RemoveItem(src, item, count, metadata) end
    end
    if active == JK then
        return function(src, item, count, metadata)
            local ok = exports[JK]:removeItem(src, item, count, metadata)
            return ok or false
        end
    end
    if active == CD then
        return function(src, item, count, metadata) return exports[CD]:RemoveItem(src, item, count, metadata) end
    end
    if active == OG then
        return function(src, item, count, metadata) return exports[OG]:removeItem(src, item, count, metadata) end
    end
    if active == QB then
        return function(src, item, count, metadata) return exports[QB]:RemoveItem(src, item, count, metadata) end
    end
    if active == QS or active == QSP then
        local inv = active
        return function(src, item, count, metadata) return exports[inv]:RemoveItem(src, item, count, metadata) end
    end

    if framework.name == 'esx' then
        return function(src, item, count, metadata)
            local p = player_mod.get(src); if not p then return false end
            local data = p.getInventoryItem(item)
            local held = data and (data.count or data.amount) or 0
            if held < (tonumber(count) or 0) then return false end
            p.removeInventoryItem(item, count, metadata)
            return true
        end
    end
    if framework.name == 'qb' then
        return function(src, item, count, _metadata)
            local p = player_mod.get(src); if not p then return false end
            return p.Functions.RemoveItem(item, count)
        end
    end
    return function() return false end
end

---@type fun(source: number, item: string, count: number, metadata?: table): boolean Backend RemoveItem, bound once at load.
inventory.remove = chooseRemove()

---Pick the backend's carry check once at module load. codem always allows, ESX is answered with
---weight maths, and with no backend the answer is always false.
---@return fun(source: number, item: string, count: number, slot?: any): boolean
local function chooseCanCarry()
    if active == CD then
        return function() return true end
    end
    if active == OX then
        return function(src, item, count, metadata) return exports[OX]:CanCarryItem(src, item, count, metadata) end
    end
    if active == TG then
        return function(src, item, count) return exports[TG]:CanCarryItem(src, item, count) end
    end
    if active == JK then
        return function(src, item, count) return exports[JK]:canCarryItem(src, item, count) end
    end
    if active == OG then
        return function(src, item, count) return exports[OG]:canCarryItem(src, item, count) end
    end
    if active == QB then
        return function(src, item, count) return exports[QB]:CanAddItem(src, item, count) end
    end
    if active == QSP then
        return function(src, item, count) return exports[QSP]:CanCarryItem(src, item, count) end
    end
    if active == QS then
        return function(src, item, count) return exports[QS]:CanCarryItem(src, item, count) end
    end

    if framework.name == 'esx' then
        return function(src, item, count)
            local p = player_mod.get(src); if not p then return false end
            local current = p.getInventoryItem(item)
            if not current then return false end
            local maxW = p.getMaxWeight()
            local curW = p.getWeight()
            return curW + ((current.weight or 0) * count) <= maxW
        end
    end
    if framework.name == 'qb' then
        return function(src, item, count, slot)
            local p = player_mod.get(src); if not p then return false end
            return p.Functions.CanAddItem(item, count, slot)
        end
    end
    return function() return false end
end

---@type fun(source: number, item: string, count: number, slot?: any): boolean Backend carry check, bound once at load.
inventory.canCarry = chooseCanCarry()

---Pick the "register a usable item" implementation once at module load. The ox path derives a
---per-item export ('phone' -> 'usePhone'); with no path at all, registration errors at boot.
---@return fun(item: string, cb: fun(source: number, item?: any, inv?: table, slot?: any, data?: any)): nil
local function chooseRegisterUsable()
    if active == OX then
        return function(item, cb)
            local exportName = 'use' .. item:gsub('^%l', string.upper)
            exports(exportName, function(event, _item, inv, slot, data)
                if event == 'usingItem' then
                    cb(inv.id, _item, inv, slot, data)
                end
            end)
        end
    end
    if active == QSP then
        return function(item, cb) return exports[QSP]:CreateUsableItem(item, cb) end
    end
    if active == OG then
        return function(item, cb) return exports[OG]:CreateUseableItem(item, cb) end
    end

    if framework.name == 'esx' then
        return function(item, cb) return framework.core.RegisterUsableItem(item, cb) end
    end
    if framework.name == 'qb' then
        return function(item, cb) return framework.core.Functions.CreateUseableItem(item, cb) end
    end

    return function(item)
        error(('inventory.registerUsable: no supported registration path for item %q'):format(item))
    end
end

---@type fun(item: string, cb: function): nil Usable-item registrar, bound once at load.
inventory.registerUsable = chooseRegisterUsable()

---Pick the item-label resolver once at module load. Falls back to the framework's shared items
---table, then to the raw key.
---@return fun(itemName: string): string|nil
local function chooseLabel()
    if active == OX or active == TG then
        return function(itemName)
            local ok, item = pcall(exports[active].Items, exports[active], itemName)
            return (ok and item) and item.label or itemName
        end
    end
    if active == JK then
        return function(itemName) return exports[JK]:getItemLabel(itemName) or itemName end
    end
    if active == OG then
        return function(itemName) return exports[OG]:GetItemLabel(itemName) or itemName end
    end

    if framework.name == 'qb' then
        return function(itemName)
            local item = framework.core.Shared.Items[itemName]
            return item and item.label or itemName
        end
    end
    if framework.name == 'esx' then
        return function(itemName) return framework.core.GetItemLabel(itemName) or itemName end
    end
    return function(itemName) return itemName end
end

---@type fun(itemName: string): string|nil Label resolver, bound once at load.
local resolveLabel = chooseLabel()
---@type table<string, string> Resolved labels by item key.
local labelCache = {}

---The player-readable label for an item key, falling back to the raw key. Cached after first
---lookup; returns '' for a nil key.
---@param itemName string
---@return string
function inventory.label(itemName)
    if not itemName then return '' end
    local cached = labelCache[itemName]
    if cached ~= nil then return cached end

    local label = resolveLabel(itemName) or itemName
    labelCache[itemName] = label
    return label
end

return inventory
