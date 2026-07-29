---@type table Pure cell-tower maths; no natives, no state, so both sides and the test harness
---can load it unchanged.
local celltowers = {}

---Best service level across every tower, 0 (nothing) to 1 (standing on a mast). Distance is
---horizontal: `range` is a flat radius and a tower's Z is documentation, not maths.
---@param x number player world X
---@param y number player world Y
---@param towers table[]|nil { tower = vector3, range = number }
---@return number level 0..1
function celltowers.level(x, y, towers)
    if type(towers) ~= 'table' then return 1.0 end

    local best, valid = 0.0, 0
    for i = 1, #towers do
        local entry = towers[i]
        local pos   = type(entry) == 'table' and entry.tower or nil
        local range = tonumber(type(entry) == 'table' and entry.range or nil)
        local px    = pos and tonumber(pos.x)
        local py    = pos and tonumber(pos.y)
        if px and py and range and range > 0 then
            valid = valid + 1
            local dx, dy = x - px, y - py
            local pct = 1.0 - (math.sqrt(dx * dx + dy * dy) / range)
            if pct > best then best = pct end
        end
    end

    -- No usable entry means the feature is not configured (or is misconfigured). Fail open: a
    -- typo in one server's config must never leave every phone on it dead.
    if valid == 0 then return 1.0 end
    return best
end

---The usable masts as a fresh table, so an export handing this out cannot be used to reach into
---the running config. Malformed entries are dropped, matching what the level maths counts.
---@param towers table[]|nil
---@return table[] masts { tower: vector3, range: number }
function celltowers.list(towers)
    local out = {}
    if type(towers) ~= 'table' then return out end
    for i = 1, #towers do
        local entry = towers[i]
        local pos   = type(entry) == 'table' and entry.tower or nil
        local range = tonumber(type(entry) == 'table' and entry.range or nil)
        if pos and range and range > 0 then
            out[#out + 1] = { tower = pos, range = range }
        end
    end
    return out
end

---Status bar bars for a level: how many ascending cutoffs it meets or exceeds.
---@param level number 0..1
---@param cutoffs number[] ascending
---@return integer bars 0..#cutoffs
function celltowers.bars(level, cutoffs)
    if type(cutoffs) ~= 'table' then return 0 end
    local n = 0
    for i = 1, #cutoffs do
        if level >= cutoffs[i] then n = i else break end
    end
    return n
end

---@type table<string, string> Capability name to its Thresholds key.
local THRESHOLD_KEY = { text = 'Text', call = 'Call', data = 'Data' }

---Whether a level clears the minimum for a capability. An unrecognised capability is permitted,
---so a caller asking about something this module does not model is never silently blocked.
---@param level number 0..1
---@param capability string 'text' | 'call' | 'data'
---@param thresholds table { Text: number, Call: number, Data: number }
---@return boolean
function celltowers.allows(level, capability, thresholds)
    local key = THRESHOLD_KEY[capability]
    if not key then return true end
    local min = tonumber(type(thresholds) == 'table' and thresholds[key] or nil)
    if not min then return true end
    return level >= min
end

return celltowers
