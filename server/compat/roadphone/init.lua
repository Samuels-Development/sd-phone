-- Server half of the RoadPhone compatibility shim: when enabled, and the real roadphone is not
-- running, the domain files below register RoadPhone's server export names against sd-phone's
-- modules. RoadPhone and RoadPhone Pro ship under the same resource name, so this one shim answers
-- for both and registers the union of their two export surfaces.

local compatConvar = GetConvar('sd_phone_roadphonecompat', 'true')
if compatConvar == 'false' or compatConvar == '0' then return end

---Whether a started resource named roadphone is the sd-phone name-holder shim rather than the real
---product.
---@return boolean
local function isShimRoadphone()
    return GetResourceMetadata('roadphone', 'sd_phone_shim', 0) == 'yes'
end

---Whether a REAL resource named `name` exists on this server. sd-phone holds the roadphone name
---through `provide`, so a GetResourceState check alone would find itself; the resource list is
---enumerated instead.
---@param name string
---@return boolean
local function hasRealResource(name)
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == name then
            return name ~= 'roadphone' or not isShimRoadphone()
        end
    end
    return false
end

if hasRealResource('roadphone') then
    local state = GetResourceState('roadphone')
    if state == 'started' or state == 'starting' then
        print('^3[sd-phone]^0 roadphone compat: the real roadphone resource is running, so the compat layer is NOT registering its exports. Stop or remove roadphone to let sd-phone answer for it.')
        return
    end
end

---@type table Shared shim helpers (server.compat.roadphone.shared): mid-session deregistration.
local shim = require 'server.compat.roadphone.shared'

---Deregisters the shim's export handlers when the real roadphone starts mid-session.
AddEventHandler('onResourceStart', function(resource)
    if resource ~= 'roadphone' or isShimRoadphone() then return end
    shim.deregisterAll()
    print('^3[sd-phone]^0 roadphone compat: the REAL roadphone resource just started, so the compat layer deregistered its export handlers and new lookups now resolve to roadphone. Only already-cached callers keep the shim\'s functions until roadphone next stops.')
end)

-- Loaded for side effects: each domain file registers its slice of RoadPhone's server export
-- surface on require.
require 'server.compat.roadphone.identify'
require 'server.compat.roadphone.notifications'
require 'server.compat.roadphone.messages'
require 'server.compat.roadphone.mail'
require 'server.compat.roadphone.dispatch'
require 'server.compat.roadphone.maps'
require 'server.compat.roadphone.bank'
require 'server.compat.roadphone.social'
require 'server.compat.roadphone.health'
require 'server.compat.roadphone.battery'
require 'server.compat.roadphone.darkchat'
require 'server.compat.roadphone.calls'
require 'server.compat.roadphone.sim'
require 'server.compat.roadphone.metadata'
require 'server.compat.roadphone.contacts'
require 'server.compat.roadphone.notes'
require 'server.compat.roadphone.organiser'
require 'server.compat.roadphone.photos'
require 'server.compat.roadphone.alarms'
require 'server.compat.roadphone.accounts'
-- clientsupport.lua backs the client half's reads and writes, which cannot reach a server export.
require 'server.compat.roadphone.clientsupport'
-- commands.lua registers RoadPhone's own console and chat commands under their own names.
require 'server.compat.roadphone.commands'
-- events.lua mirrors sd-phone's first-party server lifecycle events under RoadPhone's event names.
require 'server.compat.roadphone.events'
