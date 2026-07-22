---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Inventory bridge (bridge.server.inventory): aggregate + slot-level item ops.
local bridge = require 'bridge.server.inventory'
---@type table Shared server helpers (server.util): digits/formatNumber/newId.
local util   = require 'server.util'

---@type table Inv module; the table returned at end of file. SIM-feature glue over the bridge's
---slot-level API: find phone items, read/write the SIM number on them, and (container mode)
---read the SIM out of a per-device SIM-tray stash (or a legacy nested ox container).
local inv = {}

---@type string ox_inventory resource name (container mode is ox-only).
local OX = 'ox_inventory'

---@type string Prefix for per-device SIM-tray stashes (ox RegisterStash).
local STASH_PREFIX = 'sd_phone_sim_'

---@type table<string, string> Phone item name -> frame colour, built from config.Phone.Items.
local phoneColors = {}
for _, entry in ipairs(config.Phone.Items or {}) do phoneColors[entry.item] = entry.color end

---True when the running inventory can carry the SIM feature (per-slot metadata reachable).
---@return boolean
function inv.supported()
    return bridge.supportsSlotMetadata()
end

---The resolved slot-backend name, for boot logging.
---@return string|nil
function inv.backendName()
    return bridge.slotBackendName()
end

---True while ox_inventory is the live slot backend (container mode + hooks requirement).
---@return boolean
function inv.isOx()
    return bridge.slotBackendName() == OX
end

---Stash id for a phone's SIM tray. Device ids may contain punctuation; sanitize for ox.
---@param deviceId string
---@return string
function inv.simStashId(deviceId)
    return STASH_PREFIX .. tostring(deviceId):gsub('[^%w]', '_')
end

---True when an inventory id is one of our SIM trays.
---@param invId any
---@return boolean
function inv.isSimStash(invId)
    return type(invId) == 'string' and invId:sub(1, #STASH_PREFIX) == STASH_PREFIX
end

---All phone items the player carries, as { slot, name, color, metadata } rows in
---config.Phone.Items priority order. Metadata is never nil.
---@param source number player server id
---@return { slot: number, name: string, color: string, metadata: table }[]
function inv.findPhones(source)
    local out = {}
    for _, entry in ipairs(config.Phone.Items or {}) do
        for _, row in ipairs(bridge.searchSlots(source, entry.item)) do
            out[#out + 1] = {
                slot     = row.slot,
                name     = entry.item,
                color    = entry.color,
                metadata = row.metadata,
            }
        end
    end
    return out
end

---Reads the persistent DEVICE identity + Face Unlock owner from a phone row's metadata.
---Used by DeviceIdentity mode: the phone item owns its data profile (`deviceId`), and the
---first activator (`deviceOwner`) gates Face Unlock. Read-only; nils when not yet minted.
---@param phone { metadata: table }
---@return string|nil identity, string|nil owner
function inv.getDevice(phone)
    local md = phone and phone.metadata
    if type(md) ~= 'table' then return nil, nil end
    local identity = md.deviceId
    if type(identity) ~= 'string' or identity == '' then identity = nil end
    local owner = md.deviceOwner
    if type(owner) ~= 'string' or owner == '' then owner = nil end
    return identity, owner
end

---Persists a phone's DEVICE identity + Face Unlock owner onto the item metadata. Merges into
---the slot's existing metadata so SIM numbers etc. survive.
---@param source number player server id
---@param slot number phone item slot
---@param identity string device identity (e.g. device:<id> or an adopted sim profile)
---@param owner string|nil first-activator citizenid
---@return boolean ok
function inv.setPhoneDevice(source, slot, identity, owner)
    local row = bridge.getSlot(source, slot)
    if not row then return false end
    local metadata = row.metadata
    metadata.deviceId    = identity
    metadata.deviceOwner = owner
    return bridge.setSlotMetadata(source, slot, metadata)
end

---Ensures the phone slot has a deviceId (minting one when missing). Used before opening the
---SIM tray so the stash can be keyed off a stable identity. Does not stamp Face Unlock owner
---(that happens on first full resolve).
---@param source number player server id
---@param slot number phone item slot
---@return string|nil deviceId
function inv.ensureDeviceId(source, slot)
    local row = bridge.getSlot(source, slot)
    if not row then return nil end
    local identity = inv.getDevice({ metadata = row.metadata })
    if identity then return identity end
    identity = 'device:' .. util.newId(16)
    if not inv.setPhoneDevice(source, slot, identity, nil) then return nil end
    return identity
end

---Registers (or refreshes) the 1-slot SIM-tray stash for a device. Idempotent.
---@param deviceId string
function inv.registerSimStash(deviceId)
    if not inv.isOx() or not deviceId or deviceId == '' then return end
    pcall(function()
        exports[OX]:RegisterStash(inv.simStashId(deviceId), 'SIM Tray', 1, 1000, false)
    end)
end

---Items inside a phone's SIM tray stash. Nil when the stash is empty/unreadable.
---@param deviceId string
---@return table|nil
local function stashItems(deviceId)
    if not deviceId or deviceId == '' then return nil end
    inv.registerSimStash(deviceId)
    local ok, items = pcall(function()
        return exports[OX]:GetInventoryItems(inv.simStashId(deviceId))
    end)
    if not ok or type(items) ~= 'table' then return nil end
    return items
end

---Bare-digit number on a sim_card row, or nil.
---@param item table|nil
---@return string|nil
local function simDigits(item)
    if not item or item.name ~= config.Sim.SimItem or type(item.metadata) ~= 'table' then return nil end
    local digits = util.digits(item.metadata.number)
    return digits ~= '' and digits or nil
end

---Migrates a legacy nested ox container tray (metadata.container) into the per-device stash
---and strips container metadata so USING the phone opens the UI instead of the tray.
---@param source number player server id
---@param slot number phone item slot
---@return string|nil deviceId
function inv.migrateNestedContainer(source, slot)
    if not inv.isOx() then return nil end
    local row = bridge.getSlot(source, slot)
    if not row or type(row.metadata) ~= 'table' or not row.metadata.container then
        return inv.getDevice({ metadata = row and row.metadata })
    end

    local deviceId = inv.ensureDeviceId(source, slot)
    if not deviceId then return nil end
    inv.registerSimStash(deviceId)

    local containerId = row.metadata.container
    local nested = bridge.containerItems(source, slot)
    if type(nested) == 'table' then
        local stashId = inv.simStashId(deviceId)
        for _, item in pairs(nested) do
            if item and item.name == config.Sim.SimItem then
                pcall(function()
                    exports[OX]:AddItem(stashId, item.name, item.count or 1, item.metadata)
                    exports[OX]:RemoveItem(containerId, item.name, item.count or 1, nil, item.slot)
                end)
            end
        end
    end

    row = bridge.getSlot(source, slot)
    if row and type(row.metadata) == 'table' then
        local metadata = row.metadata
        metadata.container = nil
        metadata.size = nil
        bridge.setSlotMetadata(source, slot, metadata)
    end
    return deviceId
end

---The SIM number installed in one phone row from findPhones, honouring the configured attach
---mode: container mode reads the sim_card inside the per-device SIM tray (or a legacy nested
---container still awaiting migration), metadata mode reads the number written onto the phone
---item itself. Read-only.
---@param source number player server id
---@param phone { slot: number, metadata: table }
---@return string|nil number bare-digit SIM number, nil when no SIM is installed
function inv.getSimNumber(source, phone)
    if config.Sim.UseContainers and inv.isOx() then
        -- Legacy nested containers: still readable until migrateNestedContainer runs.
        if phone.metadata and phone.metadata.container then
            local items = bridge.containerItems(source, phone.slot)
            if type(items) == 'table' then
                for _, item in pairs(items) do
                    local digits = simDigits(item)
                    if digits then return digits end
                end
            end
            return nil
        end

        local deviceId = inv.getDevice(phone)
        if not deviceId then return nil end
        local items = stashItems(deviceId)
        if type(items) ~= 'table' then return nil end
        for _, item in pairs(items) do
            local digits = simDigits(item)
            if digits then return digits end
        end
        return nil
    end

    local digits = util.digits(phone.metadata and phone.metadata.simNumber)
    return digits ~= '' and digits or nil
end

---Writes (or clears, with nil) the SIM number onto a phone item's metadata - metadata mode
---only. Merges into the slot's existing metadata so durability etc. survive.
---@param source number player server id
---@param slot number phone item slot
---@param number string|nil bare-digit SIM number, nil to eject
---@return boolean ok
function inv.setPhoneSim(source, slot, number)
    local row = bridge.getSlot(source, slot)
    if not row then return false end
    local metadata = row.metadata
    metadata.simNumber   = number
    metadata.description = number and ('SIM: %s'):format(util.formatNumber(number)) or nil
    return bridge.setSlotMetadata(source, slot, metadata)
end

---Removes one sim_card item, preferring the exact slot the use-callback reported so the used
---item disappears rather than "a" matching stack.
---@param source number player server id
---@param slot number|nil sim item slot; nil falls back to a name-only removal
---@return boolean ok
function inv.takeSimItem(source, slot)
    local simItem = config.Sim.SimItem
    if slot and bridge.removeFromSlot(source, simItem, slot, 1) then return true end
    if slot then return false end
    return bridge.remove(source, simItem, 1) == true
end

---Gives a sim_card item carrying `number` in its metadata (plus a human-readable description
---for inventories that display one).
---@param source number player server id
---@param number string bare-digit SIM number
---@return boolean ok
function inv.giveSimItem(source, number)
    return bridge.add(source, config.Sim.SimItem, 1, {
        number      = number,
        description = ('SIM: %s'):format(util.formatNumber(number)),
    }) == true
end

---Rewrites the number on the SIM inside a phone: metadata mode updates the phone item itself,
---container mode updates the sim_card item inside the tray stash (or legacy nested container).
---@param source number player server id
---@param phone { slot: number, metadata: table }
---@param number string new bare-digit number
---@return boolean ok
function inv.rewriteSimNumber(source, phone, number)
    if config.Sim.UseContainers and inv.isOx() then
        if phone.metadata and phone.metadata.container then
            local containerId = phone.metadata.container
            local items = bridge.containerItems(source, phone.slot)
            if type(items) ~= 'table' then return false end
            for _, item in pairs(items) do
                if item and item.name == config.Sim.SimItem then
                    local metadata = type(item.metadata) == 'table' and item.metadata or {}
                    metadata.number      = number
                    metadata.description = ('SIM: %s'):format(util.formatNumber(number))
                    local ok = pcall(function() exports[OX]:SetMetadata(containerId, item.slot, metadata) end)
                    return ok
                end
            end
            return false
        end

        local deviceId = inv.getDevice(phone)
        if not deviceId then return false end
        local stashId = inv.simStashId(deviceId)
        local items = stashItems(deviceId)
        if type(items) ~= 'table' then return false end
        for _, item in pairs(items) do
            if item and item.name == config.Sim.SimItem then
                local metadata = type(item.metadata) == 'table' and item.metadata or {}
                metadata.number      = number
                metadata.description = ('SIM: %s'):format(util.formatNumber(number))
                local ok = pcall(function() exports[OX]:SetMetadata(stashId, item.slot, metadata) end)
                return ok
            end
        end
        return false
    end
    return inv.setPhoneSim(source, phone.slot, number)
end

---Opens the SIM tray for a phone inventory slot: migrates any legacy nested container, ensures
---a device id + stash, then force-opens the stash inventory for the player.
---@param source number player server id
---@param slot number phone item slot
---@return boolean ok, string|nil err 'no_phone'|'no_device'|'open_failed'|nil
function inv.openSimTray(source, slot)
    if not inv.isOx() then return false, 'open_failed' end
    slot = tonumber(slot)
    if not slot then return false, 'no_phone' end
    local row = bridge.getSlot(source, slot)
    if not row or not phoneColors[row.name] then return false, 'no_phone' end

    local deviceId = inv.migrateNestedContainer(source, slot) or inv.ensureDeviceId(source, slot)
    if not deviceId then return false, 'no_device' end
    inv.registerSimStash(deviceId)

    local stashId = inv.simStashId(deviceId)
    local ok, opened = pcall(function()
        return exports[OX]:forceOpenInventory(source, 'stash', stashId)
    end)
    if not ok or not opened then return false, 'open_failed' end
    return true, nil
end

---Container-mode boot: no longer registers phones as nested ox containers (that made USE open
---the tray). Trays are stashes registered lazily per deviceId. Kept as the boot hook name so
---init.lua stays stable.
function inv.registerContainers()
    -- Intentionally empty: nested setContainerProperties made ox intercept USE. SIM trays are
    -- RegisterStash'd on demand via registerSimStash / openSimTray.
end

---@type table<string, string> Public copy of the phone item -> colour map.
inv.phoneColors = phoneColors

---@type string Public stash prefix for hook filters.
inv.STASH_PREFIX = STASH_PREFIX

return inv
