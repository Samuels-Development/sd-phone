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
    if not store.tableExists(store.lbTable('message_reactions')) then
        return { imported = 0, skipped = 0 }
    end

    local now = os.time()
    for _, r in ipairs(store.lbReactions()) do
        local cid = ctx.numberToCid[digits(r.phone_number)]
        if cid and r.reaction and r.reaction ~= '' then
            rows[#rows + 1] = {
                ('m%s'):format(r.message_id), cid, tostring(r.reaction):sub(1, 32), now,
            }
            imported = imported + 1
        else
            skipped = skipped + 1
        end
    end

    if not ctx.dryRun then store.insertReactions(rows) end
    return { imported = imported, skipped = skipped }
end

return M
