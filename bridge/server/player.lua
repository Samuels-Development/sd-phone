---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'

---@type table Player module; the table returned at end of file. Player resolution + identity
---helpers for the server bridge.
local player = {}

---Pick the framework's GetPlayer implementation once at module load; the unsupported fallback
---raises an error.
---@return fun(source: number): any|nil
local function chooseGet()
    if framework.name == 'qb' then
        return function(src) return framework.core.Functions.GetPlayer(src) end
    end
    if framework.name == 'esx' then
        return function(src) return framework.core.GetPlayerFromId(src) end
    end
    return function(src)
        error(('Unsupported framework — cannot resolve player for source %s'):format(src))
    end
end

---@type fun(source: number): any|nil Framework GetPlayer implementation, bound once at load.
local resolveGet = chooseGet()

---Resolve a framework-native player object for the given source. Nil when the source isn't a
---loaded player.
---@param source number player server id
---@return any|nil framework-specific player object
function player.get(source) return resolveGet(source) end

---Pick the framework's "extract identifier from player object" call once at module load.
---@return fun(p: any): string|nil
local function chooseIdentifier()
    if framework.name == 'qb' then
        return function(p) return p.PlayerData.citizenid end
    end
    if framework.name == 'esx' then
        return function(p) return p.identifier end
    end
    return function() return nil end
end

---@type fun(p: any): string|nil Identifier extractor, bound once at load.
local resolveIdentifier = chooseIdentifier()

---The player's persistent per-character identifier (citizenid on QBCore/QBox, identifier on ESX).
---Nil when offline.
---@param source number player server id
---@return string|nil
function player.getIdentifier(source)
    local p = resolveGet(source)
    return p and resolveIdentifier(p) or nil
end

---A friendly "First Last" name for the player; 'Unknown' when the player can't be resolved.
---@param source number player server id
---@return string
function player.getName(source)
    local p = resolveGet(source)
    if not p then return 'Unknown' end

    if framework.name == 'esx'  then return p.getName() end
    if framework.name == 'qb' then
        return ('%s %s'):format(p.PlayerData.charinfo.firstname, p.PlayerData.charinfo.lastname)
    end
    return 'Unknown'
end

---The player's current job name. Nil when unresolvable. Read-only.
---@param source number player server id
---@return string|nil
function player.getJob(source)
    local p = resolveGet(source)
    if not p then return nil end
    if framework.name == 'esx'  then return p.job and p.job.name or nil end
    if framework.name == 'qb' then return p.PlayerData.job and p.PlayerData.job.name or nil end
    return nil
end

---The player's current gang name. QBCore-only; always nil on ESX.
---@param source number player server id
---@return string|nil
function player.getGang(source)
    local p = resolveGet(source)
    if not p then return nil end
    if framework.name == 'qb' then return p.PlayerData.gang and p.PlayerData.gang.name or nil end
    return nil
end

---Find the currently-connected source for a citizenid via a scan over GetPlayers. Read-only.
---@param citizenid string
---@return number|nil source nil if offline
function player.getSourceByIdentifier(citizenid)
    if not citizenid or citizenid == '' then return nil end
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        if s and player.getIdentifier(s) == citizenid then return s end
    end
    return nil
end

---Build a `{ [citizenid] = source }` lookup of every currently-connected player in a single pass.
---Read-only.
---@return table<string, number>
function player.onlineCidMap()
    local out = {}
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        if s then
            local cid = player.getIdentifier(s)
            if cid then out[cid] = s end
        end
    end
    return out
end

return player
