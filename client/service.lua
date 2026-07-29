---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Pure cell-tower maths (shared.celltowers): level / bars / capability thresholds.
local celltowers = require 'shared.celltowers'
---@type table Wi-Fi (client.wifi): a joined network can carry what the masts will not. The
---dependency is one-way, so client.wifi must never require this file back.
local wifiClient = require 'client.wifi'

---@type table Cell tower settings (configs/celltowers.lua): towers, thresholds, bar cutoffs.
local cfg = config.CellTowers or {}
---@type table[] Configured masts, empty while the system is switched off. Folding Enabled in
---here means every reading downstream treats a disabled system as a server with no masts.
local TOWERS = (cfg.Enabled == true and type(cfg.Towers) == 'table') and cfg.Towers or {}
---@type number[] Ascending level cutoffs for the 0..4 bars.
local CUTOFFS = type(cfg.Bars) == 'table' and cfg.Bars or { 0.05, 0.25, 0.50, 0.75 }
---@type table Minimum level per capability.
local THRESHOLDS = type(cfg.Thresholds) == 'table' and cfg.Thresholds or {}
---@type integer Milliseconds between recomputes while the phone is on screen.
local TICK_MS = 1000

---@type table Service module; the table returned at end of file.
local service = {}

---@type number Last computed level, 0..1.
local currentLevel = 1.0
---@type integer Last pushed bar count.
local currentBars = celltowers.bars(1.0, CUTOFFS)
---@type boolean Whether data-backed apps are currently reachable.
local currentData = true
---@type integer|nil Bars forced by another resource (lb-phone SetServiceBars), or nil.
local barsOverride = nil
---@type boolean True while the phone is on screen; gates the tick entirely.
local phoneOpen = false

---Whether any mast is configured. False means the feature is off and every reading is full.
---@return boolean
function service.active()
    return #TOWERS > 0
end

---@return number level 0..1
function service.level()
    return currentLevel
end

---The masts currently shaping service, as a fresh table. Empty while the system is switched off,
---which matches the full service every phone then has.
---@return table[] masts { tower: vector3, range: number }
function service.towers()
    return celltowers.list(TOWERS)
end

---@return integer bars 0..4
function service.bars()
    return barsOverride or currentBars
end

---Whether a capability is possible right now, over either radio. A joined Wi-Fi network carrying
---it is enough on its own, so a dead zone with a router in it still works.
---@param capability string 'text' | 'call' | 'data'
---@return boolean
function service.allows(capability)
    if wifiClient.provides(capability) then return true end
    return celltowers.allows(currentLevel, capability, THRESHOLDS)
end

---Forces the displayed bars until cleared with nil. Display only: it never changes what the
---server allows.
---@param bars integer|nil
function service.setBarsOverride(bars)
    local n = tonumber(bars)
    barsOverride = n and math.floor(n) or nil
    if phoneOpen then
        SendNUIMessage({
            action = 'sd-phone:service',
            data   = { bars = service.bars(), level = currentLevel, data = currentData },
        })
    end
end

---Recomputes from the player's position and pushes to the NUI only when the displayed bars or
---the data verdict actually changed, so a stationary player costs one distance check a second
---and no messages at all.
---@param force boolean|nil push even when nothing changed (used on open)
local function refresh(force)
    local pos = GetEntityCoords(PlayerPedId())
    local level = celltowers.level(pos.x, pos.y, TOWERS)
    local bars  = celltowers.bars(level, CUTOFFS)
    local data  = celltowers.allows(level, 'data', THRESHOLDS)
    local regained = currentBars == 0 and bars > 0

    local changed = force or bars ~= currentBars or data ~= currentData
    currentLevel, currentBars, currentData = level, bars, data
    if not changed then return end

    SendNUIMessage({
        action = 'sd-phone:service',
        data   = { bars = service.bars(), level = level, data = data },
    })

    -- Walking back into coverage is the client's cue to ask for anything held while it was out.
    -- The server re-derives the level from its own coords before honouring this, so a forged
    -- report drains nothing.
    if regained or force then
        TriggerServerEvent('sd-phone:server:service:report')
    end
end

-- Only runs while the phone is on screen: a holstered phone costs nothing at all.
AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open == true
    if phoneOpen and service.active() then refresh(true) end
end)

CreateThread(function()
    if not service.active() then return end
    while true do
        Wait(TICK_MS)
        if phoneOpen then refresh(false) end
    end
end)

return service
