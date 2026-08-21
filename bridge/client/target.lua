---@type table Target module; the table returned at end of file. One API over the supported
---target resources (ox_target, qb-target, qtarget).
local target = {}

---@type string[] Supported target resources, in detection-priority order.
local SUPPORTED = { 'ox_target', 'qb-target', 'qtarget' }

---Returns the first supported target resource that's currently started, or nil when none is.
---@return string|nil resource name, or nil if none are started.
local function detect()
    for i = 1, #SUPPORTED do
        if GetResourceState(SUPPORTED[i]) == 'started' then
            return SUPPORTED[i]
        end
    end
    return nil
end

---@type string|nil Active backend, or nil while none is started. Deliberately not an error: this
---module is required for its side effects at client start, so raising here killed the rest of
---bridge/client/init.lua and left every later `require 'bridge.client.target'` holding whatever
---sentinel ox_lib caches for a module that failed to load. The symptom was a crash in payphone.lua
---indexing a boolean, several files away from the actual cause.
local active = detect()

---@type string|nil Active target resource name, exposed so callers can branch per-backend; nil
---until one is running.
target.system = active

---@type fun()[] Callbacks waiting for a backend to appear; drained once one does.
local pending = {}

---@type table<string, boolean> Methods that have already reported a missing backend.
local warned = {}

---Reports the missing backend once per method, so a call in a loop is one console line.
---@param method string bridge method that was called
local function warnMissing(method)
    if warned[method] then return end
    warned[method] = true
    print(('^3[sd-phone]^0 target.%s ignored: no target resource is running (ox_target, qb-target or qtarget).')
        :format(method))
end

---Runs `cb` as soon as a backend is available: right now when one is already started, otherwise
---the moment a supported resource starts. Registration that would otherwise run at load time
---belongs here, because a server is free to start sd-phone before its target resource.
---@param cb fun()
function target.onReady(cb)
    if type(cb) ~= 'function' then return end
    if active then return cb() end
    pending[#pending + 1] = cb
end

if not active then
    print('^3[sd-phone]^0 no target resource is running (ox_target, qb-target or qtarget). Payphone booths and any other target interactions stay off until one starts.')

    AddEventHandler('onClientResourceStart', function(resource)
        if active then return end
        for i = 1, #SUPPORTED do
            if resource == SUPPORTED[i] then
                active = resource
                target.system = resource
                print(('^2[sd-phone]^0 target resource %s started; registering interactions now.'):format(resource))
                for j = 1, #pending do pending[j]() end
                pending = {}
                return
            end
        end
    end)
end

---Translate ox_target option entries to the qb-target/qtarget shape. A pass-through when
---ox_target is active.
---@param options table[] ox_target-shaped option entries
---@return table[] options in the active backend's shape
local function convertOptions(options)
    if active == 'ox_target' then return options end

    local out = {}
    for i = 1, #options do
        local o = options[i]
        out[#out + 1] = {
            type        = o.type or 'client',
            event       = o.event,
            icon        = o.icon,
            label       = o.label,
            action      = o.onSelect,
            canInteract = o.canInteract,
            distance    = o.distance,
            groups      = o.groups,
            items       = o.items,
        }
    end
    return out
end

---Register a box-shaped interaction zone at fixed world coordinates. On qb-target/qtarget a
---random name is minted when none is given, size defaults to 2x2x2, and minZ/maxZ derive from centre + height.
---@param data table ox_target box-zone data.
function target.addBoxZone(data)
    if active == 'ox_target' then
        return exports.ox_target:addBoxZone(data)
    end

    local name    = data.name or ('box_zone_' .. math.random(100000, 999999))
    local size    = data.size or vec3(2, 2, 2)
    local heading = data.rotation or 0

    return exports[active]:AddBoxZone(name, data.coords, size.x, size.y, {
        name      = name,
        heading   = heading,
        debugPoly = data.debug or false,
        minZ      = data.coords.z - (size.z / 2),
        maxZ      = data.coords.z + (size.z / 2),
    }, {
        options  = convertOptions(data.options),
        distance = data.distance or 2.5,
    })
end

---Register a sphere-shaped interaction zone at fixed world coordinates. The qb-target/qtarget
---equivalent is a Z-aware circle zone; a random name is minted when none is given.
---@param data table ox_target sphere-zone data.
function target.addSphereZone(data)
    if active == 'ox_target' then
        return exports.ox_target:addSphereZone(data)
    end

    local name = data.name or ('sphere_zone_' .. math.random(100000, 999999))
    return exports[active]:AddCircleZone(name, data.coords, data.radius or 1.0, {
        name      = name,
        useZ      = true,
        debugPoly = data.debug or false,
    }, {
        options  = convertOptions(data.options),
        distance = data.distance or 2.5,
    })
end

---Register a polygon-shaped interaction zone defined by an array of points. On qb-target/qtarget
---minZ/maxZ derive from the centre coords + thickness when coords are provided.
---@param data table ox_target poly-zone data.
function target.addPolyZone(data)
    if active == 'ox_target' then
        return exports.ox_target:addPolyZone(data)
    end

    local name = data.name or ('poly_zone_' .. math.random(100000, 999999))
    return exports[active]:AddPolyZone(name, data.points, {
        name      = name,
        debugPoly = data.debug or false,
        minZ      = data.coords and data.coords.z - (data.thickness or 2) / 2,
        maxZ      = data.coords and data.coords.z + (data.thickness or 2) / 2,
    }, {
        options  = convertOptions(data.options),
        distance = data.distance or 2.5,
    })
end

---Attach target options to a networked entity addressed by its net id; the local entity handle
---is resolved for the qb-target/qtarget call.
---@param netId number
---@param options table[]
function target.addEntity(netId, options)
    if active == 'ox_target' then
        return exports.ox_target:addEntity(netId, options)
    end
    local entity = NetworkGetEntityFromNetworkId(netId)
    exports[active]:AddTargetEntity(entity, {
        options  = convertOptions(options),
        distance = options.distance or 2.5,
    })
    return true
end

---Attach target options to a client-local entity (not networked).
---@param entity number Local entity (not networked).
---@param options table[]
function target.addLocalEntity(entity, options)
    if active == 'ox_target' then
        return exports.ox_target:addLocalEntity(entity, options)
    end
    exports[active]:AddTargetEntity(entity, {
        options  = convertOptions(options),
        distance = options.distance or 2.5,
    })
    return true
end

---Attach target options to every entity matching one or more model hashes. A single model is
---wrapped into a list for the qb-target/qtarget call.
---@param models string|number|(string|number)[]
---@param options table[]
function target.addModel(models, options)
    if active == 'ox_target' then
        return exports.ox_target:addModel(models, options)
    end
    exports[active]:AddTargetModel(type(models) == 'table' and models or { models }, {
        options  = convertOptions(options),
        distance = options.distance or 2.5,
    })
    return true
end

---Attach target options to every ped in the world.
---@param options table[]
function target.addGlobalPed(options)
    if active == 'ox_target' then
        return exports.ox_target:addGlobalPed(options)
    end
    exports[active]:AddGlobalPed({
        options  = convertOptions(options),
        distance = options.distance or 2.5,
    })
    return true
end

---Attach target options to every vehicle in the world.
---@param options table[]
function target.addGlobalVehicle(options)
    if active == 'ox_target' then
        return exports.ox_target:addGlobalVehicle(options)
    end
    exports[active]:AddGlobalVehicle({
        options  = convertOptions(options),
        distance = options.distance or 2.5,
    })
    return true
end

---Attach target options to every world object.
---@param options table[]
function target.addGlobalObject(options)
    if active == 'ox_target' then
        return exports.ox_target:addGlobalObject(options)
    end
    exports[active]:AddGlobalObject({
        options  = convertOptions(options),
        distance = options.distance or 2.5,
    })
    return true
end

---Attach target options to every other player.
---@param options table[]
function target.addGlobalPlayer(options)
    if active == 'ox_target' then
        return exports.ox_target:addGlobalPlayer(options)
    end
    exports[active]:AddGlobalPlayer({
        options  = convertOptions(options),
        distance = options.distance or 2.5,
    })
    return true
end

---Remove a previously-registered zone by id.
---@param id any Zone id returned from the matching `add...Zone` call.
function target.removeZone(id)
    if active == 'ox_target' then
        return exports.ox_target:removeZone(id)
    end
    exports[active]:RemoveZone(id)
    return true
end

---Remove a target option from a networked entity (resolved from its net id for the
---qb-target/qtarget call).
---@param netId number
---@param label? string Specific option label to remove. Removes all when omitted.
function target.removeEntity(netId, label)
    if active == 'ox_target' then
        return exports.ox_target:removeEntity(netId, label)
    end
    exports[active]:RemoveTargetEntity(NetworkGetEntityFromNetworkId(netId), label)
    return true
end

---Remove a target option from a client-local entity.
---@param entity number
---@param label? string Specific option label to remove. Removes all when omitted.
function target.removeLocalEntity(entity, label)
    if active == 'ox_target' then
        return exports.ox_target:removeLocalEntity(entity, label)
    end
    exports[active]:RemoveTargetEntity(entity, label)
    return true
end

---Remove a target option attached via `addModel`. A single model is wrapped into a list for the
---qb-target/qtarget call.
---@param models string|number|(string|number)[]
---@param label? string Specific option label to remove. Removes all when omitted.
function target.removeModel(models, label)
    if active == 'ox_target' then
        return exports.ox_target:removeModel(models, label)
    end
    exports[active]:RemoveTargetModel(type(models) == 'table' and models or { models }, label)
    return true
end

---Remove a global ped target option.
---@param label? string Specific option label to remove. Removes all when omitted.
function target.removeGlobalPed(label)
    if active == 'ox_target' then
        return exports.ox_target:removeGlobalPed(label)
    end
    exports[active]:RemoveGlobalPed(label)
    return true
end

---Remove a global vehicle target option.
---@param label? string Specific option label to remove. Removes all when omitted.
function target.removeGlobalVehicle(label)
    if active == 'ox_target' then
        return exports.ox_target:removeGlobalVehicle(label)
    end
    exports[active]:RemoveGlobalVehicle(label)
    return true
end

---Remove a global object target option.
---@param label? string Specific option label to remove. Removes all when omitted.
function target.removeGlobalObject(label)
    if active == 'ox_target' then
        return exports.ox_target:removeGlobalObject(label)
    end
    exports[active]:RemoveGlobalObject(label)
    return true
end

---Remove a global player target option.
---@param label? string Specific option label to remove. Removes all when omitted.
function target.removeGlobalPlayer(label)
    if active == 'ox_target' then
        return exports.ox_target:removeGlobalPlayer(label)
    end
    exports[active]:RemoveGlobalPlayer(label)
    return true
end

-- Every method above reaches for exports[active], so each one is wrapped in a single guard that
-- turns a call made with no backend into a no-op plus one console line. onReady is the exception:
-- waiting for a backend is exactly what it is for.
for name, fn in pairs(target) do
    if type(fn) == 'function' and name ~= 'onReady' then
        target[name] = function(...)
            if not active then
                warnMissing(name)
                return false
            end
            return fn(...)
        end
    end
end

return target
