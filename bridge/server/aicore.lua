---@type integer Milliseconds an AI Core callback export is waited on before it counts as no answer.
local CALLBACK_TIMEOUT = 5000

---@type table AI Core module; the table returned at end of file. Helpers for the bridges that call
---AI Core's own exports: character ids and its callback-style (offline) exports.
local aicore = {}

---Calls an AI Core resource's export that answers through a trailing callback and waits for the
---answer. Nil when the call errors or no answer arrives within CALLBACK_TIMEOUT.
---@param resource string resource name ('ai-core', 'ai-vehicles', ...)
---@param name string export name
---@param ... any export arguments before the callback
---@return any
function aicore.awaitOn(resource, name, ...)
    local p = promise.new()
    local settled = false
    local args = table.pack(...)

    args[args.n + 1] = function(result)
        if settled then return end
        settled = true
        p:resolve(result)
    end

    local ok = pcall(function()
        exports[resource][name](exports[resource], table.unpack(args, 1, args.n + 1))
    end)
    if not ok then return nil end

    SetTimeout(CALLBACK_TIMEOUT, function()
        if settled then return end
        settled = true
        p:resolve(nil)
    end)
    return Citizen.Await(p)
end

---aicore.awaitOn for an ai-core export.
---@param name string export name
---@param ... any export arguments before the callback
---@return any
function aicore.await(name, ...)
    return aicore.awaitOn('ai-core', name, ...)
end

---True when an AI Core change result reports success (`{ ok = true }`).
---@param result any
---@return boolean
function aicore.succeeded(result)
    return type(result) == 'table' and result.ok == true
end

---AI Core's numeric character id behind a citizenid. AI Core writes every citizenid as its
---character's row id, so a numeric one is read directly. Nil when unknown.
---@param citizenid any
---@return integer|nil
function aicore.charId(citizenid)
    local n = math.tointeger(tonumber(citizenid))
    if n then return n end
    if type(citizenid) ~= 'string' or citizenid == '' then return nil end
    return math.tointeger(aicore.await('GetCharIdByCitizenId', citizenid))
end

return aicore
