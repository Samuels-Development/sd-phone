---@type FrameworkInfo Framework detection (bridge.shared.framework): name ('qbx'|'qb'|'esx'|'vrp').
local framework = require 'bridge.shared.framework'

---@type table|nil Player bridge (bridge.server.player). Required on vRP only: player.lua subscribes
---to the qb/esx character edges itself, and gating the require keeps every other boot free of a
---dependency between the two most-required modules in the server bridge.
local player_mod = framework.name == 'vrp' and require 'bridge.server.player' or nil

---@type table Lifecycle module; the table returned at end of file. The single owner of the
---framework character-load/unload event NAMES on the server, so subscribers stop carrying a
---per-framework AddEventHandler block that has to grow a branch for every new framework.
local lifecycle = {}

---@type 1|2|nil vRP lineage in play; nil on every other framework. Read defensively because
---framework.vrp only exists once the vRP detection branch is live, and an unknown fork is treated
---as vRP 2 for the same reason bridge/shared/vrp_version.lua defaults that way: vRP 2's relay is
---self-verifying, a wrong guess of 1 would silently subscribe to events nothing ever fires.
local vrpMajor = framework.name == 'vrp' and (framework.vrp and framework.vrp.major == 1 and 1 or 2) or nil

---@type fun(source: number)[] Fired once a character has finished loading on that source.
local loadedListeners = {}

---@type fun(source: number)[] Fired as the character on that source goes away.
local unloadedListeners = {}

---Notify one listener list. Every callback is pcall'd because these run on the framework's own
---event thread: one subscriber raising must not stop the remaining subscribers from ever seeing
---the edge, which on a load event would leave whole features unreconciled for the session.
---@param list fun(source: number)[]
---@param source number player server id
local function fire(list, source)
    for i = 1, #list do
        local ok, err = pcall(list[i], source)
        if not ok then
            print(('^1[sd-phone:lifecycle]^0 handler error: %s'):format(err))
        end
    end
end

---Pick the "payload -> server id" normaliser once at module load. QBCore and QBox hand the whole
---player object to PlayerLoaded while handing a bare source to OnPlayerUnload; ESX and the vRP
---relay always hand a bare source.
---@return fun(payload: any): number|nil
local function chooseSourceOf()
    if framework.qb then
        return function(payload)
            if type(payload) == 'table' then
                local data = payload.PlayerData
                return data and tonumber(data.source) or nil
            end
            return tonumber(payload)
        end
    end
    return function(payload) return tonumber(payload) end
end

---@type fun(payload: any): number|nil Payload normaliser, bound once at load.
local sourceOf = chooseSourceOf()

---Subscribe to "a character finished loading for this source". Fires on QBCore/QBox's
---PlayerLoaded, ESX's playerLoaded, and - on vRP - the adapter's own relay: vRP 1's
---vRP:playerSpawn with first_spawn, and vRP 2's characterLoad, which also fires on a mid-session
---character switch with no reconnect. Listeners live for the resource's lifetime.
---@param cb fun(source: number)
function lifecycle.onCharacterLoaded(cb)
    if type(cb) ~= 'function' then return end
    loadedListeners[#loadedListeners + 1] = cb
end

---Subscribe to "the character on this source is going away". QBCore/QBox OnPlayerUnload, ESX
---playerLogout, vRP 1 vRP:playerLeave, vRP 2 characterUnload. Never fires for a plain disconnect
---on frameworks that do not emit one - `playerDropped` remains the caller's responsibility.
---@param cb fun(source: number)
function lifecycle.onCharacterUnloaded(cb)
    if type(cb) ~= 'function' then return end
    unloadedListeners[#unloadedListeners + 1] = cb
end

---Handle a vRP character edge: drop the cached identity, tell the client (vRP is the only
---framework whose client sees no load event of its own), then notify subscribers. The identity
---drop is what makes vRP 2's mid-session User:useCharacter switch safe - the source is unchanged
---while the character behind it is not, so a stale cache would serve the previous character's
---data for the length of its TTL.
---@param source number|nil player server id
---@param loaded boolean true for the load edge, false for the unload edge
local function vrpEdge(source, loaded)
    local src = tonumber(source)
    if not src or src <= 0 then return end

    if player_mod then player_mod.forget(src) end

    TriggerClientEvent(
        loaded and 'sd-phone:client:vrp:characterLoaded' or 'sd-phone:client:vrp:characterUnloaded',
        src
    )
    fire(loaded and loadedListeners or unloadedListeners, src)
end

-- The framework subscription itself: chosen once here, so no consumer ever branches on a
-- framework name again. On qb/esx these are the same names the individual call sites used before
-- this module existed, and framework.qb covers QBox, which several of those sites did not.
if framework.qb then
    AddEventHandler('QBCore:Server:PlayerLoaded', function(p)
        local src = sourceOf(p)
        if src then fire(loadedListeners, src) end
    end)
    AddEventHandler('QBCore:Server:OnPlayerUnload', function(payload)
        local src = sourceOf(payload)
        if src then fire(unloadedListeners, src) end
    end)
elseif framework.name == 'esx' then
    AddEventHandler('esx:playerLoaded', function(playerId)
        local src = sourceOf(playerId)
        if src then fire(loadedListeners, src) end
    end)
    AddEventHandler('esx:playerLogout', function(playerId)
        local src = sourceOf(playerId)
        if src then fire(unloadedListeners, src) end
    end)
elseif vrpMajor == 1 then
    -- vRP 1 has no characters, so the load edge is the first spawn. vRP:playerSpawn also fires on
    -- every death respawn with first_spawn false, hence the flag test; and vRP:playerRejoin is
    -- deliberately NOT used - it fires inside playerConnecting's deferral with no usable ped, and
    -- it zeroes tmp.spawns so the reconnecting player's next spawn re-fires anyway. Subscribing to
    -- both would run every listener twice on a crash-reconnect. These arrive by same-side
    -- TriggerEvent from the vrp resource, so AddEventHandler is correct and RegisterNetEvent would
    -- only open them to spoofing from a client.
    AddEventHandler('vRP:playerSpawn', function(_, src, firstSpawn)
        if firstSpawn == true then vrpEdge(src, true) end
    end)
    AddEventHandler('vRP:playerLeave', function(_, src)
        vrpEdge(src, false)
    end)
elseif vrpMajor == 2 then
    -- Relayed out of vRP 2's own Lua state by vrp/ext.lua, again as a server-side TriggerEvent.
    AddEventHandler('sd-phone:vrp:characterLoad', function(src)
        vrpEdge(src, true)
    end)
    AddEventHandler('sd-phone:vrp:characterUnload', function(src)
        vrpEdge(src, false)
    end)
end

return lifecycle
