---@type table Player bridge (bridge.server.player): citizenid lookup from a server id.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone-number assignment/lookup.
local settingsStore = require 'server.settings.store'

-- Both callbacks back the lb-phone compat CLIENT shim (client/compat/lbphone.lua); registered
-- unconditionally.

---Backs GetEquippedPhoneNumber: the caller's own phone number, assigned on first access. Nil
---when the character does not resolve.
lib.callback.register('sd-phone:server:compat:selfNumber', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    return settingsStore.ensurePhoneNumber(cid)
end)

---Backs HasPhoneItem: whether the caller owns any configured phone item, routed through this
---resource's own hasPhone export. Boolean only.
lib.callback.register('sd-phone:server:compat:selfHasPhone', function(source)
    return exports['sd-phone']:hasPhone(source) ~= nil
end)
