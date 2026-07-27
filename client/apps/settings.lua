---@type fun(nuiAction: string, serverEvent: string, onAccepted?: fun()) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

---Announces an accepted settings write, so listeners can re-read the snapshot.
local function announce()
    TriggerEvent('sd-phone:client:settingsUpdated')
end

---Registers a settings write: the read pass-through plus the announcement.
---@param nuiAction string
---@param serverEvent string
local function writeCallback(nuiAction, serverEvent)
    proxyCallback(nuiAction, serverEvent, announce)
end

-- Thin delegates into server/settings: per-player setting reads/writes persisted to the
-- phone_settings table. Writes go through writeCallback so they announce afterwards.
proxyCallback('sd-phone:settings:get',      'sd-phone:server:settings:get')
writeCallback('sd-phone:settings:setTones', 'sd-phone:server:settings:setTones')
writeCallback('sd-phone:settings:tones:add',    'sd-phone:server:settings:tones:add')
writeCallback('sd-phone:settings:tones:remove', 'sd-phone:server:settings:tones:remove')
writeCallback('sd-phone:settings:setAirplane',  'sd-phone:server:settings:setAirplane')
writeCallback('sd-phone:settings:setHour24',    'sd-phone:server:settings:setHour24')
writeCallback('sd-phone:settings:setReopenApp', 'sd-phone:server:settings:setReopenApp')
writeCallback('sd-phone:settings:setSetupDone', 'sd-phone:server:settings:setSetupDone')
writeCallback('sd-phone:settings:setTheme',     'sd-phone:server:settings:setTheme')
writeCallback('sd-phone:settings:setDarkTheme', 'sd-phone:server:settings:setDarkTheme')
writeCallback('sd-phone:settings:setLockClock', 'sd-phone:server:settings:setLockClock')
writeCallback('sd-phone:settings:setSecurity',  'sd-phone:server:settings:setSecurity')
writeCallback('sd-phone:settings:setWallpaper', 'sd-phone:server:settings:setWallpaper')
writeCallback('sd-phone:settings:setBlur',      'sd-phone:server:settings:setBlur')
writeCallback('sd-phone:settings:wallpapers:add',    'sd-phone:server:settings:wallpapers:add')
writeCallback('sd-phone:settings:wallpapers:remove', 'sd-phone:server:settings:wallpapers:remove')
writeCallback('sd-phone:settings:setChatTextScale', 'sd-phone:server:settings:setChatTextScale')
writeCallback('sd-phone:settings:setPhoneScale',    'sd-phone:server:settings:setPhoneScale')
writeCallback('sd-phone:settings:setBrightness',    'sd-phone:server:settings:setBrightness')
writeCallback('sd-phone:settings:setPhoneAlign',    'sd-phone:server:settings:setPhoneAlign')
writeCallback('sd-phone:settings:setVolumes',       'sd-phone:server:settings:setVolumes')
writeCallback('sd-phone:settings:setLocale',        'sd-phone:server:settings:setLocale')
proxyCallback('sd-phone:settings:versionInfo',  'sd-phone:server:settings:versionInfo')
proxyCallback('sd-phone:settings:getNotifPref', 'sd-phone:server:settings:getNotifPref')
writeCallback('sd-phone:settings:setNotifPref', 'sd-phone:server:settings:setNotifPref')
writeCallback('sd-phone:settings:factoryReset', 'sd-phone:server:settings:factoryReset')
