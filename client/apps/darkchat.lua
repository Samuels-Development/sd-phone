---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates into server/darkchat: room lifecycle, membership, messaging, reactions and
-- nicknames.
proxy('sd-phone:darkchat:rooms',    'sd-phone:server:darkchat:rooms')
proxy('sd-phone:darkchat:open',     'sd-phone:server:darkchat:open')
proxy('sd-phone:darkchat:close',    'sd-phone:server:darkchat:close')
proxy('sd-phone:darkchat:send',     'sd-phone:server:darkchat:send')
proxy('sd-phone:darkchat:react',    'sd-phone:server:darkchat:react')
proxy('sd-phone:darkchat:create',   'sd-phone:server:darkchat:create')
proxy('sd-phone:darkchat:join',     'sd-phone:server:darkchat:join')
proxy('sd-phone:darkchat:leave',    'sd-phone:server:darkchat:leave')
proxy('sd-phone:darkchat:nickname', 'sd-phone:server:darkchat:nickname')
proxy('sd-phone:darkchat:exit',     'sd-phone:server:darkchat:exit')
proxy('sd-phone:darkchat:roomInfo', 'sd-phone:server:darkchat:roomInfo')
proxy('sd-phone:darkchat:notifications', 'sd-phone:server:darkchat:notifications')
proxy('sd-phone:darkchat:kick',     'sd-phone:server:darkchat:kick')

---Server push: a message landed in a room we're a member of; relays it to an open room.
---@param data table message record from server/darkchat
RegisterNetEvent('sd-phone:client:darkchat:message', function(data)
    SendNUIMessage({ action = 'sd-phone:darkchat:message', data = data })
end)

---Server push: a room's active-member presence changed; relays the updated presence.
---@param data table presence patch from server/darkchat
RegisterNetEvent('sd-phone:client:darkchat:active', function(data)
    SendNUIMessage({ action = 'sd-phone:darkchat:active', data = data })
end)

---Server push: a reaction changed on a message in one of our rooms; relays the updated set.
---@param data table reaction patch from server/darkchat
RegisterNetEvent('sd-phone:client:darkchat:reaction', function(data)
    SendNUIMessage({ action = 'sd-phone:darkchat:reaction', data = data })
end)

---Server push: the room's creator removed us; relays it so the app drops the room live.
---@param data table { roomId } from server/darkchat
RegisterNetEvent('sd-phone:client:darkchat:kicked', function(data)
    SendNUIMessage({ action = 'sd-phone:darkchat:kicked', data = data })
end)
