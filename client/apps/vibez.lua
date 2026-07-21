---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

---@type string[] Every pure-proxy Vibez action: NUI 'sd-phone:vibez:<name>' forwards to server
---'sd-phone:server:vibez:<name>' with no client-side logic in between.
local ACTIONS = {
    'feed', 'discover', 'post', 'create', 'deletePost', 'toggleLike', 'toggleSave', 'addView',
    'comments', 'addComment', 'toggleCommentLike', 'profile', 'profilePosts', 'likedPosts',
    'savedPosts', 'updateProfile', 'toggleFollow', 'followList', 'search',
    'activity', 'counts', 'dismissNotification', 'deleteAccount',
    'lives', 'liveStart', 'liveJoin', 'liveLeave', 'liveEnd', 'liveComment', 'liveHeart',
}

-- Thin delegates: each action proxies straight into its server callback.
for _, action in ipairs(ACTIONS) do
    proxyCallback('sd-phone:vibez:' .. action, 'sd-phone:server:vibez:' .. action)
end

---Host frame push (JPEG fallback): relays a base64 frame to the server over a latent event.
---@param payload table { liveId: any, frame: string }
RegisterNUICallback('sd-phone:vibez:liveFrame', function(payload, cb)
    local frame = payload and payload.frame
    if type(frame) == 'string' and frame ~= '' then
        TriggerLatentServerEvent('sd-phone:server:vibez:liveFrame', 256 * 1024, {
            liveId = payload.liveId,
            frame  = frame,
        })
    end
    cb({ ok = true })
end)

---Host video chunk push: relays a MediaRecorder segment to the server over a latent event;
---`init` marks the stream-header chunk.
---@param payload table { liveId: any, chunk: string, init?: boolean, mime?: string }
RegisterNUICallback('sd-phone:vibez:liveChunk', function(payload, cb)
    local chunk = payload and payload.chunk
    if type(chunk) == 'string' and chunk ~= '' then
        TriggerLatentServerEvent('sd-phone:server:vibez:liveChunk', 512 * 1024, {
            liveId = payload.liveId,
            chunk  = chunk,
            init   = payload.init == true,
            mime   = payload.mime,
        })
    end
    cb({ ok = true })
end)

---@type string[] Server pushes (server/vibez) relayed 1:1 into the React app under the matching
---'sd-phone:vibez:<name>' NUI action.
local EVENTS = {
    'notification', 'feedChanged', 'postChanged', 'postRemoved', 'followChanged',
    'liveFrame', 'liveChunk', 'liveComment', 'liveHeart', 'liveViewers', 'liveEnded', 'liveChanged',
}

-- Thin relays: each push forwards unchanged.
for _, ev in ipairs(EVENTS) do
    RegisterNetEvent('sd-phone:client:vibez:' .. ev, function(payload)
        SendNUIMessage({ action = 'sd-phone:vibez:' .. ev, data = payload })
    end)
end
