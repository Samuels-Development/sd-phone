---AirShare a song or playlist to a nearby phone. Thin forward into server/music.
RegisterNUICallback('sd-phone:music:share', function(payload, cb)
    cb(lib.callback.await('sd-phone:server:music:share', false, payload) or { success = false, message = 'No response from server' })
end)

-- ── external now playing ─────────────────────────────────────────────────────
-- Lets a third-party resource with its own audio engine (not the built-in Music app) drive the
-- Control Center card, the dynamic-island mini-player and the Now Playing widget, exactly like
-- Music does. Only one provider holds the slot at a time — the most recent `setExternalNowPlaying`
-- call wins outright, no queueing or priority.

---@type table<string, fun(action: string, value: number?)> appId -> action callback
local nowPlayingProviders = {}

---@type string? appId currently holding the Now Playing slot, so a stale `clear` from a provider
---that already lost it to a newer one is a no-op rather than wiping the newer card.
local activeProvider = nil

---@param appId string identifies the calling resource's app, e.g. its custom-app id
---@param track table { title, artist?, thumb?, playing, position, duration, canNext?, canPrev? }
---@param onAction fun(action: 'toggle'|'next'|'prev'|'seek', value: number?) called for taps on
---the card/island/widget this pushes to; `action == 'seek'` carries the target position as `value`
exports('setExternalNowPlaying', function(appId, track, onAction)
    if type(appId) ~= 'string' or appId == '' or type(track) ~= 'table' then return false end
    activeProvider = appId
    nowPlayingProviders[appId] = onAction
    SendNUIMessage({ action = 'sd-phone:nowPlaying:set', data = { appId = appId, track = track } })
    return true
end)

---@param appId string must match the appId passed to setExternalNowPlaying
exports('clearExternalNowPlaying', function(appId)
    if type(appId) ~= 'string' then return end
    nowPlayingProviders[appId] = nil
    if activeProvider == appId then activeProvider = nil end
    SendNUIMessage({ action = 'sd-phone:nowPlaying:clear', data = { appId = appId } })
end)

RegisterNUICallback('sd-phone:nowPlaying:action', function(data, cb)
    local onAction = data and nowPlayingProviders[data.appId]
    if onAction then
        local ok = pcall(onAction, data.action, data.value)
        if not ok then
            lib.print.debug(('external now playing: %s\'s onAction errored on %s'):format(data.appId, tostring(data.action)))
        end
    end
    cb('ok')
end)

---Server push: a song / playlist shared to us was accepted server-side. Hands it to the NUI
---and surfaces a notification.
---@param data table { kind: 'track'|'playlist', ... } from server/music/init.lua
RegisterNetEvent('sd-phone:client:music:receive', function(data)
    SendNUIMessage({ action = 'sd-phone:music:receive', data = data })
    SendNUIMessage({ action = 'sd-phone:notification', data = {
        app   = 'music',
        title = 'Music',
        body  = (data and data.kind == 'playlist')
            and 'A playlist was added to your library.'
            or  'A song was added to your library.',
    } })
end)
