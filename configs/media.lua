-- The media relay: a WebSocket that carries live video straight between the browser producing it
-- and the browsers watching it, instead of pushing every frame through the game's event bus.
--
-- Nothing in here decides who may watch anything. The features that own a stream (the MDT's
-- Cameras section, Photogram Live, Vibez Live) run exactly the permission checks they run today,
-- and only once one has passed does this layer sign a short-lived token saying so. A token is a
-- receipt for a decision already made, never a substitute for making one.
--
-- The relay itself is a small Node process you run separately. It is not a FiveM resource, it is
-- not started by this one, and it never talks to the game: it only knows stream names and the
-- tokens this server signs. It needs a hostname with a publicly trusted certificate, because the
-- phone's UI runs on a secure origin: the browser refuses a plain ws:// endpoint outright, and a
-- self-signed certificate fails with close code 1006 and no prompt for the player to accept.
--
-- The URL and the signing key are read from server convars, never from this file, so a secret
-- cannot land in a git diff. Put them in your server.cfg:
--     set sd_phone_relay_url "wss://media.example.com/ws"
--     set sd_phone_relay_key "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
--     set sd_phone_relay_ttl "45"
--     set sd_phone_relay_control_url "https://media.example.com/control"
-- Only the first two are needed; the last two fall back to TokenTtlSeconds below and to a control
-- endpoint derived from the relay URL. Generate a key with `openssl rand -hex 32` and give the
-- same 64 characters to the relay process as its SD_PHONE_RELAY_KEY environment variable. The key
-- is specific to the relay: rotating it rotates nothing else, and the relay is never handed the
-- server secret that configs/server and .secret protect.
--
-- With either convar unset, with the Node crypto helper missing, or with Enabled below false, the
-- whole thing reports itself unavailable and every feature keeps streaming the way it does today.
-- That is the shipped default, so an install that never sets a convar never notices this file.
return {
    -- Whether the relay is used at all. Off by default: it wants a Node process and a
    -- certificate, so it is something you turn on deliberately rather than half-have.
    Enabled = false,

    -- Whether the relay runs inside this resource. With this on there is no Node to install, no
    -- second process to keep alive, no signing key to generate and no port to pick: the key is
    -- minted for each boot and never leaves the process, and the port is whichever one is free.
    --
    -- It cannot conjure a certificate, and nothing can. The phone's browser refuses an insecure
    -- socket to anything but the machine it is running on, so a server with real players still
    -- needs TLS terminated in front of this and its address in sd_phone_relay_url. Without that,
    -- this is a development convenience and the features stay on the event path.
    --
    -- Turn it off to run media-server/ on its own box instead; then sd_phone_relay_url and
    -- sd_phone_relay_key are read as before.
    SelfHost = true,

    -- Which features may mint a token. A feature switched off here keeps working, it just keeps
    -- working the old way, over the event bus.
    Features = {
        Cameras       = true,   -- MDT bodycams and dashcams
        PhotogramLive = true,   -- Photogram Live broadcasts
        VibezLive     = true,   -- Vibez Live broadcasts
    },

    -- Seconds a minted token is good for, clamped to 10..120. Deliberately short: the phone
    -- re-mints through the feature's own permission check on every reconnect, so taking a camera
    -- away from somebody is mostly a matter of not issuing the next token. A server convar
    -- (sd_phone_relay_ttl) overrides this when set.
    TokenTtlSeconds = 45,

    -- Seconds before expiry the phone should ask for a fresh token. Served to the UI so the
    -- refresh cadence follows the lifetime above instead of being guessed a second time.
    RefreshLeadSeconds = 15,

    -- Whether this server may call the relay over HTTP to cut a stream short: an officer going
    -- off duty, a viewing permission revoked, a quality change that invalidates the picture.
    -- Turning it off costs nothing worse than a stream that lingers until its tokens lapse.
    ControlChannel = true,

    -- Convar names the URL and the key are read from. Change these only if the names collide with
    -- something else on your server. The values themselves never live here.
    UrlConvar        = 'sd_phone_relay_url',
    KeyConvar        = 'sd_phone_relay_key',
    TtlConvar        = 'sd_phone_relay_ttl',
    ControlUrlConvar = 'sd_phone_relay_control_url',
}
