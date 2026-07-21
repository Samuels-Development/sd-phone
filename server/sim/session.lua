---@type table SIM feature flags (server.sim.state): active + mode.
local state         = require 'server.sim.state'
---@type table SIM registry persistence (server.sim.store): number -> identity mapping.
local simStore      = require 'server.sim.store'
---@type table Slot-level inventory access for SIMs (server.sim.inv).
local siminv        = require 'server.sim.inv'
---@type table Settings persistence (server.settings.store): phone_settings number sync.
local settingsStore = require 'server.settings.store'

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
---@field slot number inventory slot of the phone holding this SIM
---@field name string phone item name
---@field color string phone frame colour
---@field number string bare-digit SIM number
---@field identity string data identity the SIM maps to

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

---Scans the player's inventory and binds every SIM found: unknown numbers are registered, the
---first activator stamped, and each SIM identity's phone_settings row mirrors its number so
---every existing "my number" read keeps working. The active phone is the last-opened one
---(prefs), else the first SIM'd phone in config order, else the first phone.
---@param source number player server id
---@return SimSession|nil s nil when the player carries no phone item
local function compute(source)
    local phones = siminv.findPhones(source)
    if #phones == 0 then return nil end

    local sims = {}
    for _, phone in ipairs(phones) do
        local number = siminv.getSimNumber(source, phone)
        if number then
            local identity = simStore.ensureRegistered(number, realIdentifier(source))
            if identity then
                if settingsStore.getPhoneNumber(identity) ~= number then
                    settingsStore.setPhoneNumber(identity, number)
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

    local active
    local pref = prefs[source]
    if pref then
        for _, entry in ipairs(sims) do
            if pref.slot and entry.slot == pref.slot then
                active = entry
                break
            end
        end
        if not active and pref.number then
            for _, entry in ipairs(sims) do
                if entry.number == pref.number then
                    active = entry
                    break
                end
            end
        end
        if not active and pref.color then
            for _, entry in ipairs(sims) do
                if entry.color == pref.color then
                    active = entry
                    break
                end
            end
        end
    end
    active = active or sims[1]

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

---True when the ACTIVE phone "belongs" to the player: its SIM's first activator matches their
---real character. Gates Face Unlock so a stolen phone never face-unlocks for the thief.
---@param source number player server id
---@return boolean owner
function session.isOwner(source)
    if not state.active then return true end
    local s = session.resolve(source)
    if not s or not s.number then return false end
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
    TriggerClientEvent('sd-phone:client:simState', source, {
        enabled = true,
        hasSim  = s ~= nil and s.hasSim or false,
        number  = s and s.number or nil,
        color   = s and s.color or nil,
    })
end

-- Dropped players release their cache + preference entries.
AddEventHandler('playerDropped', function()
    cache[source] = nil
    prefs[source] = nil
end)

return session
