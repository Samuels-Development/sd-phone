-- Anchors the GTA origin (0,0) to a downtown-Los-Angeles latitude/longitude; world metres
-- offset from there.
---@type number Degrees north at the GTA origin (0,0).
local LAT0 = 34.0522
---@type number Degrees west at the GTA origin (0,0).
local LON0 = -118.2437
---@type number Metres per degree of latitude.
local M_PER_DEG_LAT = 111320.0
---@type number Cosine of the anchor latitude.
local COS_LAT0 = math.cos(math.rad(LAT0))

---Project GTA world metres onto the anchored latitude/longitude frame.
---@param x number world x (metres east of the origin)
---@param y number world y (metres north of the origin)
---@return number lat degrees north
---@return number lon degrees east (negative = west)
local function gtaToLatLon(x, y)
    local lat = LAT0 + (y / M_PER_DEG_LAT)
    local lon = LON0 + (x / (M_PER_DEG_LAT * COS_LAT0))
    return lat, lon
end

---Live readout the React app polls while the Compass screen is open: clockwise compass bearing,
---anchored lat/lon and altitude.
RegisterNUICallback('sd-phone:compass:get', function(_, cb)
    local ped = PlayerPedId()
    local bearing  = (360.0 - GetEntityHeading(ped)) % 360.0
    local c        = GetEntityCoords(ped)
    local lat, lon = gtaToLatLon(c.x, c.y)
    cb({
        heading = bearing,
        lat     = lat,
        lon     = lon,
        alt     = c.z,
    })
end)
