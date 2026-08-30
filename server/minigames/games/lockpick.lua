---@type table Option helpers (server.minigames.opts): clamping.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local lockpick = {}

---@type number[] Distance thresholds, as a share of the barrel, for each feel the pick gives back.
local FEEL = { 0.05, 0.12, 0.24 }

---Settles the options a round runs with.
---@param params table caller options already merged over the config defaults
---@return table
function lockpick.normalise(params)
    return {
        pins      = opts.clamp(params.pins, 3, 1, 6),
        tolerance = opts.clamp(params.tolerance, 5, 1, 25),
        breaks    = opts.clamp(params.breaks, 3, 0, 10),
        time      = opts.clamp(params.time, 40, 10, 300),
    }
end

---Sets where each pin gives. The barrel positions stay here: the pick only ever reports how close
---the last turn felt, which is what a real pick tells you.
---@param params table normalised options
---@return table state
---@return table puzzle
function lockpick.create(params)
    local pins = {}
    for i = 1, params.pins do pins[i] = math.random(6, 94) end

    return { pins = pins, set = 0, broken = 0 }, { pins = params.pins }
end

---How close a turn felt, from 0 (nothing) up to one below a set pin.
---@param distance number
---@return integer
local function feelFor(distance)
    for level = 1, #FEEL do
        if distance <= 100 * FEEL[level] then return #FEEL + 1 - level end
    end
    return 0
end

---Judges one turn of the pick.
---@param state table round state from create
---@param params table normalised options
---@param raw any the barrel position the player tried
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function lockpick.answer(state, params, raw, _)
    local value = tonumber(raw)
    if not value or value ~= math.floor(value) or value < 0 or value > 100 then
        return false, false, nil
    end

    local index = state.set + 1
    local target = state.pins[index]
    if not target then return false, false, nil end

    local distance = math.abs(value - target)
    local caught = distance <= params.tolerance

    if caught then
        state.set = state.set + 1
    else
        state.broken = state.broken + 1
    end

    local win = state.set >= params.pins
    local snapped = state.broken > params.breaks

    return win or snapped, win, {
        pin    = index,
        value  = value,
        set    = state.set,
        feel   = caught and (#FEEL + 1) or feelFor(distance),
        above  = value > target,
        broken = state.broken,
    }
end

---Where every pin gave, shown once the lock is done with.
---@param state table
---@return integer[]
function lockpick.reveal(state)
    return state.pins
end

return lockpick
