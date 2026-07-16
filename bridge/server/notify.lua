---@type table Notify module; the table returned at end of file. Server -> client notification
---dispatcher over the 'sd-phone:client:notify' net event.
local notify = {}

---Send a notification to a specific player. Accepts a bare description string (with an optional
---type) or a full payload table passed straight through to the client.
---@param source number Target player id.
---@param data string|table Either a (description) string or a payload table.
---@param notifyType? 'info'|'success'|'error' Used when `data` is a string.
function notify.to(source, data, notifyType)
    if type(data) == 'string' then
        TriggerClientEvent('sd-phone:client:notify', source,
            { description = data, type = notifyType or 'info' })
    else
        TriggerClientEvent('sd-phone:client:notify', source, data)
    end
end

return notify
