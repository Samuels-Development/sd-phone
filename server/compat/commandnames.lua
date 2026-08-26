---@type table Command-name arbitration shared by the phone compat shims; the table returned at end
---of file. Several shims answer for phones that ship commands of the same name, and every shim
---registers inside the SAME resource, where the last RegisterCommand for a name silently wins.
local names = {}

---@type table<string, string> lowercased command name -> the shim that claimed it. FiveM matches
---command names case-insensitively, so two spellings of one name are one name.
local claimed = {}

---Claims a command name for a shim. False when another shim already holds it, in which case the
---caller must not register: the winner would otherwise depend on require order.
---@param shim string owning shim key, for the breadcrumb
---@param name string command name
---@return boolean ok
function names.claim(shim, name)
    if type(name) ~= 'string' or name == '' then return false end
    local key = name:lower()
    local holder = claimed[key]
    if holder then
        if holder ~= shim then
            print(('^3[sd-phone]^0 %s compat: /%s is already provided by the %s shim, so it was not registered twice.'):format(shim, name, holder))
        end
        return false
    end
    claimed[key] = shim
    return true
end

return names
