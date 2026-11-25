---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Cell service (client.service): live level + capability gating.
local service = require 'client.service'
---@type table Wi-Fi (client.wifi): joined network + capability gating.
local wifiClient = require 'client.wifi'

---@type table Cell tower settings (configs/celltowers.lua).
local towerCfg = type(config.CellTowers) == 'table' and config.CellTowers or {}

---@type table<string, boolean> App namespaces that work with no signal.
local OFFLINE_OK = {}
for _, name in ipairs(towerCfg.Offline or {}) do
    OFFLINE_OK[tostring(name)] = true
end

---@type table<string, boolean> '<app>:<action>' pairs that need data despite an offline namespace.
local GATED = {}
for _, name in ipairs(towerCfg.Gated or {}) do
    GATED[tostring(name)] = true
end

---Whether the phone has a data path right now, over either radio. Named against Wi-Fi explicitly
---rather than leaning on service.allows folding it in, so the gate cannot lose it by refactor.
---@return boolean
local function hasData()
    return wifiClient.provides('data') or service.allows('data')
end

---Whether a server callback may be reached right now. Every app talks to the server through
---this file, so one check covers the whole phone; namespaces in Offline are device-local, RF or
---landline and keep working in a dead zone, bar the individual actions listed in Gated.
---@param serverEvent string 'sd-phone:server:<namespace>:<action>'
---@return boolean
local function reachable(serverEvent)
    if not service.active() then return true end
    local action = serverEvent:match('^sd%-phone:server:(.+)$')
    if not action then return true end
    if GATED[action] then return hasData() end
    if OFFLINE_OK[action:match('^([^:]+)')] then return true end
    return hasData()
end

---@type table<string, boolean> Reads whose last good answer survives a dead zone.
local CACHED = {}
for _, name in ipairs(towerCfg.Cached or {}) do
    CACHED[tostring(name)] = true
end

---@type integer Most remembered answers before the oldest is dropped.
local CACHE_MAX = 80

---@type table<string, table> Last good envelope, keyed by action plus the arguments it was for.
local lastGood = {}
---@type string[] Cache keys in insertion order, so the oldest can be evicted.
local cacheOrder = {}

---Key for one read. The arguments are part of it: a profile page and a DM thread are the same
---action with different payloads, and handing one back for the other would show the wrong data.
---@param action string '<app>:<action>'
---@param payload any arguments the NUI sent
---@return string
local function cacheKey(action, payload)
    local ok, encoded = pcall(json.encode, payload)
    return action .. '|' .. ((ok and encoded) or tostring(payload))
end

---Remembers a successful read. Re-reading something moves it to the back of the queue, so a feed
---the player keeps opening is not evicted ahead of a profile they looked at once.
---@param key string
---@param res table envelope
local function remember(key, res)
    if lastGood[key] ~= nil then
        for i = 1, #cacheOrder do
            if cacheOrder[i] == key then table.remove(cacheOrder, i) break end
        end
    end

    cacheOrder[#cacheOrder + 1] = key
    if #cacheOrder > CACHE_MAX then
        local oldest = table.remove(cacheOrder, 1)
        lastGood[oldest] = nil
    end
    lastGood[key] = res
end

---@type integer Bytes a payload may carry when its action has no allowance of its own. The largest
---ordinary payloads are an MDT draft or a home layout (60 KB), a drawn signature (150 KB) and an ID
---headshot (256 KB); a megabyte clears them all.
local DEFAULT_CAP <const> = 1024 * 1024
---@type integer Room for the fields around the inline media an allowance below is sized by.
local SLACK <const> = 64 * 1024
---@type table<string, integer> Server callback -> bytes its payload may carry, for the few that carry a
---recording or drawings inline. Each matches what that server handler accepts at most, so nothing
---the server would take is refused here.
local CAPS <const> = {
    -- server/notes/actions.lua: MaxSketches sketches of at most 1 MB each, plus the body.
    ['sd-phone:server:notes:save'] = ((config.Notes or {}).MaxSketches or 12) * 1024 * 1024
        + ((config.Notes or {}).MaxBodyLength or 20000) + SLACK,
    -- server/messages/actions.lua uploadVoice: one data URL of at most VoiceMemos.MaxAudioBytes.
    ['sd-phone:server:messages:uploadVoice'] = ((config.VoiceMemos or {}).MaxAudioBytes or 8 * 1024 * 1024) + SLACK,
    -- server/voicemail/init.lua MAX_AUDIO_BYTES: one data URL of at most 8 MB.
    ['sd-phone:server:voicemail:upload'] = 8 * 1024 * 1024 + SLACK,
}
---@type integer Deepest nesting a payload may have. Nothing the phone sends goes past a handful.
local MAX_DEPTH <const> = 16

---@type integer Bytes counted so far by the walk below; reset by `fits`. Safe as an upvalue because
---the walk never yields.
local counted = 0

---Counts a value's bytes the way its JSON would roughly spend them, stopping as soon as `cap` is
---passed so an oversized payload costs no more than the cap to refuse.
---@param value any
---@param cap integer
---@param depth integer nesting level, 1 at the root
---@return boolean ok false once the count passes `cap` or the nesting passes MAX_DEPTH
local function walk(value, cap, depth)
    local kind = type(value)
    if kind == 'string' then
        counted = counted + #value + 2
    elseif kind == 'table' then
        if depth > MAX_DEPTH then return false end
        counted = counted + 2
        for key, item in pairs(value) do
            counted = counted + (type(key) == 'string' and #key + 4 or 1)
            if counted > cap or not walk(item, cap, depth + 1) then return false end
        end
    else
        counted = counted + 8
    end
    return counted <= cap
end

---Whether a NUI payload is small enough to send to a server callback. A payload rides the ordinary
---event channel, which carries it in one piece and stalls the net thread for everyone while it
---lands, so anything past what the server could accept is refused here instead.
---@param serverEvent string
---@param payload any
---@return boolean
local function fits(serverEvent, payload)
    counted = 0
    return walk(payload, CAPS[serverEvent] or DEFAULT_CAP, 1)
end

---Binds a NUI callback that forwards its payload to the matching server callback and returns the
---response envelope unchanged, falling back to a uniform failure when the server never answers. A
---payload too large for its action (`fits`) is refused without being sent.
---@param nuiAction string NUI action name the React app fetches
---@param serverEvent string server callback name to await
---@param onAccepted? fun() ran only when the server accepted the write, never on a rejection
---@param transform? fun(res: table) mutates a successful envelope before the NUI and the cache see
---it, for the few answers only a client native can complete
local function proxy(nuiAction, serverEvent, onAccepted, transform)
    ---@type string|nil '<app>:<action>', nil for anything not shaped like one
    local action = serverEvent:match('^sd%-phone:server:(.+)$')
    ---@type boolean Whether this action's answers are worth keeping.
    local cacheable = action ~= nil and CACHED[action] == true

    RegisterNUICallback(nuiAction, function(payload, cb)
        if not fits(serverEvent, payload) then
            cb({ success = false, message = 'That is too large to send' })
            return
        end

        local key = cacheable and cacheKey(action, payload) or nil

        if not reachable(serverEvent) then
            local kept = key and lastGood[key]
            if kept then
                local copy = {}
                for k, v in pairs(kept) do copy[k] = v end
                copy.cached = true
                cb(copy)
                return
            end
            cb({ success = false, message = 'No Service' })
            return
        end

        local res = lib.callback.await(serverEvent, false, payload)
        if onAccepted and type(res) == 'table' and res.success == true then onAccepted() end
        if transform and type(res) == 'table' and res.success == true then transform(res) end
        if key and type(res) == 'table' and res.success == true then remember(key, res) end
        cb(res or { success = false, message = 'No response from server' })
    end)
end

return proxy
