---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates into server/notes: note CRUD and nearby sharing.
proxy('sd-phone:notes:list',   'sd-phone:server:notes:list')
proxy('sd-phone:notes:get',    'sd-phone:server:notes:get')
proxy('sd-phone:notes:save',   'sd-phone:server:notes:save')
proxy('sd-phone:notes:delete', 'sd-phone:server:notes:delete')
proxy('sd-phone:notes:share',  'sd-phone:server:notes:share')

---Server push: a note shared to us was accepted server-side; relays it to the open app.
---@param note table note record from server/notes/actions.lua
RegisterNetEvent('sd-phone:client:notes:added', function(note)
    SendNUIMessage({ action = 'sd-phone:notes:added', data = note })
end)
