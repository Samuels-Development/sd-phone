---@type table Reactions porter (server.migrate.port.reactions). Attaches lb-phone message
---reactions to the messages the messages porter already wrote, joining on its `m<id>` mid format.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { imported: number, skipped: number }
function M.run(ctx)
    local rows, imported, skipped = {}, 0, 0
    -- `reaction` only exists on lb-phone's shape; sd-phone's own table uses `emoji`.
    if not store.lbSource('message_reactions', 'reaction') then
        return { imported = 0, skipped = 0 }
    end

    local now = os.time()
    local candidates, mids = {}, {}
    for _, r in ipairs(store.lbReactions()) do
        local cid = ctx.numberToCid[digits(r.phone_number)]
        if cid and r.reaction and r.reaction ~= '' then
            local mid = ('m%s'):format(r.message_id)
            candidates[#candidates + 1] = { mid, cid, tostring(r.reaction):sub(1, 32), now }
            mids[#mids + 1] = mid
        else
            skipped = skipped + 1
        end
    end

    -- Keep only reactions whose message came across; one attached to a message that was never
    -- migrated has nothing to render against.
    local orphan = 0
    local present = #mids > 0 and store.existingMids(mids) or {}
    for _, row in ipairs(candidates) do
        if present[row[1]] then
            rows[#rows + 1] = row
            imported = imported + 1
        else
            orphan = orphan + 1
        end
    end

    if not ctx.dryRun then store.insertReactions(rows) end
    return { imported = imported, skipped = skipped, orphan = orphan }
end

return M
