-- Server half of the YSeries compatibility shim: when enabled, and the real yseries is not
-- running, the domain files below register YSeries' server export names against sd-phone's modules.

local compatConvar = GetConvar('sd_phone_yseriescompat', 'true')
if compatConvar == 'false' or compatConvar == '0' then return end

---Whether a started resource named yseries is the sd-phone name-holder shim rather than the real
---product.
---@return boolean
local function isShimYseries()
    return GetResourceMetadata('yseries', 'sd_phone_shim', 0) == 'yes'
end

---Whether a REAL resource named `name` exists on this server. sd-phone holds the yseries name
---through `provide`, so a GetResourceState check alone would find itself; the resource list is
---enumerated instead.
---@param name string
---@return boolean
local function hasRealResource(name)
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == name then
            return name ~= 'yseries' or not isShimYseries()
        end
    end
    return false
end

if hasRealResource('yseries') then
    local state = GetResourceState('yseries')
    if state == 'started' or state == 'starting' then
        print('^3[sd-phone]^0 yseries compat: the real yseries resource is running, so the compat layer is NOT registering its exports. Stop or remove yseries to let sd-phone answer for it.')
        return
    end
end

---@type table Shared shim helpers (server.compat.yseries.shared): mid-session deregistration.
local shim = require 'server.compat.yseries.shared'

---Deregisters the shim's export handlers when the real yseries starts mid-session.
AddEventHandler('onResourceStart', function(resource)
    if resource ~= 'yseries' or isShimYseries() then return end
    shim.deregisterAll()
    print('^3[sd-phone]^0 yseries compat: the REAL yseries resource just started, so the compat layer deregistered its export handlers and new lookups now resolve to yseries. Only already-cached callers keep the shim\'s functions until yseries next stops.')
end)

-- Loaded for side effects: each domain file registers its slice of YSeries' server export surface
-- on require.
require 'server.compat.yseries.identify'
require 'server.compat.yseries.sim'
require 'server.compat.yseries.calls'
require 'server.compat.yseries.messages'
require 'server.compat.yseries.mail'
require 'server.compat.yseries.notifications'
require 'server.compat.yseries.groups'
require 'server.compat.yseries.ypay'
require 'server.compat.yseries.darkchat'
require 'server.compat.yseries.misc'
require 'server.compat.yseries.markets'
require 'server.compat.yseries.weather'
-- commands.lua registers YSeries' admin commands under their own names.
require 'server.compat.yseries.commands'
-- events.lua mirrors sd-phone's first-party server lifecycle events under YSeries' event names.
require 'server.compat.yseries.events'
