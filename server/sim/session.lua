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
---@field active SimEntry|table|nil the phone the player last opened (falls back to the first SIM; a SIM-less pick is the bare item)
---@field identity string|nil active SIM's data identity
---@field number string|nil active SIM's number
---@field color string|nil active phone's frame colour
---@field slot number|nil active phone's inventory slot

---@type table<number, { at: number, s: SimSession|nil }> Per-source cache; `s = nil` caches "no phone".
local cache = {}

---@type table<number, table> Per-source compute in flight, so a burst of callbacks landing while
---the first scan awaits its DB writes shares that scan instead of each minting its own identity.
local inflight = {}

---@type table<number, { slot?: number, number?: string, color?: string }> Which phone each
---player last opened; matched slot > number > colour against the carried SIMs.
local prefs = {}

---@type table<number, table<string, true>> Numbers each source has asserted sole ownership of
---this session, so rows a past double-mint left behind are released once, not on every resolve.
local claimed = {}

---@type integer How long one player's indexed identities are trusted before the sweep re-reads
---their inventory (ms). Moves through the inventory hooks re-index at once; this only bounds
---changes no hook reports, such as items another script adds or takes.
local INDEX_TTL = 60000

---@type table<number, { at: number, active: string|nil, all: table<string, true> }> What each
---source's last resolve found: the identity it acts as and every identity it carries.
local indexed = {}

---@type table<string, table<number, true>> Identity -> sources carrying it on any phone.
local carriers = {}

---@type table<string, table<number, true>> Identity -> sources acting as it on their active phone.
local actors = {}

---Removes `source` from one reverse map's set for `identity`, dropping the set once empty.
---@param map table<string, table<number, true>>
---@param identity string
---@param source number
local function unlink(map, identity, source)
    local set = map[identity]
    if not set then return end
    set[source] = nil
    if next(set) == nil then map[identity] = nil end
end

---Adds `source` to one reverse map's set for `identity`.
---@param map table<string, table<number, true>>
---@param identity string
---@param source number
local function link(map, identity, source)
    local set = map[identity]
    if not set then
        set = {}
        map[identity] = set
    end
    set[source] = true
end

---Drops everything the index holds for one source.
---@param source number player server id
local function unindex(source)
    local entry = indexed[source]
    if not entry then return end
    indexed[source] = nil
    for identity in pairs(entry.all) do unlink(carriers, identity, source) end
    if entry.active then unlink(actors, entry.active, source) end
end

---Records what a fresh resolve found for one source, replacing its previous entry, so identity
---lookups read a map instead of resolving every online player.
---@param source number player server id
---@param s SimSession|nil the resolved session (nil = no phone)
---@param now number GetGameTimer stamp of the resolve
local function reindex(source, s, now)
    unindex(source)
    local all = {}
    if s then
        for _, entry in ipairs(s.sims) do
            if entry.identity then all[entry.identity] = true end
        end
    end
    local active = s and s.identity or nil
    indexed[source] = { at = now, active = active, all = all }
    for identity in pairs(all) do link(carriers, identity, source) end
    if active then link(actors, active, source) end
end

---The sources in one reverse-map set, copied out so verifying them (which may re-resolve and
---re-index) never edits the set mid-traversal.
---@param set table<number, true>|nil
---@return number[]
local function candidates(set)
    local out = {}
    if set then
        for src in pairs(set) do out[#out + 1] = src end
    end
    return out
end

---Mirrors `number` onto `identity`'s settings row, announcing the attach when it changes, and
---once per session releases the number from any other row still holding it.
---@param source number player server id
---@param identity string data identity the number belongs to
---@param number string bare-digit number
local function mirrorNumber(source, identity, number)
    if settingsStore.getPhoneNumber(identity) ~= number then
        settingsStore.setPhoneNumber(identity, number)
        TriggerEvent('sd-phone:server:sim:numberAttached', source, identity, number)
    elseif not (claimed[source] and claimed[source][number]) then
        settingsStore.releasePhoneNumber(identity, number)
    end
    claimed[source] = claimed[source] or {}
    claimed[source][number] = true
end

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

---Finds the explicitly selected physical phone when it has no SIM. Legacy mode's `entries`
---contains only SIM-backed phones, so pickActive would otherwise fall back to another phone's SIM.
---A phone counts as SIM-less when it is missing from `sims`, so its SIM is not read a second time
---(in tray mode that read can activate a blank card), and a SIM that failed to register leaves
---its phone without service instead of lending it another phone's.
---@param source number player server id
---@param phones table[] every phone item the player carries
---@param sims SimEntry[] phones with registered SIM identities
---@return table|nil phone selected without a SIM
local function pickSelectedPhoneWithoutSim(source, phones, sims)
    local pref = prefs[source]
    if not pref then return nil end

    local simSlots = {}
    for _, sim in ipairs(sims) do simSlots[sim.slot] = true end

    if pref.slot then
        for _, phone in ipairs(phones) do
            if phone.slot == pref.slot then
                return not simSlots[phone.slot] and phone or nil
            end
        end
    end

    if pref.number then
        for _, sim in ipairs(sims) do
            if sim.number == pref.number then return nil end
        end
    end

    if pref.color then
        for _, sim in ipairs(sims) do
            if sim.color == pref.color then return nil end
        end
        for _, phone in ipairs(phones) do
            if phone.color == pref.color and not simSlots[phone.slot] then
                return phone
            end
        end
    end
end

---LEGACY (SIM-is-identity) resolver. Binds every SIM found: unknown numbers are registered, the
---first activator stamped, and each SIM identity's phone_settings row mirrors its number so
---every existing "my number" read keeps working. The active phone is the last-opened one
---(prefs), else the first SIM'd phone in config order. A selected phone without a SIM stays
---active without borrowing another phone's SIM.
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
                mirrorNumber(source, identity, number)
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

    local active = pickSelectedPhoneWithoutSim(source, phones, sims) or pickActive(source, sims)
    local number, identity
    if active and active.number then
        number, identity = active.number, active.identity
    end

    return {
        hasPhone = true,
        hasSim   = number ~= nil,
        sims     = sims,
        active   = active,
        identity = identity,
        number   = number,
        color    = active and active.color or phones[1].color,
        slot     = active and active.slot or phones[1].slot,
    }
end

---Resolves a phone's persistent DEVICE identity, minting one into the item metadata on first
---use. ADOPTS an installed SIM's existing profile (its `sim:<number>` or bound citizenid
---identity) when that profile already has data, so a legacy server flipping DeviceIdentity on
---grandfathers every phone in place; a fresh phone gets a `device:<id>` of its own. Also stamps
---the first-activator cid as the Face Unlock owner.
---
---A number IMPORTED from another phone resource (see inv.hasLegacyNumber) binds to its SIM
---identity unconditionally, because the import that fills that identity may not have run yet.
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
            if simIdentity and siminv.hasLegacyNumber(phone) then
                -- A number carried in from another phone resource binds unconditionally, and
                -- WITHOUT consuming the adoption latch: the import that fills this identity may
                -- not have run yet, so hasData is false and the phone would fall through to a
                -- minted device id - which getDevice short-circuits on every later resolve,
                -- stranding the imported data under sim:<number> for good. Skipping the latch is
                -- safe because the resources this imports from key their numbers one-per-phone,
                -- so two imported phones cannot arrive holding the same one.
                identity = simIdentity
            elseif simIdentity and settingsStore.hasData(simIdentity)
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
            mirrorNumber(source, identity, number)
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
        mirrorNumber(source, realCid, liveNumber)
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
    local pending = inflight[source]
    if pending then return Citizen.Await(pending) end
    local p = promise.new()
    inflight[source] = p
    local ok, s = pcall(compute, source)
    inflight[source] = nil
    if not ok then
        p:reject(s)
        error(s, 0)
    end
    cache[source] = { at = now, s = s }
    reindex(source, s, now)
    p:resolve(s)
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

---The online source acting as `identity` on their active phone, nil when nobody is. Reads the
---index for candidates, then confirms each through its own session (re-read once its cache
---expires), so a phone that left a player's inventory stops resolving to them within the cache
---lifetime, as it did when every online player was resolved per lookup.
---@param identity string data identity
---@return number|nil source
function session.sourceActingAs(identity)
    for _, src in ipairs(candidates(actors[identity])) do
        if session.identity(src) == identity then return src end
    end
    return nil
end

---The online source carrying `identity` on any phone (a pocketed phone counts), nil when nobody
---is. Confirmed per candidate like sourceActingAs.
---@param identity string data identity
---@return number|nil source
function session.sourceCarrying(identity)
    for _, src in ipairs(candidates(carriers[identity])) do
        if session.hasIdentity(src, identity) then return src end
    end
    return nil
end

---The index, after re-resolving every indexed source whose session cache was dropped since it
---was indexed (a phone switch, a panel refresh), so a batch map never answers from a session
---already known to be out of date. Merely aged entries are left to the sweep.
---@return table<number, { at: number, active: string|nil, all: table<string, true> }>
local function currentIndex()
    local dropped = {}
    for src in pairs(indexed) do
        if not cache[src] then dropped[#dropped + 1] = src end
    end
    for _, src in ipairs(dropped) do
        local ok, err = pcall(session.resolve, src)
        if not ok then
            print(('^1[sd-phone:sim]^0 session re-read failed for %s: %s'):format(src, err))
        end
    end

    return indexed
end

---`{ [identity] = source }` for the identity every indexed player acts as. Built from the index:
---a fan-out builds this per push, and resolving every player for it was the cost.
---@return table<string, number>
function session.actingMap()
    local out = {}
    for src, entry in pairs(currentIndex()) do
        if entry.active then out[entry.active] = src end
    end
    return out
end

---`{ [identity] = source }` for every identity every indexed player carries. Built from the index,
---like actingMap.
---@return table<string, number>
function session.carryingMap()
    local out = {}
    for src, entry in pairs(currentIndex()) do
        for identity in pairs(entry.all) do out[identity] = src end
    end
    return out
end

---Re-resolves every online player whose index entry is missing or older than INDEX_TTL, so the
---index catches up with inventory changes no hook reported. Players without a loaded character
---are skipped, and an entry left behind by a source that is gone is dropped.
function session.refreshIndex()
    if not state.active then return end

    local now = GetGameTimer()
    for src in pairs(indexed) do
        if not GetPlayerName(src) then unindex(src) end
    end

    local due = {}
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        local entry = src and indexed[src]
        if src and (not entry or (now - entry.at) >= INDEX_TTL) and realIdentifier(src) then
            due[#due + 1] = src
        end
    end

    for _, src in ipairs(due) do
        local ok, err = pcall(session.resolve, src)
        if not ok then
            print(('^1[sd-phone:sim]^0 index refresh failed for %s: %s'):format(src, err))
        end
        Wait(0)
    end
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
        fold    = s and s.active and s.active.name and require('shared.phonefold').item(s.active.name) or nil,
        look    = s and s.active and s.active.name and require('shared.phonefold').itemLook(s.active.name) or nil,
        -- Device/character mode: the setup/profile localStorage namespace keys off the acting
        -- identity (stable across SIM swaps); legacy keys off the number, client-side.
        profile = deviceLike and s and s.identity or nil,
    })
end

-- Dropped players release their cache, preference and index entries.
AddEventHandler('playerDropped', function()
    cache[source] = nil
    prefs[source] = nil
    claimed[source] = nil
    unindex(source)
end)

-- Index upkeep: a quick pass every 10s that only re-reads players whose entry has aged past
-- INDEX_TTL, so each player costs at most one inventory read a minute.
CreateThread(function()
    while true do
        Wait(10000)
        session.refreshIndex()
    end
end)

return session
