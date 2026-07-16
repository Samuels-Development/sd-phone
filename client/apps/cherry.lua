---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Thin delegates into server/cherry: profile CRUD, deck swipes, match threads, reactions and
-- blocking.
proxyCallback('sd-phone:cherry:state',         'sd-phone:server:cherry:state')
proxyCallback('sd-phone:cherry:saveProfile',   'sd-phone:server:cherry:saveProfile')
proxyCallback('sd-phone:cherry:swipe',         'sd-phone:server:cherry:swipe')
proxyCallback('sd-phone:cherry:rewind',        'sd-phone:server:cherry:rewind')
proxyCallback('sd-phone:cherry:resetDeck',     'sd-phone:server:cherry:resetDeck')
proxyCallback('sd-phone:cherry:thread',        'sd-phone:server:cherry:thread')
proxyCallback('sd-phone:cherry:send',          'sd-phone:server:cherry:send')
proxyCallback('sd-phone:cherry:react',         'sd-phone:server:cherry:react')
proxyCallback('sd-phone:cherry:unmatch',       'sd-phone:server:cherry:unmatch')
proxyCallback('sd-phone:cherry:block',         'sd-phone:server:cherry:block')
proxyCallback('sd-phone:cherry:blockedList',   'sd-phone:server:cherry:blockedList')
proxyCallback('sd-phone:cherry:unblock',       'sd-phone:server:cherry:unblock')
proxyCallback('sd-phone:cherry:watch',         'sd-phone:server:cherry:watch')
proxyCallback('sd-phone:cherry:deleteAccount', 'sd-phone:server:cherry:deleteAccount')

---Server push: relays a message that arrived in one of our match threads.
---@param payload table { matchId, message } from server/cherry/actions.lua
RegisterNetEvent('sd-phone:client:cherry:message', function(payload)
    SendNUIMessage({ action = 'sd-phone:cherry:message', data = payload })
end)

---Server push: relays a fresh match card.
---@param payload table serialized match record from server/cherry/actions.lua
RegisterNetEvent('sd-phone:client:cherry:match', function(payload)
    SendNUIMessage({ action = 'sd-phone:cherry:match', data = payload })
end)

---Server push: relays an updated thread-message reaction set.
---@param payload table reaction patch from server/cherry/actions.lua
RegisterNetEvent('sd-phone:client:cherry:reaction', function(payload)
    SendNUIMessage({ action = 'sd-phone:cherry:reaction', data = payload })
end)

---Server push: relays an unmatch/block notice.
---@param payload table { matchId } from server/cherry/actions.lua
RegisterNetEvent('sd-phone:client:cherry:unmatch', function(payload)
    SendNUIMessage({ action = 'sd-phone:cherry:unmatch', data = payload })
end)
