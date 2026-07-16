---@type table Notes porter (server.migrate.port.notes). Copies each player's lb-phone notes into
---sd-phone: the title becomes a markdown heading on the body, note ids are prefixed from the
---lb-phone id, and sketches/images are stored as empty JSON arrays.
local M = {}

local store = require 'server.migrate.store'
local util  = require 'server.util'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not store.tableExists(store.lbTable('notes')) then return { migrated = 0, skipped = 0 } end

    local rows, migrated, skipped = {}, 0, 0
    for _, n in ipairs(store.lbNotes()) do
        local cid = ctx.numberToCid[digits(n.phone_number)]
        if not cid then
            skipped = skipped + 1
        else
            local title = util.trim(n.title)
            local content = n.content or ''
            local body = title ~= '' and ('# ' .. title .. '\n' .. content) or content
            local iso = n.created_iso or os.date('!%Y-%m-%dT%H:%M:%S.000Z')
            rows[#rows + 1] = { cid, ('n%s'):format(n.id), body, '[]', '[]', iso, iso }
            migrated = migrated + 1
        end
    end

    if not ctx.dryRun then store.insertNotes(rows) end
    return { migrated = migrated, skipped = skipped }
end

return M
