---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates: each action proxies straight into its server callback.
proxy('sd-phone:ryde:config',        'sd-phone:server:ryde:config')
proxy('sd-phone:ryde:me',            'sd-phone:server:ryde:me')
proxy('sd-phone:ryde:sync',          'sd-phone:server:ryde:sync')
proxy('sd-phone:ryde:deleteAccount', 'sd-phone:server:ryde:deleteAccount')
proxy('sd-phone:ryde:respond',       'sd-phone:server:ryde:respond')
proxy('sd-phone:ryde:cancel',        'sd-phone:server:ryde:cancel')
proxy('sd-phone:ryde:setOnline',     'sd-phone:server:ryde:setOnline')
proxy('sd-phone:ryde:requestsBoard', 'sd-phone:server:ryde:requestsBoard')
proxy('sd-phone:ryde:waitingCount',  'sd-phone:server:ryde:waitingCount')
proxy('sd-phone:ryde:watchTrip',     'sd-phone:server:ryde:watchTrip')
proxy('sd-phone:ryde:accept',        'sd-phone:server:ryde:accept')
proxy('sd-phone:ryde:tripStatus',    'sd-phone:server:ryde:tripStatus')
proxy('sd-phone:ryde:sameVehicle',   'sd-phone:server:ryde:sameVehicle')
proxy('sd-phone:ryde:complete',      'sd-phone:server:ryde:complete')
proxy('sd-phone:ryde:rate',          'sd-phone:server:ryde:rate')
proxy('sd-phone:ryde:history',       'sd-phone:server:ryde:history')
proxy('sd-phone:ryde:leaderboard',   'sd-phone:server:ryde:leaderboard')

---Answers whether the player is within `radius` metres (2D) of a world point; missing coords
---answer not-near with a -1 distance sentinel.
---@param payload table { x: number, y: number, radius?: number (default 100.0) }
RegisterNUICallback('sd-phone:ryde:nearPoint', function(payload, cb)
    payload = payload or {}
    local px, py = tonumber(payload.x), tonumber(payload.y)
    if not (px and py) then cb({ near = false, distance = -1 }); return end
    local c = GetEntityCoords(PlayerPedId())
    local dx, dy = c.x - (px + 0.0), c.y - (py + 0.0)
    local dist = math.sqrt(dx * dx + dy * dy)
    cb({ near = dist <= (tonumber(payload.radius) or 100.0), distance = math.floor(dist + 0.5) })
end)

---Returns a friendly area name for a world point, falling back to the raw zone code, then
---'Unknown area'.
---@param x number world x
---@param y number world y
---@param z number|nil world z (0.0 when absent)
---@return string name display label, raw zone code, or 'Unknown area'
local function zoneName(x, y, z)
    local code = GetNameOfZone(x + 0.0, y + 0.0, (z or 0.0) + 0.0)
    if not code or code == '' then return 'Unknown area' end
    local label = GetLabelText(code)
    if label and label ~= '' and label ~= 'NULL' then return label end
    return code
end

---@type table<string, boolean> Generic dropoff placeholders that get swapped for the zone name.
local GENERIC_LABELS = {
    ['Current location'] = true, ['Dropped pin'] = true, ['Destination'] = true, [''] = true,
}

---Stamps the live world position in as the pickup, swaps generic dropoff labels for zone names,
---and forwards the ride request to the server.
---@param payload table ride request draft from the UI (dropoff label/coords)
RegisterNUICallback('sd-phone:ryde:requestRide', function(payload, cb)
    payload = payload or {}
    local coords = GetEntityCoords(PlayerPedId())
    payload.pickup = { label = zoneName(coords.x, coords.y, coords.z), x = coords.x, y = coords.y }
    local d = payload.dropoff
    if d and d.x and d.y and GENERIC_LABELS[d.label or ''] then
        d.label = zoneName(d.x, d.y, 0.0)
    end
    cb(lib.callback.await('sd-phone:server:ryde:requestRide', false, payload) or { success = false })
end)

---Friendly zone name for an arbitrary world point. Read-only.
---@param payload table { x: number, y: number }
RegisterNUICallback('sd-phone:ryde:zoneName', function(payload, cb)
    payload = payload or {}
    local x, y = tonumber(payload.x), tonumber(payload.y)
    if not (x and y) then cb({ success = false }); return end
    cb({ success = true, data = { name = zoneName(x, y, 0.0) } })
end)

---Registers a server-push relay: 'sd-phone:client:ryde:<event>' forwards unchanged into the NUI
---under 'sd-phone:ryde:<event>'.
---@param event string event suffix, e.g. 'offer'
local function forward(event)
    RegisterNetEvent('sd-phone:client:ryde:' .. event, function(data)
        SendNUIMessage({ action = 'sd-phone:ryde:' .. event, data = data })
    end)
end

-- Thin relays for the live match pushes: board changes, offers, ratings, peer GPS.
forward('requestAdded')
forward('requestRemoved')
forward('waitingCount')
forward('offer')
forward('offerRemoved')
forward('ratingReceived')
forward('peerLocation')

---Relays trip updates into the NUI and drops a GPS waypoint for the driver when one is attached.
---@param data table { role: string, waypoint?: { x: number, y: number } } plus trip fields
RegisterNetEvent('sd-phone:client:ryde:tripUpdate', function(data)
    SendNUIMessage({ action = 'sd-phone:ryde:tripUpdate', data = data })
    if data and data.role == 'driver' and data.waypoint then
        SetNewWaypoint(data.waypoint.x + 0.0, data.waypoint.y + 0.0)
    end
end)
