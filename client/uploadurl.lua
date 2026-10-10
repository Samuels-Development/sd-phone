---@type string Path on the server's HTTP handler that answers a reachability check.
local PROBE_PATH <const> = '/upload/probe'

---Builds the full URL of a path on this resource's HTTP handler, on the server this client is
---connected to.
---@param path string handler path, starting with a slash
---@return string|nil url nil when there is no address to use
local function handlerUrl(path)
    local endpoint = GetCurrentServerEndpoint()
    if type(endpoint) ~= 'string' or endpoint == '' then return nil end
    return ('http://%s/%s%s'):format(endpoint, GetCurrentResourceName(), path)
end

---React -> Lua: where the phone can check that it reaches the server's HTTP port, so a client
---that cannot is found before a slot is minted for it.
RegisterNUICallback('sd-phone:media:httpProbe', function(_, cb)
    local url = handlerUrl(PROBE_PATH)
    if not url then return cb({ success = false, code = 'unavailable' }) end
    cb({ success = true, data = { url = url } })
end)

---Completes an HTTP upload slot the server minted, swapping its path for the full URL on the server
---this client is connected to, or marks it unavailable when there is no address to use.
---@param res table successful envelope { data = { path: string, partBytes: integer } }
return function(res)
    local data = type(res.data) == 'table' and res.data or nil
    local url = data and type(data.path) == 'string' and handlerUrl(data.path) or nil
    if not url then
        res.success = false
        res.code = 'unavailable'
        res.data = nil
        return
    end
    data.url = url
    data.path = nil
end
