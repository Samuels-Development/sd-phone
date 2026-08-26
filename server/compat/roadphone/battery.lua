---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---The cosmetic battery percentage sd-phone publishes on a player's state bag. A player whose phone
---has not reported yet reads as full, which is what the phone itself shows.
---@param src number player server id
---@return number level 0-100
local function level(src)
    local reading = tonumber(Player(src).state.batteryLevel)
    if not reading then return 100 end
    return math.max(0, math.min(100, math.floor(reading)))
end

---getBatteryLevel(source): the phone's battery percentage. Read from the phoneOpen/batteryLevel
---state bag sd-phone already publishes, so this is the same number the status bar is showing.
registerExport('getBatteryLevel', function(source)
    local src = shim.source(source)
    return src and level(src) or 100
end)

---isBatteryDead(source): whether the phone is flat.
registerExport('isBatteryDead', function(source)
    local src = shim.source(source)
    return src ~= nil and level(src) == 0
end)

---setBatteryLevel(source, level): RoadPhone answers with the level after clamping. sd-phone's
---battery is a display counter the client drains while the phone is open, with nothing durable
---behind it, so the request is reported back clamped and the phone keeps its own reading.
registerExport('setBatteryLevel', function(_source, requested)
    warnOnce('setBatteryLevel', ('setBatteryLevel cannot write a charge (called by %s); sd-phone\'s battery is a cosmetic drain counter, so the clamped request was echoed and the phone kept its own reading'):format(GetInvokingResource() or 'unknown'))
    return math.max(0, math.min(100, math.floor(tonumber(requested) or 0)))
end)

---chargeBattery(source, amount): RoadPhone answers with the new level, capped at 100. Nothing is
---stored, so the answer is the live reading plus the requested amount.
registerExport('chargeBattery', function(source, amount)
    local src = shim.source(source)
    warnOnce('chargeBattery', ('chargeBattery cannot store a charge (called by %s); sd-phone models no charging, so the capped figure was returned without changing the phone'):format(GetInvokingResource() or 'unknown'))

    local current = src and level(src) or 100
    return math.min(100, current + math.max(0, math.floor(tonumber(amount) or 0)))
end)

-- Charging is not modelled at all: there is no charge to accumulate, so a caller that starts one is
-- told nothing began rather than being left waiting for a completion that never comes.
stubExport('startCharging', false,
    'has no sd-phone equivalent: the battery is a cosmetic drain counter, so there is no charge to accumulate')
stubExport('stopCharging', nil,
    'has no sd-phone equivalent: nothing is ever charging, so there is nothing to stop')
stubExport('isCharging', false,
    'has no sd-phone equivalent: sd-phone models no charging, so a phone is never on charge')
