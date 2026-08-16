---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx'|'vrp') + live core
---handle.
local framework  = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player_mod = require 'bridge.server.player'

---@type table Gang module; the table returned at end of file. QBCore/QBox gang lookups; every
---helper returns its zero/false default on ESX and on vRP, neither of which has a gang concept.
---vRP needs no branch of its own here: the framework.qb guard every helper already opens with is
---false there, so each one falls through to the same nil/0/false the ESX path returns.
local gang = {}

---The player's current gang name (QBCore only). Nil when unresolvable, or on ESX and vRP.
---@param source number player server id
---@return string|nil
function gang.getName(source)
    local p = player_mod.get(source)
    if not p then return nil end
    if framework.qb then return p.PlayerData.gang and p.PlayerData.gang.name or nil end
    return nil
end

---The player's current gang grade level (QBCore only). Returns 0 when the player or grade can't
---be resolved.
---@param source number player server id
---@return integer
function gang.getGrade(source)
    local p = player_mod.get(source)
    if not p then return 0 end
    if framework.qb then
        return p.PlayerData.gang and p.PlayerData.gang.grade and p.PlayerData.gang.grade.level or 0
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
