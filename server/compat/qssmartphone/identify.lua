---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'
---@type table Player bridge (bridge.server.player): identity/source resolution.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): identity -> number mapping.
local settings = require 'server.settings.store'
---@type table SIM session (server.sim.session): the acting device identity behind a scope id.
local session = require 'server.sim.session'
---@type table SIM feature flags (server.sim.state): whether unique phones are live at all.
local simState = require 'server.sim.state'
---@type table sd-phone config root (configs/config.lua): Phone.Items behind getPhoneNames.
local config = require 'configs.config'

---@type table Identity module; the table returned at end of file. Translates between qs-smartphone's
---"phone scope identifier" and sd-phone's data identity, which are the same thing under two names.
local identify = {}

local registerExport, registerPro, warnOnce = shim.registerExport, shim.registerPro, shim.warnOnce

---The acting data identity for a player: the SIM identity of the phone in hand when unique phones
---are on, the character id otherwise. This is what qs-smartphone calls the phone scope identifier.
---@param source any player server id
---@return string|nil
function identify.scopeOf(source)
    local src = tonumber(source)
    if not src then return nil end
    return player.getIdentifier(src)
end

---The connected server id acting under a scope identifier, nil when nobody is.
---@param scope any scope identifier (an sd-phone data identity)
---@return number|nil
function identify.sourceOfScope(scope)
    if type(scope) ~= 'string' or scope == '' then return nil end
    return player.getAnySourceByIdentifier(scope)
end

---A player's active phone number, assigned on first access so a caller never races the player's
---first phone open.
---@param source any player server id
---@return string|nil
function identify.numberOf(source)
    local scope = identify.scopeOf(source)
    if not scope then return nil end
    return settings.ensurePhoneNumber(scope)
end

---The connected server id owning a phone number, nil when unassigned or its owner is offline.
---@param number any phone number in any formatting
---@return number|nil
function identify.sourceOfNumber(number)
    local digits = shim.digits(number)
    local cid = digits and settings.getCitizenByNumber(digits) or nil
    return cid and player.getAnySourceByIdentifier(cid) or nil
end

---GetCurrentPhoneNumber(source): the active phone number of the player's current device.
registerExport('GetCurrentPhoneNumber', function(source)
    return identify.numberOf(source)
end)

---getPhoneScopeIdentifier(source): the unique scope of the player's active device, which is
---sd-phone's data identity for that phone - the SIM identity with unique phones on, the character
---id otherwise.
registerExport('getPhoneScopeIdentifier', function(source)
    return identify.scopeOf(source)
end)

---GetPlayerPhone(source): the legacy line's only documented server export. It returns false rather
---than nil when the player has no number, matching the documented contract.
---@param source any player server id
---@return string|false
local function getPlayerPhone(source)
    return identify.numberOf(source) or false
end

-- Quasar ships GetPlayerPhone on qs-base, not on the phone itself, and callers written against the
-- legacy line reach for whichever of the two their author saw. registerExport already covers every
-- phone product's name, so only the qs-base sibling is added here.
registerExport('GetPlayerPhone', getPlayerPhone)
shim.registerOn('qs-base', 'GetPlayerPhone', getPlayerPhone)

---GetPhoneNumberFromIdentifier(identifier, owner): the number held by a character identifier,
---false when that character never had one. Offline-safe: read from the store, not from a source.
---
---`owner` asks Quasar to assert the phone's OWNER is that identifier so a stolen phone is excluded;
---sd-phone's ownership check is source-scoped (it gates Face Unlock on the phone in hand) and has
---no offline form, so the flag is reported and ignored.
registerPro('GetPhoneNumberFromIdentifier', function(identifier, owner)
    if owner ~= nil then
        warnOnce('GetPhoneNumberFromIdentifier.owner', ('GetPhoneNumberFromIdentifier `owner` is ignored (called by %s); sd-phone resolves phone ownership from the phone in a player\'s hand, which has no offline form, so the stored number was returned either way'):format(GetInvokingResource() or 'unknown'))
    end
    if type(identifier) ~= 'string' or identifier == '' then return false end
    return settings.getPhoneNumber(identifier) or false
end)

---getMetaFromSource(source): metadata of the phone the player is using. sd-phone's device metadata
---is the SIM session: the acting identity, the number on it and whether the holder owns the handset.
---False when the player carries no phone.
---@param source any player server id
---@return table|false
local function getMetaFromSource(source)
    local src = tonumber(source)
    if not src then return false end

    local scope = identify.scopeOf(src)
    if not scope then return false end

    local unique = simState.active == true
    local owner, hasSim = true, true
    if unique then
        owner  = session.isOwner(src) == true
        hasSim = session.identity(src) ~= nil
    end

    return {
        scope  = scope,
        imei   = scope,
        number = settings.ensurePhoneNumber(scope),
        owner  = owner,
        unique = unique,
        hasSim = hasSim,
    }
end

-- The PRO docs head this page 'getMeta' and then call getMetaFromSource in their own example, so
-- both spellings have callers.
registerPro('getMetaFromSource', getMetaFromSource)
registerPro('getMeta', getMetaFromSource)

---getPhoneNames(): the phone models a player can carry. sd-phone's models are the inventory items
---configs/phone.lua names, one per frame colour.
registerPro('getPhoneNames', function()
    local out = {}
    for _, entry in ipairs(config.Phone.Items or {}) do
        if type(entry.item) == 'string' then out[#out + 1] = entry.item end
    end
    return out
end)

return identify
