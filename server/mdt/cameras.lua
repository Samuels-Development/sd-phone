---@type table Bodycam config (configs/bodycam.lua): the enable switch, eligible jobs, the two
---encoder profiles and the relay ceilings.
local CFG    = require 'configs.bodycam'
---@type table Shared server helpers (server.util): envelopes, clamps, fan-out, cooldowns.
local util   = require 'server.util'
---@type table MDT permissions (server.mdt.access): identity, the read gate, the department domain.
local access = require 'server.mdt.access'
---@type table MDT persistence (server.mdt.store): the audit write behind a viewing session.
local store  = require 'server.mdt.store'
---@type table Player bridge (bridge.server.player): the citizenid -> source lookup a watch resolves
---its host with, rather than walking every connected player on every keep-alive.
local player = require 'bridge.server.player'
---@type table Media relay (server.media.init): the token mint and the relay's control channel. It
---decides nothing; every token this file asks for is signed only after the checks below have run.
local media  = require 'server.media.init'

---@type table Cameras module; the table returned at end of file. The whole bodycam/dashcam relay:
---who has a camera, who is watching it, and the header + keyframe cache a joining terminal is
---primed from. Nothing here is persisted; a camera exists only while its officer is connected.
local cameras = {}

---@type boolean Whether cameras are available at all (configs/bodycam.lua Enabled).
local ENABLED = CFG.Enabled == true
---@type boolean Whether an officer must be on duty to carry a camera.
local REQUIRE_DUTY = CFG.RequireDuty ~= false
---@type boolean Whether a broadcasting officer is put into first person while watched.
local FIRST_PERSON = CFG.FirstPerson ~= false

---@type table<string, boolean> Framework jobs that carry a bodycam. An empty config list means
---every police department, which is what a server that has not customised the list expects.
local JOBS = {}
---@type boolean Whether the job list narrows the police departments at all.
local JOBS_LISTED = false
for _, name in ipairs(CFG.Jobs or {}) do
    if type(name) == 'string' and name ~= '' then
        JOBS[name] = true
        JOBS_LISTED = true
    end
end

---@type table Dashcam knobs (configs/bodycam.lua Dashcam).
local DASH = type(CFG.Dashcam) == 'table' and CFG.Dashcam or {}
---@type boolean Whether an occupied police vehicle gets a tile of its own.
local DASH_ENABLED = DASH.Enabled ~= false

---Normalises a model hash to unsigned 32 bit. GetEntityModel can hand back the signed form of the
---same hash that joaat produces unsigned, and both have to land on one key.
---@param hash any raw hash
---@return integer|nil normalised nil when the value was not a number
local function u32(hash)
    local n = tonumber(hash)
    if not n then return nil end
    n = math.floor(n)
    if n < 0 then n = n + 4294967296 end
    return n
end

---@type table<integer, boolean> Model hashes that carry a dashcam, resolved from the configured
---names once at load.
local DASH_MODELS = {}
for _, name in ipairs(DASH.Models or {}) do
    if type(name) == 'string' and name ~= '' then
        local hash = u32(joaat(name))
        if hash then DASH_MODELS[hash] = true end
    end
end

---@type table<integer, boolean> Vehicle classes that carry a dashcam.
local DASH_CLASSES = {}
for _, class in ipairs(DASH.Classes or {}) do
    local n = tonumber(class)
    if n then DASH_CLASSES[math.floor(n)] = true end
end

---@type integer Milliseconds between a chunk and the next one the broadcaster emits.
local TIMESLICE_MS = math.max(100, math.floor(tonumber(CFG.TimesliceMs) or 400))
---@type integer Milliseconds between the broadcaster's stream-header re-anchors.
local KEYFRAME_MS = math.max(1000, math.floor(tonumber(CFG.KeyframeMs) or 4000))

---Builds one encoder profile from its config block, clamped to figures a client can actually hold.
---@param raw any configs/bodycam.lua Preview or Fullscreen block
---@param fps integer fallback capture frame rate
---@param width integer fallback capture width in pixels
---@param bitrate integer fallback encode bitrate in bits/s
---@return table profile { fps, width, bitrate, timesliceMs, keyframeMs }
local function profileOf(raw, fps, width, bitrate)
    local block = type(raw) == 'table' and raw or {}
    return {
        fps         = lib.math.clamp(math.floor(tonumber(block.Fps) or fps), 1, 60),
        width       = lib.math.clamp(math.floor(tonumber(block.Width) or width), 120, 1920),
        bitrate     = lib.math.clamp(math.floor(tonumber(block.Bitrate) or bitrate), 40000, 12000000),
        timesliceMs = TIMESLICE_MS,
        keyframeMs  = KEYFRAME_MS,
    }
end

---@type table<string, table> Encoder profile per quality the terminal may ask for.
local PROFILES = {
    preview = profileOf(CFG.Preview, 4, 320, 120000),
    full    = profileOf(CFG.Fullscreen, 20, 720, 800000),
}

---@type boolean Whether the grid streams live thumbnails, or renders offline cards until a camera
---is opened full screen.
local PREVIEWS = not (type(CFG.Preview) == 'table' and CFG.Preview.Enabled == false)

---@type integer Terminals allowed on one officer's camera at once (0 = unlimited).
local MAX_VIEWERS = math.max(0, math.floor(tonumber(CFG.MaxViewers) or 6))
---@type integer Per-viewer latent send ceiling, in bytes per second.
local RELAY_BPS = math.max(64 * 1024, math.floor(tonumber(CFG.RelayBytesPerSec) or 512 * 1024))
---@type integer Milliseconds a viewer may go quiet before the server drops them.
local IDLE_MS = math.max(5000, math.floor((tonumber(CFG.IdleSeconds) or 15) * 1000))
---@type boolean Whether opening a camera full screen writes an audit row.
local LOG_VIEWING = CFG.LogViewing ~= false

---@type integer How long a stream stays on the event path after a terminal reported it could not
---reach the relay. Long enough that the officer is not flapping between transports, short enough
---that one player on a bad network does not hold the department there for a whole session.
local RELAY_BLOCK_MS = 300000

---@type integer Milliseconds the last viewer leaving is debounced by, so a terminal switching
---tabs does not make the officer's client tear the encoder down and spin it straight back up.
local OFF_DELAY_MS = 2500
---@type integer Milliseconds between viewer-idle sweeps.
local SWEEP_MS = 2500
---@type integer Byte ceiling on one base64 chunk arriving from a broadcaster.
local MAX_CHUNK = 600000
---@type integer Chunks cached since the last header, so a joining terminal can be primed.
local MAX_GOP = 120
---@type integer Byte ceiling on that cache. A joiner is replayed the whole of it, so this is also
---what a single join costs the outbound queue.
local MAX_GOP_BYTES = 1024 * 1024
---@type integer Window the broadcaster's ingest budget is measured over, in milliseconds.
local INGEST_WINDOW = 1000
---@type integer Chunks accepted per window. The encoder emits one per TimesliceMs and re-anchors
---on every keyframe, so this clears any real burst without letting a forged flood through.
local MAX_INGEST_CHUNKS = 24
---@type integer Minimum gap between one terminal's cached-header replays, in milliseconds.
local REPLAY_MS = 4000
---@type integer Minimum gap between two re-anchor requests to the same broadcaster, in
---milliseconds. Every re-anchor restarts the encoder and shows as a cut to everyone already
---watching, so several terminals joining at once must cost one restart rather than one each.
local ANCHOR_GAP_MS = 1500
---@type integer Minimum gap between two audit rows for the same officer watching the same camera.
local AUDIT_GAP_MS = 60000
---@type integer Window a terminal's watch calls are counted over, in milliseconds.
local WATCH_WINDOW = 10000
---@type integer Watch calls allowed in that window. The grid re-asserts every open tile on a five
---second timer, so a full grid plus a full-screen feed sits well inside this; anything past it is a
---terminal asking faster than one can be operated, and each call can mint a relay token.
local MAX_WATCHES = 40

---@type string The relay feature id this file owns, and the first two thirds of every stream key it
---mints a token for.
local FEATURE = 'mdt:cam'

---@type table<string, table> Broadcast session per hosting officer citizenid.
local sessions = {}
---@type table<integer, table> The same sessions, keyed by the host's server id.
local byHostSrc = {}
---@type table<string, boolean> '<citizenid>:<reason>' pairs already reported by breakRun.
local brokenSaid = {}
---@type table<integer, integer> Vehicle class last reported by an officer's own client.
local reportedClass = {}

---Coerces a raw client payload to a table; any non-table becomes {}.
---@param payload any raw client payload
---@return table payload
local function tbl(payload)
    return type(payload) == 'table' and payload or {}
end

---A stored string still worth sending, or nil. Blank columns are dropped rather than sent as empty
---strings, so the terminal's own fallback copy renders instead.
---@param value any
---@return string|nil
local function textOrNil(value)
    return (type(value) == 'string' and value ~= '') and value or nil
end

---The camera id one kind of camera on one officer is addressed by.
---@param kind 'bodycam'|'dashcam'
---@param citizenid string officer citizenid
---@return string cameraId
local function cameraId(kind, citizenid)
    return kind .. ':' .. citizenid
end

---Splits a camera id back into its kind and the officer behind it.
---@param id any client-supplied camera id
---@return string|nil kind
---@return string|nil citizenid
local function splitCameraId(id)
    if type(id) ~= 'string' then return nil, nil end
    local kind, cid = id:match('^(bodycam):(.+)$')
    if not kind then kind, cid = id:match('^(dashcam):(.+)$') end
    if not kind or #cid > 64 then return nil, nil end
    return kind, cid
end

---The relay stream one officer's camera publishes on, or nil when there is no relay to publish to.
---A dashcam is the same picture as the bodycam under a different label, so the two camera ids
---address one stream: the officer encodes once however many tiles are open on them.
---@param citizenid string officer citizenid
---@return string|nil streamId
local function streamFor(citizenid)
    if not media.featureEnabled(FEATURE) then return nil end
    return media.streamId('mdt', 'cam', citizenid)
end

---The identity of an officer who carries a camera, or nil when they do not. Police only, from the
---department they are actually on duty with, never from anything the client sends.
---@param src integer player server id
---@return table|nil me caller identity from access.identity
local function cameraOfficer(src)
    local me = access.identity(src)
    if not me then return nil end
    if access.domain(me) ~= 'leo' then return nil end
    if JOBS_LISTED and not JOBS[me.job] then return nil end
    if REQUIRE_DUTY and me.duty == false then return nil end
    return me
end

---The police vehicle an officer is sitting in, when it carries a dashcam. The model is read from
---the vehicle itself; the class can only be read on a client, so it arrives from the officer's own
---game and is used solely to decide whether a tile appears.
---@param src integer player server id
---@return table|nil vehicle { plate, model }
local function dashVehicle(src)
    if not DASH_ENABLED then return nil end

    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end

    local vehicle = GetVehiclePedIsIn(ped, false)
    if not vehicle or vehicle == 0 then return nil end

    local model = u32(GetEntityModel(vehicle))
    local class = reportedClass[src]
    if not (model and DASH_MODELS[model]) and not (class and DASH_CLASSES[class]) then return nil end

    -- Both fields are always sent, even blank: client/apps/mdt.lua turns a model hash back into
    -- words on the way through, and it only recognises a vehicle row by seeing BOTH keys present.
    return { plate = util.trim(GetVehicleNumberPlateText(vehicle) or ''), model = model or 0 }
end

---The session for a hosting officer, created on first demand for it.
---@param me table officer identity from access.identity
---@return table session
local function ensureSession(me)
    local session = sessions[me.citizenid]
    if session then
        session.src  = me.source
        session.name = me.name
        byHostSrc[me.source] = session
        return session
    end

    session = {
        citizenid    = me.citizenid,
        src          = me.source,
        name         = me.name,
        gen          = 0,
        quality      = nil,   -- nil while nobody is watching, else 'preview' | 'full'
        mime         = nil,   -- e.g. 'video/webm;codecs=vp8', from the header chunk
        header       = nil,   -- the stream header a joining terminal is primed with
        gop          = {},    -- chunks since that header, contiguous or not cached at all
        gopBytes     = 0,
        run          = 0,     -- which run the header opened; counts up and never repeats
        seq          = 0,     -- position of the next chunk in that run
        anchorAt     = 0,     -- GetGameTimer of the last re-anchor asked of the officer's client
        busy         = false, -- the officer's own camera app has the game view
        unsupported  = false, -- the officer's client cannot capture at all
        onRelay      = false, -- the officer's client is publishing over the media relay instead
        relayBlocked = 0,     -- GetGameTimer until which a viewer that could not reach the relay holds this stream on the event path
        viewers      = {},    -- [src] = { quality, at, ids }
        offAt        = nil,   -- when the debounced stop fires
        ingestAt     = 0,
        ingestPushes = 0,
        ingestBytes  = 0,
        replayAt     = {},
    }
    sessions[me.citizenid] = session
    byHostSrc[me.source] = session
    return session
end

---Empties the header and keyframe cache. Called whenever the encoder is about to be re-anchored,
---so a terminal is never primed with a segment from the profile before it.
---@param session table broadcast session
local function resetCache(session)
    session.header   = nil
    session.mime     = nil
    session.gop      = {}
    session.gopBytes = 0
    session.replayAt = {}
end

---Drops the cache without touching the mime, for when the run it holds has stopped being one
---contiguous piece: a chunk went over the size ceiling, the ingest budget refused one, or the
---window filled and something had to go. What is left after any of those is a header and a tail
---with a hole between them, and a hole is not a smaller cache, it is an undecodable one. A
---terminal primed with it faults, rebuilds, is primed with it again and never recovers, so the
---cache is emptied instead and the next header starts a fresh run.
---@param session table broadcast session
---@param cause string stable machine-readable cause, so a configuration that breaks a run on every
---chunk is reported once rather than on every chunk
---@param detail string what to tell the console the first time this cause fires
local function breakRun(session, cause, detail)
    if not session.header and #session.gop == 0 then return end
    local key = session.citizenid .. ':' .. cause
    if not brokenSaid[key] then
        brokenSaid[key] = true
        print(('^3[sd-phone:cameras]^0 %s: %s, so a terminal joining now waits for a fresh header rather than being primed with a gap. Lower Bitrate or TimesliceMs in configs/bodycam.lua to keep instant joins.')
            :format(session.citizenid, detail))
    end
    session.header   = nil
    session.gop      = {}
    session.gopBytes = 0
    session.replayAt = {}
end

---Asks the officer's client to re-anchor now: a fresh header, which is the only thing a terminal
---with nothing cached can start from. Throttled per session, so a camera several terminals open at
---once re-anchors once rather than once each, and a terminal re-asserting its watch on a timer
---cannot drive the encoder into a permanent restart loop.
---@param session table broadcast session
---@return boolean asked
local function requestAnchor(session)
    if not session.src or not session.quality then return false end
    local now = GetGameTimer()
    if now < (session.anchorAt or 0) + ANCHOR_GAP_MS then return false end
    session.anchorAt = now
    TriggerClientEvent('sd-phone:client:mdt:cameraAnchor', session.src, { gen = session.gen })
    return true
end

---@param session table broadcast session
---@return integer n terminals currently attached
local function viewerCount(session)
    local n = 0
    for _ in pairs(session.viewers) do n = n + 1 end
    return n
end

---The highest quality any attached terminal is asking for, or nil when none is.
---@param session table broadcast session
---@return string|nil quality 'full' | 'preview' | nil
local function wantedQuality(session)
    local want
    for _, viewer in pairs(session.viewers) do
        if viewer.quality == 'full' then return 'full' end
        want = 'preview'
    end
    return want
end

---Tells the officer's client what to encode, or that it may stop. This is the whole of the
---"an idle officer costs nothing" rule: the client holds no WebGL context, no encoder and sends no
---bytes until a demand arrives, and tears all three down again when one is withdrawn.
---@param session table broadcast session
---@param on boolean whether the officer should be broadcasting
local function pushDemand(session, on)
    TriggerClientEvent('sd-phone:client:mdt:cameraDemand', session.src, {
        on          = on,
        gen         = session.gen,
        quality     = session.quality,
        enc         = on and PROFILES[session.quality] or nil,
        firstPerson = FIRST_PERSON and session.quality == 'full',
        -- Named rather than signed here: the officer's page asks for its own publish token when it
        -- has an encoder to attach, so a demand that is re-announced a minute later on a page that
        -- loaded late never carries a token that has already lapsed. A server with no relay sends
        -- no name, and that page never constructs a socket at all.
        streamId    = on and streamFor(session.citizenid) or nil,
    })
end

---Tells every terminal on a camera which way its picture is coming. A viewer keeps its event-path
---subscription mounted whatever this says, so the message decides which transport it may join, not
---which one it is allowed to receive.
---@param session table broadcast session
local function pushTransport(session)
    local transport = session.onRelay and 'relay' or 'event'
    for viewerSrc in pairs(session.viewers) do
        TriggerClientEvent('sd-phone:client:mdt:cameraTransport', viewerSrc, {
            citizenid = session.citizenid,
            transport = transport,
        })
    end
end

---Reconciles the demand on an officer against what the terminals watching them are asking for. A
---quality change re-anchors the stream under a new generation rather than switching mid-segment,
---because the frame size changes with it and a viewer cannot decode across that. The pose rides on
---that same transition: a grid of thumbnails must never move anyone the camera, only a full-screen
---watch does, or one open Cameras tab pins the whole department in first person.
---@param session table broadcast session
---@param now integer GetGameTimer at the moment of the call
local function applyDemand(session, now)
    local want = wantedQuality(session)

    if want then
        session.offAt = nil
        if want ~= session.quality then
            session.quality = want
            session.gen     = session.gen + 1
            resetCache(session)
            -- The relay caches a stream's opening bytes for terminals that join mid-shift, and the
            -- picture is about to change shape. Forcing the epoch forward there drops that cache
            -- and tells everyone already watching to rebuild, rather than leaving them to splice a
            -- header from one profile onto frames from the next.
            local streamId = streamFor(session.citizenid)
            if streamId then media.setGen(streamId, session.gen) end
            pushDemand(session, true)
        end
        return
    end

    if session.quality and not session.offAt then
        session.offAt = now + OFF_DELAY_MS
    end
end

---Tears a stream down on the relay, so a broadcast that has ended stops there too rather than
---lingering until its tokens lapse. Nothing waits on it: the relay is a separate process that may
---be down, and a camera stopping cannot be allowed to depend on it.
---@param session table broadcast session
---@param reason string short machine-readable cause, logged by the relay
local function revokeStream(session, reason)
    if not session.onRelay then return end
    session.onRelay = false
    local streamId = streamFor(session.citizenid)
    if streamId then media.revoke(streamId, reason) end
end

---Holds a stream on the event path because a terminal watching it cannot reach the relay. The
---publisher encodes to exactly one transport, so a viewer that cannot join the relay would otherwise
---sit on a dead tile for the whole shift while the officer happily published to nobody. The event
---path is the one every terminal can always reach, so it wins: correctness over picture quality.
---The block lapses so a single bad network does not pin the department to the slow path forever.
---@param session table broadcast session
---@param now integer GetGameTimer at the moment of the call
local function blockRelay(session, now)
    session.relayBlocked = now + RELAY_BLOCK_MS
    if not session.onRelay then return end

    revokeStream(session, 'viewer_unreachable')
    resetCache(session)
    pushTransport(session)
end

---Stops a broadcast and forgets everything cached for it.
---@param session table broadcast session
local function stopBroadcast(session)
    session.offAt   = nil
    session.quality = nil
    resetCache(session)
    revokeStream(session, 'no_viewers')
    if GetPlayerName(session.src) then pushDemand(session, false) end
end

---Drops a session entirely, telling anyone still attached that the feed has gone.
---@param session table broadcast session
---@param reason string short machine-readable cause the terminal renders copy for
local function dropSession(session, reason)
    revokeStream(session, reason)
    for viewerSrc in pairs(session.viewers) do
        TriggerClientEvent('sd-phone:client:mdt:cameraOff', viewerSrc, {
            citizenid = session.citizenid,
            reason    = reason,
        })
    end
    sessions[session.citizenid] = nil
    if byHostSrc[session.src] == session then byHostSrc[session.src] = nil end
end

---The public status of one camera. A terminal renders a distinct card for each of these, so a
---camera that cannot be established says so rather than showing a dead tile.
---@param session table|nil broadcast session, nil when nobody has ever watched this officer
---@return string status 'live' | 'starting' | 'busy' | 'unsupported' | 'ready'
local function statusOf(session)
    if not session then return 'ready' end
    if session.unsupported then return 'unsupported' end
    if session.busy then return 'busy' end
    if not session.quality then return 'ready' end
    -- On the relay the picture never passes through this server, so there is no cached header to
    -- read a live stream off. The officer's own client saying it is publishing is the only evidence
    -- there is, and it is the same evidence the header is: proof an encoder is running.
    if session.onRelay then return 'live' end
    return session.header and 'live' or 'starting'
end

---Rolling ingest budget for a broadcaster's chunks, counted on the session so it dies with the
---broadcast and cannot be reset by reconnecting. The relay drains at a fixed rate per viewer;
---without this a client can fill those queues faster than they empty.
---@param session table broadcast session
---@param bytes integer size of the chunk being considered
---@return boolean ok true when the chunk may be relayed
local function ingestOk(session, bytes)
    local now   = GetGameTimer()
    local since = now - session.ingestAt
    local maxBytes = math.min(math.floor(PROFILES[session.quality or 'preview'].bitrate / 8 * 4), RELAY_BPS)

    if since < 0 or since >= INGEST_WINDOW then
        -- Overshoot is carried into the next window rather than forgiven: a chunk is admitted on a
        -- budget it then exceeds, so repaying it here is what holds the average at the drain.
        local debt = session.ingestBytes - maxBytes
        session.ingestAt, session.ingestPushes = now, 0
        session.ingestBytes = debt > 0 and debt or 0
    end

    if session.ingestPushes >= MAX_INGEST_CHUNKS or session.ingestBytes >= maxBytes then return false end
    session.ingestPushes = session.ingestPushes + 1
    session.ingestBytes  = session.ingestBytes + bytes
    return true
end

---Primes one terminal with the cached header and the chunks since it, so a camera opened minutes
---into a shift shows a picture without waiting for the next re-anchor. A replay is up to a megabyte
---of latent event, so anything but a first attach is spaced by REPLAY_MS rather than served on
---demand: the terminal re-asserts its watch on a timer and would otherwise be replayed every tick.
---An empty cache is not a failure to prime: it means the run it held stopped being contiguous, and
---the officer's client is asked for a fresh header instead. The numbering the live chunks carry is
---reproduced here, so the terminal reads the replay and the live feed it runs into as one run.
---@param session table broadcast session
---@param src integer viewer server id
---@param force boolean whether this is a first attach, which is never spaced
local function replay(session, src, force)
    if not session.header then
        requestAnchor(session)
        return
    end

    local now  = GetGameTimer()
    local last = session.replayAt[src]
    if not force and last and now >= last and (now - last) < REPLAY_MS then return end
    session.replayAt[src] = now

    -- One event rather than one per chunk. Latent sends are paced across ticks and several in
    -- flight together finish in whatever order they finish in, so a header and the chunks behind it
    -- sent separately can arrive scrambled, and the terminal cannot play a run it cannot order. In
    -- one payload they cannot overtake each other. The header's own number is as many places back
    -- from the next live one as the cache is long.
    local chunks = { session.header }
    for i = 1, #session.gop do chunks[i + 1] = session.gop[i] end

    TriggerLatentClientEvent('sd-phone:client:mdt:cameraPrime', src, RELAY_BPS, {
        citizenid = session.citizenid,
        gen       = session.gen,
        run       = session.run,
        seq       = session.seq - #session.gop - 1,
        mime      = session.mime,
        chunks    = chunks,
    })
end

---Detaches a terminal from one camera, or from every camera it holds on that officer.
---@param session table broadcast session
---@param src integer viewer server id
---@param id string|nil camera id to release, nil to release all of them
local function detach(session, src, id)
    local viewer = session.viewers[src]
    if not viewer then return end

    if id then
        viewer.ids[id] = nil
        if next(viewer.ids) ~= nil then
            viewer.quality = 'preview'
            for _, quality in pairs(viewer.ids) do
                if quality == 'full' then viewer.quality = 'full' end
            end
            return
        end
    end

    session.viewers[src] = nil
    session.replayAt[src] = nil
end

---Releases a terminal from every camera it holds anywhere.
---@param src integer viewer server id
local function detachEverywhere(src)
    local now = GetGameTimer()
    for _, session in pairs(sessions) do
        if session.viewers[src] then
            detach(session, src, nil)
            applyDemand(session, now)
        end
    end
end

---Every camera on the network right now, newest state included. Built by walking the connected
---players rather than a table, because a camera exists only while its officer does.
cameras.list = access.gated('cameras.view', function(src, _payload, me)
    if not ENABLED then return util.fail('Cameras are not available') end

    local out = {}

    for _, id in ipairs(GetPlayers()) do
        local unitSrc = tonumber(id)
        local officer = unitSrc and cameraOfficer(unitSrc)
        if officer then
            local session = sessions[officer.citizenid]
            local status  = statusOf(session)
            local viewers = session and viewerCount(session) or 0

            out[#out + 1] = {
                id        = cameraId('bodycam', officer.citizenid),
                kind      = 'bodycam',
                citizenid = officer.citizenid,
                officer   = officer.name,
                callsign  = textOrNil(officer.callsign),
                rank      = textOrNil(officer.rank),
                unit      = textOrNil(officer.department and officer.department.short),
                plate     = nil,
                model     = nil,
                status    = status,
                viewers   = viewers,
                self      = officer.citizenid == me.citizenid,
            }

            local vehicle = dashVehicle(unitSrc)
            if vehicle then
                out[#out + 1] = {
                    id        = cameraId('dashcam', officer.citizenid),
                    kind      = 'dashcam',
                    citizenid = officer.citizenid,
                    officer   = officer.name,
                    callsign  = textOrNil(officer.callsign),
                    rank      = textOrNil(officer.rank),
                    unit      = textOrNil(officer.department and officer.department.short),
                    plate     = vehicle.plate,
                    model     = vehicle.model,
                    status    = status,
                    viewers   = viewers,
                    self      = officer.citizenid == me.citizenid,
                }
            end
        end
    end

    table.sort(out, function(a, b)
        local ka = (a.callsign or a.officer or '') .. a.kind
        local kb = (b.callsign or b.officer or '') .. b.kind
        return ka < kb
    end)

    -- The list read doubles as the watching terminal's heartbeat: the grid refreshes on a timer,
    -- so a terminal that died without leaving stops answering here and the sweep drops it.
    local stamp = GetGameTimer()
    for _, session in pairs(sessions) do
        local viewer = session.viewers[src]
        if viewer then viewer.at = stamp end
    end

    return util.ok({ cameras = out, previews = PREVIEWS, idleSeconds = math.floor(IDLE_MS / 1000) })
end)

---Attaches the caller to one camera at one quality, and primes them from the cache. Idempotent:
---re-watching the same camera is what the terminal does to keep the feed alive, and it neither
---re-audits nor re-anchors the encoder.
cameras.watch = access.gated('cameras.view', function(src, payload, me)
    if not ENABLED then return util.fail('Cameras are not available') end
    if not util.rateLimit(me.citizenid, 'mdt:cameras:watch', WATCH_WINDOW, MAX_WATCHES) then
        return util.fail('Too many requests, try again in a moment')
    end

    local kind, cid = splitCameraId(payload.cameraId)
    if not kind then return util.fail('Unknown camera') end

    local quality = payload.quality == 'full' and 'full' or 'preview'
    if quality == 'preview' and not PREVIEWS then return util.fail('Live previews are switched off') end

    local hostSrc = player.getSourceByIdentifier(cid)
    if not hostSrc then return util.fail('That unit is no longer on the air') end

    local host = cameraOfficer(hostSrc)
    if not host or host.citizenid ~= cid then return util.fail('That unit is no longer on the air') end
    if kind == 'dashcam' and not dashVehicle(hostSrc) then return util.fail('That unit is not in a marked vehicle') end

    local session = ensureSession(host)
    local viewer  = session.viewers[src]

    if not viewer and MAX_VIEWERS > 0 and viewerCount(session) >= MAX_VIEWERS then
        return util.fail('That camera already has as many terminals on it as it takes')
    end

    local fresh = not viewer or not viewer.ids[payload.cameraId]
    if not viewer then
        viewer = { quality = quality, at = GetGameTimer(), ids = {} }
        session.viewers[src] = viewer
    end
    viewer.at = GetGameTimer()
    viewer.ids[payload.cameraId] = quality
    viewer.quality = quality
    for _, held in pairs(viewer.ids) do
        if held == 'full' then viewer.quality = 'full' end
    end

    applyDemand(session, GetGameTimer())
    if fresh or payload.reprime == true then replay(session, src, fresh) end

    if LOG_VIEWING and quality == 'full' and fresh
        and util.cooldown(me.citizenid, 'mdt:cameras:' .. payload.cameraId, AUDIT_GAP_MS) then
        store.audit(me, 'cameras.view', 'camera', payload.cameraId, {
            kind     = kind,
            officer  = host.name,
            callsign = host.callsign,
        })
    end

    -- The relay grant rides on the answer to the attach the terminal was making anyway, so a token
    -- is only ever signed on the far side of the whole gate above: the read permission, the host
    -- re-verification, the viewer ceiling and the audit row. It is asked for rather than always
    -- sent, because the terminal re-asserts this watch every few seconds and only needs a fresh
    -- token when it has no live join to feed.
    local grant
    if payload.relayFailed == true then
        blockRelay(session, GetGameTimer())
    elseif payload.relay == true and GetGameTimer() >= (session.relayBlocked or 0) then
        local streamId = streamFor(cid)
        if streamId then grant = media.mint(src, { key = streamId, role = 'watch', gen = session.gen }) end
    end

    return util.ok({
        cameraId = payload.cameraId,
        gen      = session.gen,
        mime     = session.mime,
        status   = statusOf(session),
        viewers  = viewerCount(session),
        relay    = grant,
    })
end)

---Releases the caller from one camera, or from every camera when the payload names none.
cameras.unwatch = access.gated('cameras.view', function(src, payload)
    local _, cid = splitCameraId(payload.cameraId)
    local session = cid and sessions[cid]

    if session then
        detach(session, src, payload.cameraId)
        applyDemand(session, GetGameTimer())
    elseif payload.cameraId == nil then
        detachEverywhere(src)
    end

    return util.ok()
end)

---Broadcaster chunk push (latent net event). Only an officer with a live demand on them may feed
---it, the chunk must be a non-empty string under MAX_CHUNK, and a chunk carrying a stale
---generation is dropped rather than mixed into the current stream.
---
---These chunks are slices of one continuous encoder byte run, not standalone frames, so a chunk
---that cannot be forwarded is not a dropped frame: it is a hole, and everything after it is
---undecodable until the next header. Each refusal below therefore ends the run and asks for a new
---header rather than quietly skipping one chunk and leaving the terminals to fault on the rest.
---@param src integer sender server id
---@param payload table { gen, chunk, init?, mime? } attacker-controlled
function cameras.chunk(src, payload)
    payload = tbl(payload)
    local session = byHostSrc[src]
    if not session or session.src ~= src or not session.quality then return end
    if math.floor(tonumber(payload.gen) or -1) ~= session.gen then return end

    local chunk = payload.chunk
    if type(chunk) ~= 'string' or chunk == '' then return end

    local isInit = payload.init == true
    -- Numbered before the refusals below rather than after them, because a chunk that never
    -- reaches the terminals has to leave a hole in the numbering: that hole is the only signal a
    -- terminal gets that its byte run has been cut, and it stops feeding its decoder on the
    -- strength of it instead of faulting somewhere on the far side.
    if isInit then
        session.run = session.run + 1
        session.seq = 0
    end
    local seq = session.seq
    session.seq = seq + 1

    if #chunk > MAX_CHUNK then
        breakRun(session, 'oversize_chunk',
            ('a chunk of %d bytes is over the %d byte ceiling'):format(#chunk, MAX_CHUNK))
        requestAnchor(session)
        return
    end
    if not ingestOk(session, #chunk) then
        breakRun(session, 'ingest_budget', 'the broadcaster is pushing bytes faster than the ingest budget allows')
        requestAnchor(session)
        return
    end

    if isInit then
        local mime = util.limitedString(payload.mime, 64)
        if mime then session.mime = mime end
        session.header   = chunk
        session.gop      = {}
        session.gopBytes = 0
    else
        local gop = session.gop
        gop[#gop + 1] = chunk
        session.gopBytes = session.gopBytes + #chunk
        -- Trimming the front would leave the header attached to a tail it no longer runs into.
        -- The whole cache goes instead: a joiner is served nothing and re-anchored, which costs a
        -- keyframe, where a spliced cache costs the terminal its picture until the camera closes.
        if #gop > MAX_GOP or session.gopBytes > MAX_GOP_BYTES then
            breakRun(session, 'cache_full',
                ('a header plus %d chunks does not fit the %d byte replay cache'):format(#gop, MAX_GOP_BYTES))
        end
    end

    local data = {
        citizenid = session.citizenid,
        gen       = session.gen,
        run       = session.run,
        seq       = seq,
        chunk     = chunk,
        init      = isInit,
        mime      = isInit and session.mime or nil,
    }
    for viewerSrc in pairs(session.viewers) do
        TriggerLatentClientEvent('sd-phone:client:mdt:cameraChunk', viewerSrc, RELAY_BPS, data)
    end
end

---Broadcaster state push: the officer's client reporting that it cannot capture, that its own
---camera app has taken the game view, or which transport its frames are leaving on. The first two
---are shown on the tile rather than left as a dead feed; the third decides what a terminal is
---offered, because the publisher only ever encodes to one place and the viewers follow it there.
---@param src integer sender server id
---@param payload table { busy?, unsupported?, relay? } attacker-controlled
function cameras.state(src, payload)
    payload = tbl(payload)
    local session = byHostSrc[src]
    if not session or session.src ~= src then return end

    session.busy        = payload.busy == true
    session.unsupported = payload.unsupported == true
    if session.busy or session.unsupported then resetCache(session) end

    local onRelay = payload.relay == true and not session.busy and not session.unsupported
        and GetGameTimer() >= (session.relayBlocked or 0)
    if onRelay == session.onRelay then return end

    session.onRelay = onRelay
    -- The two transports never carry the same broadcast at once, so whatever the other one left
    -- cached would be spliced onto a stream it does not belong to.
    if onRelay then resetCache(session) end
    pushTransport(session)
end

---Whether one player may take one role on one camera stream, answered for the relay's token mint.
---
---This is the same gate the callbacks above run, asked a second time and from the other direction:
---the mint is a public route, so it re-derives the answer here rather than trusting that a watch
---came first. A viewer has to already hold this camera through cameras.watch, which is what carries
---the permission key, the host re-verification and the audit row; an officer has to be the officer
---whose camera it is, with a live demand on them. Nil refuses, and the phone falls back to the
---event relay it never stopped listening on.
---@param src integer requesting player's server id
---@param req { streamId: string, role: string }
---@return table|nil grant { key, role, gen }
---@return string|nil message refusal shown to the caller
local function entitle(src, req)
    if not ENABLED then return nil, 'Cameras are not available' end

    local cid = type(req.streamId) == 'string' and req.streamId:match('^mdt:cam:(.+)$') or nil
    local session = cid and sessions[cid]
    if not session or not session.quality then return nil, 'That unit is no longer on the air' end

    if req.role == 'publish' then
        local host = cameraOfficer(src)
        if not host or host.citizenid ~= cid or session.src ~= src then return nil, 'That is not your camera' end
        return { key = req.streamId, role = 'publish', gen = session.gen }
    end

    if not access.can(src, 'cameras.view') then return nil, 'Your rank does not allow that' end
    if not session.viewers[src] then return nil, 'You are not watching that camera' end
    return { key = req.streamId, role = 'watch', gen = session.gen }
end

---Vehicle class push: the officer's own client naming the class of the vehicle it is sitting in.
---A class cannot be read server-side, and this only ever decides whether a dashcam tile appears;
---the model and the plate behind that tile are both read from the vehicle itself.
---@param src integer sender server id
---@param payload table { class? } attacker-controlled
function cameras.vehicle(src, payload)
    payload = tbl(payload)
    local class = tonumber(payload.class)
    if not class or not util.finite(class) then
        reportedClass[src] = nil
        return
    end
    class = math.floor(class)
    reportedClass[src] = (class >= 0 and class <= 22) and class or nil
end

---Reports a quality profile whose numbers cannot survive the pipeline they feed. Base64 costs a
---third on top of the encoded bitrate, so a chunk is roughly bitrate/8 * TimesliceMs * 1.37 bytes:
---past MAX_CHUNK every chunk is refused and the picture never starts, and past MAX_GOP_BYTES the
---cache cannot hold a run so every terminal that joins costs a re-anchor. Neither is visible from
---the game, and both were silent before they were printed here.
---@param name string quality name, as written in configs/bodycam.lua
---@param profile table the resolved profile
local function reportProfileFit(name, profile)
    local chunkBytes = math.floor(profile.bitrate / 8 * (TIMESLICE_MS / 1000) * 1.37)
    if chunkBytes > MAX_CHUNK then
        print(('^1[sd-phone:cameras]^0 %s: Bitrate %d over TimesliceMs %d makes chunks of about %d bytes, past the %d byte ceiling. Every chunk will be refused and the picture will never start: lower Bitrate, or lower TimesliceMs.')
            :format(name, profile.bitrate, TIMESLICE_MS, chunkBytes, MAX_CHUNK))
        return
    end

    local runBytes = math.floor(chunkBytes * (KEYFRAME_MS / TIMESLICE_MS))
    if runBytes > MAX_GOP_BYTES then
        print(('^3[sd-phone:cameras]^0 %s: Bitrate %d over KeyframeMs %d makes a run of about %d bytes, past the %d byte replay cache. Terminals joining will wait for a fresh header rather than starting instantly: lower Bitrate or KeyframeMs to keep the cache useful.')
            :format(name, profile.bitrate, KEYFRAME_MS, runBytes, MAX_GOP_BYTES))
    end
end

if ENABLED then
    media.registerFeature(FEATURE, { entitle = entitle })

    reportProfileFit('Preview', PROFILES.preview)
    reportProfileFit('Fullscreen', PROFILES.full)

    -- Media and state travel on net events rather than callbacks because a chunk is latent: it is
    -- paced onto the wire instead of blocking the net thread on one big frame. This stays whatever
    -- the relay is doing: it is the transport every install has, and the one a relay outage falls
    -- back to without anybody watching noticing more than a rebuilt picture.
    RegisterNetEvent('sd-phone:server:mdt:cameraChunk', function(payload) cameras.chunk(source, payload) end)
    RegisterNetEvent('sd-phone:server:mdt:cameraState', function(payload) cameras.state(source, payload) end)
    RegisterNetEvent('sd-phone:server:mdt:cameraVehicle', function(payload) cameras.vehicle(source, payload) end)

    -- Idle sweep: drops terminals that stopped answering, retires broadcasts nobody is watching,
    -- and forgets a session whose officer has gone. Everything that stops an officer encoding
    -- passes through here, so there is one place where "nobody is watching" becomes "stop".
    CreateThread(function()
        while true do
            Wait(SWEEP_MS)
            local now = GetGameTimer()

            for _, session in pairs(sessions) do
                if not GetPlayerName(session.src) then
                    dropSession(session, 'offline')
                else
                    for viewerSrc, viewer in pairs(session.viewers) do
                        if not GetPlayerName(viewerSrc) or (now - viewer.at) > IDLE_MS then
                            detach(session, viewerSrc, nil)
                        end
                    end

                    applyDemand(session, now)

                    if session.offAt and now >= session.offAt then stopBroadcast(session) end
                    if not session.quality and next(session.viewers) == nil then
                        sessions[session.citizenid] = nil
                        if byHostSrc[session.src] == session then byHostSrc[session.src] = nil end
                    end
                end
            end
        end
    end)

    ---Tears down a departing player's camera state: a hosted broadcast ends for everyone watching
    ---it, and a watched one loses them as a terminal.
    util.onCleanup(function(src)
        reportedClass[src] = nil
        local hosted = byHostSrc[src]
        if hosted then dropSession(hosted, 'offline') end
        detachEverywhere(src)
    end)
end

---Whether the Cameras section is switched on at all, for the routes above it.
---@return boolean
function cameras.enabled() return ENABLED end

return cameras
