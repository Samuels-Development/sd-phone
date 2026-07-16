---Binds a NUI callback that forwards its payload to the matching server callback and returns the
---response envelope unchanged, falling back to a uniform failure when the server never answers.
---@param nuiAction string NUI action name the React app fetches
---@param serverEvent string server callback name to await
local function proxy(nuiAction, serverEvent)
    RegisterNUICallback(nuiAction, function(payload, cb)
        cb(lib.callback.await(serverEvent, false, payload) or { success = false, message = 'No response from server' })
    end)
end

return proxy
