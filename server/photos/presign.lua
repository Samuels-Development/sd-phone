---@type table sd-phone config root (configs/config.lua): Photos.DirectUpload.
local config   = require 'configs.config'
---@type table Media uploader (server.photos.uploader): the active provider and the media token.
local uploader = require 'server.photos.uploader'
---@type table Photos persistence layer (server.photos.store): the global URL read and the
---video/still classifier a claimed URL is checked against.
local store    = require 'server.photos.store'
---@type table Media URL ledger (server.media.ledger): every URL this server has ever hosted, for
---any app, which is what a claim is really measured against.
local ledger   = require 'server.media.ledger'
---@type table Shared upload budget (server.photos.mediaLimit): a slot is paid for when it is minted.
local mediaLimit = require 'server.photos.mediaLimit'
---@type table Player bridge (bridge.server.player): the character a slot is minted for.
local player   = require 'bridge.server.player'

---@type table Presign module; the table returned at end of file. Mints one-shot upload slots so a
---client can put media straight into Fivemanage over ordinary HTTPS, and decides whether the URL
---it reports back afterwards may be written into phone_photos.
---
---That second job is the whole trust boundary. On the sliced path the server produced the URL
---from bytes it had in hand, so guard.photo could treat any phone_photos row as proof of
---ownership. Here the client reports the URL, and every check below is what keeps that inference
---true.
---
---What no check here can do is bound what lands in the bucket. Probed against the live API on
---2026-09-16: one presigned URL accepts any number of uploads of any size until its token
---expires, and the expiry is checked when an upload FINISHES, so it cannot be shortened below the
---time a real clip takes to send. A player holding a slot can fill the owner's storage for as long
---as it lives, and never report back. That is why the path is opt-in (AllowDirectUpload), why a
---slot is paid for in full against the upload budget the moment it is minted rather than when it
---is claimed, and why a player whose slots keep coming back unused loses the path.
local presign = {}

---@type table Photos config (configs/photos.lua): the DirectUpload switch.
local PHOTOS = config.Photos or require 'configs.photos'

---@type string Fivemanage endpoint that mints a one-shot upload URL.
local PRESIGN_URL <const> = 'https://api.fivemanage.com/api/v3/file/presigned-url'

---@type string Host every claimed URL must sit under, trailing slash included.
local CDN_HOST <const> = 'https://r2.fivemanage.com/'

---@type string Folder prefix for a folder-scoped Fivemanage token, trailing slash included, or ''.
---Uploads made with such a token come back as <CDN>/<team>/<folder>/<name>, so the claim has to
---know the folder or refuses every one of them as foreign. From configs/photos.lua MediaPath, else
---the sd_phone_media_path convar. Segments of [%w%-_] only, so `..` can't walk out of the bucket.
local MEDIA_PATH <const> = (function()
    local p = (PHOTOS.MediaPath ~= nil and PHOTOS.MediaPath ~= '' and PHOTOS.MediaPath)
        or GetConvar('sd_phone_media_path', '')
    p = tostring(p):gsub('^/+', ''):gsub('/+$', '')
    if p == '' then return '' end
    if (('/' .. p):gsub('/[%w%-_]+', '')) ~= '' then
        print(('^1[sd-phone:photos]^0 MediaPath %q is not a plain folder path - ignored'):format(p))
        return ''
    end
    return p .. '/'
end)()

---@type integer Longest URL a claim may carry. phone_photos.url is VARCHAR(512).
local MAX_URL_CHARS <const> = 512

---@type integer How often expired slots are swept, in ms.
local SWEEP_MS <const> = 60000

---@type integer Minimum gap between slot mints for one character (ms). Shared by every app that
---mints, so a client cannot round-robin between them.
local MINT_COOLDOWN_MS <const> = 5000

---@type integer Upload speed a slot's lifetime is sized for, in bytes per second. The token has to
---outlive a real upload of the largest file the caller accepts on a slow uplink, because the
---provider checks the expiry when the upload ends; anything shorter only breaks honest players.
local TTL_FLOOR_BPS <const> = 256 * 1024
---@type integer Shortest slot lifetime, in seconds.
local TTL_MIN_S <const> = 60
---@type integer Longest slot lifetime, in seconds.
local TTL_MAX_S <const> = 600

---@type integer Unused, expired or refused slots a character may rack up before losing the path.
local STRIKE_LIMIT <const> = 3
---@type integer Seconds a strike counts for.
local STRIKE_WINDOW_S <const> = 3600
---@type integer Seconds a character is kept off the direct path once it reaches the limit.
local LOCKOUT_S <const> = 3600

---@type table<string, table<string, boolean>> Extensions a claim may end in, each mapped to the
---kinds that extension can legitimately be. The provider names the stored
---object and takes the extension from a content sniff, not from the filename sent with the upload
---- probing it on 2026-09-09 with a `.jpg` filename around text bytes returned a `.txt` object -
---so an extension here is the provider's verdict on the content, and a `.html` can only appear if
---the bytes really are one.
---
---This says only whether the phone hosts that sort of file. WHICH kind a given object is comes
---from the content type, because the extension cannot always say: MediaRecorder writes both a
---video clip and a voice memo into `.webm`, and only `video/webm` against `audio/webm` tells them
---apart.
---
---It has to stay a subset of what the apps can render: store.isVideoUrl reads the same extension
---to decide whether a photo row is a clip or a still, so admitting one it does not know would
---save a row that renders as a broken image.
local MEDIA_EXT <const> = {
    jpg  = { image = true }, jpeg = { image = true }, png = { image = true },
    webp = { image = true }, gif  = { image = true },
    mp4  = { video = true }, mov  = { video = true }, m4v = { video = true },
    mp3  = { audio = true }, m4a  = { audio = true }, wav = { audio = true },
    oga  = { audio = true }, weba = { audio = true },
    -- The two containers that carry either. MediaRecorder writes a clip and a voice memo into the
    -- same `.webm`, so this pair is why the kind cannot be read off the extension alone.
    webm = { video = true, audio = true },
    ogg  = { video = true, audio = true },
}

---@alias PresignSlot { cid: string, teamId: string|nil, exp: integer, maxBytes: integer, ticket: table|nil, pending: boolean|nil }

---@type table<number, PresignSlot> The outstanding upload slot for each source. One per player, and
---a player holding a live slot cannot mint another until it is claimed or expires: a presigned
---URL cannot be revoked, so replacing a slot would only hand out a second live URL.
local slots = {}

---@type table<string, integer> GetGameTimer() of each character's last mint.
local lastMintAt = {}
---@type table<string, integer[]> os.time() of each character's recent strikes.
local strikes = {}
---@type table<string, integer> os.time() until which a character may not mint.
local lockedUntil = {}

---@type table<string, integer> Six-bit value of each base64url character (RFC 4648 section 5).
local B64URL_VALUE = {}
do
    local alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for i = 1, #alphabet do B64URL_VALUE[alphabet:sub(i, i)] = i - 1 end
end

---Decodes an unpadded base64url segment to the bytes it stands for; nil for anything carrying a
---character outside the alphabet, so a run of text that merely looks like a segment cannot be
---read as one.
---@param seg string
---@return string|nil bytes
local function b64urlDecode(seg)
    local acc, bits, out = 0, 0, {}
    for i = 1, #seg do
        local v = B64URL_VALUE[seg:sub(i, i)]
        if not v then return nil end
        acc  = (acc << 6) | v
        bits = bits + 6
        if bits >= 8 then
            bits = bits - 8
            out[#out + 1] = string.char((acc >> bits) & 0xFF)
        end
    end
    return table.concat(out)
end

---Reads the team and the expiry out of the JWT carried by a presigned URL.
---
---Where in the URL that token sits is the provider's to change, so rather than assume a query
---parameter name every three-part base64url run is tried and the first whose middle segment
---decodes to a payload naming a team wins. The host matches that shape too (api.fivemanage.com),
---which is exactly why a candidate only counts once it has decoded to something.
---
---The signature is never verified. This is a token the server minted seconds ago over its own
---authenticated channel, so nothing here is a trust decision and there is no HMAC key to want.
---Only the two scalars are read, by pattern, which keeps the module loadable outside FiveM.
---@param url string presigned upload URL
---@return string|nil teamId, integer|nil exp unix seconds
local function readToken(url)
    for _, payloadSeg in url:gmatch('([%w%-_]+)%.([%w%-_]+)%.[%w%-_]+') do
        local payload = b64urlDecode(payloadSeg)
        if payload and payload:find('"teamId"', 1, true) then
            local teamId = payload:match('"teamId"%s*:%s*"([^"]+)"') or payload:match('"teamId"%s*:%s*(%d+)')
            local exp    = tonumber(payload:match('"exp"%s*:%s*(%d+)'))
            -- The team lands in a URL prefix, so it is held to what can appear in one. It comes
            -- from our own token; this is only here so a surprise never reaches the comparison.
            if teamId and exp and teamId:match('^[%w%-_]+$') then return teamId, exp end
        end
    end
    return nil, nil
end

---One header by name, whatever case the provider sent it in.
---@param headers table|nil
---@param name string lowercase header name
---@return string|nil value
local function header(headers, name)
    if type(headers) ~= 'table' then return nil end
    for k, v in pairs(headers) do
        if type(k) == 'string' and k:lower() == name then
            return type(v) == 'table' and v[1] or v
        end
    end
    return nil
end

---Records a slot that was taken and not spent honestly: expired unclaimed, abandoned on disconnect,
---or claimed with a URL that failed a check. A real player's upload fails now and then, so one
---strike costs nothing; a client farming slots reaches the limit within minutes and is sent back
---to the server-relayed path, where every byte passes the budget before it is uploaded.
---@param cid string|nil
---@param why string
local function strike(cid, why)
    if type(cid) ~= 'string' then return end
    local now = os.time()
    local kept = {}
    for _, t in ipairs(strikes[cid] or {}) do
        if now - t < STRIKE_WINDOW_S then kept[#kept + 1] = t end
    end
    kept[#kept + 1] = now
    strikes[cid] = kept
    if #kept >= STRIKE_LIMIT then
        lockedUntil[cid] = now + LOCKOUT_S
        strikes[cid] = nil
        print(('^1[sd-phone:photos]^0 [PRESIGN] %s left %d upload slots unused or failed their checks (last: %s); direct upload is off for them for %d min.')
            :format(cid, #kept, why, LOCKOUT_S // 60))
    end
end

---Seconds a slot for files up to `maxBytes` should live.
---@param maxBytes integer
---@return integer
local function ttlFor(maxBytes)
    local s = math.ceil(maxBytes / TTL_FLOOR_BPS) + 30
    return math.max(TTL_MIN_S, math.min(TTL_MAX_S, s))
end

---Whether this server can mint upload slots at all. False sends every app down its server-relayed
---path, which is why nothing in this change deletes it.
---@return boolean
function presign.available()
    -- Opt-in, under a name older configs never set. Until 2026-09-16 the switch was `DirectUpload`
    -- and shipped true, so honouring it would leave every existing install exposed.
    if PHOTOS.AllowDirectUpload ~= true then return false end
    -- Shut until the ledger knows what already exists: a claim answered from a half-filled ledger
    -- would accept the very URLs it is there to refuse.
    if not ledger.ready() then return false end
    if uploader.provider() ~= 'fivemanage' then return false end
    return uploader.mediaKey() ~= ''
end

---Mints an upload slot for `src` and hands back the URL the page should POST to. Asynchronous:
---calls `cb(url|nil, code|nil)` exactly once. Only the URL crosses to the client; the team and
---the expiry stay here, because they are what the claim is later measured against.
---
---Every gate that bounds cost lives here rather than in the callers, so an app added later cannot
---forget one: a loaded character, no lockout, no live slot, the mint cooldown, and `maxBytes`
---reserved against the upload budget before the provider is even asked.
---@param src number player the upload will come from
---@param opts { maxBytes: integer } the largest object the caller's claim will accept
---@param cb fun(url: string|nil, code: 'unavailable'|'busy'|'cooldown'|'rate-limit'|'provider'|nil)
function presign.mint(src, opts, cb)
    local maxBytes = math.floor(tonumber(type(opts) == 'table' and opts.maxBytes or nil) or 0)
    if not presign.available() or maxBytes <= 0 then
        cb(nil, 'unavailable')
        return
    end

    -- The real character: with unique phones on, getIdentifier is the SIM in the phone, and a
    -- lockout or cooldown keyed by it would reset on every SIM swap.
    local cid = player.getRealIdentifier(src)
    if type(cid) ~= 'string' or cid == '' then
        cb(nil, 'unavailable')
        return
    end

    local now = os.time()
    local held = slots[src]
    if held then
        if now < held.exp then
            cb(nil, 'busy')
            return
        end
        slots[src] = nil
        if not held.pending then strike(held.cid, 'expired unclaimed') end
    end

    -- After the stale slot is counted, so the strike that reaches the limit also stops this mint.
    if (lockedUntil[cid] or 0) > now then
        cb(nil, 'unavailable')
        return
    end

    local nowMs = GetGameTimer()
    if lastMintAt[cid] and nowMs - lastMintAt[cid] < MINT_COOLDOWN_MS then
        cb(nil, 'cooldown')
        return
    end

    local okBudget, _, ticket = mediaLimit.reserve(src, maxBytes)
    if not okBudget then
        cb(nil, 'rate-limit')
        return
    end

    lastMintAt[cid] = nowMs
    local ttl = ttlFor(maxBytes)
    -- Held while the provider answers, so a second callback fired in the same instant meets a
    -- live slot instead of minting alongside this one.
    slots[src] = { cid = cid, exp = now + ttl + 30, maxBytes = maxBytes, ticket = ticket, pending = true }

    ---Gives the reservation back when no URL was handed out: nothing can have been uploaded.
    ---@param code string
    local function refuse(code)
        if slots[src] and slots[src].pending then slots[src] = nil end
        mediaLimit.settle(ticket, 0)
        cb(nil, code)
    end

    PerformHttpRequest(('%s?expiresAt=%d'):format(PRESIGN_URL, now + ttl), function(status, body)
        if status ~= 200 and status ~= 201 then
            print(('^1[sd-phone:photos]^0 [PRESIGN] Fivemanage refused to mint a slot: HTTP %s %s')
                :format(tostring(status), tostring(body)))
            refuse('provider')
            return
        end

        local okJson, decoded = pcall(json.decode, body or '')
        local url = (okJson and type(decoded) == 'table' and type(decoded.data) == 'table')
            and decoded.data.presignedUrl or nil
        if type(url) ~= 'string' or url == '' then
            print(('^1[sd-phone:photos]^0 [PRESIGN] no presignedUrl in the response: %s'):format(tostring(body)))
            refuse('provider')
            return
        end

        -- Without a readable token there is no bucket to pin the claim to, and a slot that cannot
        -- be checked is worse than no slot at all.
        local teamId, exp = readToken(url)
        if not teamId or not exp then
            print('^1[sd-phone:photos]^0 [PRESIGN] the presigned URL carried no readable token; not minting a slot.')
            refuse('provider')
            return
        end

        -- The player left while the provider answered; the URL is never handed out.
        if not (slots[src] and slots[src].pending and slots[src].ticket == ticket) then
            mediaLimit.settle(ticket, 0)
            cb(nil, 'unavailable')
            return
        end

        slots[src] = { cid = cid, teamId = teamId, exp = exp, maxBytes = maxBytes, ticket = ticket }
        cb(url)
    end, 'GET', '', { ['Authorization'] = uploader.mediaKey() })
end

---Validates a URL a client reports having uploaded to, and hands back the trusted URL and the
---size the CDN says it is. Asynchronous: calls `cb(url|nil, code|nil, bytes|nil)` exactly once.
---
---The four rules, in the order a forged claim meets them:
---  1. an unexpired slot must exist for this source, and it is spent whatever the outcome;
---  2. the URL must sit inside the bucket that slot was minted for, be shaped like one of this
---     CDN's objects, and end in an extension this app hosts;
---  3. no other row in phone_photos may already hold it, or one player could claim a URL they saw
---     another share and guard.photo would then honour it as their own;
---  4. the object must actually be media of the kind its name promises, and within the byte cap.
---
---Rule 2 does more work than it looks. The provider names the stored object itself and derives
---the extension from a content sniff, so `.mp4` is Fivemanage's verdict on the bytes rather than
---anything the client chose to call the file.
---@param src number player making the claim
---@param url any URL the client reports, entirely untrusted
---@param opts { maxBytes: integer, kinds: table<'image'|'video'|'audio', boolean> } what this
---caller will accept. Both belong to the caller rather than to this module: the Camera and the
---MDT bodycam have ceilings an order of magnitude apart, and they take different kinds - Voice
---Memos wants audio and only audio, while a camera claim admitting an mp3 would drop a sound file
---into somebody's photo gallery.
---@param cb fun(url: string|nil, code: 'no-slot'|'expired'|'foreign-url'|'duplicate'|'probe-failed'|'bad-type'|'too-large'|nil, bytes: integer|nil)
function presign.claim(src, url, opts, cb)
    opts = type(opts) == 'table' and opts or {}
    local maxBytes = math.floor(tonumber(opts.maxBytes) or 0)
    local kinds    = type(opts.kinds) == 'table' and opts.kinds or {}
    local slot = slots[src]
    if not slot or slot.pending then
        cb(nil, 'no-slot')
        return
    end
    -- Spent on sight, whatever happens below. One mint yields at most one claim, and a claim that
    -- fails falls back to the sliced path rather than getting another go at the same slot.
    slots[src] = nil

    -- The slot's own ceiling wins over a caller's larger one: the reservation was sized to it.
    maxBytes = math.min(maxBytes, slot.maxBytes or 0)

    ---Refuses the claim and counts it against the character. The reservation stays charged:
    ---whatever was uploaded to the slot has been billed already.
    ---@param code string
    local function refuse(code)
        strike(slot.cid, code)
        cb(nil, code)
    end

    if os.time() >= slot.exp then
        refuse('expired')
        return
    end

    if type(url) ~= 'string' or #url > MAX_URL_CHARS then
        refuse('foreign-url')
        return
    end

    local prefix = CDN_HOST .. slot.teamId .. '/' .. MEDIA_PATH
    if url:sub(1, #prefix) ~= prefix then
        refuse('foreign-url')
        return
    end

    -- The prefix pin is a string comparison, so the rest of the URL is held to the one shape this
    -- CDN produces: a single object name. Anything looser and `team7/../other/x.mp4` sits under
    -- the prefix here yet resolves outside the bucket the moment a browser normalises it.
    local name, ext = url:sub(#prefix + 1):match('^([%w%-_]+)%.([%a%d]+)$')
    local extKinds = name and MEDIA_EXT[(ext or ''):lower()] or nil
    if not extKinds then
        refuse('foreign-url')
        return
    end

    -- Both, and in this order. The ledger covers every app that has ever hosted media here; the
    -- phone_photos read covers URLs that arrived some other way, such as an allowlisted import.
    if ledger.has(url) or store.urlExistsAnywhere(url) then
        refuse('duplicate')
        return
    end

    -- One byte, not the file. A HEAD would be the natural probe and FiveM cannot send one at all
    -- (PerformHttpRequest answers status 0), but R2 honours Range: asking for `bytes=0-0` returns
    -- 206 with a single byte and a `content-range` naming the object's true length, which is all
    -- this needs. Downloading the object instead would cost the server 94 MB per bodycam
    -- recording, trading the packet loss this change removes for bandwidth somewhere else.
    PerformHttpRequest(url, function(status, body, headers)
        -- 206 is the expected answer. 200 means the range was ignored - a cached response does
        -- that - and the whole object arrived instead, which still answers both questions.
        if status ~= 206 and status ~= 200 then
            print(('^1[sd-phone:photos]^0 [PRESIGN] src=%s claimed an object that is not there: HTTP %s')
                :format(tostring(src), tostring(status)))
            refuse('probe-failed')
            return
        end

        -- The content type is what decides the kind, and it is the CDN's own verdict on the bytes
        -- rather than anything the client chose. The extension above only said the phone hosts
        -- this sort of file at all; it cannot say which sort, because `.webm` is both a clip and
        -- a voice memo.
        local ctype = header(headers, 'content-type')
        local kind  = type(ctype) == 'string' and ctype:match('^(%a+)/') or nil
        kind = kind and kind:lower() or nil

        -- What the object is allowed to be here. For an extension that can only be one thing, the
        -- CDN's verdict has to agree with it AND with what the caller takes: that is what refuses
        -- a .jpg served as video/mp4, which would otherwise be stored as a row store.isVideoUrl
        -- reads as a still and renders broken.
        --
        -- For a dual container the CDN's verdict is not usable. Fivemanage sniffs a voice memo
        -- recorded into a .webm as `video/webm`, because WebM is a video container and the sniff
        -- sees the container rather than the tracks inside it. Holding audio callers to `audio/`
        -- there refused every real voice memo. So for .webm and .ogg the claim accepts the object
        -- when the caller takes either kind the extension could be, and leans on the extension for
        -- what the app will render. Nothing that carries real weight rests on this - the bucket,
        -- the slot, uniqueness and the size cap are all unaffected.
        local ambiguous = false
        do
            local n = 0
            for _ in pairs(extKinds) do n = n + 1 end
            ambiguous = n > 1
        end

        local allowed = false
        if ambiguous then
            for k in pairs(extKinds) do
                if kinds[k] then allowed = true break end
            end
        else
            allowed = kind ~= nil and kinds[kind] == true and extKinds[kind] == true
        end

        if not allowed then
            print(('^1[sd-phone:photos]^0 [PRESIGN] src=%s claimed a .%s the CDN serves as %s, which this caller does not take')
                :format(tostring(src), ext, tostring(ctype)))
            refuse('bad-type')
            return
        end

        -- `content-range: bytes 0-0/98304000` states the whole object's length, which is the
        -- number the cap is about. Only when the range was ignored does the body's own length
        -- stand in for it, and then the body really is the whole object.
        local range = header(headers, 'content-range')
        local total = range and tonumber(range:match('/(%d+)%s*$')) or nil
        local bytes = total or (type(body) == 'string' and #body or 0)
        if bytes <= 0 then
            refuse('probe-failed')
            return
        end
        if bytes > maxBytes then
            refuse('too-large')
            return
        end

        -- The object is honest, so the reservation comes down to what it really weighs.
        mediaLimit.settle(slot.ticket, bytes)

        -- Recorded before the caller is told, so the object is known to every later claim even if
        -- the row that was going to hold it never saves.
        ledger.record(url)
        cb(url, nil, bytes)
    end, 'GET', '', { ['Range'] = 'bytes=0-0' })
end

---Drops a source's slot. Called when a player leaves, so a slot cannot outlive them and be spent
---by whoever the server hands that source id to next.
---@param src number
function presign.forget(src)
    local slot = slots[src]
    slots[src] = nil
    if slot and not slot.pending then strike(slot.cid, 'abandoned on disconnect') end
end

-- Sweeps slots whose token has expired. A claim checks the expiry itself, so this is where a slot
-- that was taken and never claimed gets counted, and where the table is kept from holding a slot
-- per player who minted one and then never came back.
CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        local now = os.time()
        for src, slot in pairs(slots) do
            if now >= slot.exp then
                slots[src] = nil
                if not slot.pending then strike(slot.cid, 'expired unclaimed') end
            end
        end
        for cid, untilAt in pairs(lockedUntil) do
            if untilAt <= now then lockedUntil[cid] = nil end
        end
    end
end)

return presign
