---@type table Main config (configs.config).
local config = require 'configs.config'

local tick = {}

---Seconds until the next one percent step, or nil while the battery is idle. A closed phone on
---a server with DrainWhenClosed off is idle, but charging always steps.
---@param s table { open:boolean, charging:boolean, lowPower:boolean }
---@return integer|nil seconds
function tick.stepSeconds(s)
    local c = config.Battery
    if not s.charging and not s.open and not c.DrainWhenClosed then return nil end

    local range = s.charging and c.ChargeSeconds
               or (s.open and c.DrainSeconds or c.DrainClosedSeconds)
    local secs = math.random(range[1], range[2])

    -- Drain only: lb-phone applies its multiplier to charging too, which makes a low-power
    -- phone charge at half speed.
    if s.lowPower and not s.charging then secs = secs * c.LowPowerMode.Multiplier end
    return secs
end

---The highest WarnAt threshold crossed going downward, or nil. Crossing rather than equality, so
---jumping from 25 straight to 15 still warns.
---@param prev integer
---@param next integer
---@return integer|nil threshold
function tick.crossed(prev, next)
    if next >= prev then return nil end

    local hit
    for _, threshold in ipairs(config.Battery.WarnAt) do
        if prev > threshold and next <= threshold then
            if not hit or threshold > hit then hit = threshold end
        end
    end
    return hit
end

return tick
