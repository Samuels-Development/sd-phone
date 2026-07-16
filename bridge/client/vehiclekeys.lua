---@type string[] Supported vehicle-key resources, in detection-priority order.
local RESOURCES = { 'qbx_vehiclekeys', 'qb-vehiclekeys', 'qs-vehiclekeys', 'vehicles_keys', 'mk_vehiclekeys' }

---@type table Vehicle-lock module; the table returned at end of file. Reads and toggles lock
---state on the live entity found by plate; returns nil for vehicles not streamed nearby.
local M = {}

---Resource name of the running key system, or nil. Checked at call time.
---@return string|nil
function M.active()
    for i = 1, #RESOURCES do
        if GetResourceState(RESOURCES[i]) == 'started' then return RESOURCES[i] end
    end
    return nil
end

---Normalise a plate for comparison: trailing whitespace stripped, uppercased. Non-strings
---normalise to ''.
---@param p any candidate plate value
---@return string normalised plate ('' when unusable)
local function norm(p)
    return type(p) == 'string' and (p:gsub('%s+$', ''):upper()) or ''
end

---The spawned vehicle entity for a plate, or nil if none is streamed nearby.
---@param plate string
---@return number|nil veh
local function findByPlate(plate)
    local want = norm(plate)
    if want == '' then return nil end
    for _, veh in ipairs(GetGamePool('CVehicle')) do
        if DoesEntityExist(veh) and norm(GetVehicleNumberPlateText(veh)) == want then
            return veh
        end
    end
    return nil
end

---Live lock state for a plate, read off the spawned entity: status 0 reads as undeterminable,
---1 unlocked, 2+ locked. Returns nil when no key system is running.
---@param plate string
---@return boolean|nil locked true = locked, false = unlocked, nil = undeterminable
function M.isLocked(plate)
    if not M.active() then return nil end
    local veh = findByPlate(plate)
    if not veh then return nil end
    local status = GetVehicleDoorLockStatus(veh)
    if type(status) ~= 'number' or status == 0 then return nil end
    return status >= 2
end

---Flashes both hazard indicators twice when locking, once when unlocking. Runs in its own
---thread.
---@param veh number
---@param locked boolean
local function blip(veh, locked)
    local flashes = locked and 2 or 1
    CreateThread(function()
        for i = 1, flashes do
            SetVehicleIndicatorLights(veh, 0, true)
            SetVehicleIndicatorLights(veh, 1, true)
            Wait(190)
            SetVehicleIndicatorLights(veh, 0, false)
            SetVehicleIndicatorLights(veh, 1, false)
            if i < flashes then Wait(150) end
        end
    end)
end

---A quick headlight flash. Runs in its own thread.
---@param veh number
local function fobLights(veh)
    CreateThread(function()
        SetVehicleLights(veh, 2)
        Wait(250)
        SetVehicleLights(veh, 1)
        Wait(200)
        SetVehicleLights(veh, 0)
    end)
end

---Lock or unlock the nearby spawned vehicle for a plate, requesting network control first. Fires
---qbx_vehiclekeys' own lock path when active, else the native door lock + hazard flash; nil when
---not streamed nearby.
---@param plate string
---@param locked boolean true = lock, false = unlock
---@return boolean|nil locked the applied state, or nil if no nearby entity
function M.setLocked(plate, locked)
    local veh = findByPlate(plate)
    if not veh then return nil end
    if NetworkGetEntityIsNetworked(veh) and not NetworkHasControlOfEntity(veh) then
        NetworkRequestControlOfEntity(veh)
    end

    local lockstate = locked and 2 or 1
    if M.active() == 'qbx_vehiclekeys' then
        TriggerServerEvent('qb-vehiclekeys:server:setVehLockState', NetworkGetNetworkIdFromEntity(veh), lockstate)
        PlaySoundFromEntity(-1, 'Remote_Control_Fob', veh, 'PI_Menu_Sounds', false, 0)
        fobLights(veh)
    else
        SetVehicleDoorsLocked(veh, lockstate)
        blip(veh, locked)
    end
    return locked
end

return M
