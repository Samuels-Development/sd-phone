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

-- ---------------------------------------------------------------------------
-- Slot-level API (per-slot metadata). Unlike the aggregate operations above,
-- these are resolved at CALL time: ox_inventory latches on as soon as it is
-- running (load order can hide it from the boot-time detection, and on QBox
-- the PlayerData.items table is only a stale mirror of ox), and the QBCore
-- items-table path is the fallback for qb-family inventories without ox.
-- Backends are added in SLOT_BACKENDS; a backend absent there simply reports
-- slot metadata as unsupported.
-- ---------------------------------------------------------------------------

---@class SlotEntry
---@field slot number|string inventory slot id (numeric on most backends, "SLOT-n" on jaksam)
---@field name string item name
---@field count number stack count
---@field metadata table per-slot metadata (never nil)

---@type boolean Latched true the first time ox_inventory is seen running.
local slotOx = active == OX

---@type string Sentinel backend: no inventory resource, framework-native QBCore items table.
local QBCORE = 'qb-core'

---The slot-API backend for this call: the SLOT_BACKENDS key to dispatch to, or nil when no
---slot-metadata path exists (plain ESX inventory).
---@return string|nil
local function slotBackend()
    if slotOx then return OX end
    if GetResourceState(OX) == 'started' then
        slotOx = true
        return OX
    end
    if active then return active end
    if framework.name == 'qb' then return QBCORE end
    return nil
end

---Normalizes one backend row into a SlotEntry; nil for unusable rows. Slot ids stay strings on
---backends that use them (jaksam's "SLOT-n").
---@param slot any slot id
---@param name any item name
---@param count any stack count
---@param metadata any metadata table
---@return SlotEntry|nil
local function slotEntry(slot, name, count, metadata)
    slot = tonumber(slot) or slot
    if slot == nil or type(name) ~= 'string' then return nil end
    return {
        slot     = slot,
        name     = name,
        count    = tonumber(count) or 1,
        metadata = type(metadata) == 'table' and metadata or {},
    }
end

---Coerces a caller-supplied slot id: numeric where possible, strings passed through.
---@param slot any
---@return number|string|nil
local function coerceSlot(slot)
    return tonumber(slot) or (type(slot) == 'string' and slot ~= '' and slot or nil)
end

---QBCore PlayerData.items scan shared by the qb-family backends (qb-inventory / ps / lj keep
---the player object's items table authoritative).
---@param src number player server id
---@return table<any, any>|nil items
local function qbItems(src)
    local p = player_mod.get(src)
    local items = p and p.PlayerData and p.PlayerData.items
    return type(items) == 'table' and items or nil
end

---Per-backend slot-API implementations. Each entry may provide:
---  search(src, item) -> SlotEntry[]        every slot holding `item`
---  get(src, slot) -> SlotEntry|nil         one slot
---  setMetadata(src, slot, metadata) -> ok  overwrite a slot's metadata
---  removeFromSlot(src, item, slot, count) -> ok
---  containerItems(src, slot) -> table|nil  items inside a container item's inventory
---@type table<string, table>
local SLOT_BACKENDS = {
    [OX] = {
        search = function(src, item)
            local out = {}
            local slots = exports[OX]:Search(src, 'slots', item)
            if type(slots) == 'table' then
                for _, row in pairs(slots) do
                    out[#out + 1] = slotEntry(row.slot, row.name or item, row.count, row.metadata)
                end
            end
            return out
        end,
        get = function(src, slot)
            local row = exports[OX]:GetSlot(src, slot)
            if not row then return nil end
            return slotEntry(row.slot or slot, row.name, row.count, row.metadata)
        end,
        setMetadata = function(src, slot, metadata)
            return pcall(function() exports[OX]:SetMetadata(src, slot, metadata) end)
        end,
        removeFromSlot = function(src, item, slot, count)
            local ok, res = pcall(function()
                return exports[OX]:RemoveItem(src, item, count or 1, nil, slot)
            end)
            return ok and res == true
        end,
        containerItems = function(src, slot)
            local ok, container = pcall(function()
                return exports[OX]:GetContainerFromSlot(src, slot)
            end)
            if not ok or not container or type(container.items) ~= 'table' then return nil end
            return container.items
        end,
    },

    -- Framework-native fallback: no inventory resource, items live on the player object.
    [QBCORE] = {
        search = function(src, item)
            local out = {}
            local items = qbItems(src)
            if not items then return out end
            for slot, row in pairs(items) do
                if row and row.name == item then
                    out[#out + 1] = slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info)
                end
            end
            return out
        end,
        get = function(src, slot)
            local items = qbItems(src)
            local row = items and items[slot]
            if not row then return nil end
            return slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info)
        end,
        setMetadata = function(src, slot, metadata)
            local p = player_mod.get(src)
            local items = p and p.PlayerData and p.PlayerData.items
            local row = items and items[slot]
            if not row then return false end
            row.info = metadata
            local ok = pcall(function()
                if p.Functions.SetInventory then
                    p.Functions.SetInventory(items)
                else
                    p.Functions.SetPlayerData('items', items)
                end
            end)
            return ok
        end,
        removeFromSlot = function(src, item, slot, count)
            local p = player_mod.get(src)
            if not p then return false end
            local ok, res = pcall(function() return p.Functions.RemoveItem(item, count or 1, slot) end)
            return ok and res ~= false
        end,
    },
}

-- Current qb-inventory: proper slot exports (GetItemBySlot / SetItemData with a slot arg /
-- RemoveItem with a slot arg). No player-inventory getter export, so search scans the player
-- object's items table.
SLOT_BACKENDS[QB] = {
    search = SLOT_BACKENDS[QBCORE].search,
    get = function(src, slot)
        local row = exports[QB]:GetItemBySlot(src, slot)
        if not row then return nil end
        return slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info)
    end,
    setMetadata = function(src, slot, metadata)
        local row = exports[QB]:GetItemBySlot(src, slot)
        if not row or not row.name then return false end
        return pcall(function() exports[QB]:SetItemData(src, row.name, 'info', metadata, slot) end)
    end,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports[QB]:RemoveItem(src, item, count or 1, slot) end)
        return ok and res ~= false
    end,
}

-- ps-inventory / lj-inventory (pre-rewrite qb forks): their SetItemData has NO slot parameter
-- (first-match by name), so metadata writes go through the player object like the qb-core
-- fallback; slot-precise reads/removal use their exports.
SLOT_BACKENDS['ps-inventory'] = {
    search         = SLOT_BACKENDS[QBCORE].search,
    get            = SLOT_BACKENDS[QBCORE].get,
    setMetadata    = SLOT_BACKENDS[QBCORE].setMetadata,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports['ps-inventory']:RemoveItem(src, item, count or 1, slot) end)
        return ok and res ~= false
    end,
}
SLOT_BACKENDS['lj-inventory'] = {
    search         = SLOT_BACKENDS[QBCORE].search,
    get            = SLOT_BACKENDS[QBCORE].get,
    setMetadata    = SLOT_BACKENDS[QBCORE].setMetadata,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports['lj-inventory']:RemoveItem(src, item, count or 1, slot) end)
        return ok and res ~= false
    end,
}

-- origen_inventory: slot-based setMetadata/removeItem; the player snapshot getter's envelope
-- shape varies across builds, so search tolerates both {inventory = {...}} and flat tables.
SLOT_BACKENDS[OG] = {
    search = function(src, item)
        local out = {}
        local ok, snapshot = pcall(function() return exports[OG]:GetPlayerInventory(src) end)
        if not ok or type(snapshot) ~= 'table' then return out end
        local items = snapshot.inventory or snapshot.items or snapshot
        if type(items) ~= 'table' then return out end
        for slot, row in pairs(items) do
            if type(row) == 'table' and row.name == item then
                out[#out + 1] = slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info or row.metadata)
            end
        end
        return out
    end,
    get = function(src, slot)
        local ok, row = pcall(function() return exports[OG]:getSlot(src, slot) end)
        if not ok or not row then
            ok, row = pcall(function() return exports[OG]:GetItemBySlot(src, slot) end)
            if not ok then return nil end
        end
        if not row then return nil end
        return slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info or row.metadata)
    end,
    setMetadata = function(src, slot, metadata)
        local ok, res = pcall(function() return exports[OG]:setMetadata(src, slot, metadata) end)
        return ok and res ~= false
    end,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports[OG]:removeItem(src, item, count or 1, slot) end)
        return ok and res ~= false
    end,
}

-- jaksam_inventory: slot ids are strings ("SLOT-n"); getItemsByName returns each match's slot,
-- setItemMetadataInSlot/removeItem are slot-based (metadata filter arg left nil).
SLOT_BACKENDS[JK] = {
    search = function(src, item)
        local out = {}
        local ok, rows = pcall(function() return exports[JK]:getItemsByName(src, item) end)
        if not ok or type(rows) ~= 'table' then return out end
        for _, row in pairs(rows) do
            if type(row) == 'table' then
                out[#out + 1] = slotEntry(row.slot, row.name or item, row.amount or row.count, row.metadata or row.info)
            end
        end
        return out
    end,
    get = function(src, slot)
        local ok, row = pcall(function() return exports[JK]:getItemFromSlot(src, slot) end)
        if not ok or type(row) ~= 'table' then return nil end
        return slotEntry(slot, row.name, row.amount or row.count, row.metadata)
    end,
    setMetadata = function(src, slot, metadata)
        local ok, res = pcall(function() return exports[JK]:setItemMetadataInSlot(src, slot, metadata) end)
        return ok and res ~= false
    end,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports[JK]:removeItem(src, item, count or 1, nil, slot) end)
        return ok and res ~= false
    end,
}

-- qs-inventory: GetInventory returns {[slot] = {name, amount, info}}; SetItemMetadata and
-- RemoveItem are natively slot-based.
SLOT_BACKENDS[QS] = {
    search = function(src, item)
        local out = {}
        local items = exports[QS]:GetInventory(src)
        if type(items) ~= 'table' then return out end
        for slot, row in pairs(items) do
            if row and row.name == item then
                out[#out + 1] = slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info or row.metadata)
            end
        end
        return out
    end,
    get = function(src, slot)
        local items = exports[QS]:GetInventory(src)
        local row = type(items) == 'table' and items[slot] or nil
        if not row then return nil end
        return slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info or row.metadata)
    end,
    setMetadata = function(src, slot, metadata)
        return pcall(function() exports[QS]:SetItemMetadata(src, slot, metadata) end)
    end,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports[QS]:RemoveItem(src, item, count or 1, slot) end)
        return ok and res ~= false
    end,
}
SLOT_BACKENDS[QSP] = SLOT_BACKENDS[QS]

-- tgiann-inventory: qb-inventory drop-in; metadata is `info`, UpdateItemMetadata needs the
-- item name alongside the slot (resolved via GetItemBySlot).
SLOT_BACKENDS[TG] = {
    search = function(src, item)
        local out = {}
        local rows = exports[TG]:GetItemsByName(src, item)
        if type(rows) ~= 'table' then return out end
        for _, row in pairs(rows) do
            if row then
                out[#out + 1] = slotEntry(row.slot, row.name or item, row.amount or row.count, row.info or row.metadata)
            end
        end
        return out
    end,
    get = function(src, slot)
        local row = exports[TG]:GetItemBySlot(src, slot)
        if not row then return nil end
        return slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info or row.metadata)
    end,
    setMetadata = function(src, slot, metadata)
        local row = exports[TG]:GetItemBySlot(src, slot)
        if not row or not row.name then return false end
        return pcall(function() exports[TG]:UpdateItemMetadata(src, row.name, slot, metadata) end)
    end,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports[TG]:RemoveItem(src, item, count or 1, slot) end)
        return ok and res ~= false
    end,
}

-- codem-inventory: GetItemBySlot / SetItemMetadata / RemoveItem are slot-based; the full
-- inventory getter wants the stored identifier, so search goes through the real citizenid.
SLOT_BACKENDS[CD] = {
    search = function(src, item)
        local out = {}
        local cid = player_mod.getRealIdentifier(src)
        if not cid then return out end
        local items = exports[CD]:GetInventory(cid, src)
        if type(items) ~= 'table' then return out end
        for slot, row in pairs(items) do
            if row and row.name == item then
                out[#out + 1] = slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info or row.metadata)
            end
        end
        return out
    end,
    get = function(src, slot)
        local row = exports[CD]:GetItemBySlot(src, slot)
        if not row then return nil end
        return slotEntry(row.slot or slot, row.name, row.amount or row.count, row.info or row.metadata)
    end,
    setMetadata = function(src, slot, metadata)
        return pcall(function() exports[CD]:SetItemMetadata(src, slot, metadata) end)
    end,
    removeFromSlot = function(src, item, slot, count)
        local ok, res = pcall(function() return exports[CD]:RemoveItem(src, item, count or 1, slot) end)
        return ok and res ~= false
    end,
}

---The active slot-API implementation table, nil when unsupported.
---@return table|nil
local function slotImpl()
    local backend = slotBackend()
    return backend and SLOT_BACKENDS[backend] or nil
end

---True when the running inventory supports per-slot metadata reads/writes.
---@return boolean
function inventory.supportsSlotMetadata()
    local impl = slotImpl()
    return impl ~= nil and impl.setMetadata ~= nil
end

---The resolved slot-API backend name (resource name or 'qb-inventory' fallback), nil when none.
---@return string|nil
function inventory.slotBackendName()
    return slotBackend()
end

---Every slot holding `item` in a player's inventory, with metadata. Empty on unsupported
---backends.
---@param source number player server id
---@param item string item name
---@return SlotEntry[]
function inventory.searchSlots(source, item)
    local impl = slotImpl()
    if not impl or not impl.search then return {} end
    local ok, res = pcall(impl.search, source, item)
    return (ok and type(res) == 'table') and res or {}
end

---One inventory slot with metadata, nil when empty or unsupported.
---@param source number player server id
---@param slot number|string slot id
---@return SlotEntry|nil
function inventory.getSlot(source, slot)
    local impl = slotImpl()
    local sid = coerceSlot(slot)
    if not impl or not impl.get or sid == nil then return nil end
    local ok, res = pcall(impl.get, source, sid)
    return ok and res or nil
end

---Overwrites a slot's metadata table. False on unsupported backends or a missing slot.
---@param source number player server id
---@param slot number|string slot id
---@param metadata table full metadata table to store
---@return boolean ok
function inventory.setSlotMetadata(source, slot, metadata)
    local impl = slotImpl()
    local sid = coerceSlot(slot)
    if not impl or not impl.setMetadata or sid == nil then return false end
    local ok, res = pcall(impl.setMetadata, source, sid, metadata)
    return ok and res == true
end

---Removes `count` (default 1) of `item` from a specific slot. False on failure.
---@param source number player server id
---@param item string item name
---@param slot number|string slot id
---@param count? number
---@return boolean ok
function inventory.removeFromSlot(source, item, slot, count)
    local impl = slotImpl()
    local sid = coerceSlot(slot)
    if not impl or not impl.removeFromSlot or sid == nil then return false end
    local ok, res = pcall(impl.removeFromSlot, source, item, sid, count)
    return ok and res == true
end

---Items inside the container attached to a player's slot (ox_inventory containers). Nil when
---the backend has no container support or the slot has no container.
---@param source number player server id
---@param slot number|string slot id
---@return table|nil items
function inventory.containerItems(source, slot)
    local impl = slotImpl()
    local sid = coerceSlot(slot)
    if not impl or not impl.containerItems or sid == nil then return nil end
    local ok, res = pcall(impl.containerItems, source, sid)
    return ok and res or nil
end

return inventory
