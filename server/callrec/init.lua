---@type table Boot helpers (server.boot): schema registration.
local boot       = require 'server.boot'
---@type table Call recording persistence (server.callrec.store).
local store      = require 'server.callrec.store'
---@type table Call recording actions (server.callrec.actions).
local actions    = require 'server.callrec.actions'
---@type table Media uploader (server.photos.uploader): base64 to hosted URL.
local uploader   = require 'server.photos.uploader'
---@type table Per-player upload budget (server.photos.mediaLimit): cooldown + volume cap.
local mediaLimit = require 'server.photos.mediaLimit'
---@type table Player bridge (bridge.server.player): citizenid lookups.
local player     = require 'bridge.server.player'
---@type table Call recording config (configs.callrec).
local cfg        = require 'configs.callrec'
---@type table Shared server helpers (server.util): the ok/fail envelopes.
local util       = require 'server.util'

---Bootstraps the recordings schema once at boot.
CreateThread(function()
    local okSchema, err = pcall(store.ensureSchema)
    if not okSchema then
        boot.schemaFailed('callrec', err)
        return
    end
    boot.schemaReady()
end)

---@type integer Largest base64 payload accepted, before the per-player budget is consulted.
local MAX_AUDIO_BYTES = 24 * 1024 * 1024

---@type table<number, boolean> Sources with an upload in flight, so one player cannot pile them up.
local uploading = {}

lib.callback.register('sd-phone:server:callrec:list', function(src)
    if not cfg.Enabled then return { success = true, data = { recordings = {} } } end
    return actions.list(src)
end)

lib.callback.register('sd-phone:server:callrec:delete', function(src, payload)
    return actions.delete(src, type(payload) == 'table' and payload.id or nil)
end)

---Whether recording is switched on at all, so the phone can hide the button and the tab rather
---than offering something the server will refuse. Answers in the standard envelope: the client
---reads it through apiData, which unwraps `data` and treats anything without `success` as a
---failure - a bare table here reads as "disabled" however the config is set.
lib.callback.register('sd-phone:server:callrec:enabled', function()
    return util.ok({ enabled = cfg.Enabled == true })
end)

---Receives a finished recording as a base64 audio data URL, hosts it, and stores the row. The
---whole file arrives in one event: a call recording has no live viewer, so unlike the bodycam
---relay there is nothing to gain from streaming it in chunks and nothing to reassemble.
RegisterNetEvent('sd-phone:server:callrec:upload', function(payload)
    local src = source
    if not cfg.Enabled then return end

    payload = type(payload) == 'table' and payload or {}
    local audio = payload.audio

    if type(audio) ~= 'string' or not lib.string.startsWith(audio, 'data:audio/') then
        TriggerClientEvent('sd-phone:client:callrec:failed', src, 'Bad audio payload')
        return
    end
    if #audio > MAX_AUDIO_BYTES then
        TriggerClientEvent('sd-phone:client:callrec:failed', src, 'Recording is too long')
        return
    end
    if uploading[src] then
        TriggerClientEvent('sd-phone:client:callrec:failed', src, 'Upload already in progress')
        return
    end

    local okLimit, why = mediaLimit.check(player.getIdentifier(src), #audio)
    if not okLimit then
        TriggerClientEvent('sd-phone:client:callrec:failed', src,
            why == 'cooldown' and 'Slow down a moment' or 'Upload limit reached, try again later')
        return
    end

    local ext = audio:find('^data:audio/mpeg') and 'mp3'
        or audio:find('^data:audio/ogg') and 'ogg'
        or audio:find('^data:audio/wav') and 'wav'
        or 'webm'
    local filename = ('sdphone-call-%d-%d.%s'):format(src, os.time(), ext)

    uploading[src] = true
    uploader.uploadMedia(audio, filename, function(url, err)
        uploading[src] = nil
        if not url then
            print(('^1[sd-phone:callrec]^0 upload failed: %s'):format(tostring(err)))
            TriggerClientEvent('sd-phone:client:callrec:failed', src, err or 'Upload failed')
            return
        end
        local rec = actions.saveUploaded(src, url, payload)
        if rec then
            TriggerClientEvent('sd-phone:client:callrec:added', src, rec)
        else
            TriggerClientEvent('sd-phone:client:callrec:failed', src, 'Could not save the recording')
        end
    end)
end)

AddEventHandler('playerDropped', function() uploading[source] = nil end)

---Drops recordings past the keep window, on its own slow thread. A recording nobody has come
---back for in a month is storage, not evidence.
CreateThread(function()
    if not cfg.Enabled or (tonumber(cfg.KeepDays) or 0) <= 0 then return end
    Wait(180000)
    while true do
        local removed = select(2, pcall(store.prune, tonumber(cfg.KeepDays) or 30))
        if type(removed) == 'number' and removed > 0 then
            print(('^2[sd-phone:callrec]^0 pruned %d recording(s) past the keep window'):format(removed))
        end
        Wait(6 * 3600 * 1000)
    end
end)
