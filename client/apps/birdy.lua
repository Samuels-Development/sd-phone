---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Thin delegates into server/birdy: account session, profiles, the feed, posting, likes,
-- follows, notifications and DMs.
proxyCallback('sd-phone:birdy:me',            'sd-phone:server:birdy:me')
proxyCallback('sd-phone:birdy:register',      'sd-phone:server:birdy:register')
proxyCallback('sd-phone:birdy:login',         'sd-phone:server:birdy:login')
proxyCallback('sd-phone:birdy:logout',        'sd-phone:server:birdy:logout')
proxyCallback('sd-phone:birdy:profile',        'sd-phone:server:birdy:profile')
proxyCallback('sd-phone:birdy:profilePosts',   'sd-phone:server:birdy:profilePosts')
proxyCallback('sd-phone:birdy:search',         'sd-phone:server:birdy:search')
proxyCallback('sd-phone:birdy:updateProfile',  'sd-phone:server:birdy:updateProfile')
proxyCallback('sd-phone:birdy:changePassword', 'sd-phone:server:birdy:changePassword')
proxyCallback('sd-phone:birdy:deleteAccount',  'sd-phone:server:birdy:deleteAccount')
proxyCallback('sd-phone:birdy:feed',          'sd-phone:server:birdy:feed')
proxyCallback('sd-phone:birdy:post',          'sd-phone:server:birdy:post')
proxyCallback('sd-phone:birdy:create',        'sd-phone:server:birdy:create')
proxyCallback('sd-phone:birdy:reply',         'sd-phone:server:birdy:reply')
proxyCallback('sd-phone:birdy:toggleLike',    'sd-phone:server:birdy:toggleLike')
proxyCallback('sd-phone:birdy:toggleFollow',  'sd-phone:server:birdy:toggleFollow')
proxyCallback('sd-phone:birdy:toggleRepost', 'sd-phone:server:birdy:toggleRepost')
proxyCallback('sd-phone:birdy:followList',    'sd-phone:server:birdy:followList')
proxyCallback('sd-phone:birdy:notifications', 'sd-phone:server:birdy:notifications')
proxyCallback('sd-phone:birdy:dmList',        'sd-phone:server:birdy:dmList')
proxyCallback('sd-phone:birdy:dmThread',      'sd-phone:server:birdy:dmThread')
proxyCallback('sd-phone:birdy:dmSend',        'sd-phone:server:birdy:dmSend')
proxyCallback('sd-phone:birdy:dmReact',       'sd-phone:server:birdy:dmReact')

---Server push: relays a DM that arrived for our logged-in Birdy account.
---@param data table DM record from server/birdy/init.lua
RegisterNetEvent('sd-phone:client:birdy:dmReceived', function(data)
    SendNUIMessage({ action = 'sd-phone:birdy:dmReceived', data = data })
end)

---Server push: relays an updated DM reaction set.
---@param data table reaction patch from server/birdy/init.lua
RegisterNetEvent('sd-phone:client:birdy:dmReaction', function(data)
    SendNUIMessage({ action = 'sd-phone:birdy:dmReaction', data = data })
end)

---Server push: relays a notification nudge (like, reply, follow).
---@param data table notification nudge from server/birdy/init.lua (currently empty)
RegisterNetEvent('sd-phone:client:birdy:notification', function(data)
    SendNUIMessage({ action = 'sd-phone:birdy:notification', data = data })
end)

---Server push: somebody posted, so any open feed is now stale.
---@param data table empty payload from server/birdy/actions.lua
RegisterNetEvent('sd-phone:client:birdy:feedChanged', function(data)
    SendNUIMessage({ action = 'sd-phone:birdy:feedChanged', data = data or {} })
end)
