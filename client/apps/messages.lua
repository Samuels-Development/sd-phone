---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Thin delegates into server/messages: thread listing, sending, group management, read
-- receipts, deletes and reactions.
proxyCallback('sd-phone:messages:list',        'sd-phone:server:messages:list')
proxyCallback('sd-phone:messages:send',        'sd-phone:server:messages:send')
proxyCallback('sd-phone:messages:uploadVoice', 'sd-phone:server:messages:uploadVoice')
proxyCallback('sd-phone:messages:createGroup', 'sd-phone:server:messages:createGroup')
proxyCallback('sd-phone:messages:addGroupMember', 'sd-phone:server:messages:addGroupMember')
proxyCallback('sd-phone:messages:updateGroup', 'sd-phone:server:messages:updateGroup')
proxyCallback('sd-phone:messages:removeGroupMember', 'sd-phone:server:messages:removeGroupMember')
proxyCallback('sd-phone:messages:markRead',    'sd-phone:server:messages:markRead')
proxyCallback('sd-phone:messages:delete',      'sd-phone:server:messages:delete')
proxyCallback('sd-phone:messages:react',       'sd-phone:server:messages:react')

---Server push: relays an updated conversation slice.
---@param conversation table conversation slice from server/messages
RegisterNetEvent('sd-phone:client:messages:incoming', function(conversation)
    SendNUIMessage({ action = 'sd-phone:messages:incoming', data = conversation })
end)

---Server push: relays an updated reaction set for our copy of a message.
---@param payload table reaction patch from server/messages
RegisterNetEvent('sd-phone:client:messages:reaction', function(payload)
    SendNUIMessage({ action = 'sd-phone:messages:reaction', data = payload })
end)

---Server push: relays a group-removal notice.
---@param payload table removal notice from server/messages
RegisterNetEvent('sd-phone:client:messages:removed', function(payload)
    SendNUIMessage({ action = 'sd-phone:messages:removed', data = payload })
end)

---Server push: relays a request-card meta patch.
---@param payload table meta patch from server/messages
RegisterNetEvent('sd-phone:client:messages:meta', function(payload)
    SendNUIMessage({ action = 'sd-phone:messages:meta', data = payload })
end)
