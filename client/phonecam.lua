---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Module table; the table returned at end of file.
local phonecam = {}

---@type integer SKEL_Head bone TAG. The camera and bone-coordinate natives take the tag, NOT the
---index GetPedBoneIndex returns - measured on this build, the tag lands 0.000 m from the head while
---the index (98) silently lands on the ped's centre and frames the middle of their chest. The
---official native reference says the opposite and its own example contradicts it.
local HEAD_BONE <const> = 31086
---@type integer SKEL_ROOT bone tag, the pelvis. Only used to measure how far the head has swung off
---the torso this frame; the lens never hangs off it, because the root rises and falls WITH the head
---(0.7 cm of differential) and anchoring there just lets the whole player bob through a still frame.
local ROOT_BONE <const> = 0
---@type number How much of the head's sway off the torso the lens follows. The head really does
---travel ~9 cm sideways over the shoulders in GTA's walk cycle, and one rigid camera point cannot
---hold both still: follow the head and the body swings, follow the body and the face swims. At 0.5
---the error is halved and shared, which reads as neither. 0 pins the body, 1 pins the face.
local SELFIE_SPLIT <const> = 0.5
---@type number Lens field of view, chosen to frame like the native cell cam.
local CAM_FOV <const> = 50.0
---@type number Metres the rear lens sits ahead of the eyes.
local REAR_OFFSET <const> = 0.12
---@type number Metres the lens rides above the head bone.
local RISE <const> = 0.05
---@type number Metres the selfie lens sits out in front of the face. Held further out than an arm
---naturally reaches because the residual sway is a TRANSLATION, so the angle it subtends falls off
---linearly with distance: the same 9 cm of sway is 9.2 degrees at 0.55 m and 3.4 degrees at 0.75 m.
---SELFIE_FOV is narrowed to match, so the framing is unchanged and only the shake shrinks. Much past
---0.9 m and the shot stops reading as something held in a hand.
local SELFIE_REACH <const> = 0.75
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
---@type number Selfie field of view. Narrowed from 60 to hold the SAME framing now the lens sits at
---0.75 m instead of 0.55: 2*atan(tan(30 deg) * 0.55/0.75). Change one of these and the other has to
---move with it or the shot re-crops.
local SELFIE_FOV <const> = 46.0
---@type number Tightest field of view the lens will zoom to. Any narrower and the smallest aim
---movement throws the frame off the subject.
local MIN_FOV <const> = 10.0
---@type number Fraction of the remaining gap to the target field of view the lens closes each
---frame. Zooming optically means the game renders the tighter view, so it stays sharp.
local ZOOM_EASE <const> = 0.2
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
---@type boolean True while the selfie lens is attached to the ped by the engine.
local selfieAttached = false
---@type integer[] Sprint and jump, held off while the selfie lens is live. Both roughly double the sway
---the lens has to absorb (9 cm of sideways head travel at a walk against 11 cm sprinting, and 5 cm of
---fore-aft pumping against 10 cm), and neither reads as something you do while filming your own face.
---Walking is untouched.
local CONTROLS_STRIDE <const> = { 21, 22 }
---@type boolean True while CONTROLS_STRIDE is in the shared disabled set.
local strideHeld = false

---Puts the selfie lens's sprint and jump block into ox_lib's shared disabled set, which client.main's
---input thread applies every frame, or takes it out. Exactly once each way, since the set is
---refcounted and the phone's lockscreen holds jump through it too.
---@param on boolean
local function holdStride(on)
    if strideHeld == on then return end
    strideHeld = on
    if on then
        lib.disableControls:Add(CONTROLS_STRIDE)
    else
        lib.disableControls:Remove(CONTROLS_STRIDE)
    end
end

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
    TaskClearLookAt(cache.ped)
end

---Places the lens for this frame. When the body is free to turn the player faces whatever the lens
---is aimed at, so bystanders see them point the phone at what they are shooting; when it is pinned,
---seated or locked, the lens swings off the body within a limit instead.
local function place()
    local ped    = cache.ped
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

    local pitch = clamp(view.x, SELFIE_PITCH_LIMIT)

    -- POSITION is welded to the head by the engine; ROTATION is set here in world space. The split
    -- is deliberate and each half fixes a different failure:
    --
    --  * welded to the head, the face keeps exactly one spot in frame. Hung off the ROOT instead,
    --    the frame holds still and the head bobs through it - 15 cm a stride even at a walk. The
    --    head and the body do not travel together in GTA's walk cycle, so only one of them can be
    --    the thing that sits still, and for a selfie it has to be the face.
    --  * the rotation does NOT go through AttachCamToPedBone_2, whose rotation is expressed in the
    --    BONE's own frame. The root bone happens to be aligned with the ped, so it looked right
    --    there, but the head bone's axes are not - the same call laid the whole image on its side.
    --    Set in world space off the ped's heading, which measures 0.00 degrees of drift while
    --    walking straight, the horizon stays level and the aim cannot oscillate.
    if selfieAttached then
        local p    = math.rad(pitch)
        local rad  = math.rad(selfieSwing)
        local out  = math.cos(p) * SELFIE_REACH
        local rise = math.sin(p) * SELFIE_REACH

        -- How far the head has swung off the torso sideways this frame. Followed only in part: the
        -- lens gives up SELFIE_SPLIT of it, so the face drifts by that share and the shoulders by
        -- the rest, instead of one of them carrying the whole ~9 cm.
        local root  = GetPedBoneCoords(ped, ROOT_BONE, 0.0, 0.0, 0.0)
        local hrad  = math.rad(GetEntityHeading(ped))
        local sway  = (head.x - root.x) * math.cos(hrad) + (head.y - root.y) * math.sin(hrad)

        -- The swing rotates the offset the SAME way the aim below swings, which means negative sine
        -- on the local X: the attachment's local +X is the ped's RIGHT, and a rising world heading
        -- turns toward the ped's LEFT. Match the two signs and the aim tracks the lens; get one of
        -- them backwards and the lens orbits one way while the aim orbits the other, so the shot
        -- misses the player by TWICE the swing - fine head-on, and off the player entirely by a
        -- quarter turn, which is where the angle is worth having.
        AttachCamToPedBone(cam, ped, HEAD_BONE,
            -math.sin(rad) * out + math.cos(rad) * SELFIE_RIGHT - SELFIE_SPLIT * sway,
             math.cos(rad) * out + math.sin(rad) * SELFIE_RIGHT,
            rise - SELFIE_DROP,
            true)
        SetCamRot(cam, -pitch, 0.0, GetEntityHeading(ped) + 180.0 + selfieSwing, 2)

        if faceCam then
            local now = GetGameTimer()
            if now - lastLookAt >= LOOK_REFRESH then
                lastLookAt = now
                local at = GetFinalRenderedCamCoord()
                TaskLookAtCoord(ped, at.x, at.y, at.z, LOOK_HOLD, 2048, 3)
            end
        end
        return
    end

    local yaw   = GetEntityHeading(ped) + selfieSwing
    local rad   = math.rad(yaw)
    local right = vector3(math.cos(rad), math.sin(rad), 0.0)
    -- The lens rides the head bone itself, and aims at the very point it hangs off. That makes the
    -- lens-to-face vector depend on pitch and heading alone, so the face keeps ONE spot in frame no
    -- matter how the walk cycle bobs. Smoothing this anchor instead holds the lens still while the
    -- head goes on bobbing, and the ~9 degrees a stride between the two is what threw the player
    -- around the shot. The street does not pay for it: the lens direction is unchanged by the bob,
    -- so scenery only parallaxes by the 13 cm the head actually travels.
    local anchor = head
    local pos   = anchor + forward(pitch, yaw) * SELFIE_REACH
                        + right * SELFIE_RIGHT
                        - vector3(0.0, 0.0, SELFIE_DROP)

    SetCamCoord(cam, pos.x, pos.y, pos.z)
    -- Aim at the head instead of deriving a rotation. The hand offsets above push the lens off the
    -- face's axis, and any fixed rotation leaves the player sitting off-centre in frame; pointing
    -- at the head keeps them centred whatever the offsets are, and lets pitch raise and lower the
    -- phone around the face rather than tilting them out of shot.
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
    selfieAttached = false
    DetachCam(cam)
    StopCamPointing(cam)
    RenderScriptCams(false, false, 0, true, true)
    SetCamActive(cam, false)
    DestroyCam(cam, false)
    cam = nil
    selfie = false
    holdStride(false)
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
    selfieAttached = selfie
    holdStride(selfie)
    if not selfie then
        -- The rear lens drives its own coord and rotation, which an attachment silently overrides.
        DetachCam(cam)
        StopCamPointing(cam)
    end
    selfieSwing = 0.0
    rearSwing = 0.0
    lastViewYaw = nil
    zoomTarget = 1.0
    -- Cleared on every flip so the page, which resets its own copy on the same event, can never
    -- describe a lens that is no longer behaving that way.
    locked = false
    clearFaceCam()
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

---Whether the scripted cam is up AND the selfie lens is the one framing. The pose reads this to
---keep the outstretched selfie clip through a landscape flip: the landscape clip holds the phone
---right in front of the face, which is exactly where the selfie lens is looking.
---@return boolean
function phonecam.selfieActive() return cam ~= nil and selfie end

return phonecam
