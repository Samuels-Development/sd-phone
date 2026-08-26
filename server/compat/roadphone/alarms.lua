---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Authoritative clock handlers (server.clock.actions): validated alarm reads + writes.
local clock = require 'server.clock.actions'
---@type table Authoritative radio handlers (server.radio.actions): saved channel reads + writes.
local radio = require 'server.radio.actions'
---@type table Shared server helpers (server.util): id minting for alarms the caller did not name.
local util = require 'server.util'

local registerExport, stubMeta = shim.registerExport, shim.stubMeta

---Splits RoadPhone's 'HH:MM' alarm time into the hour and minute sd-phone stores. Falls back to the
---separate fields when a caller passes those instead.
---@param alarm table
---@return integer hour, integer minute
local function clockTime(alarm)
    local time = tostring(alarm.time or '')
    local hour, minute = time:match('^(%d%d?):(%d%d)$')
    return math.floor(tonumber(hour or alarm.hour) or 0), math.floor(tonumber(minute or alarm.minute) or 0)
end

---Projects a RoadPhone alarm onto the payload server.clock.actions validates. `repeatType` is
---dropped: sd-phone expresses repetition through the days string alone.
---@param id string alarm id
---@param alarm table
---@return table payload
local function payload(id, alarm)
    local hour, minute = clockTime(alarm)
    local enabled = alarm.enabled
    if enabled == nil then enabled = true end

    return {
        id      = id,
        hour    = hour,
        minute  = minute,
        label   = type(alarm.label) == 'string' and alarm.label or '',
        days    = type(alarm.days) == 'string' and alarm.days or '',
        enabled = enabled ~= false,
        sound   = alarm.sound ~= false,
    }
end

---GetPhoneAlarms(source): the player's alarms, ordered by time of day.
registerExport('GetPhoneAlarms', function(source)
    local src = shim.source(source)
    if not src then return {} end

    local result = clock.listAlarms(src)
    return result.success and result.data and result.data.alarms or {}
end)

---AddAlarmToMetadata(source, alarm): saves an alarm, minting an id when the caller did not name one.
registerExport('AddAlarmToMetadata', function(source, alarm)
    local src = shim.source(source)
    if not src or type(alarm) ~= 'table' then return false end

    local id = tostring(alarm.id or util.newId(16)):sub(1, 40)
    return clock.saveAlarm(src, payload(id, alarm)).success == true
end)

---UpdateAlarmInMetadata(source, alarmId, updatedAlarm): rewrites one alarm by its id.
registerExport('UpdateAlarmInMetadata', function(source, alarmId, updatedAlarm)
    local src = shim.source(source)
    if not src or type(updatedAlarm) ~= 'table' then return false end

    local id = tostring(alarmId or ''):sub(1, 40)
    if id == '' then return false end
    return clock.saveAlarm(src, payload(id, updatedAlarm)).success == true
end)

---DeleteAlarmFromMetadata(source, alarmId): removes one alarm. Idempotent.
registerExport('DeleteAlarmFromMetadata', function(source, alarmId)
    local src = shim.source(source)
    if not src then return false end
    return clock.deleteAlarm(src, tostring(alarmId or '')).success == true
end)

---GetRadioChannelsFromMetadata(source): the player's saved radio channels.
registerExport('GetRadioChannelsFromMetadata', function(source)
    local src = shim.source(source)
    if not src then return {} end

    local result = radio.listSaved(src)
    return result.success and (result.data and (result.data.saved or result.data.channels or result.data)) or {}
end)

---AddRadioChannelToMetadata(source, channel): saves a named channel.
registerExport('AddRadioChannelToMetadata', function(source, channel)
    local src = shim.source(source)
    if not src or type(channel) ~= 'table' then return false end

    return radio.addSaved(src, {
        label = channel.label or channel.name,
        freq  = channel.freq or channel.frequency,
    }).success == true
end)

---UpdateRadioChannelInMetadata(source, channelId, updatedChannel): renames or retunes one channel.
registerExport('UpdateRadioChannelInMetadata', function(source, channelId, updatedChannel)
    local src = shim.source(source)
    if not src or type(updatedChannel) ~= 'table' then return false end

    return radio.updateSaved(src, {
        id    = channelId,
        label = updatedChannel.label or updatedChannel.name,
        freq  = updatedChannel.freq or updatedChannel.frequency,
    }).success == true
end)

---DeleteRadioChannelFromMetadata(source, channelId): removes one saved channel.
registerExport('DeleteRadioChannelFromMetadata', function(source, channelId)
    local src = shim.source(source)
    if not src then return false end
    return radio.removeSaved(src, { id = channelId }).success == true
end)

stubMeta('UpdatePhoneAlarms', false,
    'alarms are rows owned by a character, so replacing the whole list would delete every alarm set between the read and the write')
stubMeta('UpdateRadioChannels', false,
    'saved channels are rows owned by a character, so replacing the whole list would delete every channel saved between the read and the write')

-- Radio recents: sd-phone keeps a named saved list and nothing else. There is no recently-tuned
-- history to read, append to or clear, so the reader is empty and both writes report they stored
-- nothing rather than pretending a history exists.
stubMeta('GetRadioRecentFromMetadata', {}, 'the Radio app keeps a named saved list rather than a recently-tuned history')
stubMeta('AddRadioRecentToMetadata', false, 'the Radio app keeps a named saved list rather than a recently-tuned history')
stubMeta('ClearRadioRecentFromMetadata', false, 'the Radio app keeps a named saved list rather than a recently-tuned history')
