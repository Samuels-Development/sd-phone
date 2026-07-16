---@type table Blocked-numbers porter (server.migrate.port.blocked). Copies each player's lb-phone
---block list into sd-phone; idempotent via INSERT IGNORE.
local M = {}

local store = require 'server.migrate.store'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not store.tableExists(store.lbTable('phone_blocked_numbers')) then return { migrated = 0, skipped = 0 } end

    local rows, migrated, skipped = {}, 0, 0
    for _, b in ipairs(store.lbBlocked()) do
        local cid = ctx.numberToCid[digits(b.phone_number)]
        local blocked = digits(b.blocked_number)
        if not cid or blocked == '' or #blocked > 32 then
            skipped = skipped + 1
        else
            rows[#rows + 1] = { cid, blocked }
            migrated = migrated + 1
        end
    end

    if not ctx.dryRun then store.insertBlocked(rows) end
    return { migrated = migrated, skipped = skipped }
end

return M
