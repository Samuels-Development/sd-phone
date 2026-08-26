---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): phone unique id <-> identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Settings persistence layer (server.settings.store): identity -> number, locale.
local settings = require 'server.settings.store'

local registerExport = shim.registerExport

---GetPhoneBySource(src): the phone number in the player's active handset, assigned on first access
---so a caller never races the player's first phone open.
registerExport('GetPhoneBySource', function(src)
    local identity = phones.forSource(tonumber(src))
    if not identity then return nil end
    return settings.ensurePhoneNumber(identity)
end)

---GetSourceByPhone(phoneNumber): the connected server id owning a number, nil when the number is
---unassigned or its owner is offline.
registerExport('GetSourceByPhone', function(phoneNumber)
    return phones.toSource(phones.forNumber(phoneNumber))
end)

---GetPhoneDataBySource(src): the phoneData of the handset a connected player is currently using.
registerExport('GetPhoneDataBySource', function(src)
    return phones.data(phones.forSource(tonumber(src)))
end)

---GetPhoneDataByNumber(phoneNumber): the phoneData of the handset carrying a number.
registerExport('GetPhoneDataByNumber', function(phoneNumber)
    return phones.data(phones.forNumber(phoneNumber))
end)

---GetPhoneDataBySetupOwner(citizenID): every handset that identity owns, as an array. Offline-safe:
---the rows come from the SIM cloud profiles rather than from a live session.
registerExport('GetPhoneDataBySetupOwner', function(citizenID)
    return phones.allFor(shim.text(citizenID))
end)

---GetPhoneDataByPhoneUniqID(phoneUniqID): the phoneData for one handset id, offline or not.
registerExport('GetPhoneDataByPhoneUniqID', function(phoneUniqID)
    return phones.data(shim.text(phoneUniqID))
end)

---GetPhoneDataByCitizenID(citizenID): the phoneData of the handset that identity last used, which
---on sd-phone is their active one while online and their first owned handset while offline.
registerExport('GetPhoneDataByCitizenID', function(citizenID)
    return phones.data(phones.forIdentifier(shim.text(citizenID)))
end)

---GetPhoneLangBySource(src): the player's chosen phone language code, defaulting to 'en' when they
---have never picked one. sd-phone's locale codes are the same short codes gksphone documents.
registerExport('GetPhoneLangBySource', function(src)
    local identity = phones.forSource(tonumber(src))
    if not identity then return nil end
    return settings.getLocale(identity) or 'en'
end)
