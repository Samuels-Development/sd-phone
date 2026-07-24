---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates into server/pages: listing CRUD.
proxy('sd-phone:pages:list',   'sd-phone:server:pages:list')
proxy('sd-phone:pages:create', 'sd-phone:server:pages:create')
proxy('sd-phone:pages:update', 'sd-phone:server:pages:update')
proxy('sd-phone:pages:delete', 'sd-phone:server:pages:delete')
proxy('sd-phone:pages:watch',  'sd-phone:server:pages:watch')

---Server push (fan-out to the other phones with Pages open): another player posted / edited /
---removed a listing. Forwarded straight to the NUI.
---@param payload table feed patch from server/pages
RegisterNetEvent('sd-phone:client:pages:feed', function(payload)
    SendNUIMessage({ action = 'sd-phone:pages:feed', data = payload })
end)
