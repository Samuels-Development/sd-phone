---Binds a NUI callback that forwards its payload to the matching server callback and returns the
---response envelope unchanged, falling back to a uniform failure when the server never answers.
---@param nuiAction string NUI action name the React app fetches
---@param serverEvent string server callback name to await
---@param onAccepted? fun() ran only when the server accepted the write, never on a rejection
local function proxy(nuiAction, serverEvent, onAccepted)
    RegisterNUICallback(nuiAction, function(payload, cb)
        local res = lib.callback.await(serverEvent, false, payload)
        if onAccepted and type(res) == 'table' and res.success == true then onAccepted() end
        cb(res or { success = false, message = 'No response from server' })
    end)
end

return proxy
