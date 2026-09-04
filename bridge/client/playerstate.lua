---@type FrameworkInfo Framework detection (bridge.shared.framework): name ('qbx'|'qb'|'esx'|'ox') + live core handle.
local framework = require 'bridge.shared.framework'

---@type table Player-state module; the table returned at end of file. Answers whether the local
---player is restrained or incapacitated, which the phone gates itself on.
local playerstate = {}

---@type string[] Player state-bag keys cuff scripts write, checked in order. There is no agreed
---key: the qb family writes `ishandcuffed`, ESX forks write `handcuffed`, and several standalone
---scripts write `cuffed`, so all three are read rather than betting on one.
local CUFF_BAGS <const> = { 'ishandcuffed', 'handcuffed', 'cuffed', 'isHandcuffed' }

---@type string[] Player state-bag keys used for a downed (bleeding out / last stand) player.
local DOWN_BAGS <const> = { 'isdead', 'inlaststand', 'dead', 'isDead', 'laststand' }

---@type string[] Framework metadata fields marking a downed player.
local DOWN_META <const> = { 'isdead', 'inlaststand' }

---Reads the framework's player-data table, or nil before the player has loaded. Mirrors the
---resolution bridge.client.job does, so a framework added there is added here too.
---@return table|nil data
local function playerData()
    if framework.name == 'qbx' then
        local ok, data = pcall(function() return exports.qbx_core:GetPlayerData() end)
        return ok and data or nil
    end
    if framework.qb then
        if not framework.core then return nil end
        local ok, data = pcall(function() return framework.core.Functions.GetPlayerData() end)
        return ok and data or nil
    end
    if framework.name == 'esx' then
        if not framework.core then return nil end
        local ok, data = pcall(function() return framework.core.GetPlayerData() end)
        return ok and data or nil
    end
    return nil
end

---Whether any of the named keys is truthy on the local player's state bag.
---@param keys string[]
---@return boolean
local function anyBag(keys)
    local state = LocalPlayer and LocalPlayer.state
    if not state then return false end
    for i = 1, #keys do
        local ok, value = pcall(function() return state[keys[i]] end)
        if ok and value then return true end
    end
    return false
end

---Whether any of the named fields is truthy on the framework's player metadata.
---@param keys string[]
---@return boolean
local function anyMeta(keys)
    local data = playerData()
    local meta = type(data) == 'table' and data.metadata
    if type(meta) ~= 'table' then return false end
    for i = 1, #keys do
        if meta[keys[i]] then return true end
    end
    return false
end

---Whether the local player is currently restrained.
---
---Three sources are consulted because cuffing is not a framework feature: most scripts only write
---a state bag, some only set framework metadata, and a few cuff the ped properly. Reading one
---source silently misses every script that uses another.
---@return boolean cuffed
function playerstate.isCuffed()
    if anyBag(CUFF_BAGS) then return true end
    if anyMeta({ 'ishandcuffed' }) then return true end
    local ped = cache.ped
    return ped ~= nil and ped ~= 0 and IsPedCuffed(ped)
end

---Whether the local player is incapacitated: bleeding out, in last stand, or flagged dead by the
---framework while the ped itself is still alive.
---
---Deliberately NOT an `IsEntityDead` check. That one is true only once the ped is really dead,
---which is the tail of the state, whereas a downed player spends most of it alive and waiting on
---EMS. `configs/phone.lua` keeps the engine-level check under its own BlockWhileDead flag.
---@return boolean downed
function playerstate.isDowned()
    return anyBag(DOWN_BAGS) or anyMeta(DOWN_META)
end

return playerstate
