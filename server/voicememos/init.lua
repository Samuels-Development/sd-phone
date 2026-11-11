---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Voice-memo persistence layer (server.voicememos.store): per-memo row CRUD.
local store    = require 'server.voicememos.store'
---@type table Authoritative voice-memo handlers (server.voicememos.actions): ownership +
---sanitisation + the share/deliver pair.
local actions  = require 'server.voicememos.actions'
---@type table Fivemanage uploader (server.photos.uploader): server-side media push, shared
---with Photos; the API key never leaves the server.
local uploader = require 'server.photos.uploader'
---@type table Player bridge (bridge.server.player): citizenid for the shared upload budget.
local player   = require 'bridge.server.player'
---@type table Shared media-upload budget (server.photos.mediaLimit): cooldown + rolling byte cap.
local mediaLimit = require 'server.photos.mediaLimit'
---@type table Presigned upload slots (server.photos.presign): mint + claim for the direct path.
local presign  = require 'server.photos.presign'
---@type table HTTP upload ingest (server.media.httpUpload): single-use slots on the server's HTTP port.
local httpUpload = require 'server.media.httpUpload'
---@type table Shared server helpers (server.util): the player-drop cleanup hook.
local util     = require 'server.util'
---@type table AirShare core (server.share.core): per-kind delivery handler registry.
local share    = require 'server.share.core'

-- Delivers an accepted voice-memo AirShare into the recipient's Voice Memos.
share.registerHandler('voice', actions.deliverShare)

---@type table Voice Memos config (config.VoiceMemos): list/name/size caps.
local VM = config.VoiceMemos

---@type table<number, boolean> Srcs with a Fivemanage upload currently in flight; one upload at
---a time per player.
local uploading = {}

---Drops a departing player's in-flight upload marker.
AddEventHandler('playerDropped', function() uploading[source] = nil end)

---Bootstraps the memos schema once at boot.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('voice', err)
        return
    end
    boot.schemaReady()
end)

-- NUI callbacks: thin delegates into server.voicememos.actions; payloads are type-guarded here.
lib.callback.register('sd-phone:server:voice:list',   function(src)          return actions.list(src) end)
lib.callback.register('sd-phone:server:voice:rename', function(src, payload) payload = type(payload) == 'table' and payload or {}; return actions.rename(src, payload.id, payload.name) end)
lib.callback.register('sd-phone:server:voice:delete', function(src, payload) payload = type(payload) == 'table' and payload or {}; return actions.delete(src, payload.id) end)
lib.callback.register('sd-phone:server:voice:share',  function(src, payload) payload = type(payload) == 'table' and payload or {}; return actions.requestShare(src, payload.target, payload.id) end)

-- Direct upload. The path below sends the whole recording to the server in ONE ordinary event -
-- not a latent one - so a long memo blocks the net thread for everybody while it arrives. That is
-- the same stall the camera's sliced upload was written to fix. Uploading to the CDN over HTTPS
-- keeps it off the game network entirely, and the event path stays as the fallback.

---@type integer Largest object a claim may point at, in raw bytes. MaxAudioBytes caps the base64,
---and base64 is four bytes for every three, so the file itself is three-quarters of it.
local MAX_DIRECT_BYTES = math.floor(VM.MaxAudioBytes * 0.75)

---@type table<number, { name: string|nil, duration: number|nil }> What each pending slot is for.
local pendingDirect = {}

---React -> server: mint a slot for a memo the phone will upload itself. The name and duration are
---settled here and kept, so the claim that follows cannot restate them.
lib.callback.register('sd-phone:server:voice:uploadSlot', function(src, payload)
    if not presign.available() then return { success = false, code = 'unavailable' } end
    if uploading[src] then return { success = false, code = 'busy' } end

    payload = type(payload) == 'table' and payload or {}

    local p = promise.new()
    presign.mint(src, { maxBytes = MAX_DIRECT_BYTES, kinds = { audio = true }, purpose = 'voice-memo' },
        function(url, code) p:resolve({ url = url, code = code }) end)
    local res = Citizen.Await(p)
    if not res.url then return { success = false, code = res.code or 'provider' } end

    pendingDirect[src] = { name = payload.name, duration = payload.duration }
    return { success = true, data = { url = res.url } }
end)

---React -> server: the phone finished its upload and reports where it landed. Audio only: a memo
---claim that accepted a clip would put a video in the voice library.
lib.callback.register('sd-phone:server:voice:uploadDone', function(src, payload)
    local meta = pendingDirect[src]
    pendingDirect[src] = nil
    if not meta then return { success = false, code = 'no-slot' } end

    payload = type(payload) == 'table' and payload or {}

    local p = promise.new()
    presign.claim(src, payload.url, { maxBytes = MAX_DIRECT_BYTES, kinds = { audio = true }, purpose = 'voice-memo' },
        function(url, code, bytes) p:resolve({ url = url, code = code, bytes = bytes }) end)
    local res = Citizen.Await(p)
    if not res.url then
        print(('^1[sd-phone:voice]^0 direct claim refused (%s) for %s')
            :format(tostring(res.code), tostring(payload.url)))
        return { success = false, code = res.code }
    end

    local memo = actions.saveUploaded(src, res.url, meta.name, meta.duration)
    if not memo then return { success = false, code = 'save-failed' } end

    TriggerClientEvent('sd-phone:client:voice:added', src, memo)
    return { success = true }
end)

util.onCleanup(function(src) pendingDirect[src] = nil end)

---The sentence a player sees when the upload budget or pacing refuses them.
---@param why string|nil 'cooldown'|'busy'|'identity'|'budget'|'server'
---@return string message
local function refusal(why)
    if why == 'cooldown' then return 'Slow down a moment', 'voicememos.uploadSlowDown' end
    if why == 'busy' then return 'Upload already in progress', 'voicememos.uploadBusy' end
    return 'Upload limit reached, try again later', 'voicememos.uploadLimitReached'
end

---Takes a recorded memo as a base64 audio data-URL, pushes it to the media provider and saves it.
---Gated: data:audio/ prefix, VM.MaxAudioBytes cap, one upload per src, the shared upload budget.
---@param src integer
---@param audio any The data-URL as the client sent it.
---@param name string|nil
---@param duration number|nil
---@param prepaid boolean|nil true when an HTTP slot already holds the budget for it
local function ingest(src, audio, name, duration, prepaid)
    if type(audio) ~= 'string' or not lib.string.startsWith(audio, 'data:audio/') then
        TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Bad audio payload', 'voicememos.badAudioPayload')
        return
    end
    if #audio > VM.MaxAudioBytes then
        TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Recording is too long', 'voicememos.recordingTooLong')
        return
    end
    if uploading[src] then
        TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Upload already in progress', 'voicememos.uploadBusy')
        return
    end
    if not prepaid then
        local okLimit, why = mediaLimit.charge(src, #audio)
        if not okLimit then
            TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, refusal(why))
            return
        end
    end

    local ext = audio:find('^data:audio/mpeg') and 'mp3'
        or audio:find('^data:audio/ogg') and 'ogg'
        or audio:find('^data:audio/wav') and 'wav'
        or 'webm'
    local filename = ('sdphone-voice-%d-%d.%s'):format(src, os.time(), ext)

    uploading[src] = true
    uploader.uploadMedia(audio, filename, function(url, err)
        uploading[src] = nil
        if not url then
            print(('^1[sd-phone:voice]^0 upload failed: %s'):format(tostring(err)))
            TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Upload failed', 'voicememos.uploadFailed')
            return
        end
        local memo = actions.saveUploaded(src, url, name, duration)
        if memo then
            TriggerClientEvent('sd-phone:client:voice:added', src, memo)
        else
            TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Could not save memo', 'voicememos.couldNotSaveMemo')
        end
    end)
end

---Audio upload over a game network event: the fallback for a phone that could not reach the
---server's HTTP port.
---@param payload table client payload { audio: string, name?: string, duration?: number }
RegisterNetEvent('sd-phone:server:voice:upload', function(payload)
    local src = source
    payload = type(payload) == 'table' and payload or {}
    ingest(src, payload.audio, payload.name, payload.duration)
end)

---React -> server: open an HTTP upload slot for a memo. The name and duration are settled here,
---so the body that follows is nothing but the recording.
lib.callback.register('sd-phone:server:voice:httpSlot', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local name, duration = payload.name, payload.duration

    local slot, why = nil, 'busy'
    if not uploading[src] then
        slot, why = httpUpload.mint(src, VM.MaxAudioBytes, function(owner, body)
            ingest(owner, body, name, duration, true)
            return { success = true }
        end)
    end
    if not slot then
        TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, refusal(why))
        return { success = false, code = why }
    end
    return { success = true, data = slot }
end)
