---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'
---@type table Notify bridge (bridge.client.notify): backend-agnostic toast notifications.
local notify        = require 'bridge.client.notify'
---@type table Live race engine (client.racing.race): route, gates, HUD and progression.
local race          = require 'client.racing.race'
---@type table In-world gate recorder (client.racing.creator): place, undo and save a track.
local creator       = require 'client.racing.creator'
---@type table Start boards (client.racing.board): the in-world sign-up post at a race start.
local board         = require 'client.racing.board'

---@type string[] NUI action suffixes proxied 1:1 to sd-phone:server:racing:<action>. Everything
---listed here is a pure pass-through; the actions that have to carry game state are registered
---raw below, and the class a racer enters on is derived server-side from the model hash.
local ACTIONS = {
    'bootstrap', 'races', 'tracks', 'track', 'trackRoute',
    'leave', 'host',
    'rankings', 'racer',
    'setAlias', 'setAvatar',
    'importTracks', 'exportTrack', 'startCreator',
    'adminTracks', 'adminSetFlag', 'adminDelete',
    'adminPendingTracks', 'adminApproveTrack', 'adminRejectTrack',
}

for _, action in ipairs(ACTIONS) do
    proxyCallback('sd-phone:racing:' .. action, 'sd-phone:server:racing:' .. action)
end

---Awaits one racing server callback, turning a server that never answers into a refusal envelope
---so the pane always has a message to show.
---@param action string action suffix, e.g. 'join'
---@param payload table|nil
---@return table envelope { success: boolean, message?: string, data?: any }
local function awaitServer(action, payload)
    local res = lib.callback.await('sd-phone:server:racing:' .. action, false, payload)
    if type(res) ~= 'table' then return { success = false, message = 'No response from server' } end
    return res
end

---Drops a GPS waypoint on a start line the server handed back. Silent by design: the pane already
---reports the join or the spectate, so a second toast would only repeat it.
---@param start table|nil { x: number, y: number }
local function pointAtStart(start)
    if type(start) ~= 'table' then return end
    local x, y = tonumber(start.x), tonumber(start.y)
    if not (x and y) then return end
    SetNewWaypoint(x + 0.0, y + 0.0)
end

---Model hash of the vehicle the player is sitting in, 0 on foot. The server turns this into a
---class; a class letter is never sent from the client.
---@return integer hash
local function vehicleModelHash()
    local veh = GetVehiclePedIsIn(cache.ped, false)
    if veh == 0 then return 0 end
    return GetEntityModel(veh)
end

---React -> Lua: joins a race, stamping in the model hash of whatever the player is driving, then
---points the map at the start line the server answered with.
---@param payload table { raceId: string }
RegisterNUICallback('sd-phone:racing:join', function(payload, cb)
    payload = type(payload) == 'table' and payload or {}
    payload.modelHash = vehicleModelHash()

    local res = awaitServer('join', payload)
    if res.success and type(res.data) == 'table' then pointAtStart(res.data.start) end
    cb(res)
end)

---React -> Lua: follows a live race. Nothing is added on the way out; the waypoint on the way back
---is the only client-side part.
---@param payload table { raceId: string }
RegisterNUICallback('sd-phone:racing:spectate', function(payload, cb)
    local res = awaitServer('spectate', payload)
    if res.success and type(res.data) == 'table' then pointAtStart(res.data.start) end
    cb(res)
end)

---React -> Lua: drops a map waypoint on a track the app already knows the coords of. Pure client,
---never reaches the server.
---@param payload table { x: number, y: number }
RegisterNUICallback('sd-phone:racing:waypoint', function(payload, cb)
    local x = type(payload) == 'table' and tonumber(payload.x) or nil
    local y = type(payload) == 'table' and tonumber(payload.y) or nil
    if not x or not y then
        notify.show({ description = 'Could not set waypoint.', type = 'error' })
        cb({ success = false })
        return
    end

    SetNewWaypoint(x + 0.0, y + 0.0)
    notify.show({ description = 'Waypoint set.', type = 'success' })
    cb({ success = true })
end)

---React -> Lua: opens a solo run against the clock on a track. The phone closes behind it, the way
---joining a race does, because the next thing the racer needs is the road rather than the app.
---@param payload table { trackId: number }
RegisterNUICallback('sd-phone:racing:trial', function(payload, cb)
    local trackId = type(payload) == 'table' and tonumber(payload.trackId) or nil
    if not trackId then
        cb({ success = false })
        return
    end

    race.beginTrial(trackId, type(payload) == 'table' and tonumber(payload.laps) or nil)
    cb({ success = true })
end)

---React -> Lua: what the player is driving right now, so the race setup screen can show the class
---they would enter on. Display only; the server still resolves the class it acts on.
RegisterNUICallback('sd-phone:racing:vehicle', function(_payload, cb)
    cb({
        success = true,
        data = {
            model  = race.currentVehicleLabel(),
            class  = race.currentClass(),
            onFoot = not cache.vehicle,
        },
    })
end)

---React -> Lua: saves the driver's HUD settings and applies the clamped result to a HUD that may
---already be on screen, so a change during a race lands without reopening the phone.
---@param payload table { hud: table }
RegisterNUICallback('sd-phone:racing:setHud', function(payload, cb)
    local res = awaitServer('setHud', payload)
    if res.success then
        local stored = type(res.data) == 'table' and res.data.hud or nil
        race.applySettings(stored or (type(payload) == 'table' and payload.hud or nil))
    end
    cb(res)
end)

---HUD -> Lua: countdown tick. The overlay owns the timing, the game owns the sound.
RegisterNUICallback('sd-phone:racing:hud:beep', function(_payload, cb)
    PlaySoundFrontend(-1, 'Beep_Red', 'DLC_HEIST_HACKING_SNAKE_SOUNDS', true)
    cb({ success = true })
end)

---HUD -> Lua: the green light.
RegisterNUICallback('sd-phone:racing:hud:go', function(_payload, cb)
    PlaySoundFrontend(-1, 'Beep_Green', 'DLC_HEIST_HACKING_SNAKE_SOUNDS', true)
    cb({ success = true })
end)

---Server push: a lobby opened, filled or closed; the pane refetches rather than patches. The board
---list rides the same push, so a seat taken across the map updates the sign-up post you are stood at.
RegisterNetEvent('sd-phone:client:racing:racesChanged', function()
    SendNUIMessage({ action = 'sd-phone:racing:racesChanged' })
    board.refresh()
end)

---Server push: the running order. It feeds the app's spectate view and, when it belongs to the run
---the player is actually in, the on-screen HUD.
---@param data table { raceId: string, entries: table[] }
RegisterNetEvent('sd-phone:client:racing:standings', function(data)
    SendNUIMessage({ action = 'sd-phone:racing:standings', data = data })
    if type(data) == 'table' and data.raceId and data.raceId == race.active() then
        race.pushStandings(data.entries)
    end
end)

---Server push: the green light. Handed to the race engine, never to the NUI.
---@param data table RaceStartPayload
RegisterNetEvent('sd-phone:client:racing:raceStart', function(data)
    race.begin(data)
end)

---Server push: enough racers finished, so the stragglers are on a clock.
---@param data table { seconds: number }
RegisterNetEvent('sd-phone:client:racing:dnfStarted', function(data)
    race.armDnf(type(data) == 'table' and tonumber(data.seconds) or 0)
end)

---Server push: the player's clock ran out. Tears the race down before the result reaches the app,
---so the HUD, blips and gate props do not outlive the run.
---@param data table { dnf: true, mmrDelta: number }
RegisterNetEvent('sd-phone:client:racing:raceDnf', function(data)
    race.stop(false)
    SendNUIMessage({ action = 'sd-phone:racing:raceResult', data = data })
end)

---Server push: the player's finishing position, time, MMR move and payout.
---@param data table RaceResult
RegisterNetEvent('sd-phone:client:racing:raceResult', function(data)
    SendNUIMessage({ action = 'sd-phone:racing:raceResult', data = data })
end)

---Server push: the creator command. Fires again mid-build to discard the track.
RegisterNetEvent('sd-phone:client:racing:creator', function()
    creator.toggle()
end)

---Stands up the start boards once the client is live: the poll, the blips and the [E] handler.
CreateThread(function()
    Wait(2000)
    board.start()
end)
