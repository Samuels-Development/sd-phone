-- Phone voice capture for camera videos and Photogram Live. The recorder's own mic is always
-- mixed in client-side; the settings below govern capturing NEARBY players' voices, done with a
-- real WebRTC mesh (each nearby player's client streams their mic peer-to-peer, mixed into the
-- recording).
return {
    -- Master switch. When false, recordings carry only the recorder's own voice. Note:
    -- capturing other players' microphones may have privacy implications on your server.
    RecordNearbyVoices = true,

    -- Metres - how close another player must be to be captured.
    NearbyRange        = 12.0,

    -- Cap on simultaneous nearby voices mixed into one recording (protects
    -- bandwidth/CPU on busy streets).
    MaxNearbyVoices    = 6,

    -- Only capture a nearby player while they're actually transmitting in-game
    -- (pma-voice / Mumble push-to-talk or open mic), so silent/muted players
    -- aren't recorded and you capture what you'd actually hear. Set false to
    -- stream their mic the whole time (or for non-Mumble voice like SaltyChat,
    -- where the talking state can't be read).
    TransmitGated      = true,

    -- 'cloudflare' provisions TURN relays (needed for players on different networks) from
    -- Cloudflare Realtime; 'none' uses STUN only (works on LAN / permissive NATs only).
    -- TURN secrets are read from server convars (NOT committed to the repo):
    --     set sd_cf_turn_token_id   "your-cloudflare-turn-token-id"
    --     set sd_cf_turn_api_token  "your-cloudflare-turn-api-token"
    -- Create them at Cloudflare dash → Realtime → TURN. See the Cloudflare TURN docs.
    Turn = {
        Provider   = 'cloudflare',   -- 'cloudflare' | 'none'
        TtlSeconds = 86400,          -- lifetime of provisioned TURN credentials
    },

    -- Always-available public STUN (free). TURN is layered on top when configured.
    StunServers = {
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
    },
}
