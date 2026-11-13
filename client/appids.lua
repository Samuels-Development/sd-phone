---@type string[] Every built-in sd-phone app id shipped on the home screen. Custom apps may not
---claim one of these, and the lb-phone compat layer maps foreign app names onto them.
local BUILTIN = {
    'photos', 'bank', 'settings', 'clock', 'messages', 'phone', 'calendar', 'mail', 'weather',
    'maps', 'music', 'stocks', 'ryde', 'notes', 'voicememos', 'health', 'compass', 'groups',
    'services', 'pages', 'marketplace', 'radio', 'darkchat', 'cherry', 'photogram',
    'garages', 'homes', 'calculator', 'passwords', 'id', 'cookie', 'wordle', 'flappy', 'blocks',
    'blackjack', 'casino', 'climber', 'connectfour', 'chess', 'battleship', 'vibez',
    'weazelnews', 'streaks', 'birdy', 'mdt', 'racing', 'appstore', 'camera',
}

---@type table<string, true> Set form of BUILTIN for O(1) membership tests.
local set = {}
for i = 1, #BUILTIN do set[BUILTIN[i]] = true end

---@type table App switch (shared.appenabled): whether configs/apps.lua switched an app off.
local appenabled = require 'shared.appenabled'

return { list = BUILTIN, set = set, enabled = appenabled.enabled }
