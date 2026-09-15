---@type string The resource that owns the fleet; the App Store gate hides the app while it is stopped.
local FLEET = 'sd_scoot'

---Await one sd_scoot callback with a uniform failure when the resource is stopped or silent.
---@param verb string callback suffix (sd_scoot:server:app:<verb>)
---@param payload table|nil
---@return table envelope { success, message?, data? }
local function ask(verb, payload)
    if GetResourceState(FLEET) ~= 'started' then return { success = false, messageKey = 'scoot.unavailable', message = 'Scoot is unavailable right now' } end
    local res = lib.callback.await('sd_scoot:server:app:' .. verb, false, payload or {})
    if type(res) ~= 'table' then return { success = false, messageKey = 'scoot.noResponse', message = 'No response from Scoot' } end
    return res
end

-- Thin delegates: the React app fetches these and gets sd_scoot's envelope back unchanged.
RegisterNUICallback('sd-phone:scoot:snapshot', function(_, cb) cb(ask('nearby')) end)
RegisterNUICallback('sd-phone:scoot:history',  function(_, cb) cb(ask('history')) end)
RegisterNUICallback('sd-phone:scoot:rent',     function(payload, cb) cb(ask('rent', { id = payload and payload.id })) end)
RegisterNUICallback('sd-phone:scoot:finish',   function(_, cb) cb(ask('finish')) end)
RegisterNUICallback('sd-phone:scoot:rentHere', function(payload, cb) cb(ask('rentHere', { bunkerId = payload and payload.bunkerId, colour = payload and payload.colour, customization = payload and payload.customization })) end)

---Drops a GPS waypoint on a scooter or station; a client native, so it stays on this side.
---@param payload table { x: number, y: number }
RegisterNUICallback('sd-phone:scoot:waypoint', function(payload, cb)
    local x, y = tonumber(payload and payload.x), tonumber(payload and payload.y)
    if x and y then SetNewWaypoint(x + 0.0, y + 0.0) end
    cb({ success = x ~= nil })
end)

---Relays sd_scoot's ride pushes into the NUI so the ride card updates without waiting for a poll.
---@param kind 'started'|'ended'
---@param data table the ride (started) or the receipt (ended)
RegisterNetEvent('sd_scoot:client:rideUpdated', function(kind, data)
    SendNUIMessage({ action = 'sd-phone:scoot:rideUpdated', data = { kind = kind, payload = data } })
end)
