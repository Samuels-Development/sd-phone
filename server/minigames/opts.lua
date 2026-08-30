---@type table Shared server helpers (server.util): the numeric guard.
local util = require 'server.util'

---@type table Option helpers; the table returned at end of file.
local opts = {}

---Reads a number into a whole value inside a range, falling back when it is unusable.
---@param value any
---@param fallback integer
---@param low integer
---@param high integer
---@return integer
function opts.clamp(value, fallback, low, high)
    local n = tonumber(value)
    if not n or not util.finite(n) then n = fallback end
    n = math.floor(n)
    if n < low then return low end
    if n > high then return high end
    return n
end

---Draws distinct whole numbers from a range, in the order they were drawn.
---@param count integer
---@param low integer
---@param high integer
---@return integer[]
function opts.sample(count, low, high)
    local pool = {}
    for n = low, high do pool[#pool + 1] = n end

    for i = #pool, 2, -1 do
        local j = math.random(1, i)
        pool[i], pool[j] = pool[j], pool[i]
    end

    local out = {}
    for i = 1, math.min(count, #pool) do out[i] = pool[i] end
    return out
end

---Reads a submitted list into whole numbers inside a range, refusing anything outside it.
---@param raw any
---@param length integer exact number of entries expected
---@param low integer
---@param high integer
---@return integer[]?
function opts.list(raw, length, low, high)
    if type(raw) ~= 'table' then return nil end
    local out = {}
    for i = 1, length do
        local n = tonumber(raw[i])
        if not n or n ~= math.floor(n) or n < low or n > high then return nil end
        out[i] = n
    end
    if raw[length + 1] ~= nil then return nil end
    return out
end

return opts
