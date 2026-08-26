---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): YSeries IMEI <-> sd-phone identity.
local imei = require 'server.compat.yseries.imei'
---@type table Player bridge (bridge.server.player): citizenid/source resolution.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): identity -> number mapping.
local settings = require 'server.settings.store'

local registerExport = shim.registerExport

---GetPlayerSourceIdByPhoneNumber(phoneNumber): the connected server id owning a number, nil when
---the number is unassigned or its owner is offline.
registerExport('GetPlayerSourceIdByPhoneNumber', function(phoneNumber)
    local identity = imei.forNumber(phoneNumber)
    return identity and player.getAnySourceByIdentifier(identity) or nil
end)

---GetPlayerSourceIdByPhoneImei(phoneImei): the connected server id acting as an IMEI, nil when
---nobody carries it.
registerExport('GetPlayerSourceIdByPhoneImei', function(phoneImei)
    return imei.toSource(phoneImei)
end)

---GetPlayerSourceIdByIdentifier(identifier): the connected server id for a character identifier.
registerExport('GetPlayerSourceIdByIdentifier', function(identifier)
    if type(identifier) ~= 'string' or identifier == '' then return nil end
    return player.getSourceByIdentifier(identifier)
end)

---GetPhoneNumberByIdentifier(identifier): the character's phone number, assigning one on first
---access so a caller never races the player's first phone open.
registerExport('GetPhoneNumberByIdentifier', function(identifier)
    if type(identifier) ~= 'string' or identifier == '' then return nil end
    return settings.ensurePhoneNumber(identifier)
end)

---GetPhoneNumberByImei(phoneImei): the number carried by an IMEI, nil when that identity has none.
registerExport('GetPhoneNumberByImei', function(phoneImei)
    return imei.toNumber(phoneImei)
end)

---GetPhoneNumberBySourceId(source): the connected player's active phone number.
registerExport('GetPhoneNumberBySourceId', function(source)
    local identity = imei.forSource(tonumber(source))
    if not identity then return nil end
    return settings.ensurePhoneNumber(identity)
end)

---GetPhoneImeiByPhoneNumber(phoneNumber): the IMEI owning a number.
registerExport('GetPhoneImeiByPhoneNumber', function(phoneNumber)
    return imei.forNumber(phoneNumber)
end)

---GetPhoneImeiByIdentifier(identifier): the IMEI of a character's active phone.
registerExport('GetPhoneImeiByIdentifier', function(identifier)
    return imei.forIdentifier(identifier)
end)

---GetPhoneImeiBySourceId(source): the IMEI of a connected player's active phone.
registerExport('GetPhoneImeiBySourceId', function(source)
    return imei.forSource(tonumber(source))
end)
