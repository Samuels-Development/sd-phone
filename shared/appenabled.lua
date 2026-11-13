---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table<string, boolean> Apps switched off in configs/apps.lua. Keyed on the disabled ones
---rather than the enabled ones, so an id this file has never heard of still counts as on.
local disabled = {}
for _, app in ipairs((config.Apps or {}).Apps or {}) do
    if app.id and app.enabled == false then disabled[app.id] = true end
end

---@type table App switch module; the table returned at end of file. One answer for both sides.
local appenabled = {}

---Whether an app is switched on in configs/apps.lua. Background work belonging to a single app is
---gated on this, so a disabled app costs no threads, no ticks and no writes.
---@param id string app id as configs/apps.lua names it
---@return boolean enabled
function appenabled.enabled(id)
    return not disabled[id]
end

return appenabled
