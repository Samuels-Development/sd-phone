---@type table Case model contract (shared.casesdata): styles, parts, palette rows and part positions.
local data = require 'shared.casesdata'

---@type table Cases rules module; the table returned at end of file. One place decides what a valid
---case design is, so the server that sells it and every client that draws it agree.
local cases = {}

---@alias CaseDesign { style: string, color: integer, pattern?: string, patternColor?: integer, accessory?: string, accessoryColor?: integer, charm?: string, charmColor?: integer, sticker?: string, photo?: string|true, owner?: integer }

---@alias PhoneStyle { look: string, logo?: string, rings?: integer, bezel?: integer, buttons?: integer }

---Turns a list of names into a set.
---@param list string[]
---@return table<string, true>
local function setOf(list)
    local out = {}
    for i = 1, #list do out[list[i]] = true end
    return out
end

---@type integer Rows in the tint palette; a colour is a row index from 0.
local ROWS <const> = #data.Palette
---@type table<string, true> Known pattern names.
local PATTERNS <const> = setOf(data.Patterns)
---@type table<string, true> Known back-accessory names.
local ACCESSORIES <const> = setOf(data.Accessories)
---@type table<string, true> Known charm names.
local CHARMS <const> = setOf(data.Charms)
---@type table<string, true> Known sticker names.
local STICKERS <const> = setOf(data.Stickers)
---@type table<string, true> Known phone designs.
local LOOKS <const> = setOf(data.Looks)
---@type table<string, true> Known logos for the back of the phone.
local LOGOS <const> = setOf(data.Logos)
---@type string The design a phone has when nothing says otherwise.
local DEFAULT_LOOK <const> = data.Looks[1]
---@type string The sticker that is the wearer's own picture rather than one of the models.
local PHOTO <const> = 'photo'
---@type integer Longest picture address a design may carry.
local URL_MAX <const> = 512

---Reads a palette row out of untrusted input.
---@param value any
---@return integer row a valid row, 0 when the input is not one
local function row(value)
    local n = math.tointeger(tonumber(value))
    if not n or n < 0 or n >= ROWS then return 0 end
    return n
end

---Reads a part name out of untrusted input.
---@param value any
---@param known table<string, true>
---@return string? name the name when it is a known part
local function part(value, known)
    if type(value) == 'string' and known[value] then return value end
    return nil
end

---Reads a photo sticker's picture out of untrusted input: an https address with nothing in it that
---could break out of a URL, or `true` for "there is one, ask the server for it".
---@param value any
---@return string|true|nil picture
local function picture(value)
    if value == true then return true end
    if type(value) ~= 'string' or #value > URL_MAX then return nil end
    if not value:match('^https://[%w%-%._~:/%?#%[%]@!%$&\'%(%)%*%+,;=%%]+$') then return nil end
    return value
end

---Rebuilds a design from untrusted input, keeping only what the models can show: an open case takes
---nothing on its back, and a wallet's pocket leaves no room for an accessory or a sticker.
---@param input any a design from the NUI, the database or another player's statebag
---@return CaseDesign? design nil when the input names no known case style
function cases.clean(input)
    if type(input) ~= 'table' then return nil end
    local style = data.Styles[input.style]
    if type(input.style) ~= 'string' or not style then return nil end

    local design = { style = input.style, color = row(input.color) }
    local charm = part(input.charm, CHARMS)
    if charm then design.charm, design.charmColor = charm, row(input.charmColor) end
    if style.open then return design end

    local pattern = part(input.pattern, PATTERNS)
    if pattern then design.pattern, design.patternColor = pattern, row(input.patternColor) end
    if style.pocket then return design end

    local accessory = part(input.accessory, ACCESSORIES)
    if accessory then design.accessory, design.accessoryColor = accessory, row(input.accessoryColor) end
    if input.sticker == PHOTO then
        local photo = picture(input.photo)
        if photo then design.sticker, design.photo = PHOTO, photo end
    else
        design.sticker = part(input.sticker, STICKERS)
    end
    return design
end

---A copy of a design that is safe to show other players: a photo sticker keeps the fact that there
---is a picture but not its address, which watchers get from the server instead.
---@param design CaseDesign? a design that came out of cases.clean
---@return CaseDesign?
function cases.public(design)
    if not design or design.sticker ~= PHOTO then return design end
    local copy = {}
    for k, v in pairs(design) do copy[k] = v end
    copy.photo = true
    return copy
end

---A short text form of a clean design; two designs look the same exactly when these match.
---@param design CaseDesign? a design that came out of cases.clean
---@return string signature '' for no case
function cases.signature(design)
    if not design then return '' end
    return table.concat({
        design.style, design.color,
        design.pattern or '-', design.patternColor or 0,
        design.accessory or '-', design.accessoryColor or 0,
        design.charm or '-', design.charmColor or 0,
        design.sticker or '-', type(design.photo) == 'string' and design.photo or '',
    }, '.')
end

---Rebuilds a phone style from untrusted input: which design the phone is, the logo on its back, and
---the palette row of each trim fitted to it (lens rings, camera surround, button caps).
---@param input any a style from the NUI, local storage or another player's statebag
---@return PhoneStyle? style nil for the classic phone as the server ships it, which nothing needs to say
function cases.style(input)
    if type(input) ~= 'table' then return nil end
    local style = { look = (type(input.look) == 'string' and LOOKS[input.look]) and input.look or DEFAULT_LOOK }
    if type(input.logo) == 'string' and LOGOS[input.logo] then style.logo = input.logo end
    local fitted = style.logo ~= nil
    for i = 1, #data.Trims do
        local kind = data.Trims[i]
        if input[kind] ~= nil and input[kind] ~= false then
            style[kind] = row(input[kind])
            fitted = true
        end
    end
    if style.look == DEFAULT_LOOK and not fitted then return nil end
    return style
end

---A short text form of a clean phone style; two styles look the same exactly when these match.
---@param style PhoneStyle? a style that came out of cases.style
---@return string signature '' for the classic phone as the server ships it
function cases.styleSignature(style)
    if not style then return '' end
    local parts = { style.look, style.logo or '-' }
    for i = 1, #data.Trims do parts[#parts + 1] = style[data.Trims[i]] or '-' end
    return table.concat(parts, '.')
end

cases.data = data
cases.DEFAULT_LOOK = DEFAULT_LOOK
cases.PHOTO = PHOTO

return cases
