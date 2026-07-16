---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Marketplace persistence layer (server.marketplace.store): listing row CRUD.
local store = require 'server.marketplace.store'
---@type table Player bridge (bridge.server.player): citizenid/identifier lookup from a server id.
local player = require 'bridge.server.player'

---@type table Marketplace app config (configs/marketplace.lua): feed limit + field caps.
local MP = config.Marketplace
---@type table Actions module; the table returned at end of file. Every handler returns the
---{ success, message?, data? } envelope. The owner is the caller's citizenid and the timestamp is
---set here.
local actions = {}

local util = require 'server.util'
local digits, trim = util.digits, util.trim

---Caller identity, resolved from src via the player bridge.
---@param src integer player server id
---@return string|nil citizenid (nil while no character is loaded)
local function cidOf(src) return player.getIdentifier(src) end


---English ordinal suffix for a day number: "1st" / "2nd" / "3rd" / "11th".
---@param d integer day of the month
---@return string day day number with suffix
local function ordinal(d)
    local m100 = d % 100
    if m100 >= 11 and m100 <= 13 then return d .. 'th' end
    local m10 = d % 10
    if m10 == 1 then return d .. 'st' end
    if m10 == 2 then return d .. 'nd' end
    if m10 == 3 then return d .. 'rd' end
    return d .. 'th'
end

---Display string matching the UI: "Today, 14:52", "Yesterday, 09:10" or "May 25th, 2026" for
---anything older. Rendered server-side.
---@param ts integer unix seconds (the server-written created_at)
---@return string date display string
local function fmtDate(ts)
    local now   = os.time()
    local today = os.date('*t', now)
    local that  = os.date('*t', ts)
    local hm    = os.date('%H:%M', ts)
    if that.year == today.year and that.yday == today.yday then
        return 'Today, ' .. hm
    end
    local yd = os.date('*t', now - 86400)
    if that.year == yd.year and that.yday == yd.yday then
        return 'Yesterday, ' .. hm
    end
    return os.date('%B ', ts) .. ordinal(that.day) .. ', ' .. that.year
end

---A row's photo URLs: the JSON `images` array when present, else the legacy single `image`
---column. A corrupt array degrades to no photos.
---@param row table listing DB row
---@return string[] urls photo URLs (possibly empty)
local function decodeImages(row)
    local out = {}
    if row.images and row.images ~= '' then
        local ok, d = pcall(json.decode, row.images)
        if ok and type(d) == 'table' then
            for _, u in ipairs(d) do
                if type(u) == 'string' and u ~= '' then out[#out + 1] = u end
            end
        end
    end
    if #out == 0 and row.image and row.image ~= '' then out = { row.image } end
    return out
end

---DB row -> the shape the React app renders. The owner's citizenid is never sent; authorship is
---exposed only as the `mine` boolean, computed against the viewer's cid.
---@param row table listing DB row
---@param cid string|nil viewer citizenid (nil when building a broadcast copy)
---@return table listing UI listing shape
local function toListing(row, cid)
    local imgs = decodeImages(row)
    return {
        id     = tostring(row.id),
        title  = row.title,
        body   = row.body,
        price  = row.price,
        image  = imgs[1],
        images = (#imgs > 0 and imgs or nil),
        number = row.number,
        email  = row.email,
        date   = fmtDate(row.created_at),
        mine   = row.citizenid == cid,
    }
end

---The most-recent MP.ListLimit listings across all players, shaped for the UI. Read-only;
---the caller's identity is only used to stamp each row's `mine` flag.
---@param src integer player server id
---@return table result { success, data = { listings } }
function actions.list(src)
    local cid = cidOf(src)
    if not cid then return { success = false, data = { listings = {} } } end

    local out = {}
    for _, row in ipairs(store.recent(MP.ListLimit)) do
        out[#out + 1] = toListing(row, cid)
    end
    return { success = true, data = { listings = out } }
end

---Validates + normalises a listing payload into the columns we store, or nil + an error message.
---Title/body are required and capped, price clamps to MaxPrice (nil = "wanted"), images cap at
---MaxImages, and a number or email is required.
---@param payload table client payload (all fields untrusted)
---@param cid string caller citizenid (unused)
---@return table|nil fields columns to store, nil when invalid
---@return string? err rejection message when fields is nil
local function parseFields(payload, cid)
    local title = trim(payload.title)
    local body  = trim(payload.body)
    if #title < MP.MinTitleLength then return nil, 'Title required' end
    if #body  < MP.MinBodyLength  then return nil, 'Description required' end
    if #title > MP.MaxTitleLength then title = title:sub(1, MP.MaxTitleLength) end
    if #body  > MP.MaxBodyLength  then body  = body:sub(1, MP.MaxBodyLength)  end

    local price
    if type(payload.price) == 'number' and payload.price >= 0 then
        price = math.min(math.floor(payload.price), MP.MaxPrice)
    end

    local images = {}
    local function addImg(u)
        local url = trim(u)
        if url ~= '' and #images < (MP.MaxImages or 3) then
            images[#images + 1] = url:sub(1, MP.MaxImageUrlLength)
        end
    end
    if type(payload.images) == 'table' then
        for _, u in ipairs(payload.images) do addImg(u) end
    end
    if #images == 0 then addImg(payload.image) end

    local number = digits(payload.number)
    if #number > MP.MaxContactLength then number = number:sub(1, MP.MaxContactLength) end

    local email = trim(payload.email):lower()
    if email == '' then email = nil
    elseif #email > 128 then email = email:sub(1, 128) end

    if number == '' and not email then
        return nil, 'Add a phone number or email'
    end

    return {
        title  = title, body = body, price = price,
        image  = images[1], images = (#images > 0 and json.encode(images) or nil),
        number = number, email = email,
    }
end

---Pushes a live feed change to every OTHER player; the author is excluded. Broadcast items are
---built with cid=nil and carry only public feed fields.
---@param exceptSrc integer author server id to skip
---@param payload table feed push { type, item? } or { type, id? }
local function broadcastFeed(exceptSrc, payload)
    for _, pid in ipairs(GetPlayers()) do
        local id = tonumber(pid)
        if id and id ~= exceptSrc then
            TriggerClientEvent('sd-phone:client:marketplace:feed', id, payload)
        end
    end
end

---Creates a listing. Owner and timestamp are server-authoritative, listings cap at
---MP.MaxListingsPerPlayer per character, and every field passes parseFields. Everyone else gets a feed push.
---@param src integer player server id
---@param payload table|nil client payload (untrusted)
---@return table result { success, message?, data = { listing }? }
function actions.create(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    if store.countFor(cid) >= MP.MaxListingsPerPlayer then
        return { success = false, message = 'You have too many active listings' }
    end

    local f, err = parseFields(payload, cid)
    if not f then return { success = false, message = err } end

    local ts = os.time()
    local id = store.insert(cid, f.title, f.body, f.price, f.image, f.images, f.number, f.email, ts)
    local row = {
        id = id, citizenid = cid, title = f.title, body = f.body, price = f.price,
        image = f.image, images = f.images, number = f.number, email = f.email, created_at = ts,
    }
    broadcastFeed(src, { type = 'added', item = toListing(row, nil) })
    -- First-party hook: one server-local event per created listing; the payload carries a citizenid.
    TriggerEvent('sd-phone:server:marketplace:post', {
        id = row.id, source = src, citizenid = row.citizenid, number = row.number,
        title = row.title, body = row.body, price = row.price,
        image = row.image, images = row.images,
    })
    return { success = true, data = { listing = toListing(row, cid) } }
end

---Edits a listing. Ownership-gated: the row's stored citizenid must equal the caller's; the id
---must be a finite integer. The row is re-read after the write.
---@param src integer player server id
---@param payload table|nil client payload { id, ...fields } (untrusted)
---@return table result { success, message?, data = { listing }? }
function actions.update(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    local id = tonumber(payload.id)
    id = id and math.tointeger(id)
    if not id then return { success = false, message = 'Bad listing id' } end
    if store.ownerOf(id) ~= cid then return { success = false, message = 'Not your listing' } end

    local f, err = parseFields(payload, cid)
    if not f then return { success = false, message = err } end

    store.update(id, f.title, f.body, f.price, f.image, f.images, f.number, f.email)
    local row = store.byId(id)
    if not row then return { success = false, message = 'Listing not found' } end
    broadcastFeed(src, { type = 'updated', item = toListing(row, nil) })
    return { success = true, data = { listing = toListing(row, cid) } }
end

---Deletes a listing. Ownership-gated like update; the id is normalised to a finite integer and
---the feed push echoes it back as a string.
---@param src integer player server id
---@param id any listing id from the client (untrusted)
---@return table result { success, message?, data = { id }? }
function actions.delete(src, id)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    id = tonumber(id)
    id = id and math.tointeger(id)
    if not id then return { success = false, message = 'Bad listing id' } end
    if store.ownerOf(id) ~= cid then return { success = false, message = 'Not your listing' } end
    store.delete(id)
    broadcastFeed(src, { type = 'removed', id = tostring(id) })
    return { success = true, data = { id = tostring(id) } }
end

return actions
