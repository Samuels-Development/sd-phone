---@type table Player bridge (bridge.server.player): citizenid/source lookups.
local player    = require 'bridge.server.player'
---@type table App-accounts persistence (server.accounts.store): resolves which vibez account
---a character is signed into.
local acctStore = require 'server.accounts.store'
---@type table Vibez persistence layer (server.vibez.store): profile rows + id generator.
local store     = require 'server.vibez.store'
---@type table sd-phone config root (configs/config.lua).
local config    = require 'configs.config'

---@type table Live module; the table returned at end of file.
local live = {}

---@type table Live-video knobs (configs Vibez.Live when present; photogram's defaults otherwise).
local CFG = (config.Vibez and config.Vibez.Live) or {}
---@type integer Concurrent viewers allowed on one stream (0 = unlimited).
local MAX_VIEWERS = tonumber(CFG.MaxViewers) or 50
---@type integer Per-viewer latent-event send ceiling (bytes/s).
local RELAY_BPS   = tonumber(CFG.RelayBytesPerSec) or (512 * 1024)
---@type table Encoder hints handed to the broadcaster by live.start: target bitrate, capture
---fps, chunk cadence, and how often it re-anchors with a keyframe.
local ENC = {
    bitrate     = tonumber(CFG.Bitrate) or 900000,
    fps         = tonumber(CFG.Fps) or 25,
    timesliceMs = tonumber(CFG.TimesliceMs) or 250,
    keyframeMs  = tonumber(CFG.KeyframeMs) or 4000,
}

-- Sessions live in memory only; hostLive/viewerLive invert lives' membership.
---@type table<string, table> Live sessions by liveId (host identity, transport cache, viewers).
local lives      = {}
---@type table<integer, string> liveId being broadcast, per hosting player src.
local hostLive   = {}
---@type table<integer, string> liveId being watched, per viewer src.
local viewerLive = {}

-- Ingest ceilings on the host's media pushes.
---@type integer Base64 byte ceiling per JPEG frame / video chunk (~600 KB).
local MAX_FRAME = 600000
---@type integer Cap on cached current-GOP chunk COUNT.
local MAX_GOP   = 240
---@type integer Cap on cached current-GOP total BYTES.
local MAX_GOP_BYTES = 8 * 1024 * 1024

local util = require 'server.util'
local ok, fail, trim, flag = util.ok, util.fail, util.trim, util.truthy

---Coerces a raw client payload to a table; any non-table becomes {}.
---@param payload any raw client payload
---@return table payload the same table, or {} for any non-table
local function tbl(payload)
    return type(payload) == 'table' and payload or {}
end

---The vibez account the character behind `src` is signed into (nil when signed out).
---@param src integer player server id
---@return table|nil account accounts-engine record (username, displayName, ...)
local function viewerAccount(src)
    local cid = player.getIdentifier(src)
    if not cid then return nil end
    return acctStore.getSessionAccount('vibez', cid)
end

---A user card for relayed host/comment payloads; a missing profile row falls back to a bare
---handle-only card.
---@param username string account handle
---@return table card { id, handle, avatar, verified, name }
local function cardFor(username)
    local row = store.getProfile(username)
    if not row then return { id = username, handle = username, avatar = '', verified = false, name = username } end
    return {
        id       = row.username,
        handle   = row.username,
        avatar   = row.avatar or '',
        verified = flag(row.verified),
        name     = row.display_name or '',
    }
end

---@param session table live session
---@return integer n current viewer count
local function viewerCount(session)
    local n = 0
    for _ in pairs(session.viewers) do n = n + 1 end
    return n
end

---Every source attached to a session (host + viewers).
---@param session table live session
---@return integer[] sources
local function participants(session)
    local out = { session.hostSrc }
    for src in pairs(session.viewers) do out[#out + 1] = src end
    return out
end

---Fans a session-scoped event to the host and every viewer.
---@param session table live session
---@param event string event suffix under sd-phone:client:vibez:
---@param data table payload
local function relay(session, event, data)
    for _, dst in ipairs(participants(session)) do
        TriggerClientEvent('sd-phone:client:vibez:' .. event, dst, data)
    end
end

---Push the current (real) viewer count to everyone in the session.
---@param session table live session
local function pushViewers(session)
    relay(session, 'liveViewers', { liveId = session.id, viewers = viewerCount(session) })
end

---Starts (or resumes) a broadcast for the caller's account. Idempotent: a re-entrant start
---returns the existing session. Broadcasts an empty liveChanged to every phone.
---@param src integer hosting player server id
---@return table result { liveId, startedAt (ms), enc } or failure
function live.start(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end

    local existing = hostLive[src]
    if existing and lives[existing] then
        return ok({ liveId = existing, startedAt = lives[existing].startedAt * 1000, enc = ENC })
    end

    local id = store.newId()
    lives[id] = {
        id        = id,
        host      = acc.username,
        card      = cardFor(acc.username),
        hostSrc   = src,
        startedAt = os.time(),
        mode      = nil,    -- 'image' (JPEG slideshow) | 'video' (encoded stream), set on first content
        frame     = nil,    -- latest JPEG (image mode)
        videoMime = nil,    -- e.g. 'video/webm;codecs=vp8' (video mode)
        header    = nil,    -- init chunk that carries the codec config (video mode)
        genChunks = nil,    -- chunks since the last keyframe anchor (video mode)
        genBytes  = 0,      -- total bytes cached in genChunks
        viewers   = {},     -- [src] = username
    }
    hostLive[src] = id

    TriggerClientEvent('sd-phone:client:vibez:liveChanged', -1, {})
    return ok({ liveId = id, startedAt = lives[id].startedAt * 1000, enc = ENC })
end

---Host JPEG push (latent net event). Only the session's recorded hostSrc may feed it; the frame
---must be a non-empty string under MAX_FRAME. Keeps the latest frame and relays it to viewers.
---@param src integer sender server id (must be the session host)
---@param payload table { liveId, frame } attacker-controlled
function live.frame(src, payload)
    payload = tbl(payload)
    local session = lives[payload.liveId]
    if not session or session.hostSrc ~= src then return end
    local frame = payload.frame
    if type(frame) ~= 'string' or #frame == 0 or #frame > MAX_FRAME then return end

    session.mode  = 'image'
    session.frame = frame
    for viewerSrc in pairs(session.viewers) do
        TriggerLatentClientEvent('sd-phone:client:vibez:liveFrame', viewerSrc, 256 * 1024, { liveId = session.id, frame = frame })
    end
end

---Host video chunk push (latent net event): host-only, string-typed, MAX_FRAME-capped. Caches
---the codec header + current keyframe group and relays every chunk to current viewers.
---@param src integer sender server id (must be the session host)
---@param payload table { liveId, chunk, init?, mime? } attacker-controlled
function live.chunk(src, payload)
    payload = tbl(payload)
    local session = lives[payload.liveId]
    if not session or session.hostSrc ~= src then return end
    local chunk = payload.chunk
    if type(chunk) ~= 'string' or #chunk == 0 or #chunk > MAX_FRAME then return end

    local isInit = payload.init == true
    session.mode = 'video'
    if isInit then
        if type(payload.mime) == 'string' and payload.mime ~= '' then
            session.videoMime = payload.mime:sub(1, 64)
        end
        session.header    = chunk
        session.genChunks = {}
        session.genBytes  = 0
    else
        local gop = session.genChunks
        if gop then
            gop[#gop + 1] = chunk
            session.genBytes = (session.genBytes or 0) + #chunk
            while #gop > 0 and (#gop > MAX_GOP or session.genBytes > MAX_GOP_BYTES) do
                session.genBytes = session.genBytes - #gop[1]
                table.remove(gop, 1)
            end
        end
    end

    local data = { liveId = session.id, chunk = chunk, init = isInit }
    if isInit then data.mime = session.videoMime end
    for viewerSrc in pairs(session.viewers) do
        TriggerLatentClientEvent('sd-phone:client:vibez:liveChunk', viewerSrc, RELAY_BPS, data)
    end
end

---Joins a live as a viewer, enforcing MAX_VIEWERS (every vibez account is public). Detaches
---from any prior live first; in video mode the cached header + keyframe group replay to the
---joiner.
---@param src integer viewer server id
---@param payload table { liveId } attacker-controlled
---@return table result { liveId, host, mode, mime, frame, viewers, startedAt (ms) } or failure
function live.join(src, payload)
    payload = tbl(payload)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local session = lives[payload.liveId]
    if not session then return fail('This live has ended') end
    if session.hostSrc == src then return fail('You are the host') end

    if not session.viewers[src] and MAX_VIEWERS > 0 and viewerCount(session) >= MAX_VIEWERS then
        return fail('This live is full')
    end

    local prior = viewerLive[src]
    if prior and prior ~= session.id then
        local old = lives[prior]
        if old and old.viewers[src] then
            old.viewers[src] = nil
            pushViewers(old)
        end
    end

    session.viewers[src] = acc.username
    viewerLive[src] = session.id
    pushViewers(session)

    if session.mode == 'video' and session.header then
        TriggerLatentClientEvent('sd-phone:client:vibez:liveChunk', src, RELAY_BPS,
            { liveId = session.id, chunk = session.header, init = true, mime = session.videoMime })
        if session.genChunks then
            for _, chunk in ipairs(session.genChunks) do
                TriggerLatentClientEvent('sd-phone:client:vibez:liveChunk', src, RELAY_BPS,
                    { liveId = session.id, chunk = chunk, init = false })
            end
        end
    end

    return ok({
        liveId    = session.id,
        host      = session.card,
        mode      = session.mode,
        mime      = session.videoMime,
        frame     = session.frame,
        viewers   = viewerCount(session),
        startedAt = session.startedAt * 1000,
    })
end

---Leaves a live, scoped to the caller's own membership. Falls back to the caller's tracked live
---when the payload omits the id. Always reports success.
---@param src integer viewer server id
---@param payload table { liveId? } attacker-controlled
---@return table result success envelope
function live.leave(src, payload)
    payload = tbl(payload)
    local id = payload.liveId or viewerLive[src]
    local session = id and lives[id]
    if session and session.viewers[src] then
        session.viewers[src] = nil
        viewerLive[src] = nil
        pushViewers(session)
    end
    return ok()
end

---Posts an ephemeral comment to a live, relayed to everyone in the session, never persisted.
---Only the host or an active viewer may comment; text is trimmed and capped at 200 chars.
---@param src integer sender server id
---@param payload table { liveId, text } attacker-controlled
---@return table result success envelope
function live.comment(src, payload)
    payload = tbl(payload)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local session = lives[payload.liveId]
    if not session then return fail('This live has ended') end
    if session.hostSrc ~= src and not session.viewers[src] then return fail('Not in this live') end

    local text = trim(payload.text):sub(1, 200)
    if text == '' then return ok() end

    relay(session, 'liveComment', {
        liveId  = session.id,
        comment = { id = store.newId(), user = cardFor(acc.username), text = text },
    })
    return ok()
end

---Floats a heart on a live. Unknown lives and outsiders return plain success.
---@param src integer sender server id
---@param payload table { liveId } attacker-controlled
---@return table result success envelope
function live.heart(src, payload)
    payload = tbl(payload)
    local session = lives[payload.liveId]
    if not session then return ok() end
    if session.hostSrc ~= src and not session.viewers[src] then return ok() end
    relay(session, 'liveHeart', { liveId = session.id })
    return ok()
end

---Ends a broadcast, host-only. Kicks every viewer, drops the session, and tells every phone to
---refresh its live rail.
---@param src integer hosting player server id
---@param payload table { liveId? } attacker-controlled (falls back to the caller's hosted live)
---@return table result success envelope
function live.endLive(src, payload)
    payload = tbl(payload)
    local id = payload.liveId or hostLive[src]
    local session = id and lives[id]
    if not session or session.hostSrc ~= src then return ok() end

    for viewerSrc in pairs(session.viewers) do
        viewerLive[viewerSrc] = nil
        TriggerClientEvent('sd-phone:client:vibez:liveEnded', viewerSrc, { liveId = session.id })
    end
    lives[id] = nil
    hostLive[src] = nil

    TriggerClientEvent('sd-phone:client:vibez:liveChanged', -1, {})
    return ok()
end

---Active lives the given account may watch (everyone else's), newest first. Read-only.
---@param username string viewer account handle
---@return table[] lives [{ user, liveId, startedAt (ms) }]
function live.activeForViewer(username)
    local out = {}
    for _, session in pairs(lives) do
        if session.host ~= username then
            out[#out + 1] = { user = session.card, liveId = session.id, startedAt = session.startedAt * 1000 }
        end
    end
    table.sort(out, function(a, b) return a.startedAt > b.startedAt end)
    return out
end

---Tears down a departing player's live state: a hosted live ends for everyone, a watched live
---loses them as a viewer.
AddEventHandler('playerDropped', function()
    local src = source
    local hid = hostLive[src]
    if hid then live.endLive(src, { liveId = hid }) end
    local vid = viewerLive[src]
    if vid then live.leave(src, { liveId = vid }) end
end)

return live
