---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Pure cell-tower maths (shared.celltowers): level + capability thresholds.
local celltowers = require 'shared.celltowers'
---@type table Shared server helpers (server.util): rate limiting for the reported edge.
local util = require 'server.util'
---@type table Player bridge (bridge.server.player): citizenid lookup for the rate-limit key.
local player = require 'bridge.server.player'

---@type table Cell tower settings (configs/celltowers.lua).
local cfg = config.CellTowers or {}
---@type table[] Configured masts, empty while the system is switched off. Folding Enabled in
---here means every reading downstream treats a disabled system as a server with no masts.
local TOWERS = (cfg.Enabled == true and type(cfg.Towers) == 'table') and cfg.Towers or {}
---@type table Minimum level per capability.
local THRESHOLDS = type(cfg.Thresholds) == 'table' and cfg.Thresholds or {}
---@type integer Milliseconds a player must wait between honoured back-in-range reports.
local REPORT_WINDOW = 10000
---@type integer Reports honoured per window.
local REPORTS_PER_WINDOW = 1

---@type table Service module; the table returned at end of file.
local service = {}

---Authoritative service level for a player, from the server's own view of where they are. An
---unresolvable player reads as full service so an offline or mid-spawn target is never treated
---as being in a dead zone.
---@param source number|nil player server id
---@return number level 0..1
function service.levelFor(source)
    if #TOWERS == 0 or not source then return 1.0 end
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return 1.0 end
    local pos = GetEntityCoords(ped)
    if not pos then return 1.0 end
    return celltowers.level(pos.x, pos.y, TOWERS)
end

---The masts currently shaping service, as a fresh table. Empty while the system is switched off,
---which matches the full service every phone then has.
---@return table[] masts { tower: vector3, range: number }
function service.towers()
    return celltowers.list(TOWERS)
end

---@param source number|nil player server id
---@param capability string 'text' | 'call' | 'data'
---@return boolean
function service.allows(source, capability)
    if #TOWERS == 0 then return true end
    return celltowers.allows(service.levelFor(source), capability, THRESHOLDS)
end

---A client reporting it walked back into coverage. The level is re-derived here before anything
---acts on it, so a forged report releases nothing; the rate limit keeps a spamming client from
---driving repeated drains.
RegisterNetEvent('sd-phone:server:service:report', function()
    local source = source
    if not service.allows(source, 'text') then return end
    local cid = player.getIdentifier(source)
    if not cid then return end
    if not util.rateLimit(cid, 'service:report', REPORT_WINDOW, REPORTS_PER_WINDOW) then return end
    TriggerEvent('sd-phone:server:service:regained', source)
end)

---Authoritative service level for a player, 0..1.
---@param source number player server id
exports('getServiceLevel', function(source) return service.levelFor(source) end)

---The configured masts as { tower = vector3, range = number }, mirroring configs/celltowers.lua.
---Empty while the system is off. The lb-phone GetCellTowers export drops the ranges to match
---their shape; this one keeps them.
exports('getCellTowers', function() return service.towers() end)

---Whether a player can currently use a capability: 'text', 'call' or 'data' (default 'data').
---@param source number player server id
---@param capability string|nil
exports('hasService', function(source, capability)
    return service.allows(source, capability or 'data')
end)

return service
