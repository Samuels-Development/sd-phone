---@type FrameworkInfo Framework detection (bridge.shared.framework): name ('qbx'|'qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'

---@type table Job module; the table returned at end of file. Client-side job identity, kept live off
---the framework's own job-change events so callers never poll.
local job = {}

---@type string|nil Active job name, nil until the player loads.
local currentName = nil

---@type integer Active grade level; 0 when unknown.
local currentGrade = 0

---@type fun(name: string|nil, grade: integer)[] Fired after the job actually changes.
local listeners = {}

---The framework's player-data table, or nil before the player has loaded.
---@return table|nil
local function playerData()
    if framework.name == 'qbx' then
        local ok, data = pcall(function() return exports.qbx_core:GetPlayerData() end)
        return ok and data or nil
    end
    if framework.qb then
        if not framework.core then return nil end
        local ok, data = pcall(function() return framework.core.Functions.GetPlayerData() end)
        return ok and data or nil
    end
    if framework.name == 'esx' then
        if not framework.core then return nil end
        local ok, data = pcall(function() return framework.core.GetPlayerData() end)
        return ok and data or nil
    end
    return nil
end

---Name and grade pulled out of a framework job table. ESX flattens the grade onto the job; the qb
---family nests it under `grade.level`.
---@param raw table|nil
---@return string|nil name, integer grade
local function readJob(raw)
    if type(raw) ~= 'table' then return nil, 0 end
    local name = type(raw.name) == 'string' and raw.name or nil
    if framework.qb then
        local grade = type(raw.grade) == 'table' and tonumber(raw.grade.level) or nil
        return name, grade or 0
    end
    return name, tonumber(raw.grade) or 0
end

---Stores the job and notifies listeners, but only when it actually moved.
---@param name string|nil
---@param grade integer
local function apply(name, grade)
    if name == currentName and grade == currentGrade then return end
    currentName  = name
    currentGrade = grade
    for i = 1, #listeners do
        pcall(listeners[i], currentName, currentGrade)
    end
end

---Re-reads the job straight off the framework. Used at load, and whenever an event arrives without
---a usable payload.
local function refresh()
    local data = playerData()
    apply(readJob(data and data.job))
end

---The player's active job name, or nil before they have loaded.
---@return string|nil
function job.name()
    return currentName
end

---The player's active grade level. 0 when unknown.
---@return integer
function job.grade()
    return currentGrade
end

---Predicate: does the player hold `jobName` at grade >= `minGrade`? Fails closed on an unloaded
---player, matching the server bridge.
---@param jobName any
---@param minGrade? integer Default 0.
---@return boolean
function job.has(jobName, minGrade)
    if type(jobName) ~= 'string' or currentName == nil then return false end
    if currentName ~= jobName then return false end
    return currentGrade >= (tonumber(minGrade) or 0)
end

---Registers a listener fired on every job change. Returns nothing: listeners live for the session.
---@param callback fun(name: string|nil, grade: integer)
function job.onChange(callback)
    if type(callback) ~= 'function' then return end
    listeners[#listeners + 1] = callback
end

if framework.qb then
    RegisterNetEvent('QBCore:Client:OnJobUpdate', function(raw)
        if type(raw) == 'table' then apply(readJob(raw)) else refresh() end
    end)
    RegisterNetEvent('QBCore:Client:OnPlayerLoaded', refresh)
    RegisterNetEvent('QBCore:Client:OnPlayerUnload', function() apply(nil, 0) end)
elseif framework.name == 'esx' then
    RegisterNetEvent('esx:setJob', function(raw)
        if type(raw) == 'table' then apply(readJob(raw)) else refresh() end
    end)
    RegisterNetEvent('esx:playerLoaded', refresh)
    RegisterNetEvent('esx:onPlayerLogout', function() apply(nil, 0) end)
end

-- A resource restart lands mid-session, where no load event is coming.
CreateThread(refresh)

return job
