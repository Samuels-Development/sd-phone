---@type table Bodycam config (configs/bodycam.lua): the enable switch and the camera mount.
local CFG = require 'configs.bodycam'
---@type table Notify bridge (bridge.client.notify): backend-agnostic toast notifications.
local notify = require 'bridge.client.notify'

---@type boolean Whether cameras exist on this server at all. With this off nothing below runs.
local ENABLED = CFG.Enabled == true

---@type table Where the camera sits on an officer and how it sees.
local MOUNT = type(CFG.Mount) == 'table' and CFG.Mount or {}
---@type table Where the camera sits in a marked vehicle.
local DASH_MOUNT = type(CFG.Dashcam) == 'table' and type(CFG.Dashcam.Mount) == 'table'
    and CFG.Dashcam.Mount or {}

---@type table Recording knobs (configs/bodycam.lua Recording).
local REC = type(CFG.Recording) == 'table' and CFG.Recording or {}
---@type boolean Whether a watch may be recorded at all.
local RECORDABLE = ENABLED and REC.Enabled ~= false
---@type boolean Whether opening a camera starts recording on its own.
local REC_AUTO = REC.Auto == true
---@type integer Byte-per-second pacing on a recording slice travelling to the server.
local SLICE_BPS = math.max(65536, math.floor(tonumber(REC.ChunkBytesPerSec) or (2048 * 1024)))

---@type table The capture profile handed to the page, which owns the encoder. Resolved once here
---rather than read across the NUI boundary, so the page cannot ask for more than the config allows.
local REC_PROFILE = {
    fps        = math.max(1, math.floor(tonumber(REC.Fps) or 30)),
    width      = math.max(160, math.floor(tonumber(REC.Width) or 1280)),
    bitrate    = math.max(200000, math.floor(tonumber(REC.Bitrate) or 2500000)),
    maxSeconds = math.max(5, math.floor(tonumber(REC.MaxSeconds) or 300)),
    minSeconds = math.max(0, math.floor(tonumber(REC.MinSeconds) or 4)),
}

---@type integer Milliseconds the client waits for a distant officer's ped to come into scope
---before it gives up. The jump below puts the watcher on top of them, so this is the time the
---game needs to stream a player in rather than a distance problem.
local RESOLVE_MS <const> = 8000
---@type integer Milliseconds between follow steps that keep the watcher on top of the officer.
local FOLLOW_MS <const> = 250
---@type number Metres the officer may drift from the watcher before the watcher is moved again.
---Small enough that the officer never leaves scope, large enough that a stationary unit costs
---nothing but the distance check.
local FOLLOW_DIST <const> = 25.0

---@type table|nil The camera currently open { cameraId, kind, target, officer, ... }, nil when the
---terminal is not watching anything.
local active = nil
---@type integer|nil The scripted camera rendering the officer's view.
local cam = nil
---@type integer|nil The entity the camera is currently bolted to, so a re-resolve can tell whether
---anything actually changed.
local mounted = nil
---@type table|nil What the watcher's own character looked like before it was parked, so it can be
---given back exactly. Nil while nothing has been taken.
local stash = nil
---@type boolean Whether the control loop is running.
local controlling = false
---@type boolean Whether the per-frame aim loop is running.
local aiming = false
---@type boolean Whether the follow loop is running.
local following = false

---@type fun() Drops the camera and hands the phone back. Assigned below, once the pieces it needs
---exist, so the loops can call it without the file having to be ordered around it.
local leaveCamera = function() end

---The ped of the officer being watched, or 0 when they are not in this client's scope. Resolved
---fresh every time rather than cached: a player who respawns comes back on a different handle, and
---a camera bolted to the old one would render nothing at all.
---@return integer ped
local function targetPed()
    if not active then return 0 end
    local playerIdx = GetPlayerFromServerId(active.target)
    if playerIdx == -1 then return 0 end
    local ped = GetPlayerPed(playerIdx)
    if not ped or ped == 0 or not DoesEntityExist(ped) then return 0 end
    return ped
end

---The entity the camera should be bolted to: the officer for a bodycam, the vehicle they are
---sitting in for a dashcam. A dashcam whose officer has stepped out falls back to their body
---rather than dropping the feed, because the tile is still theirs.
---@param ped integer officer ped
---@return integer entity
---@return boolean isVehicle
local function mountEntity(ped)
    if active and active.kind == 'dashcam' then
        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle and vehicle ~= 0 and DoesEntityExist(vehicle) then return vehicle, true end
    end
    return ped, false
end

---Bolts the camera to an entity at the configured mount. Reused across a re-resolve so the picture
---cuts rather than tearing the render path down and building it again.
---@param entity integer what to mount on
---@param isVehicle boolean whether the vehicle mount applies rather than the body one
local function mount(entity, isVehicle)
    local m = isVehicle and DASH_MOUNT or MOUNT

    -- Offsets are entity-relative (x right, y forward, z up) rather than bone-local. A ped's bone
    -- axes do not point where a mount needs them to: +Y on the spine runs UP the spine, so a
    -- chest bone attach puts the lens inside the torso and renders the inside of a ribcage.
    local side    = tonumber(m.Side) or 0.0
    local forward = tonumber(m.Forward) or (isVehicle and 0.55 or 0.34)
    local height  = tonumber(m.Height) or (isVehicle and 0.65 or 0.38)

    if not cam then
        cam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    end

    AttachCamToEntity(cam, entity, side, forward, height, true)
    SetCamFov(cam, tonumber(m.Fov) or (isVehicle and 70.0 or 78.0))
    SetCamNearClip(cam, tonumber(m.NearClip) or (isVehicle and 0.15 or 0.10))
    mounted = entity
end

---@type number|nil The heading the camera is currently pointed at, carried between frames so it can be
---eased toward the mount's heading rather than snapped to it.
local aimHeading = nil
---@type number How much of the remaining swing the camera takes per frame at 60fps. Low enough to
---take the edge off the step changes a networked ped's heading arrives in, high enough that the
---camera is never visibly behind where the officer is facing.
local AIM_EASE <const> = 0.35

---The shortest signed way round from one heading to another. Without this a turn past the 0/360
---seam eases the LONG way and the picture spins most of a full circle to travel a few degrees.
---@param from number
---@param to number
---@return number delta in the range -180..180
local function headingDelta(from, to)
    local d = (to - from + 180.0) % 360.0 - 180.0
    return d
end

---Points the camera where the mount is facing. A body-worn camera follows the TORSO, not where
---the officer happens to be looking, which is exactly what makes the picture read as worn: it
---swings when they turn to face something and holds still when they only glance.
---
---Called every frame, and eased rather than written straight. A remote ped's heading arrives in
---network steps, so writing it raw makes the camera jump between them while the body, which the
---engine interpolates smoothly, slides across the lens in between.
---@param entity integer what the camera is bolted to
---@param isVehicle boolean
---@param snap boolean whether to take the heading immediately rather than easing into it
local function aim(entity, isVehicle, snap)
    if not cam then return end
    local m = isVehicle and DASH_MOUNT or MOUNT
    local want = GetEntityHeading(entity)

    if snap or aimHeading == nil then
        aimHeading = want
    else
        aimHeading = (aimHeading + headingDelta(aimHeading, want) * AIM_EASE) % 360.0
    end

    SetCamRot(cam, tonumber(m.Pitch) or (isVehicle and -4.0 or -8.0), 0.0, aimHeading, 2)
end

---Parks the watcher's own character: hidden, immovable, out of harm's way, and remembers enough
---to put it back exactly. A watcher in a vehicle keeps the vehicle and moves in it, because
---dispatch is very often run from a patrol car and leaving it behind would be worse than the jump.
local function park()
    if stash then return end

    local ped     = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    local carrier = (vehicle ~= 0 and DoesEntityExist(vehicle)) and vehicle or ped

    stash = {
        carrier = carrier,
        coords  = GetEntityCoords(carrier),
        heading = GetEntityHeading(carrier),
        visible = IsEntityVisible(ped),
    }

    SetEntityVisible(ped, false, false)
    SetEntityCollision(carrier, false, false)
    FreezeEntityPosition(carrier, true)
    SetEntityInvincible(ped, true)
    SetPlayerInvincible(PlayerId(), true)

    if carrier ~= ped then
        SetEntityVisible(carrier, false, false)
    end
end

---Gives the watcher their character back. Every route out of a camera lands here, which is the
---whole reason it is one function: a restore that some exits skip is how somebody ends a shift
---frozen and invisible in the sky.
local function unpark()
    if not stash then return end

    local ped     = PlayerPedId()
    local carrier = stash.carrier
    if not carrier or not DoesEntityExist(carrier) then carrier = ped end

    FreezeEntityPosition(carrier, false)
    SetEntityCollision(carrier, true, true)
    SetEntityCoords(carrier, stash.coords.x, stash.coords.y, stash.coords.z, false, false, false, false)
    SetEntityHeading(carrier, stash.heading)
    SetEntityVisible(ped, stash.visible ~= false, false)
    if carrier ~= ped then SetEntityVisible(carrier, true, false) end
    SetEntityInvincible(ped, false)
    SetPlayerInvincible(PlayerId(), false)

    ClearFocus()
    stash = nil
end

---Moves the watcher onto the officer, so the officer stays inside this client's scope. Streaming
---is what decides whether a remote player exists here at all, and standing on top of them is the
---one approach that rides the game's own relevancy rather than fighting it.
---@param x number
---@param y number
---@param z number
local function jumpTo(x, y, z)
    if not stash then return end
    local carrier = stash.carrier
    if not carrier or not DoesEntityExist(carrier) then carrier = PlayerPedId() end

    FreezeEntityPosition(carrier, false)
    SetEntityCoords(carrier, x, y, z, false, false, false, false)
    FreezeEntityPosition(carrier, true)
    RequestCollisionAtCoord(x, y, z)
end

---Holds the camera on the officer, every frame.
---
---This is deliberately separate from the follow thread below and runs at the frame rate, because
---the engine moves an attached camera's POSITION every frame while its rotation is only whatever
---was last written. Driving the two at different rates is what makes a running officer appear to
---slide through the lens: the body keeps up and the heading does not.
local function ensureAim()
    if aiming then return end
    aiming = true

    CreateThread(function()
        while active do
            local ped = targetPed()
            if ped ~= 0 then
                local entity, isVehicle = mountEntity(ped)
                if entity ~= mounted then
                    mount(entity, isVehicle)
                    -- Stepping between a ped and the vehicle they just got into is a cut, not a
                    -- swing, so the new mount takes its heading outright.
                    aim(entity, isVehicle, true)
                else
                    aim(entity, isVehicle, false)
                end
            end
            Wait(0)
        end
        aiming = false
    end)
end

---Keeps the watcher on top of the officer so the officer stays inside this client's scope, and
---ends the watch when they can no longer be reached. Everything here is either a teleport or a
---scope check, none of which wants to run every frame.
local function ensureFollow()
    if following then return end
    following = true

    CreateThread(function()
        while active do
            -- Dying mid-watch has to give the character back, or the respawn happens to a frozen,
            -- invisible ped on the far side of the map. The watcher is invincible while parked, so
            -- this only ever fires for a kill some other script forced through.
            if IsPedDeadOrDying(PlayerPedId(), true) then
                leaveCamera()
                break
            end

            local ped = targetPed()

            if ped == 0 then
                -- The officer left this client's scope or disconnected. Nothing here can bring
                -- them back, so end the watch rather than holding a black screen.
                notify.show({ description = 'That unit is no longer reachable.', type = 'error' })
                leaveCamera()
                break
            end

            local at = GetEntityCoords(ped)
            local me = GetEntityCoords(stash and stash.carrier or PlayerPedId())
            if #(at - me) > FOLLOW_DIST then jumpTo(at.x, at.y, at.z) end

            -- Focus follows the officer rather than a fixed point, so the world keeps streaming
            -- around them as they drive rather than around wherever they were when this started.
            SetFocusEntity(ped)

            Wait(FOLLOW_MS)
        end
        following = false
    end)
end

---Runs while a camera is up: keeps the watcher out of trouble and gives them a way out. A
---body-worn camera has no pan, tilt or zoom, so unlike the fixed CCTV cameras there is nothing
---to steer here; the controls are disabled rather than read.
local function startControl()
    if controlling then return end
    controlling = true

    CreateThread(function()
        while controlling and active do
            DisableControlAction(0, 24, true)  -- Attack
            DisableControlAction(0, 25, true)  -- Aim
            DisableControlAction(0, 45, true)  -- Reload, taken over as the record toggle
            DisableControlAction(0, 47, true)  -- Weapon
            DisableControlAction(0, 245, true) -- Chat
            DisablePlayerFiring(PlayerId(), true)

            -- 45 is R. Recording is toggled on a game control rather than a button because the
            -- phone has given up input focus for as long as the camera is up.
            if RECORDABLE and IsDisabledControlJustPressed(0, 45) then
                SendNUIMessage({ action = 'sd-phone:mdt:bodycam:record', data = {} })
            end

            -- 177 is BACKSPACE/CANCEL, 202 the pad's equivalent. The phone has no input focus
            -- while a camera is up, so the way out has to be a game control rather than a button
            -- the operator cannot click.
            if IsDisabledControlJustPressed(0, 177) or IsDisabledControlJustPressed(0, 202) then
                leaveCamera()
                break
            end

            Wait(0)
        end
        controlling = false
    end)
end

---Opens one camera. Everything that can fail does so before the watcher's character is touched,
---bar the streaming wait, which is the one step that needs them already moved.
---@param data table the accepted watch envelope from the server
---@return boolean opened
---@return string|nil reason
local function open(data)
    if not ENABLED or type(data) ~= 'table' then return false, 'Cameras are not available' end

    local target = tonumber(data.target)
    if not target then return false, 'That unit is no longer on the air' end

    active = {
        cameraId = data.cameraId,
        kind     = data.kind == 'dashcam' and 'dashcam' or 'bodycam',
        target   = target,
        officer  = data.officer,
        callsign = data.callsign,
        plate    = data.plate,
        model    = data.model,
        unit     = data.unit,
        rank     = data.rank,
    }

    park()

    -- Jump first, then wait: a player who is not in scope cannot be resolved, and the only way
    -- into their scope is to be standing where they are.
    local at = type(data.coords) == 'table' and data.coords or nil
    if at then
        jumpTo(tonumber(at.x) or 0.0, tonumber(at.y) or 0.0, tonumber(at.z) or 0.0)
        if at.x then SetFocusPosAndVel(at.x + 0.0, at.y + 0.0, at.z + 0.0, 0.0, 0.0, 0.0) end
    end

    local ped = 0
    local waited = 0
    while waited < RESOLVE_MS do
        ped = targetPed()
        if ped ~= 0 then break end
        Wait(100)
        waited = waited + 100
    end

    if ped == 0 then
        active = nil
        unpark()
        return false, 'Could not reach that unit'
    end

    local entity, isVehicle = mountEntity(ped)
    aimHeading = nil
    mount(entity, isVehicle)
    aim(entity, isVehicle, true)
    SetFocusEntity(ped)

    RenderScriptCams(true, false, 0, true, true)

    -- The phone stays LOADED (it draws the overlay) but gives up input, so nothing steals the
    -- pointer back while the camera is up. Hiding the handset is the NUI's job, not this file's.
    SetNuiFocus(false, false)
    TriggerEvent('sd-phone:client:cameraCursor', false)

    startControl()
    ensureAim()
    ensureFollow()

    SendNUIMessage({ action = 'sd-phone:mdt:bodycam:enter', data = {
        cameraId  = active.cameraId,
        kind      = active.kind,
        officer   = active.officer,
        callsign  = active.callsign,
        plate     = active.plate,
        model     = active.model,
        unit      = active.unit,
        rank      = active.rank,
        canRecord = RECORDABLE,
        auto      = RECORDABLE and REC_AUTO,
        profile   = REC_PROFILE,
    } })

    return true, nil
end

---Drops the camera, gives the watcher their character and their phone back, and tells the UI.
leaveCamera = function()
    controlling = false

    if cam then
        RenderScriptCams(false, false, 0, true, true)
        DestroyCam(cam, true)
        cam = nil
    end
    mounted = nil

    local was = active
    active = nil
    unpark()

    if was then
        SendNUIMessage({ action = 'sd-phone:mdt:bodycam:exit', data = {} })
        TriggerEvent('sd-phone:client:cameraCursor', true)
        SetNuiFocus(true, true)
        TriggerServerEvent('sd-phone:server:mdt:cameras:leave', { cameraId = was.cameraId })
    end
end

if ENABLED then
    ---React -> Lua: open a unit's camera. The server decides, not this file: everything here only
    ---moves the caller's own character and camera, but "only your own camera" still means seeing
    ---through a colleague from across the map, so the gate has to be somewhere a tampered client
    ---cannot reach. It also writes the audit row.
    RegisterNUICallback('sd-phone:mdt:cameras:watch', function(payload, cb)
        local id = type(payload) == 'table' and payload.cameraId or nil
        if type(id) ~= 'string' then
            cb({ success = false, message = 'No such camera' })
            return
        end

        local res = lib.callback.await('sd-phone:server:mdt:cameras:watch', false, { cameraId = id })
        if type(res) ~= 'table' or res.success ~= true or type(res.data) ~= 'table' then
            cb({ success = false, message = type(res) == 'table' and res.message or 'Cameras are not available' })
            return
        end

        -- Switching straight from one unit to another must not leave the first one's parked state
        -- behind, and must not restore the watcher only to park them again a frame later.
        if active then
            controlling = false
            if cam then
                RenderScriptCams(false, false, 0, true, true)
                DestroyCam(cam, true)
                cam = nil
            end
            mounted = nil
            local was = active
            active = nil
            TriggerServerEvent('sd-phone:server:mdt:cameras:leave', { cameraId = was.cameraId })
        end

        local opened, why = open(res.data)
        if not opened then
            cb({ success = false, message = why or 'Could not reach that unit' })
            return
        end

        cb({ success = true, data = res.data })
    end)

    ---React -> Lua: leave the camera.
    RegisterNUICallback('sd-phone:mdt:cameras:unwatch', function(_, cb)
        leaveCamera()
        cb({ success = true })
    end)

    ---React -> Lua: a finished recording is coming, and how many slices it is split into.
    RegisterNUICallback('sd-phone:mdt:recBegin', function(payload, cb)
        if type(payload) == 'table' then
            TriggerServerEvent('sd-phone:server:mdt:recBegin', payload)
        end
        cb({ success = true })
    end)

    ---React -> Lua: one slice of a finished recording. Latent, so it is paced onto the wire
    ---instead of blocking the net thread on a payload measured in megabytes.
    RegisterNUICallback('sd-phone:mdt:recSlice', function(payload, cb)
        local part = type(payload) == 'table' and payload.part or nil
        if type(part) == 'string' and part ~= '' then
            TriggerLatentServerEvent('sd-phone:server:mdt:recSlice', SLICE_BPS, {
                seq  = payload.seq,
                part = part,
            })
        end
        cb({ success = true })
    end)

    ---React -> Lua: give up on a recording that was part-way sent.
    RegisterNUICallback('sd-phone:mdt:recCancel', function(_, cb)
        TriggerServerEvent('sd-phone:server:mdt:recCancel')
        cb({ success = true })
    end)

    ---Server push: a recording was hosted and filed.
    RegisterNetEvent('sd-phone:client:mdt:recSaved', function(row)
        SendNUIMessage({ action = 'sd-phone:mdt:recSaved', data = row })
    end)

    ---Server push: a recording could not be kept, with the reason to put on the tile.
    RegisterNetEvent('sd-phone:client:mdt:recFailed', function(message)
        SendNUIMessage({ action = 'sd-phone:mdt:recFailed', data = { message = message } })
    end)

    ---Server push: another officer sent footage to this terminal.
    ---@param payload table { by }
    RegisterNetEvent('sd-phone:client:mdt:recShared', function(payload)
        local by = type(payload) == 'table' and payload.by or nil
        SendNUIMessage({ action = 'sd-phone:mdt:recShared', data = { by = by } })
        notify.show({
            description = by and ('%s sent you bodycam footage.'):format(by) or 'You were sent bodycam footage.',
            type = 'inform',
        })
    end)

    ---Reports the class of the vehicle the officer is in, which decides whether a dashcam tile
    ---appears for it. Driven by the cache rather than a poll, so an officer on foot costs nothing.
    lib.onCache('vehicle', function(vehicle)
        TriggerServerEvent('sd-phone:server:mdt:cameraVehicle', {
            class = vehicle and GetVehicleClass(vehicle) or nil,
        })
    end)

    ---The phone closing mid-watch must hand the view back, or the watcher is left staring through
    ---a camera with no way to leave it.
    ---@param isOpen boolean whether the phone is now open
    AddEventHandler('sd-phone:client:openState', function(isOpen)
        if not isOpen and active then leaveCamera() end
    end)

    AddEventHandler('onResourceStop', function(resource)
        if resource == GetCurrentResourceName() then leaveCamera() end
    end)
end
