---@type table Option helpers (server.minigames.opts): clamping and sampling.
local opts = require 'server.minigames.opts'

---@type table Game module; the table returned at end of file.
local intrusion = {}

---Settles the options a round runs with. A layer always keeps one clean node, so a run is never
---lost to a wall of honeypots.
---@param params table caller options already merged over the config defaults
---@return table
function intrusion.normalise(params)
    local width = opts.clamp(params.width, 3, 2, 5)
    return {
        layers = opts.clamp(params.layers, 4, 2, 8),
        width  = width,
        traps  = opts.clamp(params.traps, 1, 1, width - 1),
        probes = opts.clamp(params.probes, 3, 0, 12),
        lives  = opts.clamp(params.lives, 1, 0, 5),
        time   = opts.clamp(params.time, 40, 10, 300),
    }
end

---Salts the network with honeypots. Which nodes are poisoned stays here: the client is told only
---what a probe or a hop turned up, so the map cannot be read off the page.
---@param params table normalised options
---@return table state
---@return table puzzle
function intrusion.create(params)
    local traps = {}
    for layer = 1, params.layers do
        traps[layer] = {}
        for _, index in ipairs(opts.sample(params.traps, 1, params.width)) do
            traps[layer][index] = true
        end
    end

    return {
        traps  = traps,
        layer  = 0,
        probes = params.probes,
        burned = params.lives,
    }, { layers = params.layers, width = params.width, probes = params.probes }
end

---Judges a probe or a hop.
---@param state table round state from create
---@param params table normalised options
---@param raw any { action, index }
---@param _ integer attempt count, unused
---@return boolean resolved
---@return boolean win
---@return table? feedback
function intrusion.answer(state, params, raw, _)
    if type(raw) ~= 'table' then return false, false, nil end

    local index = tonumber(raw.index)
    if not index or index ~= math.floor(index) or index < 1 or index > params.width then
        return false, false, nil
    end

    local layer = state.layer + 1
    if layer > params.layers then return false, false, nil end
    local trapped = state.traps[layer][index] == true

    if raw.action == 'probe' then
        if state.probes <= 0 then return false, false, nil end
        state.probes = state.probes - 1
        return false, false, {
            action = 'probe',
            layer  = layer,
            index  = index,
            trap   = trapped,
            probes = state.probes,
        }
    end

    if raw.action ~= 'hop' then return false, false, nil end

    if trapped then
        state.burned = state.burned - 1
        return state.burned < 0, false, {
            action = 'hop',
            layer  = layer,
            index  = index,
            trap   = true,
            lives  = state.burned,
        }
    end

    state.layer = layer
    local win = state.layer >= params.layers

    return win, win, {
        action = 'hop',
        layer  = layer,
        index  = index,
        trap   = false,
        lives  = state.burned,
    }
end

---Every honeypot, shown once the run is over.
---@param state table
---@return table
function intrusion.reveal(state)
    local out = {}
    for layer, nodes in pairs(state.traps) do
        for index in pairs(nodes) do out[#out + 1] = (layer * 100) + index end
    end
    return out
end

return intrusion
