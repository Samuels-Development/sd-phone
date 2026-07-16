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
        print(('^1[sd-phone:voice]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:voice]^0 schema ready')
end)

-- NUI callbacks: thin delegates into server.voicememos.actions; payloads are type-guarded here.
lib.callback.register('sd-phone:server:voice:list',   function(src)          return actions.list(src) end)
lib.callback.register('sd-phone:server:voice:rename', function(src, payload) payload = type(payload) == 'table' and payload or {}; return actions.rename(src, payload.id, payload.name) end)
lib.callback.register('sd-phone:server:voice:delete', function(src, payload) payload = type(payload) == 'table' and payload or {}; return actions.delete(src, payload.id) end)
lib.callback.register('sd-phone:server:voice:share',  function(src, payload) payload = type(payload) == 'table' and payload or {}; return actions.requestShare(src, payload.target, payload.id) end)

---Audio upload: the client sends a base64 audio data-URL, pushed to Fivemanage and persisted via
---actions.saveUploaded. Gated: data:audio/ prefix, VM.MaxAudioBytes cap, one upload per src.
---@param payload table client payload { audio: string, name?: string, duration?: number }
RegisterNetEvent('sd-phone:server:voice:upload', function(payload)
    local src = source
    payload = type(payload) == 'table' and payload or {}
    local audio = payload.audio

    if type(audio) ~= 'string' or audio:sub(1, 11) ~= 'data:audio/' then
        TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Bad audio payload')
        return
    end
    if #audio > VM.MaxAudioBytes then
        TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Recording is too long')
        return
    end
    if uploading[src] then
        TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Upload already in progress')
        return
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
            TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, err or 'Upload failed')
            return
        end
        local memo = actions.saveUploaded(src, url, payload.name, payload.duration)
        if memo then
            TriggerClientEvent('sd-phone:client:voice:added', src, memo)
        else
            TriggerClientEvent('sd-phone:client:voice:uploadFailed', src, 'Could not save memo')
        end
    end)
end)
