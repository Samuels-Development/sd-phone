---@type table Weazel News persistence layer (server.weazelnews.store): article + ticker row CRUD.
local store   = require 'server.weazelnews.store'
---@type table Authoritative Weazel News handlers (server.weazelnews.actions): staff gating,
---input clamping and envelope responses.
local actions = require 'server.weazelnews.actions'

-- Boot-time schema bootstrap.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:weazelnews]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:weazelnews]^0 schema ready')
end)

-- NUI callbacks: thin delegates into server.weazelnews.actions; shims normalize non-table payloads.
lib.callback.register('sd-phone:server:weazelnews:feed', function(src)
    return actions.feed(src)
end)

lib.callback.register('sd-phone:server:weazelnews:view', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.view(src, payload.id)
end)

lib.callback.register('sd-phone:server:weazelnews:save', function(src, payload)
    return actions.save(src, payload)
end)

lib.callback.register('sd-phone:server:weazelnews:delete', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.delete(src, payload.id)
end)

lib.callback.register('sd-phone:server:weazelnews:setBreaking', function(src, payload)
    return actions.setBreaking(src, payload)
end)

---Publishes an article from another server resource (exports['sd-phone']:postArticle). `article`
---mirrors the staff draft; every staff-path clamp applies. Returns the new id, or nil + reason.
---@param article table
---@return integer|nil articleId
---@return string? reason failure reason when articleId is nil
exports('postArticle', function(article)
    return actions.publish(article)
end)

---Replaces the breaking ticker from another server resource (exports['sd-phone']:setBreakingTicker).
---Same clamps as the staff editor; an empty array clears the ticker, a non-table returns false.
---@param lines string[] ticker lines in display order
---@return boolean replaced
exports('setBreakingTicker', function(lines)
    return actions.replaceTicker(lines)
end)
