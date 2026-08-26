---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table<string, { source: number, resource: string }> Live pins by id, so a removal can be
---refused when the pin belongs to another resource, exactly as RoadPhone documents.
local pins = {}

---@type integer Ordinal behind each generated pin id.
local seq = 0

---The internal key a pin is stored under. A caller-supplied id is namespaced to BOTH the invoking
---resource and the player it was placed for: two resources can each place 'depot', and so can two
---players, without either overwriting the other. A minted handle is already unique.
---@param resource string invoking resource name
---@param src number player the pin belongs to
---@param id any caller-supplied id, nil when none was given
---@return string key
local function keyFor(resource, src, id)
    if type(id) == 'string' and id ~= '' then
        return ('ext:%s:%d:%s'):format(resource, src, id)
    end
    seq = seq + 1
    return ('ext:%s:%d:%d'):format(resource, src, seq)
end

---AddMapPinForPlayer(source, data): places a pin for one player and answers its handle, or nil when
---the coordinates were missing.
---
---A caller-supplied `data.id` comes back verbatim so the same string removes it again; without one,
---an 'ext:<resource>:<ordinal>' handle is minted. sd-phone's Maps app owns its markers per
---character, so the pin is a world blip drawn by the client half rather than a saved marker, and
---`route` follows through as a GPS route.
registerExport('AddMapPinForPlayer', function(source, data)
    local src = shim.source(source)
    if not src or type(data) ~= 'table' then return nil end

    local x, y = tonumber(data.x), tonumber(data.y)
    if not x or not y then return nil end

    warnOnce('AddMapPinForPlayer', ('map pins are drawn as world blips (called by %s); sd-phone\'s Maps app keeps its own per-character markers, which a foreign pin never joins'):format(GetInvokingResource() or 'unknown'))

    local resource = GetInvokingResource() or 'unknown'
    local key = keyFor(resource, src, data.id)
    local existing = pins[key]
    if existing then
        TriggerClientEvent('sd-phone:client:compat:roadphone:pin', existing.source, 'remove', { id = key })
    end
    pins[key] = { source = src, resource = resource }

    local blip
    if data.blip == false then
        blip = false
    elseif type(data.blip) == 'table' then
        blip = data.blip
    end

    TriggerClientEvent('sd-phone:client:compat:roadphone:pin', src, 'add', {
        id    = key,
        x     = x,
        y     = y,
        z     = tonumber(data.z) or 0.0,
        label = data.label,
        color = data.color,
        route = data.route == true,
        blip  = blip,
    })
    return (type(data.id) == 'string' and data.id ~= '') and data.id or key
end)

---RemoveMapPinForPlayer(source, id): true when the pin existed AND belongs to the calling resource.
---A caller's own id is namespaced first, so it only ever resolves against that caller's own pins.
registerExport('RemoveMapPinForPlayer', function(source, id)
    local src = shim.source(source)
    if not src or type(id) ~= 'string' or id == '' then return false end

    local resource = GetInvokingResource() or 'unknown'
    local key = pins[id] and id or ('ext:%s:%d:%s'):format(resource, src, id)
    local pin = pins[key]
    if not pin or pin.resource ~= resource then return false end

    pins[key] = nil
    TriggerClientEvent('sd-phone:client:compat:roadphone:pin', pin.source, 'remove', { id = key })
    return true
end)

---Drops a departing player's pins so a recycled server id never inherits them.
AddEventHandler('playerDropped', function()
    local src = source
    for id, pin in pairs(pins) do
        if pin.source == src then pins[id] = nil end
    end
end)

---Clears every pin a resource placed when that resource stops, matching RoadPhone's own auto-clean.
AddEventHandler('onResourceStop', function(resource)
    for id, pin in pairs(pins) do
        if pin.resource == resource then
            pins[id] = nil
            TriggerClientEvent('sd-phone:client:compat:roadphone:pin', pin.source, 'remove', { id = id })
        end
    end
end)
