---@type table Shared helpers for the qs-smartphone compat shim; the table returned at end of file.
local shim = {}

---@type string[] Every resource name Quasar's phone line answers on. qs-base is the sibling that
---holds the legacy GetPlayerPhone export, and the pro/lite names are separate products whose
---callers reach for them by name rather than through qs-smartphone.
shim.names = { 'qs-smartphone', 'qs-smartphone-pro', 'qs-smartphone-lite', 'qs-base' }

---@type string[] Every phone product's own name. An unqualified registration lands on all three:
---PRO and Lite ship the same phone under their own folder names, and a caller picks the name from
---whichever folder it saw, so a surface answering on only one of them is unreachable from the rest.
local PHONES <const> = { 'qs-smartphone', 'qs-smartphone-pro', 'qs-smartphone-lite' }

---@type string[] The names PRO's own surface answers on. PRO is routinely installed in a folder
---still called qs-smartphone and its own docs write exports['qs-smartphone'], so both are claimed.
local PRO <const> = { 'qs-smartphone', 'qs-smartphone-pro' }

---@type table<string, boolean> Resource names this shim may answer for. init.lua fills it after the
---real-resource sweep, so a name a genuine Quasar resource still holds is never shadowed.
local allowed = {}

---@type table<string, boolean> Warn keys that already printed.
local warned = {}

---@type table<string, any[]> AddEventHandler cookies per resource name, so a real Quasar resource
---starting mid-session takes back its own name and leaves the shim answering for the others.
local cookies = {}

---@type table<string, boolean> Resource + name pairs already registered. A name mirrored onto the
---same resource twice keeps its FIRST implementation, which is how the V3 spelling of a shared name
---stays in front of the PRO spelling (sendPhoneNotification, SendNewMessageFromApp).
local taken = {}

---Marks a resource name as free for the shim to answer on.
---@param resource string
function shim.allow(resource)
    allowed[resource] = true
end

---Whether the shim currently holds a resource name.
---@param resource string
---@return boolean
function shim.allows(resource)
    return allowed[resource] == true
end

---Registers a function on the server export registry under `resource` via a raw AddEventHandler.
---The handler cookie is collected for later deregistration; a name the shim does not hold is
---skipped so a real Quasar resource keeps answering for itself.
---@param resource string resource name the export is published under
---@param name string export name
---@param fn function implementation
function shim.registerOn(resource, name, fn)
    if not allowed[resource] then return end

    local key = resource .. '\0' .. name
    if taken[key] then return end
    taken[key] = true

    local list = cookies[resource]
    if not list then
        list = {}
        cookies[resource] = list
    end
    list[#list + 1] = AddEventHandler(('__cfx_export_%s_%s'):format(resource, name), function(setCB)
        setCB(fn)
    end)
end

---Registers one implementation under `name` on several resource names at once.
---@param resources string[] resource names the export is published under
---@param name string export name
---@param fn function implementation
local function registerMany(resources, name, fn)
    for i = 1, #resources do shim.registerOn(resources[i], name, fn) end
end

---Registers an export on every phone product's name, which is where the V3 and legacy lines both
---publish it.
---@param name string export name
---@param fn function implementation
function shim.registerExport(name, fn)
    registerMany(PHONES, name, fn)
end

---Registers a PRO export, on the PRO name and on qs-smartphone, the folder name PRO ships in.
---@param name string export name
---@param fn function implementation
function shim.registerPro(name, fn)
    registerMany(PRO, name, fn)
end

---Removes the export handlers registered under ONE resource name and stops answering for it, so a
---real Quasar resource starting mid-session takes back only the name it holds. Idempotent.
---@param resource string
function shim.deregister(resource)
    allowed[resource] = false
    local list = cookies[resource]
    if not list then return end
    for i = 1, #list do RemoveEventHandler(list[i]) end
    cookies[resource] = nil
end

---Prints one console breadcrumb the first time `key` is hit; subsequent hits are silent.
---@param key string dedupe key (export name, or name.arg for a partially supported argument)
---@param msg string message printed after the '[sd-phone] qs-smartphone compat:' prefix
function shim.warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(('^3[sd-phone]^0 qs-smartphone compat: %s'):format(msg))
end

---Renders a stub's default for the warn line.
---@param v any
---@return string
local function repr(v)
    if v == nil then return 'nil' end
    if type(v) == 'table' then return json.encode(v) end
    return tostring(v)
end

---Registers a stubbed export on `resource`: warns once on first call, then returns the fixed
---default on every call. `why` replaces the default 'is not supported' clause.
---@param resource string resource name the export is published under
---@param name string export name
---@param default any fixed return value
---@param why string|nil reason clause for the warning
function shim.stubOn(resource, name, default, why)
    shim.registerOn(resource, name, function()
        shim.warnOnce(resource .. '.' .. name, ('%s %s (called by %s), returned %s'):format(
            name, why or 'is not supported', GetInvokingResource() or 'unknown', repr(default)))
        return default
    end)
end

---Registers a stubbed export on every phone product's name.
---@param name string export name
---@param default any fixed return value
---@param why string|nil reason clause for the warning
function shim.stubExport(name, default, why)
    for i = 1, #PHONES do shim.stubOn(PHONES[i], name, default, why) end
end

---Registers a stubbed PRO export, on the PRO name and on qs-smartphone.
---@param name string export name
---@param default any fixed return value
---@param why string|nil reason clause for the warning
function shim.stubPro(name, default, why)
    for i = 1, #PRO do shim.stubOn(PRO[i], name, default, why) end
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

---Coerces an export argument to a trimmed string: integral floats format without the decimal,
---other numbers stringify, any other non-string becomes ''.
---@param v any
---@return string
function shim.str(v)
    if math.type(v) == 'float' and v % 1 == 0 then
        v = ('%.0f'):format(v)
    elseif type(v) == 'number' then
        v = tostring(v)
    end
    if type(v) ~= 'string' then return '' end
    return (v:gsub('^%s+', ''):gsub('%s+$', ''))
end

return shim
