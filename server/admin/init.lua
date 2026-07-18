---@type table Panel permission gate (server.admin.permissions): ace check.
local permissions = require 'server.admin.permissions'
---@type table Admin persistence layer (server.admin.store): schema bootstrap + reads.
local store       = require 'server.admin.store'
---@type table Mute registry (server.admin.moderation): schema bootstrap.
local moderation  = require 'server.admin.moderation'
---@type table Authoritative admin handlers (server.admin.actions): validation + all mutation.
local actions     = require 'server.admin.actions'
local util        = require 'server.util'
---@type table Player bridge (bridge.server.player): admin display name for the panel header.
local player      = require 'bridge.server.player'

---Bootstraps the admin + mute tables, pcall-guarded like every other module.
CreateThread(function()
    local okSchema, err = pcall(function()
        store.ensureSchema()
        moderation.ensureSchema()
    end)
    if not okSchema then
        print(('^1[sd-phone:admin]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:admin]^0 schema ready')
end)

---Registers one admin callback behind the server-side permission gate. The gate runs on every
---call; the hidden client entry point is never the security boundary.
---@param name string action suffix, e.g. 'search'
---@param fn fun(src: number, payload: table|nil): table
local function reg(name, fn)
    lib.callback.register('sd-phone:server:admin:' .. name, function(src, payload)
        if not permissions.isAllowed(src) then return util.fail('Not authorized') end
        return fn(src, payload)
    end)
end

---Panel access probe for the /phoneadmin command: allowed flag + the admin's display name.
lib.callback.register('sd-phone:server:admin:check', function(src)
    if not permissions.isAllowed(src) then return { allowed = false } end
    return { allowed = true, name = player.getName(src) }
end)

reg('search',               actions.search)
reg('overview',             actions.overview)
reg('setNumber',            actions.setNumber)
reg('resetPasscode',        actions.resetPasscode)
reg('setApp',               actions.setApp)
reg('resetAccountPassword', actions.resetAccountPassword)
reg('forceLogout',          actions.forceLogout)
reg('birdyPosts',           actions.birdyPosts)
reg('birdyDeletePost',      actions.birdyDeletePost)
reg('birdySetVerified',     actions.birdySetVerified)
reg('messages',             actions.messages)
reg('calls',                actions.calls)
reg('mute',                 actions.mute)
reg('unmute',               actions.unmute)
reg('mutes',                actions.mutes)
reg('wipePhone',            actions.wipePhone)
reg('audit',                actions.audit)
reg('stats',                actions.stats)
