---@type table sd-phone config root (configs/config.lua); read for the MDT jail overrides.
local config    = require 'configs.config'
---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): framework-native player object resolution.
local player    = require 'bridge.server.player'

---@type table Jail module; the table returned at end of file. The one capability sd-phone has no
---abstraction for, so it degrades to "no jail installed" rather than throwing.
local jail = {}

---@type table MDT jail settings (configs/mdt.lua Jail); Resource may name a prison resource.
local JAIL = (config.Mdt or {}).Jail or {}

---@type integer Real seconds one MDT month is worth when a prison counts in seconds or minutes.
local SECONDS_PER_MONTH = math.max(1, math.floor(tonumber(JAIL.SecondsPerMonth) or 60))

---@type string Unit override for the detected prison; 'auto' trusts the adapter's own declaration.
local UNIT_OVERRIDE = type(JAIL.TimeUnit) == 'string' and JAIL.TimeUnit or 'auto'

---Converts an MDT sentence in months into whatever unit the target prison counts in.
---@param months integer
---@param unit 'months'|'minutes'|'seconds'
---@return integer
local function inUnit(months, unit)
    local target = UNIT_OVERRIDE ~= 'auto' and UNIT_OVERRIDE or unit
    if target == 'seconds' then return months * SECONDS_PER_MONTH end
    if target == 'minutes' then return math.max(1, math.floor(months * SECONDS_PER_MONTH / 60)) end
    return months
end

---@type table[] Prison adapters probed in order. `unit` is what that script's own API counts in,
---which is NOT the same across them: qb-prison takes months, esx_jail and qb-policejob take seconds.
---`apply` receives the target, the sentence in that unit, and the booking officer's server id, which
---most scripts have no use for.
local ADAPTERS = {
    {
        resource = 'qbx_prison',
        unit     = 'months',
        apply    = function(source, time)
            return pcall(function() return exports.qbx_prison:JailPlayer(source, time) end)
        end,
    },
    {
        resource = 'qb-prison',
        unit     = 'months',
        apply    = function(source, time)
            TriggerClientEvent('prison:client:Enter', source, time)
            return true
        end,
    },
    {
        resource = 'xt-prison',
        unit     = 'months',
        apply    = function(source, time)
            return pcall(function() return exports['xt-prison']:JailPlayer(source, time) end)
        end,
    },
    {
        resource = 'p_policejob',
        unit     = 'minutes',
        ---pScripts Police Job v3 wants the booking officer as well as the target, so a sentence with
        ---no officer behind it is refused here rather than credited to nobody.
        apply    = function(source, time, officer)
            if not officer then return false end
            return pcall(function() return exports['p_policejob']:sendToJail(officer, source, time, 'MDT booking', false) end)
        end,
    },
    {
        resource = 'pickle_prisons',
        unit     = 'seconds',
        apply    = function(source, time)
            return pcall(function() return exports.pickle_prisons:JailPlayer(source, time) end)
        end,
    },
    {
        resource = 'tk_jail',
        unit     = 'minutes',
        apply    = function(source, time)
            return pcall(function() return exports.tk_jail:jail(source, time) end)
        end,
    },
    {
        resource = 'esx_tk_jail',
        unit     = 'minutes',
        apply    = function(source, time)
            return pcall(function() return exports.esx_tk_jail:jail(source, time) end)
        end,
    },
    {
        resource = 'qb-policejob',
        unit     = 'seconds',
        apply    = function(source, time)
            return pcall(function() return exports['qb-policejob']:JailPlayer(source, time, 'MDT booking') end)
        end,
    },
    {
        resource = 'ps-policejob',
        unit     = 'seconds',
        apply    = function(source, time)
            return pcall(function() return exports['ps-policejob']:JailPlayer(source, time, 'MDT booking') end)
        end,
    },
    {
        resource = 'esx_jail',
        unit     = 'seconds',
        apply    = function(source, time)
            TriggerEvent('esx_jail:sendToJail', source, time, true)
            return true
        end,
    },
    {
        resource = 'esx-qalle-jail',
        unit     = 'minutes',
        apply    = function(source, time)
            TriggerEvent('esx-qalle-jail:jailPlayer', source, time)
            return true
        end,
    },
    {
        resource = 'rcore_prison',
        unit     = 'minutes',
        apply    = function(source, time)
            return pcall(function() return exports.rcore_prison:JailPlayer(source, time) end)
        end,
    },
}

---Resolve the running prison adapter: an explicit config override wins, otherwise the first
---candidate whose resource reports `started`.
---@return table|nil adapter
local function detect()
    local override = JAIL.Resource
    if type(override) == 'string' and override ~= '' and override ~= 'auto' then
        for i = 1, #ADAPTERS do
            if ADAPTERS[i].resource == override then
                return GetResourceState(override) == 'started' and ADAPTERS[i] or nil
            end
        end
        return nil
    end
    for i = 1, #ADAPTERS do
        if GetResourceState(ADAPTERS[i].resource) == 'started' then return ADAPTERS[i] end
    end
    return nil
end

---@type table|nil Active prison adapter, resolved once at load.
local ACTIVE = detect()

---Whether this server can actually imprison anyone: a detected prison resource, or the QBCore /
---QBox metadata path that qb-policejob's own jail cell reads.
---@return boolean
function jail.available()
    return ACTIVE ~= nil or framework.qb == true
end

---Resource name of the detected prison system, nil when there is none.
---@return string|nil
function jail.system()
    return ACTIVE and ACTIVE.resource or nil
end

---Write the QBCore / QBox jail metadata the framework's own prison scripts read on spawn.
---@param source integer target player server id
---@param months integer sentence length
local function writeMetadata(source, months)
    if not framework.qb then return end
    local p = player.get(source)
    if not p or not p.Functions or not p.Functions.SetMetaData then return end
    p.Functions.SetMetaData('injail', months)
    p.Functions.SetMetaData('criminalrecord', { hasRecord = true, date = os.date('%Y-%m-%d %H:%M:%S') })
end

---Imprison an online player for `months`. False when nothing on this server can serve a sentence,
---so the caller can fall back to a fine instead of failing the whole booking.
---@param source integer target player server id
---@param months integer sentence length in months
---@param officer integer|nil booking officer's server id, for prisons that record who sentenced
---@return boolean sentenced
function jail.sendToJail(source, months, officer)
    local time = math.floor(tonumber(months) or 0)
    if time < 1 then return false end
    if not source or not GetPlayerName(source) then return false end

    if ACTIVE then
        local ok = ACTIVE.apply(source, inUnit(time, ACTIVE.unit), officer)
        if ok ~= false then
            writeMetadata(source, time)
            return true
        end
    end

    if not framework.qb then return false end

    writeMetadata(source, time)
    TriggerClientEvent('prison:client:Enter', source, time)
    return true
end

if ACTIVE then
    print(('^2[sd-phone]^0 MDT jail bridge using %s (sentences sent in %s).')
        :format(ACTIVE.resource, UNIT_OVERRIDE ~= 'auto' and UNIT_OVERRIDE or ACTIVE.unit))
end

return jail
