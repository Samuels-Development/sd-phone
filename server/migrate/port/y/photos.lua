---@type table Gallery porter (server.migrate.port.y.photos). Copies each character's YSeries
---gallery and albums into sd-phone's Photos, skipping soft-deleted rows and inline data URIs.
local M = {}

---@type table Migration SQL (server.migrate.store): photo, album and album-item writers.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'
---@type table Shared server helpers (server.util): trim + truthiness.
local util = require 'server.util'
---@type fun(ts: any): string DATETIME formatter (server.migrate.ystore): the phone_photos and
---phone_birdy_* created_at columns are real TIMESTAMPs, and an epoch integer lands as a zero date.
local stamp = ystore.stamp

---@type integer Rows read per page.
local PAGE <const> = 2000

---Whether a stored image is a usable reference rather than the picture itself. YSeries writes some
---captures as full base64 data URIs, which run to megabytes each; sd-phone's url column holds a
---link, so importing those verbatim would both truncate the row and bloat the table.
---@param url any
---@return boolean
local function isLink(url)
    if type(url) ~= 'string' then return false end
    local v = util.trim(url)
    if v == '' or #v > 2048 then return false end
    return v:lower():sub(1, 5) ~= 'data:'
end

---@param ctx table migration context (imeiToCid, dryRun)
---@return { photos: number, skipped: number, albums: number, links: number, inlineSkipped: number }
function M.run(ctx)
    if not ystore.table('gallery') then
        return { photos = 0, skipped = 0, albums = 0, links = 0, inlineSkipped = 0 }
    end

    local albumIds, albums = {}, 0
    if ystore.table('gallery_albums') then
        local offset = 0
        while true do
            local page = ystore.page('gallery_albums', '`id`, `phone_imei`, `name`', offset, PAGE)
            if #page == 0 then break end
            offset = offset + #page

            local rows = {}
            for _, a in ipairs(page) do
                local cid = ctx.imeiToCid[a.phone_imei]
                if cid then
                    local id = ('ya%s'):format(a.id)
                    albumIds[a.id] = id
                    rows[#rows + 1] = { id, cid, (util.trim(a.name)):sub(1, 64) }
                    albums = albums + 1
                end
            end
            if not ctx.dryRun and #rows > 0 then store.insertAlbums(rows) end
        end
    end

    local migrated, skipped, inlineSkipped, links, offset = 0, 0, 0, 0, 0

    while true do
        local page = ystore.page('gallery',
            '`id`, `phone_imei`, `image`, `album_id`, `is_favorite`, UNIX_TIMESTAMP(`date`) AS ts',
            offset, PAGE, '`id`', '`deleted` = 0')
        if #page == 0 then break end
        offset = offset + #page

        local rows, items = {}, {}
        for _, p in ipairs(page) do
            local cid = ctx.imeiToCid[p.phone_imei]
            if not cid then
                skipped = skipped + 1
            elseif not isLink(p.image) then
                inlineSkipped = inlineSkipped + 1
            else
                local id = ('yp%s'):format(p.id)
                rows[#rows + 1] = {
                    id, cid, util.trim(p.image),
                    util.truthy(p.is_favorite) and 1 or 0, stamp(p.ts),
                }
                local album = p.album_id and albumIds[p.album_id]
                if album then items[#items + 1] = { album, id }; links = links + 1 end
                migrated = migrated + 1
            end
        end

        if not ctx.dryRun then
            if #rows > 0 then store.insertPhotos(rows) end
            if #items > 0 then store.insertAlbumItems(items) end
        end
    end

    return { photos = migrated, skipped = skipped, albums = albums, links = links, inlineSkipped = inlineSkipped }
end

return M
