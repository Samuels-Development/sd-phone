---@type table Callable module; the table returned at end of file. Shared by every export that
---accepts a callback from another resource.
local callable = {}

---Whether a value can be called. A function handed over through an export arrives as a function
---reference: a table with a __call metamethod, not a Lua function.
---@param value any
---@return boolean
function callable.is(value)
    if type(value) == 'function' then return true end
    if type(value) ~= 'table' then return false end
    local meta = getmetatable(value)
    return type(meta) == 'table' and meta.__call ~= nil
end

return callable
