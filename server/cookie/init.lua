---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Cookie persistence layer (server.cookie.store): one save row per character.
local store   = require 'server.cookie.store'
---@type table Authoritative cookie handlers (server.cookie.actions): clamping + write-behind cache.
local actions = require 'server.cookie.actions'

---@type integer Write-behind flush cadence in ms (config.Cookie.SaveInterval seconds).
local FLUSH_MS = (((config.Cookie or {}).SaveInterval) or 60) * 1000

-- Schema bootstrap, once at boot.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:cookie]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:cookie]^0 schema ready')
end)

-- Write-behind flush: batches the in-memory autosaves to the DB on a slow interval.
CreateThread(function()
    while true do
        Wait(FLUSH_MS)
        actions.flushAll()
    end
end)

---Persists a leaving player's final state immediately and frees the per-src cache keys.
AddEventHandler('playerDropped', function()
    actions.playerDropped(source)
end)

---Flushes pending saves on resource stop.
---@param res string stopping resource name
AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then actions.flushAll() end
end)

-- NUI callbacks: thin delegates into server.cookie.actions.
lib.callback.register('sd-phone:server:cookie:load', function(src) return actions.load(src) end)
lib.callback.register('sd-phone:server:cookie:save', function(src, payload) return actions.save(src, payload) end)
lib.callback.register('sd-phone:server:cookie:leaderboard', function(src) return actions.leaderboard(src) end)
lib.callback.register('sd-phone:server:cookie:nickname', function(src, payload) return actions.setNickname(src, type(payload) == 'table' and payload.nickname or nil) end)
