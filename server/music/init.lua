---@type table AirShare core (server.share.core): request handshake + server-side proximity checks.
local share = require 'server.share.core'
---@type table Shared server helpers (server.util): field-length caps for the share payload.
local util  = require 'server.util'

---@type integer Tracks carried by one shared playlist. A hand-built library playlist is a few
---dozen songs, so this only stops a scripted array.
local MAX_SHARE_TRACKS = 200

---Rebuilds a client track as a fresh, field-capped table. Nothing nested is carried across, so a
---held share request can never retain an attacker-sized object graph.
---@param raw any client-supplied track
---@return table|nil track { id?, title, artist?, album?, url, addedAt? }
local function safeTrack(raw)
    if type(raw) ~= 'table' then return nil end
    local title = util.limitedString(raw.title, 200)
    local url   = util.limitedString(raw.url, 512)
    if not title or not url then return nil end
    local addedAt = tonumber(raw.addedAt)
    return {
        id      = util.limitedString(raw.id, 40),
        title   = title,
        artist  = util.limitedString(raw.artist, 200),
        album   = util.limitedString(raw.album, 200),
        url     = url,
        addedAt = util.finite(addedAt) and addedAt or nil,
    }
end

---Delivers an accepted single-song share: pushes the track to the recipient's client, which
---merges it into its localStorage library even while the Music app is closed.
---@param targetSrc number recipient server id
---@param payload table share payload ({ track: table })
---@return boolean delivered
local function deliverTrack(targetSrc, payload)
    if type(payload) ~= 'table' or type(payload.track) ~= 'table' then return false end
    TriggerClientEvent('sd-phone:client:music:receive', targetSrc, { kind = 'track', track = payload.track })
    return true
end

---Delivers an accepted playlist share: pushes the playlist name + all its tracks in one event.
---Runs only on the recipient's accept.
---@param targetSrc number recipient server id
---@param payload table share payload ({ name: string, tracks: table[] })
---@return boolean delivered
local function deliverPlaylist(targetSrc, payload)
    if type(payload) ~= 'table' or type(payload.tracks) ~= 'table' or #payload.tracks == 0 then return false end
    TriggerClientEvent('sd-phone:client:music:receive', targetSrc, {
        kind = 'playlist', name = payload.name, tracks = payload.tracks,
    })
    return true
end

-- The two music share kinds AirShare can deliver; each handler runs on recipient accept.
share.registerHandler('music-track',    deliverTrack)
share.registerHandler('music-playlist', deliverPlaylist)

---Opens an AirShare request for a song or playlist; share.request validates the kind and the
---nearby target, and the request expires after 60s unanswered.
---@param src number sender server id
---@param payload table { target: number, kind: string, track?/name?/tracks?: any }
lib.callback.register('sd-phone:server:music:share', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end

    -- Whitelisted here, not just in share.request: without it this endpoint reaches the notes,
    -- documents, voice and signature handlers with a payload none of them sanitised.
    local built
    if payload.kind == 'music-track' then
        local track = safeTrack(payload.track)
        if not track then return { success = false, messageKey = 'music.nothingShare', message = 'Nothing to share' } end
        built = { track = track }
    elseif payload.kind == 'music-playlist' then
        local raw, tracks = type(payload.tracks) == 'table' and payload.tracks or {}, {}
        for i = 1, math.min(#raw, MAX_SHARE_TRACKS) do
            tracks[#tracks + 1] = safeTrack(raw[i])
        end
        if #tracks == 0 then return { success = false, messageKey = 'music.nothingShare', message = 'Nothing to share' } end
        built = { name = util.limitedString(payload.name, 100) or 'Shared Playlist', tracks = tracks }
    else
        return { success = false, messageKey = 'music.unknownShareType', message = 'Unknown share type' }
    end

    local sent, refusal = share.request(src, payload.target, payload.kind, built)
    if sent then return { success = true } end
    return refusal or { success = false }
end)

---Gives a track straight to a player's music library (exports['sd-phone']:giveTrack), skipping
---the consent handshake. Returns false for an offline source or a malformed track.
---@param source number recipient server id, must be an online player
---@param track table { title: string, url: string, artist?: string, ... }
---@return boolean delivered
exports('giveTrack', function(source, track)
    if type(source) ~= 'number' or not GetPlayerName(source) then return false end
    if type(track) ~= 'table' then return false end
    if type(track.title) ~= 'string' or track.title == '' then return false end
    if type(track.url) ~= 'string' or track.url == '' then return false end
    return deliverTrack(source, { track = track })
end)
