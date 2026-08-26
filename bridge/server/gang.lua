---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx'|'ox'|'nd') + live core handle.
local framework  = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod = require 'bridge.server.player'
---@type table|nil ox_core helpers (bridge.shared.oxcore); nil on every other framework.
local ox         = framework.name == 'ox' and require 'bridge.shared.oxcore' or nil
---@type table|nil ND_Core helpers (bridge.shared.ndcore); nil on every other framework.
local nd         = framework.name == 'nd' and require 'bridge.shared.ndcore' or nil

---@type table Gang module; the table returned at end of file. QBCore/QBox gang lookups, on ox_core
---the groups typed in configs/framework.lua GangTypes and on ND the groups `nd_groups` does not
---define as jobs; every helper returns its zero/false default on ESX, which has no gangs.
local gang = {}

---The player's current gang name. Nil when unresolvable or on ESX.
---@param source number player server id
---@return string|nil
function gang.getName(source)
    local p = player_mod.get(source)
    if not p then return nil end
    if framework.qb then return p.PlayerData.gang and p.PlayerData.gang.name or nil end
    if framework.name == 'ox' then return (ox.groupByTypes(source, ox.gangTypes)) end
    if framework.name == 'nd' then return (nd.gangOf(p)) end
    return nil
end

---The player's current gang grade level. Returns 0 when the player or grade can't be resolved.
---@param source number player server id
---@return integer
function gang.getGrade(source)
    local p = player_mod.get(source)
    if not p then return 0 end
    if framework.qb then
        return p.PlayerData.gang and p.PlayerData.gang.grade and p.PlayerData.gang.grade.level or 0
    end
    if framework.name == 'ox' then
        local _, grade = ox.groupByTypes(source, ox.gangTypes)
        return grade
    end
    if framework.name == 'nd' then
        local _, rank = nd.gangOf(p)
        return rank
    end
    return 0
end

---Predicate: does the player hold `gangName` at grade >= `minGrade`? Fails closed (false) when
---the player can't be resolved or the framework has no gangs.
---@param source number player server id
---@param gangName string
---@param minGrade? integer Default 0.
---@return boolean
function gang.has(source, gangName, minGrade)
    minGrade = minGrade or 0
    local p = player_mod.get(source)
    if not p then return false end

    if framework.qb then
        local data = p.PlayerData.gang
        if data and data.name == gangName then
            return (data.grade and data.grade.level or 0) >= minGrade
        end
    elseif framework.name == 'ox' then
        -- By name, like job.has: holding the group is the question, not whether it is active.
        local grade = ox.call(source, 'getGroup', gangName)
        return type(grade) == 'number' and grade >= minGrade
    elseif framework.name == 'nd' then
        -- By name for the same reason, and only for a group ND does NOT define as a job: a gate
        -- asking about a gang must not unlock for a player who happens to hold a job of that name.
        if not nd.isJobGroup(gangName) then
            local rank = nd.rankIn(p, gangName)
            return rank ~= nil and rank >= minGrade
        end
    end
    return false
end

---True if the player matches any `{ name=..., minGrade=? }` entry. An empty list returns true.
---@param source number player server id
---@param options { name: string, minGrade?: integer }[]
---@return boolean
function gang.hasAny(source, options)
    if not options or #options == 0 then return true end
    for i = 1, #options do
        if gang.has(source, options[i].name, options[i].minGrade or 0) then
            return true
        end
    end
    return false
end

return gang
