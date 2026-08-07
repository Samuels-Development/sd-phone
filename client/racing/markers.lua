---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table In-world race tuning (configs/racing.lua, the Race section).
local raceCfg <const> = (config.Racing or {}).Race or {}

---@type number Metres the billboard floats above its gate once the driver is on top of it.
local HEIGHT_MIN <const> = tonumber(raceCfg.MarkerHeightMin) or 12.0
---@type number Metres it floats above the gate from far off, where it has to clear terrain and roofs.
local HEIGHT_MAX <const> = tonumber(raceCfg.MarkerHeightMax) or 45.0
---@type number Metres at which the billboard has fully dropped to HEIGHT_MIN.
local NEAR <const> = tonumber(raceCfg.MarkerNear) or 20.0
---@type number Metres at which the billboard has fully risen to HEIGHT_MAX.
local FAR <const> = tonumber(raceCfg.MarkerFar) or 250.0
---@type number Working range of the altitude ramp, floored so a bad config cannot divide by zero.
local SPAN <const> = math.max(1.0, FAR - NEAR)
---@type number Distance the on-screen scale is calibrated against, in metres.
local SCALE_PIVOT <const> = 130.0
---@type number Smallest on-screen size a distant billboard shrinks to.
local SCALE_MIN <const> = 0.4
---@type number Largest on-screen size a near billboard grows to.
local SCALE_MAX <const> = 1.0
---@type number Screen heights the stem may span, so a marker overhead cannot draw across the view.
local STEM_MAX <const> = 2.0
---@type integer Billboards drawn at once: the gate being driven to, and the one after it.
local VISIBLE <const> = 2
---@type string NUI action the race HUD layer listens on for billboards.
local NUI_ACTION <const> = 'sd-phone:racing:markers'

---@type table Module table; the table returned at end of file.
local markers = {}

---@type string Colour of the gate after the closest one.
local color = '#0BF2B4'
---@type string Colour of the gate being driven to.
local colorClosest = '#FFD60A'
---@type boolean Whether the driver wants the floating billboards at all.
local enabled = true
---@type boolean Whether the NUI is currently holding any billboards of ours.
local painted = false

---Takes the driver's marker preferences. Called from the race engine whenever the HUD settings
---change, so a colour picked mid-race lands on the next frame.
---@param nextColor string|nil hex colour for the gate after the closest one
---@param nextClosest string|nil hex colour for the gate being driven to
---@param visible boolean|nil whether billboards are drawn at all
function markers.setStyle(nextColor, nextClosest, visible)
    if type(nextColor) == 'string' and nextColor ~= '' then color = nextColor end
    if type(nextClosest) == 'string' and nextClosest ~= '' then colorClosest = nextClosest end
    if visible ~= nil then enabled = visible and true or false end
end

---Builds one billboard descriptor. The altitude ramps with distance so the marker is visible over
---buildings from across the map yet drops toward eye level as the driver arrives, and the stem is
---the screen-space gap down to the gate itself so the NUI can draw a line that actually reaches it.
---@param target number[] gate row { midX, midY, midZ, aX, aY, aZ, bX, bY, bZ }
---@param coords vector3 player coords
---@param label integer checkpoint number painted on the billboard
---@param primary boolean whether this is the gate being driven to
---@return table marker
local function billboard(target, coords, label, primary)
    local z         = target[3] or 0.0
    local dx, dy    = coords.x - target[1], coords.y - target[2]
    local dist      = math.sqrt(dx * dx + dy * dy)

    local f = (dist - NEAR) / SPAN
    if f < 0.0 then f = 0.0 elseif f > 1.0 then f = 1.0 end
    local height = HEIGHT_MIN + (HEIGHT_MAX - HEIGHT_MIN) * f

    local onScreen, sx, sy = World3dToScreen2d(target[1], target[2], z + height)
    local _, _, groundY    = World3dToScreen2d(target[1], target[2], z + 0.2)

    local stem = (groundY or sy) - sy
    if stem < 0.0 then stem = 0.0 elseif stem > STEM_MAX then stem = STEM_MAX end

    local scale = SCALE_PIVOT / math.max(dist, 1.0)
    if scale > SCALE_MAX then scale = SCALE_MAX elseif scale < SCALE_MIN then scale = SCALE_MIN end

    return {
        label = label,
        dist  = math.floor(dist + 0.5),
        x     = sx,
        y     = sy,
        stem  = stem,
        scale = scale,
        on    = onScreen,
        primary = primary,
    }
end

---Pushes the billboards for the gate being driven to and the one after it. The lookahead wraps back
---to gate 1 on every lap but the last, where there is nothing after the finish to point at.
---@param targets number[][] gate rows for the lap, gate 1 of the track excluded
---@param current integer index of the gate being driven to
---@param cpPerLap integer gates in one lap
---@param lap integer lap being driven, 1-based
---@param totalLaps integer laps in the race
---@param playerCoords vector3 player coords for this frame
function markers.update(targets, current, cpPerLap, lap, totalLaps, playerCoords)
    if not enabled then
        markers.clear()
        return
    end

    local list = {}
    for k = 0, VISIBLE - 1 do
        local idx = current + k
        if idx > cpPerLap and lap < totalLaps then idx = idx - cpPerLap end
        local target = targets[idx]
        if target and (k == 0 or idx ~= current) then
            list[#list + 1] = billboard(target, playerCoords, idx, k == 0)
        end
    end

    painted = true
    SendNUIMessage({ action = NUI_ACTION, data = { markers = list, color = color, colorClosest = colorClosest } })
end

---Takes every billboard off the screen. Cheap to call repeatedly: the empty push only goes out when
---something is actually being drawn.
function markers.clear()
    if not painted then return end
    painted = false
    SendNUIMessage({ action = NUI_ACTION, data = { markers = {}, color = color, colorClosest = colorClosest } })
end

return markers
