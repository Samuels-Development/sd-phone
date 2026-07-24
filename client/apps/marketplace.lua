---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates into server/marketplace: listing CRUD.
proxy('sd-phone:marketplace:list',   'sd-phone:server:marketplace:list')
proxy('sd-phone:marketplace:create', 'sd-phone:server:marketplace:create')
proxy('sd-phone:marketplace:update', 'sd-phone:server:marketplace:update')
proxy('sd-phone:marketplace:delete', 'sd-phone:server:marketplace:delete')
proxy('sd-phone:marketplace:watch',  'sd-phone:server:marketplace:watch')

---Server push (fan-out to every other open phone): another player posted / edited / removed a
---listing. Forwarded straight to the NUI.
---@param payload table feed patch from server/marketplace
RegisterNetEvent('sd-phone:client:marketplace:feed', function(payload)
    SendNUIMessage({ action = 'sd-phone:marketplace:feed', data = payload })
end)
