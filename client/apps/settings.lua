---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Thin delegates into server/settings: per-player setting reads/writes persisted to the
-- phone_settings table.
proxyCallback('sd-phone:settings:get',      'sd-phone:server:settings:get')
proxyCallback('sd-phone:settings:setTones', 'sd-phone:server:settings:setTones')
proxyCallback('sd-phone:settings:tones:add',    'sd-phone:server:settings:tones:add')
proxyCallback('sd-phone:settings:tones:remove', 'sd-phone:server:settings:tones:remove')
proxyCallback('sd-phone:settings:setAirplane',  'sd-phone:server:settings:setAirplane')
proxyCallback('sd-phone:settings:setHour24',    'sd-phone:server:settings:setHour24')
proxyCallback('sd-phone:settings:setReopenApp', 'sd-phone:server:settings:setReopenApp')
proxyCallback('sd-phone:settings:setSetupDone', 'sd-phone:server:settings:setSetupDone')
proxyCallback('sd-phone:settings:setTheme',     'sd-phone:server:settings:setTheme')
proxyCallback('sd-phone:settings:setDarkTheme', 'sd-phone:server:settings:setDarkTheme')
proxyCallback('sd-phone:settings:setLockClock', 'sd-phone:server:settings:setLockClock')
proxyCallback('sd-phone:settings:setSecurity',  'sd-phone:server:settings:setSecurity')
proxyCallback('sd-phone:settings:setWallpaper', 'sd-phone:server:settings:setWallpaper')
proxyCallback('sd-phone:settings:wallpapers:add',    'sd-phone:server:settings:wallpapers:add')
proxyCallback('sd-phone:settings:wallpapers:remove', 'sd-phone:server:settings:wallpapers:remove')
proxyCallback('sd-phone:settings:setChatTextScale', 'sd-phone:server:settings:setChatTextScale')
proxyCallback('sd-phone:settings:setPhoneScale',    'sd-phone:server:settings:setPhoneScale')
proxyCallback('sd-phone:settings:setVolumes',       'sd-phone:server:settings:setVolumes')
proxyCallback('sd-phone:settings:setLocale',        'sd-phone:server:settings:setLocale')
proxyCallback('sd-phone:settings:getNotifPref', 'sd-phone:server:settings:getNotifPref')
proxyCallback('sd-phone:settings:setNotifPref', 'sd-phone:server:settings:setNotifPref')
proxyCallback('sd-phone:settings:factoryReset', 'sd-phone:server:settings:factoryReset')
