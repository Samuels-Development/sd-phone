fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'sd-phone'
author 'Samuel#0008'
version '0.1.0'
description 'iOS-themed in-game phone — lockscreen, homepage, NUI bridge'

-- Both sides load ox_lib first (require / callback machinery), then the shared
-- bridge bootstrap that detects the running framework.
shared_scripts {
    '@ox_lib/init.lua',
    'bridge/shared/init.lua',
}

-- Only the *entry points* are listed below. Every other module is loaded
-- via ox_lib's `require` from one of these files (or transitively from
-- another required module). Duplicating an already-required file in
-- client_scripts / server_scripts would re-execute its top-level side
-- effects (CreateThread, RegisterNetEvent, ...), so we deliberately keep
-- this list lean.
client_scripts {
    'bridge/client/init.lua',
    'client/main.lua',
}

server_scripts {
    -- oxmysql wrapper is loaded first so any module pulled in below can
    -- reach `MySQL.*` at top-level require time without ordering tricks.
    '@oxmysql/lib/MySQL.lua',
    'bridge/server/init.lua',
    'server/main.lua',
}

-- The React NUI bundle (Vite build output under web/build).
ui_page 'web/build/index.html'

-- files{} is the CLIENT download manifest: everything here is fetchable by any
-- connected client. Server modules are loaded from disk by ox_lib `require` off
-- the server_scripts entry points, so they never belong here - listing
-- server/**.lua would ship the whole authoritative validation layer (and any
-- secret placed in server code) to every client for no benefit. Only the
-- config + bridge + client sources the NUI/client side actually `require` are
-- exposed.
files {
    'bridge/**.lua',
    -- Only the flat client-shared configs ship (configs/*.lua). configs/server/ is deliberately
    -- excluded so configs/server/apikeys.lua (GIPHY + Fivemanage keys) never reaches a client -
    -- do NOT widen this to configs/**.lua.
    'configs/*.lua',
    'client/**.lua',
    'locales/*.json',
    'web/build/index.html',
    -- Custom-app SDK bridge injected into each third-party app iframe (lb-phone ui/components.js parity).
    'web/build/components.js',
    'web/build/assets/*.js',
    'web/build/assets/*.css',
    'web/build/assets/*.png',
    'web/build/assets/*.jpg',
    'web/build/assets/*.webp',
    'web/build/assets/*.svg',
    'web/build/assets/*.woff2',
    -- Ringtone + notification-tone audio (Settings -> Sound & Haptics).
    'web/build/assets/*.mp3',
    -- The iPhone bezel asset ships inside the Vite bundle (fingerprinted
    -- under web/build/assets), so no root-level image is listed here.

    -- The live game-view renderer for the Camera app (patched three.js +
    -- CfxTexture, vendored under web/src/render/three) is part of the Vite
    -- bundle: it ships as a lazy-loaded chunk in web/build/assets/*.js.

    -- Maps tiles are deliberately NOT bundled: both styles stream from the
    -- free Cloudflare Pages CDN (https://sd-maptiles.pages.dev - see
    -- TILE_SOURCES in web maps/data.ts). Bundling tile pyramids makes FXServer
    -- hash tens of thousands of files at resource start, which blows
    -- txAdmin's 90s start limit and kills the server. See web HIGH_RES_TILES.md.
}

-- Hard requirements; FXServer refuses to start the resource without them.
dependencies {
    'ox_lib',
    'oxmysql',
}

-- sd-phone answers exports['lb-phone']:* calls and satisfies `dependency 'lb-phone'`
-- lines in third-party resources (see server/compat/lbphone/). The real lb-phone on
-- this server is escrow-encrypted with no key, so it can never actually start; if it
-- ever does, the runtime guard skips the compat layer and warns instead of racing it.
provide 'lb-phone'
