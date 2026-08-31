---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Photos persistence layer (server.photos.store): photo/album row CRUD.
local store    = require 'server.photos.store'
---@type table Authoritative photo/album handlers (server.photos.actions).
local actions  = require 'server.photos.actions'
---@type table Fivemanage uploader (server.photos.uploader): server-side base64 media upload.
local uploader = require 'server.photos.uploader'
---@type table Player bridge (bridge.server.player): citizenid for the shared upload budget.
local player   = require 'bridge.server.player'
---@type table Shared media-upload budget (server.photos.mediaLimit): cooldown + rolling byte cap.
local mediaLimit = require 'server.photos.mediaLimit'
---@type table Shared server helpers (server.util): finite-number guard for the export boundary.
local util     = require 'server.util'
---@type table AirShare core (server.share.core): per-kind delivery handler registry.
local share    = require 'server.share.core'

-- Without a media token nothing a player captures can ever be stored, and the Camera used to
-- swallow that: the shutter span, the spinner ran out, no photo, no reason. Say it once at boot
-- so the gap is the server owner's to fix, not something players rediscover one capture at a time.
if not uploader.configured() then
    boot.warn(('^3[sd-phone]^0 no %s key set: Camera, Photos and Voice Memos will accept a capture but never save it.')
        :format(uploader.provider() == 'qbox' and 'Qbox CDN' or 'Fivemanage media'))
    boot.warn(uploader.provider() == 'qbox'
        and '^3[sd-phone]^0 set QboxCdn in configs/server/apikeys.lua (token from dashboard.qbox.re -> CDN -> API).'
        or '^3[sd-phone]^0 set FivemanageMedia in configs/server/apikeys.lua (free at fivemanage.com, token type "Media").')
end

---Bootstraps the schema in a thread, pcall-guarded.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('photos', err)
        return
    end
    boot.schemaReady()
end)

-- Authoritative gallery-read callback: thin delegate into server.photos.actions.
lib.callback.register('sd-phone:server:photos:list', function(src, payload)
    return actions.list(src, payload)
end)

-- Hard payload ceilings for the capture upload.
---@type integer Max accepted photo data-URL size in bytes (~4 MB).
local MAX_PHOTO_BYTES <const> = 4  * 1024 * 1024
---@type integer Max accepted video data-URL size in bytes (~32 MB).
local MAX_VIDEO_BYTES <const> = 32 * 1024 * 1024

---@type table<number, boolean> Sources with a capture upload in flight. One upload per player at a
---time, so a client can't fan out many concurrent multi-MB uploads at the Fivemanage backend.
local uploading = {}

---Tells the capturing player their upload is not coming, and logs the detail for the console.
---The relay is a latent event with no reply channel, so without this every failure reached the
---Camera as an 8s spinner that simply stopped: a missing API key and a slow network looked alike.
---@param src number player the capture came from
---@param code string stable reason token the Camera maps to a translated line
---@param detail string console-only detail, which may name paths or provider text
local function uploadFailed(src, code, detail)
    print(('^1[sd-phone:photos]^0 [UPLOAD] src=%s failed (%s): %s'):format(tostring(src), code, detail))
    TriggerClientEvent('sd-phone:client:photos:uploadFailed', src, { code = code })
end

---Receives the Camera app's captured media as a base64 data-URL over a latent event: validates
---the data-URL shape and byte cap, uploads to Fivemanage, saves the row, and pushes photos:added
---or, on any failure, photos:uploadFailed with the reason.
---One upload per source may be in flight; the flag clears once the upload settles.
---@param image string base64 data-URL (data:image/... or data:video/...)
---@param kind string 'video' for clips; anything else is treated as a photo
RegisterNetEvent('sd-phone:server:photos:upload', function(image, kind)
    local src     = source
    local isVideo = kind == 'video'

    local prefix  = isVideo and 'data:video/' or 'data:image/'
    if type(image) ~= 'string' or image:sub(1, #prefix) ~= prefix then
        uploadFailed(src, 'bad-data', ('not a %s data-URL'):format(isVideo and 'video' or 'image'))
        return
    end
    if #image > (isVideo and MAX_VIDEO_BYTES or MAX_PHOTO_BYTES) then
        uploadFailed(src, 'too-large', ('payload too large (%d bytes)'):format(#image))
        return
    end
    if uploading[src] then
        uploadFailed(src, 'busy', 'an upload is already in progress')
        return
    end
    local okLimit, why = mediaLimit.check(player.getIdentifier(src), #image)
    if not okLimit then
        uploadFailed(src, 'rate-limit', ('rate limit (%s)'):format(tostring(why)))
        return
    end


    local ext = 'jpg'
    if isVideo then
        ext = image:find('^data:video/mp4') and 'mp4' or 'webm'
    end
    local filename = ('sdphone-%d-%d.%s'):format(src, os.time(), ext)
    uploading[src] = true
    uploader.uploadMedia(image, filename, function(url, err, code)
        uploading[src] = nil
        if not url then
            uploadFailed(src, code or 'provider', tostring(err))
            return
        end

        -- The upload landed but the row did not, which used to report nothing on either end: the
        -- player waited on a photo that was hosted yet unreachable, and the console stayed quiet.
        local saveRes = actions.saveFromUrl(src, url)
        if not (saveRes and saveRes.success and saveRes.data and saveRes.data.photo) then
            uploadFailed(src, 'save-failed', ('uploaded to %s but the row would not save: %s')
                :format(url, tostring(saveRes and saveRes.message or 'no reason given')))
            return
        end

        TriggerClientEvent('sd-phone:client:photos:added', src, saveRes.data.photo)
    end)
end)

---Clears a departing player's in-flight upload flag so a disconnect mid-upload can't leave them
---permanently unable to upload after reconnecting on the same source id.
AddEventHandler('playerDropped', function()
    uploading[source] = nil
end)

---Saves an already-hosted media URL for the caller and pushes photos:added with the new row.
---Player-supplied, so the URL must pass config.Photos.AllowImport + the block/allow lists.
lib.callback.register('sd-phone:server:photos:saveUrl', function(src, payload)
    if not actions.importEnabled() then
        return { success = false, messageKey = 'photos.urlImportDisabledServer', message = 'URL import is disabled on this server' }
    end
    if not actions.isAllowedImportUrl(payload and payload.url) then
        return { success = false, messageKey = 'photos.imagesFromSiteArenT', message = 'Images from that site aren\'t allowed' }
    end
    -- Same budget the capture upload uses: saving a hosted URL is a deliberate tap, so the 1s
    -- gap is invisible, and without it this path writes and prunes phone_photos at line rate.
    local okLimit = mediaLimit.check(player.getIdentifier(src), #(payload and payload.url or ''))
    if not okLimit then return { success = false, messageKey = 'photos.slowDownMoment', message = 'Slow down a moment' } end
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

-- Delivers an accepted photo AirShare into the recipient's gallery.
share.registerHandler('photo', actions.deliverShare)

---Offers a photo to a nearby phone; the recipient decides whether to accept it.
lib.callback.register('sd-phone:server:photos:share', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return actions.requestShare(src, payload.target, payload.id)
end)

---Public export: exports['sd-phone']:getPhotos(source, opts). Reads a player's gallery, newest
---first, for other resources: a vehicle-listing photo picker, an evidence board, a print shop.
---Read-only, and only ever the caller's own photos. Always an array, empty when nothing resolves.
---@param source number acting player's server id (the gallery owner resolves from it)
---@param opts { limit: number|nil, filter: 'favorites'|'videos'|nil }|nil
---@return { id: string, url: string, isVideo: boolean, favorite: boolean, timestamp: integer }[]
exports('getPhotos', function(source, opts)
    if type(source) ~= 'number' then return {} end
    local cid = player.getIdentifier(source)
    if not cid then return {} end
    return actions.listForCid(cid, opts)
end)

---Public export: exports['sd-phone']:getPhotosByIdentifier(citizenid, opts). The same read keyed
---by owner id rather than a live source, for offline owners and for callers holding a phone
---number: resolve it through getIdentifierByNumber first. Read-only.
---@param citizenid string owner's framework per-character id
---@param opts { limit: number|nil, filter: 'favorites'|'videos'|nil }|nil
---@return { id: string, url: string, isVideo: boolean, favorite: boolean, timestamp: integer }[]
exports('getPhotosByIdentifier', function(citizenid, opts)
    return actions.listForCid(citizenid, opts)
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
    if type(dataUrl) ~= 'string' or not lib.string.startsWith(dataUrl, 'data:') then
        cb(nil, 'Expected a base64 data: URL')
        return false
    end
    local cap = lib.string.startsWith(dataUrl, 'data:video/') and MAX_VIDEO_BYTES or MAX_PHOTO_BYTES
    if #dataUrl > cap then
        cb(nil, ('Payload too large (%d bytes, cap %d)'):format(#dataUrl, cap))
        return false
    end
    uploader.uploadMedia(dataUrl, type(filename) == 'string' and filename or nil, cb)
    return true
end)
