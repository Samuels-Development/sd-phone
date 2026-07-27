---@type fun(nuiAction: string, serverEvent: string) NUI->server proxy factory (client.nui).
local proxy = require 'client.nui'

-- Settings -> SIM & Backup (unique-phones mode): panel snapshot, SIM eject, cloud backup.
proxy('sd-phone:sim:get',            'sd-phone:server:sim:get')
proxy('sd-phone:sim:eject',          'sd-phone:server:sim:eject')
proxy('sd-phone:sim:backup:set',     'sd-phone:server:sim:backup:set')
proxy('sd-phone:sim:backup:sync',    'sd-phone:server:sim:backup:sync')
proxy('sd-phone:sim:backup:setAuto', 'sd-phone:server:sim:backup:setAuto')
proxy('sd-phone:sim:backup:delete',  'sd-phone:server:sim:backup:delete')
proxy('sd-phone:sim:backup:restore', 'sd-phone:server:sim:backup:restore')

---Opens the SIM tray of the phone in `slot`. Exported for the phone item's ox_inventory `buttons`
---entry (see the README); the server re-derives the tray from the slot and force-opens it.
---@param slot number inventory slot holding the phone
exports('openSimTray', function(slot)
    TriggerServerEvent('sd-phone:server:sim:openTray', slot)
end)
