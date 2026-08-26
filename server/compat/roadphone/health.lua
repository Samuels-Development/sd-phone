---@type table Shared shim helpers (server.compat.roadphone.shared): stub registration + warn-once.
local shim = require 'server.compat.roadphone.shared'

local stubExport = shim.stubExport

-- sd-phone's Health app simulates its readings on the CLIENT - steps, distance and heart rate are
-- sampled from the ped's own activity in client/apps/health.lua and pushed straight into the UI.
-- Nothing is cached server-side and nothing is written to a daily table, so every server-side read
-- here reports RoadPhone's own documented default rather than a made-up figure, and every write
-- reports that it stored nothing. A caller gated on "is the health addon on" therefore behaves
-- exactly as it would against a RoadPhone install with the addon switched off.
---@type string The clause every reader in this file shares.
local WHY = 'has no server-side counterpart: sd-phone simulates health on the client and caches nothing on the server'

stubExport('getPlayerHealth', nil, WHY)
stubExport('getPlayerHeartRate', 70, WHY)
stubExport('getPlayerStress', 0, WHY)
stubExport('getPlayerSteps', 0, WHY)
stubExport('getPlayerSpO2', 98, WHY)
stubExport('getPlayerBloodPressure', { systolic = 120, diastolic = 80 }, WHY)
stubExport('isPlayerSleeping', false, WHY)

stubExport('getPlayerDailyHealth', nil,
    'has no sd-phone counterpart: there is no daily health table to summarise, the readings being client-side only')
stubExport('getPlayerHealthHistory', {},
    'has no sd-phone counterpart: readings are never persisted, so there is no history to page back through')

stubExport('addSleepHours', false,
    'has no sd-phone counterpart: sleep is not modelled, so a bed script has no daily record to add hours to')
stubExport('setPlayerStress', false,
    'has no sd-phone counterpart: stress is not modelled, so there is no level to set or push to the client')
