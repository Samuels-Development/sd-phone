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
---@type table<string, { channel: number, soundId: number|nil }> Booths ringing right now, by location key.
local ringing = {}

AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open and true or false
    -- Menu mode never holds NUI focus, so there is nothing to re-assert.
    if not phoneOpen and activeLocation and not cfg.UseOxLibMenu then
        SetNuiFocus(true, true)
        SetNuiFocusKeepInput(false)
    end
end)

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

---Plays one clip of the booth animation, positioning the ped against the handset first.
---@param entity number|nil booth entity
---@param clip string
---@param loop boolean
---@param reposition boolean move the ped to the booth before playing
local function playAnim(entity, clip, loop, reposition)
    local scene = cfg.Scene
    if not scene or scene.Enabled == false or not entity or entity == 0 then return end
    local dict = scene.Dict
    RequestAnimDict(dict)
    local deadline = GetGameTimer() + 3000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < deadline do Wait(10) end
    if not HasAnimDictLoaded(dict) then return end

    local ped = PlayerPedId()
    if reposition then
        local pos = GetOffsetFromEntityInWorldCoords(entity, -0.10, -0.85, 0.0)
        local booth = GetEntityCoords(entity)
        SetEntityCoords(ped, pos.x, pos.y, pos.z - 1.0, false, false, false, false)
        SetEntityHeading(ped, GetHeadingFromVector_2d(booth.x - pos.x, booth.y - pos.y))
    end
    TaskPlayAnim(ped, dict, clip, 3.0, 3.0, -1, loop and 1 or 2, 0.0, false, false, false)
    animEntity = entity
end

---Plays the hang-up clip once and lets the ped return to idle.
local function stopAnim()
    local scene = cfg.Scene
    if animEntity and scene and scene.Enabled ~= false and DoesEntityExist(animEntity) then
        local ped = PlayerPedId()
        if HasAnimDictLoaded(scene.Dict) then
            TaskPlayAnim(ped, scene.Dict, scene.Exit or 'exit_left_male', 3.0, 3.0, -1, 0, 0.0, false, false, false)
        else
            ClearPedTasks(ped)
        end
    else
        ClearPedTasks(PlayerPedId())
    end
    animEntity = nil
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
        if animEntity then playAnim(animEntity, cfg.Scene and cfg.Scene.Idle or 'fxfr_ptj_1_male', true, false) end
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
    stopAnim()
end

---ox_lib flow: context menu with dial prompt + notepad numbers, replacing the NUI.
---@param state table payload from payphone:state
local function openMenu(state)
    local function startCall(number)
        local result = doDial(number)
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

    local state = lib.callback.await('sd-phone:server:payphone:state', false, { location = location })
    if not state or not state.success then return end

    activeLocation = location
    if connected then
        activeChannel = connected.channel
        state.data.connected = true
        state.data.callerName = connected.callerName
    end
    if entity then
        playAnim(entity, cfg.Scene and cfg.Scene.Enter or 'fxfr_phl_1_intro_male', false, true)
        if connected then
            SetTimeout(1800, function()
                if activeChannel then playAnim(entity, cfg.Scene and cfg.Scene.Idle or 'fxfr_ptj_1_male', true, false) end
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
    stopAnim()
    cb({ ok = true })
end)

RegisterNUICallback('sd-phone:payphone:dial', function(data, cb)
    cb(doDial(tostring(data and data.number or '')))
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
    if not cfg.Enabled or not data or not data.location then return end
    local coords = coordsFromKey(data.location)
    if not coords or #(GetEntityCoords(PlayerPedId()) - coords) > 50.0 then return end

    local entry = { channel = data.channel, soundId = nil }
    local booth = boothAt(coords)
    if booth then
        local inbound = cfg.Inbound or {}
        entry.soundId = GetSoundId()
        PlaySoundFromEntity(entry.soundId, inbound.SoundName or 'Remote_Ring', booth, inbound.SoundSet or 'Phone_SoundSet_Michael', false, 0)
    end
    ringing[data.location] = entry
end)

---Server push: the ring was answered, cancelled or timed out.
RegisterNetEvent('sd-phone:client:payphone:ringStop', function(data)
    if not data then return end
    for location, entry in pairs(ringing) do
        if entry.channel == data.channel then
            if entry.soundId then
                StopSound(entry.soundId)
                ReleaseSoundId(entry.soundId)
            end
            ringing[location] = nil
        end
    end
end)

if cfg.Enabled then
    target.addModel(cfg.Models or {}, {
        {
            name     = 'sd-phone:payphone',
            icon     = 'fas fa-phone',
            label    = 'Use Payphone',
            distance = cfg.TargetDistance or 1.5,
            canInteract = function(entity)
                return ringing[locationKey(GetEntityCoords(entity))] == nil
            end,
            onSelect = function(tdata)
                local entity = tdata and tdata.entity
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
                return ringing[locationKey(GetEntityCoords(entity))] ~= nil
            end,
            onSelect = function(tdata)
                local entity = tdata and tdata.entity
                if not entity or entity == 0 then return end
                local coords = GetEntityCoords(entity)
                local entry = ringing[locationKey(coords)]
                if not entry then return end
                local result = lib.callback.await('sd-phone:server:payphone:answer', false, {
                    location = locationKey(coords),
                    channel  = entry.channel,
                })
                if result and result.success and result.data then
                    openPayphone(entity, coords, result.data)
                end
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
