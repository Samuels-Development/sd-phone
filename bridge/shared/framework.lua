---@class FrameworkInfo
---@field name 'qbx'|'qb'|'esx'|'ox' Detected framework identifier.
---@field qb boolean True for both QBox and QBCore, whose player objects share a shape. False on
---ox_core, which shares nothing with them - never use it as a stand-in for "not ESX".
---@field core any Live core object (QBCore's, or the ESX shared object). Nil on QBox and ox_core,
---neither of which has one: everything they need is a discrete export.

---Detects the running player framework and returns a populated FrameworkInfo, or nil when no
---supported framework is started. QBox is checked first so it is driven through its own exports
---rather than through the qb-core compatibility layer it provides. ox_core is checked before
---qb-core for the same reason, though it ships no compatibility layer to be caught by.
---@return FrameworkInfo|nil
local function detect()
    if GetResourceState('qbx_core') == 'started' then
        return { name = 'qbx', qb = true }
    end
    if GetResourceState('ox_core') == 'started' then
        return { name = 'ox', qb = false }
    end
    if GetResourceState('qb-core') == 'started' then
        return { name = 'qb', qb = true, core = exports['qb-core']:GetCoreObject() }
    end
    if GetResourceState('es_extended') == 'started' then
        return { name = 'esx', qb = false, core = exports['es_extended']:getSharedObject() }
    end
    return nil
end

---@type FrameworkInfo|nil Detection result; nil aborts the resource load below.
local info = detect()

if not info then
    error([[
        ^1CRITICAL ERROR: No supported framework detected!^0
        ^3This resource requires one of the following frameworks:^0
        - QBox (qbx_core)
        - ox_core
        - QBCore (qb-core)
        - ESX (es_extended)

        Please ensure your framework is started before this resource.
    ]])
end

print(('^2[SD-PHONE]^0 Framework detected: ^3%s^0'):format(info.name))

if info.name == 'ox' then
    print([[
^3[SD-PHONE] Running on ox_core.^0
^3Set the group types the phone should treat as jobs and gangs in configs/framework.lua.^0
^3Not yet wired: employee and owner NAMES come back blank in the Services roster, the MDT people^0
^3search and Homes offline lookups, and jail features stay off. Identity, cash and bank, jobs,^0
^3gangs and society balances all work.^0
^3Please report anything wrong at github.com/Samuels-Development/sd-phone/issues^0
    ]])
end

return info
