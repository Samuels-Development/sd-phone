---@type table Classifieds porters (server.migrate.port.y.classifieds). Carries YSeries' YBuy ads
---and PromoHub posts into sd-phone's Marketplace and Pages, which share one row shape.
local M = {}

---@type table Migration data layer (server.migrate.store): the two classifieds writers.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'
---@type table Shared helpers (server.util): trim.
local util = require 'server.util'
---@type table Attachment extraction (server.migrate.media): every foreign phone wraps its media
---differently, and a decoder that guesses wrong drops it silently.
local media = require 'server.migrate.media'

---@type integer Rows read per page.
local PAGE <const> = 2000

---Trim and clamp to `n` chars, or nil when empty.
---@param s any
---@param n integer
---@return string|nil
local function clamp(s, n)
    local v = util.trim(s)
    if v == '' then return nil end
    return v:sub(1, n)
end

---Copies one YSeries classifieds table into one sd-phone table. Both source tables key on
---phone_imei and carry their own contact number, which is preferred over the device's when present.
---@param ctx table migration context (imeiToCid, imeiToNumber, digits, dryRun)
---@param sourceTable string YSeries table name, unprefixed
---@param bodyColumn string the column holding the description
---@param numberColumn string|nil a contact-number column, when the table has one
---@param write fun(rows: any[][]) target writer
---@return { migrated: number, skipped: number }
local function copy(ctx, sourceTable, bodyColumn, numberColumn, write)
    if not ystore.table(sourceTable) then return { migrated = 0, skipped = 0 } end

    local columns = ('`id`, `phone_imei`, `title`, `%s` AS body, `price`, `attachments`, UNIX_TIMESTAMP(`timestamp`) AS ts')
        :format(bodyColumn)
    if numberColumn then columns = columns .. (', `%s` AS contact'):format(numberColumn) end

    local migrated, skipped, offset = 0, 0, 0

    while true do
        local page = ystore.page(sourceTable, columns, offset, PAGE, '`id`', '`archived` = 0')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, p in ipairs(page) do
            local cid = ctx.imeiToCid[p.phone_imei]
            local title = clamp(p.title, 80)
            local number = ctx.digits(p.contact)
            if number == '' then number = ctx.imeiToNumber[p.phone_imei] or '' end

            if not cid or not title then
                skipped = skipped + 1
            else
                local cover, images = media.cover(p.attachments)
                rows[#rows + 1] = {
                    cid, title, util.trim(p.body), tonumber(p.price),
                    cover, images, number:sub(1, 20), nil,
                    math.floor(tonumber(p.ts) or os.time()),
                }
                migrated = migrated + 1
            end
        end

        if not ctx.dryRun and #rows > 0 then write(rows) end
    end

    return { migrated = migrated, skipped = skipped }
end

---@param ctx table migration context
---@return { migrated: number, skipped: number }
function M.marketplace(ctx)
    return copy(ctx, 'ybuy_ads', 'description', 'phone_number', store.insertMarketplace)
end

---@param ctx table migration context
---@return { migrated: number, skipped: number }
function M.pages(ctx)
    return copy(ctx, 'promo_hub_posts', 'description', 'contact_number', store.insertPages)
end

return M
