---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player = require 'bridge.server.player'

---@type table Voice config (configs/voice.lua): nearby-capture switches + TURN provisioning.
local CFG   = config.Voice or {}
---@type number Capture radius in metres - how close another player must be to be recordable.
local RANGE = tonumber(CFG.NearbyRange) or 12.0
---@type integer Cap on simultaneous nearby voices mixed into one recording (bandwidth/CPU guard).
local MAXN  = tonumber(CFG.MaxNearbyVoices) or 6
---@type table Public STUN server URLs, always offered to every peer connection.
local STUN  = CFG.StunServers or { 'stun:stun.l.google.com:19302' }
---@type table TURN provisioning config (CFG.Turn): Provider + TtlSeconds.
local TURN  = CFG.Turn or {}

---@return boolean true when nearby-voice capture is switched on (config.Voice.RecordNearbyVoices)
local function enabled() return CFG.RecordNearbyVoices == true end

-- ICE provisioning for the client-to-client WebRTC mesh that captures nearby players' voices.
---@type table<number, { servers: table, expires: number }> Cached ICE servers per player src.
local iceCache = {}

---The always-available STUN portion of an iceServers list, built fresh so callers can append.
---@return table servers array of { urls = string }
local function baseStun()
    local servers = {}
    for _, url in ipairs(STUN) do servers[#servers + 1] = { urls = url } end
    return servers
end

---Provisions a Cloudflare Realtime TURN credential set from the sd_cf_turn_* convars. Returns
---nil when unconfigured or on any transport/decode failure.
---@return table|nil iceServers Cloudflare's iceServers object, nil on failure
local function fetchCloudflareTurn()
    local tokenId  = GetConvar('sd_cf_turn_token_id', '')
    local apiToken = GetConvar('sd_cf_turn_api_token', '')
    if tokenId == '' or apiToken == '' then return nil end

    local ttl = tonumber(TURN.TtlSeconds) or 86400
    local p = promise.new()
    PerformHttpRequest(
        ('https://rtc.live.cloudflare.com/v1/turn/keys/%s/credentials/generate-ice-servers'):format(tokenId),
        function(status, body)
            if status ~= 201 or not body then return p:resolve(nil) end
            local ok, decoded = pcall(json.decode, body)
            p:resolve(ok and decoded and decoded.iceServers or nil)
        end,
        'POST',
        json.encode({ ttl = ttl }),
        {
            ['Authorization'] = 'Bearer ' .. apiToken,
            ['Content-Type']  = 'application/json',
            ['Accept']        = 'application/json',
        }
    )
    return Citizen.Await(p)
end

---ICE servers for one player: STUN always, TURN appended when the Cloudflare provider is
---configured. Cached per src until a minute before the provisioned credential lapses.
---@param src number player server id
---@return table servers iceServers array for RTCPeerConnection
local function iceServersFor(src)
    local cached = iceCache[src]
    if cached and cached.expires > os.time() then return cached.servers end

    local servers = baseStun()
    if TURN.Provider == 'cloudflare' then
        local turn = fetchCloudflareTurn()
        if turn then servers[#servers + 1] = turn end
    end

    iceCache[src] = { servers = servers, expires = os.time() + (tonumber(TURN.TtlSeconds) or 86400) - 60 }
    return servers
end

---Live ped coords for a player, nil when they have no ped (disconnecting / not spawned).
---@param src number player server id
---@return vector3|nil coords
local function coordsOf(src)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

---True if `a` and `b` are within `range` metres of each other, from live server-side coords;
---false when either has no ped.
---@param a number player server id
---@param b number player server id
---@param range number metres
---@return boolean within
local function withinRange(a, b, range)
    local ca, cb = coordsOf(a), coordsOf(b)
    if not ca or not cb then return false end
    return #(ca - cb) <= range
end

---Players (other than `src`) within RANGE metres, nearest first, capped to MAXN. Positions are
---read server-side at query time; the trimmed result carries only id + display name.
---@param src number recorder server id
---@return { id: number, name: string }[] targets
local function nearbyTargets(src)
    local origin = coordsOf(src)
    if not origin then return {} end

    local found = {}
    for _, pid in ipairs(GetPlayers()) do
        local tgt = tonumber(pid)
        if tgt and tgt ~= src then
            local c = coordsOf(tgt)
            if c then
                local dist = #(origin - c)
                if dist <= RANGE then
                    found[#found + 1] = { id = tgt, name = player.getName(tgt), dist = dist }
                end
            end
        end
    end

    table.sort(found, function(a, b) return a.dist < b.dist end)
    local out = {}
    for i = 1, math.min(#found, MAXN) do
        out[#out + 1] = { id = found[i].id, name = found[i].name }
    end
    return out
end

---ICE servers for this client's peer connections. Read-only; rate-bounded by the per-src cache.
lib.callback.register('sd-phone:server:voice:ice', function(src)
    return { success = true, data = { iceServers = iceServersFor(src) } }
end)

---Who the recorder can capture right now (+ its ICE servers). Proximity is computed server-side;
---empty when the feature is disabled.
lib.callback.register('sd-phone:server:voice:nearby', function(src)
    if not enabled() then return { success = true, data = { targets = {}, iceServers = iceServersFor(src) } } end
    return { success = true, data = { targets = nearbyTargets(src), iceServers = iceServersFor(src) } }
end)

---Relays one WebRTC signaling message (offer/answer/ICE candidate) to another player. Proximity
---is re-checked on every hop (1.5x RANGE) and `from` is stamped from the trusted source.
---@param payload table { to: number, sid?: any, kind?: any, data?: any }
RegisterNetEvent('sd-phone:server:voice:signal', function(payload)
    local src = source
    if type(payload) ~= 'table' then return end
    local to = tonumber(payload.to)
    if not to or not enabled() then return end
    if not withinRange(src, to, RANGE * 1.5) then return end

    TriggerClientEvent('sd-phone:client:voice:signal', to, {
        from = src,
        sid  = payload.sid,
        kind = payload.kind,
        data = payload.data,
    })
end)

---Drops a departing player's cached ICE credentials.
AddEventHandler('playerDropped', function()
    iceCache[source] = nil
end)
