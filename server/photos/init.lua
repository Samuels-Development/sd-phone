---@type table Photos persistence layer (server.photos.store): photo/album row CRUD.
local store    = require 'server.photos.store'
---@type table Authoritative photo/album handlers (server.photos.actions).
local actions  = require 'server.photos.actions'
---@type table Fivemanage uploader (server.photos.uploader): server-side base64 media upload.
local uploader = require 'server.photos.uploader'
---@type table Shared server helpers (server.util): finite-number guard for the export boundary.
local util     = require 'server.util'

---Bootstraps the schema in a thread, pcall-guarded.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:photos]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:photos]^0 schema ready')
end)

-- Authoritative gallery-read callback: thin delegate into server.photos.actions.
lib.callback.register('sd-phone:server:photos:list', function(src)
    return actions.list(src)
end)

-- Hard payload ceilings for the capture upload.
---@type integer Max accepted photo data-URL size in bytes (~4 MB).
local MAX_PHOTO_BYTES <const> = 4  * 1024 * 1024
---@type integer Max accepted video data-URL size in bytes (~32 MB).
local MAX_VIDEO_BYTES <const> = 32 * 1024 * 1024

---Receives the Camera app's captured media as a base64 data-URL over a latent event: validates
---the data-URL shape and byte cap, uploads to Fivemanage, saves the row, and pushes photos:added.
---@param image string base64 data-URL (data:image/... or data:video/...)
---@param kind string 'video' for clips; anything else is treated as a photo
RegisterNetEvent('sd-phone:server:photos:upload', function(image, kind)
    local src     = source
    local isVideo = kind == 'video'

    local prefix  = isVideo and 'data:video/' or 'data:image/'
    if type(image) ~= 'string' or image:sub(1, #prefix) ~= prefix then
        print(('^1[sd-phone:photos]^0 [UPLOAD] src=%s rejected — not a %s data-URL'):format(tostring(src), isVideo and 'video' or 'image'))
        return
    end
    if #image > (isVideo and MAX_VIDEO_BYTES or MAX_PHOTO_BYTES) then
        print(('^1[sd-phone:photos]^0 [UPLOAD] src=%s rejected — payload too large (%d bytes)'):format(tostring(src), #image))
        return
    end

    print(('^2[sd-phone:photos]^0 [UPLOAD] src=%s kind=%s bytes=%d'):format(tostring(src), isVideo and 'video' or 'photo', #image))

    local ext = 'jpg'
    if isVideo then
        ext = image:find('^data:video/mp4') and 'mp4' or 'webm'
    end
    local filename = ('sdphone-%d-%d.%s'):format(src, os.time(), ext)
    uploader.uploadMedia(image, filename, function(url, err)
        if not url then
            print(('^1[sd-phone:photos]^0 [UPLOAD] failed: %s'):format(tostring(err)))
            return
        end

        local saveRes = actions.saveFromUrl(src, url)
        if saveRes and saveRes.success and saveRes.data and saveRes.data.photo then
            TriggerClientEvent('sd-phone:client:photos:added', src, saveRes.data.photo)
            print(('^2[sd-phone:photos]^0 [UPLOAD] saved + pushed id=%s'):format(saveRes.data.photo.id))
        end
    end)
end)

---Saves an already-hosted media URL for the caller and pushes photos:added with the new row.
lib.callback.register('sd-phone:server:photos:saveUrl', function(src, payload)
    local res = actions.saveFromUrl(src, payload and payload.url)
    if res and res.success and res.data and res.data.photo then
        TriggerClientEvent('sd-phone:client:photos:added', src, res.data.photo)
    end
    return res
end)

-- Authoritative photo/album callbacks: thin delegates into server.photos.actions.
lib.callback.register('sd-phone:server:photos:setFavorite', function(src, payload)
    return actions.setFavorite(src, payload and payload.photoId or '', payload and payload.value)
end)

lib.callback.register('sd-phone:server:photos:delete', function(src, payload)
    return actions.delete(src, payload and payload.photoId or '')
end)

lib.callback.register('sd-phone:server:albums:list', function(src)
    return actions.listAlbums(src)
end)

lib.callback.register('sd-phone:server:albums:create', function(src, payload)
    return actions.createAlbum(src, payload and payload.name or '')
end)

lib.callback.register('sd-phone:server:albums:delete', function(src, payload)
    return actions.deleteAlbum(src, payload and payload.albumId or '')
end)

lib.callback.register('sd-phone:server:albums:addPhotos', function(src, payload)
    return actions.addPhotosToAlbum(src, payload and payload.albumId or '', payload and payload.photoIds or {})
end)

lib.callback.register('sd-phone:server:albums:removePhoto', function(src, payload)
    return actions.removePhotoFromAlbum(src, payload and payload.albumId or '', payload and payload.photoId or '')
end)

lib.callback.register('sd-phone:server:albums:photos', function(src, payload)
    return actions.listAlbumPhotos(src, payload and payload.albumId or '')
end)

---Public export: exports['sd-phone']:addPhoto(source, url). Saves an already-hosted http(s) URL
---into a player's gallery and pushes photos:added; a non-integer source returns { success = false }.
---@param source number acting player's server id (the gallery owner resolves from it)
---@param url string http(s) URL of the hosted media
---@return { success: boolean, photo?: table }
exports('addPhoto', function(source, url)
    if type(source) ~= 'number' or not util.finite(source) or source % 1 ~= 0 then
        return { success = false }
    end
    local res = actions.saveFromUrl(source, url)
    if res and res.success and res.data and res.data.photo then
        TriggerClientEvent('sd-phone:client:photos:added', source, res.data.photo)
        return { success = true, photo = res.data.photo }
    end
    return { success = false }
end)

---Public export: exports['sd-phone']:uploadMedia(dataUrl, filename, cb). Uploads a base64
---data-URL to Fivemanage and calls cb(url|nil, err|nil) exactly once; per-kind byte caps apply.
---@param dataUrl string media as a base64 data-URL (data:image/... or data:video/...)
---@param filename string|nil suggested filename stored alongside the upload
---@param cb fun(url: string|nil, err: string|nil)
---@return boolean accepted false when the callback or payload shape is unusable
exports('uploadMedia', function(dataUrl, filename, cb)
    if type(cb) ~= 'function' then return false end
    if type(dataUrl) ~= 'string' or dataUrl:sub(1, 5) ~= 'data:' then
        cb(nil, 'Expected a base64 data: URL')
        return false
    end
    local cap = dataUrl:sub(1, 11) == 'data:video/' and MAX_VIDEO_BYTES or MAX_PHOTO_BYTES
    if #dataUrl > cap then
        cb(nil, ('Payload too large (%d bytes, cap %d)'):format(#dataUrl, cap))
        return false
    end
    uploader.uploadMedia(dataUrl, type(filename) == 'string' and filename or nil, cb)
    return true
end)
