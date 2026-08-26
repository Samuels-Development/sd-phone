---@type table Voice-memo porter (server.migrate.port.y.voicememos). Copies each character's YSeries
---voice memos into sd-phone's Voice Memos.
local M = {}

---@type table Migration SQL (server.migrate.store): the voice-memo writer.
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
    if not ystore.table('voice_memos') then return { migrated = 0, skipped = 0 } end

    local migrated, skipped, offset = 0, 0, 0

    while true do
        local page = ystore.page('voice_memos',
            '`id`, `phone_imei`, `title`, `url`, `duration`, UNIX_TIMESTAMP(`created_at`) AS ts',
            offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, v in ipairs(page) do
            local cid = ctx.imeiToCid[v.phone_imei]
            local url = util.trim(v.url)
            if not cid or url == '' or url:lower():sub(1, 5) == 'data:' then
                skipped = skipped + 1
            else
                rows[#rows + 1] = {
                    cid, (util.trim(v.title)):sub(1, 120), url:sub(1, 2048),
                    math.max(0, math.floor(tonumber(v.duration) or 0)),
                    tonumber(v.ts) or os.time(), ('yv%s'):format(v.id),
                }
                migrated = migrated + 1
            end
        end

        if not ctx.dryRun and #rows > 0 then store.insertVoiceMemos(rows) end
    end

    return { migrated = migrated, skipped = skipped }
end

return M
