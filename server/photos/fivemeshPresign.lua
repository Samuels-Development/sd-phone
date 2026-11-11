local config = require 'configs.config'
local provider = require 'server.photos.fivemesh'
local crypto = require 'server.crypto'
local ledger = require 'server.media.ledger'
local probe = require 'server.media.probe'
local sniff = require 'server.media.sniff'
local store = require 'server.photos.store'
local mediaLimit = require 'server.photos.mediaLimit'
local player = require 'bridge.server.player'

---@type table FiveMesh direct uploads. Each player/app slot has its own unpredictable path.
local presign = {}
local MINT_URL <const> = 'https://api.fivemesh.io/v1/presigned-url'
local MINT_TIMEOUT_MS <const> = 15000
local COOLDOWN_MS <const> = 5000
local MIME_BY_KIND <const> = {
    image = { ['image/jpeg'] = true, ['image/png'] = true, ['image/webp'] = true, ['image/gif'] = true },
    video = { ['video/webm'] = true, ['video/mp4'] = true, ['video/quicktime'] = true, ['video/ogg'] = true },
    audio = { ['audio/webm'] = true, ['audio/ogg'] = true, ['audio/mp4'] = true, ['audio/mpeg'] = true, ['audio/wav'] = true },
}
local EXT_BY_MIME <const> = {
    ['image/jpeg'] = { jpg = true, jpeg = true }, ['image/png'] = { png = true },
    ['image/webp'] = { webp = true }, ['image/gif'] = { gif = true },
    ['video/webm'] = { webm = true }, ['video/mp4'] = { mp4 = true, m4v = true },
    ['video/quicktime'] = { mov = true }, ['video/ogg'] = { ogg = true },
    ['audio/webm'] = { webm = true, weba = true }, ['audio/ogg'] = { ogg = true, oga = true },
    ['audio/mp4'] = { m4a = true, mp4 = true }, ['audio/mpeg'] = { mp3 = true },
    ['audio/wav'] = { wav = true },
}

local slots, claims, lastMint, penalties = {}, {}, {}, {}

local function character(src)
    local cid = player.getRealIdentifier(src)
    return type(cid) == 'string' and cid ~= '' and cid or nil
end

local function strike(cid)
    local now = os.time()
    local penalty = penalties[cid]
    if not penalty or now >= penalty.expires then penalty = { count = 0, expires = now + 3600 } end
    penalty.count = penalty.count + 1
    penalties[cid] = penalty
end

function presign.available()
    return (config.Photos or {}).AllowDirectUpload == true and provider.configured()
        and provider.path() ~= nil and ledger.ready() and crypto.available() and probe.available()
end

local function escape(value)
    return (value:gsub('[^%w%-_%.~]', function(c) return ('%%%02X'):format(c:byte()) end))
end

local function allowedMimes(kinds)
    local allowed, list = {}, {}
    for kind, enabled in pairs(type(kinds) == 'table' and kinds or {}) do
        if enabled and MIME_BY_KIND[kind] then
            for mime in pairs(MIME_BY_KIND[kind]) do allowed[mime] = true end
        end
    end
    for mime in pairs(allowed) do list[#list + 1] = mime end
    table.sort(list)
    return allowed, list
end

---A reservation is paid before the provider is asked; only a URL never handed out is refunded.
---@param src integer
---@param opts {maxBytes: integer, kinds: table, purpose: string}
---@param cb fun(url: string|nil, code: string|nil)
function presign.mint(src, opts, cb)
    opts = type(opts) == 'table' and opts or {}
    local maxBytes = tonumber(opts.maxBytes)
    local cid = character(src)
    local allowed, mimes = allowedMimes(opts.kinds)
    if not presign.available() or not cid or not maxBytes or maxBytes ~= maxBytes
        or maxBytes == math.huge or maxBytes < 12 or #mimes == 0
        or type(opts.purpose) ~= 'string' or opts.purpose == '' then
        return cb(nil, 'unavailable')
    end
    maxBytes = math.floor(maxBytes)
    local now = os.time()
    local held = slots[src]
    if claims[src] or held and (held.pending or held.exp > now) then return cb(nil, 'busy') end
    if held then slots[src] = nil; strike(held.cid) end
    local penalty = penalties[cid]
    if penalty and now < penalty.expires and penalty.count >= 3 then return cb(nil, 'unavailable') end
    local nowMs = GetGameTimer()
    if lastMint[cid] and nowMs - lastMint[cid] < COOLDOWN_MS then return cb(nil, 'cooldown') end

    local nonce = crypto.randomHex(16)
    if type(nonce) ~= 'string' or #nonce ~= 32 or not nonce:match('^%x+$') then return cb(nil, 'unavailable') end
    local path = provider.path()
    path = (path ~= '' and path .. '/' or '') .. 'direct/' .. nonce
    local okBudget, _, ticket = mediaLimit.reserve(src, maxBytes)
    if not okBudget then return cb(nil, 'rate-limit') end
    lastMint[cid] = nowMs

    local ttl = math.max(60, math.min(600, math.ceil(maxBytes / (256 * 1024)) + 30))
    local slot = { cid = cid, purpose = opts.purpose, maxBytes = maxBytes, allowed = allowed,
        ticket = ticket, pending = true, exp = now + ttl }
    slots[src] = slot
    local finished = false
    local function refuse(code)
        if finished then return end
        finished = true
        if slots[src] == slot then slots[src] = nil end
        mediaLimit.settle(ticket, 0)
        cb(nil, code)
    end
    slot.cancel = function() refuse('unavailable') end
    SetTimeout(MINT_TIMEOUT_MS, function() refuse('provider') end)

    local query = ('?path=%s&maxFiles=1&maxFileSize=%d&expiresIn=%d&allowedMimeTypes=%s&allowCustomMetadata=false&randomizeName=true')
        :format(escape(path), maxBytes, ttl, escape(table.concat(mimes, ',')))
    PerformHttpRequest(MINT_URL .. query, function(status, body)
        if finished then return end
        if slots[src] ~= slot or character(src) ~= cid then return refuse('unavailable') end
        local ok, data = pcall(json.decode, body or '')
        data = ok and type(data) == 'table' and data or nil
        local url = data and data.uploadUrl
        local prefix = data and data.publicUrlPrefix
        local cap = data and tonumber(data.maxFileSize)
        local valid = (status == 200 or status == 201) and data and data.success == true
            and data.method == 'POST' and data.path == path and data.maxFiles == 1
            and data.allowCustomMetadata == false and data.randomizeName == true
            and cap and cap >= 12 and cap <= maxBytes and cap == math.floor(cap)
            and type(url) == 'string' and #url <= 2048
            and url:match('^https://api%.fivemesh%.io/v1/presigned%-url/[%w%-_]+$')
            and type(prefix) == 'string' and #prefix + #path + 50 <= 512
            and prefix:match('^https://[%w%.%-]+/[%w%-_]+/$')
            and type(data.allowedMimeTypes) == 'table' and #data.allowedMimeTypes > 0
        local enforced = {}
        if valid then
            for _, mime in ipairs(data.allowedMimeTypes) do
                if type(mime) ~= 'string' or not allowed[mime] then valid = false break end
                enforced[mime] = true
            end
        end
        if not valid then
            print(('^3[sd-phone:photos]^0 [PRESIGN] FiveMesh refused a bounded slot or returned an unsupported response (HTTP %s); using the server upload route.')
                :format(tostring(status)))
            return refuse('provider')
        end

        finished = true
        slot.pending, slot.cancel = false, nil
        slot.exp = os.time() + ttl
        slot.maxBytes, slot.allowed, slot.prefix = cap, enforced, prefix .. path .. '/'
        cb(url)
    end, 'GET', '', { ['Authorization'] = 'Bearer ' .. provider.key() })
end

---The client reports only a URL. Its prefix, app, owner, bytes and type are established here.
---@param src integer
---@param url any
---@param opts {maxBytes: integer, kinds: table, purpose: string}
---@param cb fun(url: string|nil, code: string|nil, bytes: integer|nil)
function presign.claim(src, url, opts, cb)
    opts = type(opts) == 'table' and opts or {}
    local slot = slots[src]
    if not slot or slot.pending then return cb(nil, 'no-slot') end
    slots[src] = nil
    claims[src] = slot
    local function refuse(code)
        if claims[src] == slot then claims[src] = nil end
        strike(slot.cid)
        cb(nil, code)
    end
    local function stillOwned()
        if claims[src] ~= slot then return false end
        if character(src) == slot.cid then return true end
        claims[src] = nil
        return false
    end
    if character(src) ~= slot.cid or opts.purpose ~= slot.purpose then return refuse('no-slot') end
    if os.time() >= slot.exp then return refuse('expired') end
    if type(url) ~= 'string' or #url > 512 or url:sub(1, #slot.prefix) ~= slot.prefix then
        return refuse('foreign-url')
    end
    local name, ext = url:sub(#slot.prefix + 1):match('^([%w%-_]+)%.([%a%d]+)$')
    if not name then return refuse('foreign-url') end
    ext = ext:lower()
    if ledger.has(url) or store.urlExistsAnywhere(url) then return refuse('duplicate') end
    -- Both database reads may yield. A disconnect or replacement slot cannot inherit this claim.
    if not stillOwned() then return cb(nil, 'no-slot') end

    probe.read(url, function(result, code)
        if not stillOwned() then return cb(nil, 'no-slot') end
        if not result then return refuse(code or 'probe-failed') end
        local mime = result.mime
        local extensions = EXT_BY_MIME[mime]
        local kind = type(mime) == 'string' and mime:match('^(%a+)/')
        local kinds = type(opts.kinds) == 'table' and opts.kinds or {}
        if not slot.allowed[mime] or not extensions or not extensions[ext] or not kinds[kind]
            or type(result.head) ~= 'string' or not sniff.matches('data:' .. mime .. ';base64,' .. result.head) then
            return refuse('bad-type')
        end
        local bytes, maxBytes = tonumber(result.bytes), tonumber(opts.maxBytes)
        if not bytes or bytes < 12 or bytes ~= math.floor(bytes) then return refuse('probe-failed') end
        if not maxBytes or maxBytes ~= maxBytes or bytes > math.min(slot.maxBytes, maxBytes) then
            return refuse('too-large')
        end
        -- The random per-slot directory excludes historical objects even on an older ledger.
        ledger.record(url)
        if not stillOwned() then return cb(nil, 'no-slot') end
        mediaLimit.settle(slot.ticket, bytes)
        claims[src] = nil
        cb(url, nil, bytes)
    end)
end

function presign.forget(src)
    local slot = slots[src] or claims[src]
    slots[src], claims[src] = nil, nil
    if slot then
        if slot.cancel then slot.cancel() else strike(slot.cid) end
    end
end

CreateThread(function()
    while true do
        Wait(60000)
        local now = os.time()
        for src, slot in pairs(slots) do
            if not slot.pending and now >= slot.exp then slots[src] = nil; strike(slot.cid) end
        end
        for cid, penalty in pairs(penalties) do
            if now >= penalty.expires then penalties[cid] = nil; lastMint[cid] = nil end
        end
    end
end)

return presign
