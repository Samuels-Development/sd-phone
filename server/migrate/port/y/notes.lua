---@type table Notes porter (server.migrate.port.y.notes). Copies each character's YSeries notes,
---folding the separate title column into sd-phone's single markdown body.
local M = {}

---@type table Migration SQL (server.migrate.store): the notes writer.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'
---@type table Shared server helpers (server.util): trim.
local util = require 'server.util'

---@type integer Rows read per page.
local PAGE <const> = 2000

---@param ctx table migration context (imeiToCid, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not ystore.table('notes') then return { migrated = 0, skipped = 0 } end

    local migrated, skipped, offset = 0, 0, 0

    while true do
        local page = ystore.page('notes',
            "`id`, `phone_imei`, `title`, `content`, DATE_FORMAT(`timestamp`, '%Y-%m-%dT%H:%i:%s.000Z') AS iso",
            offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, n in ipairs(page) do
            local cid = ctx.imeiToCid[n.phone_imei]
            if not cid then
                skipped = skipped + 1
            else
                local title = util.trim(n.title)
                local content = n.content or ''
                local body = title ~= '' and ('# ' .. title .. '\n' .. content) or content
                local iso = n.iso or os.date('!%Y-%m-%dT%H:%M:%S.000Z')
                rows[#rows + 1] = { cid, ('yn%s'):format(n.id), body, '[]', '[]', iso, iso }
                migrated = migrated + 1
            end
        end

        if not ctx.dryRun and #rows > 0 then store.insertNotes(rows) end
    end

    return { migrated = migrated, skipped = skipped }
end

return M
