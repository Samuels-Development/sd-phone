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
---@type table<string, true> Frame colours whose prop already is a phone in a case.
local NO_CASE <const> = {}
for _, colour in ipairs((config.Cases or {}).NoCase or {}) do NO_CASE[colour] = true end
---@type table|nil Phone designs and trims players may pick (configs/phone.lua Looks); nil when off.
local LOOKS <const> = (type(config.Phone.Looks) == 'table' and config.Phone.Looks.Enabled ~= false) and config.Phone.Looks or nil
---@type string Where this player's phone style is kept between sessions.
local STYLE_KVP <const> = 'sd-phone:phone-style'
---@type PhoneStyle|nil The design and trims of this player's own phone.
local style
---@type integer Milliseconds the equipped case is trusted before it is asked for again, so a
---character switch is picked up without an event for it.
local STALE_MS <const> = 60000
---@type vector3 What pulls a charm down, in metres per second squared.
local GRAVITY <const> = vector3(0.0, 0.0, -9.81)
---@type number Share of a charm's motion kept from one sixtieth of a second to the next.
local DAMPING <const> = 0.972
---@type number Metres beyond which another player's charm is left hanging as it was.
local SWING_RANGE <const> = 30.0
---@type string This resource's name, for the photo sticker page's address.
local RES <const> = GetCurrentResourceName()
---@type string The streamed texture dictionary the case models use (sd-phone-props).
local TXD <const> = 'sd_phone_cases'
---@type integer Pixels along each side of a photo sticker's texture.
local PHOTO_SIZE <const> = 256

---@type table<integer, { url: string, dui: integer, users: integer }> Photo slot -> the picture drawn into it.
local slots = {}
---@type integer Counts runtime texture dictionaries, so each one gets a name of its own.
local runtimeSeq = 0
---@type table<integer, { url: string|false, at: integer }> Server id -> that player's photo sticker, as last answered.
local photoCache = {}

---@type table<integer, { gen: integer, parts: integer[], chain: table? }> Prop entity -> what dresses it.
local worn = {}
---@type integer Bumped by every dress, so a dress superseded while a model streamed stops.
local generation = 0
---@type integer Props that currently carry a charm; the swing loop idles at zero.
local swinging = 0
---@type CaseDesign|nil The case this player owns and wears.
local equipped
---@type CaseDesign|false|nil A design being tried on from the app: false tries on "no case".
local preview
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
---@return integer? part the created object, nil when the model does not stream or the prop is gone
local function attach(parent, name, x, y, z, tintRow)
    local model = joaat(name)
    if not pcall(lib.requestModel, model, 1000) then return nil end
    if not DoesEntityExist(parent) then
        SetModelAsNoLongerNeeded(model)
        return nil
    end
    local coords = GetEntityCoords(parent)
    local obj = CreateObject(model, coords.x, coords.y, coords.z, false, true, true)
    SetEntityCollision(obj, false, false)
    AttachEntityToEntity(obj, parent, 0, x, y, z, 0.0, 0.0, 0.0, false, false, false, false, 2, true)
    if tintRow then SetObjectTextureVariation(obj, tintRow) end
    SetModelAsNoLongerNeeded(model)
    return obj
end

---Lists the fixed parts a design is made of on a phone body, in the order they are created.
---@param body string 'plain', 'shut' or 'open'
---@param design CaseDesign a design that came out of rules.clean
---@return { [1]: string, [2]: number, [3]: number, [4]: number, [5]: integer? }[] parts model, x, y, z, tint row
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
    if design.sticker and design.sticker ~= rules.PHOTO then
        parts[#parts + 1] = { 'sd_case_stk_' .. design.sticker, b.midX, back + DATA.StickerLift, DATA.StickerZ, nil }
    end
    return parts
end

---Percent-encodes a string for use as one query value.
---@param text string
---@return string
local function encode(text)
    return (text:gsub('[^%w%-%._~]', function(c) return ('%%%02X'):format(c:byte()) end))
end

---Claims a photo slot for a picture: the slot already showing it, or a free one that gets an
---off-screen page drawing the picture, whose image replaces that slot's sticker texture.
---@param url string an https picture address
---@return integer? slot nil when every slot shows some other picture
local function acquire(url)
    local free
    for i = 1, DATA.PhotoSlots do
        local slot = slots[i]
        if slot and slot.url == url then
            slot.users = slot.users + 1
            return i
        end
        if not slot and not free then free = i end
    end
    if not free then return nil end

    local dui = CreateDui(('nui://%s/web/dui/sticker.html?src=%s'):format(RES, encode(url)), PHOTO_SIZE, PHOTO_SIZE)
    slots[free] = { url = url, dui = dui, users = 1 }
    local started = GetGameTimer()
    while not IsDuiAvailable(dui) and GetGameTimer() - started < 5000 do Wait(50) end
    RequestStreamedTextureDict(TXD, false)
    started = GetGameTimer()
    while not HasStreamedTextureDictLoaded(TXD) and GetGameTimer() - started < 3000 do Wait(50) end
    runtimeSeq = runtimeSeq + 1
    local name = ('sd_case_photo_rt_%d'):format(runtimeSeq)
    CreateRuntimeTextureFromDuiHandle(CreateRuntimeTxd(name), 'photo', GetDuiHandle(dui))
    AddReplaceTexture(TXD, ('sd_case_photo_%d'):format(free), name, 'photo')
    return free
end

---Gives a photo slot back; the last user leaving frees it for another picture.
---@param index integer
local function release(index)
    local slot = slots[index]
    if not slot then return end
    slot.users = slot.users - 1
    if slot.users > 0 then return end
    RemoveReplaceTexture(TXD, ('sd_case_photo_%d'):format(index))
    DestroyDui(slot.dui)
    slots[index] = nil
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
    local obj = attach(parent, ('sd_case_stk_photo_%d'):format(slot), b.midX, b.backY + style.back + DATA.StickerLift, DATA.StickerZ, nil)
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
    entry.chain = { parent = parent, pivot = pivot, segs = segs, pts = {}, prev = {} }
    swinging = swinging + 1
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
        swinging = swinging - 1
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
            local obj = attach(parent, p[1], p[2], p[3], p[4], p[5])
            if worn[parent] ~= entry then
                if obj then DeleteObject(obj) end
                return
            end
            if obj then entry.parts[#entry.parts + 1] = obj end
        end
        if design.sticker == rules.PHOTO then stickPhoto(parent, body, design, entry) end
        if worn[parent] == entry and design.charm then hang(parent, body, design, entry) end
    end)
end

---Reduces a phone style to what this server offers: a design it does not list becomes the classic
---one, and trims go when they are switched off.
---@param input any a style from the NUI, local storage or another player's statebag
---@return PhoneStyle? style nil for the classic phone with no trims
function cases.offered(input)
    if not LOOKS then return nil end
    local clean = rules.style(input)
    if not clean then return nil end
    if clean.look ~= rules.DEFAULT_LOOK and type(LOOKS[clean.look]) ~= 'table' then clean.look = rules.DEFAULT_LOOK end
    if LOOKS.Trims == false then
        for i = 1, #DATA.Trims do clean[DATA.Trims[i]] = nil end
    end
    return rules.style(clean)
end

---The design and trims of this player's own phone.
---@return PhoneStyle? style nil for the classic phone with no trims
function cases.style()
    return style
end

---Changes this player's phone style and keeps it for next time.
---@param input any a style from the NUI; anything that is not one goes back to the classic phone
function cases.setStyle(input)
    style = cases.offered(input)
    if style then
        SetResourceKvp(STYLE_KVP, json.encode(style))
    else
        DeleteResourceKvp(STYLE_KVP)
    end
end

---What the Cases app needs to offer phone styles: the designs and trims this server allows, and the
---style in use.
---@return { enabled: boolean, looks: string[], trims: string[], style: PhoneStyle|false }
function cases.styleOptions()
    local looks, trims = {}, {}
    if LOOKS then
        for i = 1, #DATA.Looks do
            local look = DATA.Looks[i]
            if look == rules.DEFAULT_LOOK or type(LOOKS[look]) == 'table' then looks[#looks + 1] = look end
        end
        if LOOKS.Trims ~= false then trims = DATA.Trims end
    end
    return { enabled = LOOKS ~= nil and (#looks > 1 or #trims > 0), looks = looks, trims = trims, style = style or false }
end

---Moves one hanging charm on by a frame: each segment's end keeps its momentum, falls, and is
---pulled back to its length from the one above; then every segment is re-attached pointing down
---its own stretch of the chain.
---@param chain table the charm (parent, pivot, segs, pts, prev)
---@param dt number seconds since the last frame
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
    end

    local keep = DAMPING ^ (dt * 60.0)
    local fall = GRAVITY * (dt * dt)
    for i = 1, #pts do
        local now = pts[i]
        pts[i] = now + (now - prev[i]) * keep + fall
        prev[i] = now
    end

    local anchor = pivot
    for i = 1, #pts do
        local reach = pts[i] - anchor
        local length = #reach
        if length > 0.000001 then pts[i] = anchor + reach * (segs[i].len / length) end
        anchor = pts[i]
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

---Tries a design on locally, or stops trying one on.
---@param design any a design to try, false to try "no case", nil to go back to the equipped one
function cases.preview(design)
    if design == nil then
        preview = nil
    else
        preview = rules.clean(design) or false
    end
end

---What this player's `sdPhone` statebag says about their case: the equipped one, with a photo
---sticker's address left out.
---@param frame string the phone's frame colour
---@return CaseDesign?
function cases.broadcast(frame)
    return rules.public(cases.worn(frame))
end

---The case other players should see on this player's phone: the equipped one, never a try-on.
---@param frame string the phone's frame colour
---@return CaseDesign?
function cases.worn(frame)
    if NO_CASE[frame] then return nil end
    if GetGameTimer() - fetchedAt > STALE_MS then refresh() end
    return equipped
end

---The case to draw on this player's own phone: a try-on when there is one, else the equipped case.
---@param frame string the phone's frame colour
---@return CaseDesign?
function cases.mine(frame)
    local own = cases.worn(frame)
    if NO_CASE[frame] then return nil end
    if preview ~= nil then return preview or nil end
    return own
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
    if ok then style = cases.offered(saved) end
end

-- Swings every hanging charm each frame, and idles while nobody in range carries one.
CreateThread(function()
    while true do
        if swinging <= 0 then
            Wait(500)
        else
            Wait(0)
            local dt = math.min(GetFrameTime(), 0.05)
            local here = GetEntityCoords(cache.ped)
            for parent, entry in pairs(worn) do
                local chain = entry.chain
                if chain and DoesEntityExist(parent) and #(GetEntityCoords(parent) - here) < SWING_RANGE then
                    swing(chain, dt)
                end
            end
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

return cases
