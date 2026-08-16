---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx'|'vrp') + live core
---handle.
local framework  = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod = require 'bridge.server.player'

---@type table Job module; the table returned at end of file. Job identity/permission primitives
---for the server bridge. vRP has no job field, no grade and no boss flag: there every answer is
---translated out of the player's vRP groups by configs/vrp.lua, and the vRP branches read that
---translation through the facade rather than touching a player object at all.
local job = {}

---Bind the vRP facade once at module load, and only on a vRP server.
---
---The require lives inside this branch on purpose: nothing under bridge/server/vrp/ may be pulled
---onto a QBox, QBCore or ESX boot, where its configs/vrp.lua would be missing and the load would take
---the whole resource down. Every branch below reads nil as "not a vRP server".
---@return table|nil core bridge.server.vrp.core, or nil off vRP
local function chooseVrp()
    if framework.name ~= 'vrp' then return nil end
    return require 'bridge.server.vrp.core'
end

---@type table|nil vRP facade (bridge.server.vrp.core), bound once at load; nil on every other
---framework.
local vrp = chooseVrp()

---The player's current job name, read live from the framework player object. Nil when the player
---can't be resolved or the framework path yields nothing. On vRP it is the configured job whose
---groups the player holds, and nil there means "no configured job matched", which fails closed:
---every job-gated app stays hidden rather than opening on a guess.
---@param source number player server id
---@return string|nil
function job.getName(source)
    if vrp then return vrp.getJob(source) end

    local p = player_mod.get(source)
    if not p then return nil end
    if framework.name == 'esx'  then return p.job and p.job.name or nil end
    if framework.qb then return p.PlayerData.job and p.PlayerData.job.name or nil end
    return nil
end

---The player's current job grade level. Returns 0 when the player or grade can't be resolved. On
---vRP the grade is the index of the highest rank group the player holds, so 0 means both "grade
---zero" and "no job", exactly as it already does on ESX.
---@param source number player server id
---@return integer
function job.getGrade(source)
    if vrp then return vrp.getGrade(source) end

    local p = player_mod.get(source)
    if not p then return 0 end
    if framework.name == 'esx'  then return p.job and p.job.grade or 0 end
    if framework.qb then
        return p.PlayerData.job and p.PlayerData.job.grade and p.PlayerData.job.grade.level or 0
    end
    return 0
end

---Predicate: does the player currently hold `jobName` at grade >= `minGrade`? Checks the active
---job only; fails closed when the player can't be resolved. The active job on vRP too, even though
---vRP could report several at once: a job gate must mean "this is what they are doing", not "this
---is something they could do".
---@param source number player server id
---@param jobName string
---@param minGrade? integer Default 0.
---@return boolean
function job.has(source, jobName, minGrade)
    if vrp then return vrp.hasJob(source, jobName, minGrade) end

    minGrade = minGrade or 0
    local p = player_mod.get(source)
    if not p then return false end

    if framework.qb then
        local data = p.PlayerData.job
        if data and data.name == jobName then
            return (data.grade and data.grade.level or 0) >= minGrade
        end
    elseif framework.name == 'esx' then
        local data = p.job
        if data and data.name == jobName then
            return (data.grade or 0) >= minGrade
        end
    end
    return false
end

---True if the player matches any `{ name=..., minGrade=? }` entry. An empty list returns true.
---@param source number player server id
---@param options { name: string, minGrade?: integer }[]
---@return boolean
function job.hasAny(source, options)
    if not options or #options == 0 then return true end
    for i = 1, #options do
        if job.has(source, options[i].name, options[i].minGrade or 0) then
            return true
        end
    end
    return false
end

---True when the player is currently on `jobName` and a boss of it: QBCore/QBox check the grade's
---`isboss` flag, ESX checks grade >= esxBossGrade. Fails closed when unresolvable. vRP checks the
---job's configured bossGroups or bossPermission, and with neither configured falls back to
---grade >= esxBossGrade, so an unconfigured vRP server gates company management exactly like ESX.
---@param source number player server id
---@param jobName string
---@param esxBossGrade? integer ESX boss-grade threshold, reused as the vRP fallback. Default 0.
---@return boolean
function job.isBoss(source, jobName, esxBossGrade)
    if vrp then return vrp.isBoss(source, jobName, esxBossGrade) end

    local p = player_mod.get(source)
    if not p then return false end

    if framework.qb then
        local data = p.PlayerData.job
        return data ~= nil and data.name == jobName and data.isboss == true
    elseif framework.name == 'esx' then
        local data = p.job
        return data ~= nil and data.name == jobName and (data.grade or 0) >= (esxBossGrade or 0)
    end
    return false
end

---Set the player's job through the framework's job system. Mutating; callers own the permission
---check. Returns the framework's own verdict on QBCore, always true on ESX.
---
---On vRP this adds the mapped rank group and lets vRP's own gtype exclusivity evict the previous
---rank. An UNMAPPED job name is a REVOKE there, not an error: society.fire() arrives here with
---configs/services.lua's 'unemployed', which no vRP server has a group for, and reporting a failed
---fire while leaving the employee's rank group attached would be a privilege leak.
---@param source number player server id
---@param jobName string
---@param grade? integer Default 0.
---@return boolean
function job.set(source, jobName, grade)
    if vrp then return vrp.setJob(source, jobName, grade or 0) end

    local p = player_mod.get(source)
    if not p then return false end
    grade = grade or 0

    if framework.qb then return p.Functions.SetJob(jobName, grade) end
    if framework.name == 'esx' then p.setJob(jobName, grade); return true end
    return false
end

---The player's current on-duty state via QBCore/QBox `job.onduty`. Nil on ESX or when the player
---can't be resolved. Nil on vRP too unless the job carries a dutyPermission or dutyGroup in
---configs/vrp.lua: vRP has no duty flag, and nil is the meaningful answer callers already read as
---"fall back to the phone's own stored duty preference".
---@param source number player server id
---@return boolean|nil
function job.getDuty(source)
    if vrp then return vrp.getDuty(source) end

    local p = player_mod.get(source)
    if not p then return nil end
    if framework.qb then
        return p.PlayerData.job ~= nil and p.PlayerData.job.onduty == true
    end
    return nil
end

---True when the framework supports a multi-job ("saved jobs") model (QBCore/QBox); false on ESX.
---
---False on vRP, and that is a deliberate refusal rather than a missing feature: getAll does report
---every job the player's groups qualify them for, but the Jobs tab lets a player SWITCH active job,
---and on vRP a switch is a live permission grant rather than a saved-job pointer. Letting someone
---self-grant police_chief because it appeared in their list would be privilege escalation.
---@return boolean
function job.supportsMultijob()
    if vrp then return vrp.supportsMultijob() end
    return framework.qb
end

---Every job the framework has assigned to this player, not just the active one. On QBox these
---live in the `player_groups` table and are surfaced on the player object as PlayerData.jobs
---(jobName -> grade level); plain QBCore and ESX have no multi-job model, so there it is just the
---active job. The active job is always included and always wins, since it carries the live grade.
---On vRP this is every configured job whose groups the player holds, which is real data because
---group membership is a set; it is reporting only, since supportsMultijob() is false there.
---@param source number player server id
---@return table<string, integer> jobs jobName -> grade level
function job.getAll(source)
    if vrp then return vrp.getAllJobs(source) end

    local out = {}
    local p = player_mod.get(source)
    if not p then return out end

    if framework.qb then
        local jobs = p.PlayerData and p.PlayerData.jobs
        if type(jobs) == 'table' then
            for name, grade in pairs(jobs) do
                if type(name) == 'string' then
                    -- QBox stores a bare grade level; tolerate a { level = n } shape too.
                    out[name] = type(grade) == 'table' and (tonumber(grade.level) or 0) or (tonumber(grade) or 0)
                end
            end
        end
    end

    local active = job.getName(source)
    if active then out[active] = job.getGrade(source) end
    return out
end

---Resolve a job's display label ('Police'): qb-core's Shared.Jobs first, then the pcall-guarded
---qbx_core GetJob export. Nil when unknown. Read-only. On vRP the label comes from the job's entry
---in configs/vrp.lua, since vRP has no label of its own to read.
---@param jobName string
---@return string|nil
function job.getLabel(jobName)
    if not jobName or jobName == '' then return nil end
    if vrp then return vrp.jobLabel(jobName) end
    if framework.qb then
        local def
        if framework.name == 'qbx' then
            pcall(function() def = exports.qbx_core:GetJob(jobName) end)
        end
        if not def and framework.core and framework.core.Shared and framework.core.Shared.Jobs then
            def = framework.core.Shared.Jobs[jobName]
        end
        if not def then pcall(function() def = exports.qbx_core:GetJob(jobName) end) end
        return def and def.label or nil
    end
    return nil
end

---Drive the player's on-duty state through QBCore/QBox SetJobDuty. A no-op returning false on
---ESX. On vRP it toggles the active job's configured dutyGroup, and returns false when the job has
---no dutyGroup or the player is on no configured job at all: duty is then unwritable, and reporting
---success would leave the UI showing a state vRP never took.
---@param source number player server id
---@param onDuty boolean
---@return boolean applied true when the framework applied it
function job.setDuty(source, onDuty)
    if vrp then
        local name = vrp.getJob(source)
        if not name then return false end
        return vrp.setDuty(source, name, onDuty == true)
    end

    local p = player_mod.get(source)
    if not p then return false end
    if framework.qb then
        p.Functions.SetJobDuty(onDuty == true)
        return true
    end
    return false
end

---Drop the player's framework membership of `jobName` via qbx_core's pcall-guarded
---RemovePlayerFromJob export. No-op on plain QBCore and ESX. True when the framework handled it.
---
---A no-op on vRP as well, and there it is complete rather than degraded: vRP holds no saved-job
---membership beside the active one, so the only thing to drop is the rank group the player is
---standing in, which job.set() already revokes on its way to the unemployed job. Every caller pairs
---the two, and the multi-job call sites are unreachable anyway with supportsMultijob() false.
---@param source number player server id
---@param jobName string
---@return boolean
function job.leave(source, jobName)
    if vrp then return false end
    if framework.name ~= 'qbx' then return false end
    local p = player_mod.get(source)
    local cid = p and p.PlayerData and p.PlayerData.citizenid
    if not cid then return false end
    local ok = pcall(function() exports.qbx_core:RemovePlayerFromJob(cid, jobName) end)
    return ok
end

return job
