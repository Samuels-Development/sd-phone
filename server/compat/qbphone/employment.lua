---@type table Shared shim helpers (server.compat.qbphone.shared): registration and text.
local shim = require 'server.compat.qbphone.shared'
---@type table Saved-jobs store (server.services.jobstore): the character's multijob list.
local jobstore = require 'server.services.jobstore'
---@type table Authoritative company handlers (server.services.actions): fires and roster pushes.
local services = require 'server.services.actions'
---@type table Society bridge (bridge.server.society): character names for offline members.
local society = require 'bridge.server.society'
---@type table Job bridge (bridge.server.job): whether a job name exists.
local job = require 'bridge.server.job'
---@type table Player bridge (bridge.server.player): online characters by citizenid.
local player = require 'bridge.server.player'

---Every saved member of a job in the fork's employee shape, keyed by citizenid.
---@param jobName string
---@return table<string, { cid: string, grade: number, name: string }>
local function employeesOf(jobName)
    local rows = jobstore.savedJobMembers(jobName)
    local cids = {}
    for i = 1, #rows do cids[i] = rows[i].citizenid end
    local names = #cids > 0 and society.namesByCids(cids) or {}

    local out = {}
    for i = 1, #rows do
        local cid = rows[i].citizenid
        out[cid] = { cid = cid, grade = rows[i].grade, name = names[cid] or cid }
    end
    return out
end

---getJobs(citizenid), from Renewed's qb-phone fork: the jobs a character holds in the Services
---saved-jobs list, each as { cid, grade, name }, plus every co-worker per job as a second return.
shim.registerExport('getJobs', function(citizenid)
    local cid = shim.text(citizenid)
    local jobs, employees = {}, {}
    if cid == '' then return jobs, employees end

    for jobName in pairs(jobstore.getSaved(cid)) do
        local roster = employeesOf(jobName)
        if roster[cid] then
            jobs[jobName] = roster[cid]
            employees[jobName] = roster
        end
    end
    return jobs, employees
end)

---hireUser(job, citizenid, grade): adds a job to a character's saved jobs without making it their
---active one, as the fork did. They switch to it from the Services app.
shim.registerExport('hireUser', function(jobName, citizenid, grade)
    local name, cid = shim.text(jobName), shim.text(citizenid)
    if name == '' or cid == '' or name == 'unemployed' or not job.getLabel(name) then return false end
    if jobstore.getSaved(cid)[name] then return false end

    jobstore.addSaved(cid, name, math.max(0, math.floor(tonumber(grade) or 0)))
    local src = player.getSourceByRealIdentifier(cid)
    if src then TriggerClientEvent('sd-phone:client:services:jobsChanged', src) end
    services.notifyRoster(name)
    return true
end)

---fireUser(job, citizenid): the same removal as the Services app's Fire button.
shim.registerExport('fireUser', function(jobName, citizenid)
    local name, cid = shim.text(jobName), shim.text(citizenid)
    if name == '' or cid == '' then return false end
    return services.fireEmployee(cid, name)
end)
