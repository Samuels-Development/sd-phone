---@type table AirShare core (server.share.core): request handshake + server-side proximity checks.
local share = require 'server.share.core'

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
    local ok, message = share.request(src, payload.target, payload.kind, payload)
    return { success = ok == true, message = message }
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
