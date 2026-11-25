---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Shared server helpers (server.util): response envelopes.
local util = require 'server.util'
---@type table Player bridge (bridge.server.player): identity from a server-trusted source only.
local player = require 'bridge.server.player'
---@type table Banking bridge (bridge.server.banking): moves bank money and registers the movement.
local bank = require 'bridge.server.banking'
---@type table Banking actions (server.banking.actions): Wallet transaction log (log-only, moves no money).
local wallet = require 'server.banking.actions'
---@type table Inventory bridge (bridge.server.inventory): gives, takes and reads the case item.
local inventory = require 'bridge.server.inventory'
---@type table Notify bridge (bridge.server.notify): tells a player what using the item did.
local notify = require 'bridge.server.notify'
---@type table Cases rules (shared.cases): what a valid design is, and the model contract.
local rules = require 'shared.cases'
---@type table Cases persistence (server.cases.store).
local store = require 'server.cases.store'
---@type table Media guard (server.media.guard): proves a picture is in the caller's own gallery.
local guard = require 'server.media.guard'
---@type fun(entry: table): boolean Whether a phone item is a foldable (shared.phonefold).
local folds = require('shared.phonefold').entry
---@type fun(entry: table): string The design a phone item is (shared.phonefold).
local lookOf = require('shared.phonefold').look

---@type table Actions module; the table returned at end of file. Everything about phone cases the
---server decides: what a store sells, buying, the case item, fitting a case to a phone and taking it
---off. With cases as items a case belongs to the phone it is on, kept on that phone's item, so it
---travels with the phone; without, a character wears one case on whatever phone they hold.
local actions = {}

---@type table Cases config (config.Cases): prices, stores and limits.
local CFG <const> = config.Cases or {}
---@type boolean False switches every case feature off.
local ENABLED <const> = CFG.Enabled ~= false
---@type table Price list (config.Cases.Prices).
local PRICES <const> = CFG.Prices or {}
---@type string The inventory item a case is.
local ITEM <const> = type(CFG.Item) == 'string' and CFG.Item ~= '' and CFG.Item or 'phone_case'
---@type boolean True when a bought case is an item: asked for, and the inventory can keep a design on one.
local ITEMS <const> = ENABLED and CFG.AsItems ~= false and inventory.supportsSlotMetadata()
---@type integer Designs a character can keep when cases are not items.
local MAX_OWNED <const> = math.max(1, math.tointeger(tonumber(CFG.MaxOwned)) or 12)
---@type number Metres from a store within which a case can be bought there.
local RADIUS <const> = math.max(2.0, tonumber(CFG.Radius) or 8.0)
---@type table<string, thread> Characters with a write in flight, so two taps cannot interleave,
---mapped to the thread running it.
local busy = {}

actions.ITEM = ITEM
actions.ITEMS = ITEMS
actions.ENABLED = ENABLED

---What one part costs. A price entry is a number for every part of its kind, or a table by name
---with `default` for the rest.
---@param entry any config.Cases.Prices.<Kind>
---@param name string part name
---@return integer price whole dollars, never negative
local function priceOf(entry, name)
    local value = entry
    if type(entry) == 'table' then value = entry[name] or entry.default end
    return math.max(0, math.floor(tonumber(value) or 0))
end

---What a design costs: its style plus every extra it carries, each sticker counted.
---@param design CaseDesign a design that came out of rules.clean
---@return integer price
local function priceOfDesign(design)
    local total = priceOf(PRICES.Style, design.style)
    if design.pattern then total = total + priceOf(PRICES.Pattern, design.pattern) end
    if design.accessory then total = total + priceOf(PRICES.Accessory, design.accessory) end
    if design.charm then total = total + priceOf(PRICES.Charm, design.charm) end
    for _, entry in ipairs(design.stickers or {}) do
        if entry.id == rules.PHOTO then
            total = total + priceOf(PRICES.Photo, rules.PHOTO)
        else
            total = total + priceOf(PRICES.Sticker, entry.id)
        end
    end
    return total
end

---Prices a list of part names for the catalogue.
---@param names string[]
---@param entry any config.Cases.Prices.<Kind>
---@return { id: string, price: integer }[]
local function priced(names, entry)
    local out = {}
    for i = 1, #names do out[i] = { id = names[i], price = priceOf(entry, names[i]) } end
    return out
end

---Prices the stickers for the catalogue, each tagged with the group the store lists it under.
---@return { id: string, price: integer, group: string }[]
local function pricedStickers()
    local out = {}
    for _, group in ipairs({ 'icons', 'brands' }) do
        for _, id in ipairs(rules.data.StickerGroups[group]) do
            out[#out + 1] = { id = id, price = priceOf(PRICES.Sticker, id), group = group }
        end
    end
    return out
end

---Builds what a store lists for sale: the palette, every style and part, and their prices.
---@return table catalog
local function buildCatalog()
    local data = rules.data
    local styles = {}
    for i = 1, #data.StyleOrder do
        local id = data.StyleOrder[i]
        local info = data.Styles[id]
        styles[i] = { id = id, price = priceOf(PRICES.Style, id), open = info.open, pocket = info.pocket }
    end
    return {
        palette     = data.Palette,
        styles      = styles,
        patterns    = priced(data.Patterns, PRICES.Pattern),
        accessories = priced(data.Accessories, PRICES.Accessory),
        charms      = priced(data.Charms, PRICES.Charm),
        stickers    = pricedStickers(),
        photoPrice  = priceOf(PRICES.Photo, rules.PHOTO),
    }
end

---@type table The catalogue, built once: nothing in it changes while the resource runs.
local CATALOG <const> = buildCatalog()

---Reads a character's cases with every stored design passed back through the rules, so a part
---that no longer exists drops out instead of reaching a client.
---@param cid string framework per-character id
---@return CaseDesign? equipped
---@return CaseDesign[] owned
local function load(cid)
    local rawEquipped, rawOwned = store.get(cid)
    local owned = {}
    for i = 1, #rawOwned do
        local design = rules.clean(rawOwned[i])
        if design then owned[#owned + 1] = design end
    end
    return rules.clean(rawEquipped), owned
end

---Resolves the caller, refusing when cases are switched off or the player has no character.
---@param src number player server id
---@return string? cid framework per-character id
---@return table? refusal the envelope to return when there is no cid
local function caller(src)
    if not ENABLED then return nil, util.fail('cases.disabled', 'Cases are not available here') end
    local cid = player.getIdentifier(src)
    if not cid then return nil, util.fail('common.playerNotFound', 'Player not found') end
    return cid
end

---Runs a write for one character at a time. Re-entrant on the thread already holding it, so a
---write that moves an old case over first (carryOver) runs inside the same hold.
---@param cid string framework per-character id
---@param fn fun(): table the write; its envelope is returned
---@return table envelope
local function exclusive(cid, fn)
    local me = coroutine.running()
    local holder = busy[cid]
    if holder then
        if holder ~= me then return util.fail('cases.busy', 'Still working on your last request') end
        return fn()
    end
    busy[cid] = me
    local ok, res = pcall(fn)
    busy[cid] = nil
    if not ok then error(res, 0) end
    return res
end

---Whether a player is standing at one of the case stores.
---@param src number player server id
---@return boolean
local function atStore(src)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return false end
    local here = GetEntityCoords(ped)
    for _, shop in ipairs(CFG.Stores or {}) do
        local at = shop.coords
        if at and #(here - vector3(at.x, at.y, at.z)) <= RADIUS then return true end
    end
    return false
end

---What the item carries for a design: the design itself, and what the inventory shows about it.
---@param design CaseDesign a design that came out of rules.clean
---@return table metadata
local function itemData(design)
    return { case = design, description = rules.describe(design) }
end

---Hands a player a case as an item.
---@param src number player server id
---@param design CaseDesign a design that came out of rules.clean
---@return boolean given false when they cannot carry it
local function give(src, design)
    local data = itemData(design)
    if not inventory.canCarry(src, ITEM, 1, data) then return false end
    return inventory.add(src, ITEM, 1, data) == true
end

---Drops one design that looks like `design` from a list, when there is one.
---@param owned CaseDesign[]
---@param design CaseDesign?
local function dropOne(owned, design)
    local wanted = rules.signature(design)
    for i = 1, #owned do
        if rules.signature(owned[i]) == wanted then
            table.remove(owned, i)
            return
        end
    end
end

---Tells the wearer's client which case their phone has now.
---@param src number player server id
---@param design CaseDesign? nil for none
local function announce(src, design)
    TriggerClientEvent('sd-phone:client:cases:set', src, design or false)
end

---@type table<string, table> Phone item name -> its configs/phone.lua Items entry.
local PHONES <const> = {}
for _, entry in ipairs((config.Phone or {}).Items or {}) do
    if entry.item then PHONES[entry.item] = entry end
end
---@type table<string, true> Frame colours whose phone already comes in a case and takes no other.
local NO_CASE <const> = {}
for _, colour in ipairs(CFG.NoCase or {}) do NO_CASE[colour] = true end
---@type table<integer, { item: string, slot: any }> Player -> the phone they last took out. With
---cases as items a case is fitted to one phone and kept on that phone's item, so it goes wherever
---the phone goes; this is the phone "my phone" means for that player.
local inUse = {}

---The phones a player carries, in the order the config lists them, each with the case fitted to it.
---@param src number player server id
---@return { color: string, label: string, fold: boolean, look: string, case: CaseDesign|false }[]
local function phonesOf(src)
    local out = {}
    local foldable = (config.Phone or {}).Foldable == true
    for _, entry in ipairs((config.Phone or {}).Items or {}) do
        if entry.item and entry.color and inventory.count(src, entry.item) > 0 then
            local word = tostring(entry.color):gsub('_', ' ')
            local row = ITEMS and inventory.searchSlots(src, entry.item)[1] or nil
            out[#out + 1] = {
                color = entry.color,
                label = entry.label or (word:gsub('^%l', string.upper) .. ' Phone'),
                fold  = foldable and folds(entry),
                look  = lookOf(entry),
                case  = row and rules.clean(type(row.metadata) == 'table' and row.metadata.case or nil) or false,
            }
        end
    end
    return out
end

---The inventory slot holding a phone of a given kind, when the player carries one.
---@param src number player server id
---@param kind any { color, fold, look } as a store's picker names a phone
---@return table? row the slot (bridge SlotEntry)
local function phoneOfKind(src, kind)
    if type(kind) ~= 'table' then return nil end
    local foldable = (config.Phone or {}).Foldable == true
    for _, entry in ipairs((config.Phone or {}).Items or {}) do
        if entry.color == kind.color and lookOf(entry) == (kind.look or 'classic')
            and (foldable and folds(entry)) == (kind.fold == true) then
            local row = inventory.searchSlots(src, entry.item)[1]
            if row then return row end
        end
    end
    return nil
end

---The inventory slot holding the phone a player is using: the one they last took out if it is
---still where it was, else the first phone they carry.
---@param src number player server id
---@return table? row the slot (bridge SlotEntry), nil when they carry no phone
local function phoneInUse(src)
    local known = inUse[src]
    if known then
        local row = known.slot and inventory.getSlot(src, known.slot) or nil
        if row and row.name == known.item then return row end
        row = inventory.searchSlots(src, known.item)[1]
        if row then
            known.slot = row.slot
            return row
        end
    end
    for _, entry in ipairs((config.Phone or {}).Items or {}) do
        local row = entry.item and inventory.searchSlots(src, entry.item)[1] or nil
        if row then
            inUse[src] = { item = entry.item, slot = row.slot }
            return row
        end
    end
    return nil
end

---The case fitted to the phone in a slot.
---@param row table? a phone's slot
---@return CaseDesign? design
local function caseOn(row)
    return row and rules.clean(type(row.metadata) == 'table' and row.metadata.case or nil) or nil
end

---Whether the phone in a slot already comes in a case and takes no other.
---@param row table a phone's slot
---@return boolean
local function cased(row)
    local entry = PHONES[row.name]
    return entry ~= nil and NO_CASE[entry.color] == true
end

---Fits a case to the phone in a slot, or takes it off, keeping everything else the item carries.
---@param src number player server id
---@param row table the phone's slot
---@param design CaseDesign? nil for no case
---@return boolean written
local function fit(src, row, design)
    local metadata = {}
    for key, value in pairs(type(row.metadata) == 'table' and row.metadata or {}) do metadata[key] = value end
    metadata.case = design
    return inventory.setSlotMetadata(src, row.slot, metadata)
end

---Whether a slot is the phone the player is using.
---@param src number player server id
---@param row table a phone's slot
---@return boolean
local function isInUse(src, row)
    local now = phoneInUse(src)
    return now ~= nil and now.slot == row.slot
end

---Moves a case a character wore before cases were fitted to phones onto the phone they are using,
---or into their pockets when that phone has one already or cannot take one. Once: it runs under
---the character's write lock and re-reads their row there, because the store, the phone's Settings
---and every phone open all ask at once, and each of them handed the same case out as an item. A
---call that finds the lock taken leaves the move to the one holding it.
---@param src number player server id
---@param cid string framework per-character id
---@return CaseDesign[]? owned the designs kept after the move, nil when nothing moved
local function carryOver(src, cid)
    local moved
    exclusive(cid, function()
        local worn, owned = load(cid)
        if not worn then return util.ok() end
        local row = phoneInUse(src)
        local placed = false
        if row and not caseOn(row) and not cased(row) then placed = fit(src, row, worn) end
        if not placed then placed = give(src, worn) end
        if not placed then return util.ok() end
        dropOne(owned, worn)
        store.save(cid, nil, owned)
        moved = owned
        return util.ok()
    end)
    return moved
end

---The case on the phone a player is using. With cases as items that is the case fitted to that
---phone; without, the one the character wears. One read of the character's row serves the answer,
---and the carry-over only reads again when there is an old case to move.
---@param src number player server id
---@param cid string framework per-character id
---@return CaseDesign? design
---@return CaseDesign[] owned the designs the character keeps (legacy or list mode)
local function wornBy(src, cid)
    local worn, owned = load(cid)
    if not ITEMS then return worn, owned end
    if worn then owned = carryOver(src, cid) or owned end
    return caseOn(phoneInUse(src)), owned
end

---Notes which phone a player has just taken out, and tells their client the case fitted to it.
---Called by the phone's open paths (server/main.lua).
---@param src number player server id
---@param item string the phone's item name
---@param slot any the slot it was used from, when known
function actions.phoneOpened(src, item, slot)
    if not ENABLED or not ITEMS or not PHONES[item] then return end
    inUse[src] = { item = item, slot = slot }
    local cid = player.getIdentifier(src)
    if not cid then return end
    CreateThread(function()
        announce(src, (wornBy(src, cid)))
    end)
end

AddEventHandler('playerDropped', function()
    inUse[source] = nil
end)

---What a store shows on opening: what is for sale, the phones the character carries and the case
---on each, what they keep, and their balance.
---@param src number player server id
---@return table envelope { catalog, owned, equipped, balance, maxOwned, items, phones }
function actions.state(src)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    local equipped, owned = wornBy(src, cid)
    return util.ok({
        catalog  = CATALOG,
        owned    = owned,
        equipped = equipped or false,
        balance  = bank.getBalance(src) or 0,
        maxOwned = MAX_OWNED,
        items    = ITEMS,
        phones   = phonesOf(src),
    })
end

---The case on the phone a character is using, for the client to draw and for the phone's Settings.
---@param src number player server id
---@return table envelope { equipped, items, catalog }
function actions.equipped(src)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    return util.ok({ equipped = wornBy(src, cid) or false, items = ITEMS, catalog = CATALOG })
end

---Buys a design at a store with bank money. As an item it lands in the buyer's pockets, or is
---fitted straight to the phone they picked when they ask for that, with the case that phone had
---handed back; without items it joins the designs they keep and goes on.
---@param src number player server id
---@param payload any { design, wear?, phone? }: `phone` is { color, fold, look }, the one on show
---@return table envelope { balance, equipped, owned, item, phones }
function actions.buy(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    if not atStore(src) then return util.fail('cases.notAtStore', 'You need to be at a case store') end
    local design = rules.clean(type(payload) == 'table' and payload.design or nil)
    if not design then return util.fail('cases.invalidDesign', 'That case cannot be made') end
    if rules.photoSticker(design) then
        design.photo = guard.photo(cid, design.photo)
        if not design.photo then return util.fail('cases.photoNotInGallery', 'Pick a photo from your own gallery') end
    end
    local wear = type(payload) == 'table' and payload.wear == true

    return exclusive(cid, function()
        local equipped, owned = wornBy(src, cid)
        if not ITEMS and #owned >= MAX_OWNED then
            return util.fail('cases.full', 'You can keep {n} cases. Delete one first.', { n = MAX_OWNED })
        end
        local row
        if ITEMS and wear then
            row = phoneOfKind(src, payload.phone) or phoneInUse(src)
            if not row then return util.fail('cases.noPhone', 'You need a phone to put it on') end
            if cased(row) then return util.fail('cases.phoneCased', 'That phone comes in its own case') end
        elseif ITEMS and not inventory.canCarry(src, ITEM, 1, itemData(design)) then
            return util.fail('cases.noRoom', 'You have no room to carry that')
        end
        local price = priceOfDesign(design)
        if price > 0 and not bank.removeMoney(src, price, 'phone-case') then
            return util.fail('cases.insufficientFunds', 'Not enough money in the bank')
        end

        local done
        if not ITEMS then
            owned[#owned + 1] = design
            done = pcall(store.save, cid, design, owned)
            equipped = design
        elseif row then
            local old = caseOn(row)
            done = not old or give(src, old)
            if done then
                done = fit(src, row, design)
                if done and isInUse(src, row) then equipped = design end
            end
        else
            done = give(src, design)
        end
        if not done then
            if price > 0 then bank.addMoney(src, price, 'phone-case-refund') end
            return util.fail('cases.noRoom', 'You have no room to carry that')
        end

        if price > 0 then wallet.addExternal(cid, { label = 'Phone case', amount = -price, category = 'shopping' }) end
        announce(src, equipped)
        return util.ok({
            balance  = bank.getBalance(src) or 0,
            equipped = (row and design) or equipped or false,
            owned    = owned,
            item     = ITEMS and not wear,
            phones   = phonesOf(src),
        })
    end)
end

---Every phone a player carries, slot by slot, in the order the config lists their kinds.
---@param src number player server id
---@return table[] rows the slots (bridge SlotEntry)
local function phoneRows(src)
    local out = {}
    for _, entry in ipairs((config.Phone or {}).Items or {}) do
        local rows = entry.item and inventory.searchSlots(src, entry.item) or {}
        for i = 1, #rows do out[#out + 1] = rows[i] end
    end
    return out
end

---What a phone item is called.
---@param row table a phone's slot
---@return string label
local function phoneLabel(row)
    local entry = PHONES[row.name] or {}
    if entry.label then return entry.label end
    local word = tostring(entry.color or 'phone'):gsub('_', ' ')
    return word:gsub('^%l', string.upper) .. ' Phone'
end

---Reads the design off a case item in a slot.
---@param src number player server id
---@param slot any the slot the case item sits in; the first case item when left out
---@return table? entry the case item's slot
---@return CaseDesign? design nil for an item with no design on it
local function caseItem(src, slot)
    local entry
    if slot ~= nil then entry = inventory.getSlot(src, slot) else entry = inventory.searchSlots(src, ITEM)[1] end
    if type(entry) ~= 'table' or (entry.name and entry.name ~= ITEM) then return nil end
    return entry, rules.clean(type(entry.metadata) == 'table' and entry.metadata.case or nil)
end

---Fits the case from an item to one phone: the item leaves the pockets, and the case that phone
---had comes back as an item. Tells the player how it went.
---@param src number player server id
---@param cid string framework per-character id
---@param entry table the case item's slot
---@param design CaseDesign the design on it
---@param row table the phone's slot
local function fitFromItem(src, cid, entry, design, row)
    local res = exclusive(cid, function()
        if cased(row) then return util.fail('cases.phoneCased', 'That phone comes in its own case') end
        local old = caseOn(row)
        if not inventory.removeFromSlot(src, ITEM, entry.slot, 1) then
            return util.fail('common.serverError', 'Something went wrong')
        end
        if old and not give(src, old) then
            inventory.add(src, ITEM, 1, itemData(design))
            return util.fail('cases.noRoom', 'You have no room to carry that')
        end
        if not fit(src, row, design) then
            inventory.add(src, ITEM, 1, itemData(design))
            return util.fail('common.serverError', 'Something went wrong')
        end
        return util.ok({ equipped = design })
    end)

    if res.success then
        if isInUse(src, row) then announce(src, design) end
        notify.to(src, ('You put the case on your %s.'):format(phoneLabel(row)), 'success')
    else
        notify.to(src, res.message, 'error')
    end
end

---Using a case item: with one phone on them it is fitted to that phone; with several the player is
---asked which, since any of them could be meant.
---@param src number player server id
---@param slot any the slot the used item sits in
function actions.useItem(src, slot)
    local cid = ENABLED and player.getIdentifier(src) or nil
    if not cid or not ITEMS then return end
    local entry, design = caseItem(src, slot)
    if not entry or not design then
        notify.to(src, 'This case is blank. Have one made at a case store.', 'error')
        return
    end
    carryOver(src, cid)

    local rows = phoneRows(src)
    if #rows == 0 then
        notify.to(src, 'You need a phone to put it on', 'error')
        return
    end
    if #rows == 1 then
        fitFromItem(src, cid, entry, design, rows[1])
        return
    end

    TriggerClientEvent('sd-phone:client:cases:choosePhone', src, entry.slot)
end

---What a player has to dress their phones with: every phone they carry with the case on it, and
---every loose case in their pockets. For the menus that fit and remove cases.
---@param src number player server id
---@return table envelope { phones: { slot, label, wearing, cased, inUse }[], cases: { slot, about }[] }
function actions.wardrobe(src)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    if not ITEMS then return util.fail('cases.disabled', 'Cases are not available here') end
    carryOver(src, cid)

    local phones, loose = {}, {}
    for i, row in ipairs(phoneRows(src)) do
        local on = caseOn(row)
        phones[i] = {
            slot    = row.slot,
            label   = phoneLabel(row),
            wearing = on and rules.describe(on) or false,
            cased   = cased(row),
            inUse   = isInUse(src, row),
        }
    end
    for _, row in ipairs(inventory.searchSlots(src, ITEM)) do
        local design = rules.clean(type(row.metadata) == 'table' and row.metadata.case or nil)
        if design then loose[#loose + 1] = { slot = row.slot, about = rules.describe(design) } end
    end
    return util.ok({ phones = phones, cases = loose })
end

---Fits the case item the player used to the phone they picked from the list.
---@param src number player server id
---@param payload any { case, phone }: the slots of the case item and of the phone
---@return table envelope
function actions.fitTo(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    if not ITEMS or type(payload) ~= 'table' then return util.fail('cases.disabled', 'Cases are not available here') end
    local entry, design = caseItem(src, payload.case)
    if not entry or not design then return util.fail('cases.gone', 'You no longer have that case') end
    local row = payload.phone ~= nil and inventory.getSlot(src, payload.phone) or nil
    if not row or not PHONES[row.name] then return util.fail('cases.noPhone', 'You need a phone to put it on') end
    fitFromItem(src, cid, entry, design, row)
    return util.ok({})
end

---Takes the case off a phone: the one in a given slot, or the one the player is using. As an item
---it goes back into their pockets; without items it stays among the designs they keep.
---@param src number player server id
---@param payload any { phone? }: the slot of the phone to strip; the phone in use when left out
---@return table envelope { equipped }
function actions.takeOff(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    local slot = type(payload) == 'table' and payload.phone or nil

    return exclusive(cid, function()
        if ITEMS then
            carryOver(src, cid)
            local row
            if slot ~= nil then row = inventory.getSlot(src, slot) else row = phoneInUse(src) end
            if row and not PHONES[row.name] then row = nil end
            local worn = caseOn(row)
            if not row or not worn then return util.ok({ equipped = false }) end
            if not give(src, worn) then return util.fail('cases.noRoom', 'You have no room to carry that') end
            fit(src, row, nil)
            if isInUse(src, row) then announce(src, nil) end
            return util.ok({ equipped = false })
        end
        local equipped, owned = load(cid)
        if not equipped then return util.ok({ equipped = false }) end
        store.save(cid, nil, owned)
        announce(src, nil)
        return util.ok({ equipped = false })
    end)
end

---Hands out, as items, the designs a character bought before cases were items.
---@param src number player server id
---@return table envelope { owned, given }
function actions.collect(src)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    if not ITEMS then return util.fail('cases.disabled', 'Cases are not available here') end
    if not atStore(src) then return util.fail('cases.notAtStore', 'You need to be at a case store') end

    return exclusive(cid, function()
        carryOver(src, cid)
        local _, owned = load(cid)
        local given = 0
        while owned[1] do
            if not give(src, owned[1]) then break end
            table.remove(owned, 1)
            given = given + 1
        end
        store.save(cid, nil, owned)
        if given == 0 and owned[1] then return util.fail('cases.noRoom', 'You have no room to carry that') end
        return util.ok({ owned = owned, given = given })
    end)
end

---The picture on a player's photo sticker, for the clients that draw their phone. It was checked
---against the buyer's gallery when the case was made, so it is safe to hand to a watcher.
---@param src number player server id
---@param payload any { target }: the wearer's server id
---@return table envelope { url }
function actions.photo(src, payload)
    local target = type(payload) == 'table' and math.tointeger(tonumber(payload.target)) or nil
    if not target or not ENABLED then return util.ok({ url = false }) end
    local cid = player.getIdentifier(target)
    if not cid then return util.ok({ url = false }) end
    local equipped
    if ITEMS then equipped = caseOn(phoneInUse(target)) else equipped = load(cid) end
    local url = rules.photoSticker(equipped) and type(equipped.photo) == 'string' and equipped.photo
    return util.ok({ url = url or false })
end

---Without items: puts on one of the character's own designs at a store, or takes the case off.
---@param src number player server id
---@param payload any { index }: a position in the owned list from 1, or nil for no case
---@return table envelope { equipped }
function actions.equip(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    if ITEMS then return util.fail('cases.disabled', 'Cases are not available here') end
    local index = type(payload) == 'table' and math.tointeger(tonumber(payload.index)) or nil

    return exclusive(cid, function()
        local _, owned = load(cid)
        local design = index and owned[index] or nil
        if index and not design then return util.fail('cases.notOwned', 'You do not own that case') end
        store.save(cid, design, owned)
        announce(src, design)
        return util.ok({ equipped = design or false })
    end)
end

---Without items: deletes one of the character's designs. Deleting the last copy of the one being
---worn takes it off.
---@param src number player server id
---@param payload any { index }: a position in the owned list from 1
---@return table envelope { owned, equipped }
function actions.remove(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    if ITEMS then return util.fail('cases.disabled', 'Cases are not available here') end
    local index = type(payload) == 'table' and math.tointeger(tonumber(payload.index)) or nil

    return exclusive(cid, function()
        local equipped, owned = load(cid)
        if not index or not owned[index] then return util.fail('cases.notOwned', 'You do not own that case') end
        table.remove(owned, index)
        local worn = rules.signature(equipped)
        local stillOwned = false
        for i = 1, #owned do
            if rules.signature(owned[i]) == worn then stillOwned = true break end
        end
        if not stillOwned then equipped = nil end
        store.save(cid, equipped, owned)
        announce(src, equipped)
        return util.ok({ owned = owned, equipped = equipped or false })
    end)
end

return actions
