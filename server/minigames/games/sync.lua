---@type table Option helpers (server.minigames.opts): clamping.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local sync = {}

---@type integer Milliseconds past the server's own clock a reported tap may sit before it is
---refused outright. The marker is drawn on the client, so the moment of the tap is the client's to
---report; this only stops a tap being placed in a round that has not run that long.
local SANITY_MS = 1000

---@type number Narrowest the window is allowed to get, as a fraction of the track.
local MIN_WINDOW = 0.05

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function sync.normalise(params)
    return {
        hits   = opts.clamp(params.hits, 3, 1, 8),
        period = opts.clamp(params.period, 1600, 500, 5000),
        window = opts.clamp(params.window, 18, 4, 50),
        shrink = opts.clamp(params.shrink, 74, 40, 100),
        time   = opts.clamp(params.time, 20, 10, 300),
    }
end

---Places each window along the track. The client has to draw these, so they travel with the round;
---what the client cannot fake is when the marker was actually over one.
---@param params table normalised options
---@return table state
---@return table puzzle
function sync.create(params)
    local centers = {}
    for i = 1, params.hits do centers[i] = math.random(20, 80) / 100 end

    return { centers = centers, hits = 0 }, {
        centers = centers,
        period  = params.period,
        window  = params.window,
        shrink  = params.shrink,
    }
end

---Where the marker sits on the track at a given moment, sweeping out and back.
---@param elapsedMs number
---@param period integer
---@return number 0..1
local function markerAt(elapsedMs, period)
    local phase = (elapsedMs % period) / period
    return phase < 0.5 and phase * 2 or 2 - (phase * 2)
end

---How wide the window is on a given hit, after every shrink so far.
---@param params table
---@param index integer
---@return number fraction of the track
local function widthFor(params, index)
    local width = params.window / 100
    for _ = 2, index do width = width * (params.shrink / 100) end
    return math.max(MIN_WINDOW, width)
end

---Judges one tap.
---@param state table round state from create
---@param params table normalised options
---@param raw any { at } the player's own elapsed milliseconds
---@param _ integer attempt count, unused
---@param elapsed integer milliseconds the server has had the round open
---@return boolean resolved
---@return boolean win
---@return table? feedback
function sync.answer(state, params, raw, _, elapsed)
    if type(raw) ~= 'table' then return false, false, nil end

    local at = tonumber(raw.at)
    if not at or at < 0 or at > elapsed + SANITY_MS then return false, false, nil end

    local index = state.hits + 1
    local center = state.centers[index]
    if not center then return false, false, nil end

    local position = markerAt(at, params.period)
    local caught = math.abs(position - center) <= (widthFor(params, index) / 2)

    if caught then state.hits = state.hits + 1 end
    local win = state.hits >= params.hits

    return win or not caught, win, {
        index    = index,
        position = position,
        caught   = caught,
        hits     = state.hits,
    }
end

return sync
