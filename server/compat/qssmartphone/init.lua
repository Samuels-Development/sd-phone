-- Server half of the qs-smartphone compatibility shim: when enabled, and the real Quasar phone is
-- not running, the domain files below register qs-smartphone's server export names against
-- sd-phone's modules. Quasar ships the same API under four resource names (qs-smartphone,
-- qs-smartphone-pro, qs-smartphone-lite and the sibling qs-base that holds GetPlayerPhone), and
-- third-party scripts call all four, so each is claimed separately.

local compatConvar = GetConvar('sd_phone_qscompat', 'true')
if compatConvar == 'false' or compatConvar == '0' then return end

---@type table Shared shim helpers (server.compat.qssmartphone.shared): the name registry and
---mid-session deregistration.
local shim = require 'server.compat.qssmartphone.shared'

---Whether a started resource of `name` is an sd-phone name-holder stub rather than a real Quasar
---product.
---@param name string
---@return boolean
local function isShimResource(name)
    return GetResourceMetadata(name, 'sd_phone_shim', 0) == 'yes'
end

---Whether a REAL resource named `name` exists on this server. sd-phone holds the Quasar names
---through `provide`, so a GetResourceState check alone would find itself; the resource list is
---enumerated instead.
---@param name string
---@return boolean
local function hasRealResource(name)
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == name then return not isShimResource(name) end
    end
    return false
end

---Whether a real resource of `name` is up, so the shim must leave that name alone.
---@param name string
---@return boolean
local function realIsRunning(name)
    if not hasRealResource(name) then return false end
    local state = GetResourceState(name)
    return state == 'started' or state == 'starting'
end

if realIsRunning('qs-smartphone') then
    print('^3[sd-phone]^0 qs-smartphone compat: the real qs-smartphone resource is running, so the compat layer is NOT registering its exports. Stop or remove qs-smartphone to let sd-phone answer for it.')
    return
end

-- Per-name claim: the pro, lite and qs-base names are separate resources a server may genuinely
-- have installed (qs-base ships with every Quasar script), so each is only answered for when no
-- real resource holds it.
for _, name in ipairs(shim.names) do
    if realIsRunning(name) then
        print(('^3[sd-phone]^0 qs-smartphone compat: the real %s resource is running, so the compat layer is NOT answering for that name.'):format(name))
    else
        shim.allow(name)
    end
end

---Hands ONE name back when the real resource holding it starts mid-session. Only that name's
---handlers are dropped: a real qs-base appearing must not take the phone's own surface with it.
AddEventHandler('onResourceStart', function(resource)
    if not shim.allows(resource) or isShimResource(resource) then return end
    shim.deregister(resource)
    print(('^3[sd-phone]^0 qs-smartphone compat: the REAL %s resource just started, so the compat layer deregistered the export handlers it held under THAT name and new lookups now resolve to it. Only already-cached callers keep the shim\'s functions until it next stops.'):format(resource))
end)

-- Loaded for side effects: each domain file registers its slice of qs-smartphone's server export
-- surface on require.
require 'server.compat.qssmartphone.identify'
require 'server.compat.qssmartphone.notifications'
require 'server.compat.qssmartphone.messages'
require 'server.compat.qssmartphone.mail'
require 'server.compat.qssmartphone.bills'
require 'server.compat.qssmartphone.marketplace'
require 'server.compat.qssmartphone.calls'
require 'server.compat.qssmartphone.customapps'
require 'server.compat.qssmartphone.misc'
-- clientsupport.lua backs the client half's reads and writes, which cannot reach a server export.
require 'server.compat.qssmartphone.clientsupport'
-- commands.lua registers qs-smartphone's own admin and player commands under their own names.
require 'server.compat.qssmartphone.commands'
-- events.lua mirrors sd-phone's first-party server events under qs-smartphone's event names, and
-- answers the inbound qs-smartphone:server:* events third-party scripts trigger.
require 'server.compat.qssmartphone.events'
