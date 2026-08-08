---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Scripted phone camera (client.phonecam): whether IT frames the shot decides which
---clip we hold, and whether we hold one at all.
local phonecam = require 'client.phonecam'

---@type table Module table; the table returned at end of file.
local pose = {}

---@type integer Flags for the reading pose: loop, resist interruption, upper body only, secondary
---task. Upper-body plus secondary is what leaves the legs free to walk; the phone has always
---looped this one, so it keeps looping.
local READ_FLAGS <const> = 1 | 8 | 16 | 32
---@type integer Flags for the framing pose: hold the last frame, resist interruption, upper body
---only, secondary task, hide the weapon. Holding the last frame is what parks the ped in the
---raised-phone pose, and nobody frames a shot down the barrel of a rifle.
local FRAME_FLAGS <const> = 2 | 8 | 16 | 32 | 1048576

---@type table<string, table<string, { dict: string, anim: string, blendIn: number, blendOut: number, flags: integer }>>
---Held clip per action, split by whether the player is in a vehicle. The framing pose uses selfie
---rather than selfie_in because the latter animates raising the phone from the hip, which replays
---as a stow and redraw every time the clip is re-asserted on a phone already in hand. The landscape
---pose turns the wrist so the phone lies on its side, which is why it is wrong for portrait.
local CLIPS = {
    default = {
        onFoot = { dict = 'cellphone@',          anim = 'cellphone_text_read_base', blendIn = 8.0,    blendOut = -8.0,    flags = READ_FLAGS },
        inCar  = { dict = 'cellphone@in_car@ds', anim = 'cellphone_text_read_base', blendIn = 8.0,    blendOut = -8.0,    flags = READ_FLAGS },
    },
    typing = {
        onFoot = { dict = 'amb@code_human_wander_texting@male@base',          anim = 'static', blendIn = 8.0,    blendOut = -8.0,    flags = READ_FLAGS },
        inCar  = { dict = 'cellphone@in_car@ds', anim = 'cellphone_text_in', blendIn = 8.0,    blendOut = -8.0,    flags = READ_FLAGS },
    },
    camera = {
        onFoot = { dict = 'cellphone@self',      anim = 'selfie',                   blendIn = 8.0,    blendOut = -8.0,    flags = FRAME_FLAGS },
        inCar  = { dict = 'cellphone@self',      anim = 'selfie',                   blendIn = 8.0,    blendOut = -8.0,    flags = FRAME_FLAGS },
    },
    landscape = {
        onFoot = { dict = 'cellphone@',          anim = 'cellphone_photo_idle',     blendIn = 8.0,    blendOut = -8.0,    flags = FRAME_FLAGS },
        inCar  = { dict = 'cellphone@',          anim = 'cellphone_photo_idle',     blendIn = 8.0,    blendOut = -8.0,    flags = FRAME_FLAGS },
    },
}

if config.Phone.AnimDict and config.Phone.AnimName then
    CLIPS.default.onFoot = {
        dict = config.Phone.AnimDict, anim = config.Phone.AnimName,
        blendIn = 8.0, blendOut = -8.0, flags = READ_FLAGS,
    }
end

if config.Phone.TypingAnimDict and config.Phone.TypingAnimName then
    CLIPS.typing.onFoot = {
        dict = config.Phone.TypingAnimDict, anim = config.Phone.TypingAnimName,
        blendIn = 8.0, blendOut = -8.0, flags = READ_FLAGS,
    }
end

---@type boolean True while the phone NUI is open.
local phoneOpen = false
---@type boolean True while the lockscreen torch is lit.
local torchOn = false
---@type boolean True while a camera surface owns the view.
local cameraOn = false
---@type boolean True while the Camera app is in landscape mode.
local landscape = false
---@type string Current frame colour; drives which prop model is welded.
local color = config.Phone.DefaultColor or 'black'
---@type integer|nil Handle of the attached phone prop, nil while stowed.
local prop
---@type boolean True while a text field in the phone has focus
local typing = false
---@type table<integer, true> Prop models this client has already failed to stream.
local unavailableModels = {}

---Whether our pose applies: the phone is out (or the torch is lit), and the native cell cam is not
---the one framing. That native animates its own pose and spawns its own phone, so ours stands down
---for it; the scripted cam animates nothing, so ours has to stay up.
---@return boolean
function pose.shouldHold()
    if not config.Phone.HoldAnimation then return false end
    if cameraOn and not phonecam.active() then return false end
    return phoneOpen or torchOn
end

---The clip that should be held right now. Every caller reads the pose through this, so adding a
---clip can never leave the watchdog hunting for one the player was never given.
---
---The vehicle test stays a native rather than `cache.vehicle`: the `true` argument counts a ped
---climbing in, and the cache only fills once they are seated. Swapping the clip on the way in is
---the point of asking.
---@return { dict: string, anim: string, blendIn: number, blendOut: number, flags: integer }
local function currentClip()
    -- One camera pose covers both lenses: the native cell cam swapped pose on flip, but no
    -- outward-facing clip outside that native is verified to exist. Landscape is the exception:
    -- it turns the phone on its side, so it gets its own clip.
    local action = 'default'
    if cameraOn and phonecam.active() then
        action = landscape and 'landscape' or 'camera'
    elseif typing then
        action = "typing"
    end
    return CLIPS[action][IsPedInAnyVehicle(cache.ped, true) and 'inCar' or 'onFoot']
end

---Where the prop sits in the hand. Landscape lays the phone on its side for the wide viewfinder.
---@param wide boolean|nil
---@return vector3 offset, vector3 rotation
local function propTransform(wide)
    if wide then
        return config.Phone.PropLandscapeOffset or config.Phone.PropOffset,
               config.Phone.PropLandscapeRot or config.Phone.PropRot
    end
    return config.Phone.PropOffset, config.Phone.PropRot
end

---Creates a colour-matched local phone prop, disables its collision, and rigidly welds it to the
---ped's hand bone.
---
---lib.requestModel raises rather than returning on a bad or slow model, and it runs the
---IsModelValid / IsModelInCdimage pre-check itself, so one pcall covers both failures. The result
---is memoised because a server running no phone props would otherwise retry on every re-weld, and
---the model is released on the failure path too, or that branch leaks a streaming reference each
---time it is taken.
---@param ped integer ped to attach the prop to
---@param frame string frame colour; must be a key of FRAME_COLORS
---@param wide boolean|nil weld it in the landscape grip
---@return integer? prop the welded prop entity, or nil if the model wouldn't stream
function pose.createProp(ped, frame, wide)
    local model = joaat(config.Phone.PropPrefix .. frame)
    if unavailableModels[model] then return nil end

    if not pcall(lib.requestModel, model, 1000) then
        SetModelAsNoLongerNeeded(model)
        unavailableModels[model] = true
        return nil
    end

    local coords = GetEntityCoords(ped)
    local obj = CreateObject(model, coords.x, coords.y, coords.z, false, true, true)
    SetEntityCollision(obj, false, false)
    local off, rot = propTransform(wide)
    AttachEntityToEntity(obj, ped, GetPedBoneIndex(ped, config.Phone.PropBone),
        off.x, off.y, off.z, rot.x, rot.y, rot.z, false, false, false, false, 2, true)
    SetModelAsNoLongerNeeded(model)
    return obj
end

---Attaches our own hand prop in the current frame colour and grip. No-op if one is already
---attached or the model won't stream.
---@param ped integer player ped handle
local function attachProp(ped)
    if prop and DoesEntityExist(prop) then return end
    prop = pose.createProp(ped, color, landscape)
end

---Delete the attached phone prop, if any. Idempotent.
function pose.removeProp()
    if prop and DoesEntityExist(prop) then DeleteObject(prop) end
    prop = nil
end

---Plays the clip the current action calls for and welds the prop, on its own thread: the pose is
---cosmetic and must never gate the phone opening.
---
---lib.requestAnimDict rather than lib.playAnim, which would load, play and release in one call and
---forfeit the shouldHold re-check: the load yields, and a phone closed during it must not be
---answered with a clip that then has to be stopped again. The dict goes back as soon as the task
---has it, since the task holds its own reference; the hand-rolled path never released and leaked
---one per clip for the session.
local function play()
    CreateThread(function()
        local clip = currentClip()

        if not pcall(lib.requestAnimDict, clip.dict, 1000) then return end
        if not pose.shouldHold() then
            RemoveAnimDict(clip.dict)
            return
        end

        local ped = cache.ped
        if not IsEntityPlayingAnim(ped, clip.dict, clip.anim, 3) then
            TaskPlayAnim(ped, clip.dict, clip.anim, clip.blendIn, clip.blendOut, -1, clip.flags, 0.0, false, false, false)
        end
        RemoveAnimDict(clip.dict)

        attachProp(ped)
    end)
end

---Stops whichever of our clips is playing and removes the prop. Every clip is checked because
---entering the viewfinder or a vehicle swaps which one is up.
function pose.stop()
    local ped = cache.ped
    for _, contexts in pairs(CLIPS) do
        for _, clip in pairs(contexts) do
            if IsEntityPlayingAnim(ped, clip.dict, clip.anim, 3) then
                StopAnimTask(ped, clip.dict, clip.anim, 1.0)
            end
        end
    end
    pose.removeProp()
end

---Mirrors the phone's state, then starts or stops the pose to match it.
---@param state { open: boolean, torch: boolean, camera: boolean, color: string, typing: boolean }
function pose.refresh(state)
    phoneOpen = state.open and true or false
    torchOn   = state.torch and true or false
    cameraOn  = state.camera and true or false
    color     = state.color or color
    if state.typing ~= nil then typing = state.typing and true or false end
    if not phoneOpen then typing = false end
    if pose.shouldHold() then play() else pose.stop() end
end

---Re-welds the prop so a frame-colour or grip change takes on the phone already in hand.
function pose.reweld()
    if not pose.shouldHold() then return end
    pose.removeProp()
    attachProp(cache.ped)
end

---Turns the phone on its side for the landscape viewfinder, or stands it back up. Swaps the held
---clip as well as the grip, and puts the new pose up at once rather than waiting on the watchdog.
---@param wide any truthy for landscape
function pose.setLandscape(wide)
    wide = wide and true or false
    if landscape == wide then return end
    landscape = wide
    pose.reweld()
    if pose.shouldHold() then play() end
end

---@param on any truthy while typing
function pose.setTyping(on)
    on = on and true or false
    if typing == on then return end
    typing = on
    if pose.shouldHold() then play() end
end

-- Keeps the holder out of their own rear shot. The framing pose raises the phone right in front of
-- the face and the lens sits just ahead of that, so without this the player photographs their own
-- hand; the native cell cam hid them for the same reason. Locally invisible only, so everyone else
-- still sees the pose and the prop, and it lasts one frame, hence the per-frame re-assert.
CreateThread(function()
    while true do
        if phonecam.rearActive() then
            SetEntityLocallyInvisible(cache.ped)
            if prop and DoesEntityExist(prop) then SetEntityLocallyInvisible(prop) end
            Wait(0)
        else
            Wait(200)
        end
    end
end)

-- A respawn or a ped-model change hands the player a NEW ped, and the prop is still welded to the
-- old one, which the game does not necessarily delete. The clip re-applies itself on the watchdog
-- below, but the orphaned prop never would: nothing else ever reads that handle again. ox_lib
-- already tracks the ped for `cache.ped`, so this subscribes to the change rather than adding a poll.
lib.onCache('ped', function()
    pose.removeProp()
    if pose.shouldHold() then play() end
end)

-- Re-applies the held clip on a 500ms poll if the game clears it. Movement is what clears it: an
-- upper-body secondary task loses to sprints, jumps and vehicle transitions, which is exactly what
-- a walkable viewfinder invites.
CreateThread(function()
    while true do
        if pose.shouldHold() then
            local clip = currentClip()
            if not IsEntityPlayingAnim(cache.ped, clip.dict, clip.anim, 3) then
                play()
            end
        end
        Wait(500)
    end
end)

return pose
