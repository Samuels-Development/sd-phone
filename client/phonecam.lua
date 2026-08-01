---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Module table; the table returned at end of file.
local phonecam = {}

---@type integer SKEL_Head bone index; the lens rides the head so it tracks look direction.
local HEAD_BONE <const> = 31086
---@type number Lens field of view, chosen to frame like the native cell cam.
local CAM_FOV <const> = 50.0
---@type number Metres the rear lens sits ahead of the eyes.
local REAR_OFFSET <const> = 0.12
---@type number Metres the lens rides above the head bone.
local RISE <const> = 0.05
---@type number Metres the selfie lens sits out in front of the face: far enough out that the
---player's head and shoulders fit in frame at arm's length.
local SELFIE_REACH <const> = 0.55
---@type number Metres the selfie lens sits right of centre, where a right hand holds it.
local SELFIE_RIGHT <const> = 0.05
---@type number Metres the selfie lens sits below the eyes, so it looks slightly up at the face.
local SELFIE_DROP <const> = 0.05
---@type number Degrees the selfie lens may swing off the body while seated, where the player
---cannot turn to follow it. Well short of the quarter turn that would show the side of the head.
local SELFIE_YAW_LIMIT <const> = 60.0
---@type number Degrees the rear lens may swing off the vehicle while seated, wide enough to shoot
---out of either side window. On foot there is none: the player turns to face the shot instead.
local SEATED_YAW_LIMIT <const> = 120.0
---@type number Degrees of view turn per frame below which the player is not deliberately looking
---around, so the pivot stays out of the way of ordinary walking.
local TURN_EPSILON <const> = 0.05
---@type integer INPUT_LOOK_LR, the look axis itself.
local LOOK_LR <const> = 1
---@type number Look-axis deflection below which the player is not steering the view. Read off the
---axis rather than the camera's frame delta: the camera drifts by itself as the player walks, which
---no delta threshold can tell apart from a slow deliberate turn.
local LOOK_DEADZONE <const> = 0.005
---@type number Speed in m/s above which locomotion owns the heading, so the pivot asks the ped to
---turn instead of setting it outright and sliding them sideways through a forward-walk cycle.
local MOVING_SPEED <const> = 0.1
---@type number Degrees the selfie lens may tilt up or down under the mouse.
local SELFIE_PITCH_LIMIT <const> = 45.0
---@type number Selfie field of view, wider than the rear lens so the player and some of the street
---behind them both fit at that reach.
local SELFIE_FOV <const> = 60.0
---@type number Tightest field of view the lens will zoom to. Any narrower and the smallest aim
---movement throws the frame off the subject.
local MIN_FOV <const> = 10.0
---@type number Fraction of the remaining gap to the target field of view the lens closes each
---frame. Zooming optically means the game renders the tighter view, so it stays sharp.
local ZOOM_EASE <const> = 0.2
---@type number Fraction of the gap to the head's true offset the selfie anchor closes each frame.
---Slow against a step cycle, so the sway of a walk is flattened out of the shot.
local HEAD_EASE <const> = 0.04
---@type number Metres of offset change taken as a jump rather than a stride, so the anchor snaps
---across a teleport or a vehicle entry instead of sliding there.
local HEAD_SNAP <const> = 0.6
---@type integer Follow-ped view mode for first person. The game swaps the ped onto the first-person
---locomotion set there, which is authored to be seen from inside the head and reads as a lurch from
---the front, so the lens stands it down while it owns the view.
local FIRST_PERSON_VIEW <const> = 4
---@type integer Third-person view mode borrowed while the lens owns the view.
local THIRD_PERSON_VIEW <const> = 1

---@type integer|nil Handle of the scripted camera while it owns the view.
local cam = nil
---@type boolean True while the per-frame follow thread is alive.
local loopRunning = false
---@type boolean True while the selfie lens is selected.
local selfie = false
---@type boolean True while the selfie lens is held off the body: it then swings around the player
---instead of turning them with it, which is how you get an angle on yourself rather than the same
---head-on one every time. Walking is unaffected. Cleared on every lens flip and camera open.
local locked = false
---@type boolean True while the player's head is turned to follow the selfie lens, so an angled
---shot still has them looking down the barrel. Cleared alongside the swing.
local faceCam = false
---@type integer Game time the look-at was last issued. Re-issued on a poll rather than every frame:
---the target moves with the lens, but restarting the task 60 times a second makes the head twitch.
local lastLookAt = 0
---@type integer Milliseconds between look-at refreshes.
local LOOK_REFRESH <const> = 150
---@type integer Lifetime given to each look-at, longer than the refresh so tracking never lapses
---between them.
local LOOK_HOLD <const> = 400
---@type number Degrees the selfie lens is currently swung off the body. Integrated from the view's
---frame-to-frame turn rather than its absolute angle, so it saturates at the limit instead of
---flipping across the player when the view sweeps through their back.
local selfieSwing = 0.0
---@type number Degrees the rear lens is swung off the vehicle while seated, integrated the same
---way. Unused on foot, where the player turns instead.
local rearSwing = 0.0
---@type number|nil Last frame's view heading, the baseline that turn is measured against.
local lastViewYaw = nil
---@type number Magnification the viewfinder is asking for; 1 is the lens's own field of view.
local zoomTarget = 1.0
---@type number Field of view actually applied this frame, eased toward what the zoom calls for.
local fov = CAM_FOV
---@type integer|nil View mode the player was on before the lens borrowed a third-person one.
local savedViewMode = nil
---@type vector3|nil Head offset from the body in the body's own axes (forward, right, up), eased.
---The selfie lens hangs off this rather than the bone, so a stride does not swing the whole shot.
local steadyOffset = nil

---Whether a surface may keep the player moving, which decides scripted cam vs native cell cam.
---The native pins the ped at engine level regardless of NUI keep-input, so free movement and the
---cell cam are mutually exclusive.
---@param surface 'camera'|'video'
---@return boolean
function phonecam.movementAllowed(surface)
    if config.Phone.AllowMovement == false then return false end
    if surface == 'video' then return config.Phone.AllowMovementInVideoCall ~= false end
    return config.Phone.AllowMovementInCamera ~= false
end

---Unit forward vector for a pitch/yaw pair in degrees.
---@param pitch number
---@param yaw number
---@return vector3
local function forward(pitch, yaw)
    local p, y = math.rad(pitch), math.rad(yaw)
    local horiz = math.abs(math.cos(p))
    return vector3(-math.sin(y) * horiz, math.cos(y) * horiz, math.sin(p))
end

---The head with the sway of the walk cycle taken out, for the selfie lens to hang off. The offset
---is eased in the body's own axes, so the anchor holds through a turn instead of lagging round it.
---@param ped integer
---@param head vector3
---@return vector3
local function steadyHead(ped, head)
    local base = GetEntityCoords(ped)
    local rad  = math.rad(GetEntityHeading(ped))
    local fwd  = vector3(-math.sin(rad), math.cos(rad), 0.0)
    local rgt  = vector3(math.cos(rad), math.sin(rad), 0.0)
    local off  = head - base
    local want = vector3(off.x * fwd.x + off.y * fwd.y, off.x * rgt.x + off.y * rgt.y, off.z)

    if not steadyOffset or #(want - steadyOffset) > HEAD_SNAP then
        steadyOffset = want
    else
        steadyOffset = steadyOffset + (want - steadyOffset) * HEAD_EASE
    end

    return base + fwd * steadyOffset.x + rgt * steadyOffset.y + vector3(0.0, 0.0, steadyOffset.z)
end

---Shortest signed turn from `from` to `to`, in degrees (-180..180].
---@param to number
---@param from number
---@return number
local function angleDelta(to, from)
    return (to - from + 180.0) % 360.0 - 180.0
end

---@param value number
---@param limit number
---@return number
local function clamp(value, limit)
    if value < -limit then return -limit end
    if value > limit then return limit end
    return value
end

---The field of view the current lens and magnification call for. Halving the angle rather than the
---number doubles the magnification, so the arithmetic goes through the tangent.
---@return number
local function wantedFov()
    local base = selfie and SELFIE_FOV or CAM_FOV
    local want = math.deg(2.0 * math.atan(math.tan(math.rad(base) * 0.5) / zoomTarget))
    return want < MIN_FOV and MIN_FOV or want
end

---Eases the lens toward the field of view the zoom calls for. Running here rather than in the page
---keeps it per-frame smooth without a NUI round trip for every notch of the wheel.
local function applyZoom()
    local want = wantedFov()
    if math.abs(want - fov) < 0.01 then
        if fov ~= want then
            fov = want
            SetCamFov(cam, fov)
        end
        return
    end
    fov = fov + (want - fov) * ZOOM_EASE
    SetCamFov(cam, fov)
end

---Sets the magnification the viewfinder wants. The lens eases to it over the following frames.
---@param z any magnification; below 1 is clamped away, the lens never goes wider than its own view
function phonecam.setZoom(z)
    z = tonumber(z) or 1.0
    zoomTarget = z < 1.0 and 1.0 or z
end

---Stops the head tracking and lets it settle back onto the body's own facing. Safe to call when it
---was never on; declared here so every exit path below can reach it.
local function clearFaceCam()
    faceCam = false
    lastLookAt = 0
    TaskClearLookAt(PlayerPedId())
end

---Places the lens for this frame. When the body is free to turn the player faces whatever the lens
---is aimed at, so bystanders see them point the phone at what they are shooting; when it is pinned,
---seated or locked, the lens swings off the body within a limit instead.
local function place()
    local ped    = PlayerPedId()
    local view   = GetGameplayCamRot(2)
    local head   = GetPedBoneCoords(ped, HEAD_BONE, 0.0, 0.0, 0.0)
    -- Seated and locked are the same constraint: the body is not going to turn, so the lens has to.
    -- The lock is selfie only, hence the pairing rather than the flag alone.
    local pinned = (locked and selfie) or IsPedInAnyVehicle(ped, true)

    local turn = angleDelta(view.z, lastViewYaw or view.z)
    lastViewYaw = view.z

    -- Only while the player is actually steering, so locomotion keeps the heading when they are
    -- just walking and the ped never fights its own movement. Standing still the heading is set
    -- outright: the selfie lens is welded to the body, so asking the ped to turn at its own pace
    -- would make that turn rate the mouse sensitivity and the whole lens feel weighted.
    -- The look axis gates this, not the camera delta alone: the camera swings by itself as the
    -- player walks, so the delta on its own re-aims the ped every frame and parks it in the turn
    -- blend of the walk cycle, which is what makes a walk look like a wobble.
    local look     = GetDisabledControlNormal(0, LOOK_LR)
    local steering = look > LOOK_DEADZONE or look < -LOOK_DEADZONE

    if not pinned and steering and (turn > TURN_EPSILON or turn < -TURN_EPSILON) then
        if GetEntitySpeed(ped) > MOVING_SPEED then
            SetPedDesiredHeading(ped, view.z)
        else
            SetEntityHeading(ped, view.z)
        end
    end

    if not selfie then
        -- The body is already chasing the view, so the lens can track the mouse one to one and
        -- stay crisp; the holder is hidden from this lens anyway, so the catch-up never shows.
        local yaw = view.z
        if pinned then
            rearSwing = clamp(rearSwing + turn, SEATED_YAW_LIMIT)
            yaw = GetEntityHeading(ped) + rearSwing
        end
        local pos = head + forward(view.x, yaw) * REAR_OFFSET + vector3(0.0, 0.0, RISE)
        SetCamCoord(cam, pos.x, pos.y, pos.z)
        SetCamRot(cam, view.x, 0.0, yaw, 2)
        return
    end

    -- A selfie turns the player, not the lens. Welded to the body the outstretched arm points
    -- straight down the barrel and stays hidden behind the phone; swing the lens off the body
    -- instead and the arm crosses the shot. Pinned that is the trade: a bit of arm in exchange for
    -- an angle on yourself other than head-on.
    selfieSwing = pinned and clamp(selfieSwing + turn, SELFIE_YAW_LIMIT) or 0.0

    local yaw   = GetEntityHeading(ped) + selfieSwing
    local pitch = clamp(view.x, SELFIE_PITCH_LIMIT)
    local rad   = math.rad(yaw)
    local right = vector3(math.cos(rad), math.sin(rad), 0.0)
    -- Off the steadied head, not the bone. Hung off the bone the lens inherits the head's sway and
    -- aims at it too, which pins the head dead centre and rocks the body under it every stride.
    local anchor = steadyHead(ped, head)
    local pos   = anchor + forward(pitch, yaw) * SELFIE_REACH
                        + right * SELFIE_RIGHT
                        - vector3(0.0, 0.0, SELFIE_DROP)

    SetCamCoord(cam, pos.x, pos.y, pos.z)
    -- Aim at the head instead of deriving a rotation. The hand offsets above push the lens off the
    -- face's axis, and any fixed rotation leaves the player sitting off-centre in frame; pointing
    -- at the head keeps them centred whatever the offsets are, and lets pitch raise and lower the
    -- phone around the face rather than tilting them out of shot. The steadied head again: aiming
    -- at the bone swings the lens a few degrees a stride, which throws the whole street about.
    PointCamAtCoord(cam, anchor.x, anchor.y, anchor.z)

    -- Head tracking rides on top of the pose: the body keeps the angle the swing gave it while the
    -- face comes back round to the lens.
    if faceCam then
        local now = GetGameTimer()
        if now - lastLookAt >= LOOK_REFRESH then
            lastLookAt = now
            TaskLookAtCoord(ped, pos.x, pos.y, pos.z, LOOK_HOLD, 2048, 3)
        end
    end
end

---Takes the view with a scripted camera. Unlike CellCamActivate this leaves the ped free, so the
---player keeps walking; the gameplay cam still tracks the mouse, so look direction still steers it.
function phonecam.start()
    if cam then return end
    selfie = false
    selfieSwing = 0.0
    rearSwing = 0.0
    lastViewYaw = nil
    zoomTarget = 1.0
    fov = CAM_FOV
    locked = false
    steadyOffset = nil
    clearFaceCam()
    -- Borrowed for as long as the lens owns the view, and handed straight back on stop.
    if GetFollowPedCamViewMode() == FIRST_PERSON_VIEW then
        savedViewMode = FIRST_PERSON_VIEW
        SetFollowPedCamViewMode(THIRD_PERSON_VIEW)
    end
    cam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamFov(cam, fov)
    place()
    SetCamActive(cam, true)
    RenderScriptCams(true, false, 0, true, true)

    if loopRunning then return end
    loopRunning = true
    CreateThread(function()
        while cam do
            place()
            applyZoom()
            Wait(0)
        end
        loopRunning = false
    end)
end

---Hands the view back to the gameplay camera. Idempotent.
function phonecam.stop()
    if not cam then return end
    clearFaceCam()
    RenderScriptCams(false, false, 0, true, true)
    SetCamActive(cam, false)
    DestroyCam(cam, false)
    cam = nil
    selfie = false
    steadyOffset = nil
    if savedViewMode then
        SetFollowPedCamViewMode(savedViewMode)
        savedViewMode = nil
    end
end

---Flips the lens. The selfie's wider field of view is picked up by the zoom ease, so the change
---blends rather than snapping. No-op unless the scripted cam owns the view.
---@param on boolean|nil truthy = selfie
function phonecam.setSelfie(on)
    if not cam then return end
    selfie = on and true or false
    selfieSwing = 0.0
    rearSwing = 0.0
    lastViewYaw = nil
    zoomTarget = 1.0
    steadyOffset = nil
    -- Cleared on every flip so the page, which resets its own copy on the same event, can never
    -- describe a lens that is no longer behaving that way.
    locked = false
    clearFaceCam()
    -- The selfie lens aims with PointCamAtCoord, which leaves a standing point-at target on the
    -- camera. Left in place the rear lens fights it: the constraint and SetCamRot both write the
    -- rotation every frame, so the view jitters and drags toward wherever the head last was.
    if not selfie then StopCamPointing(cam) end
end

---Stops the body turning with the selfie lens, or hands it back. Walking is untouched: the point is
---to swing the shot around yourself for a different angle, not to be pinned down. Selfie only, since
---the outward lens frames the world and gains nothing from being held off the body.
---@return boolean|nil locked the state after the toggle, nil when the lens cannot use it
function phonecam.toggleLock()
    if not cam or not selfie then return nil end
    locked = not locked
    selfieSwing = 0.0
    return locked
end

---Turns the player's head to follow the selfie lens, so an angled shot still has them looking at the
---camera, or lets it sit with the body. Selfie only, for the same reason the swing is.
---@return boolean|nil facing the state after the toggle, nil when the lens cannot use it
function phonecam.toggleFaceCam()
    if not cam or not selfie then return nil end
    if faceCam then
        clearFaceCam()
        return false
    end
    faceCam = true
    lastLookAt = 0
    return true
end

---True while the scripted cam owns the view.
---@return boolean
function phonecam.active() return cam ~= nil end

---True while the REAR lens owns the view, i.e. the player and the phone in their hand must not
---appear in their own shot.
---@return boolean
function phonecam.rearActive() return cam ~= nil and not selfie end

return phonecam
