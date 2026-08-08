---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Birdy persistence layer (server.birdy.store): schema bootstrap.
local store   = require 'server.birdy.store'
---@type table Authoritative Birdy handlers (server.birdy.actions): all validation + mutation.
local actions = require 'server.birdy.actions'
---@type table Watcher registry (server.watchers): shared with the feed broadcast in actions.
local watchers = require('server.watchers').of('birdy')
---@type table Shared server helpers (server.util): disconnect sweep registration.
local util    = require 'server.util'

-- Boot thread: creates/upgrades the phone_birdy_* tables.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        boot.schemaFailed('birdy', err)
        return
    end
    boot.schemaReady()
end)

---Pushes an event to every phone signed into a Birdy account. An account can be open on more
---than one character, so a handle resolves to a list of sources rather than one.
---@param handle string|nil Birdy handle
---@param event string client event name
---@param payload any
local function pushTo(handle, event, payload)
    if not handle then return end
    util.pushMany(event, actions.sourcesFor(handle), payload)
end

---Forwards an action result, pinging the `notify` account (wherever it is open) with a
---notification event, then stripping that internal field.
---@param result table
---@return table
local function withNotifyPush(result)
    if result.success and result.data and result.data.notify then
        pushTo(result.data.notify, 'sd-phone:client:birdy:notification', {})
        result.data.notify = nil
    end
    return result
end

-- App callbacks: thin delegates into server.birdy.actions.
lib.callback.register('sd-phone:server:birdy:me',             function(src)          return actions.me(src) end)
lib.callback.register('sd-phone:server:birdy:register',       function(src, payload) return actions.register(src, payload) end)
lib.callback.register('sd-phone:server:birdy:login',          function(src, payload) return actions.login(src, payload) end)
lib.callback.register('sd-phone:server:birdy:logout',         function(src)          return actions.logout(src) end)
lib.callback.register('sd-phone:server:birdy:deletePost',    function(src, payload) return actions.deletePost(src, payload) end)
lib.callback.register('sd-phone:server:birdy:profile',        function(src, payload) return actions.profile(src, payload) end)
lib.callback.register('sd-phone:server:birdy:profilePosts',   function(src, payload) return actions.profilePosts(src, payload) end)
lib.callback.register('sd-phone:server:birdy:search',         function(src, payload) return actions.search(src, payload) end)
lib.callback.register('sd-phone:server:birdy:trending',       function()             return actions.trending() end)
lib.callback.register('sd-phone:server:birdy:hashtag',        function(src, payload) return actions.hashtag(src, payload) end)
lib.callback.register('sd-phone:server:birdy:updateProfile',  function(src, payload) return actions.updateProfile(src, payload) end)
lib.callback.register('sd-phone:server:birdy:changePassword', function(src, payload) return actions.changePassword(src, payload) end)
lib.callback.register('sd-phone:server:birdy:deleteAccount',  function(src)          return actions.deleteAccount(src) end)
lib.callback.register('sd-phone:server:birdy:verificationOffer',    function(src) return actions.verificationOffer(src) end)
lib.callback.register('sd-phone:server:birdy:purchaseVerification', function(src) return actions.purchaseVerification(src) end)
lib.callback.register('sd-phone:server:birdy:feed',           function(src, payload) return actions.feed(src, payload) end)
lib.callback.register('sd-phone:server:birdy:post',           function(src, payload) return actions.post(src, payload) end)
lib.callback.register('sd-phone:server:birdy:create',         function(src, payload) return actions.create(src, payload) end)
lib.callback.register('sd-phone:server:birdy:reply',          function(src, payload) return withNotifyPush(actions.reply(src, payload)) end)
lib.callback.register('sd-phone:server:birdy:toggleLike',     function(src, payload) return withNotifyPush(actions.toggleLike(src, payload)) end)
lib.callback.register('sd-phone:server:birdy:toggleFollow',   function(src, payload) return withNotifyPush(actions.toggleFollow(src, payload)) end)
lib.callback.register('sd-phone:server:birdy:toggleRepost',   function(src, payload) return withNotifyPush(actions.toggleRepost(src, payload)) end)
lib.callback.register('sd-phone:server:birdy:followList',     function(src, payload) return actions.followList(src, payload) end)
lib.callback.register('sd-phone:server:birdy:notifications',  function(src)          return actions.notifications(src) end)
lib.callback.register('sd-phone:server:birdy:notificationCount', function(src)        return actions.notificationCount(src) end)
lib.callback.register('sd-phone:server:birdy:dmResolve',      function(src, payload) return actions.dmResolve(src, payload) end)
lib.callback.register('sd-phone:server:birdy:dmList',         function(src)          return actions.dmList(src) end)
lib.callback.register('sd-phone:server:birdy:dmThread',       function(src, payload) return actions.dmThread(src, payload) end)
lib.callback.register('sd-phone:server:birdy:dmMarkRead',     function(src, payload) return actions.markRead(src, payload) end)

---Subscribes or unsubscribes the caller to the feed push. The app calls this whenever it moves in
---or out of the foreground, and refetches the feed on the way back in.
---@param src number player server id
---@param payload table { on: boolean }
lib.callback.register('sd-phone:server:birdy:watch', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    watchers.watch(src, payload.on == true)
    return { success = true }
end)

-- Drops a departing watcher's entry.
util.onCleanup(function(src) watchers.drop(src) end)

---Sends a DM: delivers the recipient's copy as a live push when they're online, then rewrites
---the envelope so the sender only receives their own message.
---@param src number player server id
---@param payload table forwarded to actions.dmSend, which owns all validation
lib.callback.register('sd-phone:server:birdy:dmSend', function(src, payload)
    local result = actions.dmSend(src, payload)
    if result.success and result.data then
        local d = result.data
        pushTo(d.to, 'sd-phone:client:birdy:dmReceived', {
            conversationId = d.from,
            user           = d.fromProfile,
            message        = d.messageForOther,
        })
        result.data = { message = d.message }
    end
    return result
end)

---Toggles a DM reaction: pushes the other participant their per-viewer reaction set, then
---rewrites the envelope so the caller only receives their own view.
---@param src number player server id
---@param payload table forwarded to actions.dmReact, which owns all validation
lib.callback.register('sd-phone:server:birdy:dmReact', function(src, payload)
    local result = actions.dmReact(src, payload)
    if result.success and result.data then
        local d = result.data
        pushTo(d.other, 'sd-phone:client:birdy:dmReaction', {
            conversationId = d.conversationId,
            id             = d.id,
            reactions      = d.otherReactions,
        })
        result.data = { id = d.id, reactions = d.reactions }
    end
    return result
end)
