---@type table Shared shim helpers (server.compat.roadphone.shared): stub registration + warn-once.
local shim = require 'server.compat.roadphone.shared'

local stubMeta = shim.stubMeta

-- sd-phone's Calendar keeps its events in the phone UI itself, on the device rather than in a
-- server table, and it ships no Reminders app at all. Both families therefore read empty and refuse
-- their writes: a caller filing an appointment is told nothing was stored rather than believing it
-- landed somewhere the owner will see.
---@type string The clause the calendar family shares.
local CALENDAR = 'the Calendar app stores its events on the device rather than in a server table'
---@type string The clause the reminders family shares.
local REMINDERS = 'sd-phone ships no Reminders app, so there is no list or item to read or write'

stubMeta('GetCalendarEvents', {}, CALENDAR)
stubMeta('UpdateCalendarEvents', false, CALENDAR)
stubMeta('AddCalendarEventToMetadata', false, CALENDAR)
stubMeta('UpdateCalendarEventInMetadata', false, CALENDAR)
stubMeta('DeleteCalendarEventFromMetadata', false, CALENDAR)

stubMeta('GetReminders', {}, REMINDERS)
stubMeta('UpdateReminders', false, REMINDERS)
stubMeta('AddReminderToMetadata', false, REMINDERS)
stubMeta('UpdateReminderInMetadata', false, REMINDERS)
stubMeta('DeleteReminderFromMetadata', false, REMINDERS)
stubMeta('GetReminderLists', {}, REMINDERS)
stubMeta('AddReminderListToMetadata', false, REMINDERS)
stubMeta('UpdateReminderListInMetadata', false, REMINDERS)
stubMeta('DeleteReminderListFromMetadata', false, REMINDERS)
