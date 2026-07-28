---@type table Main config (configs.config).
local config = require 'configs.config'
---@type table Pure battery arithmetic (client.battery_tick).
local tick = require 'client.battery_tick'

local battery = {}

---@type table Live client state; authoritative while connected.
local state = { level = 100, charging = false, lowPower = false, open = false, ready = false }

---@type number Seconds elapsed since the last checkpoint push.
local sinceFlush = 0

---True while the feature is switched on.
---@return boolean
local function enabled()
    return config.Battery ~= nil and config.Battery.Enabled == true
end

---Mirrors the current state into the React app.
local function push()
    SendNUIMessage({
        action = 'sd-phone:battery',
        data   = {
            level    = state.level,
            charging = state.charging,
            lowPower = state.lowPower,
            enabled  = enabled(),
        },
    })
end

---Reports the simulated level up to the server so it can be persisted.
local function checkpoint()
    if not enabled() or not state.ready then return end
    sinceFlush = 0
    TriggerServerEvent('sd-phone:server:battery:checkpoint', state.level, state.charging, state.lowPower)
end

---Pulls the stored level. The NUI mounts before the character exists, so this runs on the
---character-loaded signal rather than at resource start.
---@return boolean hydrated
function battery.hydrate()
    if not enabled() then return false end

    local stored = lib.callback.await('sd-phone:server:battery:get', false)
    if not stored or not stored.enabled then return false end

    state.level    = stored.level
    state.charging = stored.charging == true
    state.lowPower = stored.lowPower == true
    state.ready    = true
    push()
    return true
end

---@return integer level 0-100
function battery.level() return enabled() and state.level or 100 end

---@return boolean
function battery.isCharging() return enabled() and state.charging or false end

---@return boolean
function battery.isDead() return enabled() and state.level <= 0 or false end

---Tracks phone visibility so the tick can pick the open or closed drain rate.
---@param open boolean
function battery.setOpen(open)
    state.open = open == true
    if not state.open then checkpoint() end
    if state.open and not state.ready then battery.hydrate() end
end

---@param pct number 0-100
function battery.setLevel(pct)
    if not enabled() then return end

    local next = math.max(0, math.min(100, math.floor(tonumber(pct) or 0)))
    local prev = state.level
    state.level = next
    push()
    checkpoint()

    if next <= 0 and prev > 0 then TriggerEvent('lb-phone:phoneDied') end
end

---@param charging boolean
function battery.setCharging(charging)
    if not enabled() then return end
    state.charging = charging == true
    push()
    checkpoint()
end

---@param low boolean
function battery.setLowPower(low)
    if not enabled() then return end
    state.lowPower = low == true
    push()
    checkpoint()
end

RegisterNetEvent('sd-phone:client:battery:set', function(level, charging, lowPower)
    state.level    = math.max(0, math.min(100, math.floor(tonumber(level) or 100)))
    state.charging = charging == true
    state.lowPower = lowPower == true
    state.ready    = true
    push()
end)

RegisterNetEvent('sd-phone:client:battery:charging', function(charging)
    state.charging = charging == true
    push()
end)

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function() battery.hydrate() end)
RegisterNetEvent('esx:playerLoaded', function() battery.hydrate() end)

RegisterNUICallback('sd-phone:battery:lowPower', function(data, cb)
    battery.setLowPower(data and data.enabled == true)
    cb({ ok = true })
end)

CreateThread(function()
    if not enabled() then return end

    -- A player who was already spawned when the resource restarted never fires the loaded
    -- event, so try once on boot and let the event handler cover a fresh join.
    Wait(2000)
    if not state.ready then battery.hydrate() end

    while true do
        if not state.ready then
            Wait(5000)
        else
            local secs = tick.stepSeconds(state)
            if not secs then
                Wait(1000)
                sinceFlush = sinceFlush + 1
            else
                Wait(secs * 1000)
                sinceFlush = sinceFlush + secs

                local prev = state.level
                if state.charging then
                    state.level = math.min(100, state.level + 1)
                else
                    state.level = math.max(0, state.level - 1)
                end

                if state.level ~= prev then
                    push()

                    local threshold = tick.crossed(prev, state.level)
                    if threshold then
                        checkpoint()
                        SendNUIMessage({ action = 'sd-phone:battery:warn', data = threshold })
                    end
                    if state.level <= 0 and prev > 0 then
                        checkpoint()
                        TriggerEvent('lb-phone:phoneDied')
                    end
                    if state.level >= 100 and prev < 100 then checkpoint() end
                end
            end

            if sinceFlush >= (config.Battery.FlushSeconds or 300) then checkpoint() end
        end
    end
end)

---Client export: current battery level, 0-100. Reads 100 while the system is disabled.
---@return integer level
exports('getBattery', function() return battery.level() end)

---Client export: sets an absolute battery level.
---@param pct number 0-100
exports('setBattery', function(pct) battery.setLevel(pct) end)

---Client export: true while the phone is charging.
---@return boolean
exports('isCharging', function() return battery.isCharging() end)

---Client export: latches charging on or off. The caller owns both edges.
---@param charging boolean
exports('toggleCharging', function(charging) battery.setCharging(charging) end)

---Client export: true once the battery has reached zero.
---@return boolean
exports('isPhoneDead', function() return battery.isDead() end)

return battery
