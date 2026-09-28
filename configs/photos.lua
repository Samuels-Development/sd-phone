-- Photos / Camera. The Camera app renders the live game view into a NUI canvas (vendored
-- three.js + CfxTexture in web/src/render/) for a first-person viewfinder. The shutter
-- grabs that canvas as a base64 data-URL and sends it to the server over a latent event
-- (server/photos/init.lua), which uploads it to Fivemanage and stores only the returned
-- CDN URL in `phone_photos`.
--
-- The Fivemanage Media key is read SERVER-SIDE so it never reaches clients: set FivemanageMedia
-- in configs/server/apikeys.lua (that file is excluded from fxmanifest files{}). A blank config
-- value still falls back to the legacy `sd_fivemanage_key` server convar. Create a "Media" token
-- at https://app.fivemanage.com.
return {
    -- Which CDN uploads go to: 'fivemanage' or 'qbox'.
    --
    -- 'fivemanage' uses the Fivemanage Media token (FivemanageMedia in configs/server/apikeys.lua,
    -- or the legacy sd_fivemanage_key convar).
    --
    -- 'qbox' uses the Qbox Dashboard CDN (QboxCdn in configs/server/apikeys.lua, or the
    -- sd_qbox_cdn_key convar). Generate the token at https://dashboard.qbox.re -> CDN -> API.
    -- Anything other than 'qbox' stays on Fivemanage, so a typo never quietly moves your media.
    Provider = 'fivemanage',

    -- Folder your Fivemanage Media token is scoped to, if any (e.g. 'myserver/prod'). Uploads made
    -- with a folder-scoped token come back as <CDN>/<team>/<folder>/<name>, and the direct-upload
    -- claim has to know the folder or it refuses them as foreign. Blank uses the sd_phone_media_path
    -- server convar instead (so one config can serve several servers); blank in both = no folder.
    MediaPath = '',

    -- JPEG quality (0.0 - 1.0). 0.85 matches NPWD's default and balances
    -- file size against visible compression artefacts.
    Quality = 0.85,

    -- FiveM for GTAV Enhanced can hand the phone a black game view, which blacks out the Camera
    -- viewfinder. This shows the game's own view element over the viewfinder instead. It is a
    -- live preview only: a photo or clip taken on Enhanced still saves black until Cfx fixes
    -- game view capture. Legacy servers are never affected by this setting.
    --   'auto'  = only on an Enhanced server, and only while the view reads back black
    --   'probe' = the same check on any server, for an Enhanced build 'auto' fails to recognise
    --   'force' = always show the game's view element, for testing
    --   false   = never
    EnhancedGameView = 'auto',

    -- Per-player retention cap. Once exceeded, oldest photos are pruned to
    -- keep the row count bounded.
    MaxPhotosPerPlayer = 200,

    -- Per-player cap on custom albums (Recents + Favourites are always-present
    -- standard albums and don't count toward this).
    MaxAlbumsPerPlayer = 50,

    -- Album-name length bounds. Max mirrors the React `<input maxLength>` so
    -- client and server agree.
    MinAlbumNameLength = 1,
    MaxAlbumNameLength = 40,

    -- How fast a capture is pushed to the server, in BYTES per second, per player.
    --
    -- This is the throttle on the latent event carrying the media, and it is deliberately well
    -- under a home connection's upload speed. It shares that connection with the player's own
    -- game traffic, and the game's packets are the ones that matter: saturate the uplink and
    -- their packet loss climbs until the server times them out. Slower here is a longer upload
    -- and a player who stays connected, which is the right trade.
    --
    -- 262144 (256 KB/s = 2 Mbit/s) leaves headroom on a modest connection. A one-minute clip is
    -- roughly 12 MB, so it lands in about 45 seconds in the background - the player can put the
    -- phone away and keep playing while it finishes. Raise it only if your players are on
    -- connections you know are fast, and lower it if you see packet loss during uploads.
    UploadBytesPerSec = 262144,

    -- Lets phones upload camera clips, voice memos, voicemails, call recordings, voice messages
    -- and bodycam footage straight to Fivemanage over HTTPS, instead of sending them through the
    -- server over the game network first. That avoids the packet loss a big upload causes.
    --
    -- OFF BY DEFAULT, AND READ THIS BEFORE TURNING IT ON. To do this the server hands the player a
    -- temporary Fivemanage upload link. Fivemanage lets that link be used for ANY number of uploads
    -- of ANY size until it expires, and a link has to last long enough for a real clip to finish
    -- (one to ten minutes). A cheater with a modified client can use that window to fill your
    -- Fivemanage storage, and you pay for it. The phone limits how often links are handed out,
    -- charges each one against UploadLimits below, and cuts off players whose links go unused,
    -- but none of that can stop what happens inside a link's lifetime.
    --
    -- With this off, every upload goes through your server first, where UploadLimits applies to
    -- every byte before anything reaches Fivemanage. Nothing else changes.
    --
    -- This replaces the old DirectUpload setting, which is no longer read.
    AllowDirectUpload = false,

    -- Ceilings on how much players can upload to your media provider (Fivemanage or Qbox). Every
    -- camera photo and clip, voice memo, voicemail, call recording, voice message, bodycam
    -- recording and Clout voiceover counts. The defaults are far above what a normal player uses.
    --
    -- A player with no character loaded can never upload. Limits are per FiveM account (license),
    -- so switching or using several characters does not give a player more.
    UploadLimits = {
        CooldownMs    = 1000,  -- minimum gap between two uploads from one account
        WindowMinutes = 10,    -- length of the rolling window the next three use
        PlayerMB      = 200,   -- MB one account may upload per window
        PlayerUploads = 120,   -- uploads one account may make per window, whatever their size
        PlayerDailyMB = 2048,  -- MB one account may upload per day (UTC); survives restarts. 0 = off
        ServerMB      = 3072,  -- MB the WHOLE server may upload per window, however many players. 0 = off
        ServerDailyMB = 20480, -- MB the WHOLE server may upload per day (UTC); survives restarts. 0 = off
    },

    -- Logs each capture upload to the server console: the size, the slice count, how long it
    -- took and the throughput it actually achieved. Off by default because it is one line per
    -- capture; turn it on when you are diagnosing upload problems and want real numbers rather
    -- than an impression.
    LogUploads = false,

    -- Player URL import (the Import button in Photos). Imported URLs are stored and rendered
    -- as-is, NOT re-hosted, so every phone that shows the picture fetches it from that host. A
    -- hostile host would learn the IP address of each viewer, which is why only the hosts in
    -- ImportAllowlist are accepted: large image CDNs behind their own edge network, where the
    -- uploader never sees who views the file. Camera uploads are unaffected because their URL
    -- comes from the server uploader.
    AllowImport = true, -- master switch; false disables URL import and hides the button.

    -- Hosts to always reject. Exact hostnames, or '*.domain.com' for every subdomain.
    -- IP loggers and URL shorteners belong here: a shortener can redirect an otherwise
    -- fine-looking link to anywhere, and the viewer's client would follow it.
    ImportBlocklist = {
        'grabify.link', '*.grabify.link',
        'iplogger.org', '*.iplogger.org',
        'bit.ly', 'tinyurl.com', 't.co',
    },

    -- ONLY these hosts may be imported (the blocklist still applies on top). An empty list
    -- rejects every import instead of trusting the whole internet. '*.domain.com' matches the
    -- bare domain and every subdomain. Add a host only if its images are served by the platform
    -- itself, never by the person who uploaded them.
    ImportAllowlist = {
        '*.imgur.com',
        '*.discordapp.com', '*.discordapp.net', -- note: Discord attachment links expire after roughly a day
        '*.fivemanage.com',
        '*.ibb.co',
        '*.postimg.cc',
        '*.gyazo.com',
        '*.redd.it',
        '*.giphy.com',
        '*.tenor.com',
        '*.twimg.com',
        '*.pinimg.com',
        '*.githubusercontent.com',
        '*.googleusercontent.com',
        '*.unsplash.com',
        '*.pexels.com',
        '*.wikimedia.org',
    },
}
