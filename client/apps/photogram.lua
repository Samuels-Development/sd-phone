---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

---@type string[] Every pure-proxy Photogram action: NUI 'sd-phone:photogram:<name>' forwards
---to server 'sd-phone:server:photogram:<name>' with no client-side logic in between.
local ACTIONS = {
    'feed', 'explore', 'post', 'create', 'deletePost', 'toggleLike', 'toggleSave', 'saved',
    'comments', 'addComment', 'toggleCommentLike', 'profile', 'profilePosts', 'updateProfile',
    'toggleFollow', 'respondFollow', 'followRequests', 'followList', 'search',
    'stories', 'addStory', 'markStorySeen', 'activity', 'counts', 'dismissNotification',
    'dmList', 'dmThread', 'dmSend', 'dmReact', 'deleteAccount',
    'liveStart', 'liveJoin', 'liveLeave', 'liveEnd', 'liveComment', 'liveHeart',
}

-- Thin delegates: each action proxies straight into its server callback.
for _, action in ipairs(ACTIONS) do
    proxyCallback('sd-phone:photogram:' .. action, 'sd-phone:server:photogram:' .. action)
end

---Returns a friendly area name for a world point, falling back to the raw zone code, or nil
---when the point has no zone.
---@param x number world x
---@param y number world y
---@param z number|nil world z (0.0 when absent)
---@return string|nil name display label, raw zone code, or nil
local function zoneName(x, y, z)
    local code = GetNameOfZone(x + 0.0, y + 0.0, (z or 0.0) + 0.0)
    if not code or code == '' then return nil end
    local label = GetLabelText(code)
    if label and label ~= '' and label ~= 'NULL' then return label end
    return code
end

---Zone name at the player's current position, for pre-filling the New Post location field.
---Read-only; ignores its payload entirely.
RegisterNUICallback('sd-phone:photogram:currentZone', function(_, cb)
    local coords = GetEntityCoords(PlayerPedId())
    cb({ success = true, data = { name = zoneName(coords.x, coords.y, coords.z) } })
end)

-- Server live pushes relayed 1:1 into the React app: activity ping, new DM, DM reaction.
RegisterNetEvent('sd-phone:client:photogram:notification', function(payload)
    SendNUIMessage({ action = 'sd-phone:photogram:notification', data = payload })
end)

RegisterNetEvent('sd-phone:client:photogram:dmReceived', function(payload)
    SendNUIMessage({ action = 'sd-phone:photogram:dmReceived', data = payload })
end)

RegisterNetEvent('sd-phone:client:photogram:dmReaction', function(payload)
    SendNUIMessage({ action = 'sd-phone:photogram:dmReaction', data = payload })
end)

-- Live content sync, broadcast to all phones: post edited / feed changed / post removed.
RegisterNetEvent('sd-phone:client:photogram:postChanged', function(payload)
    SendNUIMessage({ action = 'sd-phone:photogram:postChanged', data = payload })
end)

RegisterNetEvent('sd-phone:client:photogram:feedChanged', function(payload)
    SendNUIMessage({ action = 'sd-phone:photogram:feedChanged', data = payload })
end)

RegisterNetEvent('sd-phone:client:photogram:postRemoved', function(payload)
    SendNUIMessage({ action = 'sd-phone:photogram:postRemoved', data = payload })
end)

---Targeted at the requester only: their pending follow request was accepted / declined.
---@param payload table follow-request resolution from the server
RegisterNetEvent('sd-phone:client:photogram:followChanged', function(payload)
    SendNUIMessage({ action = 'sd-phone:photogram:followChanged', data = payload })
end)

---Host frame push (JPEG fallback): relays a base64 frame to the server over a latent event.
---@param payload table { liveId: any, frame: string }
RegisterNUICallback('sd-phone:photogram:liveFrame', function(payload, cb)
    local frame = payload and payload.frame
    if type(frame) == 'string' and frame ~= '' then
        TriggerLatentServerEvent('sd-phone:server:photogram:liveFrame', 256 * 1024, {
            liveId = payload.liveId,
            frame  = frame,
        })
    end
    cb({ ok = true })
end)

---Host video chunk push: relays a MediaRecorder segment to the server over a latent event;
---`init` marks the stream-header chunk.
---@param payload table { liveId: any, chunk: string, init?: boolean, mime?: string }
RegisterNUICallback('sd-phone:photogram:liveChunk', function(payload, cb)
    local chunk = payload and payload.chunk
    if type(chunk) == 'string' and chunk ~= '' then
        TriggerLatentServerEvent('sd-phone:server:photogram:liveChunk', 512 * 1024, {
            liveId = payload.liveId,
            chunk  = chunk,
            init   = payload.init == true,
            mime   = payload.mime,
        })
    end
    cb({ ok = true })
end)

---@type string[] Server live-stream pushes (server/photogram/live.lua) relayed 1:1 into the
---React app under the matching 'sd-phone:photogram:<name>' NUI action.
local LIVE_EVENTS = { 'liveFrame', 'liveChunk', 'liveComment', 'liveHeart', 'liveViewers', 'liveEnded', 'liveChanged' }

-- Thin relays: each live push forwards unchanged.
for _, ev in ipairs(LIVE_EVENTS) do
    RegisterNetEvent('sd-phone:client:photogram:' .. ev, function(payload)
        SendNUIMessage({ action = 'sd-phone:photogram:' .. ev, data = payload })
    end)
end
