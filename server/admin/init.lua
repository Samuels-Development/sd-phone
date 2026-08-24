---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

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
        boot.schemaFailed('admin', err)
        return
    end
    boot.schemaReady()
end)

---Registers one admin callback behind the server-side permission gate. The gate runs on every
---call; the hidden client entry point is never the security boundary.
---
---`tier` is what the action costs to run: 'view' reads, 'moderate' changes a player's phone,
---'destroy' cannot be undone. A server that has only ever granted group.admin passes every tier,
---so this splits nothing until an operator opts in by granting a narrower ace.
---@param name string action suffix, e.g. 'search'
---@param fn fun(src: number, payload: table|nil): table
---@param tier string 'view' | 'moderate' | 'destroy'
local function reg(name, fn, tier)
    lib.callback.register('sd-phone:server:admin:' .. name, function(src, payload)
        if not permissions.allows(src, tier) then return util.fail('Not authorized') end
        return fn(src, payload)
    end)
end

---Panel access probe: allowed flag + the admin's display name.
lib.callback.register('sd-phone:server:admin:check', function(src)
    if not permissions.isAllowed(src) then return { allowed = false } end
    return { allowed = true, name = player.getName(src) }
end)

---/phoneadmin - opens the admin panel. Registered server-side through ox_lib so the restricted
---ace (`command.phoneadmin`) is granted to group.admin and inherited by its members - that same
---ace is one of the ways permissions.isAllowed passes. Console is refused.
lib.addCommand('phoneadmin', {
    help = 'Open the sd-phone admin panel',
    restricted = 'group.admin',
}, function(source)
    if not source or source <= 0 then
        print('^1[sd-phone:admin]^0 /phoneadmin must be run by a player, not the console.')
        return
    end
    if not permissions.isAllowed(source) then return end
    -- The sim flag drives the panel's Numbers nav visibility; the racing flag drives its Racing
    -- section, which is the only place track moderation lives.
    TriggerClientEvent('sd-phone:client:admin:open', source, player.getName(source),
        require('server.sim.state').active,
        (require('configs.config').Racing or {}).Enabled == true)
end)

---/birdyverify <handle> <blue|gold|grey|none> - sets or clears a Birdy badge without opening the
---panel. Delegates to the panel's own action, so the allowlist, the failure messages and the
---audit row are identical either way. The console is allowed here, unlike /phoneadmin: seeding
---government and business accounts is setup work owners often do before anyone is online.
lib.addCommand('birdyverify', {
    help = 'Set or clear a Birdy verification badge',
    restricted = 'group.admin',
    params = {
        { name = 'handle', type = 'string', help = 'Birdy handle, with or without the @' },
        { name = 'type',   type = 'string', help = 'blue, gold, grey, or none to clear it' },
    },
}, function(source, args)
    local handle = tostring(args.handle or ''):gsub('^@', '')
    local res    = actions.birdySetVerified(source, { handle = handle, type = args.type })

    local asked = tostring(args.type or ''):lower()
    local text  = res.message or ''
    if res.success then
        text = (asked == '' or asked == 'none' or asked == 'off' or asked == 'remove')
            and ('Removed verification from @' .. handle)
            or  ('@' .. handle .. ' verified: ' .. asked)
    end

    if not source or source <= 0 then
        print(('%s[sd-phone:admin]^0 %s'):format(res.success and '^2' or '^1', text))
        return
    end
    TriggerClientEvent('ox_lib:notify', source, {
        title       = 'Birdy',
        description = text,
        type        = res.success and 'success' or 'error',
    })
end)

reg('search',               actions.search, 'view')
reg('overview',             actions.overview, 'view')
reg('setNumber',            actions.setNumber, 'moderate')
reg('simLookup',            actions.simLookup, 'view')
reg('giveSim',              actions.giveSim, 'moderate')
reg('numbers',              actions.numbers, 'view')
reg('resetPasscode',        actions.resetPasscode, 'moderate')
reg('setApp',               actions.setApp, 'moderate')
reg('resetAccountPassword', actions.resetAccountPassword, 'moderate')
reg('forceLogout',          actions.forceLogout, 'moderate')
reg('birdyPosts',           actions.birdyPosts, 'view')
reg('birdyDeletePost',      actions.birdyDeletePost, 'moderate')
reg('birdySetVerified',     actions.birdySetVerified, 'moderate')
reg('content',              actions.content, 'view')
reg('contentThread',        actions.contentThread, 'view')
reg('contentDelete',        actions.contentDelete, 'moderate')
reg('contentThreadDelete',  actions.contentThreadDelete, 'moderate')
reg('messages',             actions.messages, 'view')
reg('calls',                actions.calls, 'view')
reg('mute',                 actions.mute, 'moderate')
reg('unmute',               actions.unmute, 'moderate')
reg('mutes',                actions.mutes, 'view')
reg('wipePhone',            actions.wipePhone, 'destroy')
reg('audit',                actions.audit, 'view')
reg('stats',                actions.stats, 'view')
reg('media',                actions.media, 'view')
reg('livePositions',        actions.livePositions, 'view')
