---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): phone unique id <-> identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Settings persistence layer (server.settings.store): number assignment + reset.
local settings = require 'server.settings.store'
---@type table Phone data wipe (server.admin.wipe): full footprint + content-only erasure.
local wipe = require 'server.admin.wipe'
---@type table Player bridge (bridge.server.player): identity resolution for the reset payload.
local player = require 'bridge.server.player'
---@type table Unique-phones flags (server.sim.state): whether the SIM registry owns the number.
local simState = require 'server.sim.state'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---Moves a number onto an identity. Under unique phones the number lives on the SIM in the holder's
---ACTIVE phone and phone_settings is only a mirror, so the SIM is renamed instead of the mirror.
---@param identity string phone unique id
---@param number string bare-digit number
---@return boolean ok
---@return string|nil reason 'not_active' | 'invalid' | 'no_sim' | 'taken'
local function assign(identity, number)
    if simState.active then
        local src = phones.toSource(identity)
        if not src or phones.forSource(src) ~= identity then return false, 'not_active' end
        local ok, err = sd:setSimNumber(src, number)
        if not ok then return false, err or 'invalid' end
        return true
    end

    local holder = settings.getCitizenByNumber(number)
    if holder == identity then return true end
    if holder then settings.clearPhoneNumber(holder) end
    settings.setPhoneNumber(identity, number)
    return true
end

---The SIM registry, resolved lazily: a server without unique phones must still load this file.
---@return table|nil
local function simStore()
    local ok, mod = pcall(require, 'server.sim.store')
    return ok and mod or nil
end

---Mints a fresh number for a handset, in the SIM registry under unique phones and in
---phone_settings otherwise, so the new number survives the next session resolve.
---@param identity string phone unique id
---@return string|nil number
local function mintNumber(identity)
    if not simState.active then return settings.ensurePhoneNumber(identity) end

    local store = simStore()
    if not store then return nil end
    local candidate = store.generateNumber()
    return assign(identity, candidate) and candidate or nil
end

---NewNumber(src, phoneID, NewNumber): issues an additional number for a player. sd-phone gives a
---handset exactly one number at a time rather than a pick-list in a SIM app, so the number is moved
---onto the named handset (or the player's active one) instead of being stacked alongside the old.
registerExport('NewNumber', function(src, phoneID, newNumber)
    local number = shim.digits(newNumber)
    local identity = shim.text(phoneID) or phones.forSource(tonumber(src))
    if not number or not identity then return false end

    warnOnce('NewNumber', ('NewNumber adds a SELECTABLE extra number on gksphone (called by %s); sd-phone carries one number per handset, so the new number replaced the old one on that phone rather than joining a list'):format(shim.invoker()))
    return assign(identity, number)
end)

---ChangeNumber(phoneID, oldNumber, newNumber, updateContacts): renumbers one handset.
---
---`updateContacts` is not honoured: sd-phone's contacts store has no server-wide renumber, so every
---address book that saved the old number keeps it and its owner re-saves the new one.
registerExport('ChangeNumber', function(phoneID, oldNumber, newNumber, updateContacts)
    local number = shim.digits(newNumber)
    if not number or settings.numberExists(number) then return false end

    local identity = shim.text(phoneID) or phones.forNumber(oldNumber)
    if not identity then return false end

    if updateContacts then
        warnOnce('ChangeNumber.updateContacts', ('ChangeNumber updateContacts is not supported (called by %s); the handset was renumbered but no other address book was rewritten'):format(shim.invoker()))
    end
    return assign(identity, number)
end)

---NumberChange(src, newNumber): gksphone V1's renumber. The same effect as ChangeNumber under a
---different name and argument order, addressed by the acting player rather than by handset id.
registerExport('NumberChange', function(src, newNumber)
    local number = shim.digits(newNumber)
    local identity = phones.forSource(tonumber(src))
    if not number or not identity then return false end
    if settings.numberExists(number) then return false end
    return assign(identity, number)
end)

---GetPhoneResetTarget(source): the handset id a ResetPhoneData on this player would act on, for a
---confirm-before-commit UI. Nil when the player carries no phone identity.
registerExport('GetPhoneResetTarget', function(source)
    return phones.forSource(tonumber(source))
end)

---ResetPhoneData(target, options): factory-resets a handset. `target` is a player source OR a phone
---unique id, so an offline handset resets too. `options.keepNumber` leaves the number in place;
---otherwise a fresh one is minted. Fires gksphone:server:phoneReset on success.
registerExport('ResetPhoneData', function(target, options)
    local identity = type(target) == 'number' and phones.forSource(target) or shim.text(target)
    if not identity then return false, 'bad_target' end

    local oldNumber = settings.getPhoneNumber(identity)
    if not settings.hasData(identity) and not oldNumber then return false, 'no_phone' end

    local keepNumber = type(options) == 'table' and options.keepNumber == true
    local wiped, rows = wipe.wipeCid(identity)
    if not wiped or not rows then return false, 'unknown_phone' end

    local newNumber = oldNumber
    if keepNumber and oldNumber then
        if not simState.active then settings.setPhoneNumber(identity, oldNumber) end
    else
        newNumber = mintNumber(identity)
    end

    local source = phones.toSource(identity)
    local result = {
        phoneId    = identity,
        identifier = source and player.getRealIdentifier(source) or identity,
        oldNumber  = (not keepNumber) and oldNumber or nil,
        newNumber  = newNumber,
    }
    TriggerEvent('gksphone:server:phoneReset', {
        phoneId    = result.phoneId,
        identifier = result.identifier,
        source     = source,
        oldNumber  = result.oldNumber,
        newNumber  = result.newNumber,
    })
    return true, nil, result
end)

---WipePhoneData(phoneUniqID): erases the handset's CONTENT - messages, contacts, gallery, voice
---memos, notes - and leaves its number, settings and everything of value alone, which is the split
---gksphone documents for a failed phone crack.
registerExport('WipePhoneData', function(phoneUniqID)
    local identity = shim.text(phoneUniqID)
    if not identity then return false end
    return wipe.wipeDeviceContent(identity) >= 0
end)

-- Returned so the command half can renumber a handset through the same SIM-aware path instead of
-- writing the phone_settings mirror, which unique-phones mode reverts on the next session resolve.
return { assign = assign }
