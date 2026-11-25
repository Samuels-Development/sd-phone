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
    call = {
        onFoot = { dict = 'cellphone@',          anim = 'cellphone_call_listen_base', blendIn = 8.0,  blendOut = -8.0,    flags = READ_FLAGS },
        inCar  = { dict = 'cellphone@in_car@ds', anim = 'cellphone_call_listen_base', blendIn = 8.0,  blendOut = -8.0,    flags = READ_FLAGS },
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

if config.Phone.CallAnimDict and config.Phone.CallAnimName then
    CLIPS.call.onFoot = {
        dict = config.Phone.CallAnimDict, anim = config.Phone.CallAnimName,
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
---@type table Cases (client.cases): the case this player wears, and the parts that dress a prop in one.
local cases = require 'client.cases'
---@type integer|nil Handle of the attached phone prop, nil while stowed.
local prop
---@type integer Bumped by every weld and every removal. Welding streams the model, which yields,
---so a weld can finish after another has replaced it or after the phone was put away; comparing
---this tells it to delete what it built rather than orphan a prop nothing tracks.
local weldSeq = 0
---@type boolean True while a text field in the phone has focus
local typing = false
---@type boolean True while a call is live, whether it is still ringing out or already connected.
local inCall = false
---@type boolean True while the call's own screen is what the phone is showing. False once it has
---been minimised away, which is the one case where a live call is not held to the ear.
local callUi = true
---@type table<integer, true> Prop models this client has already failed to stream.
local unavailableModels = {}
---@type table<integer, true> Fold models already reported missing, so the fallback warns once each.
local warnedFold = {}

---Whether our pose applies: the phone is out (or the torch is lit, or a call is live), and the
---native cell cam is not the one framing. That native animates its own pose and spawns its own
---phone, so ours stands down for it; the scripted cam animates nothing, so ours has to stay up.
---A live call holds the pose through a stow, so putting the phone away mid-call keeps the ped
---holding it rather than dropping their arm while they are still talking.
---@return boolean
function pose.shouldHold()
    if not config.Phone.HoldAnimation then return false end
    if cameraOn and not phonecam.active() then return false end
    return phoneOpen or torchOn or inCall
end

---@type table<string, { dict: string, anim: string }> Every clip a pose.clipOverride has handed out, by
---"dict/anim". They are not in CLIPS, and the override is cleared before the pose is stopped, so pose.stop
---could not find the one still playing and the ped kept holding a phone that was gone.
local overrideClips = {}

---The clip that should be held right now. Every caller reads the pose through this, so adding a
---clip can never leave the watchdog hunting for one the player was never given.
---
---The vehicle test stays a native rather than `cache.vehicle`: the `true` argument counts a ped
---climbing in, and the cache only fills once they are seated. Swapping the clip on the way in is
---the point of asking.
---@return { dict: string, anim: string, blendIn: number, blendOut: number, flags: integer }
local function currentClip()
    -- Prop screen (configs/phone.lua PropScreen): one reading pose for the whole session.
    if pose.clipOverride then
        overrideClips[pose.clipOverride.dict .. '/' .. pose.clipOverride.anim] = pose.clipOverride
        return pose.clipOverride
    end
    -- One camera pose covers both lenses: the native cell cam swapped pose on flip, but no
    -- outward-facing clip outside that native is verified to exist. Landscape is the exception:
    -- it turns the phone on its side, so it gets its own clip. Not while the selfie lens is up,
    -- though: that clip holds the phone in front of the face, and the selfie lens sits 0.75 m out
    -- looking straight back at it, so the player photographs their own hand and handset. The
    -- selfie clip keeps the arm stretched toward the lens, where it stays out of frame.
    local action = 'default'
    if cameraOn and phonecam.active() then
        action = (landscape and not phonecam.selfieActive()) and 'landscape' or 'camera'
    elseif typing then
        action = "typing"
    elseif inCall and (callUi or not phoneOpen) then
        -- A live call outranks the reading pose whether the phone is on screen or stowed, so the
        -- ped keeps it at their ear for the whole call instead of only while the UI is up. The
        -- exception is a call that has been minimised away to use another app: reading the screen
        -- with the phone still at the ear is the one combination that never looks right. Stowing
        -- the phone while minimised puts it straight back, since only an open phone can be read.
        action = 'call'
    end
    return CLIPS[action][IsPedInAnyVehicle(cache.ped, true) and 'inCar' or 'onFoot']
end

---@type boolean Whether this phone has a hinge at all (configs/phone.lua Foldable). Off resolves
---the prop through PropPrefix, so the original sd_phone_<colour> models are what gets welded.
local FOLDABLE <const> = config.Phone.Foldable == true
---@type boolean Whether a shut foldable is held as the plain phone model rather than the hinged one
---(configs/phone.lua FoldPlainShutProp).
local PLAIN_SHUT <const> = config.Phone.FoldPlainShutProp == true
---@type boolean Whether an unfolded foldable is still held as the plain phone model rather than the
---open fold model (configs/phone.lua FoldPlainOpenProp).
local PLAIN_OPEN <const> = config.Phone.FoldPlainOpenProp == true
---@type boolean Whether the body in hand is currently unfolded. Only ever true on a foldable.
local foldOpen = false
---@type boolean Whether the phone this player is using is a foldable: its item says so
---(configs/phone.lua Items, `fold`), and the server passes that on when the phone is opened.
local hinged = false

---Whether the model welded for this body state is one of the fold models, which is what decides
---both the model name and whether the fold grip offsets apply.
---@param open boolean|nil true for the unfolded body
---@param fold boolean|nil whether the phone is a foldable at all
---@return boolean
local function usesFoldModel(open, fold)
    if not FOLDABLE or not fold then return false end
    if open then return not PLAIN_OPEN end
    return not PLAIN_SHUT
end

---The fold model for a frame colour in a body state. Both fold models share the closed phone's
---origin and axes, so the grip transform is the same one either way.
---@param frame string frame colour; must be a key of FRAME_COLORS
---@param open boolean|nil true for the unfolded body
---@return string model
local function foldModel(frame, open)
    return (config.Phone.FoldPropPrefix or 'sd_phone_fold_') .. frame
        .. (open and (config.Phone.FoldOpenSuffix or '_open') or '')
end

---The models to weld for a body state, best first: the fold model when this body uses one, then the
---plain phone. A server that has not installed the fold props streams only the plain ones, and the
---phone in hand falls back to them instead of vanishing. A phone whose owner picked a design or a
---logo (configs/phone.lua Looks) puts that set's models first, named from its stem, and keeps the
---server's own as the fallback. With the prop screen on (configs/phone.lua PropScreen) the
---DUI-screen model replaces whatever the body state would weld, in the frame colour when the pack
---streams one (<Model>_<colour>).
---@param frame string frame colour; must be a key of FRAME_COLORS
---@param open boolean|nil true for the unfolded body
---@param stem string|nil the stem of the picked set's model names (client.cases stem); nil for none
---@param look string|nil the design that set is, handed back on its candidates
---@param isFold boolean|nil whether the phone is a foldable
---@return { name: string, fold: boolean, look: string? }[] candidates
local function propCandidates(frame, open, stem, look, isFold)
    local out = {}
    if pose.modelOverride then
        if stem then
            out[#out + 1] = { name = ('%s_dui_%s'):format(stem, frame), fold = false, look = look }
            out[#out + 1] = { name = stem .. '_dui', fold = false, look = look }
        end
        out[#out + 1] = { name = ('%s_%s'):format(pose.modelOverride, frame), fold = false }
        out[#out + 1] = { name = pose.modelOverride, fold = false }
        return out
    end
    local fold = usesFoldModel(open, isFold)
    if stem then
        if fold then
            out[#out + 1] = { name = ('%s_fold_%s%s'):format(stem, frame, open and (config.Phone.FoldOpenSuffix or '_open') or ''), fold = true, look = look }
        end
        out[#out + 1] = { name = ('%s_%s'):format(stem, frame), fold = false, look = look }
    end
    if fold then out[#out + 1] = { name = foldModel(frame, open), fold = true } end
    out[#out + 1] = { name = config.Phone.PropPrefix .. frame, fold = false }
    return out
end

---Whether folding or unfolding changes the prop in hand at all. False when both body states resolve
---to the plain model, whether by config or because the fold models are known not to stream, so a
---hinge press has nothing to re-weld and nothing to tell watchers about.
---@return boolean
function pose.foldChangesProp()
    for _, open in ipairs({ true, false }) do
        if usesFoldModel(open, hinged) and not unavailableModels[joaat(foldModel(color, open))] then return true end
    end
    return false
end

---Whether the body in hand is unfolded right now.
---@return boolean
function pose.isFolded()
    return foldOpen
end

---Where the prop sits in the hand. Landscape lays the phone on its side for the wide viewfinder,
---and the unfolded body slides off-centre so the hand grips its corner rather than its middle.
---@param wide boolean|nil
---@param open boolean|nil true when the unfolded body is the one being welded
---@param fold boolean whether the model being welded is a fold model rather than the plain phone
---@return vector3 offset, vector3 rotation
local function propTransform(wide, open, fold)
    local off, rot
    if wide then
        off = config.Phone.PropLandscapeOffset or config.Phone.PropOffset
        rot = config.Phone.PropLandscapeRot or config.Phone.PropRot
    else
        off, rot = config.Phone.PropOffset, config.Phone.PropRot
    end
    -- PropRot is zero on these models, so the bone axes the offset is measured in line up with
    -- the prop's own - which is what lets a flat vec3 read as "along the screen" here.
    if fold then
        local shift = open and config.Phone.FoldOpenPropOffset or config.Phone.FoldPropOffset
        if shift then off = off + shift end
    end
    if pose.handShift then
        off, rot = off + pose.handShift.offset, rot + pose.handShift.rot
    end
    return off, rot
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
---@param open boolean|nil weld the unfolded body instead of the shut one
---@param case CaseDesign|nil a case to dress the prop in (client.cases)
---@param style PhoneStyle|nil the phone's design and trims (client.cases)
---@param fold boolean|nil whether the phone is a foldable
---@return integer? prop the welded prop entity, or nil if no candidate model would stream
function pose.createProp(ped, frame, wide, open, case, style, fold)
    for _, candidate in ipairs(propCandidates(frame, open, cases.stem(style), style and style.look, fold)) do
        local model = joaat(candidate.name)
        if not unavailableModels[model] then
            if pcall(lib.requestModel, model, 1000) then
                local coords = GetEntityCoords(ped)
                local obj = CreateObject(model, coords.x, coords.y, coords.z, false, true, true)
                SetEntityCollision(obj, false, false)
                local off, rot = propTransform(wide, open, candidate.fold)
                AttachEntityToEntity(obj, ped, GetPedBoneIndex(ped, config.Phone.PropBone),
                    off.x, off.y, off.z, rot.x, rot.y, rot.z, false, false, false, false, 2, true)
                SetModelAsNoLongerNeeded(model)
                cases.dress(obj, candidate.fold and (open and 'open' or 'shut') or 'plain', case, style, candidate.look)
                return obj
            end
            SetModelAsNoLongerNeeded(model)
            unavailableModels[model] = true
        end
        if candidate.fold and not warnedFold[model] then
            warnedFold[model] = true
            print(('^3[sd-phone]^0 fold prop %s is not streamed, so the plain phone is held instead. Update sd-phone-props to get the foldable models.')
                :format(candidate.name))
        end
    end
    return nil
end

---The body this player's phone is when shut: the hinged one for a foldable that keeps its own shut
---model, the plain one otherwise.
---@return string body 'shut' or 'plain'
function pose.shutBody()
    return usesFoldModel(false, hinged) and 'shut' or 'plain'
end

---Whether the phone this player is using is a foldable.
---@return boolean
function pose.hinged()
    return hinged
end

---The design of the phone this player is using.
---@return string look
function pose.look()
    return (cases.style() or {}).look or 'classic'
end

---Stands a phone on its own in the world, held by nothing: the model a player's phone would be in
---the hand, shut when it folds, dressed the same way. A case store shows this one.
---@param coords vector3 where its centre goes
---@param frame string frame colour suffix
---@param case CaseDesign|nil a case to dress it in (client.cases)
---@param style PhoneStyle|nil the phone's design and trims (client.cases)
---@param fold boolean|nil whether that phone is a foldable
---@return integer? prop the created object, or nil if no candidate model would stream
---@return string? body 'plain' or 'shut', for dressing it again
---@return string? look the design of the model that was created
function pose.createLoose(coords, frame, case, style, fold)
    for _, candidate in ipairs(propCandidates(frame, false, cases.stem(style), style and style.look, fold)) do
        local model = joaat(candidate.name)
        if not unavailableModels[model] and pcall(lib.requestModel, model, 1500) then
            local obj = CreateObjectNoOffset(model, coords.x, coords.y, coords.z, false, true, true)
            SetEntityCollision(obj, false, false)
            FreezeEntityPosition(obj, true)
            SetModelAsNoLongerNeeded(model)
            local body = candidate.fold and 'shut' or 'plain'
            cases.dress(obj, body, case, style, candidate.look)
            return obj, body, candidate.look
        end
    end
    return nil
end

---Attaches our own hand prop in the current frame colour and grip. No-op if one is already
---attached, and a weld superseded or stowed while streaming deletes what it built.
---@param ped integer player ped handle
local function attachProp(ped)
    if prop and DoesEntityExist(prop) then return end

    weldSeq = weldSeq + 1
    local seq = weldSeq
    local obj = pose.createProp(ped, color, landscape, foldOpen, cases.worn(color), cases.style(), hinged)
    if not obj then return end

    if seq ~= weldSeq or not pose.shouldHold() or (prop and DoesEntityExist(prop)) then
        pose.deleteProp(obj)
        return
    end
    prop = obj
end

---Puts the pose and prop the player is holding right now onto ANOTHER ped.
---
---For the stand-in the MDT leaves behind while a dispatcher watches a camera: the officer is stood
---there reading their phone, so the copy has to be stood there reading one too rather than
---appearing empty-handed the moment somebody opens a feed.
---
---The prop is handed back rather than tracked here, because it belongs to the ped the caller owns
---and has to be deleted with it. This module only ever tracks the player's own.
---@param ped integer the ped to put the pose on
---@return integer|nil prop the prop welded to it, for the caller to delete
function pose.mirrorOnto(ped)
    if not pose.shouldHold() then return nil end
    if not ped or ped == 0 or not DoesEntityExist(ped) then return nil end

    local clip = currentClip()
    if pcall(lib.requestAnimDict, clip.dict, 1000) then
        -- A plain looping FULL BODY clip, not the upper-body secondary the player gets. That one
        -- blends over whatever the ped is already doing, and a stand-in that has just been cloned
        -- and stood still has nothing underneath for it to blend onto, so it barely reads at all.
        TaskPlayAnim(ped, clip.dict, clip.anim, clip.blendIn, clip.blendOut, -1, 1, 0.0, false, false, false)
        RemoveAnimDict(clip.dict)
    end

    return pose.createProp(ped, color, landscape, nil, cases.worn(color), cases.style(), hinged)
end

---The welded hand prop (nil while stowed or still streaming). Used by the prop screen.
---@return integer|nil
function pose.getProp()
    if prop and DoesEntityExist(prop) then return prop end
    return nil
end

---Deletes a prop that pose.createProp made, together with the case it was dressed in.
---@param obj integer the prop entity
function pose.deleteProp(obj)
    cases.undress(obj)
    if DoesEntityExist(obj) then DeleteObject(obj) end
end

---The frame colour of the phone in hand.
---@return string
function pose.frame()
    return color
end

---Delete the attached phone prop, if any. Idempotent, and cancels any weld still streaming.
function pose.removeProp()
    weldSeq = weldSeq + 1
    if prop then pose.deleteProp(prop) end
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
---entering the viewfinder or a vehicle swaps which one is up, the prop screen's own hold included.
function pose.stop()
    local ped = cache.ped
    for _, contexts in pairs(CLIPS) do
        for _, clip in pairs(contexts) do
            if IsEntityPlayingAnim(ped, clip.dict, clip.anim, 3) then
                StopAnimTask(ped, clip.dict, clip.anim, 1.0)
            end
        end
    end
    for _, clip in pairs(overrideClips) do
        if IsEntityPlayingAnim(ped, clip.dict, clip.anim, 3) then
            StopAnimTask(ped, clip.dict, clip.anim, 1.0)
        end
    end
    pose.removeProp()
end

---Mirrors the phone's state, then starts or stops the pose to match it.
---@param state { open: boolean, torch: boolean, camera: boolean, color: string, fold: boolean?, typing: boolean, call: boolean, callUi: boolean }
function pose.refresh(state)
    phoneOpen = state.open and true or false
    torchOn   = state.torch and true or false
    cameraOn  = state.camera and true or false
    inCall    = state.call and true or false
    callUi    = state.callUi ~= false
    color     = state.color or color
    if state.fold ~= nil then hinged = state.fold == true end
    if not hinged then foldOpen = false end
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

---Swaps the shut body for the unfolded one in hand, or back. The two models share an origin, so
---this is a re-weld and nothing else - no offset to re-derive, no clip to change. When both states
---hold the plain model the prop in hand is already right, so nothing is torn down and rebuilt.
---@param open any truthy to hold the unfolded body
function pose.setFolded(open)
    open = (open and hinged) and true or false
    if not FOLDABLE or foldOpen == open then return end
    foldOpen = open
    if pose.foldChangesProp() then pose.reweld() end
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

---Re-asserts whichever clip the current state calls for, without changing any of that state. For
---a flip between lenses, which the pose otherwise only notices on the watchdog's next tick.
function pose.reassert()
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
