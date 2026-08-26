---@type table Blocked-numbers porter (server.migrate.port.y.blocked). Copies each character's
---YSeries block list into sd-phone.
local M = {}

---@type table Migration SQL (server.migrate.store): the blocked-number writer.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'

---@type integer Rows read per page.
local PAGE <const> = 5000

---@param ctx table migration context (imeiToCid, digits, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not ystore.table('blocked_numbers') then return { migrated = 0, skipped = 0 } end

    local migrated, skipped, offset = 0, 0, 0

    while true do
        local page = ystore.page('blocked_numbers', '`phone_imei`, `blocked_number`', offset, PAGE,
            '`phone_imei`, `blocked_number`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, b in ipairs(page) do
            local cid = ctx.imeiToCid[b.phone_imei]
            local number = ctx.digits(b.blocked_number)
            if not cid or number == '' then
                skipped = skipped + 1
            else
                rows[#rows + 1] = { cid, number:sub(1, 32) }
                migrated = migrated + 1
            end
        end

        if not ctx.dryRun and #rows > 0 then store.insertBlocked(rows) end
    end

    return { migrated = migrated, skipped = skipped }
end

return M
