---@type string Resource name both vRP lineages ship under; there is no vrp2/vrp_v2 convention.
local VRP_RESOURCE = 'vrp'

---@type string Marker only vRP 2 (and the byte-identical community fork) ships. It is listed in
---vRP 2's own files{} block, so the probe resolves client-side as well as server-side.
local V2_MARKER = 'vRPShared.lua'

---@type string Marker only vRP 1 ships; vRP 2 dropped it. Also inside vRP 1's files{} block.
local V1_MARKER = 'lib/Tools.lua'

---@type table<string, true> GetResourceState answers meaning the resource is not installed at all.
---Every other answer ('started', 'stopped', 'starting', ...) means the folder is on disk.
local ABSENT_STATES = { missing = true, unknown = true }

---@type table vRP adapter config (configs/vrp.lua). This module is its sole owner and loads it
---defensively: an admin upgrading sd-phone copies their existing configs/ folder over the release,
---so the file is routinely absent. An unguarded require would raise on the critical path of
---bridge/server/init.lua and take the whole server half of the resource down.
local cfg = (function()
    local ok, loaded = pcall(require, 'configs.vrp')
    if ok and type(loaded) == 'table' then return loaded end
    return {}
end)()

---True when `path` exists inside the vrp resource. Guarded because LoadResourceFile raises on a
---malformed resource name and is simply absent from a plain-Lua test harness; either way the
---answer we want is "cannot confirm", not a raise.
---@param path string resource-relative path, e.g. 'lib/Tools.lua'
---@return boolean
local function vrpFileExists(path)
    local ok, code = pcall(LoadResourceFile, VRP_RESOURCE, path)
    return ok and type(code) == 'string' and #code > 0
end

---True when the vrp resource folder exists, regardless of whether it has started yet. Only the
---resource state can answer this for a fork that renamed both marker files, and only the marker
---files can answer it where GetResourceState is unavailable, so either signal alone counts.
---@param markerSeen boolean whether a lineage marker file was already resolved
---@return boolean
local function vrpInstalled(markerSeen)
    if markerSeen then return true end
    local ok, state = pcall(GetResourceState, VRP_RESOURCE)
    return ok and type(state) == 'string' and not ABSENT_STATES[state]
end

---@class VrpVersion
---@field present boolean False on a QBox/QBCore/ESX server, where nothing vRP-shaped exists.
---@field major 1|2|nil Detected lineage; nil when `present` is false, so the `major ~= 2` guards
---that gate the vRP 2 injection thread read correctly on a non-vRP server.
---@field source 'probe'|'config'|'none' Where `major` came from.
---@field cfg table configs/vrp.lua, or an empty table when that file is absent.

---Which vRP lineage is running. Structural, not behavioural: a behavioural probe cannot work,
---because both lineages REPLY to an unknown proxy member (vRP 2 with an empty pack after printing
---"proxy call vRP:getUserId not found"), so both answer nil and are indistinguishable. It is also
---synchronous and side-agnostic, which an RPC probe from a shared script could never be.
---An unrecognised fork defaults to 2: a vRP 2 fork that renamed vRPShared.lua still has loadScript
---and the injection handshake self-verifies, so a wrong guess there degrades loudly instead of
---sending proxy calls that silently return nil forever.
---@return VrpVersion
local function detect()
    local v2 = vrpFileExists(V2_MARKER)
    local v1 = not v2 and vrpFileExists(V1_MARKER)

    if not vrpInstalled(v2 or v1) then
        return { present = false, major = nil, source = 'none', cfg = cfg }
    end

    local forced = cfg.Version
    if forced == 1 or forced == 2 then
        return { present = true, major = forced, source = 'config', cfg = cfg }
    end
    if v2 then return { present = true, major = 2, source = 'probe', cfg = cfg } end
    if v1 then return { present = true, major = 1, source = 'probe', cfg = cfg } end
    return { present = true, major = 2, source = 'probe', cfg = cfg }
end

---@type VrpVersion Detection result, resolved once at module load.
local info = detect()

if info.present then
    print(('^2[SD-PHONE]^0 vRP lineage: ^3major %s^0 (source: %s)'):format(info.major, info.source))
end

return info
