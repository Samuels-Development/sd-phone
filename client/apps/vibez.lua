---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'
---@type fun(app: string, bitrate: number|nil) Host video chunk registrar (client.livepace).
local livePace = require 'client.livepace'

---@type table Vibez config (configs.vibez): the Live block.
local VIBEZ_CFG = require 'configs.vibez'
---@type boolean Whether players may broadcast; the app hides Go LIVE when off.
local LIVE_ENABLED = type(VIBEZ_CFG.Live) == 'table' and VIBEZ_CFG.Live.Enabled == true

---React -> Lua: whether the Go LIVE action should be offered at all. Read-only.
RegisterNUICallback('sd-phone:vibez:liveEnabled', function(_, cb)
    cb({ success = true, enabled = LIVE_ENABLED })
end)

---@type table Clout TTS config (configs.vibez TTS): whether the composer offers a voiceover, and
---the voice list it shows.
local TTS_CFG = type(VIBEZ_CFG.TTS) == 'table' and VIBEZ_CFG.TTS or {}

---React -> Lua: the text-to-speech options for the upload composer. Read-only.
RegisterNUICallback('sd-phone:vibez:ttsConfig', function(_, cb)
    cb({ success = true, enabled = TTS_CFG.Enabled == true, voices = TTS_CFG.Voices or {} })
end)

---@type string[] Every pure-proxy Vibez action: NUI 'sd-phone:vibez:<name>' forwards to server
---'sd-phone:server:vibez:<name>' with no client-side logic in between.
local ACTIONS = {
    'feed', 'discover', 'post', 'create', 'deletePost', 'toggleLike', 'toggleSave', 'addView',
    'comments', 'addComment', 'toggleCommentLike', 'profile', 'profilePosts', 'likedPosts',
    'savedPosts', 'updateProfile', 'toggleFollow', 'followList', 'search',
    'activity', 'counts', 'dismissNotification', 'deleteAccount', 'watch',
    'lives', 'liveStart', 'liveJoin', 'liveLeave', 'liveEnd', 'liveComment', 'liveHeart',
    'liveTransport', 'ttsPreview',
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

-- Host video chunk push, refused rather than queued when the host's uplink falls behind.
livePace('vibez', type(VIBEZ_CFG.Live) == 'table' and VIBEZ_CFG.Live.Bitrate or nil)

---@type string[] Server pushes (server/vibez) relayed 1:1 into the React app under the matching
---'sd-phone:vibez:<name>' NUI action.
local EVENTS = {
    'notification', 'feedChanged', 'postChanged', 'postRemoved', 'followChanged',
    'liveFrame', 'liveChunk', 'liveTransport', 'liveComment', 'liveHeart', 'liveViewers',
    'liveEnded', 'liveChanged',
}

-- Thin relays: each push forwards unchanged.
for _, ev in ipairs(EVENTS) do
    RegisterNetEvent('sd-phone:client:vibez:' .. ev, function(payload)
        SendNUIMessage({ action = 'sd-phone:vibez:' .. ev, data = payload })
    end)
end
