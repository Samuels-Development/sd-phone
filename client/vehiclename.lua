---@type table<string, string> Resolved names keyed by the raw value, so repeat lookups over a
---search page cost one native call per distinct model rather than one per row.
local cache = {}

---A vehicle's display name from whatever the framework stored against it. QBCore and QBox keep a
---spawn name, which passes straight through; ESX keeps only the model HASH, and no server native
---turns one back into a name - the game itself is the only lookup, which is why this is a client
---concern and the MDT resolves records here rather than in bridge/server/records.lua.
---@param raw any model value off a record: a spawn name, a hash, or a hash as a string
---@return string display name, or the value unchanged when the game does not know the model
local function resolve(raw)
    if raw == nil or raw == '' then return '' end

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

    local out = key
    if hash then
        local display = GetDisplayNameFromVehicleModel(hash)
        if display and display ~= '' and display ~= 'CARNOTFOUND' then
            local label = GetLabelText(display)
            out = (label and label ~= '' and label ~= 'NULL' and label) or display
        end
    end

    cache[key] = out
    return out
end

return resolve
