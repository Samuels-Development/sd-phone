---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table Contacts persistence layer (server.contacts.store): identity-keyed contact rows.
local contacts = require 'server.contacts.store'
---@type table State bag publisher (server.statebags): server-authoritative phone lockout.
local statebags = require 'server.statebags'

local registerExport, stubExport = shim.registerExport, shim.stubExport


---GetContacts(imei): the address book of the IMEI's owner, as YSeries' { name, number } rows.
---Read from the store rather than the source-keyed export so an offline owner still resolves.
registerExport('GetContacts', function(phoneImei)
    local identity = (type(phoneImei) == 'string' and phoneImei ~= '') and phoneImei or nil
    if not identity then return {} end

    local out = {}
    for _, row in ipairs(contacts.listContacts(identity) or {}) do
        out[#out + 1] = { name = row.name, number = row.phone, avatar = row.avatar }
    end
    return out
end)

---ToggleDisabled(sourceId, disabled): locks a player out of their phone, closing it and killing
---the flashlight and hold pose with it.
registerExport('ToggleDisabled', function(sourceId, disabled)
    local src = tonumber(sourceId)
    if not src or not GetPlayerName(src) then return false end
    statebags.setDisabled(src, disabled == true)
    return true
end)

---IsDisabled(sourceId): whether a player's phone is locked out, nil when the player is not found.
registerExport('IsDisabled', function(sourceId)
    local src = tonumber(sourceId)
    if not src or not GetPlayerName(src) then return nil end
    return statebags.isDisabled(src)
end)

-- Screen damage: sd-phone models no physical condition for a handset. Every read reports an intact
-- screen and every write is a no-op, so a caller that cracks a screen on some other event still
-- runs rather than erroring.
stubExport('BreakScreen', nil, 'has no sd-phone equivalent: the phone models no screen damage')
stubExport('FixScreen', nil, 'has no sd-phone equivalent: the phone models no screen damage')
stubExport('GetScreenDamage', nil, 'has no sd-phone equivalent: the phone models no screen damage, so every screen reads as intact')
