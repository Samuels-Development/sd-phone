---@type table Shared shim helpers (server.compat.lbphone.shared): export registration + warn-once.
local shim = require 'server.compat.lbphone.shared'
---@type table Player bridge (bridge.server.player): citizenid/source resolution.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): numbers, airplane mode, lock security.
local settings = require 'server.settings.store'
---@type table Framework detection (bridge.shared.framework): the AI Core flag.
local framework = require 'bridge.shared.framework'
---@type table Shared server helpers (server.util): onCleanup.
local util = require 'server.util'

local registerLbExport, stubLbExport = shim.registerLbExport, shim.stubLbExport

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---@type boolean True on AI Core, whose phone layer calls these exports from JavaScript and only
---reads an answer that returns without waiting: a database read reaches it as an unread Promise.
local SYNC = framework.aicore == true

---@type integer Milliseconds a cached number is served before a background re-read refreshes it.
local FRESH_MS = 5000

---@type table<string, { number: string|false, at: integer }> citizenid -> its number, for the
---characters AI Core asks about. Only used when SYNC.
local numberOf = {}

---@type table<string, string> number -> citizenid, the reverse of numberOf.
local ownerOf = {}

---Records a citizenid's number in both directions, dropping the reverse entry of a number it held.
---@param cid string
---@param number string|nil
local function remember(cid, number)
    local old = numberOf[cid]
    if old and old.number and ownerOf[old.number] == cid then ownerOf[old.number] = nil end
    numberOf[cid] = { number = number or false, at = GetGameTimer() }
    if number then ownerOf[number] = cid end
end

---A citizenid's number without waiting on the database: the cached value, re-read in the
---background once it is older than FRESH_MS. Nil until the first read lands.
---@param cid string
---@return string|nil
local function cachedNumber(cid)
    local hit = numberOf[cid]
    if not hit or GetGameTimer() - hit.at > FRESH_MS then
        if hit then hit.at = GetGameTimer() else numberOf[cid] = { number = false, at = GetGameTimer() } end
        CreateThread(function() remember(cid, settings.getPhoneNumber(cid)) end)
    end
    return hit and hit.number or nil
end

if SYNC then
    ---Warms a loading character's number, assigning one on first access, so AI Core's first
    ---lookups already find it.
    AddEventHandler('QBCore:Server:PlayerLoaded', function(p)
        local src = p and p.PlayerData and p.PlayerData.source
        if not src then return end
        CreateThread(function()
            local cid = player.getIdentifier(src)
            if cid then remember(cid, settings.ensurePhoneNumber(cid)) end
        end)
    end)

    ---Keeps the cache on a freshly minted number.
    AddEventHandler('sd-phone:server:number:assigned', function(citizenid, number)
        remember(citizenid, number)
    end)

    util.onCleanup(function(_src, cid)
        local hit = cid and numberOf[cid]
        if not hit then return end
        if hit.number and ownerOf[hit.number] == cid then ownerOf[hit.number] = nil end
        numberOf[cid] = nil
    end)
end

---GetEquippedPhoneNumber(source | identifier): the target's phone number. A server id resolves
---with assign-on-first-access (on AI Core, from the cache above); a string is treated as a
---citizenid with a read-only lookup.
registerLbExport('GetEquippedPhoneNumber', function(target)
    if type(target) == 'number' then
        local cid = player.getIdentifier(target)
        if not cid then return nil end
        if SYNC then return cachedNumber(cid) end
        return settings.ensurePhoneNumber(cid)
    end
    if type(target) == 'string' and target ~= '' then
        return settings.getPhoneNumber(target)
    end
    return nil
end)

---GetSourceFromNumber(number): the connected server id owning a phone number, nil when the
---number is unassigned or its owner is offline. Any formatting is accepted. On AI Core it answers
---from the cache of loaded characters' numbers.
registerLbExport('GetSourceFromNumber', function(number)
    if SYNC then
        local cid = ownerOf[(tostring(number or ''):gsub('%D', ''))]
        return cid and player.getSourceByIdentifier(cid) or nil
    end
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
