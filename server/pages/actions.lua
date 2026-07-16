---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Pages persistence layer (server.pages.store): post row CRUD.
local store = require 'server.pages.store'
---@type table Player bridge (bridge.server.player): citizenid/identifier lookup from a server id.
local player = require 'bridge.server.player'

---@type table Pages app config (configs/pages.lua): feed limit + field caps.
local PG = config.Pages
---@type table Actions module; the table returned at end of file. Every handler returns the
---{ success, message?, data? } envelope. The owner is the caller's citizenid and the timestamp is
---set here. Structural twin of server.marketplace.actions.
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
---@param row table post DB row
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
---@param row table post DB row
---@param cid string|nil viewer citizenid (nil when building a broadcast copy)
---@return table post UI post shape
local function toPost(row, cid)
    local imgs = decodeImages(row)
    return {
        id     = tostring(row.id),
        title  = row.title,
        body   = row.body,
        image  = imgs[1],
        images = (#imgs > 0 and imgs or nil),
        number = row.number,
        email  = row.email,
        date   = fmtDate(row.created_at),
        mine   = row.citizenid == cid,
    }
end

---The most-recent PG.ListLimit posts across all players, shaped for the UI. Read-only; the
---caller's identity is only used to stamp each row's `mine` flag.
---@param src integer player server id
---@return table result { success, data = { posts } }
function actions.list(src)
    local cid = cidOf(src)
    if not cid then return { success = false, data = { posts = {} } } end

    local out = {}
    for _, row in ipairs(store.recent(PG.ListLimit)) do
        out[#out + 1] = toPost(row, cid)
    end
    return { success = true, data = { posts = out } }
end

---Validates + normalises a post payload into the columns we store, or nil + an error message.
---Title/body are required and capped, images cap at MaxImages, and a number or email is required.
---@param payload table client payload (all fields untrusted)
---@param cid string caller citizenid (unused)
---@return table|nil fields columns to store, nil when invalid
---@return string? err rejection message when fields is nil
local function parseFields(payload, cid)
    local title = trim(payload.title)
    local body  = trim(payload.body)
    if #title < PG.MinTitleLength then return nil, 'Title required' end
    if #body  < PG.MinBodyLength  then return nil, 'Description required' end
    if #title > PG.MaxTitleLength then title = title:sub(1, PG.MaxTitleLength) end
    if #body  > PG.MaxBodyLength  then body  = body:sub(1, PG.MaxBodyLength)  end

    local price = nil

    local images = {}
    local function addImg(u)
        local url = trim(u)
        if url ~= '' and #images < (PG.MaxImages or 3) then
            images[#images + 1] = url:sub(1, PG.MaxImageUrlLength)
        end
    end
    if type(payload.images) == 'table' then
        for _, u in ipairs(payload.images) do addImg(u) end
    end
    if #images == 0 then addImg(payload.image) end

    local number = digits(payload.number)
    if #number > PG.MaxContactLength then number = number:sub(1, PG.MaxContactLength) end

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
            TriggerClientEvent('sd-phone:client:pages:feed', id, payload)
        end
    end
end

---Creates a post. Owner and timestamp are server-authoritative, posts cap at PG.MaxPostsPerPlayer
---per character, and every field passes parseFields. Everyone else gets a feed push.
---@param src integer player server id
---@param payload table|nil client payload (untrusted)
---@return table result { success, message?, data = { post }? }
function actions.create(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    if store.countFor(cid) >= PG.MaxPostsPerPlayer then
        return { success = false, message = 'You have too many active posts' }
    end

    local f, err = parseFields(payload, cid)
    if not f then return { success = false, message = err } end

    local ts = os.time()
    local id = store.insert(cid, f.title, f.body, f.price, f.image, f.images, f.number, f.email, ts)
    local row = {
        id = id, citizenid = cid, title = f.title, body = f.body, price = f.price,
        image = f.image, images = f.images, number = f.number, email = f.email, created_at = ts,
    }
    broadcastFeed(src, { type = 'added', item = toPost(row, nil) })
    -- First-party hook: one server-local event per created post; the payload carries a citizenid.
    TriggerEvent('sd-phone:server:pages:post', {
        id = row.id, source = src, citizenid = row.citizenid, number = row.number,
        title = row.title, body = row.body, price = row.price,
        image = row.image, images = row.images,
    })
    return { success = true, data = { post = toPost(row, cid) } }
end

---Edits a post. Ownership-gated: the row's stored citizenid must equal the caller's; the id must
---be a finite integer. The row is re-read after the write.
---@param src integer player server id
---@param payload table|nil client payload { id, ...fields } (untrusted)
---@return table result { success, message?, data = { post }? }
function actions.update(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    local id = tonumber(payload.id)
    id = id and math.tointeger(id)
    if not id then return { success = false, message = 'Bad post id' } end
    if store.ownerOf(id) ~= cid then return { success = false, message = 'Not your post' } end

    local f, err = parseFields(payload, cid)
    if not f then return { success = false, message = err } end

    store.update(id, f.title, f.body, f.price, f.image, f.images, f.number, f.email)
    local row = store.byId(id)
    if not row then return { success = false, message = 'Post not found' } end
    broadcastFeed(src, { type = 'updated', item = toPost(row, nil) })
    return { success = true, data = { post = toPost(row, cid) } }
end

---Deletes a post. Ownership-gated like update; the id is normalised to a finite integer and the
---feed push echoes it back as a string.
---@param src integer player server id
---@param id any post id from the client (untrusted)
---@return table result { success, message?, data = { id }? }
function actions.delete(src, id)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    id = tonumber(id)
    id = id and math.tointeger(id)
    if not id then return { success = false, message = 'Bad post id' } end
    if store.ownerOf(id) ~= cid then return { success = false, message = 'Not your post' } end
    store.delete(id)
    broadcastFeed(src, { type = 'removed', id = tostring(id) })
    return { success = true, data = { id = tostring(id) } }
end

return actions
