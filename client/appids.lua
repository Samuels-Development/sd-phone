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

---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table<string, boolean> Apps switched off in configs/apps.lua. Keyed on the disabled ones
---rather than the enabled ones, so an id this file has never heard of still counts as on.
local disabled = {}
for _, app in ipairs((config.Apps or {}).Apps or {}) do
    if app.id and app.enabled == false then disabled[app.id] = true end
end

---Whether an app is switched on in configs/apps.lua. Background work belonging to a single app is
---gated on this, so a disabled app costs nothing on anyone's game thread.
---@param id string app id as configs/apps.lua names it
---@return boolean enabled
local function enabled(id)
    return not disabled[id]
end

return { list = BUILTIN, set = set, enabled = enabled }
