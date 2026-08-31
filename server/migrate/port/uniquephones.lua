---@type table Unique-phones porter (server.migrate.port.uniquephones). Registers every migrated
---number in sd-phone's SIM registry, so a phone item carrying that number resolves to the profile
---this import filled rather than minting a blank identity of its own.
---
---It writes no player data. The keying decision is made and pinned in server.migrate.identity,
---which runs before any porter; this domain carries it out, gives the panel a line for it, and
---leaves a marker so a re-run skips it.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table SIM registry (server.sim.store): owns the phone_sim_cards schema.
local simStore = require 'server.sim.store'

---@param ctx table migration context (resolvedPhones, scheme, dryRun)
---@return { registered: number, skipped: number, refused: number, pending: number }
function M.run(ctx)
    -- Per-character keying: every phone already resolves to its holder, so there is nothing to
    -- register and a card row would point at an identity no phone would ever ask for.
    if ctx.scheme ~= 'per-number' then
        local refused = 0
        for _, p in ipairs(ctx.resolvedPhones) do
            if p.number ~= '' then refused = refused + 1 end
        end
        return { registered = 0, skipped = 0, refused = refused, pending = 0 }
    end

    -- phone_sim_cards is created by the sim module's boot thread, which this can beat. ensureSchema
    -- is idempotent, so claiming it here costs nothing and removes the race.
    local ok, err = pcall(simStore.ensureSchema)
    if not ok then
        error(('the SIM registry could not be created: %s'):format(tostring(err)), 0)
    end

    local rows, seen, skipped = {}, {}, 0
    for _, p in ipairs(ctx.resolvedPhones) do
        -- lb-phone keys phone_phones UNIQUE on the number, so a repeat here means a phone with no
        -- number at all rather than two phones contending for one.
        if p.number == '' or seen[p.number] then
            skipped = skipped + 1
        else
            seen[p.number] = true
            rows[#rows + 1] = { p.number, p.cid, p.ownerCid }
        end
    end

    if not ctx.dryRun then store.registerSimCards(rows) end
    return {
        registered = #rows,
        skipped    = skipped,
        refused    = 0,
        -- Phones nothing here holds a number for yet. On a first import that is all of them; on a
        -- database imported per character it is exactly the phones that run left behind.
        pending    = (ctx.stats and ctx.stats.pending) or 0,
    }
end

return M
