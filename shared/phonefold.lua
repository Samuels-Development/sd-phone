---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Phone kind module; the table returned at end of file. What kind of phone an item is,
---which its entry in configs/phone.lua Items says: whether it folds (`fold`) and which design it is
---(`look`), so a server sells every kind side by side.
local phonefold = {}

---@type string The design a phone item is when its entry does not say.
local CLASSIC <const> = 'classic'
---@type table<string, table> Item name -> its configs/phone.lua Items entry.
local byItem = {}
---@type boolean True when at least one phone item says whether it folds. A list written before
---items could say so marks none, and then every phone folds, as every phone did.
local marked = false
for _, entry in ipairs((config.Phone or {}).Items or {}) do
    if entry.item then byItem[entry.item] = entry end
    if entry.fold ~= nil then marked = true end
end

---Whether a phone item is a foldable. Phone.Foldable still has the last word on whether anything
---folds at all; this only says which items would.
---@param entry table a configs/phone.lua Items entry
---@return boolean
function phonefold.entry(entry)
    return not marked or entry.fold == true
end

---Whether the phone item of a given name is a foldable.
---@param name string item name
---@return boolean
function phonefold.item(name)
    local entry = byItem[name]
    return entry ~= nil and phonefold.entry(entry)
end

---The design a phone item is.
---@param entry table a configs/phone.lua Items entry
---@return string look 'classic' unless the entry names another
function phonefold.look(entry)
    return type(entry.look) == 'string' and entry.look or CLASSIC
end

---The design of the phone item of a given name.
---@param name string item name
---@return string? look nil for an item that is not a phone
function phonefold.itemLook(name)
    local entry = byItem[name]
    return entry and phonefold.look(entry) or nil
end

return phonefold
