---@type table Shared helpers for the lb-tablet compat shim; the table returned at end of file.
local shim = {}

---@type table<string, boolean> Warn keys that already printed.
local warned = {}

---@type any[] AddEventHandler cookies for every registered export handler.
local cookies = {}

---Registers a function on the server export registry under lb-tablet's resource name via a raw
---AddEventHandler. The handler cookie is collected for later deregistration.
---@param name string PascalCase lb-tablet export name
---@param fn function implementation
function shim.registerLbExport(name, fn)
    cookies[#cookies + 1] = AddEventHandler(('__cfx_export_lb-tablet_%s'):format(name), function(setCB)
        setCB(fn)
    end)
end

---Removes every export handler the shim registered. Idempotent.
function shim.deregisterAll()
    for i = 1, #cookies do
        RemoveEventHandler(cookies[i])
    end
    cookies = {}
end

---Prints one console breadcrumb the first time `key` is hit; subsequent hits are silent.
---@param key string dedupe key (export name, or name.arg for a partially supported argument)
---@param msg string message printed after the '[sd-phone] lb-tablet compat:' prefix
function shim.warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(('^3[sd-phone]^0 lb-tablet compat: %s'):format(msg))
end

return shim
