---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'
---@type table Identity translation (server.compat.qssmartphone.identify): number -> source.
local identify = require 'server.compat.qssmartphone.identify'
---@type table Authoritative company handlers (server.services.actions): duty + customer messaging.
local actions = require 'server.services.actions'
---@type table Job bridge (bridge.server.job): live job name and duty reads.
local job = require 'bridge.server.job'
---@type table Player bridge (bridge.server.player): the online roster behind the job-wide duty scan.
local player = require 'bridge.server.player'
---@type table sd-phone config root (configs/config.lua): Services.Companies behind JobExists.
local config = require 'configs.config'

---@type table Marketplace module; the table returned at end of file. qs-smartphone's "Marketplace
---businesses" are sd-phone's configured Services companies, and its duty state is the framework's.
local marketplace = {}

local registerExport, registerPro, stubPro, warnOnce =
    shim.registerExport, shim.registerPro, shim.stubPro, shim.warnOnce

---@type table<string, table> Configured company entry by job name.
local byJob = {}
for _, company in ipairs(config.Services.Companies or {}) do
    if type(company.job) == 'string' then byJob[company.job] = company end
end

---Whether any connected employee of `jobName` is currently clocked in. Job-scoped rather than
---player-scoped, matching the export's documented meaning.
---@param jobName string
---@return boolean
function marketplace.jobOnDuty(jobName)
    for _, src in pairs(player.onlineCidMap()) do
        if job.getDuty(src) == true and job.getName(src) == jobName then return true end
    end
    return false
end

---JobExists(jobName): whether the framework job is configured as a company in configs/services.lua,
---which is sd-phone's equivalent of a Marketplace business.
registerExport('JobExists', function(jobName)
    return type(jobName) == 'string' and byJob[jobName] ~= nil
end)

---IsPlayerOnDuty(source): whether the player is clocked in on any job. Reads the framework's own
---duty flag, which is the value the Services app writes.
registerExport('IsPlayerOnDuty', function(source)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return false end
    return job.getDuty(src) == true
end)

---IsJobOnDuty(jobName): whether at least one employee of that job is on duty right now. Note this
---is job-scoped despite reading like the player-scoped name above it.
registerExport('IsJobOnDuty', function(jobName)
    if type(jobName) ~= 'string' or jobName == '' then return false end
    return marketplace.jobOnDuty(jobName)
end)

---GetDutyJob(source): the job the player is currently working as, nil when off duty.
registerExport('GetDutyJob', function(source)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return nil end
    if job.getDuty(src) ~= true then return nil end
    return job.getName(src)
end)

---SetDuty(source, jobName): a job name clocks in, omitting it clocks out. Goes through the same
---action the Services app uses, so the pref, the framework flag, the roster nudge and the
---dutyChanged pushes all follow.
---
---sd-phone's duty always belongs to the player's ACTIVE framework job, so a job name that is not
---the one they are on cannot be clocked into; that call is reported and makes no change.
registerExport('SetDuty', function(source, jobName)
    local src = tonumber(source)
    if not src or not GetPlayerName(src) then return false end

    if jobName == nil then
        return actions.setDuty(src, { on = false }).success == true
    end

    local current = job.getName(src)
    if current ~= jobName then
        warnOnce('SetDuty.job', ('SetDuty was asked to clock a player into %s while their active job is %s (called by %s); sd-phone duty always follows the ACTIVE framework job, so nothing was changed - switch their job first'):format(tostring(jobName), tostring(current), GetInvokingResource() or 'unknown'))
        return false
    end
    return actions.setDuty(src, { on = true }).success == true
end)

---getJobs(): legacy, never documented; its call sites read it as the configured job list. The
---configured company directory is the sd-phone equivalent.
registerExport('getJobs', function()
    return actions.companyList()
end)

---sendSOSMessage(phoneNumber, job, coords, type): sends an SOS from a phone number to a job's
---company inbox. `type` is 'location' (coords arrive JSON-encoded) or 'message' (prose).
---
---sd-phone has no separate SOS channel, so it is delivered as a customer message to that company,
---which is the inbox its employees actually read.
registerPro('sendSOSMessage', function(phoneNumber, jobName, coords, kind)
    local src = identify.sourceOfNumber(phoneNumber)
    if not src then return false end
    if type(jobName) ~= 'string' or jobName == '' then return false end

    local body = shim.str(coords)
    if kind == 'location' then
        local ok, decoded = pcall(json.decode, body)
        if ok and type(decoded) == 'table' then
            body = ('SOS at %.1f, %.1f, %.1f'):format(
                tonumber(decoded.x) or 0, tonumber(decoded.y) or 0, tonumber(decoded.z) or 0)
        end
    end
    if body == '' then body = 'SOS' end

    return actions.messageCompany(src, { job = jobName, body = body }).success == true
end)

-- setSOS is PRO's own undocumented SOS-state writer. sd-phone tracks no SOS state to write, and
-- the delivery half is already covered by sendSOSMessage above.
stubPro('setSOS', nil,
    'has no sd-phone equivalent: there is no SOS state to set; send the alert with sendSOSMessage, which reaches the job inbox')

return marketplace
