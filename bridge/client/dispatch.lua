---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt or {}
---@type table Ingest config (configs/mdt.lua Dispatch.Ingest): the switches this relay obeys too.
local IN = (MDT.Dispatch or {}).Ingest or {}
---@type table<string, boolean> Per-system switches; a system runs unless it is explicitly false.
local SYSTEMS = type(IN.Systems) == 'table' and IN.Systems or {}
---@type boolean Whether the relay runs at all.
local ENABLED = MDT.Enabled == true and IN.Enabled ~= false and SYSTEMS['aty_dispatchv2'] ~= false
---@type integer Milliseconds this client refuses to relay the same alert again for. The server
---deduplicates across players; this only stops one client sending the same alert twice.
local REPEAT_MS = 5000

---@type string|nil Signature of the last alert relayed from this client.
local lastKey
---@type integer GetGameTimer() it was relayed at.
local lastAt = 0

-- aty_dispatchv2 announces an alert to CLIENTS rather than through a server event, so a server-side
-- handler never sees one. The relay is deliberately dumb: the payload is forwarded untouched and the
-- server treats it as untrusted, because on this path it is - it has crossed a client.
if ENABLED then
    ---Forwards one alert this client received, at most once per REPEAT_MS for the same alert. The
    ---server refuses a payload whose coordinates are nowhere near this player, so the payload goes
    ---over untouched rather than being repaired here.
    ---@param data any raw aty_dispatchv2 dispatch payload
    ---@return nil
    RegisterNetEvent('aty_dispatchv2:client:sendDispatch', function(data)
        if type(data) ~= 'table' then return end

        -- The server refuses a relayed alert whose coordinates are not near the player relaying it,
        -- and refuses one carrying no usable coordinates at all: that range check is the only thing
        -- tying a relayed alert to the player who relayed it, so a payload with nothing to check is
        -- no more trustworthy than one from the other side of the map. Checked here as well so an
        -- alert that cannot pass costs neither a round trip nor this client's own gap below.
        local at = data.coords
        local shape = type(at)
        if shape ~= 'table' and shape ~= 'vector3' and shape ~= 'vector4' then return end
        if not tonumber(at.x or at[1]) or not tonumber(at.y or at[2]) then return end

        local key = ('%s|%s'):format(tostring(data.title), tostring(data.code))
        local now = GetGameTimer()
        if key == lastKey and (now - lastAt) < REPEAT_MS then return end
        lastKey, lastAt = key, now

        TriggerServerEvent('sd-phone:server:mdt:dispatchRelay', 'aty_dispatchv2', data)
    end)
end
