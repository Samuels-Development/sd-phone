---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Authoritative gallery handlers (server.photos.actions): albums, favourites, deletes.
local actions = require 'server.photos.actions'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, stubMeta, warnOnce = shim.registerExport, shim.stubMeta, shim.warnOnce

---Whether an action envelope reports success.
---@param result any envelope from server.photos.actions
---@return boolean
local function ok(result)
    return type(result) == 'table' and result.success == true
end

---GetPhonePhotos(source): the player's gallery, newest first.
registerExport('GetPhonePhotos', function(source)
    local src = shim.source(source)
    return (src and sd:getPhotos(src)) or {}
end)

---AddPhotoToMetadata(source, photo): saves an already-hosted image or video URL into the gallery.
registerExport('AddPhotoToMetadata', function(source, photo)
    local src = shim.source(source)
    if not src then return false end

    local url = type(photo) == 'table' and (photo.url or photo.image or photo.link) or photo
    if type(url) ~= 'string' or url == '' then return false end

    local result = sd:addPhoto(src, url)
    return type(result) == 'table' and result.success == true
end)

---UpdatePhotoInMetadata(source, photoId, updates): the only per-photo field sd-phone stores that a
---caller may change is the favourite flag; anything else in `updates` is ignored.
registerExport('UpdatePhotoInMetadata', function(source, photoId, updates)
    local src = shim.source(source)
    if not src or type(updates) ~= 'table' then return false end

    local favorite = updates.favorite
    if favorite == nil then favorite = updates.isFavourite end
    if favorite == nil then
        warnOnce('UpdatePhotoInMetadata', ('UpdatePhotoInMetadata only carries the favourite flag (called by %s); sd-phone stores a photo\'s URL and timestamp and nothing else editable'):format(GetInvokingResource() or 'unknown'))
        return false
    end

    return ok(actions.setFavorite(src, tostring(photoId or ''), favorite == true or favorite == 1))
end)

---DeletePhotoFromMetadata(source, photoId): removes one of the caller's own photos.
registerExport('DeletePhotoFromMetadata', function(source, photoId)
    local src = shim.source(source)
    if not src then return false end
    return ok(actions.delete(src, tostring(photoId or '')))
end)

---GetPhoneAlbumsFromMetadata(source): the player's albums with their cover and photo counts.
registerExport('GetPhoneAlbumsFromMetadata', function(source)
    local src = shim.source(source)
    if not src then return {} end

    local result = actions.listAlbums(src)
    return ok(result) and (result.data and result.data.albums or result.data) or {}
end)

---AddAlbumToPhoneMetadata(source, album): creates an album. RoadPhone's irregular export name.
registerExport('AddAlbumToPhoneMetadata', function(source, album)
    local src = shim.source(source)
    if not src then return false end

    local name = type(album) == 'table' and (album.name or album.title) or album
    if type(name) ~= 'string' or name == '' then return false end
    return ok(actions.createAlbum(src, name))
end)

---DeleteAlbumFromMetadata(source, albumId): removes an album, leaving its photos in the gallery.
registerExport('DeleteAlbumFromMetadata', function(source, albumId)
    local src = shim.source(source)
    if not src then return false end
    return ok(actions.deleteAlbum(src, tostring(albumId or '')))
end)

---AddPhotoToAlbumMetadata(source, albumId, photoId): files one photo into one of the caller's own
---albums.
registerExport('AddPhotoToAlbumMetadata', function(source, albumId, photoId)
    local src = shim.source(source)
    if not src then return false end
    return ok(actions.addPhotosToAlbum(src, tostring(albumId or ''), { tostring(photoId or '') }))
end)

---AddMultiplePhotosToAlbumMetadata(source, albumId, photoIds): the same write for a list of photos.
registerExport('AddMultiplePhotosToAlbumMetadata', function(source, albumId, photoIds)
    local src = shim.source(source)
    if not src or type(photoIds) ~= 'table' then return false end

    local ids = {}
    for _, id in ipairs(photoIds) do ids[#ids + 1] = tostring(id) end
    return ok(actions.addPhotosToAlbum(src, tostring(albumId or ''), ids))
end)

---RemovePhotoFromAlbumMetadata(source, albumId, photoId): takes one photo back out of an album.
registerExport('RemovePhotoFromAlbumMetadata', function(source, albumId, photoId)
    local src = shim.source(source)
    if not src then return false end
    return ok(actions.removePhotoFromAlbum(src, tostring(albumId or ''), tostring(photoId or '')))
end)

stubMeta('UpdatePhonePhotos', false,
    'photos are rows owned by a character, so replacing the whole gallery would delete every photo taken between the read and the write')
stubMeta('UpdateAlbumInMetadata', false,
    'an album carries only a name in sd-phone and there is no rename path, so an album is deleted and recreated instead')
