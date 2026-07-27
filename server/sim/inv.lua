---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Inventory bridge (bridge.server.inventory): aggregate + slot-level item ops.
local bridge = require 'bridge.server.inventory'
---@type table Shared server helpers (server.util): digits/formatNumber.
local util   = require 'server.util'
---@type table SIM registry (server.sim.store): mints a number for a blank card dropped in a tray.
local simStore = require 'server.sim.store'
---@type table SIM tray (server.sim.tray): the per-phone 1-slot stash a SIM is dragged into.
local tray     = require 'server.sim.tray'

---@type table Inv module; the table returned at end of file. SIM-feature glue over the bridge's
---slot-level API: find phone items, read/write the SIM number on them, and (container mode)
---read the SIM out of a phone's SIM-tray container.
local inv = {}

---@type string ox_inventory resource name (container mode is ox-only).
local OX = 'ox_inventory'

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
    -- Every phone lookup funnels through here, so it is also where a phone still carrying a
    -- legacy ox container gets spotted and converted (deferred, debounced).
    if inv.isOx() then tray.sweepLegacy(source, out) end
    return out
end

---The SIM number installed in one phone row from findPhones, honouring the configured attach
---mode: tray mode reads the sim_card item inside the phone's SIM tray, metadata mode reads the
---number written onto the phone item itself.
---
---Tray mode activates a blank card found in the tray, because dragging one in is the whole
---interaction there and nothing else would ever stamp it.
---@param source number player server id
---@param phone { slot: number, metadata: table }
---@return string|nil number bare-digit SIM number, nil when no SIM is installed
function inv.getSimNumber(source, phone)
    if tray.configured and inv.isOx() then
        -- No tray id means this phone's tray has never been opened, so it holds no SIM. Minting
        -- one here would write metadata on every read for no gain.
        local trayId = phone.metadata and phone.metadata.simTray
        if not tray.isTrayId(trayId) then return nil end
        local items = tray.items(trayId)
        if type(items) ~= 'table' then return nil end

        local blank
        for _, item in pairs(items) do
            if item and item.name == config.Sim.SimItem then
                local digits = util.digits(item.metadata and item.metadata.number)
                if digits ~= '' then return digits end
                blank = blank or item
            end
        end
        if not blank or config.Sim.ActivateBlankSims == false then return nil end

        local number = simStore.create({})
        if not number then return nil end
        local metadata = type(blank.metadata) == 'table' and blank.metadata or {}
        metadata.number      = number
        metadata.description = ('SIM: %s'):format(util.formatNumber(number))
        local ok = pcall(function() exports[OX]:SetMetadata(trayId, blank.slot, metadata) end)
        return ok and number or nil
    end

    local digits = util.digits(phone.metadata and phone.metadata.simNumber)
    return digits ~= '' and digits or nil
end

---The persistent DEVICE identity stamped onto a phone item, plus the first-activator cid that
---owns it. Both live on the phone item metadata in either attach mode (they describe the PHONE,
---not the SIM). Read-only; nil fields when never minted.
---@param phone { metadata: table }
---@return string|nil deviceId, string|nil ownerCid
function inv.getDevice(phone)
    local md = phone.metadata
    if type(md) ~= 'table' then return nil, nil end
    local id = md.deviceId
    if type(id) ~= 'string' or id == '' then id = nil end
    local owner = md.deviceOwner
    if type(owner) ~= 'string' or owner == '' then owner = nil end
    return id, owner
end

---Stamps the device identity (and, first time, the owning character) onto a phone item's
---metadata, merging into the existing slot metadata so the SIM number, container id and
---durability survive. Device-identity mode only.
---@param source number player server id
---@param slot number phone item slot
---@param deviceId string persistent device identity
---@param ownerCid string|nil first-activator real citizenid (Face Unlock owner gate)
---@return boolean ok
function inv.setPhoneDevice(source, slot, deviceId, ownerCid)
    local row = bridge.getSlot(source, slot)
    if not row then return false end
    local metadata = row.metadata
    metadata.deviceId = deviceId
    if ownerCid then metadata.deviceOwner = ownerCid end
    return bridge.setSlotMetadata(source, slot, metadata)
end

---Writes (or clears, with nil) the SIM number onto a phone item's metadata - metadata mode
---only. Merges into the slot's existing metadata so container ids, durability etc. survive.
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
---tray mode updates the sim_card item inside the phone's tray (ox SetMetadata on the tray
---inventory). Used by the setSimNumber export.
---@param source number player server id
---@param phone { slot: number, metadata: table }
---@param number string new bare-digit number
---@return boolean ok
function inv.rewriteSimNumber(source, phone, number)
    if tray.configured and inv.isOx() then
        local trayId = phone.metadata and phone.metadata.simTray
        local items = tray.isTrayId(trayId) and tray.items(trayId)
        if type(items) ~= 'table' then return false end
        for _, item in pairs(items) do
            if item and item.name == config.Sim.SimItem then
                local metadata = type(item.metadata) == 'table' and item.metadata or {}
                metadata.number      = number
                metadata.description = ('SIM: %s'):format(util.formatNumber(number))
                local ok = pcall(function() exports[OX]:SetMetadata(trayId, item.slot, metadata) end)
                return ok
            end
        end
        return false
    end
    return inv.setPhoneSim(source, phone.slot, number)
end

---@type table<string, string> Public copy of the phone item -> colour map.
inv.phoneColors = phoneColors

return inv
