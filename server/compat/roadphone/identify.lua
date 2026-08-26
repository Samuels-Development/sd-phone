---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Settings persistence layer (server.settings.store): identity -> number mapping.
local settings = require 'server.settings.store'
---@type table SIM mode state (server.sim.state): whether unique phones are live.
local simState = require 'server.sim.state'
---@type table SIM session resolver (server.sim.session): the phone a player is acting through.
local session = require 'server.sim.session'
---@type table sd-phone config root (configs/config.lua): the configured phone items.
local config = require 'configs.config'
---@type table Player bridge (bridge.server.player): source -> acting phone identity.
local player = require 'bridge.server.player'
---@type table Inventory bridge (bridge.server.inventory): the synchronous used-slot metadata peek.
local inv = require 'bridge.server.inventory'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table<string, string> Frame colour -> phone item name, and item name -> itself, built from
---configs/phone.lua. RoadPhone addresses phones by item name where sd-phone addresses them by
---colour, so both directions are needed to answer its item-shaped exports.
local ITEMS = {}

---@type table<string, string> Phone item name -> its own frame colour, built from configs/phone.lua.
---This is the direction the item-use path needs: the colour of the phone that was ACTUALLY used,
---which is not necessarily the first one the player happens to own.
local COLORS = {}

for _, entry in ipairs(config.Phone.Items or {}) do
    if type(entry.item) == 'string' then
        ITEMS[entry.item] = entry.item
        if type(entry.color) == 'string' then
            COLORS[entry.item] = entry.color
            if not ITEMS[entry.color] then ITEMS[entry.color] = entry.item end
        end
    end
end

---The phone item name a player is acting through, from the frame colour their owned phone reports.
---Nil when they own no configured phone item.
---@param src number player server id
---@return string|nil itemName
local function itemFor(src)
    local color = sd:hasPhone(src)
    return color and ITEMS[color] or nil
end

---getPlayerFromPhone(number): the connected server id owning a phone number, nil when the number
---is unassigned or its owner is offline.
registerExport('getPlayerFromPhone', function(number)
    return sd:getSourceByNumber(number)
end)

---getSourceFromPhone(number): the documented cross-resource form of getPlayerFromPhone.
registerExport('getSourceFromPhone', function(number)
    return sd:getSourceByNumber(number)
end)

---GetPlayerSourceByPhoneNumber(number): RoadPhone's own PascalCase alias of getSourceFromPhone.
registerExport('GetPlayerSourceByPhoneNumber', function(number)
    return sd:getSourceByNumber(number)
end)

---GetPhoneNumberBySource(source): the number the player is currently acting through - the active
---SIM's number while unique phones are on, their character's number otherwise.
registerExport('GetPhoneNumberBySource', function(source)
    local src = shim.source(source)
    return src and sd:getPhoneNumber(src) or nil
end)

---getNumberFromSource(source): the core-export spelling of GetPhoneNumberBySource.
registerExport('getNumberFromSource', function(source)
    local src = shim.source(source)
    return src and sd:getPhoneNumber(src) or nil
end)

---getNumberFromIdentifier(identifier): a character's phone number, assigning one on first access so
---a bridge asking before the player has ever opened their phone still gets a number. Offline-safe.
registerExport('getNumberFromIdentifier', function(identifier)
    if type(identifier) ~= 'string' or identifier == '' then return nil end
    return settings.ensurePhoneNumber(identifier)
end)

---isPhoneNumberInUse(number): whether the number is already claimed, by a SIM or by a character
---assignment, offline owners included.
registerExport('isPhoneNumberInUse', function(number)
    local digits = shim.digits(number)
    if not digits then return false end
    return not sd:isNumberAvailable(digits)
end)

---GetOrCreatePhoneNumber(source): RoadPhone's multi-return (phoneNumber, wasCreated). The number is
---minted on first access, and `wasCreated` reports whether this call is the one that minted it.
registerExport('GetOrCreatePhoneNumber', function(source)
    local src = shim.source(source)
    local cid = src and player.getIdentifier(src) or nil
    if not cid then return nil, false end

    local existing = settings.getPhoneNumber(cid)
    if existing then return existing, false end

    local minted = settings.ensurePhoneNumber(cid)
    return minted, minted ~= nil
end)

---GetPhoneNumberFromItem(source, specificSlot?): RoadPhone's multi-return item view of a phone -
---(phoneNumber, itemName, slot, metadata).
---
---specificSlot is ignored and the metadata table is always empty: sd-phone stores phone data in its
---own tables keyed by device identity rather than on the inventory item, so there is nothing
---per-slot to address or to hand back.
registerExport('GetPhoneNumberFromItem', function(source, specificSlot)
    local src = shim.source(source)
    if not src then return nil, nil, nil, {} end
    if specificSlot ~= nil then
        warnOnce('GetPhoneNumberFromItem.slot', ('GetPhoneNumberFromItem ignores specificSlot (called by %s); sd-phone answers for the phone the player is acting through'):format(GetInvokingResource() or 'unknown'))
    end

    local s = simState.active and session.resolve(src) or nil
    return sd:getPhoneNumber(src), (s and s.active and s.active.name) or itemFor(src), s and s.slot or nil, {}
end)

---AssignPhoneNumberToItem(source, itemName, slot): RoadPhone's multi-return (success, phoneNumber).
---sd-phone mints a number for the acting phone itself, so this reports the number that phone
---already carries rather than writing one onto an inventory slot.
registerExport('AssignPhoneNumberToItem', function(source, _itemName, _slot)
    local src = shim.source(source)
    if not src then return false, nil end
    warnOnce('AssignPhoneNumberToItem', ('AssignPhoneNumberToItem cannot write a number onto an inventory slot in sd-phone (called by %s); the acting phone\'s own number was returned instead'):format(GetInvokingResource() or 'unknown'))

    local number = sd:getPhoneNumber(src)
    return number ~= nil, number
end)

---FindPhoneSlotByNumber(source, phoneNumber): RoadPhone's multi-return (itemName, slot, metadata)
---for the carried phone holding a number. Answers from the player's carried SIMs while unique
---phones are on; with them off there is one phone per character and only the item name is real.
registerExport('FindPhoneSlotByNumber', function(source, phoneNumber)
    local src = shim.source(source)
    local wanted = shim.digits(phoneNumber)
    if not src or not wanted then return nil, nil, nil end

    if simState.active then
        local s = session.resolve(src)
        for _, entry in ipairs(s and s.sims or {}) do
            if entry.number == wanted then return entry.name, entry.slot, {} end
        end
        return nil, nil, nil
    end

    if shim.digits(sd:getPhoneNumber(src)) ~= wanted then return nil, nil, nil end
    return itemFor(src), nil, {}
end)

---IsPhoneItemName(itemName): whether an item name is one of the phone items configs/phone.lua
---names, which is exactly the set sd-phone opens the phone for.
registerExport('IsPhoneItemName', function(itemName)
    if type(itemName) ~= 'string' then return false end
    return ITEMS[itemName] == itemName
end)

---OnPhoneItemUsed(source, slot, usedItem): the entry point an inventory calls instead of firing a
---use event. Records which phone was used (so unique phones open the right profile) and opens it.
---
---The frame colour comes from the item that was USED, not from whichever phone the player happens
---to own first: a player carrying two variants must get the shell they actually tapped, and under
---unique phones the colour is the tiebreaker session.setActive falls back on with no slot.
registerExport('OnPhoneItemUsed', function(source, slot, usedItem)
    local src = shim.source(source)
    if not src then return end

    local name = type(usedItem) == 'table' and (usedItem.name or usedItem.item) or usedItem
    local owned = sd:hasPhone(src)
    if not owned then return end
    local color = (type(name) == 'string' and COLORS[name]) or owned

    local usedSlot = tonumber(slot) or (type(usedItem) == 'table' and tonumber(usedItem.slot)) or nil
    local deviceHint
    if simState.active and (usedSlot or ITEMS[name]) then
        session.setActive(src, { slot = usedSlot, color = color })
        if usedSlot then
            local row = inv.getSlot(src, usedSlot)
            local md = row and row.metadata
            deviceHint = type(md) == 'table' and md.deviceId or nil
        end
    end

    TriggerClientEvent('sd-phone:client:openFromItem', src, color, nil, simState.active, deviceHint)
    if simState.active then
        CreateThread(function() session.push(src) end)
    end
end)
