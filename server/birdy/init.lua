---@type table Birdy persistence layer (server.birdy.store): schema bootstrap.
local store   = require 'server.birdy.store'
---@type table Authoritative Birdy handlers (server.birdy.actions): all validation + mutation.
local actions = require 'server.birdy.actions'
---@type table Player bridge (bridge.server.player): citizenid -> online source for pushes.
local player  = require 'bridge.server.player'

-- Boot thread: creates/upgrades the phone_birdy_* tables.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        print(('^1[sd-phone:birdy]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:birdy]^0 schema ready')
end)

---Pushes an event to a single player. No-op when they're offline.
---@param src number|nil online server id, or nil
---@param event string client event name
---@param payload any
local function pushTo(src, event, payload)
    if not src then return end
    TriggerClientEvent(event, src, payload)
end

---Forwards an action result, pinging the `notifyCid` player (if online) with a notification
---event, then stripping that internal field.
---@param result table
---@return table
local function withNotifyPush(result)
    if result.success and result.data and result.data.notifyCid then
        pushTo(player.getSourceByIdentifier(result.data.notifyCid), 'sd-phone:client:birdy:notification', {})
        result.data.notifyCid = nil
    end
    return result
end

-- App callbacks: thin delegates into server.birdy.actions.
lib.callback.register('sd-phone:server:birdy:me',             function(src)          return actions.me(src) end)
lib.callback.register('sd-phone:server:birdy:register',       function(src, payload) return actions.register(src, payload) end)
lib.callback.register('sd-phone:server:birdy:login',          function(src, payload) return actions.login(src, payload) end)
lib.callback.register('sd-phone:server:birdy:logout',         function(src)          return actions.logout(src) end)
lib.callback.register('sd-phone:server:birdy:profile',        function(src, payload) return actions.profile(src, payload) end)
lib.callback.register('sd-phone:server:birdy:profilePosts',   function(src, payload) return actions.profilePosts(src, payload) end)
lib.callback.register('sd-phone:server:birdy:search',         function(src, payload) return actions.search(src, payload) end)
lib.callback.register('sd-phone:server:birdy:updateProfile',  function(src, payload) return actions.updateProfile(src, payload) end)
lib.callback.register('sd-phone:server:birdy:changePassword', function(src, payload) return actions.changePassword(src, payload) end)
lib.callback.register('sd-phone:server:birdy:deleteAccount',  function(src)          return actions.deleteAccount(src) end)
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

---Sends a DM: delivers the recipient's copy as a live push when they're online, then rewrites
---the envelope so the sender only receives their own message.
---@param src number player server id
---@param payload table forwarded to actions.dmSend, which owns all validation
lib.callback.register('sd-phone:server:birdy:dmSend', function(src, payload)
    local result = actions.dmSend(src, payload)
    if result.success and result.data then
        local d = result.data
        pushTo(player.getSourceByIdentifier(d.toCid), 'sd-phone:client:birdy:dmReceived', {
            conversationId = d.fromCid,
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
        pushTo(player.getSourceByIdentifier(d.otherCid), 'sd-phone:client:birdy:dmReaction', {
            conversationId = d.conversationId,
            id             = d.id,
            reactions      = d.otherReactions,
        })
        result.data = { id = d.id, reactions = d.reactions }
    end
    return result
end)
