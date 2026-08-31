---@type table Media relay config (configs/media.lua): the switch, the per-feature toggles, the
---token lifetime and the names of the convars the URL and the signing key are read from.
local CFG    = require 'configs.media'
---@type table Shared server helpers (server.util): envelopes, rate limiting, string clamps.
local util   = require 'server.util'
---@type table Player bridge (bridge.server.player): the citizenid and display name a token names.
local player = require 'bridge.server.player'
---@type table Crypto bridge (server.crypto): the Node helper probe and the token nonce.
local crypto = require 'server.crypto'
---@type table Token minting (server.media.tokens): the signed SDMR/1 string this layer hands out.
local tokens = require 'server.media.tokens'

---@type table Media module; the table returned at end of file. The server half of the media relay:
---it knows where the relay is, how to sign a token for it, and which feature owns which stream. It
---knows nothing about who may watch what, and it must not learn: a feature runs its own permission
---check and calls in here afterwards, so a token is only ever a receipt for a decision made
---elsewhere. With the relay unconfigured every call here answers "unavailable" and the features
---carry on over the event relay they already have.
local media = {}

---@type boolean Whether the relay is switched on in configs/media.lua.
local ENABLED = CFG.Enabled == true

---@type table Per-feature toggles (configs/media.lua Features).
local FEATURES = type(CFG.Features) == 'table' and CFG.Features or {}

---@type table<string, boolean> Feature ids switched off in the config, keyed on the id a feature
---registers under. Keyed on the disabled ones so a feature this file has never heard of is on.
local FEATURE_OFF = {
    ['photogram:live'] = FEATURES.PhotogramLive == false,
    ['vibez:live']     = FEATURES.VibezLive == false,
}

---@type string Convar the browser-facing relay URL is read from.
local URL_CONVAR = type(CFG.UrlConvar) == 'string' and CFG.UrlConvar ~= '' and CFG.UrlConvar or 'sd_phone_relay_url'
---@type string Convar the 64 hex character signing key is read from.
local KEY_CONVAR = type(CFG.KeyConvar) == 'string' and CFG.KeyConvar ~= '' and CFG.KeyConvar or 'sd_phone_relay_key'
---@type string Convar the token lifetime override is read from.
local TTL_CONVAR = type(CFG.TtlConvar) == 'string' and CFG.TtlConvar ~= '' and CFG.TtlConvar or 'sd_phone_relay_ttl'
---@type string Convar the server-to-relay control endpoint is read from.
local CONTROL_CONVAR = type(CFG.ControlUrlConvar) == 'string' and CFG.ControlUrlConvar ~= '' and CFG.ControlUrlConvar or 'sd_phone_relay_control_url'

---@type integer Shortest token lifetime, in seconds.
local TTL_MIN = 10
---@type integer Longest token lifetime, in seconds.
local TTL_MAX = 120
---@type integer Largest stream epoch a token may carry.
local GEN_MAX = 2147483647
---@type integer Longest display name a token carries, in bytes. Informational only: the relay logs
---it and never authorises anything with it.
local NAME_MAX = 64

---@type integer Seconds before expiry the phone is told to come back for a fresh token.
local REFRESH_LEAD = math.max(2, math.floor(tonumber(CFG.RefreshLeadSeconds) or 15))
---@type boolean Whether this server may call the relay over HTTP to cut a stream short.
local CONTROL_ENABLED = CFG.ControlChannel ~= false

---@type table<string, boolean> Stream key namespaces, the app half of '<app>:<kind>:<id>'.
local STREAM_APPS = { mdt = true, photogram = true, vibez = true }
---@type table<string, boolean> Stream key kinds, the middle half of '<app>:<kind>:<id>'.
local STREAM_KINDS = { cam = true, live = true }
---@type table<string, boolean> Roles a token may be minted for.
local ROLES = { session = true, publish = true, watch = true }

---@type table Refusal answered when a caller asks faster than any terminal legitimately would.
local BUSY = util.fail('media.tooManyRequestsTryAgain', 'Too many requests, try again in a moment')
---@type table Refusal answered for a stream name no feature owns.
local UNKNOWN_STREAM = util.fail('media.streamDoesNotExist', 'That stream does not exist')
---@type table Refusal answered when the feature that owns a stream would not have it watched.
local REFUSED = util.fail('media.cannotWatchStream', 'You cannot watch that stream')

---@type boolean Whether the relay may run inside this resource (configs/media.lua SelfHost).
local SELF_HOST = CFG.SelfHost ~= false
---@type integer Milliseconds to wait for the in-process relay to report which port it took.
local HOST_START_MS = 3000

---@type string Signing key minted for the relay running inside this resource, empty when there is
---not one. It exists for this boot only and is never written anywhere.
local hostedKey = ''
---@type integer Port that relay took, 0 when nothing is hosted here.
local hostedPort = 0
---@type boolean Whether that relay is terminating TLS itself.
local hostedTls = false

---@type boolean|nil Cached gate result; nil until the first resolve.
local ready
---@type string Relay endpoint served to the browser, empty until the gate resolves.
local endpointUrl = ''
---@type string Signing key, empty until the gate resolves. Never served to a client.
local signingKey = ''
---@type string Server-to-relay control endpoint, empty when there is not one.
local controlUrl = ''
---@type integer Token lifetime in seconds, resolved from the convar then the config.
local ttlSeconds = TTL_MIN

---@type table<string, table> Entitlement handlers, keyed on the '<app>:<kind>' a feature owns.
local features = {}

---Whether a relay endpoint is one the phone's browser can actually open. The NUI runs on a secure
---origin, so anything but wss:// is refused by the browser before a socket exists; ws:// is allowed
---only against the loopback host, which reaches the player's own machine rather than the server's
---and so is a development carve-out, not a deployment.
---@param url string
---@return boolean usable
local function endpointOk(url)
    if url:sub(1, 6) == 'wss://' then return true end
    local host = url:match('^ws://(%b[])') or url:match('^ws://([^/:]+)')
    return host == 'localhost' or host == '127.0.0.1' or host == '[::1]'
end

---The control endpoint implied by a relay URL: the same host over HTTP(S), at /control. Used when
---the control convar is unset, so a server that set one URL does not have to set a second.
---@param url string relay websocket URL
---@return string controlUrl empty when the URL is not one this module accepted
local function deriveControlUrl(url)
    local scheme, rest = url:match('^(wss?)://(.+)$')
    if not rest then return '' end
    local host = rest:match('^([^/]+)')
    if not host then return '' end
    return (scheme == 'wss' and 'https://' or 'http://') .. host .. '/control'
end

---Resolves the gate once and remembers it: the relay is available only with the switch on, a
---usable URL, a well-formed key and the Node crypto helper answering. Anything missing leaves it
---off and says which thing was missing, once, because a half-configured relay that silently does
---nothing is the hardest version of this to diagnose.
---@return boolean available
---A throwaway claim set used only to prove signing actually works at boot. Everything a real
---token carries is present so the check exercises the same encoding path a grant does.
---@return table claims
local function probeClaims()
    local now = os.time()
    return {
        sub  = 'probe',
        src  = 0,
        name = 'probe',
        key  = 'probe',
        role = 'session',
        gen  = 0,
        iat  = now,
        exp  = now + 5,
        jti  = string.rep('0', 32),
    }
end

---Starts the relay inside this resource and waits for it to say which port it took. Everything a
---standalone relay needs configuring by hand is decided here instead: the signing key is minted for
---this boot and never leaves the process, and the port is whatever is free, because a server owner
---should not have to know that the relay's own default lands on the HTTP endpoint FiveM opens ten
---above the game port.
---
---This does not conjure a certificate, and nothing can: the phone's browser refuses a ws:// socket
---to anything but loopback, so a server serving real players still needs TLS terminated in front of
---this and its address in the URL convar. What it removes is the Node install, the second process,
---the key and the port.
---@return boolean hosted
local function startHost()
    if not crypto.available() then return false end

    local key = crypto.randomHex(32)
    if type(key) ~= 'string' or #key ~= 64 then return false end

    local answered, result = false, nil
    local cookie = AddEventHandler('sd-phone:media:relayHosted', function(payload)
        answered, result = true, payload
    end)

    local okCall = pcall(function()
        exports[GetCurrentResourceName()]:sdRelayHost({
            keyHex     = key,
            port       = math.floor(tonumber(GetConvar('sd_phone_relay_port', '')) or 0),
            logLevel   = GetConvar('sd_phone_relay_log', 'warn'),
            tlsCert    = GetConvar('sd_phone_relay_tls_cert', ''),
            tlsKey     = GetConvar('sd_phone_relay_tls_key', ''),
            trustProxy = GetConvar('sd_phone_relay_url', '') ~= '',
        })
    end)

    if okCall then
        local waited = 0
        while not answered and waited < HOST_START_MS do
            Wait(50)
            waited = waited + 50
        end
    end
    RemoveEventHandler(cookie)

    if not okCall then
        print('^3[sd-phone:media]^0 the relay could not be started in this resource: the Node runtime did not answer. Run media-server/ separately, or set Media.SelfHost = false to silence this.')
        return false
    end
    if not answered then
        print('^3[sd-phone:media]^0 the relay did not report back in time; live video stays on the event path.')
        return false
    end
    if type(result) ~= 'table' or result.ok ~= true then
        local why = type(result) == 'table' and (result.detail or result.reason) or 'unknown'
        print(('^3[sd-phone:media]^0 the relay could not start: %s'):format(tostring(why)))
        return false
    end

    hostedKey  = key
    hostedPort = math.floor(tonumber(result.port) or 0)
    hostedTls  = result.tls == true
    return hostedPort > 0
end

local function resolve()
    if ready ~= nil then return ready end
    ready = false
    if not ENABLED then return false end

    local url = GetConvar(URL_CONVAR, '')
    local key = GetConvar(KEY_CONVAR, '')

    -- A relay running inside this resource signs with a key nobody had to generate and listens on
    -- a port nobody had to pick, so both are taken from it rather than from the convars. An owner
    -- who put TLS in front still sets the URL convar, and that address wins: it is the one their
    -- players can actually reach.
    if hostedPort > 0 then
        key = hostedKey

        -- A loopback URL naming a different port than the one we are listening on cannot be right:
        -- there is no second relay on this machine, and what is usually there instead is FiveM's
        -- own HTTP endpoint, which answers the browser's handshake with a redirect. Correcting it
        -- silently would hide a setting the owner still has wrong somewhere else, so it is said.
        local convarPort = tonumber(url:match('^wss?://127%.0%.0%.1:(%d+)') or url:match('^wss?://localhost:(%d+)'))
        if convarPort and convarPort ~= hostedPort then
            print(('^3[sd-phone:media]^0 %s points at loopback port %d, but the relay in this resource is on %d. Using the one that exists; clear the convar, or set it to the address your players reach.')
                :format(URL_CONVAR, convarPort, hostedPort))
            url = ''
        end

        -- With nothing configured, the relay is listening but has no address a player could use:
        -- loopback reaches the player's own machine, not this one. Handing that out would cost
        -- every player a connection that cannot succeed, so it is only advertised when somebody
        -- deliberately says this is a local test.
        if url == '' then
            if GetConvarInt('sd_phone_relay_loopback', 0) == 1 then
                url = ('%s://127.0.0.1:%d'):format(hostedTls and 'wss' or 'ws', hostedPort)
            else
                print(('^3[sd-phone:media]^0 the relay is up on port %d, but no address is set for it. Put TLS in front and `set %s "wss://your.host/ws"`, or `set sd_phone_relay_loopback 1` to test it on this machine. Live video stays on the event path until then.')
                    :format(hostedPort, URL_CONVAR))
            end
        end
    end

    local reason
    if url == '' then
        reason = ('no relay URL is set (`set %s "wss://media.example.com/ws"`)'):format(URL_CONVAR)
    elseif not endpointOk(url) then
        reason = ('%s is not a wss:// URL, and the phone\'s browser refuses anything else'):format(URL_CONVAR)
    elseif #key ~= 64 or not key:match('^[0-9a-f]+$') then
        reason = ('%s is not 64 lowercase hex characters (`openssl rand -hex 32`)'):format(KEY_CONVAR)
    elseif not crypto.available() then
        reason = 'the Node crypto helper did not load, so tokens cannot be signed'
    elseif not tokens.sign(key, probeClaims()) then
        reason = 'the Node crypto helper loaded but would not sign a token, which means this build is ' ..
            'missing the sdCryptoRelayToken / sdCryptoHmacHex exports in server/crypto.js'
    end

    if reason then
        print(('^3[sd-phone:media]^0 the relay is on in configs/media.lua but %s, so live video stays on the server relay.'):format(reason))
        return false
    end

    endpointUrl = url
    signingKey = key
    ttlSeconds = lib.math.clamp(math.floor(tonumber(GetConvar(TTL_CONVAR, '')) or tonumber(CFG.TokenTtlSeconds) or 45), TTL_MIN, TTL_MAX)

    local control = GetConvar(CONTROL_CONVAR, '')
    controlUrl = CONTROL_ENABLED and (control ~= '' and control or deriveControlUrl(url)) or ''

    ready = true
    return true
end

---Whether the relay is configured and usable. Everything else in this module answers as though it
---were switched off until this is true, so a caller never has to check twice.
---@return boolean available
function media.enabled()
    return resolve()
end

---Whether one feature may mint tokens: the relay is up and the feature is not switched off in
---configs/media.lua. A feature id this module has never heard of counts as on.
---@param feature string '<app>:<kind>', e.g. 'photogram:live'
---@return boolean enabled
function media.featureEnabled(feature)
    if not resolve() then return false end
    return not FEATURE_OFF[feature]
end

---Whether a string is a well-formed stream key, '<app>:<kind>:<id>'. The relay treats keys as
---opaque past this shape, so it is checked here rather than there.
---@param id any
---@return boolean valid
function media.validStreamId(id)
    if type(id) ~= 'string' then return false end
    local app, kind, rest = id:match('^(%l+):(%l+):([A-Za-z0-9_%-]+)$')
    if not app or not STREAM_APPS[app] or not STREAM_KINDS[kind] then return false end
    return #rest <= 64
end

---Builds a stream key from its parts, nil when the parts do not make a valid one. Features build
---their keys through this so the shape lives in one place.
---@param app string 'mdt' | 'photogram' | 'vibez'
---@param kind string 'cam' | 'live'
---@param id string citizenid or broadcast id
---@return string|nil streamId
function media.streamId(app, kind, id)
    local built = ('%s:%s:%s'):format(tostring(app), tostring(kind), tostring(id))
    return media.validStreamId(built) and built or nil
end

---Registers the feature that owns a family of streams, so the phone can ask this module for a
---token by stream name and be routed back to the code that actually knows the answer.
---
---`entitle` is handed the requesting source and the stream being asked for, and returns the grant
---to sign (`{ key, role, gen }`) or nil plus a keyed refusal envelope. It runs the feature's own
---permission check: nothing in this module inspects a job, a duty state or a follower list.
---@param feature string '<app>:<kind>', e.g. 'photogram:live'
---@param handler { entitle: fun(src: integer, req: { streamId: string, role: string }): table|nil, table|nil }
function media.registerFeature(feature, handler)
    if type(feature) ~= 'string' or feature == '' then return end
    if type(handler) ~= 'table' or type(handler.entitle) ~= 'function' then return end
    features[feature] = handler
end

---Mints a token for one player and one stream. The caller has already decided this player may do
---this thing; all that happens here is that the decision is written down and signed.
---
---Nil on anything at all going wrong (relay off, malformed stream key, unknown player, no signing
---helper), because there is always a working answer without a token: the feature keeps streaming
---over the event relay. The caller puts the result in an optional `relay` field and omits the
---field entirely when it is nil, so the phone sees the key absent rather than empty.
---@param src integer requesting player's server id
---@param opts { key?: string, role: string, gen?: integer } role is 'session' | 'publish' | 'watch'
---@return table|nil grant { url, token, streamId, role, gen, expiresAt, expiresInMs, ttlSeconds }
function media.mint(src, opts)
    if not resolve() or type(opts) ~= 'table' then return nil end

    local role = opts.role
    if not ROLES[role] then return nil end

    -- A session token authenticates the socket rather than a stream, so it names neither.
    local streamId = role == 'session' and '' or opts.key
    if role ~= 'session' and not media.validStreamId(streamId) then return nil end

    local gen = role == 'session' and 0 or math.floor(tonumber(opts.gen) or 0)
    if gen < 0 or gen > GEN_MAX then return nil end

    local cid = player.getIdentifier(src)
    if type(cid) ~= 'string' or #cid > 64 or not cid:match('^[A-Za-z0-9_%-]+$') then return nil end

    local jti = crypto.randomHex(16)
    if type(jti) ~= 'string' or #jti ~= 32 then return nil end

    local now = os.time()
    local exp = now + ttlSeconds
    local token = tokens.sign(signingKey, {
        sub  = cid,
        src  = lib.math.clamp(math.floor(tonumber(src) or 1), 1, 65535),
        name = util.limitedString(player.getName(src), NAME_MAX) or '',
        key  = streamId,
        role = role,
        gen  = gen,
        iat  = now,
        exp  = exp,
        jti  = jti,
    })
    if not token then return nil end

    return {
        url         = endpointUrl,
        token       = token,
        streamId    = streamId,
        role        = role,
        gen         = gen,
        expiresAt   = exp * 1000,
        expiresInMs = ttlSeconds * 1000,
        ttlSeconds  = ttlSeconds,
    }
end

---Calls the relay over its authenticated HTTP control endpoint. Fire and forget: the relay is a
---separate process that may be down, and nothing on the game side is allowed to wait on it or to
---fail because of it. False when there is no control channel to call.
---@param op string 'revoke' | 'gen'
---@param fields? table extra body fields for the operation
---@return boolean sent
function media.control(op, fields)
    if not resolve() or controlUrl == '' then return false end
    if type(op) ~= 'string' or op == '' then return false end

    local body = { op = op }
    for k, v in pairs(type(fields) == 'table' and fields or {}) do body[k] = v end

    local okEncode, raw = pcall(json.encode, body)
    if not okEncode or type(raw) ~= 'string' then return false end

    local ts = ('%d'):format(os.time() * 1000)
    local sig = tokens.hmacHex(signingKey, ts .. '.' .. raw)
    if not sig then return false end

    PerformHttpRequest(controlUrl, function() end, 'POST', raw, {
        ['Content-Type'] = 'application/json',
        ['x-sdmr-ts']    = ts,
        ['x-sdmr-sig']   = sig,
    })
    return true
end

---Tears a stream down on the relay and detaches everyone on it. The immediate half of revocation:
---short token lifetimes already stop the next attach, this stops the current one.
---@param streamId string
---@param reason? string logged by the relay, e.g. 'offduty'
---@return boolean sent
function media.revoke(streamId, reason)
    if not media.validStreamId(streamId) then return false end
    return media.control('revoke', { key = streamId, reason = type(reason) == 'string' and reason or 'revoked' })
end

---Forces a stream's epoch forward on the relay, which drops its cache and tells every viewer to
---rebuild. Called when the picture changes shape under them, which is the one thing a viewer
---cannot decode across.
---@param streamId string
---@param gen integer new epoch
---@return boolean sent
function media.setGen(streamId, gen)
    if not media.validStreamId(streamId) then return false end
    local epoch = math.floor(tonumber(gen) or 0)
    if epoch < 0 or epoch > GEN_MAX then return false end
    return media.control('gen', { key = streamId, gen = epoch })
end

---Where the relay is, and whether there is one. Called once per phone session before anything
---tries to open a socket, so a server without a relay never constructs one at all.
lib.callback.register('sd-phone:server:relay:endpoint', function(src)
    if not util.rateLimit(player.getIdentifier(src), 'relay:endpoint', 60000, 10) then return BUSY end
    if not resolve() then return util.ok({ enabled = false }) end

    return util.ok({
        enabled            = true,
        url                = endpointUrl,
        ttlSeconds         = ttlSeconds,
        refreshLeadSeconds = REFRESH_LEAD,
    })
end)

---A token for one stream, and the refresh path for one about to lapse: the phone calls this again
---as expiry approaches and gets a fresh token, which re-runs the owning feature's permission check
---on the way through. That is the whole revocation story for a long viewing session.
---
---`role = 'session'` mints the token that opens the socket itself. It names no stream and needs no
---feature to vouch for it, because it authorises nothing beyond telling the relay which citizen is
---on the other end; watching and broadcasting each take their own token afterwards.
---
---Answers `{ enabled = false }` rather than a failure when there is no relay to reach, because
---that is not an error the player did anything about: the feature falls back and keeps playing.
lib.callback.register('sd-phone:server:relay:token', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    if not util.rateLimit(player.getIdentifier(src), 'relay:token', 10000, 40) then return BUSY end
    if not resolve() then return util.ok({ enabled = false }) end

    if payload.role == 'session' then
        local session = media.mint(src, { role = 'session' })
        if not session then return util.ok({ enabled = false }) end
        session.enabled = true
        return util.ok(session)
    end

    local streamId = payload.streamId
    if not media.validStreamId(streamId) then return UNKNOWN_STREAM end

    local feature = streamId:match('^(%l+:%l+):')
    local handler = features[feature]
    if not handler then return UNKNOWN_STREAM end
    if not media.featureEnabled(feature) then return util.ok({ enabled = false }) end

    local role = payload.role == 'publish' and 'publish' or 'watch'
    local okCall, grant, refusal = pcall(handler.entitle, src, { streamId = streamId, role = role })
    if not okCall then return REFUSED end
    if type(grant) ~= 'table' then
        if type(refusal) == 'table' then return refusal end
        return REFUSED
    end

    -- The grant may narrow the request (a viewer asking to publish gets watch) but never widen it
    -- into a session token, which is the one role no stream permission has anything to say about.
    local granted = grant.role
    local minted = media.mint(src, {
        key  = type(grant.key) == 'string' and grant.key or streamId,
        role = (granted == 'publish' or granted == 'watch') and granted or role,
        gen  = grant.gen,
    })
    if not minted then return util.ok({ enabled = false }) end

    minted.enabled = true
    return util.ok(minted)
end)

if ENABLED then
    -- Resolved a tick after load rather than inline: the gate probes the Node crypto helper, and
    -- that has to be a live export by then rather than a file the runtime is still reading.
    CreateThread(function()
        Wait(0)
        if SELF_HOST then startHost() end
        if resolve() then
            print(('^2[sd-phone:media]^0 relay ready at %s ^2·^0 %ds tokens'):format(endpointUrl, ttlSeconds))
        end
    end)
end

return media
