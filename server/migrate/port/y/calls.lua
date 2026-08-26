---@type table Call-history porter (server.migrate.port.y.calls). Copies each character's YSeries
---recents into sd-phone's call log, mapping YSeries' call_type onto a direction.
local M = {}

---@type table Migration SQL (server.migrate.store): the call-log writer.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'

---@type integer Rows read per page. Recents is the largest table on a live YSeries server.
local PAGE <const> = 5000

---@type table<string, string> YSeries call_type -> sd-phone direction.
local DIRECTION = {
    outgoing = 'outgoing',
    incoming = 'incoming',
    missed   = 'missed',
    outcome  = 'outgoing',
    income   = 'incoming',
}

---@param ctx table migration context (imeiToCid, digits, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not ystore.table('recents') then return { migrated = 0, skipped = 0 } end

    local migrated, skipped, offset = 0, 0, 0

    while true do
        local page = ystore.page('recents',
            '`id`, `phone_imei`, `target_number`, UNIX_TIMESTAMP(`date`) AS ts, `call_type`, `call_duration`',
            offset, PAGE, '`id`', '`removed` = 0')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, c in ipairs(page) do
            local cid = ctx.imeiToCid[c.phone_imei]
            local number = ctx.digits(c.target_number)
            if not cid or number == '' then
                skipped = skipped + 1
            else
                local direction = DIRECTION[tostring(c.call_type or ''):lower()] or 'outgoing'
                rows[#rows + 1] = {
                    ('yr%s'):format(c.id), cid, number:sub(1, 32), nil, direction,
                    math.max(0, math.floor(tonumber(c.call_duration) or 0)),
                    1, tonumber(c.ts) or os.time(),
                }
                migrated = migrated + 1
            end
        end

        if not ctx.dryRun and #rows > 0 then store.insertCalls(rows) end
    end

    return { migrated = migrated, skipped = skipped }
end

return M
