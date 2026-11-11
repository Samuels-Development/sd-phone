---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot       = require 'server.boot'
---@type table Voicemail persistence layer (server.voicemail.store): per-message row CRUD.
local store      = require 'server.voicemail.store'
---@type table Authoritative voicemail handlers (server.voicemail.actions): validation + delivery.
local actions    = require 'server.voicemail.actions'
---@type table Media uploader (server.photos.uploader): base64 to a hosted CDN URL, shared with
---Photos and Voice Memos; the API key never leaves the server.
local uploader   = require 'server.photos.uploader'
---@type table Shared media-upload budget (server.photos.mediaLimit): cooldown + rolling byte cap.
local mediaLimit = require 'server.photos.mediaLimit'
---@type table Presigned upload slots (server.photos.presign): mint + claim for the direct path.
local presign    = require 'server.photos.presign'
---@type table HTTP upload ingest (server.media.httpUpload): single-use slots on the server's HTTP port.
local httpUpload = require 'server.media.httpUpload'
---@type table Media trust boundary: remembers uploader-returned voicemail URLs for delivery.
local mediaGuard = require 'server.media.guard'
---@type table Player bridge (bridge.server.player): citizenid for the shared upload budget.
local player     = require 'bridge.server.player'
---@type table Shared server helpers (server.util): the ok/fail envelopes.
local util       = require 'server.util'

---@type integer Largest base64 payload accepted, before the per-character budget is consulted.
---A minute of Opus is well under a megabyte; this only bounds a client that sends something else.
local MAX_AUDIO_BYTES <const> = 8 * 1024 * 1024

---@type table<number, boolean> Srcs with an upload in flight, so one player cannot pile them up.
local uploading = {}

---Drops a departing player's in-flight upload marker.
AddEventHandler('playerDropped', function() uploading[source] = nil end)

---Bootstraps the voicemails schema once at boot.
CreateThread(function()
    local okSchema, err = pcall(store.ensureSchema)
    if not okSchema then
        boot.schemaFailed('voicemail', err)
        return
    end
    boot.schemaReady()
end)

-- NUI callbacks: thin delegates into server.voicemail.actions; payloads are type-guarded here.
lib.callback.register('sd-phone:server:voicemail:list',   function(src) return actions.list(src) end)
lib.callback.register('sd-phone:server:voicemail:seen',   function(src) return actions.seen(src) end)
lib.callback.register('sd-phone:server:voicemail:leave',  function(src, payload) return actions.leave(src, payload) end)
lib.callback.register('sd-phone:server:voicemail:delete', function(src, payload)
    return actions.delete(src, type(payload) == 'table' and payload.id or nil)
end)

---Whether this server can host a recording at all, so the call screen only offers to take a
---voicemail when there is somewhere to put it. Answered in the standard envelope, which the NUI
---reads through apiData: anything without `success` reads as "off" however the server is set up.
lib.callback.register('sd-phone:server:voicemail:enabled', function()
    return util.ok({ enabled = uploader.configured() })
end)

-- Direct upload. The base64 route below carries the whole recording in one ordinary callback, and
-- a callback is an ordinary event underneath - not a latent one - so an 8 MB voicemail blocks the
-- net thread for every player while it arrives. These two put it on HTTPS instead. Nothing is
-- settled at slot time because no row is written here: the answer is a trusted URL the caller
-- attaches to the voicemail it is leaving.

---React -> server: mint a slot for a voicemail the phone will upload itself.
lib.callback.register('sd-phone:server:voicemail:uploadSlot', function(src)
    if not presign.available() then return util.fail('voicemail.uploadFailed', 'Upload failed') end
    if uploading[src] then return util.fail('voicemail.uploadInProgress', 'Upload already in progress') end

    local p = promise.new()
    presign.mint(src, { maxBytes = math.floor(MAX_AUDIO_BYTES * 0.75), kinds = { audio = true }, purpose = 'voicemail' }, function(url) p:resolve(url) end)
    local url = Citizen.Await(p)
    if not url then return util.fail('voicemail.uploadFailed', 'Upload failed') end
    return util.ok({ url = url })
end)

---React -> server: claim the uploaded voicemail and hand back the trusted URL. Audio only.
lib.callback.register('sd-phone:server:voicemail:uploadDone', function(src, payload)
    payload = type(payload) == 'table' and payload or {}

    local p = promise.new()
    presign.claim(src, payload.url,
        { maxBytes = math.floor(MAX_AUDIO_BYTES * 0.75), kinds = { audio = true }, purpose = 'voicemail' },
        function(url, code, bytes) p:resolve({ url = url, code = code, bytes = bytes }) end)
    local res = Citizen.Await(p)
    if not res.url then
        print(('^1[sd-phone:voicemail]^0 direct claim refused (%s)'):format(tostring(res.code)))
        return util.fail('voicemail.uploadFailed', 'Upload failed')
    end

    local trustedUrl = mediaGuard.rememberVoice(player.getIdentifier(src), res.url)
    if not trustedUrl then return util.fail('voicemail.uploadFailed', 'Upload failed') end
    return util.ok({ url = trustedUrl })
end)

---The refusal envelope for an upload the budget or pacing turned away.
---@param why string|nil 'cooldown'|'busy'|'identity'|'budget'|'server'
---@return table envelope
local function refusal(why)
    if why == 'cooldown' then return util.fail('voicemail.slowDownMoment', 'Slow down a moment') end
    if why == 'busy' then return util.fail('voicemail.uploadInProgress', 'Upload already in progress') end
    return util.fail('voicemail.uploadLimitReached', 'Upload limit reached, try again later')
end

---Hosts a recorded voicemail and answers with its trusted URL, which the caller then passes to
---`voicemail:leave`.
---@param src number player server id
---@param audio any base64 audio data-URL as the client sent it
---@param prepaid boolean|nil true when an HTTP slot already holds the budget for it
---@return table result { success, message?, data = { url } }
local function host(src, audio, prepaid)
    if type(audio) ~= 'string' or not lib.string.startsWith(audio, 'data:audio/') then
        return util.fail('voicemail.badAudio', 'Bad audio payload')
    end
    if #audio > MAX_AUDIO_BYTES then
        return util.fail('voicemail.recordingTooLong', 'Recording is too long')
    end
    if uploading[src] then
        return util.fail('voicemail.uploadInProgress', 'Upload already in progress')
    end

    if not prepaid then
        local okLimit, why = mediaLimit.charge(src, #audio)
        if not okLimit then return refusal(why) end
    end

    local ext = audio:find('^data:audio/mpeg') and 'mp3'
        or audio:find('^data:audio/ogg') and 'ogg'
        or audio:find('^data:audio/wav') and 'wav'
        or 'webm'
    local filename = ('sdphone-voicemail-%d-%d.%s'):format(src, os.time(), ext)

    uploading[src] = true
    local done = promise.new()
    uploader.uploadMedia(audio, filename, function(url, err) done:resolve({ url = url, err = err }) end)
    local result = Citizen.Await(done)
    uploading[src] = nil

    if not result.url then
        print(('^1[sd-phone:voicemail]^0 upload failed: %s'):format(tostring(result.err)))
        return util.fail('voicemail.uploadFailed', 'Upload failed')
    end
    local trustedUrl = mediaGuard.rememberVoice(player.getIdentifier(src), result.url)
    if not trustedUrl then return util.fail('voicemail.uploadFailed', 'Upload failed') end
    return util.ok({ url = trustedUrl })
end

---The base64 route for hosting a voicemail, for a phone that could not reach the HTTP port.
---@param src number player server id
---@param payload table { audio: string } base64 audio data-URL from the NUI recorder
---@return table result { success, message?, data = { url } }
lib.callback.register('sd-phone:server:voicemail:upload', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    return host(src, payload.audio)
end)

---React -> server: open an HTTP upload slot for a voicemail. The last part is answered with the
---hosted URL, exactly as the base64 route answers.
---@param src number player server id
---@return table result { success, message?, data = { path, partBytes } }
lib.callback.register('sd-phone:server:voicemail:httpSlot', function(src)
    if uploading[src] then return refusal('busy') end
    local slot, why = httpUpload.mint(src, MAX_AUDIO_BYTES, function(owner, body)
        return host(owner, body, true)
    end)
    if not slot then return refusal(why) end
    return util.ok(slot)
end)
