---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table IMEI translation (server.compat.yseries.imei): YSeries IMEI <-> sd-phone identity.
local imei = require 'server.compat.yseries.imei'
---@type table Settings persistence layer (server.settings.store): number assignment.
local settings = require 'server.settings.store'
---@type table Server utilities (server.util): the configured phone-number generator.
local util = require 'server.util'

local registerExport = shim.registerExport

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---A phone number in sd-phone's configured format that nobody currently holds. Mirrors the settings
---store's own mint loop: twenty tries for a free one, then the last candidate regardless, because a
---number is better than nil to a caller about to assign one.
---@return string|nil
local function freeNumber()
    for _ = 1, 20 do
        local candidate = util.randomNumber()
        if candidate and not settings.numberExists(candidate) then return candidate end
    end
    return util.randomNumber()
end

---GeneratePhoneNumber(): a free phone number in the configured format. Nil when the store cannot
---produce one.
registerExport('GeneratePhoneNumber', function()
    return freeNumber()
end)

---CreateSimCard(source, simNumber?): issues a SIM to a player, taking the requested number when it
---is free and generating one otherwise. True when a SIM was issued.
registerExport('CreateSimCard', function(source, simNumber)
    local src = tonumber(source)
    if not src then return false end
    local wanted = shim.digits(simNumber)
    local issued = sd:giveSimCard(src, wanted and { number = wanted } or nil)
    return issued ~= nil
end)

---ChangePhoneNumber(phoneImei, simNumber): re-numbers the identity behind an IMEI. False when the
---IMEI is unknown or the number is already taken.
registerExport('ChangePhoneNumber', function(phoneImei, simNumber)
    local identity = (type(phoneImei) == 'string' and phoneImei ~= '') and phoneImei or nil
    local wanted = shim.digits(simNumber)
    if not identity or not wanted then return false end
    if not sd:isNumberAvailable(wanted) then return false end
    settings.setPhoneNumber(identity, wanted)
    return true
end)

---RecoverSimCard(phoneImei, simNumber): re-issues a lost number onto the identity behind an IMEI.
---sd-phone has no lost/stolen ledger, so this is ChangePhoneNumber without the availability gate:
---the number is being moved BACK to its owner, and refusing it because it is already assigned is
---exactly the wrong answer.
registerExport('RecoverSimCard', function(phoneImei, simNumber)
    local identity = (type(phoneImei) == 'string' and phoneImei ~= '') and phoneImei or nil
    local wanted = shim.digits(simNumber)
    if not identity or not wanted then return false end

    local holder = imei.forNumber(wanted)
    if holder and holder ~= identity then
        settings.clearPhoneNumber(holder)
    end
    settings.setPhoneNumber(identity, wanted)
    return true
end)
