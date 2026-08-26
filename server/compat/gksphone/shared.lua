---@type table Shared helpers for the gksphone compat shim; the table returned at end of file.
local shim = {}

---@type table<string, boolean> Warn keys that already printed.
local warned = {}

---@type any[] AddEventHandler cookies for every registered export handler.
local cookies = {}

---Registers a function on the server export registry under the gksphone resource name via a raw
---AddEventHandler. The handler cookie is collected for later deregistration.
---
---gksphone spells its exports inconsistently (isPhoneJammed, sendNotification, stockMarketAdd all
---start lower-case while their neighbours are PascalCase), so `name` is passed through untouched
---and must match the documented spelling character for character.
---@param name string gksphone export name, cased exactly as gksphone documents it
---@param fn function implementation
function shim.registerExport(name, fn)
    cookies[#cookies + 1] = AddEventHandler(('__cfx_export_gksphone_%s'):format(name), function(setCB)
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

---The resource that reached for the export, for the warn line. 'unknown' when FiveM cannot name it.
---@return string
function shim.invoker()
    return GetInvokingResource() or 'unknown'
end

---Prints one console breadcrumb the first time `key` is hit; subsequent hits are silent.
---@param key string dedupe key (export name, or name.arg for a partially supported argument)
---@param msg string message printed after the '[sd-phone] gksphone compat:' prefix
function shim.warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(('^3[sd-phone]^0 gksphone compat: %s'):format(msg))
end

---Renders a stub's default for the warn line.
---@param v any
---@return string
local function repr(v)
    if v == nil then return 'nil' end
    if type(v) == 'table' then return json.encode(v) end
    return tostring(v)
end

---Registers a stubbed gksphone export: warns once on first call, then returns the fixed default on
---every call. `why` replaces the default 'is not supported' clause.
---@param name string gksphone export name
---@param default any fixed return value
---@param why string|nil reason clause for the warning
function shim.stubExport(name, default, why)
    shim.registerExport(name, function()
        shim.warnOnce(name, ('%s %s (called by %s), returned %s'):format(
            name, why or 'is not supported', shim.invoker(), repr(default)))
        return default
    end)
end

---Registers a stubbed export whose contract is a MULTI-value return, which several gksphone
---exports have (ok, reason, price). Every listed value is returned on every call.
---@param name string gksphone export name
---@param why string|nil reason clause for the warning
---@param ... any fixed return values, in order
function shim.stubExportMulti(name, why, ...)
    local defaults = table.pack(...)
    shim.registerExport(name, function()
        shim.warnOnce(name, ('%s %s (called by %s), returned %s'):format(
            name, why or 'is not supported', shim.invoker(), repr(defaults[1])))
        return table.unpack(defaults, 1, defaults.n)
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

---A non-empty string, or nil. Used wherever gksphone documents an opaque id or free-text label and
---a caller may hand over a number, a blank or nothing at all.
---@param v any
---@return string|nil
function shim.text(v)
    if type(v) == 'number' then v = tostring(v) end
    if type(v) ~= 'string' or v == '' then return nil end
    return v
end

---Flattens gksphone's three message payload forms to plain text. A string passes through; a
---{ x, y } table or a vector2 becomes the GPS drop those forms encode, rendered as coordinates the
---sd-phone Messages thread can show.
---@param message any string, vector2, or a coords table
---@return string|nil body
---@return boolean isLocation
function shim.messageBody(message)
    local t = type(message)
    if t == 'string' then return message, false end
    if t == 'number' then return tostring(message), false end
    if t == 'vector2' or t == 'vector3' then
        return ('%.2f, %.2f'):format(message.x, message.y), true
    end
    if t == 'table' then
        local x, y = tonumber(message.x or message[1]), tonumber(message.y or message[2])
        if x and y then return ('%.2f, %.2f'):format(x, y), true end
        if type(message.message) == 'string' then return message.message, false end
    end
    return nil, false
end

return shim
