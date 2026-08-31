---@type table Identity resolution for the lb-phone import (server.migrate.identity). Reads every
---lb-phone phone once, resolves each owner id to an sd-phone citizenid, and hands the porters two
---lookups: the list of resolved phones and a number -> citizenid map.
local identity = {}

local store = require 'server.migrate.store'
---@type table Identity scheme (server.migrate.scheme): character-keyed or phone-keyed rows.
local scheme = require 'server.migrate.scheme'

---Strip a value to bare digits ('' when nil / digit-free), matching how sd-phone stores numbers.
---@param s any
---@return string
local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---A 4-6 digit lock code, or nil.
---@param v any
---@return string|nil
local function pinOf(v)
    if type(v) ~= 'string' then return nil end
    return v:match('^%d%d%d%d%d?%d?$')
end

---Resolves one lb-phone owner id to an sd-phone citizenid under the configured mode. Returns the
---citizenid, or nil plus a reason ('unresolved' or 'ambiguous').
---@param ownerId string
---@param roster { cids: table<string, boolean>, licenseToCids: table<string, string[]> }
---@param mode 'auto'|'citizenid'|'license'
---@return string|nil citizenid, string|nil reason
local function resolveOwner(ownerId, roster, mode)
    if not ownerId or ownerId == '' then return nil, 'unresolved' end

    if mode == 'citizenid' then
        return roster.cids[ownerId] and ownerId or nil, 'unresolved'
    end

    -- 'auto' tries a direct citizenid match first, then the license path; 'license' skips straight to it.
    if mode == 'auto' and roster.cids[ownerId] then return ownerId, nil end

    local bucket = roster.licenseToCids[ownerId]
    if not bucket then return nil, 'unresolved' end
    if #bucket > 1 then return nil, 'ambiguous' end
    return bucket[1], nil
end

---Builds the identity context: reads every lb-phone phone, resolves owners, and produces the
---lookups the porters use. Also tallies resolved / unresolved / ambiguous counts.
---
---Under per-phone keying the porters are handed one row identity per NUMBER rather than one per
---character, which is the whole of what makes a player's second phone keep its own data. Every
---porter reads `numberToCid` and nothing else, so that single substitution carries all of them.
---
---A phone whose number its own owner ALREADY holds here keeps that character identity, so a run
---against a database imported per character recognises those rows instead of copying them and only
---brings across the phones the earlier run left behind. A number held by anyone else is a genuine
---clash and the phone is skipped: importing it under an identity that cannot also hold the number
---would leave a phone carrying data with no service.
---
---The scheme is decided AND pinned here rather than in a porter: a porter that fails does not stop
---the run (see runner.execute), so a porter holding the pin could leave the data porters writing
---rows under a keying nothing recorded.
---@param cfg table config.Migrate
---@param framework { name: 'qb'|'esx' }
---@param opts { pin: boolean|nil }|nil pin the scheme for this database (execute, not scan or dry runs)
---@return { resolvedPhones: { cid: string, ownerCid: string, number: string, pin: string|nil }[], numberToCid: table<string, string>, cids: string[], scheme: string, schemeReason: string|nil, dataOwner: string, stats: table }
function identity.build(cfg, framework, opts)
    local roster = store.loadRoster(framework.name)
    local phones = store.lbPhones()
    local plan = scheme.decide()
    local perPhone = plan.mode == 'per-number'
    if opts and opts.pin then scheme.pin(plan.mode, plan.dataOwner) end

    local resolvedPhones, numberToCid, cidSeen, cids = {}, {}, {}, {}
    local perOwner = {}
    local stats = { total = #phones, resolved = 0, unresolved = 0, ambiguous = 0,
                    multiPhone = 0, collisions = 0, pending = 0 }

    -- Who already holds each of these numbers here, in one batch rather than a query per phone.
    local holder = {}
    if perPhone then
        local numbers = {}
        for _, p in ipairs(phones) do
            local n = digits(p.phone_number)
            if n ~= '' then numbers[#numbers + 1] = n end
        end
        holder = store.numberHolders(numbers)
    end

    for _, p in ipairs(phones) do
        local cid, reason = resolveOwner(p.owner_id, roster, cfg.identifierMode or 'auto')
        if cid then
            local number = digits(p.phone_number)
            local held = (perPhone and number ~= '') and holder[number] or nil
            -- `sim:<number>` is the same literal server/sim/store.lua registers a number under, so
            -- a migrated phone resolves to the profile this import filled the moment it is used.
            -- The exception is a number this phone's own owner already holds, which is an earlier
            -- per-character import of this very phone: key on them and its rows are recognised.
            local rowId = cid
            if perPhone and number ~= '' then
                rowId = (held == cid) and cid or ('sim:' .. number)
            end

            if held and held ~= rowId then
                stats.collisions = stats.collisions + 1
            else
                resolvedPhones[#resolvedPhones + 1] =
                    { cid = rowId, ownerCid = cid, number = number, pin = pinOf(p.pin) }
                if number ~= '' then numberToCid[number] = rowId end
                if not cidSeen[cid] then cidSeen[cid] = true; cids[#cids + 1] = cid end
                perOwner[cid] = (perOwner[cid] or 0) + 1
                stats.resolved = stats.resolved + 1
                if perPhone and number ~= '' and not held then stats.pending = stats.pending + 1 end
            end
        elseif reason == 'ambiguous' then
            stats.ambiguous = stats.ambiguous + 1
        else
            stats.unresolved = stats.unresolved + 1
        end
    end

    -- How many players this actually decides anything for: everyone else has one phone and lands
    -- identically either way.
    for _, n in pairs(perOwner) do
        if n > 1 then stats.multiPhone = stats.multiPhone + 1 end
    end

    return {
        resolvedPhones = resolvedPhones,
        numberToCid    = numberToCid,
        cids           = cids,
        scheme         = plan.mode,
        schemeReason   = plan.reason,
        dataOwner      = plan.dataOwner,
        stats          = stats,
    }
end

return identity
