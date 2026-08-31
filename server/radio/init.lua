---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Radio persistence layer (server.radio.store): prefs row + saved-channel CRUD.
local store   = require 'server.radio.store'
---@type table Authoritative radio handlers (server.radio.actions): clamping + band rules.
local actions = require 'server.radio.actions'
---@type table Player bridge (bridge.server.player): citizenid resolution for the presence budget.
local player  = require 'bridge.server.player'
---@type table Shared server helpers (server.util): rate limiting.
local util    = require 'server.util'

-- Schema bootstrap, once at boot.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('radio', err)
        return
    end
    boot.schemaReady()
end)

-- Thin delegates into server.radio.actions.
lib.callback.register('sd-phone:server:radio:get', function(src) return actions.get(src) end)
lib.callback.register('sd-phone:server:radio:save', function(src, payload) return actions.save(src, payload) end)
lib.callback.register('sd-phone:server:radio:canTune', function(src, freq) return actions.canTune(src, freq) end)
lib.callback.register('sd-phone:server:radio:saved:list', function(src) return actions.listSaved(src) end)
lib.callback.register('sd-phone:server:radio:saved:add', function(src, payload) return actions.addSaved(src, payload) end)
lib.callback.register('sd-phone:server:radio:saved:update', function(src, payload) return actions.updateSaved(src, payload) end)
lib.callback.register('sd-phone:server:radio:saved:remove', function(src, payload) return actions.removeSaved(src, payload) end)

-- Live channel presence, in memory only: the client reports its channel on every tune (0 = off,
-- never tracked).
---@type table<number, table<integer, boolean>> Members per channel: members[channel][src] = true.
local members    = {}
---@type table<integer, number> The channel each src currently occupies (nil = off).
local srcChannel = {}

---How many players currently share `channel`.
---@param channel number radio channel
---@return integer n
local function countOf(channel)
    local n, m = 0, members[channel]
    if m then for _ in pairs(m) do n = n + 1 end end
    return n
end

---Fan the live member count out to everyone on `channel`. No-op for an untracked channel.
---@param channel number radio channel
local function pushCount(channel)
    local m = members[channel]
    if not m then return end
    local n = countOf(channel)
    for src in pairs(m) do
        TriggerClientEvent('sd-phone:client:radio:count', src, { count = n })
    end
end

---Move `src` onto `channel` (0/garbage = off) and push the new counts. Re-asserting the SAME
---channel doesn't rejoin, just re-pushes the caller's live figure; emptied channel sets are pruned.
---@param src integer player server id
---@param channel any raw channel (tonumber-coerced)
local function setPresence(src, channel)
    channel = tonumber(channel) or 0
    local target = channel ~= 0 and channel or nil
    if srcChannel[src] == target then
        TriggerClientEvent('sd-phone:client:radio:count', src, { count = target and countOf(target) or 0 })
        return
    end

    local prev = srcChannel[src]
    if prev and members[prev] then
        members[prev][src] = nil
        if next(members[prev]) == nil then members[prev] = nil end
        pushCount(prev)
    end

    if target then
        srcChannel[src] = target
        members[target] = members[target] or {}
        members[target][src] = true
        pushCount(target)
    else
        srcChannel[src] = nil
        TriggerClientEvent('sd-phone:client:radio:count', src, { count = 0 })
    end
end

---@type integer Channel-change budget window in ms.
local TUNE_WINDOW = 10000
---@type integer Channel CHANGES allowed per window. Only a real change fans a count out to every
---member of two channels, and only a deliberate tune or power-off produces one, so a player
---mashing the dial stays far under this while a scripted flap is cut by three orders of magnitude.
local TUNE_PER_WINDOW = 30

---A client reported the channel it's tuned to (0 = off). Job-restricted bands are enforced here:
---a caller without the qualifying job has presence cleared and is told to force the radio off.
---@param channel any client-reported pma-voice channel number
RegisterNetEvent('sd-phone:server:radio:presence', function(channel)
    local src = source
    channel = tonumber(channel) or 0
    if channel ~= channel then channel = 0 end
    -- Budgeted on the CHANGE only: the app re-asserts its current channel on open and on every
    -- volume tick, and those must still get their count reply immediately.
    if srcChannel[src] ~= (channel ~= 0 and channel or nil)
        and not util.rateLimit(player.getIdentifier(src), 'radio:presence', TUNE_WINDOW, TUNE_PER_WINDOW) then
        return
    end
    if channel ~= 0 then
        local res = actions.canTune(src, channel / 10)
        if res and res.allowed == false then
            setPresence(src, 0)
            TriggerClientEvent('sd-phone:client:radio:forceoff', src, {
                messageKey  = res.messageKey,
                message     = res.message,
                messageVars = res.messageVars,
            })
            return
        end
    end
    setPresence(src, channel)
end)

---A departing player leaves their channel.
AddEventHandler('playerDropped', function()
    setPresence(source, 0)
end)
