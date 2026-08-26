---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Birdy persistence layer (server.birdy.store): the verified badge column.
local birdy = require 'server.birdy.store'
---@type table Birdy badge vocabulary (server.birdy.verify): the types the UI can actually draw.
local verify = require 'server.birdy.verify'

local registerExport, stubExport = shim.registerExport, shim.stubExport

---@type table<number, string|nil> gksphone verified level -> sd-phone badge type. 0 clears the
---badge, 1 is the blue check, and 2 is gksphone's squawk-only yellow, which sd-phone draws in gold.
local BADGES = { [1] = 'blue', [2] = 'gold' }

---ToggleVerified(app, username, verified): sets a social verified badge. `app` is 'squawk' (Birdy on
---sd-phone) or 'snapgram'; only Birdy has a badge writer, so a snapgram call reports false rather
---than silently doing nothing.
registerExport('ToggleVerified', function(app, username, verified)
    local handle = shim.text(username)
    local key = (shim.text(app) or ''):lower()
    if not handle then return false end

    if key ~= 'squawk' and key ~= 'birdy' then
        shim.warnOnce('ToggleVerified.' .. key, ("ToggleVerified only reaches Birdy on sd-phone (called by %s); '%s' has no verified badge, so nothing was changed"):format(shim.invoker(), key))
        return false
    end

    local level = tonumber(verified) or 0
    local vtype = BADGES[level]
    if level ~= 0 and not vtype then return false end
    if vtype and not verify.TYPES[vtype] then return false end

    return birdy.setVerified(handle, vtype) > 0
end)

-- Live-stream monetisation: sd-phone's Vibez has no cheer or coin economy, so there is no balance
-- to credit. Both report false rather than pretending a payment landed, which is the direction a
-- caller can safely branch on.
stubExport('AddLiveStreamCheer', false,
    'has no sd-phone equivalent: Vibez carries no cheer balance, so nothing was credited')
stubExport('AddLiveStreamCoin', false,
    'has no sd-phone equivalent: Vibez carries no coin balance, so nothing was credited')
