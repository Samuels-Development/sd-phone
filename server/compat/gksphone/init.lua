-- Server half of the gksphone (GKSHOP) compatibility shim: when enabled, and the real gksphone is
-- not running, the domain files below register gksphone's server export names against sd-phone's
-- modules.

local compatConvar = GetConvar('sd_phone_gkscompat', 'true')
if compatConvar == 'false' or compatConvar == '0' then return end

---Whether a started resource named gksphone is the sd-phone name-holder shim rather than the real
---product.
---@return boolean
local function isShimGksphone()
    return GetResourceMetadata('gksphone', 'sd_phone_shim', 0) == 'yes'
end

---Whether a REAL resource named `name` exists on this server. sd-phone holds the gksphone name
---through `provide`, so a GetResourceState check alone would find itself; the resource list is
---enumerated instead.
---@param name string
---@return boolean
local function hasRealResource(name)
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == name then
            return name ~= 'gksphone' or not isShimGksphone()
        end
    end
    return false
end

if hasRealResource('gksphone') then
    local state = GetResourceState('gksphone')
    if state == 'started' or state == 'starting' then
        print('^3[sd-phone]^0 gksphone compat: the real gksphone resource is running, so the compat layer is NOT registering its exports. Stop or remove gksphone to let sd-phone answer for it.')
        return
    end
end

---@type table Shared shim helpers (server.compat.gksphone.shared): mid-session deregistration.
local shim = require 'server.compat.gksphone.shared'

---Deregisters the shim's export handlers when the real gksphone starts mid-session.
AddEventHandler('onResourceStart', function(resource)
    if resource ~= 'gksphone' or isShimGksphone() then return end
    shim.deregisterAll()
    print('^3[sd-phone]^0 gksphone compat: the REAL gksphone resource just started, so the compat layer deregistered its export handlers and new lookups now resolve to gksphone. Only already-cached callers keep the shim\'s functions until gksphone next stops.')
end)

-- Loaded for side effects: each domain file registers its slice of gksphone's server export surface
-- on require.
require 'server.compat.gksphone.identify'
require 'server.compat.gksphone.sim'
require 'server.compat.gksphone.messages'
require 'server.compat.gksphone.calls'
require 'server.compat.gksphone.mail'
require 'server.compat.gksphone.notifications'
require 'server.compat.gksphone.billing'
require 'server.compat.gksphone.dispatch'
require 'server.compat.gksphone.jobcenter'
require 'server.compat.gksphone.markets'
require 'server.compat.gksphone.social'
require 'server.compat.gksphone.jammer'
require 'server.compat.gksphone.maps'
require 'server.compat.gksphone.liveactivity'
require 'server.compat.gksphone.health'
require 'server.compat.gksphone.misc'
-- commands.lua registers gksphone's admin and self-service commands under their own names.
require 'server.compat.gksphone.commands'
-- events.lua mirrors sd-phone's first-party server lifecycle events under gksphone's event names.
require 'server.compat.gksphone.events'
-- clientsupport.lua answers the callbacks and net events the compat CLIENT half reaches across on.
require 'server.compat.gksphone.clientsupport'
