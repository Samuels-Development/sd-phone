---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Cases rules (shared.cases): what a valid design is, and the model contract.
local rules = require 'shared.cases'

---@type table Cases module; the table returned at end of file. Holds the case this player wears and
---dresses a phone prop in one: the case is extra objects attached to the prop, each tinted from a row
---of the palette streamed by sd-phone-props. A charm is a short chain of objects that hangs from the
---prop's corner and swings.
local cases = {}

---@type table Case model contract (shared.casesdata).
local DATA <const> = rules.data
---@type boolean False when cases are switched off (config.Cases.Enabled): nobody's case is drawn.
local ENABLED <const> = (config.Cases or {}).Enabled ~= false
---@type table<string, true> Frame colours whose prop already is a phone in a case.
local NO_CASE <const> = {}
for _, colour in ipairs((config.Cases or {}).NoCase or {}) do NO_CASE[colour] = true end
---@type table|nil Phone designs and trims players may pick (configs/phone.lua Looks); nil when off.
local LOOKS <const> = (type(config.Phone.Looks) == 'table' and config.Phone.Looks.Enabled ~= false) and config.Phone.Looks or nil
---@type string Where this player's phone style is kept between sessions.
local STYLE_KVP <const> = 'sd-phone:phone-style'
---@type PhoneStyle|nil The logo and trims this player likes on their phones. The design is not in
---here: that comes with the phone (its item says, configs/phone.lua Items).
local style
---@type string The design of the phone in use, as its item says.
local itemLook = rules.DEFAULT_LOOK
---@type integer Milliseconds the equipped case is trusted before it is asked for again, so a
---character switch is picked up without an event for it.
local STALE_MS <const> = 60000
---@type vector3 What pulls a charm down, in metres per second squared.
local GRAVITY <const> = vector3(0.0, 0.0, -9.81)
---@type number Share of a charm's motion kept from one sixtieth of a second to the next.
local DAMPING <const> = 0.972
---@type number Metres from the camera beyond which a charm is left hanging as it was.
local SWING_RANGE <const> = 15.0
---@type number Metres from the camera within which a charm moves every frame. Further out it moves at
---STEP, where a few centimetres of chain swinging thirty times a second reads the same.
local CLOSE_RANGE <const> = 3.0
---@type number Seconds between moves of a charm further than CLOSE_RANGE from the camera.
local STEP <const> = 1.0 / 30.0
---@type number Metres a charm's links may still drift in one move for the chain to count as at rest.
local REST_DRIFT <const> = 0.0002
---@type integer Moves in a row a chain has to stay at rest before it stops being re-attached.
local REST_MOVES <const> = 10
---@type number Metres the corner a charm hangs from may move, or degrees the phone may turn, before a
---chain at rest is woken.
local WAKE_SHIFT <const>, WAKE_TURN <const> = 0.001, 0.5
---@type string This resource's name, for the photo sticker page's address.
local RES <const> = GetCurrentResourceName()
---@type string The streamed texture dictionary the case models use (sd-phone-props).
local TXD <const> = 'sd_phone_cases'
---@type integer Pixels along each side of a photo sticker's texture.
local PHOTO_SIZE <const> = 256

---@type table<integer, { url: string|nil, dui: integer, users: integer }> Photo slot -> its page and
---the picture drawn into it. A slot keeps its page and texture once made: a runtime texture
---dictionary cannot be freed, and a fresh browser per phone opened is the cost being avoided.
local slots = {}
---@type string The page a photo slot shows while no phone wears its picture.
local BLANK_PAGE <const> = 'about:blank'
---@type table<integer, { url: string|false, at: integer }> Server id -> that player's photo sticker, as last answered.
local photoCache = {}

---@type table<integer, { gen: integer, parts: integer[], chain: table? }> Prop entity -> what dresses it.
local worn = {}
---@type integer Bumped by every dress, so a dress superseded while a model streamed stops.
local generation = 0
---@type table<integer, table> Prop entity -> the charm hanging from it; the swing loop idles while empty.
local chains = {}
---@type CaseDesign|nil The case this player owns and wears.
local equipped
---@type integer Game timer of the last answer about the equipped case; -STALE_MS forces the first ask.
local fetchedAt = -STALE_MS
---@type boolean True while that question is in flight.
local fetching = false

---Creates one part and attaches it to the prop at an offset in the prop's own space.
---@param parent integer the phone prop
---@param name string model name
---@param x number
---@param y number
---@param z number
---@param tintRow integer? palette row; nil leaves the model untinted
---@param turned number? degrees to turn it about the axis through the phone's back
---@return integer? part the created object, nil when the model does not stream or the prop is gone
local function attach(parent, name, x, y, z, tintRow, turned)
    local model = joaat(name)
    if not pcall(lib.requestModel, model, 1000) then return nil end
    if not DoesEntityExist(parent) then
        SetModelAsNoLongerNeeded(model)
        return nil
    end
    local coords = GetEntityCoords(parent)
    local obj = CreateObject(model, coords.x, coords.y, coords.z, false, true, true)
    SetEntityCollision(obj, false, false)
    AttachEntityToEntity(obj, parent, 0, x, y, z, 0.0, turned or 0.0, 0.0, false, false, false, false, 2, true)
    if tintRow then SetObjectTextureVariation(obj, tintRow) end
    SetModelAsNoLongerNeeded(model)
    return obj
end

---Lists the fixed parts a design is made of on a phone body, in the order they are created.
---@param body string 'plain', 'shut' or 'open'
---@param design CaseDesign a design that came out of rules.clean
---@return { [1]: string, [2]: number, [3]: number, [4]: number, [5]: integer?, [6]: number? }[] parts model, x, y, z, tint row, degrees turned
local function partsOf(body, design)
    local b, style = DATA.Bodies[body], DATA.Styles[design.style]
    local back = b.backY + style.back
    local parts = { { ('sd_case_%s_%s'):format(design.style, body), 0.0, 0.0, 0.0, design.color } }
    if design.pattern then
        parts[#parts + 1] = { ('sd_case_pat_%s_%s'):format(design.pattern, b.patternBase), b.patternDx, back + DATA.PatternLift, 0.0, design.patternColor }
    end
    if design.accessory then
        parts[#parts + 1] = { 'sd_case_acc_' .. design.accessory, b.midX, back, DATA.AccessoryZ, design.accessoryColor }
    end
    for index, entry in ipairs(design.stickers or {}) do
        if entry.id ~= rules.PHOTO then
            local x, z, turned, lift = rules.stickerPlace(entry, index)
            parts[#parts + 1] = { 'sd_case_stk_' .. entry.id .. rules.stickerSuffix(entry), b.midX + x, back + lift, z, nil, turned }
        end
    end
    return parts
end

---Percent-encodes a string for use as one query value.
---@param text string
---@return string
local function encode(text)
    return (text:gsub('[^%w%-%._~]', function(c) return ('%%%02X'):format(c:byte()) end))
end

---The page that draws a picture into a photo slot.
---@param url string an https picture address
---@return string
local function stickerPage(url)
    return ('nui://%s/web/dui/sticker.html?src=%s'):format(RES, encode(url))
end

---Claims a photo slot for a picture: the slot already showing it, or a free one whose off-screen page
---is pointed at the picture and whose image replaces that slot's sticker texture. A free slot that
---already has a page is taken before one that would need a new browser, and each slot's page and
---runtime texture are made once, the first time it is used.
---@param url string an https picture address
---@return integer? slot nil when every slot shows some other picture
local function acquire(url)
    local reuse, fresh
    for i = 1, DATA.PhotoSlots do
        local slot = slots[i]
        if slot and slot.url == url and slot.users > 0 then
            slot.users = slot.users + 1
            return i
        end
        if slot and slot.users <= 0 then
            reuse = reuse or i
        elseif not slot then
            fresh = fresh or i
        end
    end
    local index = reuse or fresh
    if not index then return nil end

    local slot = slots[index]
    if slot then
        slot.url, slot.users = url, 1
        SetDuiUrl(slot.dui, stickerPage(url))
    else
        slot = { url = url, dui = CreateDui(stickerPage(url), PHOTO_SIZE, PHOTO_SIZE), users = 1 }
        slots[index] = slot
        local started = GetGameTimer()
        while not IsDuiAvailable(slot.dui) and GetGameTimer() - started < 5000 do Wait(50) end
        CreateRuntimeTextureFromDuiHandle(CreateRuntimeTxd(('sd_case_photo_rt_%d'):format(index)), 'photo', GetDuiHandle(slot.dui))
    end
    RequestStreamedTextureDict(TXD, false)
    local started = GetGameTimer()
    while not HasStreamedTextureDictLoaded(TXD) and GetGameTimer() - started < 3000 do Wait(50) end
    AddReplaceTexture(TXD, ('sd_case_photo_%d'):format(index), ('sd_case_photo_rt_%d'):format(index), 'photo')
    return index
end

---Gives a photo slot back; the last user leaving frees it for another picture. The slot keeps its page,
---blanked so it stops holding the picture, for the next picture to reuse.
---@param index integer
local function release(index)
    local slot = slots[index]
    if not slot or slot.users <= 0 then return end
    slot.users = slot.users - 1
    if slot.users > 0 then return end
    slot.url = nil
    RemoveReplaceTexture(TXD, ('sd_case_photo_%d'):format(index))
    SetDuiUrl(slot.dui, BLANK_PAGE)
end

---The picture on another player's photo sticker, as the server holds it. Asked at most once a
---minute per player: a watcher never takes the address from the wearer's own client.
---@param owner integer server id of the wearer
---@return string? url
local function photoOf(owner)
    local known = photoCache[owner]
    if known and GetGameTimer() - known.at < STALE_MS then return known.url or nil end
    local res = lib.callback.await('sd-phone:server:cases:photo', false, { target = owner })
    local url = type(res) == 'table' and res.success == true and type(res.data) == 'table' and res.data.url or false
    photoCache[owner] = { url = type(url) == 'string' and url or false, at = GetGameTimer() }
    return photoCache[owner].url or nil
end

---Sticks a design's photo sticker on the prop, in a slot showing its picture.
---@param parent integer the phone prop
---@param body string 'plain', 'shut' or 'open'
---@param design CaseDesign a design that came out of rules.clean, with a photo sticker
---@param entry table the prop's entry in `worn`
local function stickPhoto(parent, body, design, entry)
    local url = design.owner and photoOf(design.owner) or (type(design.photo) == 'string' and design.photo or nil)
    if not url or worn[parent] ~= entry then return end
    local slot = acquire(url)
    if not slot then return end
    if worn[parent] ~= entry then
        release(slot)
        return
    end
    entry.photoSlot = slot
    local b, style = DATA.Bodies[body], DATA.Styles[design.style]
    local photo, index = rules.photoSticker(design)
    local x, z, turned, lift = rules.stickerPlace(photo, index)
    local obj = attach(parent, ('sd_case_stk_photo_%d%s'):format(slot, rules.stickerSuffix(photo)), b.midX + x, b.backY + style.back + lift, z, nil, turned)
    if worn[parent] ~= entry then
        if obj then DeleteObject(obj) end
        return
    end
    if obj then entry.parts[#entry.parts + 1] = obj end
end

---Hangs a design's charm from the prop's corner: one object per segment, handed to the swing loop.
---@param parent integer the phone prop
---@param body string 'plain', 'shut' or 'open'
---@param design CaseDesign a design that came out of rules.clean, with a charm
---@param entry table the prop's entry in `worn`
local function hang(parent, body, design, entry)
    local b, style = DATA.Bodies[body], DATA.Styles[design.style]
    local pivot = vector3(b.charmX, b.midY, b.bottomZ - style.side)
    local segs = {}
    for _, segment in ipairs(DATA.CharmParts[design.charm] or {}) do
        local obj = attach(parent, 'sd_case_charm_' .. segment, pivot.x, pivot.y, pivot.z, design.charmColor)
        if worn[parent] ~= entry then
            if obj then DeleteObject(obj) end
            for i = 1, #segs do DeleteObject(segs[i].obj) end
            return
        end
        if obj then segs[#segs + 1] = { obj = obj, len = DATA.SegmentLength[segment] or 0.01 } end
    end
    if #segs == 0 then return end
    entry.chain = { parent = parent, pivot = pivot, segs = segs, pts = {}, prev = {}, owed = 0.0, calm = 0 }
    chains[parent] = entry.chain
end

---Lists the trims a phone style fits to a body of a design, in the order they are created.
---@param body string 'plain', 'shut' or 'open'
---@param phoneStyle PhoneStyle? a style that came out of rules.style
---@param look string the design of the model that was actually welded
---@return { [1]: string, [2]: integer }[] trims model, tint row
local function trimsOf(body, phoneStyle, look)
    local out = {}
    if not phoneStyle then return out end
    for i = 1, #DATA.Trims do
        local kind = DATA.Trims[i]
        if phoneStyle[kind] then
            out[#out + 1] = { ('sd_trim_%s_%s_%s'):format(kind, look, body), phoneStyle[kind] }
        end
    end
    return out
end

---Takes the case off a prop: deletes every part attached to it. Safe on a prop with none.
---@param parent integer the phone prop
function cases.undress(parent)
    local entry = worn[parent]
    if not entry then return end
    worn[parent] = nil
    for i = 1, #entry.parts do
        if DoesEntityExist(entry.parts[i]) then DeleteObject(entry.parts[i]) end
    end
    if entry.photoSlot then release(entry.photoSlot) end
    if entry.chain then
        if chains[parent] == entry.chain then chains[parent] = nil end
        for i = 1, #entry.chain.segs do
            if DoesEntityExist(entry.chain.segs[i].obj) then DeleteObject(entry.chain.segs[i].obj) end
        end
    end
end

---Puts a case and the phone's trims on a prop, on its own thread: the parts stream one by one and
---must never hold up the phone. A prop deleted or re-dressed meanwhile gets nothing more, and what
---was built for it goes. Trims go on first; they sit on the phone itself, under any case.
---@param parent integer the phone prop
---@param body string 'plain', 'shut' or 'open'
---@param design CaseDesign? a design that came out of rules.clean; nil for no case
---@param phoneStyle PhoneStyle? a style that came out of rules.style; nil for no trims
---@param look string? the design of the model that was welded; the classic one when left out
function cases.dress(parent, body, design, phoneStyle, look)
    cases.undress(parent)
    if not DATA.Bodies[body] then return end
    local trims = trimsOf(body, phoneStyle, look or rules.DEFAULT_LOOK)
    if not design and #trims == 0 then return end
    generation = generation + 1
    local entry = { gen = generation, parts = {} }
    worn[parent] = entry
    CreateThread(function()
        for i = 1, #trims do
            local obj = attach(parent, trims[i][1], 0.0, 0.0, 0.0, trims[i][2])
            if worn[parent] ~= entry then
                if obj then DeleteObject(obj) end
                return
            end
            if obj then entry.parts[#entry.parts + 1] = obj end
        end
        if not design then return end
        for _, p in ipairs(partsOf(body, design)) do
            local obj = attach(parent, p[1], p[2], p[3], p[4], p[5], p[6])
            if worn[parent] ~= entry then
                if obj then DeleteObject(obj) end
                return
            end
            if obj then entry.parts[#entry.parts + 1] = obj end
        end
        if rules.photoSticker(design) then stickPhoto(parent, body, design, entry) end
        if worn[parent] == entry and design.charm then hang(parent, body, design, entry) end
    end)
end

---The logos a design is offered with on this server, in the order the app lists them.
---@param look string a design name
---@return string[] logos empty when the design is not offered at all
local function logosOf(look)
    local out = {}
    local set = LOOKS and type(LOOKS.Models) == 'table' and LOOKS.Models[look]
    if type(set) ~= 'table' then return out end
    for i = 1, #DATA.Logos do
        if type(set[DATA.Logos[i]]) == 'string' then out[#out + 1] = DATA.Logos[i] end
    end
    return out
end

---Whether this server has a design (configs/phone.lua Looks.Designs) and models to show it with.
---@param look string a design name
---@return boolean
local function usable(look)
    local designs = LOOKS and LOOKS.Designs
    if type(designs) == 'table' and designs[look] == false then return false end
    return look == rules.DEFAULT_LOOK or #logosOf(look) > 0
end

---The design a phone is here until its owner picks one: the first this server has.
---@return string look
local function homeLook()
    for i = 1, #DATA.Looks do
        if usable(DATA.Looks[i]) then return DATA.Looks[i] end
    end
    return rules.DEFAULT_LOOK
end

---@type string The design a phone is here until its owner picks one.
local HOME <const> = homeLook()

---Reduces a phone style to what this server offers: a design it does not have becomes the one it
---starts players on, a logo the design does not come with is dropped, and trims go when they are
---switched off. Nothing at all is the starting design too, so a server with only the second design
---shows it on everyone.
---@param input any a style from the NUI, local storage or another player's statebag
---@return PhoneStyle? style nil for the classic phone as the server ships it
function cases.offered(input)
    if not LOOKS then return nil end
    local clean = rules.style(input) or { look = HOME }
    if not usable(clean.look) then clean.look = HOME end
    local set = type(LOOKS.Models) == 'table' and LOOKS.Models[clean.look]
    if LOOKS.Logos == false or type(set) ~= 'table' or type(set[clean.logo]) ~= 'string' then clean.logo = nil end
    if LOOKS.Trims == false then
        for i = 1, #DATA.Trims do clean[DATA.Trims[i]] = nil end
    end
    return rules.style(clean)
end

---The stem a phone style's models are named from (configs/phone.lua Looks.Models): its design with
---the logo it asks for, or with the first logo that design lists.
---@param phoneStyle PhoneStyle? a style that came out of cases.offered
---@return string? stem nil for the models the server names as its default
function cases.stem(phoneStyle)
    if not LOOKS or not phoneStyle or type(LOOKS.Models) ~= 'table' then return nil end
    local set = LOOKS.Models[phoneStyle.look]
    if type(set) ~= 'table' then return nil end
    if phoneStyle.logo and type(set[phoneStyle.logo]) == 'string' then return set[phoneStyle.logo] end
    if phoneStyle.look == rules.DEFAULT_LOOK then return nil end
    local first = logosOf(phoneStyle.look)[1]
    return first and set[first] or nil
end

---This player's logo and trims on a phone of a given design.
---@param look string? the phone's design; the one in use when left out
---@return PhoneStyle? style nil for the classic phone as the server ships it
function cases.styleFor(look)
    local wanted = { look = look or itemLook }
    for key, value in pairs(style or {}) do
        if key ~= 'look' then wanted[key] = value end
    end
    return cases.offered(wanted)
end

---The style of the phone this player is using: its own design, with their logo and trims.
---@return PhoneStyle? style nil for the classic phone with no trims
function cases.style()
    return cases.styleFor(itemLook)
end

---Says which design the phone in use is. Its item decides, and the server passes that on whenever
---a phone is opened.
---@param look any a design name; anything else is the classic one
function cases.setLook(look)
    itemLook = type(look) == 'string' and look or rules.DEFAULT_LOOK
end

---Changes the logo and trims this player likes and keeps them for next time. A design named in the
---input is ignored: that comes with the phone.
---@param input any a style from the case store; anything that is not one clears both
function cases.setStyle(input)
    local wanted = {}
    for key, value in pairs(type(input) == 'table' and input or {}) do
        if key ~= 'look' then wanted[key] = value end
    end
    wanted.look = rules.DEFAULT_LOOK
    style = rules.style(wanted)
    if style then
        SetResourceKvp(STYLE_KVP, json.encode(style))
    else
        DeleteResourceKvp(STYLE_KVP)
    end
end

---What a case store needs to offer logos and trims for a phone of a given design: the design it
---will be drawn as, the logos that design comes with here, the trims allowed, and the style in use.
---@param look string? the phone's design; the one in use when left out
---@return { enabled: boolean, looks: string[], logos: table<string, string[]>, trims: string[], style: PhoneStyle|false }
function cases.styleOptions(look)
    look = look or itemLook
    local logos, trims = {}, {}
    local choice = false
    if LOOKS then
        if not usable(look) then look = HOME end
        logos[look] = LOOKS.Logos ~= false and logosOf(look) or {}
        choice = #logos[look] > 1
        if LOOKS.Trims ~= false then trims = DATA.Trims end
    end
    return {
        enabled = LOOKS ~= nil and (#trims > 0 or choice),
        looks = { look }, logos = logos, trims = trims, style = cases.styleFor(look) or false,
    }
end

---Moves one hanging charm on by a step: each segment's end keeps its momentum, falls, and is
---pulled back to its length from the one above; then every segment is re-attached pointing down
---its own stretch of the chain. The momentum carried is scaled by how long this step is against the
---last one, so a charm moved every frame and one moved thirty times a second swing alike.
---@param chain table the charm (parent, pivot, segs, pts, prev)
---@param dt number seconds since the last step
---@return number drift the furthest any link moved this step, in metres
local function swing(chain, dt)
    local parent = chain.parent
    local pivot = GetOffsetFromEntityInWorldCoords(parent, chain.pivot.x, chain.pivot.y, chain.pivot.z)
    local segs, pts, prev = chain.segs, chain.pts, chain.prev
    if not pts[1] or #(pts[1] - pivot) > 1.0 then
        local drop = 0.0
        for i = 1, #segs do
            drop = drop + segs[i].len
            pts[i] = pivot - vector3(0.0, 0.0, drop)
            prev[i] = pts[i]
        end
        chain.lastDt = nil
    end

    local last = chain.lastDt
    local keep = DAMPING ^ (dt * 60.0) * ((last and last > 0.0) and dt / last or 1.0)
    local fall = GRAVITY * (dt * dt)
    chain.lastDt = dt
    for i = 1, #pts do
        local now = pts[i]
        pts[i] = now + (now - prev[i]) * keep + fall
        prev[i] = now
    end

    local anchor = pivot
    local drift = 0.0
    for i = 1, #pts do
        local reach = pts[i] - anchor
        local length = #reach
        if length > 0.000001 then pts[i] = anchor + reach * (segs[i].len / length) end
        anchor = pts[i]
        local moved = #(pts[i] - prev[i])
        if moved > drift then drift = moved end
    end

    anchor = pivot
    for i = 1, #pts do
        local from = GetOffsetFromEntityGivenWorldCoords(parent, anchor.x, anchor.y, anchor.z)
        local to = GetOffsetFromEntityGivenWorldCoords(parent, pts[i].x, pts[i].y, pts[i].z)
        local dir = to - from
        local length = #dir
        if length > 0.000001 then
            dir = dir / length
            local roll = math.deg(math.asin(math.max(-1.0, math.min(1.0, -dir.x))))
            local pitch = math.deg(math.atan(dir.y, -dir.z))
            AttachEntityToEntity(segs[i].obj, parent, 0, from.x, from.y, from.z, pitch, roll, 0.0,
                false, false, false, false, 2, true)
        end
        anchor = pts[i]
    end
    return drift
end

---@type integer Milliseconds the swing loop sleeps while no charm is near enough and on screen to move.
local IDLE_MS <const> = 250
---@type integer Milliseconds between moves of a charm beyond CLOSE_RANGE, and between checks on one at rest.
local STEP_MS <const> = math.floor(STEP * 1000)

---Shortest turn between two angles, in degrees.
---@param a number
---@param b number
---@return number
local function turnBetween(a, b)
    return math.abs((a - b + 180.0) % 360.0 - 180.0)
end

---Where a charm's corner of the phone is and which way the phone faces: what has to change before a
---chain at rest needs moving again.
---@param chain table
---@return vector3 corner, vector3 rotation
local function anchorOf(chain)
    local p = chain.pivot
    return GetOffsetFromEntityInWorldCoords(chain.parent, p.x, p.y, p.z), GetEntityRotation(chain.parent, 2)
end

---Whether the phone under a chain at rest has moved or turned since it came to rest.
---@param chain table
---@return boolean
local function stirred(chain)
    local corner, rot = anchorOf(chain)
    local rest = chain.rest
    return #(corner - rest.corner) > WAKE_SHIFT or turnBetween(rot.x, rest.rot.x) > WAKE_TURN
        or turnBetween(rot.y, rest.rot.y) > WAKE_TURN or turnBetween(rot.z, rest.rot.z) > WAKE_TURN
end

---Moves one charm on when it is due, and says how soon it wants looking at again. A charm off screen or
---out of range is left as it was and starts again from hanging straight down when it comes back, as
---whatever its phone did meanwhile would otherwise arrive as one violent jerk. Within CLOSE_RANGE it
---moves every frame, further out every STEP. A chain that has come to rest is no longer re-attached
---until its phone moves.
---@param chain table
---@param here vector3 the camera
---@param dt number seconds since the loop last ran
---@return integer wait milliseconds
local function tick(chain, here, dt)
    local parent = chain.parent
    if not DoesEntityExist(parent) then return IDLE_MS end
    local range = #(GetEntityCoords(parent) - here)
    if range > SWING_RANGE or not IsEntityOnScreen(parent) then
        if not chain.idle then
            chain.idle, chain.pts, chain.prev, chain.rest, chain.calm, chain.owed = true, {}, {}, nil, 0, 0.0
        end
        return IDLE_MS
    end
    chain.idle = false
    local close = range <= CLOSE_RANGE
    chain.owed = chain.owed + dt
    if chain.owed <= 0.0 or (not close and chain.owed < STEP) then return close and 0 or STEP_MS end
    if chain.rest then
        if not stirred(chain) then
            chain.owed = 0.0
            return STEP_MS
        end
        chain.rest, chain.calm, chain.lastDt = nil, 0, nil
    end
    local drift = swing(chain, math.min(chain.owed, 0.05))
    chain.owed = 0.0
    chain.calm = drift < REST_DRIFT and chain.calm + 1 or 0
    if chain.calm >= REST_MOVES then
        local corner, rot = anchorOf(chain)
        chain.rest = { corner = corner, rot = rot }
    end
    return close and 0 or STEP_MS
end

---Asks the server which case this character wears, once at a time, and reports a change.
local function refresh()
    if fetching then return end
    fetching = true
    CreateThread(function()
        local res = lib.callback.await('sd-phone:server:cases:equipped', false)
        fetching = false
        fetchedAt = GetGameTimer()
        if type(res) ~= 'table' or res.success ~= true then return end
        local before = rules.signature(equipped)
        equipped = rules.clean(res.data and res.data.equipped)
        if rules.signature(equipped) ~= before then TriggerEvent('sd-phone:client:cases:changed') end
    end)
end

---Records the case the server says this character wears.
---@param design any the server's `equipped`: a design, or false for none
function cases.set(design)
    equipped = rules.clean(design)
    fetchedAt = GetGameTimer()
end

---What this player's `sdPhone` statebag says about their case: the equipped one, with a photo
---sticker's address left out.
---@param frame string the phone's frame colour
---@return CaseDesign?
function cases.broadcast(frame)
    return rules.public(cases.worn(frame))
end

---The case on this player's phone, for a phone of the given frame colour.
---@param frame string the phone's frame colour
---@return CaseDesign? design nil for none, and for a frame that already comes in a case
function cases.worn(frame)
    if not ENABLED or NO_CASE[frame] then return nil end
    if GetGameTimer() - fetchedAt > STALE_MS then refresh() end
    return equipped
end

---The case this character has on their phone, whatever phone is in hand.
---@return CaseDesign?
function cases.equipped()
    return equipped
end

---Whether a frame colour's prop already comes in a case.
---@param frame string
---@return boolean
function cases.blocked(frame)
    return NO_CASE[frame] == true
end

cases.clean = rules.clean
cases.signature = rules.signature
cases.styleSignature = rules.styleSignature

do
    local stored = GetResourceKvpString(STYLE_KVP)
    local ok, saved = pcall(json.decode, stored or '')
    cases.setStyle(ok and saved or nil)
end

-- Swings the hanging charms that are near and on screen, as often as the nearest of them asks, and
-- idles while there are none. Consecutive frames take the frame time; a loop that slept takes the
-- time it slept.
CreateThread(function()
    local last, slept = GetGameTimer(), IDLE_MS
    while true do
        if not next(chains) then
            Wait(500)
            last, slept = GetGameTimer(), IDLE_MS
        else
            local now = GetGameTimer()
            local dt = slept == 0 and GetFrameTime() or (now - last) / 1000.0
            last = now
            local here = GetFinalRenderedCamCoord()
            local wait = IDLE_MS
            for _, chain in pairs(chains) do
                local want = tick(chain, here, dt)
                if want < wait then wait = want end
            end
            slept = wait
            Wait(wait)
        end
    end
end)

-- A safety net for props deleted by something that never called undress: their parts would
-- otherwise hang in the air where the phone last was.
CreateThread(function()
    while true do
        Wait(2000)
        for parent in pairs(worn) do
            if not DoesEntityExist(parent) then cases.undress(parent) end
        end
    end
end)

-- The photo slots' pages live as long as the resource: this is where they go.
AddEventHandler('onResourceStop', function(res)
    if res ~= RES then return end
    for index, slot in pairs(slots) do
        if slot.users > 0 then RemoveReplaceTexture(TXD, ('sd_case_photo_%d'):format(index)) end
        DestroyDui(slot.dui)
    end
    slots = {}
end)

return cases
