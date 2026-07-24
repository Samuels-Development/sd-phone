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

---@type integer Milliseconds a cached identifier is served before it is re-resolved. The
---lifecycle handlers below keep the cache exact; this is only the backstop that stops a missed
---event from being permanent.
local IDENTITY_TTL = 2000

---@type table<number, { cid: string|nil, at: number }> source -> resolved framework identifier.
local identityCache = {}

---@type table<string, number> identifier -> source. The reverse of identityCache, so resolving a
---source from an identifier is a lookup instead of a walk over every connected player. Treated
---as a hint, never as truth: a lookup verifies its answer and falls back to the scan.
local sourceIndex = {}

---@type integer Bumped by forget(); the built-map memo below only serves a value stamped with
---the current generation, so any lifecycle event invalidates it immediately.
local generation = 0

---Framework identifier for a source, memoised. Resolving it is the most frequent framework call
---in the resource (227 call sites; nearly every callback opens with one, and the cid -> source
---maps resolve it once per connected player). Only the identifier STRING is cached, never the
---player object: the object carries live money/job state, the identifier does not change for the
---lifetime of a loaded character.
---@param source number player server id
---@return string|nil
local function cachedIdentifier(source)
    local hit = identityCache[source]
    if hit and (GetGameTimer() - hit.at) < IDENTITY_TTL then return hit.cid end
    local p = resolveGet(source)
    local cid = p and resolveIdentifier(p) or nil
    identityCache[source] = { cid = cid, at = GetGameTimer() }
    if cid then sourceIndex[cid] = source end
    return cid
end

---Drops a source's cached identifier so the next read re-resolves it. Called on disconnect and
---on every character load/unload: after a multichar switch the same source carries a DIFFERENT
---character, and serving the previous one would hand the player the old character's data.
---@param source number|nil player server id
function player.forget(source)
    local s = tonumber(source) or source
    if not s then return end
    local hit = identityCache[s]
    -- Only clear the reverse entry if it still points here: an identifier that has already moved
    -- to another source belongs to that source now.
    if hit and hit.cid and sourceIndex[hit.cid] == s then sourceIndex[hit.cid] = nil end
    identityCache[s] = nil
    generation = generation + 1
end

AddEventHandler('playerDropped', function() player.forget(source) end)

-- Character lifecycle: both edges matter. Load clears a negative entry cached while the player
-- was still connecting; unload clears the outgoing character before the next one is resolved.
if framework.name == 'qb' then
    AddEventHandler('QBCore:Server:PlayerLoaded', function(p)
        player.forget(p and p.PlayerData and p.PlayerData.source)
    end)
    AddEventHandler('QBCore:Server:OnPlayerUnload', function(src) player.forget(src) end)
elseif framework.name == 'esx' then
    AddEventHandler('esx:playerLoaded', function(src) player.forget(src) end)
    AddEventHandler('esx:playerLogout', function(src) player.forget(src) end)
end

---The player's persistent per-character identifier (citizenid on QBCore/QBox, identifier on ESX).
---Nil when offline. NOTE: when unique phones are enabled, server/sim/init.lua rewraps this to
---return the acting SIM identity instead - use getRealIdentifier for character-scoped concerns.
---@param source number player server id
---@return string|nil
function player.getIdentifier(source)
    return cachedIdentifier(source)
end

---Always the framework-native character identifier, bypassing any SIM indirection installed
---over getIdentifier. Nil when offline.
---@param source number player server id
---@return string|nil
function player.getRealIdentifier(source)
    return cachedIdentifier(source)
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

---Resolves a source from an identifier: an indexed lookup when the index knows it, otherwise the
---scan, which repairs the index on the way out. The index is only ever a hint - the answer is
---verified against a still-connected player whose identifier still matches - so a lifecycle event
---this module never saw costs one scan rather than a wrong or missing answer.
---@param citizenid string
---@return number|nil source
local function sourceFor(citizenid)
    local hit = sourceIndex[citizenid]
    if hit and GetPlayerName(hit) and cachedIdentifier(hit) == citizenid then return hit end

    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        if s and cachedIdentifier(s) == citizenid then
            sourceIndex[citizenid] = s
            return s
        end
    end
    sourceIndex[citizenid] = nil
    return nil
end

---Find the currently-connected source for a citizenid. Read-only.
---@param citizenid string
---@return number|nil source nil if offline
function player.getSourceByIdentifier(citizenid)
    if not citizenid or citizenid == '' then return nil end
    return sourceFor(citizenid)
end

---Reachability resolver: the source carrying `citizenid` on ANY phone, not just the active one.
---Identical to getSourceByIdentifier until unique phones wraps the two apart (calls ring a
---pocketed phone; live UI pushes only land on the active one).
---@param citizenid string|nil
---@return number|nil source
function player.getAnySourceByIdentifier(citizenid)
    if not citizenid or citizenid == '' then return nil end
    return sourceFor(citizenid)
end

---@type { map: table<string, number>|nil, at: number, gen: number } Memo of the built map. A
---fan-out builds this per push, so on a busy server the same table was rebuilt many times a
---second from an unchanged player list.
local cidMapCache = { map = nil, at = 0, gen = -1 }

---Builds `{ [citizenid] = source }` over every connected player, memoised until any lifecycle
---event bumps the generation or the TTL expires. The returned table is SHARED - callers must
---treat it as read-only, which every caller already does.
---@return table<string, number>
local function buildCidMap()
    if cidMapCache.map and cidMapCache.gen == generation
        and (GetGameTimer() - cidMapCache.at) < IDENTITY_TTL then
        return cidMapCache.map
    end
    local out = {}
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        if s then
            local cid = cachedIdentifier(s)
            if cid then out[cid] = s end
        end
    end
    cidMapCache = { map = out, at = GetGameTimer(), gen = generation }
    return out
end

---`{ [citizenid] = source }` over framework-native identifiers, bypassing SIM indirection.
---Read-only; the table is shared with onlineCidMap.
---@return table<string, number>
function player.onlineRealCidMap()
    return buildCidMap()
end

---A `{ [citizenid] = source }` lookup of every currently-connected player. Read-only.
---@return table<string, number>
function player.onlineCidMap()
    return buildCidMap()
end

return player
