---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework  = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod = require 'bridge.server.player'

---@type table Job module; the table returned at end of file. Job identity/permission primitives
---for the server bridge.
local job = {}

---The player's current job name, read live from the framework player object. Nil when the player
---can't be resolved or the framework path yields nothing.
---@param source number player server id
---@return string|nil
function job.getName(source)
    local p = player_mod.get(source)
    if not p then return nil end
    if framework.name == 'esx'  then return p.job and p.job.name or nil end
    if framework.name == 'qb' then return p.PlayerData.job and p.PlayerData.job.name or nil end
    return nil
end

---The player's current job grade level. Returns 0 when the player or grade can't be resolved.
---@param source number player server id
---@return integer
function job.getGrade(source)
    local p = player_mod.get(source)
    if not p then return 0 end
    if framework.name == 'esx'  then return p.job and p.job.grade or 0 end
    if framework.name == 'qb' then
        return p.PlayerData.job and p.PlayerData.job.grade and p.PlayerData.job.grade.level or 0
    end
    return 0
end

---Predicate: does the player currently hold `jobName` at grade >= `minGrade`? Checks the active
---job only; fails closed when the player can't be resolved.
---@param source number player server id
---@param jobName string
---@param minGrade? integer Default 0.
---@return boolean
function job.has(source, jobName, minGrade)
    minGrade = minGrade or 0
    local p = player_mod.get(source)
    if not p then return false end

    if framework.name == 'qb' then
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
---`isboss` flag, ESX checks grade >= esxBossGrade. Fails closed when unresolvable.
---@param source number player server id
---@param jobName string
---@param esxBossGrade? integer ESX boss-grade threshold. Default 0.
---@return boolean
function job.isBoss(source, jobName, esxBossGrade)
    local p = player_mod.get(source)
    if not p then return false end

    if framework.name == 'qb' then
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
---@param source number player server id
---@param jobName string
---@param grade? integer Default 0.
---@return boolean
function job.set(source, jobName, grade)
    local p = player_mod.get(source)
    if not p then return false end
    grade = grade or 0

    if framework.name == 'qb' then return p.Functions.SetJob(jobName, grade) end
    if framework.name == 'esx' then p.setJob(jobName, grade); return true end
    return false
end

---The player's current on-duty state via QBCore/QBox `job.onduty`. Nil on ESX or when the player
---can't be resolved.
---@param source number player server id
---@return boolean|nil
function job.getDuty(source)
    local p = player_mod.get(source)
    if not p then return nil end
    if framework.name == 'qb' then
        return p.PlayerData.job ~= nil and p.PlayerData.job.onduty == true
    end
    return nil
end

---True when the framework supports a multi-job ("saved jobs") model (QBCore/QBox); false on ESX.
---@return boolean
function job.supportsMultijob()
    return framework.name == 'qb'
end

---Every job the framework has assigned to this player, not just the active one. On QBox these
---live in the `player_groups` table and are surfaced on the player object as PlayerData.jobs
---(jobName -> grade level); plain QBCore and ESX have no multi-job model, so there it is just the
---active job. The active job is always included and always wins, since it carries the live grade.
---@param source number player server id
---@return table<string, integer> jobs jobName -> grade level
function job.getAll(source)
    local out = {}
    local p = player_mod.get(source)
    if not p then return out end

    if framework.name == 'qb' then
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
---qbx_core GetJob export. Nil when unknown. Read-only.
---@param jobName string
---@return string|nil
function job.getLabel(jobName)
    if not jobName or jobName == '' then return nil end
    if framework.name == 'qb' then
        local def
        if framework.core and framework.core.Shared and framework.core.Shared.Jobs then
            def = framework.core.Shared.Jobs[jobName]
        end
        if not def then pcall(function() def = exports.qbx_core:GetJob(jobName) end) end
        return def and def.label or nil
    end
    return nil
end

---Drive the player's on-duty state through QBCore/QBox SetJobDuty. A no-op returning false on
---ESX.
---@param source number player server id
---@param onDuty boolean
---@return boolean applied true when the framework applied it
function job.setDuty(source, onDuty)
    local p = player_mod.get(source)
    if not p then return false end
    if framework.name == 'qb' then
        p.Functions.SetJobDuty(onDuty == true)
        return true
    end
    return false
end

---Drop the player's framework membership of `jobName` via qbx_core's pcall-guarded
---RemovePlayerFromJob export. No-op on plain QBCore and ESX. True when the framework handled it.
---@param source number player server id
---@param jobName string
---@return boolean
function job.leave(source, jobName)
    if framework.name ~= 'qb' then return false end
    local p = player_mod.get(source)
    local cid = p and p.PlayerData and p.PlayerData.citizenid
    if not cid then return false end
    local ok = pcall(function() exports.qbx_core:RemovePlayerFromJob(cid, jobName) end)
    return ok
end

return job
