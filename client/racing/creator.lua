---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Notify bridge (bridge.client.notify): backend-agnostic toast notifications.
local notify = require 'bridge.client.notify'

---@type table Module table; the table returned at end of file.
local creator = {}

---@type table Racing config (configs/racing.lua).
local RACING_CFG  = type(config.Racing) == 'table' and config.Racing or {}
---@type table Creator knobs: gate limits, width range, flag prop, draw distance.
local CREATOR_CFG = type(RACING_CFG.Creator) == 'table' and RACING_CFG.Creator or {}
---@type table Server-side value caps, borrowed here so the name field cannot overrun the column.
local LIMITS_CFG  = type(RACING_CFG.Limits) == 'table' and RACING_CFG.Limits or {}

---@type string Toast title for every message the recorder raises.
local TITLE       = 'Racing'
---@type integer Flag prop spawned at each gate edge.
local FLAG_MODEL  = joaat(type(CREATOR_CFG.FlagModel) == 'string' and CREATOR_CFG.FlagModel or 'prop_beachflag_01')
---@type integer Alpha of a placed flag: transparent, not invisible, so gates read as guides.
local FLAG_ALPHA  = 130
---@type integer Milliseconds allowed for the flag prop to stream, matching race.lua's MODEL_BUDGET
---for the same prop. Named rather than inlined so the two stay visibly paired.
local MODEL_BUDGET <const> = 3000
---@type integer Fewest gates a saveable track may hold.
local MIN_GATES   = math.max(2, math.floor(tonumber(CREATOR_CFG.MinGates) or 2))
---@type integer Most gates one track may hold.
local MAX_GATES   = math.max(MIN_GATES, math.floor(tonumber(CREATOR_CFG.MaxGates) or 512))
---@type number Narrowest gate, in metres.
local MIN_WIDTH   = tonumber(CREATOR_CFG.MinWidth) or 2.0
---@type number Widest gate, in metres.
local MAX_WIDTH   = math.max(tonumber(CREATOR_CFG.MaxWidth) or 50.0, MIN_WIDTH)
---@type number Width the recorder opens at, in metres.
local DEF_WIDTH   = lib.math.clamp(tonumber(CREATOR_CFG.DefaultWidth) or 12.0, MIN_WIDTH, MAX_WIDTH)
---@type number Metres of width gained or lost per frame while an arrow key is held.
local WIDTH_STEP  = tonumber(CREATOR_CFG.WidthStep) or 0.15
---@type number Metres past which a placed gate stops being drawn.
local DRAW_RADIUS = tonumber(CREATOR_CFG.DrawRadius) or 300.0
---@type integer Longest track name the server will store.
local NAME_MAX    = math.max(1, math.floor(tonumber(LIMITS_CFG.TrackNameMax) or 60))

---@type integer Input-pad control: E, place a gate where the ghost is.
local KEY_PLACE  = 38
---@type integer Input-pad control: X, remove the last gate.
local KEY_UNDO   = 73
---@type integer Input-pad control: Enter, name the track and save it.
local KEY_SAVE   = 191
---@type integer Input-pad control: Backspace, discard everything.
local KEY_CANCEL = 194
---@type integer Input-pad control: left arrow, narrow the gate.
local KEY_NARROW = 174
---@type integer Input-pad control: right arrow, widen the gate.
local KEY_WIDEN  = 175

---@type boolean True while the recorder owns the screen.
local active = false
---@type { a: vector3, b: vector3, props: integer[], blip: integer }[] Placed gates in route order.
local gates = {}
---@type number Live gate width, in metres.
local gateWidth = DEF_WIDTH

---@param value number
---@return number rounded two decimals, which keeps the stored gate JSON compact
local function round2(value)
    return lib.math.round(value, 2)
end

---Ground height at a point near the caller's own z. The probe traces downward from where it
---starts, so it starts just above the caller: under a bridge a high probe would begin above the
---deck and snap the gate onto the bridge instead of the road below. The taller retry covers steep
---banks where the edge ground sits above the low probe's start.
---@param x number
---@param y number
---@param zHint number the placing entity's z, and the last-resort answer
---@return number z
local function groundZ(x, y, zHint)
    x, y = x + 0.0, y + 0.0
    local found, z = GetGroundZFor_3dCoord(x, y, zHint + 2.5, false)
    if found then return z end
    found, z = GetGroundZFor_3dCoord(x, y, zHint + 10.0, false)
    return found and z or zHint
end

---The gate currently framing the player, or their vehicle when they are in one: an edge point
---either side, gateWidth apart, both snapped to the ground.
---@return { a: vector3, b: vector3 } gate
local function currentGate()
    local ped = cache.ped
    local veh = GetVehiclePedIsIn(ped, false)
    local ent = veh ~= 0 and veh or ped
    local pos = GetEntityCoords(ent)

    local rad    = math.rad(GetEntityHeading(ent))
    local rx, ry = math.cos(rad), math.sin(rad)
    local half   = gateWidth / 2
    local ax, ay = pos.x + rx * half, pos.y + ry * half
    local bx, by = pos.x - rx * half, pos.y - ry * half

    return {
        a = vector3(ax, ay, groundZ(ax, ay, pos.z)),
        b = vector3(bx, by, groundZ(bx, by, pos.z)),
    }
end

---Spawns one transparent, collisionless, frozen flag. Local only, so nobody else sees the
---construction site.
---@param pos vector3
---@return integer obj
local function spawnFlag(pos)
    local obj = CreateObjectNoOffset(FLAG_MODEL, pos.x, pos.y, pos.z, false, false, false)
    SetEntityAlpha(obj, FLAG_ALPHA, false)
    SetEntityCollision(obj, false, false)
    FreezeEntityPosition(obj, true)
    return obj
end

---Records the ghost gate: two flags, a numbered blip at its midpoint, and a place in the route.
local function placeGate()
    if #gates >= MAX_GATES then
        notify.show({
            title = TITLE,
            description = ('A track can hold %d gates.'):format(MAX_GATES),
            type = 'error',
        })
        return
    end

    local gate = currentGate()
    gate.props = { spawnFlag(gate.a), spawnFlag(gate.b) }

    local center = (gate.a + gate.b) / 2
    local blip   = AddBlipForCoord(center.x, center.y, center.z)
    SetBlipSprite(blip, 1)
    SetBlipColour(blip, 5)
    SetBlipScale(blip, 0.85)
    ShowNumberOnBlip(blip, #gates + 1)
    gate.blip = blip

    gates[#gates + 1] = gate
end

---Removes the last gate along with its flags and its blip.
local function undoGate()
    local gate = gates[#gates]
    if not gate then return end

    for _, obj in ipairs(gate.props or {}) do
        if DoesEntityExist(obj) then DeleteEntity(obj) end
    end
    if gate.blip and DoesBlipExist(gate.blip) then RemoveBlip(gate.blip) end
    gates[#gates] = nil
end

---Tears the recorder down: every flag deleted, the text UI hidden, the model released.
---@param message string|nil toast shown on the way out
local function stopCreator(message)
    while #gates > 0 do undoGate() end
    active = false
    gateWidth = DEF_WIDTH
    lib.hideTextUI()
    SetModelAsNoLongerNeeded(FLAG_MODEL)
    if message then
        notify.show({ title = TITLE, description = message, type = 'inform' })
    end
end

---Translucent posts plus a crossbar for one gate.
---@param a vector3 edge A
---@param b vector3 edge B
---@param r integer
---@param g integer
---@param blue integer
---@param alpha integer
local function drawGatePosts(a, b, r, g, blue, alpha)
    DrawMarker(1, a.x, a.y, a.z - 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        1.0, 1.0, 2.2, r, g, blue, alpha, false, false, 2, false, nil, nil, false)
    DrawMarker(1, b.x, b.y, b.z - 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        1.0, 1.0, 2.2, r, g, blue, alpha, false, false, 2, false, nil, nil, false)
    DrawLine(a.x, a.y, a.z + 1.5, b.x, b.y, b.z + 1.5, r, g, blue, math.min(255, alpha + 80))
end

---Name and mode dialog, then a save through the racing callback. The recorder closes only when
---the server accepted the track, so a refusal leaves every gate in place to retry.
local function promptSave()
    if #gates < MIN_GATES then
        notify.show({
            title = TITLE,
            description = ('A track needs at least %d gates.'):format(MIN_GATES),
            type = 'error',
        })
        return
    end

    local input = lib.inputDialog('Save track', {
        { type = 'input', label = 'Track name', required = true, max = NAME_MAX },
        {
            type = 'select', label = 'Mode', required = true, default = 'circuit',
            options = {
                { value = 'circuit', label = 'Circuit' },
                { value = 'sprint',  label = 'Sprint' },
            },
        },
    })
    if not input then return end

    local points = {}
    for i = 1, #gates do
        local gate = gates[i]
        points[i] = {
            { round2(gate.a.x), round2(gate.a.y), round2(gate.a.z) },
            { round2(gate.b.x), round2(gate.b.y), round2(gate.b.z) },
        }
    end

    local res = lib.callback.await('sd-phone:server:racing:createTrack', false, {
        name  = input[1],
        mode  = input[2],
        gates = points,
    })

    if type(res) == 'table' and res.success then
        stopCreator()
        notify.show({
            title = TITLE,
            description = ('Saved %s.'):format(input[1]),
            type = 'success',
        })
        return
    end

    notify.show({
        title = TITLE,
        description = (type(res) == 'table' and res.message) or 'The track could not be saved.',
        type = 'error',
    })
end

---@return string text markdown for the on-screen key guide
local function buildTextUI()
    return ('**Track Creator**  \nGates: %d of %d  Width: %.1f m  \n[E] Place  [X] Undo  [Left/Right] Width  \n[Enter] Save  [Backspace] Cancel')
        :format(#gates, MAX_GATES, gateWidth)
end

---Opens the recorder and runs the per-frame loop: keys, the ghost gate, the placed gates, and the
---key guide.
---
---lib.requestModel runs its own validity pre-check and raises on both that and the timeout, so the
---pcall keeps a bad FlagModel in configs/racing.lua from aborting the open with the recorder already
---flagged active and no draw thread behind it. The flag is claimed before the streaming wait so a
---second toggle closes the recorder instead of starting a rival one, and is released again on the
---failure path.
local function startCreator()
    if active then return end
    active = true
    gates = {}
    gateWidth = DEF_WIDTH

    if not pcall(lib.requestModel, FLAG_MODEL, MODEL_BUDGET) then
        active = false
        notify.show({
            title = TITLE,
            description = 'The gate flag prop could not be loaded.',
            type = 'error',
        })
        return
    end

    notify.show({
        title = TITLE,
        description = 'Track creator open. Drive to a start line and press E.',
        type = 'inform',
    })

    CreateThread(function()
        local lastText
        while active do
            if IsControlPressed(0, KEY_WIDEN) then gateWidth = math.min(MAX_WIDTH, gateWidth + WIDTH_STEP) end
            if IsControlPressed(0, KEY_NARROW) then gateWidth = math.max(MIN_WIDTH, gateWidth - WIDTH_STEP) end
            if IsControlJustPressed(0, KEY_PLACE) then placeGate() end
            if IsControlJustPressed(0, KEY_UNDO) then undoGate() end
            if IsControlJustPressed(0, KEY_SAVE) then promptSave() end
            if IsControlJustPressed(0, KEY_CANCEL) then
                stopCreator('Track creator closed.')
                break
            end
            if not active then break end

            local ghost = currentGate()
            drawGatePosts(ghost.a, ghost.b, 80, 230, 140, 110)

            local at = GetEntityCoords(cache.ped)
            local previous
            for i = 1, #gates do
                local gate   = gates[i]
                local center = (gate.a + gate.b) / 2
                if #(at - center) < DRAW_RADIUS then
                    DrawLine(gate.a.x, gate.a.y, gate.a.z + 1.5, gate.b.x, gate.b.y, gate.b.z + 1.5, 255, 255, 255, 90)
                end
                if previous then
                    DrawLine(previous.x, previous.y, previous.z + 1.0, center.x, center.y, center.z + 1.0, 255, 255, 255, 50)
                end
                previous = center
            end

            local text = buildTextUI()
            if text ~= lastText then
                lib.showTextUI(text, { position = 'left-center', icon = 'flag-checkered' })
                lastText = text
            end

            Wait(0)
        end
    end)
end

---Opens the recorder, or discards an open one. The command that fires this is ace-gated on the
---server; the config check here only covers the feature being switched off after the fact.
function creator.toggle()
    if CREATOR_CFG.Enabled == false then return end
    if active then
        stopCreator('Track creator closed.')
    else
        startCreator()
    end
end

---@return boolean active whether a track is being recorded right now
function creator.active()
    return active
end

---Silent teardown for a shutdown path, where a toast would arrive after the UI is gone.
function creator.cleanup()
    if not active and #gates == 0 then return end
    stopCreator()
end

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    creator.cleanup()
end)

return creator
