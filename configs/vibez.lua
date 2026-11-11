-- Vibez app. The feed, profiles and comments are server-backed and need no tuning here; the
-- knobs below only govern Live video - the broadcaster encodes its camera view to a real video
-- stream (VP8/VP9) and the server (server/vibez/live.lua) relays it to viewers.
return {
    Live = {
        -- Whether players can broadcast at all. Off by default: a live stream relays real
        -- video through your server, so it costs bandwidth on every viewer. With this off
        -- the Go LIVE action is hidden from the app and the server refuses to start one.
        Enabled           = false,

        -- Concurrent viewers allowed on one stream (0 = unlimited). Each viewer costs
        -- ~Bitrate of server uplink, so this is the main protection knob on large servers.
        MaxViewers        = 50,

        -- Target video encode bitrate, bits/s. Higher = sharper but more bandwidth per
        -- viewer. ~900 kbps is a good 540p balance.
        Bitrate           = 900000,

        -- Broadcaster capture/encode frame rate.
        Fps               = 25,

        -- How often (ms) the encoder emits a chunk. Lower = lower latency, slightly
        -- more overhead.
        TimesliceMs       = 250,

        -- The broadcaster re-anchors the stream this often (ms) so people joining
        -- mid-stream get a clean picture quickly. Lower = faster joins but marginally
        -- less efficient.
        KeyframeMs        = 4000,

        -- Per-viewer latent send ceiling (bytes/s) the server uses to pace each chunk
        -- onto the wire without slamming the net thread.
        RelayBytesPerSec  = 512 * 1024,
    },

    -- Text to speech on a Clout upload. The composer offers a text box and a voice; the
    -- server turns them into an audio clip and plays it over the video, the way TikTok does.
    -- Needs the same media upload key the app already uses to store videos (Fivemanage,
    -- Qbox or FiveMesh). The endpoint is a free public relay, so it can rate limit or go down; a failure
    -- is soft, the post still uploads, just without the voiceover.
    TTS = {
        -- Whether the composer offers text to speech at all. With this off the field is hidden
        -- and the server ignores any TTS a client sends.
        Enabled  = true,

        -- Where the text is turned into audio. The default is the community TikTok-TTS relay.
        -- Swap it for your own if you self-host one that answers the same {text, voice} shape.
        Endpoint = 'https://tiktok-tts.weilnet.workers.dev/api/generation',

        -- The voices offered, as { label shown to the player, voice code sent to the endpoint }.
        Voices = {
            { 'English (US) - Female',   'en_us_001' },
            { 'English (US) - Male 1',   'en_us_006' },
            { 'English (US) - Male 2',   'en_us_007' },
            { 'English (US) - Male 3',   'en_us_009' },
            { 'English (US) - Male 4',   'en_us_010' },
            { 'English (UK) - Male 1',   'en_uk_001' },
            { 'English (UK) - Male 2',   'en_uk_003' },
            { 'English (AU) - Female',   'en_au_001' },
            { 'English (AU) - Male',     'en_au_002' },
            { 'French - Male 1',         'fr_001' },
            { 'French - Male 2',         'fr_002' },
            { 'German - Female',         'de_001' },
            { 'German - Male',           'de_002' },
            { 'Spanish - Male',          'es_002' },
            { 'Spanish (MX) - Male',     'es_mx_002' },
            { 'Portuguese (BR) - Female','br_003' },
            { 'Portuguese (BR) - Male',  'br_005' },
            { 'Japanese - Female',       'jp_001' },
            { 'Korean - Male',           'kr_002' },
            { 'Ghostface (Scream)',      'en_us_ghostface' },
            { 'Chewbacca (Star Wars)',   'en_us_chewbacca' },
            { 'C3PO (Star Wars)',        'en_us_c3po' },
            { 'Stitch (Lilo & Stitch)',  'en_us_stitch' },
            { 'Stormtrooper (Star Wars)','en_us_stormtrooper' },
            { 'Rocket (Guardians)',      'en_us_rocket' },
            { 'Singing - Alto',          'en_female_f08_salut_damour' },
            { 'Singing - Tenor',         'en_male_m03_lobby' },
        },
    },
}
