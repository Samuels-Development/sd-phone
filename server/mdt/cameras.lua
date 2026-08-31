---@type table Bodycam config (configs/bodycam.lua): the enable switch, eligible jobs and the mount.
local CFG    = require 'configs.bodycam'
---@type table Shared server helpers (server.util): envelopes, clamps, rate limits, cleanup.
local util   = require 'server.util'
---@type table MDT permissions (server.mdt.access): identity, the read gate, the department domain.
local access = require 'server.mdt.access'
---@type table Player bridge (bridge.server.player): the citizenid -> source lookup a watch resolves
---its target with, rather than walking every connected player on every keep-alive.
local player = require 'bridge.server.player'

---@type table Cameras module; the table returned at end of file. This file carries no video and
---never has: the terminal that opens a unit renders that unit's camera on its own client. What
---lives here is who has a camera, who may look through it, and how many terminals are on one.
local cameras = {}

---@type boolean Whether cameras are available at all (configs/bodycam.lua Enabled).
local ENABLED = CFG.Enabled == true
---@type boolean Whether an officer must be on duty to carry a camera.
local REQUIRE_DUTY = CFG.RequireDuty ~= false

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
---@type integer Milliseconds a dashcam stays on the grid after the officer gets out.
local LINGER_MS = math.max(0, math.floor((tonumber(DASH.LingerSeconds) or 180) * 1000))
---@type number Metres the officer may be from that car while the tile lasts.
local LINGER_RANGE = math.max(1.0, tonumber(DASH.LingerRange) or 60.0)

---Normalises a model hash to unsigned 32 bit. GetEntityModel can hand back the signed form of the
---same hash that joaat produces unsigned, and both have to land on one key.
---@param hash any raw hash
---@return integer|nil normalised nil when the value was not a number
local function u32(hash)
    local n = tonumber(hash)
    if not n then return nil end
    n = math.floor(n)
    if n < 0 then n = n + 0x100000000 end
    return n
end

---@type table<integer, boolean> Vehicle models that carry a dashcam, by unsigned hash.
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

---@type integer Terminals allowed on one camera at once, 0 meaning unlimited.
local MAX_VIEWERS = math.max(0, math.floor(tonumber(CFG.MaxViewers) or 6))
---@type integer Milliseconds a viewer may go quiet before it stops being counted as watching.
local IDLE_MS = math.max(5000, math.floor((tonumber(CFG.IdleSeconds) or 15) * 1000))
---@type boolean Whether opening a camera writes an audit row.
local LOG_VIEWING = CFG.LogViewing ~= false

---@type integer Milliseconds between sweeps that drop terminals which stopped answering.
local SWEEP_MS <const> = 5000
---@type integer Rate limit window for opening cameras, in milliseconds.
local WATCH_WINDOW <const> = 10000
---@type integer Camera opens allowed inside that window.
local MAX_WATCHES <const> = 12
---@type number Metres a claimed vehicle may be from the officer before the claim is refused.
local CLAIM_RANGE <const> = 12.0

---@type table<string, table<integer, integer>> Terminals watching each camera id, by the game
---timer at which each last said so. Live only: a camera exists while its officer is connected and
---is forgotten with them.
local watchers = {}

---@type table<integer, integer> Vehicle class last reported by each officer's own game, which is
---the only place a class can be read.
local reportedClass = {}

---@type table<integer, integer> Network id of the vehicle each officer's own game last reported
---being in, used only when this server's own read of it comes back empty.
local reportedNet = {}

---@type table<integer, table> The dashcam vehicle each officer last worked out of, and when, so a
---stop does not lose the camera the moment they step out of the car.
local lastDash = {}

---A value that is a non-empty string, or nil.
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

---The vehicle an officer is in, resolved from this server first and from the officer's own game
---only when that comes back empty.
---
---GetVehiclePedIsIn reads through OneSync and answers 0 for a moment after somebody gets in, which
---is precisely when a dispatcher opens the grid to look for them. The client already has to report
---the vehicle class, so it reports the network id alongside it and this falls back to that. The
---fallback is checked against the ped's own position, so a tampered client cannot claim to be
---sitting in a car on the other side of the map.
---@param src integer player server id
---@param ped integer the officer's ped
---@return integer|nil vehicle
local function vehicleOf(src, ped)
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle and vehicle ~= 0 then return vehicle end

    local netId = reportedNet[src]
    if not netId then return nil end

    local claimed = NetworkGetEntityFromNetworkId(netId)
    if not claimed or claimed == 0 or not DoesEntityExist(claimed) then return nil end

    -- Close enough to be sitting in it, rather than merely to have named it.
    if #(GetEntityCoords(ped) - GetEntityCoords(claimed)) > CLAIM_RANGE then return nil end

    return claimed
end

---Whether a vehicle is one that carries a dashcam at all.
---@param vehicle integer
---@param class integer|nil the class the officer's own game reported, when it has
---@return boolean
local function carriesDashcam(vehicle, class)
    local model = u32(GetEntityModel(vehicle))
    if model and DASH_MODELS[model] then return true end
    return class ~= nil and DASH_CLASSES[class] == true
end

---The police vehicle an officer is working out of, when it carries a dashcam.
---
---"Working out of" rather than "sitting in": a dashcam is most worth watching during a stop, and a
---stop is exactly when the officer is stood in front of the car rather than in it. So the car they
---last got out of stays theirs for a while, as long as it still exists and they have not walked
---off and left it.
---@param src integer player server id
---@return table|nil vehicle { plate, model, netId }
local function dashVehicle(src)
    if not DASH_ENABLED then return nil end

    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end

    local class = reportedClass[src]
    local vehicle = vehicleOf(src, ped)

    if vehicle and vehicle ~= 0 and carriesDashcam(vehicle, class) then
        lastDash[src] = { vehicle = vehicle, at = GetGameTimer() }
    else
        -- Not in one now, so fall back to the last one they were in.
        local held = lastDash[src]
        vehicle = nil

        if held and LINGER_MS > 0 and (GetGameTimer() - held.at) <= LINGER_MS
            and DoesEntityExist(held.vehicle)
            and #(GetEntityCoords(ped) - GetEntityCoords(held.vehicle)) <= LINGER_RANGE
        then
            vehicle = held.vehicle
        elseif held then
            lastDash[src] = nil
        end
    end

    if not vehicle then return nil end

    -- Both fields are always sent, even blank: client/apps/mdt.lua turns a model hash back into
    -- words on the way through, and it only recognises a vehicle row by seeing BOTH keys present.
    return {
        plate = util.trim(GetVehicleNumberPlateText(vehicle) or ''),
        model = u32(GetEntityModel(vehicle)) or 0,
        netId = NetworkGetNetworkIdFromEntity(vehicle),
    }
end

---Terminals currently counted as watching one camera, dropping any that have gone quiet. Counting
---and expiring in one pass is what keeps a terminal that died without leaving from holding a slot
---against the viewer cap forever.
---@param id string camera id
---@param now integer GetGameTimer
---@return integer n
local function viewerCount(id, now)
    local seats = watchers[id]
    if not seats then return 0 end

    local n = 0
    for viewerSrc, at in pairs(seats) do
        if not GetPlayerName(viewerSrc) or (now - at) > IDLE_MS then
            seats[viewerSrc] = nil
        else
            n = n + 1
        end
    end

    if n == 0 then watchers[id] = nil end
    return n
end

---Finds the officer behind a camera id and checks they can still be watched. Everything that can
---refuse a watch lands here, so the live open and the keep-alive cannot disagree about whether a
---camera is reachable.
---@param cid string officer citizenid
---@param kind string camera kind
---@return integer|nil unitSrc
---@return table|nil officer identity
---@return table|nil refusal failure envelope when the camera cannot be watched
local function resolveTarget(cid, kind)
    local unitSrc = player.getSourceByIdentifier(cid)
    if not unitSrc or not GetPlayerName(unitSrc) then
        return nil, nil, util.fail('mdt.unitNoLongerAir', 'That unit is no longer on the air')
    end

    local officer = cameraOfficer(unitSrc)
    if not officer then return nil, nil, util.fail('mdt.unitNoLongerAir', 'That unit is no longer on the air') end

    if kind == 'dashcam' and not dashVehicle(unitSrc) then
        return nil, nil, util.fail('mdt.unitNotMarkedVehicle', 'That unit is not in a marked vehicle')
    end

    return unitSrc, officer, nil
end

---Lists every unit carrying a camera, and doubles as the watching terminal's heartbeat: the grid
---refreshes on a timer, so a terminal that died without leaving stops answering here and its seat
---expires on its own.
cameras.list = access.gated('cameras.view', function(src, _payload, me)
    if not ENABLED then return util.fail('mdt.camerasNotAvailable', 'Cameras are not available') end

    local now = GetGameTimer()
    local out = {}

    for _, id in ipairs(GetPlayers()) do
        local unitSrc = tonumber(id) or 0
        local officer = unitSrc > 0 and cameraOfficer(unitSrc) or nil
        if officer then
            local bodyId = cameraId('bodycam', officer.citizenid)

            out[#out + 1] = {
                id        = bodyId,
                kind      = 'bodycam',
                citizenid = officer.citizenid,
                officer   = officer.name,
                callsign  = textOrNil(officer.callsign),
                rank      = textOrNil(officer.rank),
                unit      = textOrNil(officer.department and officer.department.short),
                plate     = nil,
                model     = nil,
                status    = 'live',
                viewers   = viewerCount(bodyId, now),
                self      = officer.citizenid == me.citizenid,
            }

            local vehicle = dashVehicle(unitSrc)
            if vehicle then
                local dashId = cameraId('dashcam', officer.citizenid)
                out[#out + 1] = {
                    id        = dashId,
                    kind      = 'dashcam',
                    citizenid = officer.citizenid,
                    officer   = officer.name,
                    callsign  = textOrNil(officer.callsign),
                    rank      = textOrNil(officer.rank),
                    unit      = textOrNil(officer.department and officer.department.short),
                    plate     = vehicle.plate,
                    model     = vehicle.model,
                    status    = 'live',
                    viewers   = viewerCount(dashId, now),
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

    -- Refresh every seat this terminal holds, wherever it holds one.
    for _, seats in pairs(watchers) do
        if seats[src] then seats[src] = now end
    end

    return util.ok({
        cameras     = out,
        dashcams    = DASH_ENABLED,
        idleSeconds = math.floor(IDLE_MS / 1000),
    })
end)

---Authorises one terminal to look through one unit's camera, and answers with the server id the
---watching client needs to find that officer's ped.
---
---Answering with a server id rather than coordinates is deliberate: the client has to resolve a
---player to attach a camera to them, and a server id is already public to every client in the
---session, whereas a live position is exactly the thing a tampered client should not be handed.
cameras.watch = access.audited('cameras.view', function(src, payload, me)
    if not ENABLED then return util.fail('mdt.camerasNotAvailable', 'Cameras are not available') end
    if not util.rateLimit(me.citizenid, 'mdt:cameras:watch', WATCH_WINDOW, MAX_WATCHES) then
        return util.fail('mdt.tooManyRequestsTryAgain', 'Too many requests, try again in a moment')
    end

    local kind, cid = splitCameraId(payload.cameraId)
    if not kind or not cid then return util.fail('mdt.unknownCamera', 'Unknown camera') end

    -- Your own bodycam shows the back of your own head from a camera on your own chest, which is
    -- worth nothing to anybody. Your own DASHCAM is a different matter: it points out of the
    -- windscreen at the stop you are standing in front of, so that one stays open to you.
    if kind == 'bodycam' and cid == me.citizenid then
        return util.fail('mdt.ownBodycam', 'That is your own bodycam')
    end

    local unitSrc, officer, refusal = resolveTarget(cid, kind)
    if not unitSrc or not officer then return refusal or util.fail('mdt.unknownCamera', 'Unknown camera') end

    -- A routing bucket is a separate copy of the world. An officer in another one can never be in
    -- this terminal's scope however far the watcher travels, so refuse plainly rather than handing
    -- back a target the client will sit on forever waiting to resolve.
    if GetPlayerRoutingBucket(unitSrc) ~= GetPlayerRoutingBucket(src) then
        return util.fail('mdt.unitNotReachableFromHere', 'That unit is not reachable from here')
    end

    local id  = cameraId(kind, cid)
    local now = GetGameTimer()

    -- Counted before the seat is taken, and only when this terminal is not already holding one:
    -- re-watching is how a terminal keeps its feed alive, and it must never be refused for a cap
    -- it is itself inside.
    local reWatch = watchers[id] ~= nil and watchers[id][src] ~= nil
    if not reWatch and MAX_VIEWERS > 0 and viewerCount(id, now) >= MAX_VIEWERS then
        return util.fail('mdt.cameraHasAsManyTerminals', 'That camera has as many terminals on it as it takes')
    end

    -- Read AFTER the count, never before it: counting an empty camera forgets it, and a table
    -- taken before that runs is left detached, so the seat written into it would go nowhere and
    -- the very first viewer of every camera would never be recorded at all.
    local seats = watchers[id]
    if not seats then
        seats = {}
        watchers[id] = seats
    end
    seats[src] = now

    local vehicle = kind == 'dashcam' and dashVehicle(unitSrc) or nil

    -- Where to jump to. The watching client cannot resolve a player who is not already in its
    -- scope, and it cannot get into their scope without knowing where they are, so the opening
    -- position has to come from here. It is no more than the Dispatch section's own locate
    -- already hands this same terminal, and only ever for a camera it has just been cleared for.
    local ped = GetPlayerPed(unitSrc)
    local at  = ped ~= 0 and GetEntityCoords(ped) or nil

    local envelope = util.ok({
        cameraId = id,
        kind     = kind,
        target   = unitSrc,
        coords   = at and { x = at.x, y = at.y, z = at.z } or nil,
        officer  = officer.name,
        callsign = textOrNil(officer.callsign),
        rank     = textOrNil(officer.rank),
        unit     = textOrNil(officer.department and officer.department.short),
        plate    = vehicle and vehicle.plate or nil,
        model    = vehicle and vehicle.model or nil,
        -- Which car to bolt to. Named explicitly rather than left to the watching client to work
        -- out, because an officer stood in front of their car is not "in" it as far as the client
        -- can tell, and that is exactly when a dashcam is worth opening.
        vehicleNet = vehicle and vehicle.netId or nil,
        viewers  = viewerCount(id, now),
    })

    -- Only the first open of a camera is audited. A keep-alive is the same terminal on the same
    -- unit, and auditing it would bury the action that matters under a row every few seconds.
    if reWatch or not LOG_VIEWING then return envelope end

    return envelope, {
        entityType = 'camera',
        entityId   = id,
        details    = { kind = kind, officer = officer.citizenid, by = me.citizenid },
    }
end)

---Drops one terminal's seat on one camera, or on every camera when none is named.
---@param src integer player server id
---@param id string|nil camera id
local function dropSeat(src, id)
    if id then
        local seats = watchers[id]
        if seats then
            seats[src] = nil
            if next(seats) == nil then watchers[id] = nil end
        end
        return
    end

    for key, seats in pairs(watchers) do
        seats[src] = nil
        if next(seats) == nil then watchers[key] = nil end
    end
end

---Drops the caller's seat on one camera, or on every camera when none is named.
cameras.unwatch = access.gated('cameras.view', function(src, payload)
    dropSeat(src, util.limitedString(payload.cameraId, 96))
    return util.ok({})
end)

---The class of the vehicle an officer is sitting in, reported by their own game because a class
---cannot be read server-side. It decides whether a dashcam tile appears and nothing else.
---@param src integer player server id
---@param payload table { class }
function cameras.vehicle(src, payload)
    if not ENABLED or not DASH_ENABLED then return end

    local class = type(payload) == 'table' and tonumber(payload.class) or nil
    reportedClass[src] = class and math.floor(class) or nil

    local netId = type(payload) == 'table' and tonumber(payload.netId) or nil
    reportedNet[src] = netId and math.floor(netId) or nil

    -- Remembering the car has to happen HERE, when the officer gets in, and not when a dispatcher
    -- happens to open the grid. Recording it only on a read meant an officer who got in and out
    -- while nobody was looking left nothing behind to linger, which is every ordinary stop.
    if netId then
        local vehicle = NetworkGetEntityFromNetworkId(math.floor(netId))
        if vehicle and vehicle ~= 0 and DoesEntityExist(vehicle)
            and carriesDashcam(vehicle, reportedClass[src])
        then
            lastDash[src] = { vehicle = vehicle, at = GetGameTimer() }
        end
        return
    end

    -- No vehicle reported means they just got out, so the linger starts counting from now rather
    -- than from whenever they got in. Otherwise a long patrol would expire the tile before the
    -- stop it exists for even begins.
    local held = lastDash[src]
    if held then held.at = GetGameTimer() end
end

---Whether the Cameras section is switched on at all, for the routes above it.
---@return boolean
function cameras.enabled() return ENABLED end

---Whether one terminal currently holds a seat on one camera. The recorder asks before it accepts a
---chunk, so footage cannot be filed against a camera the terminal was never authorised to open.
---@param src integer player server id
---@param id string camera id
---@return boolean
function cameras.isWatching(src, id)
    local seats = watchers[id]
    return seats ~= nil and seats[src] ~= nil
end

---Splits a camera id for the modules above, so the format lives in exactly one file.
---@param id any
---@return string|nil kind
---@return string|nil citizenid
function cameras.split(id) return splitCameraId(id) end

if ENABLED then
    RegisterNetEvent('sd-phone:server:mdt:cameraVehicle', function(payload) cameras.vehicle(source, payload) end)

    ---A terminal leaving a camera. A plain event rather than a callback because every route out of
    ---a camera calls it, including the ones that run while the phone is closing and have nothing
    ---left to await an answer with.
    ---@param payload table { cameraId }
    RegisterNetEvent('sd-phone:server:mdt:cameras:leave', function(payload)
        dropSeat(source, util.limitedString(type(payload) == 'table' and payload.cameraId or nil, 96))
    end)

    -- Expires seats whose terminal stopped answering. The grid read refreshes a live terminal well
    -- inside the window, so this only ever fires for one that died without saying so.
    CreateThread(function()
        while true do
            Wait(SWEEP_MS)
            local now = GetGameTimer()
            for id in pairs(watchers) do viewerCount(id, now) end
        end
    end)

    ---Tears down a departing player's camera state: the seats they held, and the vehicle class
    ---their game was reporting.
    util.onCleanup(function(src)
        reportedClass[src] = nil
        reportedNet[src] = nil
        for id, seats in pairs(watchers) do
            seats[src] = nil
            if next(seats) == nil then watchers[id] = nil end
        end
    end)
end

return cameras
