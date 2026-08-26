---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework  = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod = require 'bridge.server.player'
---@type table|nil ox_core helpers (bridge.shared.oxcore); nil on every other framework.
local ox         = framework.name == 'ox' and require 'bridge.shared.oxcore' or nil
---@type table|nil ND_Core helpers (bridge.shared.ndcore); nil on every other framework.
local nd         = framework.name == 'nd' and require 'bridge.shared.ndcore' or nil

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
    if framework.qb then return p.PlayerData.job and p.PlayerData.job.name or nil end
    if framework.name == 'ox' then return (ox.groupByTypes(source, ox.jobTypes)) end
    if framework.name == 'nd' then return (nd.jobOf(p)) end
    return nil
end

---The player's current job grade level. Returns 0 when the player or grade can't be resolved.
---@param source number player server id
---@return integer
function job.getGrade(source)
    local p = player_mod.get(source)
    if not p then return 0 end
    if framework.name == 'esx'  then return p.job and p.job.grade or 0 end
    if framework.qb then
        return p.PlayerData.job and p.PlayerData.job.grade and p.PlayerData.job.grade.level or 0
    end
    if framework.name == 'ox' then
        local _, grade = ox.groupByTypes(source, ox.jobTypes)
        return grade
    end
    if framework.name == 'nd' then
        local _, rank = nd.jobOf(p)
        return rank
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
    elseif framework.name == 'ox' then
        -- Asked by name rather than by type: a player may hold a job group the phone does not
        -- treat as their active one, and holding it is what the gate is asking about.
        local grade = ox.call(source, 'getGroup', jobName)
        return type(grade) == 'number' and grade >= minGrade
    elseif framework.name == 'nd' then
        -- Asked by name rather than off the active job: ND is natively multi-group, and a player
        -- may hold a job group that is not the one currently marked active.
        local rank = nd.rankIn(p, jobName)
        return rank ~= nil and rank >= minGrade
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

    if framework.qb then
        local data = p.PlayerData.job
        return data ~= nil and data.name == jobName and data.isboss == true
    elseif framework.name == 'esx' then
        local data = p.job
        return data ~= nil and data.name == jobName and (data.grade or 0) >= (esxBossGrade or 0)
    elseif framework.name == 'ox' then
        -- ox_core has per-grade permissions rather than a boss flag, so there is nothing to read;
        -- the top grade of the group stands in, which is how QBCore's isboss behaves in practice.
        if not ox.topGradeIsBoss then return false end
        local grade = ox.call(source, 'getGroup', jobName)
        local top = ox.topGrade(jobName)
        return type(grade) == 'number' and top > 0 and grade >= top
    elseif framework.name == 'nd' then
        -- ND stores a real isBoss flag per rank in `nd_group_ranks`, so unlike ox_core there is
        -- nothing to approximate: the held rank either carries the flag or it does not.
        local held = nd.heldGroups(p)[jobName]
        if not held then return false end
        return nd.isBossRank(jobName, held.rank, held)
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

    if framework.qb then return p.Functions.SetJob(jobName, grade) end
    if framework.name == 'esx' then p.setJob(jobName, grade); return true end
    if framework.name == 'ox' then
        -- ox_core grades are 1-based and grade 0 removes the group, so a caller-defaulted 0 would
        -- silently fire the player instead of hiring them at the bottom rung.
        return ox.call(source, 'setGroup', jobName, grade > 0 and grade or 1) ~= false
    end
    if framework.name == 'nd' then
        -- ND ranks are 1-based, so a caller-defaulted 0 would ask for a rank that does not exist;
        -- setJob without keepGroup drops the previous job group, as every caller here expects.
        if type(p.setJob) ~= 'function' then return false end
        local ok, res = pcall(p.setJob, jobName, grade > 0 and grade or 1)
        return ok and res ~= nil and res ~= false
    end
    return false
end

---The player's current on-duty state via QBCore/QBox `job.onduty`. Nil when the player can't be
---resolved, and on ESX and ND, neither of which has a duty concept to read.
---@param source number player server id
---@return boolean|nil
function job.getDuty(source)
    local p = player_mod.get(source)
    if not p then return nil end
    if framework.qb then
        return p.PlayerData.job ~= nil and p.PlayerData.job.onduty == true
    end
    if framework.name == 'ox' then
        -- ox_core has no duty flag; the closest thing is which group is currently ACTIVE, so
        -- being on duty means the player's job group is the active one.
        local name = ox.groupByTypes(source, ox.jobTypes)
        if not name then return nil end
        return ox.call(source, 'get', 'activeGroup') == name
    end
    return nil
end

---True when the framework supports a multi-job ("saved jobs") model. QBCore/QBox keep saved jobs
---alongside an active one; ox_core and ND are natively multi-group, so a character simply holds
---several. False on ESX, which has no such model.
---@return boolean
function job.supportsMultijob()
    return framework.qb or framework.name == 'ox' or framework.name == 'nd'
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

    if framework.name == 'ox' then
        -- Every group the character holds, filtered to the configured job types: ox_core makes no
        -- distinction between an active job and a saved one, they are all just groups.
        for name, grade in pairs(ox.groups(source)) do
            local def = ox.group(name)
            if def and ox.isJobType(def.type) then out[name] = tonumber(grade) or 0 end
        end
        return out
    end

    if framework.name == 'nd' then
        -- Filtered on the group DEFINITION, never the isJob field on the character's own entry:
        -- that one marks their single ACTIVE job, so it would return exactly one job every time.
        for name, group in pairs(nd.heldGroups(p)) do
            if type(name) == 'string' and nd.isJobGroup(name) then
                out[name] = tonumber(group.rank) or 0
            end
        end
        return out
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
    if framework.name == 'ox' then
        local def = ox.group(jobName)
        return def and def.label or nil
    end
    if framework.name == 'nd' then
        local def = nd.group(jobName)
        return def and def.label or nil
    end
    return nil
end

---Drive the player's on-duty state through QBCore/QBox SetJobDuty. A no-op returning false on ESX
---and ND, neither of which has a duty state to drive.
---@param source number player server id
---@param onDuty boolean
---@return boolean applied true when the framework applied it
function job.setDuty(source, onDuty)
    local p = player_mod.get(source)
    if not p then return false end
    if framework.qb then
        p.Functions.SetJobDuty(onDuty == true)
        return true
    end
    if framework.name == 'ox' then
        local name = ox.groupByTypes(source, ox.jobTypes)
        if not name then return false end
        -- Clearing the active group is how ox_core expresses off duty.
        return ox.call(source, 'setActiveGroup', onDuty and name or nil) ~= false
    end
    return false
end

---Drop the player's framework membership of `jobName` via qbx_core's pcall-guarded
---RemovePlayerFromJob export. No-op on plain QBCore and ESX. True when the framework handled it.
---@param source number player server id
---@param jobName string
---@return boolean
function job.leave(source, jobName)
    if framework.name == 'ox' then
        -- Grade 0 is ox_core's own remove-from-group signal.
        return ox.call(source, 'setGroup', jobName, 0) ~= false
    end
    if framework.name == 'nd' then
        -- ND removes a group by name rather than by writing a sentinel rank, and clears the active
        -- job pointer itself when the group being dropped is the active one.
        local p = player_mod.get(source)
        if not p or type(p.removeGroup) ~= 'function' then return false end
        local ok, res = pcall(p.removeGroup, jobName)
        return ok and res ~= nil
    end
    if framework.name ~= 'qbx' then return false end
    local p = player_mod.get(source)
    local cid = p and p.PlayerData and p.PlayerData.citizenid
    if not cid then return false end
    local ok = pcall(function() exports.qbx_core:RemovePlayerFromJob(cid, jobName) end)
    return ok
end

return job
