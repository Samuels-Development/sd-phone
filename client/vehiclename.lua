---@class VehicleModel
---@field hash    integer|nil model hash, nil when the value named nothing
---@field spawn   string|nil  lower-case spawn name, for anything keyed on the model folder
---@field display string      the label a player should read

---@type table<string, VehicleModel> Resolved models keyed by the raw value. A search page repeats
---the same handful of models, so this costs one native call per distinct model rather than per row.
---Entries are shared, so callers read them and never mutate.
local cache = {}

---Everything the phone needs about a stored vehicle model, from whatever the framework wrote.
---QBCore and QBox keep a spawn name; ESX keeps only the model HASH, and no server native turns one
---back into words - the game itself is the only lookup, which is why this is a client concern.
---@param raw any model value off a record: a spawn name, a hash, or a hash written as a string
---@return VehicleModel
local function describe(raw)
    if raw == nil or raw == '' then return { hash = nil, spawn = nil, display = '' } end

    local key = tostring(raw)
    local hit = cache[key]
    if hit then return hit end

    local hash
    if type(raw) == 'number' then
        hash = math.floor(raw)
    elseif type(raw) == 'string' then
        local numeric = tonumber(raw)
        hash = (numeric and math.floor(numeric)) or GetHashKey(raw)
    end

    -- A name the game does not know still reads better than a hash, so an unrecognised string keeps
    -- itself and an unrecognised number keeps its digits rather than becoming 'CARNOTFOUND'.
    local out = {
        hash    = hash,
        spawn   = type(raw) == 'string' and raw ~= '' and raw:lower() or nil,
        display = key,
    }

    if hash then
        local name = GetDisplayNameFromVehicleModel(hash)
        if name and name ~= '' and name ~= 'CARNOTFOUND' then
            local label = GetLabelText(name)
            out.display = (label and label ~= '' and label ~= 'NULL' and label) or name
            out.spawn   = out.spawn or name:lower()
        end
    end

    cache[key] = out
    return out
end

return describe
