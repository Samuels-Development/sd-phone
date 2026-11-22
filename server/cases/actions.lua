---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Shared server helpers (server.util): response envelopes and the configs/apps.lua switch.
local util = require 'server.util'
---@type table Player bridge (bridge.server.player): identity from a server-trusted source only.
local player = require 'bridge.server.player'
---@type table Banking bridge (bridge.server.banking): moves bank money and registers the movement.
local bank = require 'bridge.server.banking'
---@type table Banking actions (server.banking.actions): Wallet transaction log (log-only, moves no money).
local wallet = require 'server.banking.actions'
---@type table Cases rules (shared.cases): what a valid design is, and the model contract.
local rules = require 'shared.cases'
---@type table Cases persistence (server.cases.store).
local store = require 'server.cases.store'
---@type table Media guard (server.media.guard): proves a picture is in the caller's own gallery.
local guard = require 'server.media.guard'

---@type table Actions module; the table returned at end of file. Everything the Cases app can ask
---of the server: what is for sale, what the character owns, buying, wearing and deleting a case.
local actions = {}

---@type table Cases config (config.Cases): prices and limits.
local CFG <const> = config.Cases or {}
---@type table Price list (config.Cases.Prices).
local PRICES <const> = CFG.Prices or {}
---@type integer Designs a character can keep.
local MAX_OWNED <const> = math.max(1, math.tointeger(tonumber(CFG.MaxOwned)) or 12)
---@type table<string, true> Characters with a write in flight, so two taps cannot interleave.
local busy = {}

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

---What a design costs: its style plus every extra it carries.
---@param design CaseDesign a design that came out of rules.clean
---@return integer price
local function priceOfDesign(design)
    local total = priceOf(PRICES.Style, design.style)
    if design.pattern then total = total + priceOf(PRICES.Pattern, design.pattern) end
    if design.accessory then total = total + priceOf(PRICES.Accessory, design.accessory) end
    if design.charm then total = total + priceOf(PRICES.Charm, design.charm) end
    if design.sticker == rules.PHOTO then
        total = total + priceOf(PRICES.Photo, rules.PHOTO)
    elseif design.sticker then
        total = total + priceOf(PRICES.Sticker, design.sticker)
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

---Prices the stickers for the catalogue, each tagged with the group the app lists it under.
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

---Builds what the app lists for sale: the palette, every style and part, and their prices.
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

---Resolves the caller, refusing when the app is switched off or the player has no character.
---@param src number player server id
---@return string? cid framework per-character id
---@return table? refusal the envelope to return when there is no cid
local function caller(src)
    if not util.appEnabled('cases') then return nil, util.fail('cases.disabled', 'Cases are not available here') end
    local cid = player.getIdentifier(src)
    if not cid then return nil, util.fail('common.playerNotFound', 'Player not found') end
    return cid
end

---Runs a write for one character at a time.
---@param cid string framework per-character id
---@param fn fun(): table the write; its envelope is returned
---@return table envelope
local function exclusive(cid, fn)
    if busy[cid] then return util.fail('cases.busy', 'Still working on your last request') end
    busy[cid] = true
    local ok, res = pcall(fn)
    busy[cid] = nil
    if not ok then error(res, 0) end
    return res
end

---The app's opening state: what is for sale, what the character owns and wears, and their balance.
---@param src number player server id
---@return table envelope { catalog, owned, equipped, balance, maxOwned }
function actions.state(src)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    local equipped, owned = load(cid)
    return util.ok({
        catalog  = CATALOG,
        owned    = owned,
        equipped = equipped or false,
        balance  = bank.getBalance(src) or 0,
        maxOwned = MAX_OWNED,
    })
end

---The case a character is wearing, for the client to draw before the app has ever been opened.
---@param src number player server id
---@return table envelope { equipped }
function actions.equipped(src)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    local equipped = load(cid)
    return util.ok({ equipped = equipped or false })
end

---Buys a design with bank money, keeps it and puts it on.
---@param src number player server id
---@param payload any { design }
---@return table envelope { owned, equipped, balance }
function actions.buy(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    local design = rules.clean(type(payload) == 'table' and payload.design or nil)
    if not design then return util.fail('cases.invalidDesign', 'That case cannot be made') end
    if design.sticker == rules.PHOTO then
        design.photo = guard.photo(cid, design.photo)
        if not design.photo then return util.fail('cases.photoNotInGallery', 'Pick a photo from your own gallery') end
    end

    return exclusive(cid, function()
        local _, owned = load(cid)
        if #owned >= MAX_OWNED then
            return util.fail('cases.full', 'You can keep {n} cases. Delete one first.', { n = MAX_OWNED })
        end
        local price = priceOfDesign(design)
        if price > 0 and not bank.removeMoney(src, price, 'phone-case') then
            return util.fail('cases.insufficientFunds', 'Not enough money in the bank')
        end
        owned[#owned + 1] = design
        if not pcall(store.save, cid, design, owned) then
            if price > 0 then bank.addMoney(src, price, 'phone-case-refund') end
            return util.fail('common.serverError', 'Something went wrong')
        end
        if price > 0 then wallet.addExternal(cid, { label = 'Phone case', amount = -price, category = 'shopping' }) end
        return util.ok({ owned = owned, equipped = design, balance = bank.getBalance(src) or 0 })
    end)
end

---The picture on a player's photo sticker, for the clients that draw their phone. It was checked
---against the wearer's gallery when the case was bought, so it is safe to hand to a watcher.
---@param src number player server id
---@param payload any { target }: the wearer's server id
---@return table envelope { url }
function actions.photo(src, payload)
    local target = type(payload) == 'table' and math.tointeger(tonumber(payload.target)) or nil
    if not target or not util.appEnabled('cases') then return util.ok({ url = false }) end
    local cid = player.getIdentifier(target)
    if not cid then return util.ok({ url = false }) end
    local equipped = load(cid)
    local url = equipped and equipped.sticker == rules.PHOTO and type(equipped.photo) == 'string' and equipped.photo
    return util.ok({ url = url or false })
end

---Puts on one of the character's own designs, or takes the case off.
---@param src number player server id
---@param payload any { index }: a position in the owned list from 1, or nil for no case
---@return table envelope { equipped }
function actions.equip(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
    local index = type(payload) == 'table' and math.tointeger(tonumber(payload.index)) or nil

    return exclusive(cid, function()
        local _, owned = load(cid)
        local design = index and owned[index] or nil
        if index and not design then return util.fail('cases.notOwned', 'You do not own that case') end
        store.save(cid, design, owned)
        return util.ok({ equipped = design or false })
    end)
end

---Deletes one of the character's designs. Deleting the last copy of the one being worn takes it off.
---@param src number player server id
---@param payload any { index }: a position in the owned list from 1
---@return table envelope { owned, equipped }
function actions.remove(src, payload)
    local cid, refusal = caller(src)
    if not cid then return refusal end
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
        return util.ok({ owned = owned, equipped = equipped or false })
    end)
end

return actions
