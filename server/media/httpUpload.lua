---@type table Upload budget (server.photos.mediaLimit): holds a slot's worst case until its body arrives.
local mediaLimit = require 'server.photos.mediaLimit'

---@type table HTTP upload ingest; the table returned at end of file. Takes a recording from the
---phone over the server's own HTTP port, so its bytes never travel as a game network event.
local httpUpload = {}

---@class HttpUploadSlot
---@field src integer Player the slot was minted for.
---@field maxBytes integer Largest assembled body the slot accepts.
---@field expires integer os.time() after which the slot is dead; pushed back as each part lands.
---@field parts string[] Parts received so far, in order.
---@field received integer Bytes received so far.
---@field busy boolean True while a part's body is still arriving.
---@field ticket table|nil Budget reservation, settled at the bytes that actually arrived.
---@field onBody fun(src: integer, body: string): table|nil Takes the assembled body; its answer goes back to the phone.

---@type integer Seconds a slot survives without a part arriving.
local SLOT_TTL <const> = 60

---@type integer Largest single part, in bytes. FXServer's HTTP server drops a request whose body
---is over 5 MiB, measured 2026-09-21: 5120 KB arrives and 5200 KB is cut off.
local MAX_PART_BYTES <const> = 4 * 1024 * 1024

---@type integer Slots one player may hold at once, so a photo does not cancel a recording mid-send.
local MAX_SLOTS_PER_PLAYER <const> = 3

---@type integer Milliseconds between two slots for one player.
local MINT_GAP_MS <const> = 1000

---@type string Path a phone posts to before it asks for a slot, to learn whether it reaches this
---handler at all. Answered for anyone and touches no slot.
local PROBE_PATH <const> = '/upload/probe'

---@type table<string, HttpUploadSlot> Live slots by token.
local slots = {}

---@type table<integer, table<string, boolean>> Tokens each player holds.
local owned = {}

---@type table<integer, integer> GetGameTimer() of each player's last slot.
local lastMint = {}

---@type table<string, string> Headers sent on every answer, so the phone's page may read it.
local CORS <const> = {
    ['Access-Control-Allow-Origin']  = '*',
    ['Access-Control-Allow-Methods'] = 'POST, OPTIONS',
    ['Access-Control-Allow-Headers'] = 'Content-Type',
    ['Content-Type']                 = 'application/json',
}

---Builds an unguessable 128-bit token.
---@return string token 32 hex characters.
local function newToken()
    return ('%08x%08x%08x%08x'):format(
        math.random(0, 0xFFFFFFFF), math.random(0, 0xFFFFFFFF),
        math.random(0, 0xFFFFFFFF), math.random(0, 0xFFFFFFFF))
end

---Closes a slot, settling its budget at the bytes that arrived.
---@param token string
local function close(token)
    local slot = slots[token]
    if not slot then return end
    slots[token] = nil
    if owned[slot.src] then owned[slot.src][token] = nil end
    if slot.ticket then mediaLimit.settle(slot.ticket, slot.received) end
end

---Closes every slot a player holds.
---@param src integer
function httpUpload.forget(src)
    for token in pairs(owned[src] or {}) do close(token) end
    owned[src] = nil
end

---Opens an upload slot for a player, holding their upload budget for its worst case until the body
---arrives. Refused while they are pacing, holding too many slots, or out of budget.
---@param src integer
---@param maxBytes integer Largest assembled body to accept.
---@param onBody fun(src: integer, body: string): table|nil Called with the assembled body once it has arrived.
---@return table|nil slot { path: string, partBytes: integer }
---@return string|nil reason 'cooldown'|'busy'|'identity'|'budget'|'server'
function httpUpload.mint(src, maxBytes, onBody)
    local now = GetGameTimer()
    if lastMint[src] and now - lastMint[src] < MINT_GAP_MS then return nil, 'cooldown' end

    local mine = owned[src] or {}
    owned[src] = mine
    local held, idle = 0, nil
    for token in pairs(mine) do
        local slot = slots[token]
        held = held + 1
        if slot and slot.received == 0 and not slot.busy
            and (not idle or slot.expires < slots[idle].expires) then idle = token end
    end
    if held >= MAX_SLOTS_PER_PLAYER then
        if not idle then return nil, 'busy' end
        close(idle)
    end

    local ok, why, ticket = mediaLimit.reserve(src, maxBytes)
    if not ok then return nil, why end

    lastMint[src] = now
    local token = newToken()
    slots[token] = {
        src = src, maxBytes = maxBytes, expires = os.time() + SLOT_TTL,
        parts = {}, received = 0, busy = false, ticket = ticket, onBody = onBody,
    }
    mine[token] = true
    return { path = '/upload/' .. token, partBytes = MAX_PART_BYTES }
end

---Answers a request with a status and a JSON body.
---@param res table FXServer HTTP response.
---@param status integer
---@param body table
local function reply(res, status, body)
    res.writeHead(status, CORS)
    res.send(json.encode(body))
end

---Reads the declared body size from a request's headers.
---@param headers table<string, string>|nil
---@return integer|nil length
local function contentLength(headers)
    if type(headers) ~= 'table' then return nil end
    return math.tointeger(tonumber(headers['Content-Length'] or headers['content-length']))
end

---Hands an assembled body to the slot's owner and answers the last part with what the owner said.
---@param res table FXServer HTTP response.
---@param slot HttpUploadSlot
---@param body string
local function deliver(res, slot, body)
    CreateThread(function()
        local ok, result = pcall(slot.onBody, slot.src, body)
        if not ok then
            print(('^1[sd-phone:media]^0 upload handler failed: %s'):format(tostring(result)))
            result = { success = false }
        end
        reply(res, 200, { ok = true, result = type(result) == 'table' and result or { success = true } })
    end)
end

---Serves POST /upload/<token>/<part>/<total>: parts arrive in order, one at a time, and the last
---one hands the assembled body to the slot's owner. POST /upload/probe is the reachability check.
SetHttpHandler(function(req, res)
    if req.method == 'OPTIONS' then return reply(res, 204, {}) end
    if req.method ~= 'POST' then return reply(res, 405, { ok = false, code = 'method' }) end
    if req.path == PROBE_PATH then return reply(res, 200, { ok = true }) end

    local token, part, total
    if type(req.path) == 'string' then
        token, part, total = req.path:match('^/upload/(%x+)/(%d+)/(%d+)$')
    end
    local slot = token and slots[token]
    if not token or not slot then return reply(res, 403, { ok = false, code = 'no-slot' }) end

    part, total = math.tointeger(tonumber(part)), math.tointeger(tonumber(total))
    local length = contentLength(req.headers)
    local fits = length and length > 0 and length <= MAX_PART_BYTES
        and slot.received + length <= slot.maxBytes
    if not part or not total or os.time() > slot.expires or slot.busy
        or part ~= #slot.parts + 1 or part > total or not fits then
        close(token)
        return reply(res, fits == false and 413 or 403, { ok = false, code = 'refused' })
    end

    slot.busy = true
    req.setDataHandler(function(body)
        slot.busy = false
        if slots[token] ~= slot then return reply(res, 403, { ok = false, code = 'no-slot' }) end
        if type(body) ~= 'string' or #body > MAX_PART_BYTES or slot.received + #body > slot.maxBytes then
            close(token)
            return reply(res, 413, { ok = false, code = 'too-large' })
        end

        slot.parts[part] = body
        slot.received = slot.received + #body
        slot.expires = os.time() + SLOT_TTL

        if part < total then return reply(res, 200, { ok = true }) end

        local assembled = table.concat(slot.parts)
        close(token)
        deliver(res, slot, assembled)
    end)
end)

---Sweeps slots nobody finished, so an abandoned upload does not hold its parts in memory.
CreateThread(function()
    while true do
        Wait(30000)
        local now = os.time()
        for token, slot in pairs(slots) do
            if now > slot.expires then close(token) end
        end
    end
end)

---Drops a departing player's slots.
AddEventHandler('playerDropped', function()
    httpUpload.forget(source)
    lastMint[source] = nil
end)

return httpUpload
