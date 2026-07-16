---@type table Shared shim helpers (server.compat.lbphone.shared): export registration + warn-once.
local shim = require 'server.compat.lbphone.shared'
---@type table Player bridge (bridge.server.player): citizenid/source resolution.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): numbers, airplane mode, lock security.
local settings = require 'server.settings.store'

local registerLbExport, stubLbExport = shim.registerLbExport, shim.stubLbExport

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---GetEquippedPhoneNumber(source | identifier): the target's phone number. A server id resolves
---with assign-on-first-access; a string is treated as a citizenid with a read-only lookup.
registerLbExport('GetEquippedPhoneNumber', function(target)
    if type(target) == 'number' then
        local cid = player.getIdentifier(target)
        return cid and settings.ensurePhoneNumber(cid) or nil
    end
    if type(target) == 'string' and target ~= '' then
        return settings.getPhoneNumber(target)
    end
    return nil
end)

---GetSourceFromNumber(number): the connected server id owning a phone number, nil when the
---number is unassigned or its owner is offline. Any formatting is accepted.
registerLbExport('GetSourceFromNumber', function(number)
    local cid = settings.getCitizenByNumber(number)
    return cid and player.getSourceByIdentifier(cid) or nil
end)

---HasPhoneItem(source, number?): whether the player owns any configured phone item, answered by
---the first-party hasPhone export. The per-number refinement is ignored.
registerLbExport('HasPhoneItem', function(source, _phoneNumber)
    if type(source) ~= 'number' then return false end
    return sd:hasPhone(source) ~= nil
end)

---HasAirplaneMode(number): airplane state of the number's owner. An unassigned number reads as
---false.
registerLbExport('HasAirplaneMode', function(number)
    local cid = settings.getCitizenByNumber(number)
    if not cid then return false end
    return settings.isAirplane(cid)
end)

---ResetSecurity(number): clears the owner's lock passcode (Face Unlock switches off with it).
---A number nobody owns is a no-op.
registerLbExport('ResetSecurity', function(number)
    local cid = settings.getCitizenByNumber(number)
    if cid then settings.setSecurity(cid, nil, false) end
end)

-- Battery family: sd-phone has no battery system; silent no-ops.
registerLbExport('IsPhoneDead', function() return false end)
registerLbExport('SaveBattery', function() end)
registerLbExport('SaveAllBatteries', function() end)

-- Phone/user surfaces with no sd-phone equivalent.
stubLbExport('GetSettings', nil)
stubLbExport('FactoryReset', nil)
stubLbExport('GetPin', nil, 'is never disclosed: sd-phone does not hand lock passcodes to other resources, a privacy decision')
