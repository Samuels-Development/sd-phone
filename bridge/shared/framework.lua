---@class FrameworkInfo
---@field name 'qbx'|'qb'|'esx'|'ox'|'nd' Detected framework identifier.
---@field qb boolean True for both QBox and QBCore, whose player objects share a shape. False on
---ox_core and ND, which share nothing with them - never use it as a stand-in for "not ESX".
---@field core any Live core object (QBCore's, or the ESX shared object). Nil on QBox, ox_core and
---ND, none of which has one: everything they need is a discrete export.

---Detects the running player framework and returns a populated FrameworkInfo, or nil when no
---supported framework is started. ND is checked first: it ships esx and qb compatibility shims,
---and while the `provide` lines that would alias them are commented out upstream (they "could
---interfere with resources checking if the resources are started"), checking ND first keeps this
---correct if that ever changes. QBox is checked before qb-core so it is driven through its own
---exports rather than through the qb-core compatibility layer it provides. ox_core is checked
---before qb-core for the same reason, though it ships no compatibility layer to be caught by.
---@return FrameworkInfo|nil
local function detect()
    if GetResourceState('ND_Core') == 'started' then
        return { name = 'nd', qb = false }
    end
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
        - ND (ND_Core)

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

if info.name == 'nd' then
    print([[
^3[SD-PHONE] Running on ND_Core.^0
^3Nothing to configure: ND names its jobs and gangs itself, through the isJob flag on nd_groups.^0
^3Not wired, because ND_Core has no such concept: COMPANY BALANCES (the Services app keeps its^0
^3roster, hiring and boss actions but shows no shared account), ON-DUTY state, and jail features.^0
^3Identity, cash and bank, jobs, gangs, boss grades, the MDT people and vehicle search, Garages,^0
^3Homes and the admin panel all work.^0
^3Please report anything wrong at github.com/Samuels-Development/sd-phone/issues^0
    ]])
end

return info
