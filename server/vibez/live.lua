---@type table Player bridge (bridge.server.player): citizenid/source lookups.
local player    = require 'bridge.server.player'
---@type table App-accounts persistence (server.accounts.store): resolves which vibez account
---a character is signed into.
local acctStore = require 'server.accounts.store'
---@type table Vibez persistence layer (server.vibez.store): profile rows + id generator.
local store     = require 'server.vibez.store'
---@type table sd-phone config root (configs/config.lua).
local config    = require 'configs.config'
---@type table Watcher registry (server.watchers): shared with server.vibez.actions and init.
local watchers  = require('server.watchers').of('vibez')
---@type table Media relay (server.media.init): the token mint and the relay's control channel. It
---decides nothing; every token this file asks for is signed only after the checks below have run.
local media     = require 'server.media.init'

---@type table Live module; the table returned at end of file.
local live = {}

---@type table Live-video knobs (configs Vibez.Live when present; photogram's defaults otherwise).
local CFG = (config.Vibez and config.Vibez.Live) or {}
---@type string The relay feature id this file owns, and the first two thirds of every stream key
---it mints a token for.
local FEATURE = 'vibez:live'

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
---@type integer Cap on cached current-GOP total BYTES. One joiner is replayed the whole cache, so
---this is also the ceiling on what a single join costs the outbound queue.
local MAX_GOP_BYTES = 2 * 1024 * 1024
---@type integer Window the host's ingest budget is measured over (ms).
local INGEST_WINDOW = 1000
---@type integer Video chunks accepted per window. The encoder emits one per ENC.timesliceMs (four
---a second by default) and re-anchors on every keyframe, so 24 clears any real burst.
local MAX_CHUNKS = 24
---@type integer Video bytes accepted per window, held at or under the per-viewer relay drain: a
---host that can push faster than the relay empties grows a server-side queue without limit.
local MAX_CHUNK_BYTES = math.min(math.floor(ENC.bitrate / 8 * 4), RELAY_BPS)
---@type integer JPEG frames accepted per window. Image mode captures one every two seconds.
local MAX_FRAMES = 6
---@type integer JPEG bytes accepted per window, matching that relay's fixed 256 KB/s drain.
local MAX_FRAME_BYTES = 256 * 1024
---@type integer Minimum gap between a viewer's cached-keyframe replays (ms). A stalled MSE buffer
---does need re-priming, so repeats are spaced rather than refused.
local REPLAY_MS = 5000
---@type integer Minimum gap between one source's hearts (ms), roughly a fast tap.
local HEART_MS = 250
---@type integer Minimum gap between one source's live comments (ms).
local COMMENT_MS = 1000
---@type integer, integer Rolling budget of broadcast starts per character. A budget rather than a
---gap on purpose: closing the live screen and reopening it straight away is a normal action and a
---minimum gap would fail it silently, while start/end cycling still costs a profile read each.
local START_WINDOW, START_MAX = 60000, 20
---@type integer Minimum gap between server-wide liveChanged broadcasts (ms).
local CHANGED_MS = 3000

local util = require 'server.util'
local ok, fail, trim, flag = util.ok, util.fail, util.trim, util.truthy

---@type integer, boolean Last server-wide liveChanged broadcast, and whether one is owed.
local lastChangedAt, changedDirty = 0, false

---Announces that the live list moved. Coalesced, never suppressed: the first change goes out at
---once and a churn of starts and ends behind it collapses into one broadcast per CHANGED_MS, so
---every watching phone still learns about a real live.
local function markChanged()
    local now = GetGameTimer()
    if now < lastChangedAt or (now - lastChangedAt) >= CHANGED_MS then
        lastChangedAt, changedDirty = now, false
        watchers.push('sd-phone:client:vibez:liveChanged', {})
        return
    end
    changedDirty = true
end

CreateThread(function()
    if not util.appEnabled('vibez') then return end

    while true do
        Wait(CHANGED_MS)
        if changedDirty then
            lastChangedAt, changedDirty = GetGameTimer(), false
            watchers.push('sd-phone:client:vibez:liveChanged', {})
        end
    end
end)

---Rolling ingest budget for the host's media pushes, counted on the session so it dies with the
---live and cannot be reset by reconnecting. The relay drains at a fixed rate per viewer; without
---this the host fills those queues faster than they empty and the backlog is server memory.
---@param session table live session
---@param bytes integer size of the push being considered
---@param maxPushes integer pushes accepted per window
---@param maxBytes integer bytes accepted per window
---@return boolean ok true when the push may be relayed
local function ingestOk(session, bytes, maxPushes, maxBytes)
    local now = GetGameTimer()
    local since = now - session.ingestAt
    if since < 0 or since >= INGEST_WINDOW then
        -- Overshoot is carried into the next window rather than forgiven. A push is admitted on a
        -- budget it then exceeds, so an in-spec one is never refused; repaying it here is what
        -- holds the average at or under the drain instead of MAX_FRAME above it every window.
        local debt = session.ingestBytes - maxBytes
        session.ingestAt, session.ingestPushes = now, 0
        session.ingestBytes = debt > 0 and debt or 0
    end
    if session.ingestPushes >= maxPushes or session.ingestBytes >= maxBytes then return false end
    session.ingestPushes = session.ingestPushes + 1
    session.ingestBytes  = session.ingestBytes + bytes
    return true
end

---Per-source gate whose stamps live on the session, so they are dropped with the live rather than
---needing their own disconnect sweep.
---@param stamps table<integer, integer> the session's stamp table for this action
---@param src integer caller server id
---@param ms integer minimum gap between accepted calls
---@return boolean ok true when the call may proceed
local function sessionGate(stamps, src, ms)
    local now  = GetGameTimer()
    local last = stamps[src]
    if last and now >= last and (now - last) < ms then return false end
    stamps[src] = now
    return true
end

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
    util.pushMany('sd-phone:client:vibez:' .. event, participants(session), data)
end

---Push the current (real) viewer count to everyone in the session.
---@param session table live session
local function pushViewers(session)
    relay(session, 'liveViewers', { liveId = session.id, viewers = viewerCount(session) })
end

---The relay stream one broadcast publishes on, or nil when there is no relay to publish to. The
---epoch is always zero: a broadcast's picture never changes shape mid-stream, so there is nothing
---for a viewer to be told it cannot decode across.
---@param liveId string broadcast id
---@return string|nil streamId
local function streamFor(liveId)
    if not media.featureEnabled(FEATURE) then return nil end
    return media.streamId('vibez', 'live', liveId)
end

---Forgets a broadcast's cached opening bytes. Called whenever the stream that cache belongs to
---stops being the stream a joining viewer would be primed with.
---@param session table live session
local function resetCache(session)
    session.header    = nil
    session.genChunks = nil
    session.genBytes  = 0
end

---Starts (or resumes) a broadcast for the caller's account. Idempotent: a re-entrant start
---returns the existing session. Broadcasts an empty liveChanged to every watching phone.
---@param src integer hosting player server id
---@return table result { liveId, startedAt (ms), enc } or failure
function live.start(src)
    local acc = viewerAccount(src)
    if not acc then return fail('vibez.notSigned', 'Not signed in') end

    local existing = hostLive[src]
    if existing and lives[existing] then
        return ok({
            liveId    = existing,
            startedAt = lives[existing].startedAt * 1000,
            enc       = ENC,
            streamId  = streamFor(existing),
        })
    end

    -- Only a genuinely new session is gated; the re-entrant path above already short-circuits.
    if not util.rateLimit(player.getIdentifier(src), 'vibez:liveStart', START_WINDOW, START_MAX) then
        return fail('vibez.slowDownMoment', 'Slow down a moment')
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
        onRelay   = false,  -- the host's browser is publishing over the media relay instead
        viewers   = {},     -- [src] = username
        ingestAt  = 0,      -- start of the current host ingest window
        ingestPushes = 0,   -- pushes accepted in it
        ingestBytes  = 0,   -- bytes accepted in it
        replayAt  = {},     -- [src] = last cached-keyframe replay
        heartAt   = {},     -- [src] = last heart
        commentAt = {},     -- [src] = last comment
    }
    hostLive[src] = id

    markChanged()
    -- Named rather than signed here: the host's page asks for its own publish token once it has an
    -- encoder to attach, so a name that was handed out before the browser was ready never carries a
    -- token that has already lapsed. A server with no relay sends no name, and that page never
    -- constructs a socket at all.
    return ok({ liveId = id, startedAt = lives[id].startedAt * 1000, enc = ENC, streamId = streamFor(id) })
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
    if not ingestOk(session, #frame, MAX_FRAMES, MAX_FRAME_BYTES) then return end

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
    if not ingestOk(session, #chunk, MAX_CHUNKS, MAX_CHUNK_BYTES) then return end

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
            -- Dropping the front would leave the header joined to a tail it no longer runs into,
            -- and these chunks are slices of one encoder byte run rather than standalone segments:
            -- a viewer primed with a header and a gap cannot decode either side of it. The cache
            -- goes entirely instead, and the next header starts a fresh one.
            if #gop > MAX_GOP or session.genBytes > MAX_GOP_BYTES then
                session.header    = nil
                session.genChunks = {}
                session.genBytes  = 0
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
    if not acc then return fail('vibez.notSigned', 'Not signed in') end
    local session = lives[payload.liveId]
    if not session then return fail('vibez.liveEnded', 'This live has ended') end
    if session.hostSrc == src then return fail('vibez.youAreTheHost', 'You are the host') end
    -- Bounds the replay and fan-out below: tapping through a live rail is nowhere near this rate.
    if not util.rateLimit(player.getIdentifier(src), 'vibez:liveJoin', 10000, 20) then
        return fail('vibez.slowDownMoment', 'Slow down a moment')
    end

    if not session.viewers[src] and MAX_VIEWERS > 0 and viewerCount(session) >= MAX_VIEWERS then
        return fail('vibez.liveFull', 'This live is full')
    end

    local prior = viewerLive[src]
    if prior and prior ~= session.id then
        local old = lives[prior]
        if old and old.viewers[src] then
            old.viewers[src] = nil
            old.replayAt[src] = nil
            pushViewers(old)
        end
    end

    local isNew = not session.viewers[src]
    session.viewers[src] = acc.username
    viewerLive[src] = session.id
    if isNew then pushViewers(session) end

    -- Replaying the cached keyframe group is megabytes of latent event, so a repeat join by a
    -- viewer who is already attached only re-primes at REPLAY_MS, never on demand.
    if session.mode == 'video' and session.header
        and (isNew or sessionGate(session.replayAt, src, REPLAY_MS)) then
        if isNew then session.replayAt[src] = GetGameTimer() end
        TriggerLatentClientEvent('sd-phone:client:vibez:liveChunk', src, RELAY_BPS,
            { liveId = session.id, chunk = session.header, init = true, mime = session.videoMime })
        if session.genChunks then
            for _, chunk in ipairs(session.genChunks) do
                TriggerLatentClientEvent('sd-phone:client:vibez:liveChunk', src, RELAY_BPS,
                    { liveId = session.id, chunk = chunk, init = false })
            end
        end
    end

    -- The relay grant rides on the answer to the join the viewer was making anyway, so a token is
    -- only ever signed on the far side of the whole gate above: the account check, the host's
    -- privacy check and the viewer ceiling. It is asked for rather than always sent, because a
    -- viewer re-joins to re-prime a stalled picture and only needs a fresh token when it has no
    -- live socket to feed.
    local grant
    if payload.relay == true then
        local streamId = streamFor(session.id)
        if streamId then grant = media.mint(src, { key = streamId, role = 'watch', gen = 0 }) end
    end

    return ok({
        liveId    = session.id,
        host      = session.card,
        mode      = session.mode,
        mime      = session.videoMime,
        frame     = session.frame,
        viewers   = viewerCount(session),
        startedAt = session.startedAt * 1000,
        relay     = grant,
    })
end

---Host transport push: the broadcaster's browser reporting which way its frames are leaving. The
---viewers follow the host rather than choosing for themselves, because a host only ever encodes to
---one place; they keep listening on the event path whichever way this points, so a downgrade costs
---a rebuilt picture and nothing else.
---@param src integer sender server id (must be the session host)
---@param payload table { liveId, relay } attacker-controlled
---@return table result success envelope
function live.transport(src, payload)
    payload = tbl(payload)
    local session = lives[payload.liveId]
    if not session or session.hostSrc ~= src then return ok() end

    local onRelay = payload.relay == true
    if onRelay == session.onRelay then return ok() end

    session.onRelay = onRelay
    -- The two transports never carry the same broadcast at once, so whatever the one being left
    -- behind had cached would be spliced onto a stream it does not belong to.
    resetCache(session)
    relay(session, 'liveTransport', { liveId = session.id, transport = onRelay and 'relay' or 'event' })
    return ok()
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
        session.replayAt[src] = nil
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
    if not acc then return fail('vibez.notSigned', 'Not signed in') end
    local session = lives[payload.liveId]
    if not session then return fail('vibez.liveEnded', 'This live has ended') end
    if session.hostSrc ~= src and not session.viewers[src] then return fail('vibez.notLive', 'Not in this live') end
    if not sessionGate(session.commentAt, src, COMMENT_MS) then return ok() end

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
    if not sessionGate(session.heartAt, src, HEART_MS) then return ok() end
    relay(session, 'liveHeart', { liveId = session.id })
    return ok()
end

---Ends a broadcast, host-only. Kicks every viewer, drops the session, and tells every watching phone to
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

    -- Nothing waits on this: the relay is a separate process that may be down, and a broadcast
    -- ending cannot be allowed to depend on it. Short token lifetimes stop the next attach either
    -- way; this is only what stops the current one.
    if session.onRelay then
        local streamId = streamFor(session.id)
        if streamId then media.revoke(streamId, 'ended') end
    end

    lives[id] = nil
    hostLive[src] = nil

    markChanged()
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

---Whether one player may take one role on one broadcast, answered for the relay's token mint.
---
---This is the same gate the calls above run, asked a second time and from the other direction: the
---mint is a public route, so it re-derives the answer here rather than trusting that a join came
---first. A host has to be the session's own host; a viewer has to already be attached, which is
---what carried the account check. Nil refuses, and the phone falls back to the event relay it
---never stopped listening on.
---@param src integer requesting player's server id
---@param req { streamId: string, role: string }
---@return table|nil grant { key, role, gen }
---@return table|nil refusal keyed refusal envelope shown to the caller
local function entitle(src, req)
    local liveId = type(req.streamId) == 'string' and req.streamId:match('^vibez:live:(.+)$') or nil
    local session = liveId and lives[liveId]
    if not session then return nil, fail('vibez.liveEnded', 'This live has ended') end

    if req.role == 'publish' then
        if session.hostSrc ~= src then return nil, fail('vibez.notHost', 'You are not the host') end
        return { key = req.streamId, role = 'publish', gen = 0 }
    end

    if not session.viewers[src] then return nil, fail('vibez.notWatchingLive', 'You are not watching this live') end
    return { key = req.streamId, role = 'watch', gen = 0 }
end

media.registerFeature(FEATURE, { entitle = entitle })

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
