---@type table Maps app config (configs.maps): pin caps, waypoint behaviour, live-location knobs.
local config = require 'configs.maps'
---@type table Notify bridge (bridge.client.notify): local notification popups.
local notify = require 'bridge.client.notify'

---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Pin persistence proxies into the Maps server module.
proxyCallback('sd-phone:maps:list', 'sd-phone:server:maps:list')
proxyCallback('sd-phone:maps:save', 'sd-phone:server:maps:save')
proxyCallback('sd-phone:maps:sharePin', 'sd-phone:server:maps:sharePin')

---React -> Lua: returns UI-relevant Maps config; `people` gates the People tab. Read-only.
RegisterNUICallback('sd-phone:maps:config', function(_, cb)
    cb({ success = true, data = { people = config.People ~= false } })
end)

---Forwards a server-saved pin AirShare into the NUI.
---@param marker table saved pin row
RegisterNetEvent('sd-phone:client:maps:pinAdded', function(marker)
    SendNUIMessage({ action = 'sd-phone:maps:pinAdded', data = marker })
end)

---React -> Lua: sets the in-game GPS waypoint to a pin's world coords, guarded against
---non-numeric input. Optionally closes the phone afterward (configs.maps CloseOnWaypoint).
RegisterNUICallback('sd-phone:maps:waypoint', function(data, cb)
    local x, y = tonumber(data and data.x), tonumber(data and data.y)
    if not x or not y then
        notify.show({ description = 'Could not set waypoint.', type = 'error' })
        cb({ success = false })
        return
    end

    SetNewWaypoint(x + 0.0, y + 0.0)
    notify.show({ description = 'Waypoint set.', type = 'success' })

    if config.CloseOnWaypoint then
        exports['sd-phone']:close()
    end

    cb({ success = true })
end)

---React -> Lua: estimates distance + ETA to a pin: live GPS route length, then road-network
---distance, then straight-line, with a per-mode cruising speed. Read-only.
RegisterNUICallback('sd-phone:maps:route', function(data, cb)
    local tx, ty = tonumber(data and data.x), tonumber(data and data.y)
    if not tx or not ty then
        cb({ success = false })
        return
    end

    local nav = config.Navigation or {}
    local ped = PlayerPedId()
    local c   = GetEntityCoords(ped)

    local dist = GetGpsBlipRouteLength()
    if not dist or dist <= 0.0 then
        dist = CalculateTravelDistanceBetweenPoints(c.x, c.y, c.z, tx + 0.0, ty + 0.0, c.z)
    end
    if not dist or dist <= 0.0 then
        dist = #(vector3(c.x, c.y, c.z) - vector3(tx + 0.0, ty + 0.0, c.z))
    end

    local inVeh = IsPedInAnyVehicle(ped, false)
    local speed = inVeh and (nav.DriveSpeed or 16.0) or (nav.WalkSpeed or 1.7)
    if speed <= 0 then speed = 16.0 end

    cb({
        success = true,
        data = {
            distance = dist,
            eta      = dist / speed,
            mode     = inVeh and 'drive' or 'walk',
            units    = nav.Units or 'metric',
        },
    })
end)

---React -> Lua: the player's current world coords. Read-only.
RegisterNUICallback('sd-phone:maps:here', function(_, cb)
    local c = GetEntityCoords(PlayerPedId())
    cb({ success = true, data = { x = c.x, y = c.y } })
end)

-- Live "you are here" dot: one thread pushes the local ped's coords + heading to the NUI while
-- the Maps app is mounted.
---@type boolean True while the Maps app is on screen and wants position pushes.
local watching = false
---@type boolean True while the stream thread is alive.
local streamRunning = false
---@type boolean True while a /mapcal calibration run is active (arms the in-app capture banner).
local calArmed = false

---Spawns the position-stream thread unless it's already running; the loop self-terminates when
---the watch flag or the phone's open state drops.
local function startLocationStream()
    if streamRunning then return end
    streamRunning = true
    CreateThread(function()
        while watching and exports['sd-phone']:isOpen() do
            local ped = PlayerPedId()
            local c = GetEntityCoords(ped)
            SendNUIMessage({
                action = 'sd-phone:maps:location',
                data   = { x = c.x, y = c.y, h = GetEntityHeading(ped) },
            })
            Wait(config.LiveLocation and config.LiveLocation.Interval or 300)
        end
        streamRunning = false
    end)
end

---React -> Lua: starts/stops the live-location stream; configs.maps LiveLocation.Enabled =
---false hard-disables it. Re-arms the calibration banner while a /mapcal run is in progress.
RegisterNUICallback('sd-phone:maps:watch', function(data, cb)
    local enabled = not (config.LiveLocation and config.LiveLocation.Enabled == false)
    watching = enabled and (data and data.on == true) or false
    if watching then
        startLocationStream()
        if calArmed then
            SendNUIMessage({ action = 'sd-phone:maps:calibrate', data = { on = true } })
        end
    end
    cb({ success = true })
end)

-- Map calibration helper (temporary): /mapcal teleports through the calibration spots and arms
-- the in-app capture banner; /mapcaldone disarms it.
---@type vector3[] Calibration teleport spots, spread across the map extremes.
local CAL_POINTS = {
    vec3(-1336.0, -3044.0, 13.9),
    vec3(-3192.0,  1100.0,  4.5),
    vec3(  195.0,  -934.0, 30.7),
    vec3( 2354.0,  1830.0, 38.0),
    vec3( 1735.0,  3315.0, 41.4),
    vec3( 2450.0,  4970.0, 46.0),
    vec3( -275.0,  6620.0, 12.0),
}
---@type integer 1-based index of the last visited calibration point (0 = run not started).
local calIndex = 0

---/mapcal - arms the calibration run and teleports to the next point, wrapping after the last.
---Ace-restricted (command.mapcal).
RegisterCommand('mapcal', function()
    calArmed = true
    calIndex = calIndex % #CAL_POINTS + 1
    local p = CAL_POINTS[calIndex]
    local ped = PlayerPedId()
    RequestCollisionAtCoord(p.x, p.y, p.z)
    SetEntityCoords(ped, p.x, p.y, p.z, false, false, false, false)
    notify.show({
        description = ('Calib %d/%d — open Maps, tap your REAL spot, then close & /mapcal.'):format(calIndex, #CAL_POINTS),
        type = 'info',
    })
    print(('[sd-phone:mapcal] point %d/%d -> %.1f, %.1f | open phone > Maps, tap your real spot. /mapcaldone to finish.'):format(
        calIndex, #CAL_POINTS, p.x, p.y))
end, true)

---/mapcaldone - disarms the calibration run.
RegisterCommand('mapcaldone', function()
    calArmed = false
    print('[sd-phone:mapcal] calibration disarmed.')
end, false)

---/maptiles - asks the NUI to probe one tile per zoom level for each style and report which
---levels loaded.
RegisterCommand('maptiles', function()
    SendNUIMessage({ action = 'sd-phone:maps:tilecheck' })
    notify.show({ description = 'Checking map tiles… results in the F8 console.', type = 'info' })
    print('[sd-phone:maptiles] probing tile levels — results below in a moment…')
end, false)

---NUI -> Lua: prints the /maptiles tile-probe results and per-style verdicts to the F8 console.
RegisterNUICallback('sd-phone:maps:tilecheckResult', function(data, cb)
    print('[sd-phone:maptiles] ===== map tile check =====')
    for _, s in ipairs(data and data.styles or {}) do
        print(('[sd-phone:maptiles] %s  base=%s  enabled maxZoom=%s'):format(
            tostring(s.name), tostring(s.base), tostring(s.maxZoom)))
        local parts = {}
        for _, lvl in ipairs(s.levels or {}) do
            parts[#parts + 1] = ('z%s:%s'):format(tostring(lvl.z), lvl.ok and 'OK' or '--')
        end
        print('[sd-phone:maptiles]   ' .. table.concat(parts, '  ') .. '   (only z3+ are used by the map)')

        local deepest, maxz = tonumber(s.deepestOk), tonumber(s.maxZoom)
        if deepest and maxz then
            if deepest < 0 then
                print('[sd-phone:maptiles]   FAIL: no tiles loaded — check the base URL / pack folder path.')
            elseif deepest > maxz then
                print(('[sd-phone:maptiles]   NOTE: pack goes deeper than enabled — set maxZoom: %d in data.ts to use it all.'):format(deepest))
            elseif deepest < maxz then
                print(('[sd-phone:maptiles]   WARN: pack shallower than enabled — only z%d loaded; set maxZoom: %d or complete the pack.'):format(deepest, deepest))
            else
                print('[sd-phone:maptiles]   OK: pack matches the enabled depth — all good.')
            end
        end
    end
    cb({ success = true })
end)

---React -> Lua: the in-app calibration "Done" button disarms the run.
RegisterNUICallback('sd-phone:maps:calibrateDone', function(_, cb)
    calArmed = false
    cb({ success = true })
end)
