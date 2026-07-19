---@type fun(nuiAction: string, serverEvent: string) NUI->server proxy factory (client.nui).
local proxy = require 'client.nui'

-- Settings -> SIM & Backup (unique-phones mode): panel snapshot, SIM eject, cloud backup.
proxy('sd-phone:sim:get',            'sd-phone:server:sim:get')
proxy('sd-phone:sim:eject',          'sd-phone:server:sim:eject')
proxy('sd-phone:sim:backup:set',     'sd-phone:server:sim:backup:set')
proxy('sd-phone:sim:backup:restore', 'sd-phone:server:sim:backup:restore')
