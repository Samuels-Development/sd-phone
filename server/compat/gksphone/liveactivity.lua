---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'

-- Dynamic Island / lock-screen activity cards. sd-phone has a real equivalent in its lock-screen
-- widgets, but that surface is deliberately owned by the resource that registered the app carrying
-- it (exports['sd-phone']:addCustomApp, then showLockscreenWidget from the same resource). A shim
-- calling it would register every card as sd-phone's own and no caller could ever remove one, so
-- these report false and name the path to use instead rather than opening a card nobody owns.
---@type string Shared reason clause, so the three exports read the same in the console.
local WHY = 'has no drop-in sd-phone equivalent: lock-screen cards belong to the resource that registered their app, so declare a lockscreenWidget on your addCustomApp and drive it with showLockscreenWidget / hideLockscreenWidget'

shim.stubExport('StartLiveActivity', false, WHY)
shim.stubExport('UpdateLiveActivity', false, WHY)
shim.stubExport('EndLiveActivity', false, WHY)
