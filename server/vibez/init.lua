---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Vibez persistence layer (server.vibez.store): schema bootstrap + row CRUD.
local store   = require 'server.vibez.store'
---@type table Authoritative vibez handlers (server.vibez.actions): validation + world mutation.
local actions = require 'server.vibez.actions'
---@type table Vibez Live module (server.vibez.live): in-memory livestream sessions + host-media relay.
local live    = require 'server.vibez.live'
---@type table Clout TTS module (server.vibez.tts): drops a leaver's remembered preview clip.
local tts     = require 'server.vibez.tts'
---@type table Watcher registry (server.watchers): shared with the broadcasts in actions and live.
local watchers = require('server.watchers').of('vibez')
---@type table Shared server helpers (server.util): disconnect sweep registration.
local util    = require 'server.util'

-- Boot thread: creates the vibez tables.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('vibez', err)
        return
    end
    boot.schemaReady()
end)

---Registers one vibez callback under the app's namespace.
---@param action string callback name suffix
---@param fn function handler
local function register(action, fn)
    lib.callback.register('sd-phone:server:vibez:' .. action, fn)
end

-- App callbacks: thin delegates into server.vibez.actions.
register('feed',              function(src, payload) return actions.feed(src, payload) end)
register('discover',          function(src) return actions.discover(src) end)
register('post',              function(src, payload) return actions.post(src, payload) end)
register('create',            function(src, payload) return actions.create(src, payload) end)
register('ttsPreview',        function(src, payload) return actions.ttsPreview(src, payload) end)
register('deletePost',        function(src, payload) return actions.deletePost(src, payload) end)
register('toggleLike',        function(src, payload) return actions.toggleLike(src, payload) end)
register('toggleSave',        function(src, payload) return actions.toggleSave(src, payload) end)
register('addView',           function(src, payload) return actions.addView(src, payload) end)
register('comments',          function(src, payload) return actions.comments(src, payload) end)
register('addComment',        function(src, payload) return actions.addComment(src, payload) end)
register('toggleCommentLike', function(src, payload) return actions.toggleCommentLike(src, payload) end)
register('profile',           function(src, payload) return actions.profile(src, payload) end)
register('profilePosts',      function(src, payload) return actions.profilePosts(src, payload) end)
register('likedPosts',        function(src) return actions.likedPosts(src) end)
register('savedPosts',        function(src) return actions.savedPosts(src) end)
register('updateProfile',     function(src, payload) return actions.updateProfile(src, payload) end)
register('toggleFollow',      function(src, payload) return actions.toggleFollow(src, payload) end)
register('followList',        function(src, payload) return actions.followList(src, payload) end)
register('search',            function(src, payload) return actions.search(src, payload) end)
register('activity',          function(src) return actions.activity(src) end)
register('counts',            function(src) return actions.counts(src) end)
register('dismissNotification', function(src, payload) return actions.dismissNotification(src, payload) end)
register('deleteAccount',     function(src) return actions.deleteAccount(src) end)

---Subscribes or unsubscribes the caller to the feed and live-list pushes. The app calls this
---whenever it moves in or out of the foreground, and re-syncs on the way back in.
---@param src integer player server id
---@param payload table { on: boolean }
register('watch', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    watchers.watch(src, payload.on == true)
    return { success = true }
end)

-- Drops a departing watcher's entry.
util.onCleanup(function(src) watchers.drop(src); tts.forget(src) end)

-- Live session callbacks: thin delegates into server.vibez.live.
register('lives',             function(src) return actions.lives(src) end)
register('liveStart',         function(src) return live.start(src) end)
register('liveJoin',          function(src, payload) return live.join(src, payload) end)
register('liveLeave',         function(src, payload) return live.leave(src, payload) end)
register('liveEnd',           function(src, payload) return live.endLive(src, payload) end)
register('liveComment',       function(src, payload) return live.comment(src, payload) end)
register('liveHeart',         function(src, payload) return live.heart(src, payload) end)
register('liveTransport',     function(src, payload) return live.transport(src, payload) end)

---Host JPEG frame push: drops non-table payloads and forwards to live.frame.
---@param payload table { liveId: string, frame: string }
RegisterNetEvent('sd-phone:server:vibez:liveFrame', function(payload)
    if type(payload) ~= 'table' then return end
    live.frame(source, payload)
end)

---Host encoded-video chunk push: drops non-table payloads and forwards to live.chunk. Every chunk
---that arrives is acked before anything can refuse it, because the ack is how the host's client
---(client/livepace.lua) measures its own uplink: it reports receipt, not acceptance.
---@param payload table { liveId: string, chunk: string, init?: boolean, mime?: string }
RegisterNetEvent('sd-phone:server:vibez:liveChunk', function(payload)
    if type(payload) ~= 'table' then return end
    local src = source
    if type(payload.chunk) == 'string' then
        TriggerClientEvent('sd-phone:client:vibez:liveAck', src, #payload.chunk)
    end
    live.chunk(src, payload)
end)
