---@type table Bounded CDN media probe through the existing Node runtime.
local probe = {}
local RESOURCE <const> = GetCurrentResourceName()
local waiting = {}
local sequence = 0

local function call(name, ...)
    return pcall(function(...) return exports[RESOURCE][name](exports[RESOURCE], ...) end, ...)
end

function probe.available()
    local ok, ready = call('sdMediaProbeReady')
    return ok and ready == true
end

local function settle(ticket, result, code)
    local cb = waiting[ticket]
    if not cb then return end
    waiting[ticket] = nil
    cb(result, code)
end

AddEventHandler('sd-phone:server:media:probed', function(ticket, result, code)
    settle(tostring(ticket), result, code)
end)

---Reads twelve bytes and trusted response headers. Redirects and ignored ranges are refused.
---@param url string
---@param cb fun(result: {bytes: integer, mime: string, head: string}|nil, code: string|nil)
function probe.read(url, cb)
    sequence = sequence + 1
    local ticket = tostring(sequence)
    waiting[ticket] = cb
    local ok, accepted = call('sdMediaProbe', ticket, url)
    if not ok or accepted ~= true then settle(ticket, nil, 'probe-failed') end
    SetTimeout(12000, function() settle(ticket, nil, 'probe-failed') end)
end

return probe
