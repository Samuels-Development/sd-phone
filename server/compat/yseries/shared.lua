---@type table Shared helpers for the YSeries compat shim; the table returned at end of file.
local shim = {}

---@type table<string, boolean> Warn keys that already printed.
local warned = {}

---@type any[] AddEventHandler cookies for every registered export handler.
local cookies = {}

---Registers a function on the server export registry under the yseries resource name via a raw
---AddEventHandler. The handler cookie is collected for later deregistration.
---@param name string PascalCase YSeries export name
---@param fn function implementation
function shim.registerExport(name, fn)
    cookies[#cookies + 1] = AddEventHandler(('__cfx_export_yseries_%s'):format(name), function(setCB)
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
---@param msg string message printed after the '[sd-phone] yseries compat:' prefix
function shim.warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(('^3[sd-phone]^0 yseries compat: %s'):format(msg))
end

---Renders a stub's default for the warn line.
---@param v any
---@return string
local function repr(v)
    if v == nil then return 'nil' end
    if type(v) == 'table' then return json.encode(v) end
    return tostring(v)
end

---Registers a stubbed YSeries export: warns once on first call, then returns the fixed default on
---every call. `why` replaces the default 'is not supported' clause.
---@param name string PascalCase YSeries export name
---@param default any fixed return value
---@param why string|nil reason clause for the warning
function shim.stubExport(name, default, why)
    shim.registerExport(name, function()
        shim.warnOnce(name, ('%s %s (called by %s), returned %s'):format(
            name, why or 'is not supported', GetInvokingResource() or 'unknown', repr(default)))
        return default
    end)
end

---Digits-only view of a phone number, so a caller's formatting never decides a lookup. Nil for a
---value carrying no digits at all.
---@param v any
---@return string|nil
function shim.digits(v)
    if type(v) == 'number' then v = ('%d'):format(v) end
    if type(v) ~= 'string' then return nil end
    local out = v:gsub('%D', '')
    return out ~= '' and out or nil
end

return shim
