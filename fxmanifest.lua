fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'sd-phone'
author 'Samuel#0008'
version '0.9.8'
description 'Full-featured in-game smartphone: 46 apps covering calls, messages, mail, social feeds, banking, stocks, marketplace, garages, housing, jobs, maps, camera, music and games, plus home screen widgets, icon themes you can design, cell tower and Wi-Fi coverage, payphones, unique phones and SIM cards, an API for third-party apps and widgets, and lb-phone compatibility'

shared_scripts {
    '@ox_lib/init.lua',
    'bridge/shared/init.lua',
}

client_scripts {
    'bridge/client/init.lua',
    'client/main.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/crypto.js',
    'server/relay.js',
    'bridge/server/init.lua',
    'server/main.lua',
}

ui_page 'web/build/index.html'

files {
    'bridge/**.lua',
    'shared/**.lua',
    'configs/*.lua',
    'client/**.lua',
    'locales/*.json',
    'web/build/index.html',
    'web/build/sdphone-sdk.js',
    'web/build/sdphone-sdk.d.ts',
    'web/build/assets/*.js',
    'web/build/assets/*.css',
    'web/build/assets/*.png',
    'web/build/assets/*.jpg',
    'web/build/assets/*.webp',
    'web/build/assets/*.svg',
    'web/build/assets/*.woff2',
    'web/build/assets/*.woff',
    'web/build/assets/*.mp3',
    'web/build/assets/*.ogg',
}

dependencies {
    'ox_lib',
    'oxmysql',
}

provide 'lb-phone'
provide 'yseries'

provide 'qs-smartphone'
provide 'qs-smartphone-pro'
provide 'qs-smartphone-lite'
provide 'gksphone'
provide 'roadphone'
