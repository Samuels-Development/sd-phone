---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Floating checkpoint billboards (client.racing.markers).
local markers = require 'client.racing.markers'

---@type table Racing settings (configs/racing.lua).
local cfg <const> = type(config.Racing) == 'table' and config.Racing or {}
---@type table In-world race tuning: hit radius, countdown, gate prop, line-up tolerances.
local raceCfg <const> = type(cfg.Race) == 'table' and cfg.Race or {}
---@type table Vehicle class mapping, used for display only; the server derives the real class.
local vehicleCfg <const> = type(cfg.Vehicles) == 'table' and cfg.Vehicles or {}

---@type boolean Whether Racing is switched on. Nothing here touches the world when it is off, and a
---server that never shipped configs/racing.lua counts as off.
local ENABLED <const> = type(config.Racing) == 'table' and config.Racing.Enabled ~= false

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

---@type integer Blip colour for a gate not yet taken.
local BLIP_PENDING <const> = 5
---@type integer Blip colour for a gate already taken this lap.
local BLIP_HIT <const> = 2
---@type number Blip size for the numbered gate markers.
local BLIP_SCALE <const> = 0.85
---@type integer Colour index of the GPS route drawn through the gates.
local ROUTE_COLOUR <const> = 6

---@type integer Sectors a lap is split into for the HUD's split times.
local SECTOR_COUNT <const> = 4

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

---Drops a numbered map blip on every gate.
---@param targets number[][]
---@return integer[] handles
local function dropBlips(targets)
    local handles = {}
    for i = 1, #targets do
        local t    = targets[i]
        local blip = AddBlipForCoord(t[1] + 0.0, t[2] + 0.0, t[3] + 0.0)
        SetBlipSprite(blip, 1)
        SetBlipColour(blip, BLIP_PENDING)
        SetBlipScale(blip, BLIP_SCALE)
        ShowNumberOnBlip(blip, i)
        handles[i] = blip
    end
    return handles
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

---Draws the whole track as a GPS route, gate 1 included so the line starts at the grid.
---@param points number[][]
local function startRoute(points)
    ClearGpsMultiRoute()
    StartGpsMultiRoute(ROUTE_COLOUR, true, true)
    for i = 1, #points do
        AddPointToGpsMultiRoute(points[i][1] + 0.0, points[i][2] + 0.0, points[i][3] + 0.0)
    end
    SetGpsMultiRouteRender(true)
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
            lib.notify({ title = 'Racing', description = 'Phasing is over, contact is live.', type = 'inform' })
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
        title = 'Racing',
        description = ('Finish within %d seconds or you are out.'):format(seconds),
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
            title = 'Racing',
            description = ('Race finished in %s'):format(raceClock(GetGameTimer() - state.startedAt)),
            type = 'success',
        })
    end
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
                if DoesBlipExist(blips[cur]) then SetBlipColour(blips[cur], BLIP_HIT) end
                PlaySoundFrontend(-1, 'CHECKPOINT_NORMAL', 'HUD_MINI_GAME_SOUNDSET', true)

                local tick       = GetGameTimer()
                local lapElapsed = tick - state.lapStartedAt
                state.doneCount  = state.doneCount + 1

                for k = 1, SECTOR_COUNT do
                    if state.sectorBounds[k] == cur and not state.sectors[k] then
                        state.sectors[k] = lapElapsed
                    end
                end

                TriggerServerEvent('sd-phone:server:racing:checkpoint', state.id, state.doneCount, tick - state.startedAt)

                if cur >= state.cpPerLap then
                    if state.bestLapMs == 0 or lapElapsed < state.bestLapMs then
                        state.bestLapMs = lapElapsed
                    end

                    if state.lap >= state.totalLaps then
                        pushState(state)
                        TriggerServerEvent('sd-phone:server:racing:finish', state.id, race.currentModelHash(), tick - state.startedAt)
                        race.stop(true)
                        break
                    end

                    state.lap          = state.lap + 1
                    state.current      = 1
                    state.lapStartedAt = tick
                    state.sectors      = {}
                    for i = 1, #blips do
                        if DoesBlipExist(blips[i]) then SetBlipColour(blips[i], BLIP_PENDING) end
                    end
                else
                    state.current = cur + 1
                end

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
        local points  = fetchRoute(data.trackId)
        local targets = {}
        for i = 2, #points do targets[#targets + 1] = points[i] end

        if epoch ~= mine then return end

        if #targets == 0 then
            FreezeEntityPosition(held, false)
            countdownFrozen = nil
            SendNUIMessage({ action = 'sd-phone:racing:hud:hide' })
            lib.notify({ title = 'Racing', description = 'That track has no checkpoints to race.', type = 'error' })
            return
        end

        local ownBlips = dropBlips(targets)
        local ownProps = plantGates(targets)
        startRoute(points)

        while GetGameTimer() < greenAt do Wait(50) end

        -- A second start push while this one was still loading owns the grid now, so this thread
        -- takes its own handles back off the map rather than leaving them behind.
        if epoch ~= mine then
            discard(ownBlips, ownProps)
            return
        end

        FreezeEntityPosition(held, false)
        countdownFrozen = nil
        blips, props    = ownBlips, ownProps

        local cpPerLap     = #targets
        local totalLaps    = math.max(1, math.floor(tonumber(data.laps) or 1))
        local sectorBounds = {}
        for k = 1, SECTOR_COUNT do sectorBounds[k] = math.ceil(cpPerLap * k / SECTOR_COUNT) end

        local now = GetGameTimer()
        active = {
            id           = data.id,
            trackId      = data.trackId,
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
        }

        startForcedCamera(data.camera)
        pushState(active)
        if latestStandings then race.pushStandings(latestStandings) end

        startPhasing(data)
        runLoop(active)
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
