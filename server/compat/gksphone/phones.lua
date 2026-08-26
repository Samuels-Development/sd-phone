---@type table Player bridge (bridge.server.player): citizenid/source resolution.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): identity -> number, locale.
local settings = require 'server.settings.store'
---@type table Unique-phones flags (server.sim.state): leaf module, safe to take at the top. False
---means the SIM registry tables were never created, so nothing here may read them.
local simState = require 'server.sim.state'

---@type table Phone-id module; the table returned at end of file. Translates between gksphone's
---phone unique id and sd-phone's data identity, which every identity-keyed store here is keyed on.
local phones = {}

---@type boolean Whether the offline-enumeration caveat has been printed this session.
local warnedOfflineScope = false

---sd-phone's data identity IS the phone unique id. With unique phones on it is the per-device
---identity `phone_cloud_profiles.device_identity` stores, so it survives a SIM moving between
---handsets; with unique phones off it is the character identifier, one phone per character.
---
---gksphone's docs show three inconsistent example formats for the same value ("GKS2222222",
---"GKS2025AAAAA", "PHONE-1234") and tell integrators to treat it as opaque, so an sd-phone identity
---round-tripping through it breaks nothing. Deliberately NOT the phone number: a SIM swap moves a
---number between handsets, which is the case a phone id exists to tell apart.

---The SIM session module, resolved lazily. A branch without unique phones must still load this
---file, so the require is guarded rather than taken at the top.
---@return table|nil
local function sessionModule()
    local ok, mod = pcall(require, 'server.sim.session')
    return ok and mod or nil
end

---The SIM store, resolved lazily for the same reason.
---@return table|nil
local function simStore()
    local ok, mod = pcall(require, 'server.sim.store')
    return ok and mod or nil
end

---The admin store, resolved lazily. It carries the only owner-keyed read of the SIM registry
---(simsFor), which is how a character's handsets are enumerated without cloud backup being on.
---@return table|nil
local function adminStore()
    local ok, mod = pcall(require, 'server.admin.store')
    return ok and mod or nil
end

---The acting phone id for a connected player, or nil when they have no phone identity at all.
---Falls back to the character identifier when unique phones are off.
---@param source number player server id
---@return string|nil
function phones.forSource(source)
    if type(source) ~= 'number' then return nil end
    local session = sessionModule()
    if session then
        local identity = session.identity(source)
        if identity then return identity end
    end
    return player.getIdentifier(source)
end

---The phone id owning a number, or nil when the number is unassigned. Any formatting accepted.
---@param number string|number
---@return string|nil
function phones.forNumber(number)
    return settings.getCitizenByNumber(number)
end

---The phone number carried by a phone id, or nil when that identity has none.
---@param value any phone unique id
---@return string|nil
function phones.toNumber(value)
    if type(value) ~= 'string' or value == '' then return nil end
    return settings.getPhoneNumber(value)
end

---The connected server id acting as a phone id, or nil when nobody is. Checks the ACTIVE phone
---first, then every SIM a player carries, so a handset sitting in someone's pocket still resolves.
---@param value any phone unique id
---@return number|nil
function phones.toSource(value)
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

---The phone id for a character identifier, which is what gksphone calls a citizenID. Under unique
---phones the acting resolver only knows handset identities, so the character is looked up through
---the framework-native map and then, offline, through their registered handsets.
---@param identifier any QB citizenid / ESX identifier
---@return string|nil
function phones.forIdentifier(identifier)
    if type(identifier) ~= 'string' or identifier == '' then return nil end

    local src = player.getSourceByIdentifier(identifier)
    if src then return phones.forSource(src) end
    if not simState.active then return identifier end

    local realSrc = player.onlineRealCidMap()[identifier]
    if realSrc then return phones.forSource(realSrc) end

    local store = simStore()
    local profile = store and (store.listProfiles(identifier) or {})[1]
    if profile then return profile.deviceIdentity or profile.identity end

    local registry = adminStore()
    local sim = registry and (registry.simsFor(identifier) or {})[1]
    if sim then return sim.identity end

    return identifier
end

---Builds the phoneData table every gksphone GetPhoneData* export answers with. gksphone documents
---the shape nowhere, so the keys carry both gksphone's own vocabulary and sd-phone's, letting a
---caller written against either name read the same row.
---@param identity string|nil phone unique id
---@return table|nil
function phones.data(identity)
    if type(identity) ~= 'string' or identity == '' then return nil end
    local number = settings.getPhoneNumber(identity)
    local source = phones.toSource(identity)

    return {
        phoneUniqueId = identity,
        phoneUniqID   = identity,
        phoneID       = identity,
        identity      = identity,
        phoneNumber   = number,
        number        = number,
        citizenid     = source and player.getRealIdentifier(source) or identity,
        source        = source,
        online        = source ~= nil,
        phoneLang     = settings.getLocale(identity) or 'en',
        eSIMNumber    = number,
    }
end

---Every handset a character owns, as phoneData rows. Under unique phones that is the union of the
---SIM registry rows they own and their cloud-backup profiles, since backup is opt-in per phone.
---@param identifier any QB citizenid / ESX identifier
---@return table[]
function phones.allFor(identifier)
    if type(identifier) ~= 'string' or identifier == '' then return {} end

    local out, seen = {}, {}

    ---Appends one handset identity's row, skipping blanks and ids already listed.
    ---@param id any
    local function add(id)
        if type(id) ~= 'string' or id == '' or seen[id] then return end
        seen[id] = true
        local row = phones.data(id)
        if row then out[#out + 1] = row end
    end

    if simState.active then
        if not warnedOfflineScope then
            warnedOfflineScope = true
            print('^3[sd-phone]^0 gksphone compat: with unique phones on, an OFFLINE character enumerates only the handsets that hold a registered SIM or a cloud-backup profile. A handset with neither carries its identity on the inventory item, which cannot be read while its owner is offline.')
        end
        local registry = adminStore()
        if registry then
            for _, sim in ipairs(registry.simsFor(identifier) or {}) do
                add(sim.identity)
            end
        end
        local store = simStore()
        if store then
            for _, profile in ipairs(store.listProfiles(identifier) or {}) do
                add(profile.deviceIdentity or profile.identity)
            end
        end
    end
    if #out > 0 then return out end

    add(phones.forIdentifier(identifier))
    return out
end

return phones
