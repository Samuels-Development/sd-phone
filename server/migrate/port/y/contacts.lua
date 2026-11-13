---@type table Contacts porter (server.migrate.port.y.contacts). Copies each character's YSeries
---contacts into sd-phone, synthesising the avatar colour and deduping against contacts they have.
local M = {}

---@type table Migration SQL (server.migrate.store): existing keys + the contact writer.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'
---@type table Shared server helpers (server.util): id/colour/trim.
local util = require 'server.util'

---@type integer Rows read per page. YSeries contacts run to tens of thousands on a live server.
local PAGE <const> = 2000

---@type fun(v: any, maxLen: integer): string|nil Trimmed text capped to maxLen bytes on a whole
---UTF-8 character, nil when empty (server.util limitedString).
local clamp = util.limitedString

---@param ctx table migration context (imeiToCid, digits, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not ystore.table('contacts') then return { migrated = 0, skipped = 0 } end

    local seen = store.existingContactKeys()
    local migrated, skipped, offset = 0, 0, 0

    while true do
        local page = ystore.page('contacts', '`id`, `phone_imei`, `name`, `number`, `favorite`, `avatar`', offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, c in ipairs(page) do
            local cid = ctx.imeiToCid[c.phone_imei]
            local phone = ctx.digits(c.number)
            if not cid or phone == '' then
                skipped = skipped + 1
            else
                local key = ('%s|%s'):format(cid, phone)
                if seen[key] then
                    skipped = skipped + 1
                else
                    seen[key] = true
                    local name = clamp(c.name, 64) or phone
                    rows[#rows + 1] = {
                        util.newId(16), cid, name, phone:sub(1, 32),
                        nil, nil,
                        util.colorFor(name), clamp(c.avatar, 512),
                        util.truthy(c.favorite) and 1 or 0,
                    }
                    migrated = migrated + 1
                end
            end
        end

        if not ctx.dryRun and #rows > 0 then store.insertContacts(rows) end
    end

    return { migrated = migrated, skipped = skipped }
end

return M
