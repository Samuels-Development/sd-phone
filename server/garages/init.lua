---@type table Garages bridge (bridge.server.garages): cross-resource garage-system detection +
---DB normalisation into the app's vehicle shape.
local garages = require 'bridge.server.garages'
---@type table Player bridge (bridge.server.player): citizenid lookups from a server id.
local player  = require 'bridge.server.player'
---@type table Shared server helpers (server.util): onCleanup.
local util    = require 'server.util'

---@type integer Seconds a built list stays warm. garages.list reads the garage table, calls the
---active garage resource, then walks every vehicle entity on the server with a plate native each.
local LIST_TTL = 2

---@type table<string, { at: integer, data: table }> citizenid -> last built list.
local listCache = {}

util.onCleanup(function(_src, cid) if cid then listCache[cid] = nil end end)

---Drops every entry past its TTL. Each one holds a whole vehicle list, and onCleanup only gets a
---citizenid on a best-effort basis, so the cache must also be able to empty itself.
---@param now integer os.time of the call sweeping it
local function sweep(now)
    for cid, entry in pairs(listCache) do
        if (now - entry.at) >= LIST_TTL then listCache[cid] = nil end
    end
end

---Owned-vehicle list for the caller. Read-only; a disabled/undetected system degrades to an
---empty array. Repeat calls inside LIST_TTL are served from the last result.
lib.callback.register('sd-phone:server:garages:list', function(src)
    local cid = player.getRealIdentifier(src)
    local hit = cid and listCache[cid]
    if hit and (os.time() - hit.at) < LIST_TTL then return { success = true, data = hit.data } end
    sweep(os.time())

    local data = garages.list(src)
    if cid then listCache[cid] = { at = os.time(), data = data } end
    return { success = true, data = data }
end)

-- No boot print: the detected garage system is available via garages.activeSystem() when needed.
