---@type table Racing settings (configs/racing.lua).
local config  = require 'configs.config'

---@type table Race running state, so a board never shows while the player is mid-run.
local race    = require 'client.racing.race'
---@type table Locale bridge (bridge.shared.locale): t(key, english, vars) for in-world text.
local locale  = require 'bridge.shared.locale'

local RACING  = type(config.Racing) == 'table' and config.Racing or {}
local RACE    = type(RACING.Race) == 'table' and RACING.Race or {}

---@type boolean Whether the racing app runs at all. Nothing here touches the world when it is off.
local ENABLED = RACING.Enabled ~= false

---@type number Metres from a start point at which its map blip appears. The blip is created on
---the way in and removed on the way out, so a lobby across the map never shows on the pause map.
local MARKER_DIST = 60.0

---@type number Metres from a start point at which the sign-up board opens on screen.
local SHOW_DIST = 14.0

---@type number Metres from the start line a joined racer must be inside to count as lined up.
local LINEUP_RADIUS = tonumber(RACE.LineupRadius) or 40.0

---@type number Biggest heading error, in degrees, still counted as facing down the track.
local FACE_DEGREES = tonumber(RACE.LineupFaceDegrees) or 90.0

---@type number Metres past the start line still counted as behind it, so sitting on the line is
---not treated as a jumped start.
local LINE_METRES = tonumber(RACE.LineupLineMetres) or 3.5

---@type integer How often the board list is refetched, in ms. A push refreshes it sooner.
local POLL_MS = 15000

---@type integer How often the lineup verdict is recomputed and reported, in ms.
local READY_MS = 500

---@type integer Control index for [E].
local KEY_JOIN = 38

local board = {}

---@type table[] Lobbies close enough to the green light to be standing a board.
local Boards = {}

---@type table<string, integer> Blip handle per race id.
local Blips = {}

---@type table|nil The board the player is currently stood at.
local Shown = nil

---@type string|nil Signature of the board payload last sent up. Identity alone cannot decide this:
---a refresh swaps in a fresh entry table AND re-points Shown at it, so an identity test is false
---forever after the first send and the grid count, pot and start time freeze at whatever they were
---when the player walked up.
local ShownSig = nil

---@type string|nil Last lineup verdict reported to the server, so only changes go over the wire.
local Reported = nil

---@type boolean Whether a join round trip is in flight, so [E] cannot double fire.
local Busy = false

local function clearBlips()
    for id, handle in pairs(Blips) do
        if DoesBlipExist(handle) then RemoveBlip(handle) end
        Blips[id] = nil
    end
end

---Paints a short-range blip for each board within MARKER_DIST of the player and drops the rest,
---whether they fell out of range or their lobby has gone.
---@param coords vector3 player position
local function syncBlips(coords)
    local seen = {}
    for i = 1, #Boards do
        local entry = Boards[i]
        local start = entry.start
        if start and #(coords - vec3(start.x + 0.0, start.y + 0.0, (start.z or 0.0) + 0.0)) <= MARKER_DIST then
            seen[entry.id] = true
            if not Blips[entry.id] then
                local handle = AddBlipForCoord(start.x + 0.0, start.y + 0.0, (start.z or 0.0) + 0.0)
                SetBlipSprite(handle, 315)
                SetBlipColour(handle, 5)
                SetBlipScale(handle, 0.9)
                SetBlipAsShortRange(handle, true)
                BeginTextCommandSetBlipName('STRING')
                AddTextComponentSubstringPlayerName(entry.name or locale.t('racing.modeRace', 'Race'))
                EndTextCommandSetBlipName(handle)
                Blips[entry.id] = handle
            end
        end
    end

    for id, handle in pairs(Blips) do
        if not seen[id] then
            if DoesBlipExist(handle) then RemoveBlip(handle) end
            Blips[id] = nil
        end
    end
end

---@return number|nil hash joaat of the vehicle the player is in, nil on foot
local function currentModel()
    local vehicle = GetVehiclePedIsIn(cache.ped, false)
    if vehicle == 0 then return nil end
    return GetEntityModel(vehicle)
end

---Refetches the board list. Silent on failure: a board that cannot be reached is simply not drawn.
function board.refresh()
    if not ENABLED then return end

    local res = lib.callback.await('sd-phone:server:racing:boards', false)
    if type(res) ~= 'table' or res.success ~= true or type(res.data) ~= 'table' then return end

    Boards = type(res.data.boards) == 'table' and res.data.boards or {}
    syncBlips(GetEntityCoords(cache.ped))

    if Shown then
        local still = nil
        for i = 1, #Boards do
            if Boards[i].id == Shown.id then still = Boards[i] break end
        end
        Shown = still
        if not Shown then
            ShownSig = nil
            SendNUIMessage({ action = 'sd-phone:racing:board:hide' })
        end
    end
end

---The nearest board within its show radius, or nil.
---@param coords vector3 player position
---@return table|nil entry
---@return number distance metres to it
local function nearest(coords)
    local best, bestDist = nil, MARKER_DIST
    for i = 1, #Boards do
        local entry = Boards[i]
        local start = entry.start
        if start then
            local d = #(coords - vec3(start.x + 0.0, start.y + 0.0, (start.z or 0.0) + 0.0))
            if d < bestDist then best, bestDist = entry, d end
        end
    end
    return best, bestDist
end

---How ready a racer is to be sent off: in the driver's seat, facing down the track, and not already
---past the line. The same three tests in the same order sd-racing's BoardReadiness and
---frp_racing's board.readiness run, so what the board has been showing is exactly what decides
---whether the flag drops for you.
---
---Measured off the VEHICLE, not the ped: a ped keeps its own heading inside a car, so reading the
---ped told a driver sat square on the grid that they were facing the wrong way. The seat test is
---likewise seat -1 rather than "in a car at all" - a passenger cannot start a race.
---@param entry table board, or any table carrying start + heading
---@return string verdict one of ready, vehicle, turn, backup
local function readiness(entry)
    local ped = cache.ped
    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 or GetPedInVehicleSeat(veh, -1) ~= ped then return 'vehicle' end

    local start = entry and entry.start
    if not start then return 'ready' end

    local heading = tonumber(entry.heading)
    if not heading then return 'ready' end

    local mine = GetEntityHeading(veh)
    local err  = math.abs(((mine - heading + 180.0) % 360.0) - 180.0)
    if err > FACE_DEGREES then return 'turn' end

    local here    = GetEntityCoords(veh)
    local line    = vec3(start.x + 0.0, start.y + 0.0, (start.z or 0.0) + 0.0)
    local forward = vec3(-math.sin(math.rad(heading)), math.cos(math.rad(heading)), 0.0)
    local offset  = here - line
    if ((offset.x * forward.x) + (offset.y * forward.y)) > LINE_METRES then return 'backup' end

    return 'ready'
end

---The board standing for a race id, so the start line can be resolved away from this file.
---@param raceId string
---@return table|nil entry
function board.entryFor(raceId)
    for i = 1, #Boards do
        if Boards[i].id == raceId then return Boards[i] end
    end
    return nil
end

---Why this racer may not be sent off, or nil when they may. Distance is checked here rather than in
---readiness because the board only ever draws to someone already stood at it, while the flag drops
---wherever the racer happens to be.
---@param raceId string
---@return string|nil why one of vehicle, turn, backup, far
function board.ineligible(raceId)
    local entry = board.entryFor(raceId)
    if not entry or not entry.start then return nil end

    local verdict = readiness(entry)
    if verdict ~= 'ready' then return verdict end

    local here = GetEntityCoords(cache.ped)
    local line = vec3(entry.start.x + 0.0, entry.start.y + 0.0, (entry.start.z or 0.0) + 0.0)
    if #(here - line) > LINEUP_RADIUS then return 'far' end

    return nil
end

---Joins or leaves the board the player is stood at. A buy-in is confirmed first so nobody is
---charged by leaning on a key.
local function toggle(entry)
    if Busy then return end
    Busy = true

    CreateThread(function()
        if entry.joined then
            local res = lib.callback.await('sd-phone:server:racing:leave', false, { raceId = entry.id })
            if type(res) == 'table' and res.message then
                lib.notify({ title = locale.t('apps.racing', 'Racing'), description = res.message, type = res.success and 'info' or 'error' })
            end
        else
            local fee = math.max(0, math.floor(tonumber(entry.entryFee) or 0))
            local go  = true
            if fee > 0 then
                go = lib.alertDialog({
                    header   = locale.t('racing.buyInHeader', 'Race buy-in'),
                    content  = locale.t('racing.buyInConfirm',
                        'Joining **{race}** costs **${amount}**. The money comes back if you leave before the start.',
                        { race = entry.name or locale.t('racing.thisRace', 'this race'), amount = fee }),
                    centered = true,
                    cancel   = true,
                }) == 'confirm'
            end

            if go then
                local res = lib.callback.await('sd-phone:server:racing:join', false, {
                    raceId    = entry.id,
                    modelHash = currentModel(),
                })
                if type(res) == 'table' and res.message then
                    lib.notify({ title = locale.t('apps.racing', 'Racing'), description = res.message, type = res.success and 'success' or 'error' })
                end
            end
        end

        board.refresh()
        Busy = false
    end)
end

---Per-frame: keeps the on-screen board pinned to its start point and reads [E].
local function drawLoop()
    CreateThread(function()
        while ENABLED do
            local wait = 500

            local here = GetEntityCoords(cache.ped)
            syncBlips(here)

            if race.active() or #Boards == 0 then
                if Shown then
                    Shown, ShownSig = nil, nil
                    SendNUIMessage({ action = 'sd-phone:racing:board:hide' })
                end
            else
                local entry, distance = nearest(here)

                if entry and distance <= SHOW_DIST then
                    wait = 0
                    local start = entry.start
                    local on, sx, sy = World3dToScreen2d(start.x + 0.0, start.y + 0.0, (start.z or 0.0) + 1.4)

                    local sig = ('%s|%s|%s|%s|%s'):format(
                        tostring(entry.id), tostring(entry.registered), tostring(entry.maxRacers),
                        tostring(entry.prizePool), tostring(entry.startsAt))

                    if sig ~= ShownSig then
                        Shown, ShownSig = entry, sig
                        SendNUIMessage({
                            action = 'sd-phone:racing:board:show',
                            data   = {
                                id         = entry.id,
                                name       = entry.name,
                                trackName  = entry.trackName,
                                class      = entry.class,
                                mode       = entry.mode,
                                laps       = entry.laps,
                                gates      = entry.gates,
                                entryFee   = entry.entryFee,
                                prizePool  = entry.prizePool,
                                registered = entry.registered,
                                maxRacers  = entry.maxRacers,
                                startsAt   = entry.startsAt,
                                joined     = entry.joined,
                            },
                        })
                    end

                    SendNUIMessage({
                        action = 'sd-phone:racing:board:pos',
                        data   = { on = on == 1 or on == true, x = sx, y = sy, joined = entry.joined == true },
                    })

                    if IsControlJustPressed(0, KEY_JOIN) then toggle(entry) end
                elseif Shown then
                    Shown, ShownSig = nil, nil
                    SendNUIMessage({ action = 'sd-phone:racing:board:hide' })
                end
            end

            Wait(wait)
        end
    end)
end

---Reports whether the player is lined up, but only when the verdict changes, so a stationary racer
---costs one event rather than two a second.
local function readyLoop()
    CreateThread(function()
        while ENABLED do
            Wait(READY_MS)

            -- Judged for the nearest board whether or not the seat is taken yet. Joining does not
            -- park you correctly, so a hint that only appears once you are on the grid is missing
            -- for the whole of the shuffle into position it exists to guide.
            local mine = nil
            if not race.active() then
                local here = GetEntityCoords(cache.ped)
                for i = 1, #Boards do
                    local entry = Boards[i]
                    local start = entry.start
                    if start then
                        local d = #(here - vec3(start.x + 0.0, start.y + 0.0, (start.z or 0.0) + 0.0))
                        if d <= LINEUP_RADIUS then mine = entry break end
                    end
                end
            end

            local verdict = mine and readiness(mine) or nil
            if verdict ~= Reported then
                Reported = verdict
                -- Only a seated racer's readiness is the server's business; a passer-by lining up
                -- next to a board they never joined has nothing to report.
                if mine and mine.joined then
                    TriggerServerEvent('sd-phone:server:racing:ready', mine.id, verdict == 'ready')
                end
                SendNUIMessage({
                    action = 'sd-phone:racing:board:lineup',
                    data   = { state = verdict },
                })
            end
        end
    end)
end

function board.start()
    if not ENABLED then return end

    CreateThread(function()
        while true do
            board.refresh()
            Wait(POLL_MS)
        end
    end)

    drawLoop()
    readyLoop()
end

function board.cleanup()
    clearBlips()
    Boards = {}
    Shown = nil
    Reported = nil
end

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then board.cleanup() end
end)

return board
