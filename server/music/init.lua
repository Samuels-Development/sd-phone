---@type table AirShare core (server.share.core): request handshake + server-side proximity checks.
local share = require 'server.share.core'
---@type table Shared server helpers (server.util): field-length caps for the share payload.
local util  = require 'server.util'
---@type table sd-phone config root (configs.config); Music holds the link allowlist (configs/music.lua).
local config = require 'configs.config'

---@type integer Tracks carried by one shared playlist. A hand-built library playlist is a few
---dozen songs, so this only stops a scripted array.
local MAX_SHARE_TRACKS = 200

---@type table The Music section of the config, the same rules client/main.lua sends the UI.
local rules = type(config.Music) == 'table' and config.Music or {}

---@type string Pattern for an 11-character YouTube video id.
local VIDEO_ID = ('[%w_%-]'):rep(11)

---@type string[] Where a YouTube link carries its video id, matching youtubeId in
---web/src/apps/music/data.ts. The `&v=` form comes first because that regex prefers it.
local YOUTUBE_PATTERNS = {
    'youtube%.com/watch%?.*&v=(' .. VIDEO_ID .. ')',
    'youtube%.com/watch%?v=(' .. VIDEO_ID .. ')',
    'youtube%.com/embed/(' .. VIDEO_ID .. ')',
    'youtube%.com/shorts/(' .. VIDEO_ID .. ')',
    'youtube%.com/live/(' .. VIDEO_ID .. ')',
    'youtu%.be/(' .. VIDEO_ID .. ')',
}

---@type table<string, true> File extensions a direct audio link may end in when AllowAnyAudioLink is on.
local AUDIO_EXTENSIONS = {
    mp3 = true, ogg = true, oga = true, opus = true, wav = true, m4a = true, aac = true, flac = true, weba = true,
}

---Trims surrounding whitespace.
---@param value string
---@return string
local function trim(value)
    return (value:gsub('^%s+', ''):gsub('%s+$', ''))
end

---The YouTube video id a link points at, taken from the leftmost match like the UI's regex.
---@param url string
---@return string|nil id
local function youtubeId(url)
    local bestAt, bestId
    for i = 1, #YOUTUBE_PATTERNS do
        local at, _, id = url:find(YOUTUBE_PATTERNS[i])
        if at and (not bestAt or at < bestAt) then bestAt, bestId = at, id end
    end
    return bestId
end

---@type table<string, true> Curated track URLs (AllowedTracks), which are allowed whatever else is set.
local allowedTracks = {}
for _, entry in ipairs(type(rules.AllowedTracks) == 'table' and rules.AllowedTracks or {}) do
    local url = type(entry) == 'string' and entry or (type(entry) == 'table' and entry.url)
    if type(url) == 'string' and trim(url) ~= '' then allowedTracks[trim(url)] = true end
end

---@type table<string, true> YouTube video ids allowed while AllowYouTube is off.
local allowedVideos = {}
for _, entry in ipairs(type(rules.AllowedVideos) == 'table' and rules.AllowedVideos or {}) do
    if type(entry) == 'string' and entry ~= '' then
        local id = youtubeId(entry) or trim(entry)
        if id:match('^' .. VIDEO_ID .. '$') then allowedVideos[id] = true end
    end
end

---@type string[] Trusted hosts, lower-cased; a leading dot also covers subdomains.
local allowedHosts = {}
for _, host in ipairs(type(rules.AllowedHosts) == 'table' and rules.AllowedHosts or {}) do
    if type(host) == 'string' and host ~= '' then allowedHosts[#allowedHosts + 1] = host:lower() end
end

---True when `host` is one of AllowedHosts or, for a leading-dot entry, a subdomain of it.
---@param host string lower-cased host name
---@return boolean
local function hostAllowed(host)
    for i = 1, #allowedHosts do
        local entry = allowedHosts[i]
        if entry:sub(1, 1) == '.' then
            if host == entry:sub(2) or host:sub(-#entry) == entry then return true end
        elseif host == entry then
            return true
        end
    end
    return false
end

---Splits an http(s) link into its lower-cased host and its path.
---@param url string
---@return string|nil host
---@return string|nil path
local function parseWebUrl(url)
    local scheme, rest = url:match('^(%a[%w+.-]*)://(.*)$')
    if not scheme then return nil end

    scheme = scheme:lower()
    if scheme ~= 'http' and scheme ~= 'https' then return nil end

    local authority = rest:match('^[^/?#]*')
    local path = (rest:sub(#authority + 1):match('^[^?#]*'))
    local host = authority:gsub('^.*@', ''):gsub(':%d*$', ''):lower()
    if host == '' then return nil end

    return host, path
end

---Whether the Music app accepts a link under configs/music.lua. Mirrors sourceRejection in
---web/src/apps/music/data.ts, so a shared playlist can only carry links the recipient's phone
---would play anyway, never a tracker that logs the listener's IP.
---@param url string trimmed track URL
---@return boolean
local function sourceAllowed(url)
    if allowedTracks[url] then return true end

    local video = youtubeId(url)
    if video then return rules.AllowYouTube == true or allowedVideos[video] == true end

    local host, path = parseWebUrl(url)
    if not host then return false end
    if #allowedHosts > 0 then return hostAllowed(host) end
    if rules.AllowAnyAudioLink ~= true then return false end

    local extension = path:match('%.(%w+)$')
    return extension ~= nil and AUDIO_EXTENSIONS[extension:lower()] == true
end

---Rebuilds a client track as a fresh, field-capped table. Nothing nested is carried across, so a
---held share request can never retain an attacker-sized object graph, and a link the Music
---allowlist refuses drops the track.
---@param raw any client-supplied track
---@return table|nil track { id?, title, artist?, album?, url, addedAt? }
local function safeTrack(raw)
    if type(raw) ~= 'table' then return nil end
    local title = util.limitedString(raw.title, 200)
    local url   = util.limitedString(raw.url, 512)
    if not title or not url then return nil end
    if not sourceAllowed(url) then return nil end
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
