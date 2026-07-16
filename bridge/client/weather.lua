---@type table Weather app config (configs/weather.lua): Enabled toggle, System pin, Resources detection list.
local W = require 'configs.weather'

---@type table<number, string> Reverse lookup: GTA weather-type joaat hash -> the readable code the app understands.
local HASHES = {
    [`EXTRASUNNY`] = 'EXTRASUNNY', [`CLEAR`]     = 'CLEAR',     [`NEUTRAL`]   = 'NEUTRAL',
    [`SMOG`]       = 'SMOG',       [`FOGGY`]     = 'FOGGY',     [`OVERCAST`]  = 'OVERCAST',
    [`CLOUDS`]     = 'CLOUDS',     [`CLEARING`]  = 'CLEARING',  [`RAIN`]      = 'RAIN',
    [`THUNDER`]    = 'THUNDER',    [`SNOWLIGHT`] = 'SNOWLIGHT', [`SNOW`]      = 'SNOW',
    [`BLIZZARD`]   = 'BLIZZARD',   [`XMAS`]      = 'XMAS',      [`HALLOWEEN`] = 'HALLOWEEN',
}

---The weathersync resource to bridge: the configured pin when W.System names one, else the first
---started entry of W.Resources. Nil when the feature is disabled or no supported sync is running.
---@return string|nil
local function detect()
    if not W.Enabled then return nil end
    if W.System and W.System ~= 'auto' then return W.System end
    for _, name in ipairs(W.Resources or {}) do
        if GetResourceState(name) == 'started' then return name end
    end
    return nil
end

---@type string|nil Detected weathersync resource, resolved once at require time (syncs don't change at runtime).
local ACTIVE = detect()

---@type table Weather module; the table returned at end of file. One API over the supported
---weathersyncs (Renewed-Weathersync, qb-weathersync): a live weather/time snapshot plus a
---change subscription.
local weather = {}

---Detected weathersync resource name, or nil (running on game natives alone). Read-only.
---@return string|nil
function weather.activeSystem() return ACTIVE end

---@param h number GTA weather-type hash
---@return string readable weather code ('CLEAR' when unmapped)
local function hashToCode(h) return HASHES[h] or 'CLEAR' end

---Live snapshot: current + next weather codes and the in-game time. Reads the active sync's
---state where exposed, else the GTA natives. Read-only.
---@return { current: string, next: string, time: { hour: integer, minute: integer } }
function weather.read()
    local cur

    if ACTIVE == 'Renewed-Weathersync' then
        local g = GlobalState.weather
        if type(g) == 'table' then cur = g.weather end
    end
    cur = cur or hashToCode(GetPrevWeatherTypeHashName())
    local nxt = hashToCode(GetNextWeatherTypeHashName())

    local hour, minute
    if ACTIVE == 'Renewed-Weathersync' then
        local t = GlobalState.currentTime
        if type(t) == 'table' then hour, minute = t.hour, t.minute end
    end
    hour   = hour   or GetClockHours()
    minute = minute or GetClockMinutes()

    return { current = cur, next = nxt, time = { hour = hour or 0, minute = minute or 0 } }
end

---Calls `cb` whenever the weather flips, via the active sync's change signal. A no-op when no
---sync is detected; repeated calls stack handlers.
---@param cb fun()
function weather.onChange(cb)
    if ACTIVE == 'Renewed-Weathersync' then
        AddStateBagChangeHandler('weather', 'global', function() cb() end)
    elseif ACTIVE == 'qb-weathersync' then
        RegisterNetEvent('qb-weathersync:client:SyncWeather', function() cb() end)
    end
end

return weather
