---@type table Framework bridge (bridge.shared.framework): detected core name ('qb'/'esx') + live core object.
local framework    = require 'bridge.shared.framework'
---@type table Shared inventory detection (bridge.shared.inventory_id): first started supported inventory's name + candidate list.
local inventoryId  = require 'bridge.shared.inventory_id'

---@type table Inventory module; the table returned at end of file. Client-side inventory bridge:
---item-count lookups, item label resolution, NUI image-path resolution, and ox_inventory's
---display-metadata feature.
local inventory = { system = inventoryId.name }

---Picks the image-path resolver for the active inventory, once at module load. With no inventory
---detected, every lookup resolves to nil.
---@return fun(item: string): string|nil
local function chooseImageResolver()
    local active = inventoryId.name
    if not active then return function() return nil end end

    if active == 'ox_inventory' then
        local root = GetConvar('inventory:imagepath', 'nui://ox_inventory/web/images')
        return function(item)
            return ('%s/%s.png'):format(root, item)
        end
    end

    if active == 'tgiann-inventory' then
        local imageResource = GetResourceState('inventory_images') == 'started' and 'inventory_images' or active
        local imagePath = imageResource == 'inventory_images' and 'images' or 'web/images'
        return function(item)
            local ok, itemData = pcall(exports['tgiann-inventory'].Items, exports['tgiann-inventory'], item)
            if ok and itemData then
                local raw = (itemData.client and itemData.client.image) or itemData.image
                if raw then
                    if raw:match('^nui://') or raw:match('^https?://') then return raw end
                    return ('nui://%s/%s/%s'):format(imageResource, imagePath, raw)
                end
            end
            return ('nui://%s/%s/%s.png'):format(imageResource, imagePath, item)
        end
    end

    if active == 'jaksam_inventory' then
        return function(item)
            local p = exports.jaksam_inventory:getItemImagePath(item)
            return p or ('nui://%s/web/images/%s.png'):format(active, item)
        end
    end

    if active == 'codem-inventory' then
        return function(item) return ('nui://%s/html/itemimages/%s.png'):format(active, item) end
    end

    if active == 'origen_inventory' then
        return function(item) return ('nui://%s/ui/images/%s.png'):format(active, item) end
    end

    return function(item) return ('nui://%s/html/images/%s.png'):format(active, item) end
end

---@type fun(item: string): string|nil Backend-specific image-path resolver, chosen once at load.
local resolveImage = chooseImageResolver()
---@type table<string, string> Per-item resolved image paths (successful lookups only).
local imageCache = {}

---Returns the NUI image path for an item, cached per item.
---@param item string
---@return string|nil
function inventory.image(item)
    if not item then return nil end
    local cached = imageCache[item]
    if cached ~= nil then return cached end

    local resolved = resolveImage(item)
    imageCache[item] = resolved
    return resolved
end

---Drops the in-memory image cache.
function inventory.clearImageCache() imageCache = {} end

---Pre-warms the image cache. Accepts arrays of strings, of `{item=...}` rows, or of `{name=...}`
---/ `{id=...}` rows.
---@param items table
function inventory.preCacheImages(items)
    if not items then return end
    for i = 1, #items do
        local v = items[i]
        if type(v) == 'string' then
            inventory.image(v)
        elseif type(v) == 'table' then
            inventory.image(v.item or v.name or v.id)
        end
    end
end

---Picks the item-label resolver for the active inventory, once at module load. Falls back to
---qb-core's Shared.Items table when no supported inventory export exists, then to a constant nil.
---@return fun(itemName: string): string|nil
local function chooseLabelResolver()
    local active = inventoryId.name
    if active == 'ox_inventory' or active == 'tgiann-inventory' then
        return function(itemName)
            local ok, item = pcall(exports[active].Items, exports[active], itemName)
            return (ok and item) and item.label or nil
        end
    end
    if active == 'jaksam_inventory' then
        return function(itemName)
            local ok, label = pcall(exports[active].getItemLabel, exports[active], itemName)
            return ok and label or nil
        end
    end
    if active == 'origen_inventory' then
        return function(itemName)
            local ok, label = pcall(exports[active].GetItemLabel, exports[active], itemName)
            return ok and label or nil
        end
    end

    if framework.name == 'qb' and framework.core and framework.core.Shared and framework.core.Shared.Items then
        return function(itemName)
            local item = framework.core.Shared.Items[itemName]
            return item and item.label or nil
        end
    end
    return function() return nil end
end

---@type fun(itemName: string): string|nil Backend-specific label resolver, chosen once at load.
local resolveLabel = chooseLabelResolver()
---@type table<string, string|false> Per-item labels; false = negative-cached "backend doesn't know it".
local labelCache = {}

---Returns the player-readable label for an item key (e.g. `lockpick` -> `Lockpick`).
---Missing-label results are negatively cached.
---@param itemName string
---@return string|nil
function inventory.label(itemName)
    if not itemName then return nil end
    local cached = labelCache[itemName]
    if cached ~= nil then return cached == false and nil or cached end

    local label = resolveLabel(itemName)
    labelCache[itemName] = label or false
    return label
end

---Picks the item-count resolver for the active inventory, once at module load. Falls back to
---walking the framework's own player-data item list, then to a constant 0.
---@return fun(item: string): number
local function chooseCountResolver()
    local active = inventoryId.name

    if active == 'ox_inventory' then
        return function(item) return exports.ox_inventory:Search('count', item) or 0 end
    end
    if active == 'tgiann-inventory' then
        return function(item) return exports['tgiann-inventory']:GetItemCount(item) or 0 end
    end
    if active == 'jaksam_inventory' then
        return function(item) return exports.jaksam_inventory:getTotalItemAmount(item) or 0 end
    end
    if active == 'origen_inventory' then
        return function(item) return exports.origen_inventory:getItemCount(item) or 0 end
    end
    if active == 'codem-inventory' then
        return function(item) return exports['codem-inventory']:GetItemsTotalAmount(item) or 0 end
    end
    if active == 'qs-inventory' or active == 'qs-inventory-pro' then
        return function(item) return exports[active]:GetItemTotalAmount(item) or 0 end
    end

    if framework.name == 'qb' then
        return function(item)
            local data = framework.core.Functions.GetPlayerData()
            if not data or not data.items then return 0 end
            local total = 0
            for _, slot in pairs(data.items) do
                if slot and slot.name == item then
                    total = total + (slot.amount or slot.count or 0)
                end
            end
            return total
        end
    end
    if framework.name == 'esx' then
        return function(item)
            local data = framework.core.GetPlayerData()
            if not data or not data.inventory then return 0 end
            for _, slot in pairs(data.inventory) do
                if slot and slot.name == item then return slot.count or 0 end
            end
            return 0
        end
    end
    return function() return 0 end
end

---@type fun(item: string): number Backend-specific count resolver, chosen once at load.
local resolveCount = chooseCountResolver()

---Returns the count of `item` in the player's inventory (0 if missing). Not cached.
---@param item string
---@return number
function inventory.count(item)
    if not item then return 0 end
    return resolveCount(item) or 0
end

---Predicate form - true if the player has at least `amount` of `item`.
---@param item string
---@param amount? number Defaults to 1.
---@return boolean
function inventory.has(item, amount)
    if not item then return false end
    return inventory.count(item) >= (amount or 1)
end

---Register metadata display labels in ox_inventory's tooltip layer. A no-op (false) on
---inventories that don't support the feature, and on an empty/missing metadata table.
---@param metadata table<string, string>
---@return boolean ok
function inventory.registerDisplayMetadata(metadata)
    if inventoryId.name ~= 'ox_inventory' then return false end
    if not metadata or not next(metadata) then return false end
    exports.ox_inventory:displayMetadata(metadata)
    return true
end

return inventory
