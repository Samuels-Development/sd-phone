---@type table Bodycam config (configs/bodycam.lua): the enable switch and the camera mount.
local CFG = require 'configs.bodycam'
---@type table Locale bridge (bridge.shared.locale): t(key, english, vars) for in-world text.
local locale = require 'bridge.shared.locale'
---@type table Notify bridge (bridge.client.notify): backend-agnostic toast notifications.
local notify = require 'bridge.client.notify'
---@type fun(raw: any): VehicleModel Stored model value to hash/spawn/display (client.vehiclename).
---A watch answers with the model as a hash, because only a client can turn one back into words,
---and this callback is registered by hand rather than through the proxy that names the grid's.
local vehicleModel = require 'client.vehiclename'
---@type table Hold pose (client.pose): the clip and prop the player is holding, which the stand-in
---left behind has to keep holding too.
local pose = require 'client.pose'

---@type boolean Whether cameras exist on this server at all. With this off nothing below runs.
local ENABLED = CFG.Enabled == true

---@type table Where the camera sits on an officer and how it sees.
local MOUNT = type(CFG.Mount) == 'table' and CFG.Mount or {}
---@type table Where the camera sits in a marked vehicle.
local DASH_MOUNT = type(CFG.Dashcam) == 'table' and type(CFG.Dashcam.Mount) == 'table'
    and CFG.Dashcam.Mount or {}

---@type table How the picture is graded (configs/bodycam.lua Look).
local LOOK = type(CFG.Look) == 'table' and CFG.Look or {}
---@type string|nil Timecycle modifier applied while a camera is open, nil for a clean picture.
local LOOK_TIMECYCLE = type(LOOK.Timecycle) == 'string' and LOOK.Timecycle ~= '' and LOOK.Timecycle or nil
---@type number How strongly that modifier is applied.
local LOOK_STRENGTH = math.min(1.0, math.max(0.0, tonumber(LOOK.Strength) or 0.4))
---@type number Handheld shake amplitude, 0 for a camera that never moves on its own.
local LOOK_SHAKE = math.max(0.0, tonumber(LOOK.Shake) or 0.0)

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
---@type boolean Whether the camera open is on the watcher's OWN unit, which needs none of the
---parking, hiding or travelling that watching somebody else does.
local watchingSelf = false

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
        -- The car the server named, first. An officer stood in front of their car during a stop is
        -- not "in" it as far as this client can tell, and that is exactly when a dashcam matters.
        if active.vehicleNet then
            local named = NetworkGetEntityFromNetworkId(active.vehicleNet)
            if named and named ~= 0 and DoesEntityExist(named) then return named, true end
        end

        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle and vehicle ~= 0 and DoesEntityExist(vehicle) then return vehicle, true end
    end
    return ped, false
end

---@type number|nil The near clip currently written to the camera, so the value is only pushed when
---it actually changes rather than every frame.
local nearClip = nil

---Bolts the camera to an entity at the configured mount. Reused across a re-resolve so the picture
---cuts rather than tearing the render path down and building it again.
---
---Offsets are entity-relative (x right, y forward, z up), measured from the entity's own origin,
---which for a ped sits at the HIPS rather than the feet.
---@param entity integer what to mount on
---@param isVehicle boolean whether the vehicle mount applies rather than the body one
local function mount(entity, isVehicle)
    local m = isVehicle and DASH_MOUNT or MOUNT

    if not cam then
        cam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    end

    local side    = tonumber(m.Side) or 0.0
    local forward = tonumber(m.Forward) or (isVehicle and 0.55 or 0.34)
    local height  = tonumber(m.Height) or (isVehicle and 0.65 or 0.38)

    -- A dashcam sits behind the rear-view mirror looking out through the windscreen, and it has to
    -- land there on a bike, a cruiser and a riot van alike.
    --
    -- The driver's seat bone is the reference rather than the model's bounding box: every drivable
    -- vehicle has one, it is inside the cabin by definition, and a mirror is a fairly constant step
    -- up and forward from it. The bounding box is not safe for this, because a police car's roof
    -- height includes the LIGHTBAR, so a fraction of it puts the lens above the roof entirely.
    --
    -- A bone does not move relative to its own vehicle, so this is resolved once here and the
    -- camera stays attached in the engine rather than being placed every frame.
    if isVehicle and m.Auto ~= false then
        local placed = false
        local seat = GetEntityBoneIndexByName(entity, 'seat_dside_f')

        if seat ~= -1 then
            local world = GetWorldPositionOfEntityBone(entity, seat)
            local off = GetOffsetFromEntityGivenWorldCoords(entity, world.x, world.y, world.z)
            if off then
                side    = 0.0
                forward = off.y + (tonumber(m.SeatForward) or 0.42)
                height  = off.z + (tonumber(m.SeatHeight) or 0.60)
                placed  = true
            end
        end

        if not placed then
            local _, hi = GetModelDimensions(GetEntityModel(entity))
            if hi and hi.y > 0 then
                forward = hi.y * (tonumber(m.ForwardFactor) or 0.28)
                height  = hi.z * (tonumber(m.HeightFactor) or 0.62)
            end
        end
    end

    AttachCamToEntity(cam, entity, side, forward, height, true)

    SetCamFov(cam, tonumber(m.Fov) or (isVehicle and 70.0 or 78.0))
    SetCamNearClip(cam, tonumber(m.NearClip) or (isVehicle and 0.15 or 0.10))
    nearClip = nil

    -- A camera strapped to a person is never perfectly still, and a perfectly still one is most of
    -- why a feed reads as a video game rather than as footage. A dashcam is bolted to a car and
    -- gets none of it.
    if LOOK_SHAKE > 0 and not isVehicle then
        ShakeCam(cam, 'HAND_SHAKE', LOOK_SHAKE)
    else
        StopCamShaking(cam, true)
    end

    mounted = entity
end

---Applies the picture grade, in the engine rather than over the top of it. Doing this here rather
---than as a layer in the page is what puts it INTO the recording as well as onto the screen.
local function gradeOn()
    if not LOOK_TIMECYCLE then return end
    SetTimecycleModifier(LOOK_TIMECYCLE)
    SetTimecycleModifierStrength(LOOK_STRENGTH)
end

---Takes the grade back off, for every route out of a camera.
local function gradeOff()
    if not LOOK_TIMECYCLE then return end
    ClearTimecycleModifier()
end

---Rejects geometry that has come too close to the lens while the officer is running.
---
---A ped pitches forward into a run, and the camera is bolted to the ENTITY, whose origin is the
---hips and which does not pitch with the animation. The head therefore swings from roughly level
---with the mount to within a couple of centimetres of it, and what a lens sees at that range is
---the inside of a skull. Widening the near clip for as long as they are running throws that away.
---
---The trade is deliberate: at this range it also drops the officer's own arms and whatever they
---are holding, and holding the picture clean is worth more than seeing their hands.
---@param ped integer officer ped
---@param isVehicle boolean whether the vehicle mount is in charge
local function applyNearClip(ped, isVehicle)
    if not cam then return end

    local m = isVehicle and DASH_MOUNT or MOUNT
    local base = tonumber(m.NearClip) or (isVehicle and 0.15 or 0.10)
    local want = base

    -- A vehicle does not lean, so a dashcam never needs this.
    if not isVehicle then
        local running = tonumber(m.NearClipRunning) or base
        -- Read from the ped's state rather than its speed: the lean starts with the animation, and
        -- waiting for the speed to build lets the artifact through on exactly the frames it shows.
        if running > base and (IsPedRunning(ped) or IsPedSprinting(ped)) then
            want = running
        end
    end

    if nearClip == want then return end
    SetCamNearClip(cam, want)
    nearClip = want
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

---Which seat a ped is sitting in, or nil when they are not in that vehicle. There is no native
---that answers this directly, so the seats are walked instead. -1 is the driver.
---@param ped integer
---@param vehicle integer|nil
---@return integer|nil seat
local function seatOf(ped, vehicle)
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return nil end
    for seat = -1, GetVehicleMaxNumberOfPassengers(vehicle) - 1 do
        if GetPedInVehicleSeat(vehicle, seat) == ped then return seat end
    end
    return nil
end

---Makes one ped look exactly like another: the same outfit, the same face, the same hat.
---
---ClonePed alone is not enough. It reproduces the model and gets most of a face, but it is well
---known for dropping clothing components and props, which is precisely what anyone looking at the
---stand-in would notice first. So the engine's own full copy runs, and then the two things it
---leaves behind are written across by hand.
---@param from integer the ped to copy
---@param to integer the ped to copy onto
local function copyAppearance(from, to)
    -- The engine's own copy handles the head: blend data, overlays, hair and eye colour, none of
    -- which can be read back reliably on every build to be reapplied by hand.
    ClonePedToTarget(from, to)

    -- Every clothing slot, drawable and texture and palette alike. Palette is the one most copies
    -- forget, and it is what carries the colour of a uniform.
    for component = 0, 11 do
        SetPedComponentVariation(to, component,
            GetPedDrawableVariation(from, component),
            GetPedTextureVariation(from, component),
            GetPedPaletteVariation(from, component))
    end

    -- Hats, glasses, earpieces. -1 means the officer is not wearing that slot, and the stand-in
    -- has to have it cleared rather than left with whatever the clone came with.
    for prop = 0, 7 do
        local drawable = GetPedPropIndex(from, prop)
        if drawable == -1 then
            ClearPedProp(to, prop)
        else
            SetPedPropIndex(to, prop, drawable, GetPedPropTextureIndex(from, prop), true)
        end
    end

    -- An officer stood holding a rifle should not be replaced by one standing empty-handed.
    local weapon = GetSelectedPedWeapon(from)
    if weapon and weapon ~= GetHashKey('WEAPON_UNARMED') then
        GiveWeaponToPed(to, weapon, 0, false, true)
    end
end

---Leaves a stand-in where the officer was standing.
---
---Watching somebody across the map means travelling to them, because a remote player is only
---streamed to a client that is near them. Travelling would otherwise mean the officer's body
---visibly vanishing from wherever their colleagues last saw it, so a copy stays behind.
---
---ClonePed is what makes that worth doing: it copies the ped's model AND every component and prop
---with it, so the stand-in is the officer's actual uniform rather than an approximation of it.
---@param ped integer the officer's own ped
---@param coords vector3 where they were standing
---@param heading number which way they were facing
---@param vehicle integer|nil the vehicle they were sitting in, when they were
---@param seat integer|nil that seat's index
---@return integer|nil clone
---@return integer|nil prop the device prop welded into its hands, to delete with it
local function leaveDecoy(ped, coords, heading, vehicle, seat)
    -- (ped, isNetwork, bScriptHostPed, copyHeadBlendFlag). The last one matters: without it a
    -- multiplayer ped comes back with a default face rather than the officer's own.
    local clone = ClonePed(ped, true, false, true)
    if not clone or clone == 0 or not DoesEntityExist(clone) then return nil end

    copyAppearance(ped, clone)

    -- Held as a mission entity so the engine does not tidy it away the moment its owner is three
    -- kilometres from it, which is the entire point of the thing.
    SetEntityAsMissionEntity(clone, true, true)
    SetEntityCoordsNoOffset(clone, coords.x, coords.y, coords.z, false, false, false)
    SetEntityHeading(clone, heading)
    SetBlockingOfNonTemporaryEvents(clone, true)
    SetEntityInvincible(clone, true)

    if vehicle and seat and DoesEntityExist(vehicle) then
        SetPedIntoVehicle(clone, vehicle, seat)
    end

    -- The officer is stood reading a phone or a tablet, because that is how they opened the camera
    -- in the first place. A stand-in with empty hands and no pose is the tell.
    --
    -- Asked of whichever device is actually in hand rather than assumed: the tablet is its own
    -- resource with its own clip and prop, so it answers for itself.
    local prop = pose.mirrorOnto(clone)
    if not prop and GetResourceState('sd-tablet') == 'started' then
        local ok, fromTablet = pcall(function() return exports['sd-tablet']:mirrorPoseOnto(clone) end)
        if ok then prop = fromTablet end
    end

    -- Frozen LAST. A ped that is already static takes a task far less willingly, and the pose is
    -- the whole reason anybody looks twice at the stand-in.
    FreezeEntityPosition(clone, true)

    return clone, prop
end

---Parks the watcher's own character and remembers enough to put it back exactly: where they stood,
---which way they faced, and the seat they were in.
---
---Only the PED travels. The car stays where it was parked, with the stand-in sitting in it, rather
---than a police cruiser blinking across the map in front of everyone.
local function park()
    if stash then return end

    local ped     = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    local seated  = vehicle ~= 0 and DoesEntityExist(vehicle)

    stash = {
        coords  = GetEntityCoords(ped),
        heading = GetEntityHeading(ped),
        visible = IsEntityVisible(ped),
        vehicle = seated and vehicle or nil,
        seat    = seated and seatOf(ped, vehicle) or nil,
        hidden  = not watchingSelf,
    }

    -- Held still either way, so nobody wanders around blind behind a camera.
    FreezeEntityPosition(ped, true)
    SetEntityInvincible(ped, true)
    SetPlayerInvincible(PlayerId(), true)

    -- Hiding and travelling exist to reach somebody ELSE'S scene without being seen standing in
    -- it. Watching your own camera needs neither, and doing it anyway would delete you from your
    -- own dashcam while you stood in front of your own car.
    if not watchingSelf then
        -- The stand-in goes down BEFORE the body leaves, so there is never a frame with nobody
        -- there. Only the ped travels: the car stays parked where it was, with the copy sitting
        -- in it, rather than a police cruiser blinking across the map.
        stash.decoy, stash.decoyProp = leaveDecoy(ped, stash.coords, stash.heading, stash.vehicle, stash.seat)

        SetEntityVisible(ped, false, false)
        SetEntityCollision(ped, false, false)
        SetEntityNoCollisionEntity(ped, ped, false)
    end
end

---Gives the watcher their character back. Every route out of a camera lands here, which is the
---whole reason it is one function: a restore that some exits skip is how somebody ends a shift
---frozen and invisible in the sky.
local function unpark()
    if not stash then return end

    local ped = PlayerPedId()

    SetEntityInvincible(ped, false)
    SetPlayerInvincible(PlayerId(), false)

    -- Only put back what was taken. A self watch never moved or hid anything, so restoring coords
    -- it never left would drag the officer back to wherever they opened the camera from.
    if stash.hidden then
        SetEntityCollision(ped, true, true)

        -- NoOffset, because the ordinary SetEntityCoords drops a ped onto the ground beneath the
        -- point it is given and the officer does not come back an inch off where they were.
        SetEntityCoordsNoOffset(ped, stash.coords.x, stash.coords.y, stash.coords.z, false, false, false)
        SetEntityHeading(ped, stash.heading)

        if stash.vehicle and stash.seat and DoesEntityExist(stash.vehicle) then
            SetPedIntoVehicle(ped, stash.vehicle, stash.seat)
        end

        -- Order matters, and this is the whole reason the decoy is worth having. The body is put
        -- back while it is still invisible, THEN the stand-in goes, THEN the body is shown. Any
        -- other order gives everyone watching either two of them or none of them.
        if stash.decoyProp and DoesEntityExist(stash.decoyProp) then
            DeleteObject(stash.decoyProp)
        end
        if stash.decoy and DoesEntityExist(stash.decoy) then
            DeleteEntity(stash.decoy)
        end

        SetEntityVisible(ped, stash.visible ~= false, false)
    end

    FreezeEntityPosition(ped, false)
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

    -- The ped, never the car. The car is holding the stand-in and stays where it was parked.
    local ped = PlayerPedId()

    FreezeEntityPosition(ped, false)
    SetEntityCoordsNoOffset(ped, x, y, z, false, false, false)
    FreezeEntityPosition(ped, true)
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
                applyNearClip(ped, isVehicle)
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
                notify.show({ description = locale.t('bodycam.unitUnreachable', 'That unit is no longer reachable.'), type = 'error' })
                leaveCamera()
                break
            end

            local at = GetEntityCoords(ped)
            local me = GetEntityCoords(PlayerPedId())
            -- None of the chasing applies to your own unit: you are already there, and dragging
            -- your own character around would be the one thing a self watch must never do.
            if not watchingSelf then
                if #(at - me) > FOLLOW_DIST then jumpTo(at.x, at.y, at.z) end

                -- Focus follows the officer rather than a fixed point, so the world keeps
                -- streaming around them as they drive rather than around wherever they started.
                SetFocusEntity(ped)
            end

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
        cameraId   = data.cameraId,
        kind       = data.kind == 'dashcam' and 'dashcam' or 'bodycam',
        target     = target,
        officer    = data.officer,
        callsign   = data.callsign,
        plate      = data.plate,
        model      = data.model ~= nil and vehicleModel(data.model).display or nil,
        unit       = data.unit,
        rank       = data.rank,
        vehicleNet = tonumber(data.vehicleNet) or nil,
    }

    watchingSelf = target == GetPlayerServerId(PlayerId())

    park()

    -- Jump first, then wait: a player who is not in scope cannot be resolved, and the only way
    -- into their scope is to be standing where they are. Your own unit is trivially in your own
    -- scope, so a self watch skips the travelling entirely.
    local at = not watchingSelf and type(data.coords) == 'table' and data.coords or nil
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

    gradeOn()
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

    gradeOff()
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
            description = by
                and locale.t('bodycam.sharedBy', '{name} sent you bodycam footage.', { name = by })
                or locale.t('bodycam.sharedAnon', 'You were sent bodycam footage.'),
            type = 'inform',
        })
    end)

    ---Reports the vehicle the officer is in, which decides whether a dashcam tile appears for it.
    ---
    ---The class can only be read on a client, so it has to come from here. The network id does
    ---not, but it is sent anyway because the server's own GetVehiclePedIsIn goes through OneSync
    ---and reads 0 for a moment after somebody gets in, which is exactly when a dispatcher looks.
    ---@param vehicle integer|nil the vehicle the officer is now in
    local function reportVehicle(vehicle)
        TriggerServerEvent('sd-phone:server:mdt:cameraVehicle', {
            class = vehicle and GetVehicleClass(vehicle) or nil,
            netId = vehicle and NetworkGetNetworkIdFromEntity(vehicle) or nil,
        })
    end

    -- Driven by the cache rather than a poll, so an officer on foot costs nothing.
    lib.onCache('vehicle', reportVehicle)

    -- The cache only fires on a CHANGE, so an officer already sitting in a car when this resource
    -- starts would never be reported at all. One report on start closes that.
    CreateThread(function()
        Wait(2000)
        reportVehicle(cache.vehicle)
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
