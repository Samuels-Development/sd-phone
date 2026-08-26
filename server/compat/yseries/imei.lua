---@type table Player bridge (bridge.server.player): citizenid/source resolution.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): identity -> number mapping.
local settings = require 'server.settings.store'

---@type table IMEI module; the table returned at end of file. Translates between YSeries' phone
---IMEI and sd-phone's data identity, which is what every identity-keyed store here is keyed on.
local imei = {}

---sd-phone's data identity IS the IMEI. With unique phones on it is the per-device identity that
---`phone_cloud_profiles.device_identity` stores, so it survives a SIM moving between handsets;
---with unique phones off it is the character identifier, one phone per character. Either way the
---value round-trips through every export that returns one and later accepts it back.
---
---Deliberately NOT the phone number: SIM live-swap moves a number between devices, which is
---exactly the case an IMEI exists to tell apart.

---The SIM session module, resolved lazily. A branch without unique phones must still load this
---file, so the require is guarded rather than taken at the top.
---@return table|nil
local function sessionModule()
    local ok, mod = pcall(require, 'server.sim.session')
    return ok and mod or nil
end

---The acting IMEI for a connected player, or nil when they have no phone identity at all. Falls
---back to the character identifier when unique phones are off.
---@param source number player server id
---@return string|nil
function imei.forSource(source)
    if type(source) ~= 'number' then return nil end
    local session = sessionModule()
    if session then
        local identity = session.identity(source)
        if identity then return identity end
    end
    return player.getIdentifier(source)
end

---The IMEI owning a phone number, or nil when the number is unassigned. Any formatting accepted.
---@param number string|number
---@return string|nil
function imei.forNumber(number)
    return settings.getCitizenByNumber(number)
end

---The phone number carried by an IMEI, or nil when that identity has no number.
---@param value string|nil IMEI
---@return string|nil
function imei.toNumber(value)
    if type(value) ~= 'string' or value == '' then return nil end
    return settings.getPhoneNumber(value)
end

---The connected server id acting as an IMEI, or nil when nobody is. Checks the ACTIVE phone first,
---then every SIM a player carries, so an IMEI sitting in someone's pocket still resolves.
---@param value string|nil IMEI
---@return number|nil
function imei.toSource(value)
    if type(value) ~= 'string' or value == '' then return nil end

    local direct = player.getAnySourceByIdentifier(value)
    if direct then return direct end

    local session = sessionModule()
    if not session then return nil end
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        if s and session.hasIdentity(s, value) then return s end
    end
    return nil
end

---The IMEI for a character identifier. Identical to the identifier itself unless unique phones are
---on and that character's active device carries its own identity.
---@param identifier string|nil citizenid
---@return string|nil
function imei.forIdentifier(identifier)
    if type(identifier) ~= 'string' or identifier == '' then return nil end
    local src = player.getSourceByIdentifier(identifier)
    if src then return imei.forSource(src) end
    return identifier
end

---Resolves a YSeries `toType`/`to` recipient pair to an sd-phone identity. `toType` is one of
---'source', 'phoneNumber', 'phoneImei'; anything else yields nil.
---@param toType string|nil
---@param to any
---@return string|nil identity
function imei.resolveRecipient(toType, to)
    if toType == 'source' then
        local src = tonumber(to)
        return src and imei.forSource(src) or nil
    end
    if toType == 'phoneNumber' then return imei.forNumber(to) end
    if toType == 'phoneImei' then
        return (type(to) == 'string' and to ~= '') and to or nil
    end
    return nil
end

return imei
