-- SERVER-ONLY API KEYS - the one place third-party keys live. This file is deliberately NOT
-- listed in fxmanifest files{} (which uses `configs/*.lua`, so it never matches this subfolder),
-- meaning it stays on the server and never ships to a connected client. Keep configs/server/ out
-- of files{}; a broad glob like `configs/**.lua` would re-expose every key here to clients.
-- config.lua merges this in server-side only (behind IsDuplicityVersion), reachable as
-- config.ApiKeys.
--
-- GIPHY (Messages GIF picker). Get a free key:
--   1. https://developers.giphy.com -> sign up / log in
--   2. Create an App -> choose "API" (not "SDK")
--   3. Copy the API Key
-- Left blank, the GIF picker shows a "set up GIPHY" hint.
--
-- Fivemanage Media (photo, video + voice-note uploads) - REQUIRED for the Camera, Photos and
-- Voice Memos apps. Without it those apps open but nothing uploads or saves. Get a token:
--   1. https://fivemanage.com -> sign up / log in
--   2. Open the "Tokens" tab -> Create Token
--   3. Pick token type "Media", then paste it below
-- Left blank here, the uploader falls back to the legacy `sd_fivemanage_key` server convar
-- (set in server.cfg) so existing setups keep working; new servers can just paste it below.
--
-- Qbox CDN (the alternative to Fivemanage). Only read when Provider = 'qbox' in configs/photos.lua.
-- Get a token:
--   1. https://dashboard.qbox.re -> sign in with Discord
--   2. Open CDN -> API -> generate an API token
--   3. Paste it below (it looks like qbox_live_...)
-- Left blank here, the uploader falls back to the `sd_qbox_cdn_key` server convar.
--
-- FiveMesh CDN. Only read when Provider = 'fivemesh' in configs/photos.lua.
-- At https://app.fivemesh.io, enable CDN and generate a Server API Key (fm_server_...) or a
-- Developer API Key (fm_live_...) with cdn:write. If restricting CDN paths, allow the folder in
-- Photos.FiveMeshPath (default: phone). Left blank, falls back to sd_fivemesh_cdn_key in server.cfg.
-- Use `set` for that convar, never `setr` or `sets`: the key must stay server-side.
return {
    Giphy           = '',
    FivemanageMedia = '',
    QboxCdn         = '',
    FiveMeshCdn     = '',
}
