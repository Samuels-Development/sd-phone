---Maps a frequency (1.0-999.9) to an integer pma-voice radio channel: 12.5 -> 125. Anything
---below the 1.0 floor returns channel 0.
---@param freq number|string|nil user-facing frequency
---@return integer channel pma-voice radio channel (0 = leave the radio)
local function freqToChannel(freq)
    local f = tonumber(freq) or 0
    if f < 1.0 then return 0 end
    if f > 999.9 then f = 999.9 end
    return math.floor(f * 10 + 0.5)
end

-- Live session state, seeded from the player's saved prefs on first read. `standby` = left the
-- channel from the Dynamic Island but still shown in red for a quick rejoin.
---@type table Session radio state: { on: boolean, freq: number, volume: integer, standby: boolean }.
local state  = { on = false, freq = 1.0, volume = 50, standby = false }
---@type boolean True once the saved prefs were fetched (or the fetch failed).
local seeded = false

---Broadcasts on/off + standby + frequency to the NUI.
local function pushStatus()
    SendNUIMessage({ action = 'sd-phone:radio:status', data = { on = state.on, freq = state.freq, standby = state.standby } })
end

---Applies the session state to pma-voice (volume + channel; channel 0 when off), announces the
---channel to the server, and pushes the status to the NUI. Both exports are pcall'd.
local function applyVoice()
    local channel = state.on and freqToChannel(state.freq) or 0
    pcall(function() exports['pma-voice']:setRadioVolume(state.volume) end)
    pcall(function() exports['pma-voice']:setRadioChannel(channel) end)
    TriggerServerEvent('sd-phone:server:radio:presence', channel)
    pushStatus()
end

---Fetches the saved frequency/volume once per session; the flag is set before the await and a
---failed fetch keeps the defaults.
local function seedFromServer()
    if seeded then return end
    seeded = true
    local res = lib.callback.await('sd-phone:server:radio:get', false)
    if res and res.success and res.data then
        state.freq   = tonumber(res.data.frequency) or state.freq
        state.volume = tonumber(res.data.volume) or state.volume
    end
end

---React -> Lua: current radio state when the app opens. Seeds saved prefs on first read, clears
---standby, and re-announces the channel for a fresh head-count.
RegisterNUICallback('sd-phone:radio:get', function(_, cb)
    seedFromServer()
    if state.standby then
        state.standby = false
        pushStatus()
    end
    TriggerServerEvent('sd-phone:server:radio:presence', state.on and freqToChannel(state.freq) or 0)
    cb({ success = true, data = { on = state.on, freq = state.freq, volume = state.volume } })
end)

---React -> Lua: quick-leave from the Dynamic Island - drops the voice channel, keeps the
---frequency, and marks standby.
RegisterNUICallback('sd-phone:radio:leave', function(_, cb)
    state.on = false
    state.standby = true
    applyVoice()
    cb({ success = true })
end)

---React -> Lua: power/tune/volume changes from the app. Clamps frequency and volume, gates
---restricted bands through the server's canTune callback, clears standby, and persists.
RegisterNUICallback('sd-phone:radio:set', function(payload, cb)
    payload = payload or {}

    local newFreq = state.freq
    if payload.freq ~= nil then
        local f = tonumber(payload.freq) or state.freq
        if f < 1.0 then f = 1.0 elseif f > 999.9 then f = 999.9 end
        newFreq = math.floor(f * 10 + 0.5) / 10
    end
    local newOn = state.on
    if payload.on ~= nil then newOn = payload.on == true end

    if newOn and (payload.on == true or payload.freq ~= nil) then
        local res = lib.callback.await('sd-phone:server:radio:canTune', false, newFreq)
        if res and res.allowed == false then
            cb({ success = false, denied = true, message = res.message,
                 data = { on = state.on, freq = state.freq, volume = state.volume } })
            return
        end
    end

    state.freq    = newFreq
    state.on      = newOn
    state.standby = false
    if payload.volume ~= nil then
        local v = math.floor(tonumber(payload.volume) or state.volume)
        if v < 0 then v = 0 elseif v > 100 then v = 100 end
        state.volume = v
    end

    applyVoice()
    lib.callback('sd-phone:server:radio:save', false, function() end, { frequency = state.freq, volume = state.volume })

    cb({ success = true, data = { on = state.on, freq = state.freq, volume = state.volume } })
end)

---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Saved-channel CRUD proxies into the Radio server module.
proxy('sd-phone:radio:saved:list',   'sd-phone:server:radio:saved:list')
proxy('sd-phone:radio:saved:add',    'sd-phone:server:radio:saved:add')
proxy('sd-phone:radio:saved:update', 'sd-phone:server:radio:saved:update')
proxy('sd-phone:radio:saved:remove', 'sd-phone:server:radio:saved:remove')

---Forwards pma-voice's local transmit announcement to the NUI on-air indicator.
---@param active boolean whether the local player is transmitting
AddEventHandler('pma-voice:radioActive', function(active)
    SendNUIMessage({ action = 'sd-phone:radio:onair', data = { active = active == true } })
end)

---Forwards the server-pushed channel head-count into the NUI.
---@param data table head-count payload
RegisterNetEvent('sd-phone:client:radio:count', function(data)
    SendNUIMessage({ action = 'sd-phone:radio:count', data = data })
end)

---Server kick off a restricted band: leaves the channel locally, clears standby, and forwards
---the denial to the app.
---@param data table denial payload for the app's message
RegisterNetEvent('sd-phone:client:radio:forceoff', function(data)
    state.on = false
    state.standby = false
    pcall(function() exports['pma-voice']:setRadioChannel(0) end)
    SendNUIMessage({ action = 'sd-phone:radio:forceoff', data = data })
    pushStatus()
end)
