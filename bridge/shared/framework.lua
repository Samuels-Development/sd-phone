---@class FrameworkInfo
---@field name 'qb'|'esx' Detected framework identifier.
---@field core any Live core object (`exports['qb-core']:GetCoreObject()` or ESX shared object).

---Detects the running player framework and returns a populated FrameworkInfo, or nil when
---neither qb-core nor es_extended is started. QBox counts as 'qb'.
---@return FrameworkInfo|nil
local function detect()
    if GetResourceState('qb-core') == 'started' then
        return { name = 'qb', core = exports['qb-core']:GetCoreObject() }
    end
    if GetResourceState('es_extended') == 'started' then
        return { name = 'esx', core = exports['es_extended']:getSharedObject() }
    end
    return nil
end

---@type FrameworkInfo|nil Detection result; nil aborts the resource load below.
local info = detect()

if not info then
    error([[
        ^1CRITICAL ERROR: No supported framework detected!^0
        ^3This resource requires one of the following frameworks:^0
        - QBCore (qb-core)
        - ESX (es_extended)

        Please ensure your framework is started before this resource.
    ]])
end

print(('^2[SD-PHONE]^0 Framework detected: ^3%s^0'):format(info.name))

return info
