---@type table SIM feature flags (server.sim.state): active + mode.
local state         = require 'server.sim.state'
---@type table SIM registry persistence (server.sim.store): number -> identity mapping.
local simStore      = require 'server.sim.store'
---@type table Slot-level inventory access for SIMs (server.sim.inv).
local siminv        = require 'server.sim.inv'
---@type table Settings persistence (server.settings.store): phone_settings number sync.
local settingsStore = require 'server.settings.store'
---@type table Shared server helpers (server.util): newId for minting device identities.
local util          = require 'server.util'

---@type table Session module; the table returned at end of file. Resolves every SIM each
---connected player is carrying (a player can hold several phones with different numbers), which
---one is currently "active" (the phone they last opened), and therefore which data identity
---their callbacks act as - with a short cache so the per-callback identity wrapper stays cheap.
local session = {}

---@type fun(source: number): string|nil Real framework identifier resolver, injected by
---server/sim/init.lua BEFORE the getIdentifier wrapper is installed (never the wrapped fn).
local realIdentifier = function() return nil end

---Injects the unwrapped framework-identifier resolver.
---@param fn fun(source: number): string|nil
function session.setRealResolver(fn) realIdentifier = fn end

---@type integer Cache lifetime in ms; inventory scans are re-run at most this often per player.
local TTL = 5000

---@class SimEntry
---@field slot number inventory slot of the phone
---@field name string phone item name
---@field color string phone frame colour
---@field number string|nil bare-digit SIM number (device mode: nil when the phone has no SIM)
---@field identity string data identity (SIM identity in legacy, device identity in device mode)
---@field hasSim boolean|nil device mode: whether this phone has a SIM installed
---@field owner string|nil device mode: the phone's first-activator cid (Face Unlock gate)

---@class SimSession
---@field hasPhone boolean player carries at least one configured phone item
---@field hasSim boolean the active phone has a SIM
---@field sims SimEntry[] every SIM'd phone carried (all stay reachable for calls/messages)
---@field active SimEntry|nil the phone the player last opened (falls back to the first SIM)
---@field identity string|nil active SIM's data identity
---@field number string|nil active SIM's number
---@field color string|nil active phone's frame colour
---@field slot number|nil active phone's inventory slot

---@type table<number, { at: number, s: SimSession|nil }> Per-source cache; `s = nil` caches "no phone".
local cache = {}

---@type table<number, { slot?: number, number?: string, color?: string }> Which phone each
---player last opened; matched slot > number > colour against the carried SIMs.
local prefs = {}

---Drops one player's cached session (or everyone's with nil) so the next resolve re-scans.
---@param source number|nil player server id, nil to flush all
function session.invalidate(source)
    if source then cache[source] = nil else cache = {} end
end

---Records which phone the player just opened (or tried to). Matched against the carried SIMs
---on the next resolve; stale hints simply fall through to the first SIM'd phone. A colour-only
---hint (the keybind) never downgrades an existing slot-precise pick of the same colour, so
---using a specific phone item stays authoritative between keybind toggles.
---@param source number player server id
---@param pref { slot?: number, number?: string, color?: string }
function session.setActive(source, pref)
    if type(pref) ~= 'table' then return end
    local existing = prefs[source]
    if not pref.slot and not pref.number and pref.color
        and existing and existing.slot and existing.color == pref.color then
        return
    end
    prefs[source] = { slot = tonumber(pref.slot), number = pref.number, color = pref.color }
    session.invalidate(source)
end

---Picks the active entry among `entries` from the player's last-opened hint (slot > number >
---colour), falling back to the first entry.
---@param source number player server id
---@param entries SimEntry[]
---@return SimEntry|nil
local function pickActive(source, entries)
    local active
    local pref = prefs[source]
    if pref then
        for _, entry in ipairs(entries) do
            if pref.slot and entry.slot == pref.slot then active = entry break end
        end
        if not active and pref.number then
            for _, entry in ipairs(entries) do
                if entry.number == pref.number then active = entry break end
            end
        end
        if not active and pref.color then
            for _, entry in ipairs(entries) do
                if entry.color == pref.color then active = entry break end
            end
        end
    end
    return active or entries[1]
end

---LEGACY (SIM-is-identity) resolver. Binds every SIM found: unknown numbers are registered, the
---first activator stamped, and each SIM identity's phone_settings row mirrors its number so
---every existing "my number" read keeps working. The active phone is the last-opened one
---(prefs), else the first SIM'd phone in config order, else the first phone.
---@param source number player server id
---@param phones { slot: number, name: string, color: string, metadata: table }[]
---@return SimSession
local function computeLegacy(source, phones)
    local sims = {}
    for _, phone in ipairs(phones) do
        local number = siminv.getSimNumber(source, phone)
        if number then
            local identity = simStore.ensureRegistered(number, realIdentifier(source))
            if identity then
                if settingsStore.getPhoneNumber(identity) ~= number then
                    settingsStore.setPhoneNumber(identity, number)
                    -- Back in service: store-and-forward listeners deliver anything queued.
                    TriggerEvent('sd-phone:server:sim:numberAttached', source, identity, number)
                end
                sims[#sims + 1] = {
                    slot     = phone.slot,
                    name     = phone.name,
                    color    = phone.color,
                    number   = number,
                    identity = identity,
                }
            end
        end
    end

    local active = pickActive(source, sims)
    return {
        hasPhone = true,
        hasSim   = active ~= nil,
        sims     = sims,
        active   = active,
        identity = active and active.identity or nil,
        number   = active and active.number or nil,
        color    = active and active.color or phones[1].color,
        slot     = active and active.slot or phones[1].slot,
    }
end

---Resolves a phone's persistent DEVICE identity, minting one into the item metadata on first
---use. ADOPTS an installed SIM's existing profile (its `sim:<number>` or bound citizenid
---identity) when that profile already has data, so a legacy server flipping DeviceIdentity on
---grandfathers every phone in place; a fresh phone gets a `device:<id>` of its own. Also stamps
---the first-activator cid as the Face Unlock owner.
---@param source number player server id
---@param phone { slot: number, metadata: table }
---@param number string|nil the SIM number currently installed
---@return string identity, string|nil owner
local function resolveDevice(source, phone, number)
    local identity, owner = siminv.getDevice(phone)
    local realCid = realIdentifier(source)
    local dirty = false

    if not identity then
        if number then
            -- Adoption is a ONE-SHOT grandfathering step: the first phone to carry a legacy SIM
            -- inherits its profile, but claimAdoption atomically binds the card so a second phone
            -- that later receives the same SIM mints a fresh device identity (number, not data).
            local simIdentity = simStore.ensureRegistered(number, realCid)
            if simIdentity and settingsStore.hasData(simIdentity)
                and simStore.claimAdoption(number, simIdentity) then
                identity = simIdentity
            end
        end
        identity = identity or ('device:' .. util.newId(16))
        dirty = true
    end
    if not owner and realCid then
        owner = realCid
        dirty = true
    end
    if dirty then siminv.setPhoneDevice(source, phone.slot, identity, owner) end
    return identity, owner
end

---DEVICE (phone-owns-data) resolver. Every carried phone maps to its own persistent device
---identity regardless of SIM; a SIM only supplies the number + service. Each SIM'd phone mirrors
---its number onto its device row (so number lookups resolve to the DEVICE), and a phone whose
---SIM was pulled has its number mirror cleared (no SIM = no number, but the phone still works).
---@param source number player server id
---@param phones { slot: number, name: string, color: string, metadata: table }[]
---@return SimSession
local function computeDevice(source, phones)
    local realCid = realIdentifier(source)
    local devices = {}
    for _, phone in ipairs(phones) do
        local number = siminv.getSimNumber(source, phone)
        if not number and state.builtin then
            -- Built-in numbers: the phone's eSIM activates itself on first use. The minted
            -- number is stamped onto the item and belongs to this phone for good; a failed
            -- stamp skips the number (retried next resolve) rather than orphaning it silently.
            local minted = simStore.create({})
            if minted and siminv.setPhoneSim(source, phone.slot, minted) then
                number = minted
            end
        end
        local identity, owner = resolveDevice(source, phone, number)
        if number then
            simStore.ensureRegistered(number, realCid)
            if settingsStore.getPhoneNumber(identity) ~= number then
                settingsStore.setPhoneNumber(identity, number)
                -- Back in service: store-and-forward listeners deliver anything queued.
                TriggerEvent('sd-phone:server:sim:numberAttached', source, identity, number)
            end
        else
            local existing = settingsStore.getPhoneNumber(identity)
            if existing and existing ~= '' then settingsStore.clearPhoneNumber(identity) end
        end
        devices[#devices + 1] = {
            slot     = phone.slot,
            name     = phone.name,
            color    = phone.color,
            number   = number,
            identity = identity,
            hasSim   = number ~= nil,
            owner    = owner,
        }
    end

    local active = pickActive(source, devices)
    return {
        hasPhone = true,
        hasSim   = active ~= nil and active.hasSim == true,
        sims     = devices,
        active   = active,
        identity = active and active.identity or nil,
        number   = active and active.number or nil,
        color    = active and active.color or phones[1].color,
        slot     = active and active.slot or phones[1].slot,
    }
end

---CHARACTER (stock-data) resolver. Every phone acts as the holder's own character profile -
---the stock data model - and a SIM only changes the NUMBER. Without a SIM the character keeps
---an innate auto-assigned number (vanilla behaviour); the ACTIVE phone's SIM overrides it, and
---ejecting falls back to a fresh innate number. Entry `number`/`hasSim` reflect REAL installed
---SIMs only; the session-level number is whatever is currently live for the character.
---@param source number player server id
---@param phones { slot: number, name: string, color: string, metadata: table }[]
---@return SimSession|nil
local function computeCharacter(source, phones)
    local realCid = realIdentifier(source)
    if not realCid then return nil end
    local entries = {}
    for _, phone in ipairs(phones) do
        local number = siminv.getSimNumber(source, phone)
        if not number and state.builtin then
            -- Built-in numbers pair with character data too: the phone still mints its own
            -- permanent number on first use; only the DATA stays the character's.
            local minted = simStore.create({})
            if minted and siminv.setPhoneSim(source, phone.slot, minted) then number = minted end
        end
        if number then simStore.ensureRegistered(number, realCid) end
        entries[#entries + 1] = {
            slot     = phone.slot,
            name     = phone.name,
            color    = phone.color,
            number   = number,
            identity = realCid,
            hasSim   = number ~= nil,
            owner    = realCid,
        }
    end

    local active = pickActive(source, entries)
    -- One data profile = one live number. The active phone's SIM is it; with no SIM installed
    -- the character falls back to an innate stock number (a SIM-lent leftover in the mirror is
    -- cleared first so ensurePhoneNumber mints a fresh innate one).
    local liveNumber = active and active.number or nil
    if liveNumber then
        if settingsStore.getPhoneNumber(realCid) ~= liveNumber then
            settingsStore.setPhoneNumber(realCid, liveNumber)
            TriggerEvent('sd-phone:server:sim:numberAttached', source, realCid, liveNumber)
        end
    else
        local mirror = settingsStore.getPhoneNumber(realCid)
        if mirror and mirror ~= '' and simStore.get(mirror) then
            settingsStore.clearPhoneNumber(realCid)
        end
        liveNumber = settingsStore.ensurePhoneNumber(realCid)
    end

    return {
        hasPhone = true,
        -- Service tracks the live number, not SIM presence: a SIM-less phone still works in
        -- this mode, exactly like stock.
        hasSim   = liveNumber ~= nil,
        sims     = entries,
        active   = active,
        identity = realCid,
        number   = liveNumber,
        color    = active and active.color or phones[1].color,
        slot     = active and active.slot or phones[1].slot,
    }
end

---Scans the player's inventory and resolves their SIM/device session for the active mode.
---@param source number player server id
---@return SimSession|nil s nil when the player carries no phone item
local function compute(source)
    local phones = siminv.findPhones(source)
    if #phones == 0 then return nil end
    if state.character then return computeCharacter(source, phones) end
    if state.device then return computeDevice(source, phones) end
    return computeLegacy(source, phones)
end

---The player's current SIM session, cached for TTL ms. Nil when the player carries no phone.
---@param source number player server id
---@return SimSession|nil
function session.resolve(source)
    if not state.active then return nil end
    local now = GetGameTimer()
    local hit = cache[source]
    if hit and (now - hit.at) < TTL then return hit.s end
    local s = compute(source)
    cache[source] = { at = now, s = s }
    return s
end

---The acting data identity for a source: the ACTIVE phone's SIM identity, or nil without a SIM
---(no SIM = no service = every identity-keyed callback fails closed).
---@param source number player server id
---@return string|nil identity
function session.identity(source)
    local s = session.resolve(source)
    return s and s.identity or nil
end

---Every identity reachable on this player - one per carried SIM. A player with two SIM'd
---phones in their pocket receives calls/messages addressed to either number.
---@param source number player server id
---@return table<string, true> identities
function session.identities(source)
    local out = {}
    local s = session.resolve(source)
    if s then
        for _, entry in ipairs(s.sims) do out[entry.identity] = true end
    end
    return out
end

---True when any SIM the player carries maps to `identity`.
---@param source number player server id
---@param identity string data identity
---@return boolean
function session.hasIdentity(source, identity)
    return session.identities(source)[identity] == true
end

---True when the ACTIVE phone "belongs" to the player: its first activator matches their real
---character. Gates Face Unlock so a stolen phone never face-unlocks for the thief. Device mode
---gates on the DEVICE owner (stamped on the phone item, so it holds even with the SIM out);
---legacy gates on the installed SIM's owner.
---@param source number player server id
---@return boolean owner
function session.isOwner(source)
    if not state.active then return true end
    local s = session.resolve(source)
    if not s then return false end
    -- Character mode: the acting data is always the holder's own, so any phone they hold is
    -- "theirs" (a stolen phone shows the thief's data, protected by the thief's own security).
    if state.character then return true end
    if state.device then
        return s.active ~= nil and s.active.owner ~= nil and s.active.owner == realIdentifier(source)
    end
    if not s.number then return false end
    local row = simStore.get(s.number)
    if not row or not row.owner_cid then return false end
    return row.owner_cid == realIdentifier(source)
end

---Recomputes a player's SIM state and pushes it to their client (the NUI swaps the "No SIM"
---screen in or out live). Call after anything that may have moved a SIM or phone.
---@param source number player server id
function session.push(source)
    if not state.active then return end
    session.invalidate(source)
    local s = session.resolve(source)
    -- Character mode behaves like device mode for the NUI: no No-SIM wall, and the profile
    -- namespace keys off the acting identity (the character - same on every phone).
    local deviceLike = state.device or state.character
    TriggerClientEvent('sd-phone:client:simState', source, {
        enabled = true,
        device  = deviceLike,
        hasSim  = s ~= nil and s.hasSim or false,
        number  = s and s.number or nil,
        color   = s and s.color or nil,
        -- Device/character mode: the setup/profile localStorage namespace keys off the acting
        -- identity (stable across SIM swaps); legacy keys off the number, client-side.
        profile = deviceLike and s and s.identity or nil,
    })
end

-- Dropped players release their cache + preference entries.
AddEventHandler('playerDropped', function()
    cache[source] = nil
    prefs[source] = nil
end)

return session
