---@type table Bodycam config (configs/bodycam.lua): the enable switch and the eligible jobs.
local CFG = require 'configs.bodycam'

---@type boolean Whether cameras exist on this server at all. With this off nothing below runs: no
---event handler, no thread, no NUI message.
local ENABLED = CFG.Enabled == true

---@type integer Follow-cam view mode that puts the player in first person. The bodycam uses the
---player's OWN view mode rather than a scripted camera, because the capture is the frame this
---client is already rendering: a scripted cam pointed anywhere else would move the officer's own
---screen there too.
local FIRST_PERSON_VIEW <const> = 4

---@type integer Milliseconds between re-announcements of a live demand to the NUI. The phone page
---loads its app chunks lazily, so a demand can arrive before the broadcaster module exists; a
---repeat is one small message and it is what makes the start reliable rather than racy.
local ANNOUNCE_MS <const> = 4000

---@type integer Milliseconds between view-mode re-assertions while broadcasting. Getting in and
---out of a vehicle swaps which of the two follow cams is in charge, so first person has to be
---re-applied rather than set once.
local VIEW_MS <const> = 1000

---@type integer Byte-per-second pacing on a media chunk travelling to the server.
local CHUNK_BPS <const> = 512 * 1024

---@type table|nil The demand the server currently has on this client, nil when it wants nothing.
local demand = nil
---@type boolean Whether the officer's own camera surface (Camera app, video call) holds the game
---view. While it does the bodycam yields rather than fighting the single-consumer renderer.
local yielded = false
---@type integer|nil The on-foot view mode saved before first person was forced.
local savedPedView = nil
---@type integer|nil The in-vehicle view mode saved before first person was forced.
local savedVehicleView = nil
---@type boolean Whether the view-mode thread is already running.
local viewThreadUp = false
---@type boolean Whether the demand re-announcement thread is already running.
local announceThreadUp = false
---@type boolean Whether the page last reported that it is publishing over the media relay rather
---than through this client. Remembered so the two other places that report state cannot silently
---retract it and leave the terminals told to watch a transport nobody is publishing on.
local onRelay = false
---@type boolean Whether the page last reported that it cannot capture at all, remembered for the
---same reason.
local unsupported = false

---The demand as the page should see it. A demand is withheld while the officer's own camera surface
---holds the renderer, rather than cancelled, so the broadcast resumes the moment it is handed back.
---@return table payload { on, gen?, quality?, enc?, streamId? }
local function demandPayload()
    if not demand then return { on = false } end
    return {
        on        = demand.on == true and not yielded,
        gen       = demand.gen,
        citizenid = demand.citizenid,
        quality   = demand.quality,
        enc       = demand.enc,
        streamId  = demand.streamId,
    }
end

---Hands the current demand to the NUI. Idempotent on the page's side: a repeat carrying the same
---generation is ignored there, so re-announcing costs nothing but reliability.
local function announce()
    SendNUIMessage({ action = 'sd-phone:mdt:cameraDemand', data = demandPayload() })
end

---Tells the server how this client's camera stands: whether its own camera app has the view,
---whether it can capture at all, and which transport its frames are leaving on. One place, so a
---report about one of the three can never quietly overwrite the other two.
local function reportState()
    TriggerServerEvent('sd-phone:server:mdt:cameraState', {
        busy        = yielded,
        unsupported = unsupported,
        relay       = onRelay and not yielded,
    })
end

---Puts the officer into first person, remembering what they were on so it can be given back.
local function takeFirstPerson()
    if savedPedView == nil then
        savedPedView = GetFollowPedCamViewMode()
    end
    if savedVehicleView == nil then
        savedVehicleView = GetFollowVehicleCamViewMode()
    end
    SetFollowPedCamViewMode(FIRST_PERSON_VIEW)
    SetFollowVehicleCamViewMode(FIRST_PERSON_VIEW)
end

---Gives the officer back the view they were on before the broadcast started.
local function releaseFirstPerson()
    if savedPedView ~= nil then
        SetFollowPedCamViewMode(savedPedView)
        savedPedView = nil
    end
    if savedVehicleView ~= nil then
        SetFollowVehicleCamViewMode(savedVehicleView)
        savedVehicleView = nil
    end
end

---Whether the officer should be in first person right now.
---@return boolean
local function wantsFirstPerson()
    return CFG.FirstPerson ~= false and demand ~= nil and demand.on == true and not yielded
end

---Holds the view mode for as long as the broadcast wants it, then hands it back and exits. One
---thread at a time, and none at all while nobody is watching.
local function ensureViewThread()
    if viewThreadUp then return end
    viewThreadUp = true

    CreateThread(function()
        while wantsFirstPerson() do
            takeFirstPerson()
            Wait(VIEW_MS)
        end
        releaseFirstPerson()
        viewThreadUp = false
    end)
end

---Repeats a live demand until it is withdrawn, so the broadcaster page picks it up whenever it
---finishes loading its app chunks. One thread at a time, and none while nobody is watching.
local function ensureAnnounceThread()
    if announceThreadUp then return end
    announceThreadUp = true

    CreateThread(function()
        while demand ~= nil and demand.on == true do
            Wait(ANNOUNCE_MS)
            if demand ~= nil and demand.on == true then announce() end
        end
        announceThreadUp = false
    end)
end

if ENABLED then
    ---Server push: start or stop publishing this client's view. The whole point of the push is
    ---that an officer nobody is watching never receives one, so their client holds no renderer, no
    ---encoder and no timers.
    ---@param payload table { on, gen, quality, enc, firstPerson }
    RegisterNetEvent('sd-phone:client:mdt:cameraDemand', function(payload)
        if type(payload) ~= 'table' or payload.on ~= true then
            demand  = nil
            onRelay = false
            announce()
            return
        end

        demand = {
            on        = true,
            gen       = payload.gen,
            citizenid = type(payload.citizenid) == 'string' and payload.citizenid or nil,
            quality   = payload.quality,
            enc      = type(payload.enc) == 'table' and payload.enc or nil,
            streamId = type(payload.streamId) == 'string' and payload.streamId or nil,
        }
        announce()
        ensureAnnounceThread()
        if payload.firstPerson ~= false then ensureViewThread() end

        -- Re-state the yield with every demand. A session the server had forgotten comes back
        -- believing the camera is idle, and without this the tile would sit on "connecting" for
        -- as long as the officer's own camera surface holds the renderer.
        if yielded then reportState() end
    end)

    ---Server push: re-anchor now. A terminal has joined, or the run this client was feeding was
    ---cut, and either way the only thing a terminal can start from is a fresh header. The encoder
    ---restarts rather than continuing, which is a visible cut for anyone already watching, so the
    ---server asks for this sparingly rather than on a timer.
    ---@param payload table { gen }
    RegisterNetEvent('sd-phone:client:mdt:cameraAnchor', function(payload)
        if not demand or not demand.on then return end
        if type(payload) == 'table' and payload.gen ~= nil and payload.gen ~= demand.gen then return end
        SendNUIMessage({ action = 'sd-phone:mdt:cameraAnchor', data = { gen = demand.gen } })
    end)

    ---Server push: which terminals hold a peer connection to this camera, and whether anything
    ---still needs the encoded chunks. A camera watched only over peer connections stops encoding:
    ---the page keeps the capture running to feed the peers and stops producing segments nobody is
    ---waiting for.
    ---@param payload table { gen, viewers, encode }
    RegisterNetEvent('sd-phone:client:mdt:cameraPeers', function(payload)
        if type(payload) ~= 'table' then return end
        SendNUIMessage({ action = 'sd-phone:mdt:cameraPeers', data = payload })
    end)

    ---Server push: one WebRTC handshake message from the other end of a peer connection. Opaque
    ---here; the page is the only thing that reads it.
    ---@param payload table { citizenid, from, kind, data }
    RegisterNetEvent('sd-phone:client:mdt:cameraSignal', function(payload)
        if type(payload) ~= 'table' then return end
        SendNUIMessage({ action = 'sd-phone:mdt:cameraSignal', data = payload })
    end)

    ---React -> Lua: one WebRTC handshake message on its way to the other end. A plain event rather
    ---than a latent one: these are small and their order is the handshake.
    ---@param payload table { citizenid, to, kind, data }
    RegisterNUICallback('sd-phone:mdt:cameraSignal', function(payload, cb)
        if type(payload) == 'table' then
            TriggerServerEvent('sd-phone:server:mdt:cameraSignal', payload)
        end
        cb({ success = true })
    end)

    ---React -> Lua: the broadcaster page asking what the server currently wants, for the case
    ---where the demand landed before the page had loaded this app's chunk.
    RegisterNUICallback('sd-phone:mdt:cameraSync', function(_, cb)
        cb({ success = true, data = demandPayload() })
    end)

    ---React -> Lua: one encoded segment on its way to the server relay. Latent, so a segment is
    ---paced onto the wire instead of blocking the net thread. This is the fallback path: with a
    ---media relay configured and reachable the page sends its frames straight down its own socket
    ---and nothing arrives here at all.
    ---@param payload table { gen, chunk, init?, mime? }
    RegisterNUICallback('sd-phone:mdt:cameraChunk', function(payload, cb)
        local chunk = type(payload) == 'table' and payload.chunk or nil
        if type(chunk) == 'string' and chunk ~= '' then
            TriggerLatentServerEvent('sd-phone:server:mdt:cameraChunk', CHUNK_BPS, {
                gen   = payload.gen,
                chunk = chunk,
                init  = payload.init == true,
                mime  = payload.mime,
            })
        end
        cb({ success = true })
    end)

    ---React -> Lua: the page reporting that it cannot capture at all, so the terminal shows a
    ---reason on the tile rather than a feed that never arrives, and which transport it settled on
    ---so the terminals watching are pointed at the one the frames are actually on.
    ---@param payload table { unsupported?, relay? }
    RegisterNUICallback('sd-phone:mdt:cameraState', function(payload, cb)
        local data = type(payload) == 'table' and payload or {}
        unsupported = data.unsupported == true
        onRelay     = data.relay == true
        reportState()
        cb({ success = true })
    end)

    ---The officer's own camera surface taking or releasing the game view. The live renderer binds
    ---one canvas at a time, so the bodycam stands down for the Camera app and a video call rather
    ---than stealing the feed back from under them.
    ---@param on boolean whether a camera surface is now active
    AddEventHandler('sd-phone:client:cameraMode', function(on)
        local busy = on == true
        if busy == yielded then return end
        yielded = busy

        reportState()
        announce()
        if wantsFirstPerson() then ensureViewThread() end
    end)

    ---Reports the class of the vehicle the officer is in, which decides whether a dashcam tile
    ---appears for it. Driven by the cache rather than a poll, so an officer on foot costs nothing.
    lib.onCache('vehicle', function(vehicle)
        TriggerServerEvent('sd-phone:server:mdt:cameraVehicle', {
            class = vehicle and GetVehicleClass(vehicle) or nil,
        })
    end)

    ---Hands the view back if the resource stops mid-broadcast, so an officer is not left stuck in
    ---first person by a restart.
    ---@param resource string name of the resource that stopped
    AddEventHandler('onResourceStop', function(resource)
        if resource ~= GetCurrentResourceName() then return end
        demand = nil
        releaseFirstPerson()
    end)
end
