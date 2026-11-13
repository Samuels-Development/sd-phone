---@type table Classifieds porters (server.migrate.port.classifieds). Carries lb-phone's Marketplace
---and Yellow Pages posts into sd-phone's Marketplace and Pages, which share one row shape.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table Shared helpers (server.util): trim.
local util = require 'server.util'
---@type table Attachment extraction (server.migrate.media): every foreign phone wraps its media
---differently, and a decoder that guesses wrong drops it silently.
local media = require 'server.migrate.media'

---@type fun(v: any, maxLen: integer): string|nil Trimmed text capped to maxLen bytes on a whole
---UTF-8 character, nil when empty (server.util limitedString).
local clamp = util.limitedString

---Copies one lb-phone classifieds table into one sd-phone table.
---@param ctx table migration context (numberToCid, dryRun)
---@param sourceTable string lb-phone table name, unprefixed
---@param attachmentColumn string the column holding the media
---@param write fun(rows: any[][]) target writer
---@return { migrated: number, skipped: number }
local function copy(ctx, sourceTable, attachmentColumn, write)
    local tbl = store.lbSource(sourceTable)
    if not tbl then return { migrated = 0, skipped = 0 } end

    local rows = MySQL.query.await((
        'SELECT `id`, `phone_number`, `title`, `description`, `%s` AS media, `price`, UNIX_TIMESTAMP(`timestamp`) AS ts FROM `%s`'
    ):format(attachmentColumn, tbl)) or {}

    local out, migrated, skipped = {}, 0, 0

    for _, p in ipairs(rows) do
        local number = (tostring(p.phone_number or ''):gsub('%D', ''))
        local cid = ctx.numberToCid[number]
        local title = clamp(p.title, 80)
        if not cid or not title then
            skipped = skipped + 1
        else
            local cover, images = media.cover(p.media)
            out[#out + 1] = {
                cid, title, util.trim(p.description), tonumber(p.price),
                cover, images, number:sub(1, 20), nil,
                math.floor(tonumber(p.ts) or os.time()),
            }
            migrated = migrated + 1
        end
    end

    if not ctx.dryRun and #out > 0 then write(out) end
    return { migrated = migrated, skipped = skipped }
end

---@param ctx table migration context
---@return { migrated: number, skipped: number }
function M.marketplace(ctx)
    return copy(ctx, 'phone_marketplace_posts', 'attachments', store.insertMarketplace)
end

---@param ctx table migration context
---@return { migrated: number, skipped: number }
function M.pages(ctx)
    return copy(ctx, 'phone_yellow_pages_posts', 'attachment', store.insertPages)
end

return M
