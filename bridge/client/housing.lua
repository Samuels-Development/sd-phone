---Runs owner-gated housing actions on this client for the server bridge, dispatched per housing
---system: lock toggle, key give/remove, and key-holder listing. Unhandled pairs return nil.
---@param system string|nil detected housing resource name (the server bridge's ACTIVE)
---@param action string 'lock'|'give'|'remove'|'keyHolders'
---@param id any property identifier in the active system's own terms
---@param arg any action argument (desired lock state, target server id, or key-holder identifier)
lib.callback.register('sd-phone:client:housing:exec', function(system, action, id, arg)
    if action == 'zone' then
        local coords = id
        if type(coords) ~= 'table' or not coords.x or not coords.y then return nil end
        local ok, label = pcall(function()
            return GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z or 0.0))
        end)
        if ok and type(label) == 'string' and label ~= '' and label ~= 'NULL' then
            return label
        end
        return nil
    end

    if system == 'origen_housing' then
        if action == 'lock' then
            local want = arg and true or false
            local cur
            local ok, door = pcall(function() return exports['origen_housing']:getHouseDoor(id) end)
            if ok and type(door) == 'table' then cur = door.locked end
            if cur == nil or cur ~= want then
                pcall(function() exports['origen_housing']:toggleDoor(id) end)
            end
            return want
        elseif action == 'give' then
            return (pcall(function() exports['origen_housing']:addKeyHolder(id, tonumber(arg)) end)) and true or false
        elseif action == 'remove' then
            return (pcall(function() exports['origen_housing']:removeKeyHolder(id, arg) end)) and true or false
        end

    elseif system == 'ps-housing' then
        if action == 'give' then
            TriggerServerEvent('ps-housing:server:addAccess', id, tonumber(arg))
            return true
        elseif action == 'remove' then
            TriggerServerEvent('ps-housing:server:removeAccess', id, arg)
            return true
        elseif action == 'keyHolders' then
            local ok, list = pcall(function()
                return lib.callback.await('ps-housing:cb:getPlayersWithAccess', false, id)
            end)
            if not ok or type(list) ~= 'table' then return {} end
            local out = {}
            for _, p in pairs(list) do
                if type(p) == 'table' then
                    out[#out + 1] = { id = tostring(p.citizenid or p.id or ''), name = p.name or 'Resident' }
                end
            end
            return out
        end

    elseif system == 'vms_housing' then
        if action == 'give' then
            TriggerServerEvent('vms_housing:sv:giveKey', id, tonumber(arg))
            return true
        elseif action == 'remove' then
            TriggerServerEvent('vms_housing:sv:removeKey', id, arg)
            return true
        end
    end

    return nil
end)

-- Side-effect module: the callback above self-registers; nothing to export.
return {}