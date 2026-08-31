---@type table Import identity scheme (server.migrate.scheme). Decides whether an import keys its
---rows on the CHARACTER (stock sd-phone) or on each PHONE (unique phones), and pins that choice
---for the life of the database so a later config change can never re-key rows already in place.
---
---lb-phone partitions its data by phone number - every table carries `phone_number` with a foreign
---key onto phone_phones - so a character holding two phones has two genuinely separate sets of
---contacts, photos and app accounts. sd-phone partitions by identity string. Keying one identity
---per number is what preserves that; keying one per character merges them and throws the second
---number away.
---
---A database already imported per character is not refused. Each phone keys on whichever identity
---already holds its number, falling back to `sim:<number>` when nothing does, so a later run tops
---up only the phones the first one left behind and rewrites none of its rows. That is the same
---precedence server/sim/store.lua resolves a number by at runtime, so the import and the phone
---agree by construction.
local scheme = {}

---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table Live SIM state (server.sim.state): authoritative once the sim module has booted.
local simState = require 'server.sim.state'
---@type table SIM inventory glue (server.sim.inv): per-slot metadata capability probe.
local siminv = require 'server.sim.inv'
---@type table SIM tray (server.sim.tray): tray mode keeps the number off the phone item.
local tray = require 'server.sim.tray'

---@type string Marker row the pinned scheme lives under. Deliberately OUTSIDE the `lbphone:`
---domain prefix: store.completedDomains reads that namespace and would otherwise report a phantom
---domain called `scheme` that no source declares and the panel cannot render.
local MARK = 'sdphone:import-scheme'

---@type table<string, string> Why per-phone keying was refused, in the panel's voice.
scheme.reasons = {
    simoff    = 'unique phones are off, so every phone here belongs to its character',
    backend   = 'this inventory cannot store per-item metadata, so two phones cannot be told apart',
    character = "DataOwner is 'character', where every phone opens its holder's own profile",
    tray      = 'SIM trays keep the number in a separate stash item, which an import cannot reach',
}

---The DataOwner this config resolves to, reproducing the boot coercion in server/sim/init.lua.
---Only consulted before the sim module has settled; after that simState is authoritative.
---@return 'device'|'sim'|'character'
local function configuredOwner()
    local owner = config.Sim.DataOwner
    if owner ~= 'device' and owner ~= 'sim' and owner ~= 'character' then
        owner = (config.Sim.DeviceIdentity ~= false) and 'device' or 'sim'
    end
    if config.Sim.BuiltInNumbers == true and owner == 'sim' then owner = 'device' end
    return owner
end

---The DataOwner in force, preferring the resolved boot state over the raw config.
---@return 'device'|'sim'|'character'
function scheme.dataOwner()
    if simState.active then
        if simState.character then return 'character' end
        return simState.device and 'device' or 'sim'
    end
    return configuredOwner()
end

---Why this database cannot key rows per phone, or nil when it can. Prefers the resolved sim state,
---falling back to the config while the sim module's boot thread is still waiting on its backend.
---@return string|nil reason
local function blocker()
    if simState.active then
        if simState.character then return 'character' end
        if simState.mode == 'tray' then return 'tray' end
        return nil
    end
    if config.Sim.Enabled ~= true then return 'simoff' end
    if not siminv.supported() then return 'backend' end
    if configuredOwner() == 'character' then return 'character' end
    if config.Sim.BuiltInNumbers ~= true and tray.configured and siminv.isOx() then return 'tray' end
    return nil
end

---Resolves the scheme for this run: per-phone keying wherever this server can support it, with the
---reason when it cannot. A database already keyed per phone stays that way even if the config is
---later turned off, because re-keying it per character would write a second, character-owned copy
---of every row beside the per-phone rows already there.
---@return { mode: 'per-number'|'per-character', reason: string|nil, dataOwner: string, pinned: boolean }
function scheme.decide()
    local owner = scheme.dataOwner()
    local why = blocker()

    if why and store.readScheme(MARK) == 'per-number' then
        return { mode = 'per-number', reason = nil, dataOwner = owner, pinned = true }
    end
    return {
        mode      = why and 'per-character' or 'per-number',
        reason    = why,
        dataOwner = owner,
        pinned    = false,
    }
end

---Pins the scheme for this database. Idempotent - the first run to record one wins, which is what
---stops a later config change re-keying rows that are already in place.
---@param mode 'per-number'|'per-character'
---@param dataOwner string the DataOwner in force when it was chosen
function scheme.pin(mode, dataOwner)
    store.recordScheme(MARK, mode, dataOwner)
end

return scheme
