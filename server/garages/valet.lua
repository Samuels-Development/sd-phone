---@type table Framework detection (bridge.shared.framework): the AI Core flag.
local framework = require 'bridge.shared.framework'
---@type table Garages bridge (bridge.server.garages): vehicle lookup + the take-out write.
local garages   = require 'bridge.server.garages'
---@type table Money bridge (bridge.server.money): fee debit and refund.
local money     = require 'bridge.server.money'
---@type table Player bridge (bridge.server.player): the character a request comes from. Always the
---real identifier: a vehicle belongs to the character, and a SIM identity would give each phone its
---own cooldown and its own lock on the same car.
local player    = require 'bridge.server.player'
---@type table Shared server helpers (server.util): onCleanup.
local util      = require 'server.util'
---@type table Garages app config (configs.garages): the Valet block.
local G         = require 'configs.garages'

---@type table Valet settings, defaulted so a config without a Valet block simply stays off.
local V = type(G.Valet) == 'table' and G.Valet or {}
---@type boolean Whether valet is available at all.
local ENABLED  = G.Enabled ~= false and V.Enabled == true
---@type number Fee per delivery.
local PRICE    = math.max(0, tonumber(V.Price) or 0)
---@type string Account the fee is taken from.
local ACCOUNT  = V.Account == 'cash' and 'cash' or 'bank'
---@type number Seconds between a player's valets (0 disables).
local COOLDOWN = math.max(0, tonumber(V.Cooldown) or 0)
---@type boolean Refuse while the player is already in a vehicle.
local NO_INVEH = V.BlockInVehicle ~= false
---@type number Seconds after taking damage that valet stays refused (0 disables).
local COMBAT   = math.max(0, tonumber(V.CombatBlock) or 0)

---@type table[] Normalised blocked zones: { coords, radius, label }.
local ZONES = {}
do
    local src = V.BlockedZones
    if type(src) == 'table' then
        for i = 1, #src do
            local z = src[i]
            local c, r = z and z[1], tonumber(z and z[2])
            if c and r and r > 0 then
                ZONES[#ZONES + 1] = { coords = c, radius = r, label = type(z[3]) == 'string' and z[3] or nil }
            end
        end
    end
end

---@type number Metres from the player a delivery may start: the distance the client looks for a
---road at (DriveFrom when driven, a few metres when the car is simply placed) plus the slack its
---road-node search and a few seconds of walking add.
local MAX_SPAWN_DIST = (V.Drive ~= false and math.max(5, tonumber(V.DriveFrom) or 75) or 3.0) + 75.0

---@type table<string, integer> citizenid -> os.time that character's last delivery started.
local lastValet = {}

---@type table<string, boolean> citizenid -> a delivery for that character is in flight.
local busy = {}

---Drops cooldowns that have run out. Swept rather than cleared per player, so a relog does not
---reset a cooldown still running.
util.onCleanup(function()
    local now = os.time()
    for cid, at in pairs(lastValet) do
        if now - at >= COOLDOWN then lastValet[cid] = nil end
    end
end)

---@type table<string, boolean> Vehicle classes valet refuses; road delivery doesn't apply to them.
local NON_ROAD = { Boat = true, Aircraft = true, Plane = true, Helicopter = true }

---Whether a stored row is deliverable by road, from the garage's own type column and the class the
---client resolved. Anything not clearly a boat or aircraft is allowed.
---@param veh table vehicleFor result
---@param class string|nil client-resolved class label
---@return boolean
local function roadDeliverable(veh, class)
    local t = veh.row and (veh.row.garage_type or veh.row.type or veh.row.category)
    if type(t) == 'string' then
        local lower = t:lower()
        if lower == 'boat' or lower == 'plane' or lower == 'air' or lower == 'helicopter' then return false end
    end
    return not (type(class) == 'string' and NON_ROAD[class])
end

---The blocked zone the player is standing in, if any.
---@param src number
---@return table|nil zone
local function blockedZone(src)
    if #ZONES == 0 then return nil end
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end
    local at = GetEntityCoords(ped)
    for i = 1, #ZONES do
        if #(at - ZONES[i].coords) <= ZONES[i].radius then return ZONES[i] end
    end
    return nil
end

---Refusal reason for a valet request, or nil when it may proceed. All server-checked except
---`recentDamage`, which is client-reported.
---@param src number
---@param cid string|nil caller citizenid
---@param veh table|nil vehicleFor result
---@param payload table client request
---@return string|nil reason machine-readable refusal code
---@return string|nil detail extra text for the reason (a zone label)
local function refuse(src, cid, veh, payload)
    if not veh then return 'notFound' end
    if veh.status == 'impound' then return 'impounded' end
    if veh.status ~= 'stored' then return 'notStored' end
    if not roadDeliverable(veh, payload.class) then return 'notRoad' end

    if COOLDOWN > 0 and cid then
        local last = lastValet[cid]
        if last and (os.time() - last) < COOLDOWN then return 'cooldown' end
    end

    if NO_INVEH then
        local ped = GetPlayerPed(src)
        if ped and ped ~= 0 and GetVehiclePedIsIn(ped, false) ~= 0 then return 'inVehicle' end
    end

    if COMBAT > 0 and payload.recentDamage == true then return 'combat' end

    local zone = blockedZone(src)
    if zone then return 'blockedArea', zone.label end

    if PRICE > 0 and money.get(src, ACCOUNT) < PRICE then return 'funds' end

    return nil
end

---Spawn the vehicle server-side and wait for it to actually exist. Returns the entity, or nil when
---the model never resolved into one.
---@param model string|number spawn name or hash
---@param at table { x, y, z, h }
---@return number|nil entity
local function spawnVehicle(model, at)
    local hash = type(model) == 'number' and model or joaat(model)
    local ok, entity = pcall(CreateVehicle, hash, at.x + 0.0, at.y + 0.0, at.z + 0.0, at.h + 0.0, true, true)
    if not ok or not entity or entity == 0 then return nil end

    for _ = 1, 40 do
        if DoesEntityExist(entity) then return entity end
        Wait(25)
    end

    if DoesEntityExist(entity) then return entity end
    pcall(DeleteEntity, entity)
    return nil
end

---Hand back whatever a delivery that is not going ahead had already done: the spawned entity is
---deleted, the fee refunded, and the cooldown put back to what it was, so a delivery that never
---happened costs neither money nor the wait. Nothing is undone once the take-out committed.
---@param src number
---@param cid string caller's character identifier
---@param ctx table delivery progress: started, prevValet, charged, entity, committed
---@param why string refusal code
---@return table response
local function unwind(src, cid, ctx, why)
    if not ctx.committed then
        if ctx.entity then pcall(DeleteEntity, ctx.entity); ctx.entity = nil end
        if ctx.charged then
            ctx.charged = false
            money.add(src, ACCOUNT, PRICE, 'Vehicle valet refund')
        end
        if ctx.started then lastValet[cid] = ctx.prevValet end
    end
    return { success = false, reason = why }
end

---Whether a client-chosen spawn point lies within reach of where the server sees the player. The
---point is the client's pick of a road node, so it is refused rather than pulled in: dragged toward
---the player it would no longer be on that road, and often inside something.
---@param src number
---@param spawn { x: number, y: number, z: number }
---@return boolean
local function spawnInReach(src, spawn)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return false end
    local at = GetEntityCoords(ped)
    if not at then return false end
    local dx, dy, dz = spawn.x - at.x, spawn.y - at.y, spawn.z - at.z
    return (dx * dx + dy * dy + dz * dz) <= MAX_SPAWN_DIST * MAX_SPAWN_DIST
end

---Deliver one of the caller's stored vehicles: validate, start the cooldown, charge, spawn, then
---mark it out of its garage. Any failure before that last step goes through unwind, which leaves
---the car stored and refunds the fee. Progress is written to `ctx` as it happens so the caller
---can unwind a delivery that raised part way through.
---@param src number
---@param payload table client request
---@param cid string caller's character identifier
---@param ctx table delivery progress, filled in here
---@return table response
local function deliver(src, payload, cid, ctx)
    local spawn = payload.spawn
    if type(spawn) ~= 'table' or not tonumber(spawn.x) or not tonumber(spawn.y) or not tonumber(spawn.z) then
        return { success = false, reason = 'noSpace' }
    end
    spawn = { x = tonumber(spawn.x), y = tonumber(spawn.y), z = tonumber(spawn.z), h = tonumber(spawn.h) or 0.0 }
    if not spawnInReach(src, spawn) then return { success = false, reason = 'noSpace' } end

    local veh = garages.vehicleFor(src, payload.plate)

    local reason, detail = refuse(src, cid, veh, payload)
    if reason then return { success = false, reason = reason, detail = detail } end
    if not veh.model then return { success = false, reason = 'notFound' } end

    ctx.started, ctx.prevValet = true, lastValet[cid]
    lastValet[cid] = os.time()

    if PRICE > 0 then
        if not money.remove(src, ACCOUNT, PRICE, 'Vehicle valet') then return unwind(src, cid, ctx, 'funds') end
        ctx.charged = true
    end

    local netId
    if garages.spawnsOwnVehicles() then
        netId = garages.spawnOwned(src, veh, spawn)
        if not netId then return unwind(src, cid, ctx, 'spawnFailed') end
        ctx.committed = true
    else
        ctx.entity = spawnVehicle(veh.model, spawn)
        if not ctx.entity then return unwind(src, cid, ctx, 'spawnFailed') end

        netId = NetworkGetNetworkIdFromEntity(ctx.entity)
        if not netId or netId == 0 then return unwind(src, cid, ctx, 'spawnFailed') end

        if not garages.takeOut(src, veh.plate, netId) then return unwind(src, cid, ctx, 'takeOutFailed') end
        ctx.committed = true

        -- AI Core hands keys out on the server through its key layer, whichever key script runs.
        if framework.aicore then
            pcall(function() exports['ai-core']:GiveVehicleKeys(src, veh.plate, 'garage') end)
        end
    end

    return {
        success = true,
        netId   = netId,
        plate   = veh.plate,
        props   = veh.props,
        price   = PRICE,
        drive   = V.Drive ~= false,
    }
end

---The valet request. One delivery per character at a time: a second request while one is in
---flight is refused outright, since both would read the car as stored and spawn it twice. The lock
---is released on every path, including a delivery that raised, which is unwound before answering.
lib.callback.register('sd-phone:server:garages:valet', function(src, payload)
    if not ENABLED then return { success = false, reason = 'disabled' } end
    if type(payload) ~= 'table' or type(payload.plate) ~= 'string' then
        return { success = false, reason = 'notFound' }
    end

    local cid = player.getRealIdentifier(src)
    if not cid then return { success = false, reason = 'notFound' } end
    if busy[cid] then return { success = false, reason = 'cooldown' } end

    busy[cid] = true
    local ctx = {}
    local ok, res = pcall(deliver, src, payload, cid, ctx)
    busy[cid] = nil

    if ok then return res end
    print(('^1[sd-phone:garages]^0 valet delivery failed: %s'):format(tostring(res)))
    return unwind(src, cid, ctx, 'spawnFailed')
end)

---Whether valet is available, and what it costs, so the app can show or hide its button.
lib.callback.register('sd-phone:server:garages:valetInfo', function()
    return { enabled = ENABLED, price = PRICE, account = ACCOUNT }
end)
