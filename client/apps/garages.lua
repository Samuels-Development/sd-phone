---@type table Locale bridge (bridge.shared.locale): t(key, english, vars) for in-world text.
local locale = require 'bridge.shared.locale'
---@type table Notify bridge (bridge.client.notify): local notification popups.
local notify = require 'bridge.client.notify'
---@type fun(raw: any): VehicleModel Stored model value to hash/spawn/display (client.vehiclename).
local vehicleModel = require 'client.vehiclename'

---@type table<integer, string> GTA vehicle-class id -> display label for the app's class chip.
local CLASS_NAMES = {
    [0] = 'Compact',  [1] = 'Sedan',      [2] = 'SUV',        [3] = 'Coupe',
    [4] = 'Muscle',   [5] = 'Sports Classic', [6] = 'Sports', [7] = 'Super',
    [8] = 'Motorcycle', [9] = 'Off-Road', [10] = 'Industrial',[11] = 'Utility',
    [12] = 'Van',     [13] = 'Cycle',     [14] = 'Boat',      [15] = 'Helicopter',
    [16] = 'Plane',   [17] = 'Service',   [18] = 'Emergency', [19] = 'Military',
    [20] = 'Commercial', [21] = 'Train',
}

-- Vehicle-image source: toggle, default and URL template live in configs/garages.lua.
---@type table Garages app config (configs.garages): system pick, image knobs, waypoint fallbacks.
local GARAGES_CFG     = require 'configs.garages'
---@type boolean Whether players may flip photos <-> icons from the app header.
local ALLOW_TOGGLE    = GARAGES_CFG.AllowImageToggle == true
---@type boolean Default photos-on state.
local SHOW_IMAGES_DEF = GARAGES_CFG.ShowVehicleImages ~= false
---@type boolean True when images could show at all.
local IMAGES_POSSIBLE = ALLOW_TOGGLE or SHOW_IMAGES_DEF
---@type string Image URL template with a `{model}` placeholder ('' disables images).
local IMAGE_TEMPLATE  = type(GARAGES_CFG.VehicleImageUrl) == 'string' and GARAGES_CFG.VehicleImageUrl or ''

---Enriches one server vehicle row in place: resolves the raw model into a display name + class
---label, attaches the photo URL when images can show, and strips internal fields.
---@param v table vehicle row from the server list callback (mutated in place)
---@return table v the same row, for call-through convenience
local function enrich(v)
    local model = vehicleModel(v.model)

    if model.hash then
        local cls = GetVehicleClassFromName(model.hash)
        v.class = CLASS_NAMES[cls] or v.class
    end

    if IMAGES_POSSIBLE and model.spawn and IMAGE_TEMPLATE ~= '' then
        v.image = (IMAGE_TEMPLATE:gsub('{model}', model.spawn))
    end

    v.model = model.display ~= '' and model.display or 'Vehicle'
    if not v.class or v.class == '' then
        v.class = v.garageType == 'boat' and 'Boat'
            or v.garageType == 'air' and 'Aircraft'
            or 'Vehicle'
    end
    v.garageType = nil
    v.hash = nil
    return v
end

---@type table|nil Cached valet availability + price, resolved from the server on first use.
local valetInfo

---Valet availability for the app, asked of the server once per session.
---@return table info { enabled, price, account }
local function getValetInfo()
    if valetInfo then return valetInfo end
    local ok, info = pcall(function() return lib.callback.await('sd-phone:server:garages:valetInfo', false) end)
    valetInfo = (ok and type(info) == 'table') and info or { enabled = false, price = 0 }
    return valetInfo
end

---React -> Lua: the player's vehicle list. Forwards to the server callback, enriches each row
---(pcall'd per row), and attaches the image toggle flags plus valet availability.
RegisterNUICallback('sd-phone:garages:list', function(_payload, cb)
    local result = lib.callback.await('sd-phone:server:garages:list', false)
    if not result then result = { success = false, message = 'No response from server', data = {} } end
    if result.success and type(result.data) == 'table' then
        for i = 1, #result.data do
            pcall(enrich, result.data[i])
        end
    end
    result.images = { allowToggle = ALLOW_TOGGLE, default = SHOW_IMAGES_DEF }
    result.valet  = getValetInfo()
    cb(result)
end)

---React -> Lua: drops a map waypoint at server-resolved coords; non-numeric input is rejected.
RegisterNUICallback('sd-phone:garages:waypoint', function(payload, cb)
    local x = type(payload) == 'table' and tonumber(payload.x) or nil
    local y = type(payload) == 'table' and tonumber(payload.y) or nil
    if not x or not y then return cb({ success = false }) end
    SetNewWaypoint(x + 0.0, y + 0.0)
    notify.show({ description = locale.t('garages.waypointSet', 'Waypoint set.'), type = 'success' })
    cb({ success = true })
end)

-- Live mileage (jg-vehiclemileage), resolved on the client.
---@type string|nil Cached 'mi'/'km' from jg-vehiclemileage's getUnit.
local cachedUnit

---Returns the short unit label for mileage figures, cached after the first successful export
---read. Defaults to 'km'.
---@return string unit 'mi' or 'km'
local function unitShort()
    if cachedUnit then return cachedUnit end
    local ok, u = pcall(function() return exports['jg-vehiclemileage']:getUnit() end)
    cachedUnit = (ok and u == 'miles') and 'mi' or 'km'
    return cachedUnit
end

---Plate equality tolerant of the game's plate padding: trailing whitespace stripped and case
---ignored on both sides. nil-safe on either input.
---@param a string|nil
---@param b string|nil
---@return boolean
local function plateMatches(a, b)
    if not a or not b then return false end
    return (a:gsub('%s+$', '')):upper() == (b:gsub('%s+$', '')):upper()
end

---@type table Vehicle-key bridge (bridge.client.vehiclekeys): live lock state + fob lock/unlock
---across the supported key resources.
local vehiclekeys = require 'bridge.client.vehiclekeys'

---React -> Lua: live lock state for one of the player's vehicles; answers only for a vehicle
---streamed near the player. Read-only.
RegisterNUICallback('sd-phone:garages:lockstate', function(payload, cb)
    local plate = type(payload) == 'table' and payload.plate or nil
    if not vehiclekeys.active() or type(plate) ~= 'string' or plate == '' then return cb({ success = false }) end
    local locked = vehiclekeys.isLocked(plate)
    if locked == nil then return cb({ success = false }) end
    cb({ success = true, locked = locked })
end)

---React -> Lua: locks/unlocks a nearby spawned vehicle, chirping the hazards. Fails when the
---car isn't streamed near the player.
RegisterNUICallback('sd-phone:garages:setlock', function(payload, cb)
    local plate  = type(payload) == 'table' and payload.plate or nil
    local locked = type(payload) == 'table' and payload.locked == true
    if type(plate) ~= 'string' or plate == '' then return cb({ success = false }) end
    local applied = vehiclekeys.setLocked(plate, locked)
    if applied == nil then return cb({ success = false }) end
    cb({ success = true, locked = applied })
end)

---React -> Lua: a vehicle's odometer reading: the live export value when the player sits in
---that vehicle, else the persisted value by plate; converts km -> mi per jg's unit and floors.
RegisterNUICallback('sd-phone:garages:mileage', function(payload, cb)
    if GetResourceState('jg-vehiclemileage') ~= 'started' then return cb({ success = false }) end
    local plate = type(payload) == 'table' and payload.plate or nil
    if type(plate) ~= 'string' or plate == '' then return cb({ success = false }) end

    local km
    local veh = GetVehiclePedIsIn(cache.ped, false)
    if veh ~= 0 and plateMatches(GetVehicleNumberPlateText(veh), plate) then
        local ok, v = pcall(function() return exports['jg-vehiclemileage']:getMileage() end)
        if ok and type(v) == 'number' then km = v end
    end
    if km == nil then
        local ok, v = pcall(function() return exports['jg-vehiclemileage']:getMileageByPlate(plate) end)
        if ok and type(v) == 'number' then km = v end
    end
    if type(km) ~= 'number' then return cb({ success = false }) end

    local unit = unitShort()
    local val  = unit == 'mi' and km * 0.621371 or km
    cb({ success = true, mileage = math.floor(val), unit = unit })
end)

---@type table Valet settings from configs.garages.
local VALET        = type(GARAGES_CFG.Valet) == 'table' and GARAGES_CFG.Valet or {}
---@type number Seconds after taking damage that valet stays blocked (0 disables).
local COMBAT_BLOCK = math.max(0, tonumber(VALET.CombatBlock) or 0)
---@type number Metres out a driven delivery starts from.
local DRIVE_FROM   = math.max(5, tonumber(VALET.DriveFrom) or 75)
---@type string Valet driver model.
local VALET_PED    = type(VALET.Ped) == 'string' and VALET.Ped or 'S_M_Y_XMech_01'

---Server refusal code -> the message shown to the player. Looked up on demand rather than held
---as a constant table, so every line is translated after the locale catalogue has loaded.
---@param reason string|nil refusal code from the server
---@return string
local function valetError(reason)
    local messages = {
        disabled      = locale.t('garages.valetDisabled', 'Valet is unavailable.'),
        notFound      = locale.t('garages.valetNotFound', 'Vehicle not found.'),
        impounded     = locale.t('garages.valetImpounded', 'Impounded vehicles must be collected from the impound.'),
        notStored     = locale.t('garages.valetNotStored', 'That vehicle is not in a garage.'),
        notRoad       = locale.t('garages.valetNotRoad', 'This vehicle cannot be delivered by road.'),
        cooldown      = locale.t('garages.valetCooldown', 'You have already called a valet recently.'),
        inVehicle     = locale.t('garages.valetInVehicle', 'You cannot call a valet while driving.'),
        combat        = locale.t('garages.valetCombat', 'Too dangerous to call a valet right now.'),
        blockedArea   = locale.t('garages.valetBlockedArea', 'A valet cannot deliver here.'),
        funds         = locale.t('garages.valetFunds', 'You cannot afford the valet fee.'),
        noSpace       = locale.t('garages.valetNoSpace', 'No road nearby. Move somewhere a vehicle can reach you.'),
        spawnFailed   = locale.t('garages.valetSpawnFailed', 'The vehicle could not be placed. Try again.'),
        streamFailed  = locale.t('garages.valetStreamFailed', 'The vehicle did not arrive. Try again.'),
        takeOutFailed = locale.t('garages.valetTakeOutFailed', 'The garage would not release the vehicle.'),
    }
    return messages[reason or ''] or messages.disabled
end

---@type integer GetGameTimer of the player's last health drop (0 = never).
local lastHurt = 0

if VALET.Enabled == true and COMBAT_BLOCK > 0 then
    CreateThread(function()
        local last = GetEntityHealth(cache.ped)
        while true do
            Wait(1000)
            local hp = GetEntityHealth(cache.ped)
            if hp < last then lastHurt = GetGameTimer() end
            last = hp
        end
    end)
end

---@return boolean hurt whether the player took damage inside the configured window
local function recentDamage()
    if COMBAT_BLOCK <= 0 or lastHurt == 0 then return false end
    return (GetGameTimer() - lastHurt) < (COMBAT_BLOCK * 1000)
end

---@type number[] Bearings probed around the player when looking for a spot to deliver from.
local PROBE_ANGLES = { 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330 }
---@type integer Nodes taken per probe, so one carriageway of a divided road isn't the only option.
local PROBE_DEPTH = 3
---@type integer Milliseconds spent looking for a drop spot before giving up.
local SPAWN_SEARCH_MS = 5000
---@type number Metres below which a driven delivery isn't worth staging, so the car is left parked.
local DRIVE_MIN = 20.0
---@type number Height difference that marks a node as being on another road level entirely.
local LEVEL_TOLERANCE = 8.0
---@type number Degrees a node's road may face away from the player before a drive is a detour.
local FACING_TOLERANCE = 75.0
---@type number Score penalty per degree the road faces away from the player.
local MISALIGN_COST = 1.5
---@type number Score penalty for a node on a different road level (a freeway over or under).
local LEVEL_COST = 500.0

---Heading, in the game's convention (0 = north, rising anticlockwise), pointing from one point at
---another.
---@param from vector3
---@param to vector3
---@return number heading degrees
local function bearingTo(from, to)
    return math.deg(math.atan(-(to.x - from.x), to.y - from.y)) % 360
end

---Smallest angle between two headings.
---@param a number degrees
---@param b number degrees
---@return number delta 0-180
local function headingDelta(a, b)
    return math.abs(((a - b + 180) % 360) - 180)
end

---A road node to deliver from, picked by probing a ring at minDist and scoring each candidate on
---distance from that ring, how far its road faces away from the player, and its road level.
---@param minDist number metres the delivery would like to start from
---@return vector3|nil coords
---@return number heading
---@return number dist metres from the player (0 when nothing was found)
---@return boolean facing whether the chosen road actually points at the player
local function findSpawn(minDist)
    local at = GetEntityCoords(cache.ped)

    local bestPos, bestHead, bestDist, bestMiss, bestScore

    ---Weigh one candidate node against the best so far.
    ---@param pos vector3
    ---@param head number the road's heading at that node
    local function consider(pos, head)
        local d       = #(at - pos)
        local miss    = headingDelta(head, bearingTo(pos, at))
        local score   = math.abs(d - minDist) + miss * MISALIGN_COST
        if math.abs(pos.z - at.z) > LEVEL_TOLERANCE then score = score + LEVEL_COST end
        if not bestScore or score < bestScore then
            bestPos, bestHead, bestDist, bestMiss, bestScore = pos, head, d, miss, score
        end
    end

    for i = 1, #PROBE_ANGLES do
        local rad = math.rad(PROBE_ANGLES[i])
        local px, py = at.x + math.cos(rad) * minDist, at.y + math.sin(rad) * minDist
        for nth = 1, PROBE_DEPTH do
            local ok, pos, head = GetNthClosestVehicleNodeWithHeading(px, py, at.z, nth, 0, 0, 0)
            if not ok or not pos then break end
            consider(pos, head or 0.0)
        end
    end

    if not bestPos then
        local ok, pos, head = GetNthClosestVehicleNodeWithHeading(at.x, at.y, at.z, 1, 0, 0, 0)
        if ok and pos then consider(pos, head or 0.0) end
    end
    if not bestPos then return nil, 0.0, 0.0, false end

    return bestPos, bestHead, bestDist, bestMiss <= FACING_TOLERANCE
end

---Retry findSpawn for up to SPAWN_SEARCH_MS, returning early on a facing spot at drive distance
---and settling for the best seen otherwise. Nil only when no road was reachable at all.
---@param minDist number metres
---@return vector3|nil coords
---@return number heading
---@return number dist metres from the player
---@return boolean facing whether the chosen road points at the player
local function awaitSpawn(minDist)
    local pos, head, dist, facing = findSpawn(minDist)
    if pos and facing and dist >= DRIVE_MIN then return pos, head, dist, facing end

    local deadline = GetGameTimer() + SPAWN_SEARCH_MS
    while GetGameTimer() < deadline do
        Wait(250)
        local p, h, d, f = findSpawn(minDist)
        if p and ((f and not facing) or (f == facing and d > dist)) then
            pos, head, dist, facing = p, h, d, f
        end
        if pos and facing and dist >= DRIVE_MIN then break end
    end
    return pos, head, dist, facing
end

---Wait for a server-spawned vehicle to stream in locally.
---@param netId number
---@return number|nil veh entity handle
local function awaitEntity(netId)
    for _ = 1, 100 do
        if NetworkDoesNetworkIdExist(netId) then
            local veh = NetToVeh(netId)
            if veh and veh ~= 0 and DoesEntityExist(veh) then return veh end
        end
        Wait(50)
    end
    return nil
end

---@type integer Milliseconds a valet gets to complete a delivery.
local DRIVE_TIMEOUT_MS = 120000
---@type integer Milliseconds without progress before the valet is treated as stuck.
local DRIVE_STALL_MS = 25000
---@type number Metres from the player that counts as delivered.
local ARRIVE_DIST = 12.0
---@type number Metres the player must move before the valet is re-pointed at them.
local RETASK_DIST = 25.0
---@type number Metres of closing needed to count as progress rather than a stall.
local PROGRESS_STEP = 5.0

---Drive the delivered car to the player with a valet at the wheel, blipped and re-pointed as they
---move. The ped leaves on arrival; a stall or timeout keeps the blip on the abandoned car.
---
---lib.requestModel raises rather than returning on a model that never streams, hence the pcall; the
---2s budget matches the 40x50ms poll it replaces. The vehicle is re-checked after, because the load
---yields and a car deleted during it would leave the valet spawning into nothing.
---@param veh number vehicle entity
local function driveToPlayer(veh)
    CreateThread(function()
        local model = joaat(VALET_PED)
        if not pcall(lib.requestModel, model, 2000) then return end
        if not DoesEntityExist(veh) then
            SetModelAsNoLongerNeeded(model)
            return
        end

        local ped = CreatePedInsideVehicle(veh, 4, model, -1, true, false)
        SetModelAsNoLongerNeeded(model)
        if not DoesEntityExist(ped) then return end

        SetEntityAsMissionEntity(ped, true, true)
        SetBlockingOfNonTemporaryEvents(ped, true)
        SetPedKeepTask(ped, true)
        SetPedAlertness(ped, 0)

        ---Point the valet at a spot, at the speed and drive style used throughout.
        ---@param to vector3
        local function driveTo(to)
            TaskVehicleDriveToCoord(ped, veh, to.x, to.y, to.z, 25.0, 0, GetEntityModel(veh), 786603, 3.0, 1)
        end

        local target = GetEntityCoords(cache.ped)
        driveTo(target)

        local blip = AddBlipForEntity(veh)
        SetBlipSprite(blip, 225)
        SetBlipColour(blip, 5)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(locale.t('garages.valetBlip', 'Valet'))
        EndTextCommandSetBlipName(blip)

        local deadline  = GetGameTimer() + DRIVE_TIMEOUT_MS
        local closest   = math.huge
        local progressed = GetGameTimer()
        local arrived   = false

        while DoesEntityExist(ped) and DoesEntityExist(veh) and GetGameTimer() < deadline do
            local player = GetEntityCoords(cache.ped)
            local gap    = #(GetEntityCoords(veh) - player)
            if gap <= ARRIVE_DIST then arrived = true break end

            if gap < closest - PROGRESS_STEP then
                closest, progressed = gap, GetGameTimer()
            elseif (GetGameTimer() - progressed) > DRIVE_STALL_MS then
                break
            end

            if #(player - target) > RETASK_DIST then
                target = player
                driveTo(target)
            end

            Wait(1000)
        end

        if DoesEntityExist(ped) then
            TaskLeaveVehicle(ped, veh, 0)
            Wait(3000)
            TaskWanderStandard(ped, 10.0, 10)
            SetPedAsNoLongerNeeded(ped)
        end

        if arrived then
            if DoesBlipExist(blip) then RemoveBlip(blip) end
        else
            notify.show({
                description = locale.t('garages.valetStuck',
                    'Your valet got stuck. Your vehicle is marked on your map.'),
                type = 'error',
            })
        end
    end)
end

---React -> Lua: request a valet delivery for one of the player's stored vehicles. Picks the drop
---spot, then applies the saved properties, grants keys and drives the car in or leaves it waiting.
RegisterNUICallback('sd-phone:garages:valet', function(payload, cb)
    local plate = type(payload) == 'table' and payload.plate or nil
    if type(plate) ~= 'string' or plate == '' then
        notify.show({ description = valetError('notFound'), type = 'error' })
        return cb({ success = false })
    end

    local info = getValetInfo()
    if not info.enabled then
        notify.show({ description = valetError('disabled'), type = 'error' })
        return cb({ success = false })
    end

    local drive = VALET.Drive ~= false
    local pos, heading, dist, facing = awaitSpawn(drive and DRIVE_FROM or 3.0)
    if not pos then
        notify.show({ description = valetError('noSpace'), type = 'error' })
        return cb({ success = false })
    end

    local res = lib.callback.await('sd-phone:server:garages:valet', false, {
        plate        = plate,
        class        = type(payload) == 'table' and payload.class or nil,
        spawn        = { x = pos.x, y = pos.y, z = pos.z, h = heading },
        recentDamage = recentDamage(),
    })

    if type(res) ~= 'table' or not res.success then
        local reason  = type(res) == 'table' and res.reason or nil
        local message = valetError(reason)
        if reason == 'blockedArea' and type(res.detail) == 'string' then
            message = locale.t('garages.valetBlockedAreaAt', 'A valet cannot deliver to {place}.',
                { place = res.detail })
        end
        notify.show({ description = message, type = 'error' })
        return cb({ success = false })
    end

    local veh = awaitEntity(res.netId)
    if not veh then
        notify.show({ description = valetError('streamFailed'), type = 'error' })
        return cb({ success = false })
    end

    if type(res.props) == 'table' then pcall(lib.setVehicleProperties, veh, res.props) end
    SetVehicleNumberPlateText(veh, res.plate)
    SetVehicleNeedsToBeHotwired(veh, false)
    SetVehicleEngineOn(veh, true, true, false)
    SetVehicleDirtLevel(veh, 0.0)
    vehiclekeys.giveKeys(res.plate, veh)

    local driving = res.drive and dist >= DRIVE_MIN and facing
    if driving then
        driveToPlayer(veh)
        notify.show({ description = locale.t('garages.valetOnTheWay', 'Your valet is on the way.'), type = 'success' })
    else
        SetVehicleDoorsLocked(veh, 1)
        notify.show({ description = locale.t('garages.valetWaitingNearby', 'Your vehicle is waiting nearby.'), type = 'success' })
    end

    cb({ success = true, drive = driving })
end)
