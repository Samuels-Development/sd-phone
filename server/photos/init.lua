---@type table sd-phone config root (configs/config.lua): Photos.LogUploads.
local config = require 'configs.config'
---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Photos persistence layer (server.photos.store): photo/album row CRUD.
local store    = require 'server.photos.store'
---@type table Authoritative photo/album handlers (server.photos.actions).
local actions  = require 'server.photos.actions'
---@type table Fivemanage uploader (server.photos.uploader): server-side base64 media upload.
local uploader = require 'server.photos.uploader'
---@type table Presigned upload slots (server.photos.presign): mint + claim for the direct path.
local presign  = require 'server.photos.presign'
---@type table HTTP upload ingest (server.media.httpUpload): single-use slots on the server's HTTP port.
local httpUpload = require 'server.media.httpUpload'
---@type table Media URL ledger (server.media.ledger): schema + one-time backfill at boot.
local ledger   = require 'server.media.ledger'
---@type table Player bridge (bridge.server.player): citizenid for the shared upload budget.
local player   = require 'bridge.server.player'
---@type table Shared media-upload budget (server.photos.mediaLimit): cooldown + rolling byte cap.
local mediaLimit = require 'server.photos.mediaLimit'
---@type table Shared server helpers (server.util): finite-number guard for the export boundary,
---string bounds and the player-drop cleanup hook for the clip assembler.
local util     = require 'server.util'
---@type table AirShare core (server.share.core): per-kind delivery handler registry.
local share    = require 'server.share.core'
---@type table Callable check (shared.callable): uploadMedia's callback is a function reference.
local callable = require 'shared.callable'

---@type string GlobalState key carrying the game view mode every client renders with.
local GAME_VIEW_MODE_KEY <const> = 'sd-phone:gameViewMode'

---Resolves Photos.EnhancedGameView into the game view mode clients are told to use.
---@param setting any Photos.EnhancedGameView as written in configs/photos.lua.
---@return 'off'|'probe'|'force' mode
local function resolveGameViewMode(setting)
    if setting == 'probe' or setting == 'force' then return setting end
    if setting == false or setting == 'off' then return 'off' end
    return GetConvar('version', ''):find('early-access', 1, true) and 'probe' or 'off'
end

GlobalState[GAME_VIEW_MODE_KEY] = resolveGameViewMode((config.Photos or require 'configs.photos').EnhancedGameView)

-- The direct-upload switch was renamed when it became opt-in, so a config still carrying the old
-- key is quietly on the server-relayed path. Say so once, rather than leave an owner wondering why
-- captures stopped going straight to the CDN.
do
    local PHOTOS_CFG = config.Photos or require 'configs.photos'
    if PHOTOS_CFG.DirectUpload == true and PHOTOS_CFG.AllowDirectUpload ~= true then
        boot.warn('^3[sd-phone]^0 Photos.DirectUpload is no longer read: direct uploads are off unless AllowDirectUpload = true (see configs/photos.lua before turning it on).')
    end
end

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

---Bootstraps the schema in a thread, pcall-guarded. The URL ledger goes up with it: presign
---refuses to mint a slot until the ledger can say what this server has already hosted, so the
---direct-upload path is simply off until this has run.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('photos', err)
        return
    end
    local okLedger, ledgerErr = pcall(ledger.ensureSchema)
    if not okLedger then
        boot.schemaFailed('media ledger', ledgerErr)
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

---Same console line without the client event. The direct-upload path answers its caller through a
---callback and the page falls back to the sliced path on any failure, so pushing uploadFailed
---there too would show the player an error for something that is about to succeed.
---@param src number
---@param code string
---@param detail string
local function logFailure(src, code, detail)
    print(('^1[sd-phone:photos]^0 [UPLOAD] src=%s failed (%s): %s'):format(tostring(src), code, detail))
end

---@type boolean Whether to report each upload's size and throughput (configs/photos.lua LogUploads).
local LOG_UPLOADS = (config.Photos or require 'configs.photos').LogUploads == true

---One console line per capture, for diagnosing uploads that cost players packet loss. Reports what
---actually crossed the wire and how fast, so a report comes back as numbers rather than an
---impression of slowness.
---@param src number
---@param kind string 'photo' or 'clip'
---@param bytes integer data-URL size that arrived
---@param slices integer slice count, 1 for a photo
---@param startedAt integer|nil GetGameTimer() when the clip was announced, nil for a photo
local function logUpload(src, kind, bytes, slices, startedAt)
    if not LOG_UPLOADS then return end
    -- A photo arrives in one event with nothing to time it against, so it reports size only
    -- rather than a throughput figure invented from a single instant.
    if not startedAt then
        print(('^5[sd-phone:photos]^0 [UPLOAD] src=%s %s %.2f MB'):format(tostring(src), kind, bytes / 1048576))
        return
    end
    local ms   = math.max(1, GetGameTimer() - startedAt)
    local kbps = (bytes / 1024) / (ms / 1000)
    print(('^5[sd-phone:photos]^0 [UPLOAD] src=%s %s %.2f MB in %d slice(s), %d ms, %.0f KB/s')
        :format(tostring(src), kind, bytes / 1048576, slices, ms, kbps))
end

---Writes an already-hosted URL into the caller's gallery and pushes the new row. Both upload
---paths end here: the sliced one once the server has finished the upload itself, the direct one
---once a claim has proved the URL is this server's own. Everything past the transfer - the row,
---the retention prune inside saveFromUrl, the photos:added push - is the same either way, which
---is the whole reason it lives on its own rather than inside the uploader's callback.
---@param src number player the capture came from
---@param url string hosted media URL
---@param report fun(src: number, code: string, detail: string) how a failure reaches the caller
---@return boolean saved
local function saveHosted(src, url, report)
    -- The upload landed but the row did not, which used to report nothing on either end: the
    -- player waited on a photo that was hosted yet unreachable, and the console stayed quiet.
    local saveRes = actions.saveFromUrl(src, url, true)
    if not (saveRes and saveRes.success and saveRes.data and saveRes.data.photo) then
        report(src, 'save-failed', ('uploaded to %s but the row would not save: %s')
            :format(url, tostring(saveRes and saveRes.message or 'no reason given')))
        return false
    end

    TriggerClientEvent('sd-phone:client:photos:added', src, saveRes.data.photo)
    return true
end

---Takes one complete capture: validates the data-URL shape and byte cap, uploads it, saves the
---row, and pushes photos:added - or, on any failure, photos:uploadFailed with the reason. Reached
---directly by a photo and by the last slice of a clip, so both arrive here already whole.
---One upload per source may be in flight; the flag clears once the upload settles.
---@param src number player the capture came from
---@param image string base64 data-URL (data:image/... or data:video/...)
---@param isVideo boolean whether the payload is a clip rather than a still
---@param prepaid boolean|nil true when an HTTP slot already holds the budget for it
local function startUpload(src, image, isVideo, prepaid)
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
    if not prepaid then
        local okLimit, why = mediaLimit.charge(src, #image)
        if not okLimit then
            uploadFailed(src, 'rate-limit', ('rate limit (%s)'):format(tostring(why)))
            return
        end
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

        saveHosted(src, url, uploadFailed)
    end)
end

---Receives a captured PHOTO as a base64 data-URL over a single latent event. Small enough that
---one event is fine; clips take the sliced path below.
---@param image string base64 data-URL (data:image/...)
RegisterNetEvent('sd-phone:server:photos:upload', function(image)
    local src = source
    if type(image) == 'string' then logUpload(src, 'photo', #image, 1, nil) end
    startUpload(src, image, false)
end)

---React -> server: open an HTTP upload slot for a photo or a clip, sized for the larger of the two
---caps only when a clip is announced.
---@param payload table { kind: 'photo'|'clip' }
lib.callback.register('sd-phone:server:photos:httpSlot', function(src, payload)
    local isVideo = type(payload) == 'table' and payload.kind == 'clip'
    local slot, why = nil, 'busy'
    if not uploading[src] then
        slot, why = httpUpload.mint(src, isVideo and MAX_VIDEO_BYTES or MAX_PHOTO_BYTES, function(owner, body)
            logUpload(owner, isVideo and 'clip' or 'photo', #body, 1, nil)
            startUpload(owner, body, isVideo, true)
            return { success = true }
        end)
    end
    if not slot then
        uploadFailed(src, why == 'busy' and 'busy' or 'rate-limit', ('upload slot refused (%s)'):format(tostring(why)))
        return { success = false, code = why }
    end
    return { success = true, data = slot }
end)

-- Sliced clip upload. A whole clip is megabytes, and one latent event that size blocks the net
-- thread for as long as it takes to reassemble - every player's packet loss climbing while one
-- of them saves a video. The Camera app cuts the clip into slices and sends them one at a time;
-- this is where they are put back together. Same shape as the MDT bodycam uploader.
---@type integer Max slices one clip may be cut into, bounding the assembly table.
local MAX_SLICES <const> = 256
---@type integer Milliseconds an assembly may sit without a new slice before it is abandoned.
local ASSEMBLY_TTL_MS <const> = 120000
---@type integer How often the abandoned-assembly sweep runs.
local SWEEP_MS <const> = 30000

---@type table<number, { total: integer, received: integer, bytes: integer, slices: table<integer, string>, mime: string, at: integer, started: integer }>
---Clip assemblies in flight, keyed by source.
local assembling = {}

---Joins a finished assembly back into one data-URL and hands it to the ordinary upload path.
---@param src number
local function finishClip(src)
    local job = assembling[src]
    assembling[src] = nil
    if not job then return end

    local parts = {}
    for seq = 1, job.total do
        if not job.slices[seq] then
            uploadFailed(src, 'bad-data', ('clip missing slice %d of %d'):format(seq, job.total))
            return
        end
        parts[seq] = job.slices[seq]
    end

    -- Every slice but the last is the base64 of a byte run whose length divides by 3, so none of
    -- them carries padding and concatenating the strings reproduces the base64 of the whole file.
    local dataUrl = ('data:%s;base64,%s'):format(job.mime, table.concat(parts))
    logUpload(src, 'clip', #dataUrl, job.total, job.started)
    startUpload(src, dataUrl, true)
end

---React -> server: a finished clip is coming, and how many slices it is split into.
---@param payload table { mime: string, total: integer }
RegisterNetEvent('sd-phone:server:photos:uploadBegin', function(payload)
    local src = source
    payload = type(payload) == 'table' and payload or {}

    if uploading[src] then
        uploadFailed(src, 'busy', 'an upload is already in progress')
        return
    end

    local total = math.floor(tonumber(payload.total) or 0)
    if total < 1 or total > MAX_SLICES then
        uploadFailed(src, 'too-large', ('clip announced %s slices'):format(tostring(payload.total)))
        return
    end

    local mime = util.limitedString(payload.mime, 64) or 'video/webm'
    if not mime:find('^video/') then mime = 'video/webm' end

    local now = GetGameTimer()
    assembling[src] = { total = total, received = 0, bytes = 0, slices = {}, mime = mime, at = now, started = now }
end)

---React -> server: one slice of a finished clip. Latent events are not guaranteed to arrive in
---order, so each slice is filed by its own sequence number rather than appended.
---@param payload table { seq: integer, part: string }
RegisterNetEvent('sd-phone:server:photos:uploadSlice', function(payload)
    local src = source
    local job = assembling[src]
    if not job then return end

    payload = type(payload) == 'table' and payload or {}
    local seq  = math.floor(tonumber(payload.seq) or 0)
    local part = payload.part
    if seq < 1 or seq > job.total or type(part) ~= 'string' or part == '' then return end
    if job.slices[seq] ~= nil then return end

    job.bytes = job.bytes + #part
    if job.bytes > MAX_VIDEO_BYTES then
        assembling[src] = nil
        uploadFailed(src, 'too-large', ('clip over the byte cap (%d bytes)'):format(job.bytes))
        return
    end

    job.slices[seq] = part
    job.received    = job.received + 1
    job.at          = GetGameTimer()

    if job.received >= job.total then finishClip(src) end
end)

---React -> server: abandon a clip that was part-way sent.
RegisterNetEvent('sd-phone:server:photos:uploadCancel', function()
    assembling[source] = nil
end)

-- Abandons assemblies whose sender stopped part-way, so a dropped upload cannot hold its slices
-- in memory until the resource restarts.
CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        local now = GetGameTimer()
        for src, job in pairs(assembling) do
            if (now - job.at) > ASSEMBLY_TTL_MS then assembling[src] = nil end
        end
    end
end)

util.onCleanup(function(src)
    assembling[src] = nil
    uploading[src]  = nil
    presign.forget(src)
end)

-- Direct upload. The sliced path above still puts the whole clip on the ENet reliable channel,
-- which costs the uploading player packet loss for as long as it runs - roughly 4% to 12% on the
-- measurements this replaced. Pacing only trades the height of that spike against its length, so
-- the fix is to keep the media off the game network entirely: the page POSTs it to the CDN over
-- ordinary HTTPS using a slot minted here, then reports back the URL it landed on.
--
-- Nothing below deletes the sliced path. It is the fallback for a server on the Qbox provider,
-- for a Fivemanage outage, and for a client whose upload is blocked, so every rejection here ends
-- with the Camera quietly taking the old route.

---@type integer Largest object a Camera claim accepts, in raw bytes. The sliced path caps a clip
---at 32 MB of base64, which is 24 MB of file; the direct path must never be the more permissive
---of the two, or turning the fallback on would start rejecting captures that used to save.
local MAX_DIRECT_BYTES <const> = math.floor(MAX_VIDEO_BYTES * 0.75)

---React -> server: mint an upload slot. Only the URL to POST to crosses back; the bucket and the
---expiry it is later measured against stay on the server, because handing a client the thing its
---own claim is checked against would leave nothing to check.
lib.callback.register('sd-phone:server:photos:uploadSlot', function(src)
    if not presign.available() then return { success = false, code = 'unavailable' } end
    if uploading[src] or assembling[src] then return { success = false, code = 'busy' } end

    local p = promise.new()
    presign.mint(src, { maxBytes = MAX_DIRECT_BYTES },
        function(url, code) p:resolve({ url = url, code = code }) end)
    local res = Citizen.Await(p)

    if not res.url then return { success = false, code = res.code or 'provider' } end
    return { success = true, data = { url = res.url } }
end)

---React -> server: the page finished its upload and reports where it landed. The URL is entirely
---untrusted until presign.claim has proved it is an object in this server's own bucket, against a
---slot minted for this player, that nobody else already holds, and that the CDN serves as media
---of the kind its name promises.
lib.callback.register('sd-phone:server:photos:uploadDone', function(src, payload)
    payload = type(payload) == 'table' and payload or {}

    local p = promise.new()
    presign.claim(src, payload.url,
        { maxBytes = MAX_DIRECT_BYTES, kinds = { image = true, video = true } },
        function(url, code, bytes)
        p:resolve({ url = url, code = code, bytes = bytes })
    end)
    local res = Citizen.Await(p)

    if not res.url then
        logFailure(src, res.code or 'bad-data', ('direct-upload claim refused for %s')
            :format(tostring(payload.url)))
        return { success = false, code = res.code }
    end

    -- Reported like the sliced path so the two are comparable in one log, and so the check the
    -- direct path exists for - that no slices crossed the wire at all - is visible rather than
    -- inferred from an absence.
    if LOG_UPLOADS then
        print(('^5[sd-phone:photos]^0 [UPLOAD] src=%s clip %.2f MB direct, 0 slice(s) over the wire')
            :format(tostring(src), (res.bytes or 0) / 1048576))
    end

    if not saveHosted(src, res.url, logFailure) then return { success = false, code = 'save-failed' } end
    return { success = true }
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
    local okLimit = mediaLimit.charge(src, #(payload and payload.url or ''))
    if not okLimit then return { success = false, messageKey = 'photos.slowDownMoment', message = 'Slow down a moment' } end
    local res = actions.saveFromUrl(src, payload and payload.url, true)
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

---Public export: exports['sd-phone']:addPhoto(source, url). Saves an already-hosted HTTPS URL
---into a player's gallery and pushes photos:added; a non-integer source returns { success = false }.
---@param source number acting player's server id (the gallery owner resolves from it)
---@param url string HTTPS URL of the hosted media
---@return { success: boolean, photo?: table }
exports('addPhoto', function(source, url)
    if type(source) ~= 'number' or not util.finite(source) or source % 1 ~= 0 then
        return { success = false }
    end
    local res = actions.saveFromUrl(source, url, true)
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
    if not callable.is(cb) then return false end
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
