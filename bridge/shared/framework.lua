---@class FrameworkInfo
---@field name 'qbx'|'qb'|'esx'|'vrp' Detected framework identifier.
---@field qb boolean True for both QBox and QBCore, whose player objects share a shape.
---@field core any Live core object (QBCore's, or the ESX shared object). Nil on QBox, which has
---no core object: everything it needs is a discrete qbx_core export, and nil on vRP, which is
---reached over its own Proxy rather than through a shared object.
---@field vrp VrpVersion|nil vRP lineage and adapter config, as bridge.shared.vrp_version resolved
---it. Nil on every other framework, so `framework.vrp and framework.vrp.major` is the only safe
---way to read the lineage.

---Detects the running player framework and returns a populated FrameworkInfo, or nil when no
---supported framework is started. QBox is checked first so it is driven through its own exports
---rather than through the qb-core compatibility layer it provides. vRP is checked LAST, so a
---server running vrp alongside a real framework is still driven by that framework, and so the vRP
---lineage probe is only ever loaded on a server that actually runs vRP.
---@return FrameworkInfo|nil
local function detect()
    if GetResourceState('qbx_core') == 'started' then
        return { name = 'qbx', qb = true }
    end
    if GetResourceState('qb-core') == 'started' then
        return { name = 'qb', qb = true, core = exports['qb-core']:GetCoreObject() }
    end
    if GetResourceState('es_extended') == 'started' then
        return { name = 'esx', qb = false, core = exports['es_extended']:getSharedObject() }
    end
    if GetResourceState('vrp') == 'started' then
        ---@type VrpVersion Lineage probe (bridge.shared.vrp_version); also the sole owner of
        ---configs/vrp.lua. Required here rather than at file scope because this line is the one
        ---place that already knows vRP is the framework in play.
        local ver = require 'bridge.shared.vrp_version'
        return { name = 'vrp', qb = false, vrp = ver }
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
        - QBCore (qb-core)
        - ESX (es_extended)
        - vRP (vrp)

        Please ensure your framework is started before this resource.
    ]])
end

print(('^2[SD-PHONE]^0 Framework detected: ^3%s^0'):format(info.name))

return info
