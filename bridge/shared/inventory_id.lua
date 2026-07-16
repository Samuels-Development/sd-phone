---@type string[] Supported inventory resources, in detection-priority order.
local CANDIDATES = {
    'ox_inventory',
    'tgiann-inventory',
    'jaksam_inventory',
    'qs-inventory',
    'qs-inventory-pro',
    'origen_inventory',
    'qb-inventory',
    'ps-inventory',
    'lj-inventory',
    'codem-inventory',
}

---Returns the first CANDIDATES inventory resource that is currently started, or nil when none
---is running.
---@return string|nil resource name, or nil if none is started.
local function detect()
    for i = 1, #CANDIDATES do
        if GetResourceState(CANDIDATES[i]) == 'started' then
            return CANDIDATES[i]
        end
    end
    return nil
end

-- Module shape: `name` is the detected resource (nil = none started), `candidates` the priority list.
return {
    name       = detect(),
    candidates = CANDIDATES,
}
