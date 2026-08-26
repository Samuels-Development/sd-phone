---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'

local stubExport, stubExportMulti = shim.stubExport, shim.stubExportMulti

-- Screen damage. sd-phone models no physical condition for a handset: a phone is never cracked,
-- never water-damaged and never needs a mechanic. Every read reports a perfect screen and every
-- write is refused, so a caller that cracks a screen off a death or a crash still runs rather than
-- erroring on a name that is not there. phoneUniqueId, lastDamageAt and lastRepairAt are absent
-- from the answers below because there is no damage event to have stamped them.
---@type string Shared reason clause for every screen-condition surface.
local SCREEN = 'has no sd-phone equivalent: the phone models no screen damage, so every handset reads as intact'

stubExport('ApplyScreenDamage', false, SCREEN)
stubExport('DamageScreen', nil, SCREEN)
stubExport('SetScreenHealth', nil, SCREEN)
stubExport('SetWaterDamage', false, SCREEN)
stubExport('GetScreenHealth', 100, SCREEN)
stubExport('GetScreenCondition', { health = 100, severity = 'none', waterDamage = false }, SCREEN)
stubExport('GetScreenRepairQuote',
    { health = 100, severity = 'none', waterDamage = false, price = 0, selfRepair = true }, SCREEN)
stubExportMulti('RepairPhoneScreen', SCREEN .. ", so a repair is refused with 'not_damaged'",
    false, 'not_damaged')

-- Battery health. sd-phone's battery is a cosmetic status-bar counter that drains while the phone
-- is open: there is no stored charge, no charge cycle and no wear, so nothing here has a value to
-- read or a column to write. Every read reports a factory-fresh cell.
---@type string Shared reason clause for every battery-health surface.
local BATTERY = 'has no sd-phone equivalent: the battery is a cosmetic drain counter, not a stored charge with wear'

stubExport('GetPhoneHealth',
    { batteryHealth = 100, batteryCondition = 'good', chargeCycles = 0, screenHealth = 100, waterDamage = false },
    BATTERY)
stubExport('GetBatteryHealth', 100, BATTERY)
stubExport('SetBatteryHealth', nil, BATTERY)
stubExport('AddBatteryChargeProgress', nil, BATTERY)
stubExport('GetBatteryReplacementQuote',
    { health = 100, condition = 'good', cycles = 0, price = 0, selfReplace = true }, BATTERY)
stubExportMulti('ReplacePhoneBattery', BATTERY .. ", so a replacement is refused with 'not_worn'",
    false, 'not_worn')
