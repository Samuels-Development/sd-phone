---@type table Case model contract (shared.casesdata): styles, parts, palette rows and part positions.
local data = require 'shared.casesdata'

---@type table Cases rules module; the table returned at end of file. One place decides what a valid
---case design is, so the server that sells it and every client that draws it agree.
local cases = {}

---@alias CaseDesign { style: string, color: integer, pattern?: string, patternColor?: integer, accessory?: string, accessoryColor?: integer, charm?: string, charmColor?: integer, stickers?: CaseSticker[], photo?: string|true, owner?: integer }

---@alias CaseSticker { id: string, x?: number, z?: number, turn?: integer, size?: integer }

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
---@type integer[] The sizes a sticker comes in, as the length of its edge in millimetres. A streamed
---model cannot be scaled once it is attached, so sd-phone-props streams every sticker once per size.
local STICKER_SIZES <const> = { 12, 16, 20, 24, 28, 32, 38, 44 }
---@type integer The size a sticker is when its design says nothing: the one every sticker used to be.
local STICKER_SIZE <const> = 24
---@type integer Stickers a case can carry.
local STICKER_MAX <const> = 6
---@type number Metres each sticker floats above the one before it. They are separate objects, and
---closer than this the game can draw two that overlap in either order.
local STICKER_STEP <const> = 0.00025
---@type number, number Half the width and half the height of the back of a phone, in millimetres. A
---sticker's centre may sit anywhere that keeps the whole sticker on it, cameras included, where the
---camera block stands over whatever is stuck under it.
local BACK_SIDE <const>, BACK_UP <const> = 39.0, 81.0
---@type number Millimetres up the phone a sticker sits when its design says nothing: where every
---sticker sat before they could be moved (casesdata StickerZ).
local STICKER_HOME <const> = data.StickerZ * 1000.0

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

---Reads a distance out of untrusted input, in half millimetres.
---@param value any
---@param low number
---@param high number
---@param home number what the design means by saying nothing
---@return number? mm nil for `home`, so a design that never moved its sticker reads as it always did
local function reach(value, low, high, home)
    local n = tonumber(value)
    if not n or n ~= n then return nil end
    n = math.floor(math.max(low, math.min(high, n)) * 2.0 + 0.5) / 2.0
    if n == home then return nil end
    return n
end

---Reads how far a sticker is turned out of untrusted input, in steps of five degrees.
---@param value any
---@return integer? degrees nil for upright
local function turn(value)
    local n = tonumber(value)
    if not n or n ~= n then return nil end
    n = math.tointeger(math.floor(math.max(-180.0, math.min(180.0, n)) / 5.0 + 0.5) * 5)
    if n == 0 or n == -180 then return n == -180 and 180 or nil end
    return n
end

---Reads a sticker's size out of untrusted input: the nearest size stickers come in.
---@param value any
---@return integer size millimetres along its edge
local function sized(value)
    local n = tonumber(value)
    if not n or n ~= n then return STICKER_SIZE end
    local best = STICKER_SIZE
    for i = 1, #STICKER_SIZES do
        if math.abs(STICKER_SIZES[i] - n) < math.abs(best - n) then best = STICKER_SIZES[i] end
    end
    return best
end

---Rebuilds one sticker from untrusted input: its size, where it sits and how it is turned. The
---bigger the sticker, the less room its centre has. Saying nothing about any of them is the size,
---place and angle every sticker had before they could be changed.
---@param id string a known sticker name, or PHOTO
---@param input table
---@return CaseSticker
local function sticker(id, input)
    local size = sized(input.size)
    local side, up = BACK_SIDE - size / 2.0, BACK_UP - size / 2.0
    return {
        id   = id,
        size = size ~= STICKER_SIZE and size or nil,
        x    = reach(input.x, -side, side, 0.0),
        z    = reach(input.z, -up, up, STICKER_HOME),
        turn = turn(input.turn),
    }
end

---What comes after a sticker's model name for its size.
---@param entry CaseSticker a sticker out of a clean design
---@return string suffix '' for the size stickers have always been, else '_<millimetres>'
function cases.stickerSuffix(entry)
    return entry.size and ('_%d'):format(entry.size) or ''
end

---Where a sticker sits on the back and how it is turned.
---@param entry CaseSticker a sticker out of a clean design
---@param index integer its position in the design's list, from 1: later ones sit on top
---@return number x metres from the middle of the back, along the phone's X
---@return number z metres up the phone from its centre
---@return number degrees to turn its object about the axis through the back: a design counts a turn
---clockwise as seen from behind, and an attached object turns the other way
---@return number lift metres it floats off the back
function cases.stickerPlace(entry, index)
    return (entry.x or 0.0) / 1000.0, (entry.z or STICKER_HOME) / 1000.0, -(entry.turn or 0) + 0.0,
        data.StickerLift + (index - 1) * STICKER_STEP
end

---The photo sticker in a design, when it has one.
---@param design CaseDesign? a design that came out of cases.clean
---@return CaseSticker? entry
---@return integer? index its position in the design's list
function cases.photoSticker(design)
    for index, entry in ipairs(design and design.stickers or {}) do
        if entry.id == PHOTO then return entry, index end
    end
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

---Copies the stickers from untrusted input onto a design being rebuilt: up to STICKER_MAX of them,
---in the order given, which is the order they are stacked in. One of them may be the wearer's own
---picture. A design from before a case could carry several names its one sticker in fields of its
---own (sticker, stickerX, stickerZ, stickerTurn, stickerSize), and is read as a list of one.
---@param design CaseDesign the design being rebuilt
---@param input table
local function stick(design, input)
    local source = input.stickers
    if type(source) ~= 'table' then
        if input.sticker == nil then return end
        source = { { id = input.sticker, x = input.stickerX, z = input.stickerZ, turn = input.stickerTurn, size = input.stickerSize } }
    end
    local shot = picture(input.photo)
    local list, pictured = {}, false
    for i = 1, #source do
        local entry = source[i]
        if #list >= STICKER_MAX then break end
        if type(entry) == 'table' then
            if entry.id == PHOTO then
                if shot and not pictured then
                    pictured = true
                    list[#list + 1] = sticker(PHOTO, entry)
                end
            elseif part(entry.id, STICKERS) then
                list[#list + 1] = sticker(entry.id, entry)
            end
        end
    end
    if #list > 0 then design.stickers = list end
    if pictured then design.photo = shot end
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
    stick(design, input)
    return design
end

---A copy of a design that is safe to show other players: a photo sticker keeps the fact that there
---is a picture but not its address, which watchers get from the server instead.
---@param design CaseDesign? a design that came out of cases.clean
---@return CaseDesign?
function cases.public(design)
    if not design or not cases.photoSticker(design) then return design end
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
    local stuck = {}
    for i, entry in ipairs(design.stickers or {}) do
        stuck[i] = table.concat({ entry.id, entry.x or '', entry.z or '', entry.turn or '', entry.size or '' }, ':')
    end
    return table.concat({
        design.style, design.color,
        design.pattern or '-', design.patternColor or 0,
        design.accessory or '-', design.accessoryColor or 0,
        design.charm or '-', design.charmColor or 0,
        #stuck > 0 and table.concat(stuck, ',') or '-', type(design.photo) == 'string' and design.photo or '',
    }, '.')
end

---Turns a part name into words: 'paw_print' reads 'paw print'.
---@param name string
---@return string
local function words(name)
    return (name:gsub('_', ' '))
end

---A design in plain words, for the description of the item a case is.
---@param design CaseDesign a design that came out of cases.clean
---@return string text such as "Leather case, stripes pattern, ring, star charm, 3 stickers"
function cases.describe(design)
    local style = words(design.style)
    local parts = { style:sub(1, 1):upper() .. style:sub(2) .. ' case' }
    if design.pattern then parts[#parts + 1] = words(design.pattern) .. ' pattern' end
    if design.accessory then parts[#parts + 1] = words(design.accessory) end
    if design.charm then parts[#parts + 1] = words(design.charm) .. ' charm' end
    local stuck = design.stickers or {}
    if #stuck == 1 then
        parts[#parts + 1] = (stuck[1].id == PHOTO and 'photo' or words(stuck[1].id)) .. ' sticker'
    elseif #stuck > 1 then
        parts[#parts + 1] = ('%d stickers'):format(#stuck)
    end
    return table.concat(parts, ', ')
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
