---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Floating checkpoint billboards (client.racing.markers).
local markers = require 'client.racing.markers'
---@type table Locale bridge (bridge.shared.locale): t(key, english, vars) for in-world text.
local locale  = require 'bridge.shared.locale'

---@type table Racing settings (configs/racing.lua).
local cfg <const> = type(config.Racing) == 'table' and config.Racing or {}
---@type table In-world race tuning: hit radius, countdown, gate prop, line-up tolerances.
local raceCfg <const> = type(cfg.Race) == 'table' and cfg.Race or {}
---@type table Vehicle class mapping, used for display only; the server derives the real class.
local vehicleCfg <const> = type(cfg.Vehicles) == 'table' and cfg.Vehicles or {}

---@type boolean Whether Racing is switched on. Nothing here touches the world when it is off, and a
---server that never shipped configs/racing.lua counts as off.
local ENABLED <const> = type(config.Racing) == 'table' and config.Racing.Enabled ~= false

---@type table|nil Board module (client.racing.board), resolved on first use rather than required at
---the top: that module requires this one, so closing the circle at load time leaves one of them
---holding a half-built table.
local boardModule
---@return table board module
local function boards()
    boardModule = boardModule or require 'client.racing.board'
    return boardModule
end

---Why the flag dropped without you, keyed by the board's own verdict. Looked up on demand rather
---than held as a constant table, so every line is translated after the locale catalogue has loaded.
---@param why string|nil board verdict
---@return string
local function notLinedUp(why)
    local reasons = {
        vehicle = locale.t('racing.notLinedUpVehicle', 'You were not in the driver\'s seat, so you did not start.'),
        turn    = locale.t('racing.notLinedUpTurn', 'You were facing the wrong way, so you did not start.'),
        backup  = locale.t('racing.notLinedUpBackup', 'You were past the start line, so you did not start.'),
        far     = locale.t('racing.notLinedUpFar', 'You were not at the start line, so you did not start.'),
    }
    return reasons[why or ''] or locale.t('racing.notLinedUpDefault', 'You were not lined up, so you did not start.')
end

---@type number Horizontal metres from a gate midpoint that count as reaching it.
local CHECKPOINT_RADIUS <const> = tonumber(raceCfg.CheckpointRadius) or 14.0
---@type integer Seconds the grid is held for before the green light.
local COUNTDOWN_SECONDS <const> = math.max(1, math.floor(tonumber(raceCfg.CountdownSeconds) or 3))
---@type string Prop planted at both edges of every gate.
local GATE_PROP <const> = raceCfg.GateProp or 'prop_beachflag_01'
---@type integer Props stacked per gate edge; the flag reads clearly on its own.
local GATE_STACK <const> = 1
---@type number Vertical step between stacked props, in metres.
local GATE_STACK_STEP <const> = 0.25
---@type integer Milliseconds the gate model gets to stream before the gates are skipped. A track
---with no flags is still raceable, so the budget is capped rather than waited out.
local MODEL_BUDGET <const> = 3000
---@type integer Gates planted between yields, so a long track cannot stall the frame.
local SPAWN_YIELD_EVERY <const> = 8

---@type integer Blip colour for the gate being driven to, matching the billboard above it.
local BLIP_NEXT <const> = 5
---@type integer Blip colour for the gates queued behind it.
local BLIP_LATER <const> = 2
---@type number Blip size for the numbered gate markers.
local BLIP_SCALE <const> = 0.85
---@type integer Colour index of the GPS route drawn through the gates.
local ROUTE_COLOUR <const> = 6
---@type integer Gates carrying a blip and a route line at any moment: the one being driven to and
---the two after it. The whole track at once reads as a wall of pins on the minimap and gives away
---lines the driver should be reading off the road, so the set slides forward gate by gate instead.
local GATES_AHEAD <const> = math.max(1, math.floor(tonumber(raceCfg.GatesAhead) or 3))

---@type integer Sectors a lap is split into for the HUD's split times.
local SECTOR_COUNT <const> = 4

---@type number Metres from the start line a trial may be opened within, shared with the lineup
---check a race start makes, so both devices agree on what counts as being at the line.
local TRIAL_START_RADIUS <const> = tonumber(raceCfg.LineupRadius) or 40.0

---@type integer Follow-cam view mode for first person.
local CAM_FIRST_PERSON <const> = 4
---@type integer Follow-cam view mode for the close third-person chase.
local CAM_THIRD_CLOSE <const> = 0
---@type integer Alpha applied to the other racers while phasing is on.
local PHASED_ALPHA <const> = 180

---@type number Lowest HUD scale the driver may pick.
local HUD_SCALE_MIN <const> = 0.7
---@type number Highest HUD scale the driver may pick.
local HUD_SCALE_MAX <const> = 1.8
---@type string KVP key the driver's HUD settings are cached under.
local HUD_KVP <const> = 'sd-phone:racing:hud'

---@type table<integer, string> Model hash to race class, precomputed from configs/racing.lua so the
---lookup never hashes a config name on the game thread.
local CLASS_BY_MODEL = {}
for model, class in pairs(vehicleCfg.Models or {}) do
    CLASS_BY_MODEL[joaat(model)] = class
end

---@type table Module table; the table returned at end of file.
local race = {}

---@type table|nil Live race state, nil between races.
local active
---@type integer[] Numbered gate blips for the live race, indexed like the targets.
local blips = {}
---@type integer[] Gate prop handles for the live race.
local props = {}
---@type table[]|nil Last standings broadcast, kept so the opening one is not lost while the grid
---is still counting down and the local race has not begun.
local latestStandings
---@type string|nil 'first' or 'third' while a forced-camera race is running.
local forcedCamera
---@type integer|nil View modes saved when enforcement starts, restored when it ends.
local prevVehViewMode, prevPedViewMode
---@type table<integer, boolean> Entities the phasing loop has faded. Module level so a resource stop
---mid-phase can put them back; faded entities would otherwise stay ghostly.
local phasedEntities = {}
---@type integer|nil Entity frozen for the start countdown, tracked so a resource stop mid-countdown
---cannot leave the player welded to the grid.
local countdownFrozen
---@type integer|nil GetGameTimer deadline of the armed DNF countdown.
local dnfDeadline
---@type integer Bumped on every setup, so a countdown thread that has been superseded stands down
---instead of stomping the live race's handles.
local epoch = 0

---@type table The driver's HUD settings, defaulted to the same values the app ships with.
local hud = {
    style           = 'casual',
    position        = 'top-left',
    scale           = 1.15,
    checkpointColor = '#0BF2B4',
    closestColor    = '#FFD60A',
    inAirWaypoints  = true,
}
---@type boolean Whether the cached settings have been read back yet this session.
local hudLoaded = false

---MM:SS.cc race clock, matching the app's own formatter.
---@param ms number
---@return string
local function raceClock(ms)
    local cs = math.floor(math.max(0, ms) / 10)
    return ('%02d:%02d.%02d'):format(math.floor(cs / 6000), math.floor(cs / 100) % 60, cs % 100)
end

---Folds a HudSettings payload into the live settings and hands the marker colours on.
---@param settings table|nil
local function merge(settings)
    if type(settings) == 'table' then
        if type(settings.style) == 'string' then hud.style = settings.style end
        if type(settings.position) == 'string' then hud.position = settings.position end
        if type(settings.checkpointColor) == 'string' then hud.checkpointColor = settings.checkpointColor end
        if type(settings.closestColor) == 'string' then hud.closestColor = settings.closestColor end
        if settings.inAirWaypoints ~= nil then hud.inAirWaypoints = settings.inAirWaypoints and true or false end

        local scale = tonumber(settings.scale)
        if scale then
            hud.scale = lib.math.clamp(scale, HUD_SCALE_MIN, HUD_SCALE_MAX)
        end
    end
    markers.setStyle(hud.checkpointColor, hud.closestColor, hud.inAirWaypoints)
end

---Reads the settings cached in KVP, once. A race begins from a server push, which can land before
---the app has ever been opened this session, so the cache is the only copy available at the line.
local function hydrate()
    if hudLoaded then return end
    hudLoaded = true

    local raw = GetResourceKvpString(HUD_KVP)
    if not raw then
        merge(nil)
        return
    end

    local ok, decoded = pcall(json.decode, raw)
    merge(ok and decoded or nil)
end

---Takes the driver's HUD settings, caches them, and repaints a race already in progress so a change
---made from the app lands without waiting for the next race.
---@param settings table HudSettings from the server, or the cached copy
function race.applySettings(settings)
    hudLoaded = true
    merge(settings)
    SetResourceKvp(HUD_KVP, json.encode(hud))

    if active then
        SendNUIMessage({
            action = 'sd-phone:racing:hud:show',
            data = { style = hud.style, position = hud.position, scale = hud.scale },
        })
    end
end

---The race the player is running, if any.
---@return string|nil raceId
function race.active()
    return active and active.id or nil
end

---Model hash of the vehicle the player is in, 0 on foot. The finish report sends this and the server
---decides the class from it; the client never names a class the server has to trust.
---@return integer hash
function race.currentModelHash()
    local vehicle = GetVehiclePedIsIn(cache.ped, false)
    return vehicle ~= 0 and GetEntityModel(vehicle) or 0
end

---Race class of the vehicle the player is in, for display in the app. On foot this answers the
---lowest class so the race setup screen never blocks on a missing vehicle.
---@return string class one of 'D' | 'C' | 'B' | 'A' | 'S'
function race.currentClass()
    local fallback = vehicleCfg.Default or 'D'
    local vehicle  = GetVehiclePedIsIn(cache.ped, false)
    if vehicle == 0 then return fallback end

    local override = CLASS_BY_MODEL[GetEntityModel(vehicle)]
    if override then return override end
    return (vehicleCfg.FromNativeClass or {})[GetVehicleClass(vehicle)] or fallback
end

---Display name of the vehicle the player is in.
---@return string label
function race.currentVehicleLabel()
    local vehicle = GetVehiclePedIsIn(cache.ped, false)
    if vehicle == 0 then return 'On Foot' end

    local display = GetDisplayNameFromVehicleModel(GetEntityModel(vehicle))
    local pretty  = GetLabelText(display)
    if pretty and pretty ~= '' and pretty ~= 'NULL' then return pretty end
    return display
end

---Pulls a track's gates and normalises them to the nine-number rows the engine reads. Both shapes
---the route callback can answer with are accepted: the map reads named fields off each point, the
---engine reads them positionally, and one callback serves both.
---@param trackId integer
---@return number[][] points ordered { midX, midY, midZ, aX, aY, aZ, bX, bY, bZ } rows
local function fetchRoute(trackId)
    local res = lib.callback.await('sd-phone:server:racing:trackRoute', false, { trackId = trackId })
    local raw = type(res) == 'table' and res.success and type(res.data) == 'table' and res.data.points or nil
    if type(raw) ~= 'table' then return {} end

    local points = {}
    for i = 1, #raw do
        local p = raw[i]
        if type(p) == 'table' then
            local row = {
                tonumber(p[1] or p.x),  tonumber(p[2] or p.y),  tonumber(p[3] or p.z),
                tonumber(p[4] or p.ax), tonumber(p[5] or p.ay), tonumber(p[6] or p.az),
                tonumber(p[7] or p.bx), tonumber(p[8] or p.by), tonumber(p[9] or p.bz),
            }
            if row[1] and row[2] then
                row[3] = row[3] or 0.0
                points[#points + 1] = row
            end
        end
    end
    return points
end

---Removes a set of blips and props. Both the teardown path and the superseded-countdown path need
---it, and only one of those has published its handles into the live race.
---@param blipList integer[]
---@param propList integer[]
local function discard(blipList, propList)
    for i = 1, #blipList do
        if DoesBlipExist(blipList[i]) then RemoveBlip(blipList[i]) end
    end
    for i = 1, #propList do
        if DoesEntityExist(propList[i]) then DeleteEntity(propList[i]) end
    end
end

---The gates the driver may see at any moment: the one being driven to and the GATES_AHEAD - 1 after
---it. The lookahead wraps back to gate 1 on every lap but the last, where there is nothing after the
---finish to point at, and a track shorter than the window never lists the same gate twice.
---@param targets number[][] gate rows for the lap, gate 1 of the track excluded
---@param current integer index of the gate being driven to
---@param cpPerLap integer gates in one lap
---@param lap integer lap being driven, 1-based
---@param totalLaps integer laps in the race
---@return integer[] indices gate indices, nearest first
local function gateWindow(targets, current, cpPerLap, lap, totalLaps)
    local out, seen = {}, {}
    for k = 0, GATES_AHEAD - 1 do
        local idx = current + k
        if idx > cpPerLap and lap < totalLaps then idx = idx - cpPerLap end
        if targets[idx] and not seen[idx] then
            seen[idx] = true
            out[#out + 1] = idx
        end
    end
    return out
end

---Repaints the map pins and the GPS line over the window, dropping whatever was there before.
---Called on the grid and again on every gate taken, so the set slides forward with the driver
---instead of standing as a finished picture of the track.
---@param targets number[][] gate rows for the lap
---@param current integer index of the gate being driven to
---@param cpPerLap integer gates in one lap
---@param lap integer lap being driven, 1-based
---@param totalLaps integer laps in the race
---@param into integer[] blip handle list, emptied and refilled in place
local function paintWindow(targets, current, cpPerLap, lap, totalLaps, into)
    for i = #into, 1, -1 do
        if DoesBlipExist(into[i]) then RemoveBlip(into[i]) end
        into[i] = nil
    end

    local window = gateWindow(targets, current, cpPerLap, lap, totalLaps)

    ClearGpsMultiRoute()
    if #window == 0 then
        SetGpsMultiRouteRender(false)
        return
    end

    StartGpsMultiRoute(ROUTE_COLOUR, true, true)
    for i = 1, #window do
        local idx  = window[i]
        local t    = targets[idx]
        local blip = AddBlipForCoord(t[1] + 0.0, t[2] + 0.0, t[3] + 0.0)
        SetBlipSprite(blip, 1)
        SetBlipColour(blip, i == 1 and BLIP_NEXT or BLIP_LATER)
        SetBlipScale(blip, BLIP_SCALE)
        ShowNumberOnBlip(blip, idx)
        into[#into + 1] = blip
        AddPointToGpsMultiRoute(t[1] + 0.0, t[2] + 0.0, t[3] + 0.0)
    end
    SetGpsMultiRouteRender(true)
end

---Streams the gate prop in, giving up after the budget rather than holding the grid on a model that
---is not coming.
---
---lib.requestModel runs its own validity pre-check and raises on both that and the timeout, so the
---pcall covers what the IsModelValid guard and the poll did between them.
---@return integer|nil hash model hash, or nil when it did not load
local function ensureGateModel()
    local hash = joaat(GATE_PROP)
    if not pcall(lib.requestModel, hash, MODEL_BUDGET) then return nil end
    return hash
end

---Plants a frozen stack of gate props at one gate edge.
---@param hash integer loaded model hash
---@param x number|nil
---@param y number|nil
---@param z number|nil
---@param out integer[] handle list to append to
local function plantStack(hash, x, y, z, out)
    if not x or not y then return end

    local base = z or 0.0
    for i = 0, GATE_STACK - 1 do
        local obj = CreateObject(hash, x + 0.0, y + 0.0, base + i * GATE_STACK_STEP, false, false, false)
        SetEntityAsMissionEntity(obj, true, true)
        SetEntityCollision(obj, false, false)
        FreezeEntityPosition(obj, true)
        out[#out + 1] = obj
    end
end

---Plants both edges of every gate so the driver can see the line to cross.
---@param targets number[][]
---@return integer[] handles
local function plantGates(targets)
    local handles = {}
    local hash    = ensureGateModel()
    if not hash then return handles end

    for i = 1, #targets do
        local t = targets[i]
        plantStack(hash, t[4], t[5], t[6], handles)
        plantStack(hash, t[7], t[8], t[9], handles)
        if i % SPAWN_YIELD_EVERY == 0 then Wait(0) end
    end
    SetModelAsNoLongerNeeded(hash)
    return handles
end

---Ends camera enforcement; the loop thread restores the saved view modes as it exits.
local function stopForcedCamera()
    forcedCamera = nil
end

---Holds the race's camera option every frame until the race ends. The view-mode natives snap the
---camera back whenever it drifts and the camera inputs are disabled so it cannot flicker for a frame
---on a keypress. Forced third still allows the three third-person zoom levels, only first person is
---corrected; forced first also suppresses the cinematic cam.
---@param mode string|nil 'first' or 'third'; anything else is a no-op
local function startForcedCamera(mode)
    if mode ~= 'first' and mode ~= 'third' then return end

    local wasRunning = forcedCamera ~= nil
    forcedCamera = mode
    if wasRunning then return end

    prevVehViewMode = GetFollowVehicleCamViewMode()
    prevPedViewMode = GetFollowPedCamViewMode()

    CreateThread(function()
        while forcedCamera do
            DisableControlAction(0, 0, true)
            if forcedCamera == 'first' then
                DisableControlAction(0, 80, true)
                SetCinematicModeActive(false)
            end

            if GetVehiclePedIsIn(cache.ped, false) ~= 0 then
                local view = GetFollowVehicleCamViewMode()
                if forcedCamera == 'first' then
                    if view ~= CAM_FIRST_PERSON then SetFollowVehicleCamViewMode(CAM_FIRST_PERSON) end
                elseif view == CAM_FIRST_PERSON then
                    SetFollowVehicleCamViewMode(CAM_THIRD_CLOSE)
                end
            else
                local view = GetFollowPedCamViewMode()
                if forcedCamera == 'first' then
                    if view ~= CAM_FIRST_PERSON then SetFollowPedCamViewMode(CAM_FIRST_PERSON) end
                elseif view == CAM_FIRST_PERSON then
                    SetFollowPedCamViewMode(CAM_THIRD_CLOSE)
                end
            end
            Wait(0)
        end

        if prevVehViewMode then SetFollowVehicleCamViewMode(prevVehViewMode) end
        if prevPedViewMode then SetFollowPedCamViewMode(prevPedViewMode) end
        prevVehViewMode, prevPedViewMode = nil, nil
    end)
end

---Runs the phasing loop: the other racers are faded out locally and collisions with them are
---suppressed every frame. Timed phasing stops after its duration and says so.
---@param data table the raceStart payload
local function startPhasing(data)
    local phasing = data.phasing
    if type(phasing) ~= 'table' or phasing.mode == 'off' then return end

    local racers = data.racers
    if type(racers) ~= 'table' or #racers < 2 then return end

    local endsAt = phasing.mode == 'timed'
        and (GetGameTimer() + (tonumber(phasing.seconds) or 30) * 1000)
        or nil

    CreateThread(function()
        phasedEntities = {}
        local faded   = phasedEntities
        local expired = false

        while active and active.id == data.id do
            if endsAt and GetGameTimer() >= endsAt then expired = true break end

            local myPed = cache.ped
            local myVeh = GetVehiclePedIsIn(myPed, false)

            for _, serverId in ipairs(racers) do
                local player = GetPlayerFromServerId(serverId)
                if player ~= -1 and player ~= cache.playerId then
                    local ped = GetPlayerPed(player)
                    if ped and ped > 0 and DoesEntityExist(ped) then
                        local veh = GetVehiclePedIsIn(ped, false)

                        if veh ~= 0 then
                            SetEntityAlpha(veh, PHASED_ALPHA, false)
                            faded[veh] = true
                            if myVeh ~= 0 then
                                SetEntityNoCollisionEntity(myVeh, veh, true)
                                SetEntityNoCollisionEntity(veh, myVeh, true)
                            end
                            SetEntityNoCollisionEntity(myPed, veh, true)
                        end

                        SetEntityAlpha(ped, PHASED_ALPHA, false)
                        faded[ped] = true
                        SetEntityNoCollisionEntity(myPed, ped, true)
                        if myVeh ~= 0 then SetEntityNoCollisionEntity(myVeh, ped, true) end
                    end
                end
            end
            Wait(0)
        end

        for entity in pairs(faded) do
            if DoesEntityExist(entity) then ResetEntityAlpha(entity) end
        end
        if faded == phasedEntities then phasedEntities = {} end

        if expired and active and active.id == data.id then
            lib.notify({
                title       = locale.t('apps.racing', 'Racing'),
                description = locale.t('racing.phasingOver', 'Phasing is over, contact is live.'),
                type        = 'inform',
            })
        end
    end)
end

---Pushes the live numbers to the race HUD. Standings arrive on their own path and the HUD merges
---partial payloads, so this never has to carry them.
---@param state table live race state
local function pushState(state)
    local sectors = {}
    for k = 1, SECTOR_COUNT do
        sectors[k] = { ms = state.sectors[k] or 0, done = state.sectors[k] ~= nil }
    end

    SendNUIMessage({ action = 'sd-phone:racing:hud:state', data = {
        lap               = state.lap,
        totalLaps         = state.totalLaps,
        cp                = math.min(state.current, state.cpPerLap),
        cpTotal           = state.cpPerLap,
        progress          = lib.math.round((state.doneCount / math.max(1, state.cpPerLap * state.totalLaps)) * 100),
        bestLapMs         = state.bestLapMs,
        lapStartElapsedMs = state.lapStartedAt - state.startedAt,
        sectors           = sectors,
        pbSectors         = state.pbSectors,
        pbLapMs           = state.pbLapMs,
    } })
end

---Takes a standings broadcast. Buffered when it lands before the green light, which the opening one
---always does, then replayed once the race is running.
---@param list table[] standings entries
function race.pushStandings(list)
    if type(list) ~= 'table' then return end
    latestStandings = list
    if not active then return end

    local pos = 1
    for _, entry in ipairs(list) do
        if entry.you then pos = entry.pos break end
    end

    SendNUIMessage({ action = 'sd-phone:racing:hud:state', data = {
        racers      = list,
        pos         = pos,
        totalRacers = #list,
    } })
end

---Shows the DNF countdown: enough racers have finished that the rest are on the clock. The HUD ticks
---the panel down itself from this one message.
---@param seconds number
function race.armDnf(seconds)
    if not active or dnfDeadline then return end

    seconds = math.floor(tonumber(seconds) or 0)
    if seconds <= 0 then return end

    dnfDeadline = GetGameTimer() + seconds * 1000
    SendNUIMessage({ action = 'sd-phone:racing:hud:dnf', data = { seconds = seconds } })
    lib.notify({
        title = locale.t('apps.racing', 'Racing'),
        description = locale.t('racing.finishWithinSeconds', 'Finish within {n} seconds or you are out.',
            { n = seconds }),
        type = 'warning',
    })
end

---Tears the race down: blips, gate props, GPS route, billboards, HUD, phasing and the forced camera.
---@param finished boolean whether the player took the final gate
function race.stop(finished)
    local state = active
    if not state then return end

    active      = nil
    dnfDeadline = nil
    stopForcedCamera()

    discard(blips, props)
    blips, props = {}, {}

    SetGpsMultiRouteRender(false)
    ClearGpsMultiRoute()
    markers.clear()
    SendNUIMessage({ action = 'sd-phone:racing:hud:hide' })

    if finished then
        PlaySoundFrontend(-1, 'ScreenFlash', 'WastedSounds', true)
        lib.notify({
            title = locale.t('apps.racing', 'Racing'),
            description = locale.t('racing.raceFinishedIn', 'Race finished in {time}',
                { time = raceClock(GetGameTimer() - state.startedAt) }),
            type = 'success',
        })
    end
end

---Closes a trial with the server and tells the racer where the lap landed. The time reported back
---is the server's, not the one the HUD has been showing: the HUD clock starts a frame or two before
---the server hears about it, and the board only ever holds the server's figure.
---@param state table live race state
local function finishTrial(state)
    local res = lib.callback.await('sd-phone:server:racing:trialFinish', false, {
        bestLapMs = state.bestLapMs,
        sectors   = state.bestLapSectors,
        modelHash = race.currentModelHash(),
    })

    local data = type(res) == 'table' and res.success and res.data or nil
    if not data then
        lib.notify({
            title = locale.t('racing.modeTrial', 'Time trial'),
            description = (type(res) == 'table' and res.message)
                or locale.t('racing.trialNotRecorded', 'That run could not be recorded.'),
            type = 'error',
        })
        return
    end

    local line
    if not data.personalBest then
        line = locale.t('racing.trialFirstTime', '{time} · your first time here',
            { time = raceClock(data.timeMs) })
    elseif data.improved then
        line = locale.t('racing.trialPersonalBest', '{time} · personal best by {delta}',
            { time = raceClock(data.timeMs), delta = raceClock(data.personalBest - data.bestLapMs) })
    else
        line = locale.t('racing.trialOffBest', '{time} · {delta} off your best',
            { time = raceClock(data.timeMs), delta = raceClock(data.bestLapMs - data.personalBest) })
    end

    lib.notify({ title = locale.t('racing.modeTrial', 'Time trial'), description = line, type = data.improved and 'success' or 'inform' })
end

---The progression loop: one gate at a time, 2D distance to its midpoint, everything else follows.
---@param state table live race state
local function runLoop(state)
    CreateThread(function()
        while active and active.id == state.id do
            local ped = cache.ped
            if IsEntityDead(ped) then
                race.stop(false)
                break
            end

            local coords = GetEntityCoords(ped)
            local cur    = state.current
            local target = state.targets[cur]
            local dx, dy = coords.x - target[1], coords.y - target[2]

            if math.sqrt(dx * dx + dy * dy) <= CHECKPOINT_RADIUS then
                PlaySoundFrontend(-1, 'CHECKPOINT_NORMAL', 'HUD_MINI_GAME_SOUNDSET', true)

                local tick       = GetGameTimer()
                local lapElapsed = tick - state.lapStartedAt
                state.doneCount  = state.doneCount + 1

                for k = 1, SECTOR_COUNT do
                    if state.sectorBounds[k] == cur and not state.sectors[k] then
                        state.sectors[k] = lapElapsed
                    end
                end

                if not state.trial then
                    TriggerServerEvent('sd-phone:server:racing:checkpoint', state.id, state.doneCount, tick - state.startedAt)
                end

                if cur >= state.cpPerLap then
                    if state.bestLapMs == 0 or lapElapsed < state.bestLapMs then
                        state.bestLapMs = lapElapsed
                        -- Kept beside the time: the splits are only worth storing for the lap that
                        -- actually stands as the best, and state.sectors is about to be cleared.
                        local keep = {}
                        for k = 1, SECTOR_COUNT do keep[k] = state.sectors[k] end
                        state.bestLapSectors = keep
                    end

                    if state.lap >= state.totalLaps then
                        pushState(state)
                        if state.trial then
                            finishTrial(state)
                        else
                            TriggerServerEvent('sd-phone:server:racing:finish', state.id, race.currentModelHash(), tick - state.startedAt)
                        end
                        race.stop(true)
                        break
                    end

                    state.lap          = state.lap + 1
                    state.current      = 1
                    state.lapStartedAt = tick
                    state.sectors      = {}
                else
                    state.current = cur + 1
                end

                paintWindow(state.targets, state.current, state.cpPerLap, state.lap, state.totalLaps, blips)
                pushState(state)
            else
                markers.update(state.targets, cur, state.cpPerLap, state.lap, state.totalLaps, coords)
            end
            Wait(0)
        end
    end)
end

---Runs the whole in-world race for a run that just fired: holds the grid for the countdown, loads the
---track, blips and flags every gate, draws the GPS route, then hands over to the progression loop.
---@param data table the raceStart payload { id, trackId, laps, phasing, camera, racers }
function race.begin(data)
    if not ENABLED then return end
    if type(data) ~= 'table' or not data.id then return end
    if active then race.stop(false) end

    hydrate()
    epoch = epoch + 1
    local mine = epoch

    CreateThread(function()
        -- Judged BEFORE any of the start furniture goes up, the way frp_racing does it: someone who
        -- is not lined up never sees the countdown at all, rather than sitting through a 3-2-1 they
        -- were never going to be allowed to race. The board module owns the test, so what pulls you
        -- out here is exactly the hint the board has been showing you.
        -- A trial has no board to be lined up at and no grid to be pulled off: the racer already
        -- proved they were at the start line before the clock was opened.
        if not data.trial then
            local why = boards().ineligible(data.id)
            if why then
                lib.notify({ title = locale.t('apps.racing', 'Racing'), description = notLinedUp(why), type = 'error' })
                lib.callback.await('sd-phone:server:racing:notStarted', false, { raceId = data.id })
                return
            end
        end

        local ped     = cache.ped
        local vehicle = GetVehiclePedIsIn(ped, false)
        local held    = vehicle ~= 0 and vehicle or ped

        countdownFrozen = held
        FreezeEntityPosition(held, true)

        -- The HUD layer draws nothing until it has been shown, and the countdown lives inside it, so
        -- the panel goes up on the grid rather than at the green light.
        SendNUIMessage({
            action = 'sd-phone:racing:hud:show',
            data = { style = hud.style, position = hud.position, scale = hud.scale },
        })
        SendNUIMessage({ action = 'sd-phone:racing:hud:countdown', data = { from = COUNTDOWN_SECONDS } })

        local greenAt = GetGameTimer() + COUNTDOWN_SECONDS * 1000

        -- The route is a server round trip and the gates are a model stream, so both are done while
        -- the grid is still frozen. Waiting until the green light would have the field driving into
        -- unblipped gates for the first second of the race.
        local points  = data.points or fetchRoute(data.trackId)
        local targets = {}
        for i = 2, #points do targets[#targets + 1] = points[i] end

        -- The lap to chase. Fetched here rather than at the finish so the HUD has it from the
        -- first sector, and left nil when the racer has never set one on this track.
        local pb = lib.callback.await('sd-phone:server:racing:personalBest', false, { trackId = data.trackId })
        local best = type(pb) == 'table' and pb.success and pb.data or nil

        if epoch ~= mine then return end

        if #targets == 0 then
            FreezeEntityPosition(held, false)
            countdownFrozen = nil
            SendNUIMessage({ action = 'sd-phone:racing:hud:hide' })
            lib.notify({
                title       = locale.t('apps.racing', 'Racing'),
                description = locale.t('racing.trackNoCheckpoints', 'That track has no checkpoints to race.'),
                type        = 'error',
            })
            return
        end

        local ownBlips = {}
        local ownProps = plantGates(targets)
        paintWindow(targets, 1, #targets, 1, math.max(1, math.floor(tonumber(data.laps) or 1)), ownBlips)

        while GetGameTimer() < greenAt do Wait(50) end

        -- A second start push while this one was still loading owns the grid now, so this thread
        -- takes its own handles back off the map rather than leaving them behind.
        if epoch ~= mine then
            discard(ownBlips, ownProps)
            return
        end

        -- The trial's clock is opened HERE, at the green light, rather than when the racer pressed
        -- the button: the server times the run, and a clock started before the countdown would put
        -- three seconds into every trial on a board it shares with races.
        if data.trial then
            local started = lib.callback.await('sd-phone:server:racing:trialStart', false, { trackId = data.trackId })
            if type(started) ~= 'table' or not started.success then
                discard(ownBlips, ownProps)
                FreezeEntityPosition(held, false)
                countdownFrozen = nil
                SendNUIMessage({ action = 'sd-phone:racing:hud:hide' })
                lib.notify({
                    title = locale.t('apps.racing', 'Racing'),
                    description = (type(started) == 'table' and started.message)
                        or locale.t('racing.trialNotStarted', 'That run could not be started.'),
                    type = 'error',
                })
                return
            end
        end

        FreezeEntityPosition(held, false)
        countdownFrozen = nil
        blips, props    = ownBlips, ownProps

        -- The HUD's clock starts HERE, at the green light, off the same instant `active.startedAt`
        -- below is stamped from. The panel itself went up COUNTDOWN_SECONDS earlier so the
        -- countdown had somewhere to draw, and a clock started with the panel counts the whole
        -- countdown: the running time then reads seconds over the finish time the server keeps.
        SendNUIMessage({ action = 'sd-phone:racing:hud:clock' })

        local cpPerLap     = #targets
        local totalLaps    = math.max(1, math.floor(tonumber(data.laps) or 1))
        local sectorBounds = {}
        for k = 1, SECTOR_COUNT do sectorBounds[k] = math.ceil(cpPerLap * k / SECTOR_COUNT) end

        local now = GetGameTimer()
        active = {
            id           = data.id,
            trackId      = data.trackId,
            trial        = data.trial == true,
            targets      = targets,
            current      = 1,
            cpPerLap     = cpPerLap,
            lap          = 1,
            totalLaps    = totalLaps,
            doneCount    = 0,
            startedAt    = now,
            lapStartedAt = now,
            bestLapMs    = 0,
            sectors      = {},
            sectorBounds = sectorBounds,
            pbLapMs      = best and best.lapMs or nil,
            pbSectors    = best and best.sectors or nil,
        }

        startForcedCamera(data.camera)
        pushState(active)
        if latestStandings then race.pushStandings(latestStandings) end

        startPhasing(data)
        runLoop(active)
    end)
end

---Starts a solo run against the clock from the app. The racer has to be sitting at the start line
---in the driver's seat, because a trial is a lap of the track rather than a drive to it - being
---anywhere else sets a waypoint instead, which is the thing they actually needed.
---@param trackId integer|string track to run
---@param laps integer|nil laps to run, defaulting to one
function race.beginTrial(trackId, laps)
    if not ENABLED then return end
    if active then
        lib.notify({
            title       = locale.t('racing.modeTrial', 'Time trial'),
            description = locale.t('racing.alreadyOnRun', 'You are already on a run.'),
            type        = 'error',
        })
        return
    end

    CreateThread(function()
        local points = fetchRoute(trackId)
        if #points < 2 then
            lib.notify({
                title       = locale.t('racing.modeTrial', 'Time trial'),
                description = locale.t('racing.trackNoCheckpoints', 'That track has no checkpoints to race.'),
                type        = 'error',
            })
            return
        end

        local ped     = cache.ped
        local start   = points[1]
        local coords  = GetEntityCoords(ped)
        local dx, dy  = coords.x - start[1], coords.y - start[2]

        if math.sqrt(dx * dx + dy * dy) > TRIAL_START_RADIUS then
            SetNewWaypoint(start[1] + 0.0, start[2] + 0.0)
            lib.notify({
                title       = locale.t('racing.modeTrial', 'Time trial'),
                description = locale.t('racing.waypointToStartLine', 'Waypoint set to the start line.'),
                type        = 'inform',
            })
            return
        end

        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then
            lib.notify({
                title       = locale.t('racing.modeTrial', 'Time trial'),
                description = locale.t('racing.getInDriverSeat', 'Get in the driver\'s seat to start the clock.'),
                type        = 'error',
            })
            return
        end

        race.begin({
            id      = 'trial:' .. tostring(trackId),
            trackId = trackId,
            laps    = math.max(1, math.floor(tonumber(laps) or 1)),
            trial   = true,
            points  = points,
        })
    end)
end

---Puts back everything this file may be holding when sd-phone stops mid-race or mid-countdown: faded
---racers, a frozen grid, the forced camera, gate props, blips and the GPS route. Per-frame effects
---such as collision suppression lapse on their own.
---@param resource string stopping resource name
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end

    for entity in pairs(phasedEntities) do
        if DoesEntityExist(entity) then ResetEntityAlpha(entity) end
    end

    if countdownFrozen and DoesEntityExist(countdownFrozen) then
        FreezeEntityPosition(countdownFrozen, false)
    end

    if forcedCamera and prevVehViewMode then
        SetFollowVehicleCamViewMode(prevVehViewMode)
        SetFollowPedCamViewMode(prevPedViewMode)
    end

    discard(blips, props)
    SetGpsMultiRouteRender(false)
    ClearGpsMultiRoute()
end)

return race
