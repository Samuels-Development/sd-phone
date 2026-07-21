---@type table sd-phone config root (configs/config.lua): payphone models + focus restore.
local config = require 'configs.config'
---@type table Target bridge (bridge.client.target): ox_target/qb-target/qtarget wrapper.
local target = require 'bridge.client.target'

---@type table Payphone config (configs/payphone.lua).
local cfg = config.Payphone

---@type string|nil Location key ('x,y,z') of the booth currently in use, nil when the UI is closed.
local activeLocation = nil
---@type number|nil Live call channel while a payphone call is up.
local activeChannel = nil
---@type boolean Mirror of the phone's open state (sd-phone:client:openState).
local phoneOpen = false
---@type number|nil The booth entity the current animation plays against.
local animEntity = nil
---@type table<number, { coords: vector3, location: string, soundId: number|nil }> Booths ringing right now, by channel.
local ringing = {}

---The ring nearest to a booth entity, matched by distance so coordinate formatting can never
---diverge between the minting client and the answering one.
---@param entity number
---@return number|nil channel, table|nil entry
local function ringAt(entity)
    local pos = GetEntityCoords(entity)
    for channel, entry in pairs(ringing) do
        -- Tight radius: banks of payphones sit ~1.5m apart, so a looser match would
        -- offer "Answer Phone" on the booth NEXT to the one that is actually ringing.
        if #(pos - entry.coords) < 0.8 then return channel, entry end
    end
    return nil
end

AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open and true or false
    -- Menu mode never holds NUI focus, so there is nothing to re-assert.
    if not phoneOpen and activeLocation and not cfg.UseOxLibMenu then
        SetNuiFocus(true, true)
        SetNuiFocusKeepInput(false)
    end
end)

-- A wipe reloads the NUI; clear our session flag so the openState handler above won't re-assert
-- focus over a payphone UI that no longer exists (main.lua drops the actual focus).
AddEventHandler('sd-phone:client:wipeFocus', function()
    activeLocation = nil
end)

---Config-gated console print for the interaction/prop-swap path.
local function dbg(fmt, ...)
    if cfg.Debug then print(('[sd-phone:payphone] ' .. fmt):format(...)) end
end

---Reverse model lookup for readable debug output.
---@param hash number entity model hash
---@return string
local function modelName(hash)
    for _, model in ipairs(cfg.Models or {}) do
        if joaat(model) == hash then return model end
    end
    return ('0x%X'):format(hash)
end

---Rounded-coords key for a booth, matching what the server distance-checks against.
---@param coords vector3
---@return string
local function locationKey(coords)
    return ('%.1f,%.1f,%.1f'):format(coords.x, coords.y, coords.z)
end

---@param location string 'x,y,z'
---@return vector3|nil
local function coordsFromKey(location)
    local x, y, z = location:match('^(-?[%d%.]+),(-?[%d%.]+),(-?[%d%.]+)$')
    if not x then return nil end
    return vector3(tonumber(x), tonumber(y), tonumber(z))
end

---The closest configured booth prop to a point, or nil.
---@param coords vector3
---@return number|nil entity
local function boothAt(coords)
    for _, model in ipairs(cfg.Models or {}) do
        local entity = GetClosestObjectOfType(coords.x, coords.y, coords.z, 2.0, joaat(model), false, false, false)
        if entity ~= 0 then return entity end
    end
    return nil
end

---@type number|nil Our animatable booth prop, spawned over the hidden world prop for the scene.
local animProp = nil

---@type table<number, string> Booth model hash -> its animatable variant, built from config.
local animVariants = {}
for model, variant in pairs((cfg.Scene and cfg.Scene.AnimProps) or {}) do
    animVariants[joaat(model)] = variant
end

---@param variant string|nil animatable model to load alongside the dict, when swapping
---@return boolean loaded
local function loadSceneAssets(variant)
    local scene = cfg.Scene
    RequestAnimDict(scene.Dict)
    if variant then RequestModel(joaat(variant)) end
    local deadline = GetGameTimer() + 3000
    while (not HasAnimDictLoaded(scene.Dict) or (variant and not HasModelLoaded(joaat(variant)))) and GetGameTimer() < deadline do Wait(10) end
    return HasAnimDictLoaded(scene.Dict) and (not variant or HasModelLoaded(joaat(variant)))
end

---Grabs the booth: hides the world prop, spawns our animatable copy over it, and plays the
---handset-grab pair (prop clip + ped clip) in sync.
---@param entity number world booth entity
local function beginBoothAnim(entity)
    local scene = cfg.Scene
    if not scene or scene.Enabled == false or not entity or entity == 0 then
        dbg('beginBoothAnim skipped: scene=%s entity=%s', tostring(scene and scene.Enabled), tostring(entity))
        return
    end
    local model   = GetEntityModel(entity)
    local variant = animVariants[model]
    dbg('beginBoothAnim: entity=%d model=%s variant=%s coords=%s', entity, modelName(model), tostring(variant), tostring(GetEntityCoords(entity)))
    if not loadSceneAssets(variant) then
        dbg('scene assets FAILED to load: dict=%s (loaded=%s) variant=%s (loaded=%s)',
            tostring(scene.Dict), tostring(HasAnimDictLoaded(scene.Dict)),
            tostring(variant), tostring(variant and HasModelLoaded(joaat(variant))))
        return
    end

    local ped    = PlayerPedId()
    local booth  = GetEntityCoords(entity)
    local pos    = GetOffsetFromEntityInWorldCoords(entity, -0.10, -0.85, 0.0)

    if variant then
        SetEntityVisible(entity, false, false)
        -- Local-only spawn: the swap is a personal visual; a networked object would
        -- appear (unhidden and duplicated) for every other client nearby.
        animProp = CreateObjectNoOffset(joaat(variant), booth.x, booth.y, booth.z, false, false, true)
        SetEntityHeading(animProp, GetEntityHeading(entity))
        SetEntityCompletelyDisableCollision(animProp, false, false)
        SetModelAsNoLongerNeeded(joaat(variant))
        dbg('swap: hid entity=%d, spawned animProp=%d exists=%s at=%s heading=%.1f',
            entity, animProp or -1, tostring(DoesEntityExist(animProp)), tostring(GetEntityCoords(animProp)), GetEntityHeading(animProp))
    end

    SetEntityCoords(ped, pos.x, pos.y, pos.z - 1.0, false, false, false, false)
    SetEntityHeading(ped, GetHeadingFromVector_2d(booth.x - pos.x, booth.y - pos.y))

    if animProp then
        local played = PlayEntityAnim(animProp, scene.EnterProp, scene.Dict, 10.0, true, true, true, 0.0, false)
        dbg('PlayEntityAnim(%s / %s) -> %s', tostring(scene.Dict), tostring(scene.EnterProp), tostring(played))
    end
    TaskPlayAnim(ped, scene.Dict, scene.Enter, 8.0, 8.0, -1, 14, 0, false, false, false)
    animEntity = entity
end

---Swaps the ped onto the talk loop; the prop holds the handset-off-hook frame.
local function loopBoothAnim()
    local scene = cfg.Scene
    if not animEntity or not scene or scene.Enabled == false then return end
    if not HasAnimDictLoaded(scene.Dict) then return end
    TaskPlayAnim(PlayerPedId(), scene.Dict, scene.Idle, 8.0, 8.0, -1, 1, 0, false, false, false)
end

---Hangs the handset back up: exit clip on the ped, prop anim stopped, then our copy is
---released and the world prop restored.
local function endBoothAnim()
    local scene = cfg.Scene
    local worldEntity = animEntity
    animEntity = nil

    local ped = PlayerPedId()
    if scene and scene.Enabled ~= false and HasAnimDictLoaded(scene.Dict) and worldEntity then
        TaskPlayAnim(ped, scene.Dict, scene.Exit, 8.0, 8.0, -1, 1, 0, false, false, false)
        if animProp and DoesEntityExist(animProp) then
            StopEntityAnim(animProp, scene.EnterProp, scene.Dict, 1000.0)
        end
    else
        ClearPedTasks(ped)
    end

    local prop = animProp
    animProp = nil
    SetTimeout(2000, function()
        dbg('endBoothAnim cleanup: deleting prop=%s, restoring entity=%s', tostring(prop), tostring(worldEntity))
        if prop and DoesEntityExist(prop) then DeleteEntity(prop) end
        if worldEntity and DoesEntityExist(worldEntity) then SetEntityVisible(worldEntity, true, false) end
        ClearPedTasks(PlayerPedId())
    end)
end

---Dials out from the active booth; shared by the NUI keypad and the ox_lib menu.
---@param number string digits to call
---@return table result server envelope
local function doDial(number)
    if not activeLocation then return { success = false } end
    local result = lib.callback.await('sd-phone:server:payphone:dial', false, {
        location = activeLocation,
        number   = number,
    })
    if result and result.success and result.data then
        activeChannel = result.data.channel
        loopBoothAnim()
    end
    return result or { success = false, message = 'No response from server' }
end

---Hangs up the live payphone call, if any.
local function doHangup()
    if not activeChannel then return end
    lib.callback.await('sd-phone:server:call:hangup', false, { channel = activeChannel })
    activeChannel = nil
end

---Ends the booth session outside the NUI path (menu closed / call over).
local function endMenuSession()
    if activeChannel then doHangup() end
    activeLocation = nil
    endBoothAnim()
end

---ox_lib flow: context menu with dial prompt + notepad numbers, replacing the NUI.
---@param state table payload from payphone:state
local function openMenu(state)
    local function startCall(number)
        -- Coin toll in menu mode: no slot to click, so the charge happens
        -- implicitly on dial (the server still holds the authoritative gate).
        if state.coin and state.coin.enabled and not state.credited then
            local pay = lib.callback.await('sd-phone:server:payphone:insertCoin', false, { location = activeLocation })
            if not pay or not pay.success then
                lib.notify({ title = 'Payphone', description = (pay and pay.message) or 'You need change', type = 'error' })
                endMenuSession()
                return
            end
            state.credited = true
        end
        local result = doDial(number)
        if result.success then state.credited = false end -- the coin was spent on this call
        if not result.success then
            lib.notify({ title = 'Payphone', description = result.message or 'Call failed', type = 'error' })
            endMenuSession()
            return
        end
        lib.registerContext({
            id = 'sd_payphone_call',
            title = ('Calling %s'):format(number),
            canClose = false,
            options = {
                {
                    title = 'Hang Up',
                    icon = 'phone-slash',
                    onSelect = function()
                        endMenuSession()
                        lib.hideContext(true)
                    end,
                },
            },
        })
        lib.showContext('sd_payphone_call')
    end

    local options = {
        {
            title = 'Dial Number',
            description = state.anonymous and 'Caller ID withheld' or ('This booth: %s'):format(state.number),
            icon = 'phone',
            onSelect = function()
                local input = lib.inputDialog('Payphone', {
                    { type = 'input', label = 'Phone number', required = true, max = 15 },
                })
                if not input or not input[1] then endMenuSession() return end
                startCall(tostring(input[1]):gsub('%D', ''))
            end,
        },
    }
    if state.myNumber then
        options[#options + 1] = {
            title = 'My Number',
            description = state.myNumber,
            icon = 'user',
            onSelect = function() startCall(state.myNumber) end,
        }
    end
    for _, fav in ipairs(state.favorites or {}) do
        options[#options + 1] = {
            title = fav.name,
            description = fav.phone,
            icon = 'star',
            onSelect = function() startCall(fav.phone) end,
        }
    end

    lib.registerContext({
        id = 'sd_payphone',
        title = 'Payphone',
        onExit = endMenuSession,
        options = options,
    })
    lib.showContext('sd_payphone')
end

---Opens the payphone UI for a booth entity (or bare coords via the export).
---@param entity number|nil booth entity, nil when opened by another script
---@param coords vector3 booth position
---@param connected table|nil live-call payload when answering an inbound ring
local function openPayphone(entity, coords, connected)
    if not cfg.Enabled or activeLocation then return end
    local location = locationKey(coords)

    local state
    if connected then
        -- Answering: everything needed rides on the answer result, no second round trip.
        state = { data = { number = connected.number or '', anonymous = false, favorites = {} } }
    else
        state = lib.callback.await('sd-phone:server:payphone:state', false, { location = location })
        if not state or not state.success then return end
    end

    activeLocation = location
    if connected then
        activeChannel = connected.channel
        state.data.connected = true
        state.data.callerName = connected.callerName
    end
    if entity then
        beginBoothAnim(entity)
        if connected then
            SetTimeout(1800, function()
                if activeChannel then loopBoothAnim() end
            end)
        end
    end

    if cfg.UseOxLibMenu then
        if connected then
            lib.registerContext({
                id = 'sd_payphone_call',
                title = connected.callerName and ('On call: %s'):format(connected.callerName) or 'On call',
                canClose = false,
                options = {
                    {
                        title = 'Hang Up',
                        icon = 'phone-slash',
                        onSelect = function()
                            endMenuSession()
                            lib.hideContext(true)
                        end,
                    },
                },
            })
            lib.showContext('sd_payphone_call')
        else
            openMenu(state.data)
        end
        return
    end

    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(false)
    SendNUIMessage({ action = 'sd-phone:payphone:open', data = state.data })
end

---Restores focus to whatever was under the payphone UI.
local function releaseFocus()
    if phoneOpen then
        SetNuiFocus(true, true)
        SetNuiFocusKeepInput(config.Phone.AllowMovement == true)
    else
        SetNuiFocus(false, false)
    end
end

RegisterNUICallback('sd-phone:payphone:close', function(_, cb)
    doHangup()
    activeLocation = nil
    releaseFocus()
    endBoothAnim()
    cb({ ok = true })
end)

RegisterNUICallback('sd-phone:payphone:dial', function(data, cb)
    cb(doDial(tostring(data and data.number or '')))
end)

---NUI coin slot click: charge for one call credit (configs/payphone.lua Coin).
RegisterNUICallback('sd-phone:payphone:insertcoin', function(_, cb)
    if not activeLocation then return cb({ success = false }) end
    cb(lib.callback.await('sd-phone:server:payphone:insertCoin', false, {
        location = activeLocation,
    }) or { success = false, message = 'No response from server' })
end)

RegisterNUICallback('sd-phone:payphone:hangup', function(_, cb)
    doHangup()
    cb({ ok = true })
end)

---Server push: our payphone call started ringing (mirrors call:outgoing for the dial UI).
RegisterNetEvent('sd-phone:client:payphone:outgoing', function(data)
    SendNUIMessage({ action = 'sd-phone:payphone:outgoing', data = data })
end)

---Server push: any call ended; the payphone UI/menu filters by channel.
RegisterNetEvent('sd-phone:client:call:ended', function(data)
    if not (activeChannel and data and data.channel == activeChannel) then return end
    activeChannel = nil
    if cfg.UseOxLibMenu then
        if lib.getOpenContextMenu() == 'sd_payphone_call' then lib.hideContext(true) end
        lib.notify({ title = 'Payphone', description = 'Call ended', type = 'inform' })
        endMenuSession()
        return
    end
    SendNUIMessage({ action = 'sd-phone:payphone:ended', data = data })
end)

---Server push: a booth somewhere started ringing; play its bell if it's near us.
RegisterNetEvent('sd-phone:client:payphone:ringStart', function(data)
    if not cfg.Enabled or not data or not data.location or not data.channel then return end
    local coords = coordsFromKey(data.location)
    if not coords or #(GetEntityCoords(PlayerPedId()) - coords) > 50.0 then return end

    local entry = { coords = coords, location = data.location, soundId = nil }
    local booth = boothAt(coords)
    if booth then
        local inbound = cfg.Inbound or {}
        entry.soundId = GetSoundId()
        PlaySoundFromEntity(entry.soundId, inbound.SoundName or 'Ringtone_Michael', booth, inbound.SoundSet or 'Phone_SoundSet_Michael', false, 0)
    end
    ringing[data.channel] = entry
end)

---Server push: the ring was answered, cancelled or timed out.
RegisterNetEvent('sd-phone:client:payphone:ringStop', function(data)
    local entry = data and ringing[data.channel]
    if not entry then return end
    if entry.soundId then
        StopSound(entry.soundId)
        ReleaseSoundId(entry.soundId)
    end
    ringing[data.channel] = nil
end)

if cfg.Enabled then
    target.addModel(cfg.Models or {}, {
        {
            name     = 'sd-phone:payphone',
            icon     = 'fas fa-phone',
            label    = 'Use Payphone',
            distance = cfg.TargetDistance or 1.5,
            canInteract = function(entity)
                return ringAt(entity) == nil
            end,
            onSelect = function(tdata)
                local entity = tdata and tdata.entity
                dbg('use target selected: tdata=%s entity=%s model=%s', type(tdata), tostring(entity), entity and entity ~= 0 and modelName(GetEntityModel(entity)) or '-')
                if not entity or entity == 0 then return end
                openPayphone(entity, GetEntityCoords(entity))
            end,
        },
        {
            name     = 'sd-phone:payphone:answer',
            icon     = 'fas fa-phone-volume',
            label    = 'Answer Phone',
            distance = cfg.TargetDistance or 1.5,
            canInteract = function(entity)
                return ringAt(entity) ~= nil
            end,
            onSelect = function(tdata)
                local entity = tdata and tdata.entity
                if not entity or entity == 0 then return end
                local coords = GetEntityCoords(entity)
                local channel, entry = ringAt(entity)
                if not channel then return end
                local result = lib.callback.await('sd-phone:server:payphone:answer', false, {
                    location = entry.location,
                    channel  = channel,
                })
                if not result or not result.success then
                    lib.notify({ title = 'Payphone', description = (result and result.message) or 'Could not answer', type = 'error' })
                    return
                end
                openPayphone(entity, coords, result.data)
            end,
        },
    })
end

---Public export: opens the payphone dial UI at the player's position (no booth prop needed),
---for any script that wants payphone calling - exports['sd-phone']:openPayphone().
exports('openPayphone', function()
    openPayphone(nil, GetEntityCoords(PlayerPedId()))
end)

---Public export: true while the payphone UI is up - exports['sd-phone']:isPayphoneOpen().
exports('isPayphoneOpen', function()
    return activeLocation ~= nil
end)

---Restores the world booth and removes our animated copy if the resource stops mid-call.
AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    if animProp and DoesEntityExist(animProp) then DeleteEntity(animProp) end
    if animEntity and DoesEntityExist(animEntity) then SetEntityVisible(animEntity, true, false) end
end)
