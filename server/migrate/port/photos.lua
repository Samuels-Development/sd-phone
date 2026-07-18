---@type table Photos porter (server.migrate.port.photos). Copies gallery photos and albums (and
---their photo membership) into sd-phone. Photo and album ids are prefixed from the lb-phone ids;
---an album<->photo link is only kept when both ends were migrated.
local M = {}

local store = require 'server.migrate.store'
local util  = require 'server.util'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { photos: number, albums: number, links: number, skipped: number }
function M.run(ctx)
    local photoRows, albumRows, itemRows = {}, {}, {}
    local photoIds, albumIds = {}, {}
    local photos, albums, links, skipped = 0, 0, 0, 0

    if store.tableExists(store.lbTable('photos')) then
        for _, p in ipairs(store.lbPhotos()) do
            local cid = ctx.numberToCid[digits(p.phone_number)]
            if cid and p.link and p.link ~= '' then
                local id = ('p%s'):format(p.id)
                photoIds[tostring(p.id)] = id
                local ts = tonumber(p.created_ts)
                photoRows[#photoRows + 1] = {
                    id, cid, tostring(p.link):sub(1, 512),
                    util.truthy(p.is_favourite) and 1 or 0,
                    (ts and ts > 0) and os.date('!%Y-%m-%d %H:%M:%S', ts) or os.date('!%Y-%m-%d %H:%M:%S'),
                }
                photos = photos + 1
            else
                skipped = skipped + 1
            end
        end
    end

    if store.tableExists(store.lbTable('photo_albums')) then
        for _, a in ipairs(store.lbAlbums()) do
            local cid = ctx.numberToCid[digits(a.phone_number)]
            if cid then
                local id = ('a%s'):format(a.id)
                albumIds[tostring(a.id)] = id
                local name = util.trim(a.title)
                if name == '' then name = 'Album' end
                albumRows[#albumRows + 1] = { id, cid, name:sub(1, 64) }
                albums = albums + 1
            end
        end
    end

    if store.tableExists(store.lbTable('photo_album_photos')) then
        for _, link in ipairs(store.lbAlbumPhotos()) do
            local aid = albumIds[tostring(link.album_id)]
            local pid = photoIds[tostring(link.photo_id)]
            if aid and pid then
                itemRows[#itemRows + 1] = { aid, pid }
                links = links + 1
            end
        end
    end

    if not ctx.dryRun then
        store.insertPhotos(photoRows)
        store.insertAlbums(albumRows)
        store.insertAlbumItems(itemRows)
    end
    return { photos = photos, albums = albums, links = links, skipped = skipped }
end

return M
