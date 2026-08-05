---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Accounts persistence layer (server.accounts.store): schema bootstrap + legacy migration.
local store   = require 'server.accounts.store'
---@type table Authoritative account handlers (server.accounts.actions): validation + all mutation.
local actions = require 'server.accounts.actions'

---Bootstraps the schema and runs the one-time legacy credential migration in a thread, each
---step pcall-guarded independently.
CreateThread(function()
    local okSchema, err = pcall(store.ensureSchema)
    if not okSchema then
        boot.schemaFailed('accounts', err)
        return
    end
    local okMig, merr = pcall(store.migrateLegacy)
    if not okMig then
        boot.schemaFailed('accounts', merr)
    end
    boot.schemaReady()
end)

-- Authoritative account callbacks: thin delegates into server.accounts.actions.
lib.callback.register('sd-phone:server:accounts:register',     function(src, payload) return actions.register(src, payload) end)
lib.callback.register('sd-phone:server:accounts:login',        function(src, payload) return actions.login(src, payload) end)
lib.callback.register('sd-phone:server:accounts:logout',       function(src, payload) return actions.logout(src, payload) end)
lib.callback.register('sd-phone:server:accounts:signOutAll',   function(src, payload) return actions.signOutAll(src, payload) end)
lib.callback.register('sd-phone:server:accounts:capacity',     function(src, payload) return actions.capacity(src, payload) end)
lib.callback.register('sd-phone:server:accounts:me',           function(src, payload) return actions.me(src, payload) end)
lib.callback.register('sd-phone:server:accounts:signInOptions', function(src, payload) return actions.signInOptions(src, payload) end)
lib.callback.register('sd-phone:server:accounts:switchable',   function(src, payload) return actions.switchable(src, payload) end)
lib.callback.register('sd-phone:server:accounts:switch',       function(src, payload) return actions.switchAccount(src, payload) end)
lib.callback.register('sd-phone:server:accounts:requestReset', function(src, payload) return actions.requestReset(src, payload) end)
lib.callback.register('sd-phone:server:accounts:confirmReset', function(src, payload) return actions.confirmReset(src, payload) end)
lib.callback.register('sd-phone:server:accounts:changePassword', function(src, payload) return actions.changePassword(src, payload) end)
lib.callback.register('sd-phone:server:accounts:suggestCode',  function(src, payload) return actions.suggestCode(src, payload) end)
lib.callback.register('sd-phone:server:accounts:myNumber',     function(src)          return actions.myNumber(src) end)
lib.callback.register('sd-phone:server:accounts:myEmail',      function(src)          return actions.myEmail(src) end)
lib.callback.register('sd-phone:server:accounts:savePassword',   function(src, payload) return actions.savePassword(src, payload) end)
lib.callback.register('sd-phone:server:accounts:listPasswords',  function(src)          return actions.listPasswords(src) end)
lib.callback.register('sd-phone:server:accounts:deletePassword', function(src, payload) return actions.deletePassword(src, payload) end)

---@type table<string, string[]> Every content table an account app owns, children before parents.
---Order matters: these are DELETEs, not TRUNCATEs, because MySQL refuses to truncate any table a
---foreign key points at, and three constraints point at phone_birdy_posts alone.
local APP_TABLES = {
    mail = {
        'phone_mail_saved_emails', 'phone_mail_sessions', 'phone_mail_accounts',
    },
    birdy = {
        'phone_birdy_notifications', 'phone_birdy_dms', 'phone_birdy_follows',
        'phone_birdy_reposts', 'phone_birdy_likes', 'phone_birdy_posts', 'phone_birdy_profiles',
    },
    photogram = {
        'phone_photogram_story_views', 'phone_photogram_stories', 'phone_photogram_comment_likes',
        'phone_photogram_comments', 'phone_photogram_saves', 'phone_photogram_likes',
        'phone_photogram_dms', 'phone_photogram_notifications', 'phone_photogram_follows',
        'phone_photogram_posts', 'phone_photogram_profiles',
    },
    cherry = {
        'phone_cherry_messages', 'phone_cherry_matches', 'phone_cherry_swipes',
        'phone_cherry_blocks', 'phone_cherry_profiles',
    },
    vibez = {
        'phone_vibez_comment_likes', 'phone_vibez_comments', 'phone_vibez_saves',
        'phone_vibez_likes', 'phone_vibez_notifications', 'phone_vibez_follows',
        'phone_vibez_posts', 'phone_vibez_profiles',
    },
    ryde = { 'phone_ryde_rides', 'phone_ryde_drivers' },
}

---@type string[] APP_TABLES keys in a stable order, for the help text and the wipe-everything pass.
local APP_ORDER = { 'mail', 'birdy', 'photogram', 'cherry', 'vibez', 'ryde' }

---Empties one table, swallowing the error when it does not exist on this install.
---@param tbl string table name
---@return integer removed rows deleted (0 on failure)
local function clearTable(tbl)
    local okDel, res = pcall(function() return MySQL.update.await('DELETE FROM ' .. tbl) end)
    return okDel and (tonumber(res) or 0) or 0
end

---Wipes one app: its content tables, then its credentials, sessions and saved vault logins.
---@param app string account app key
---@return integer removed
local function wipeApp(app)
    local removed = 0
    for _, tbl in ipairs(APP_TABLES[app]) do removed = removed + clearTable(tbl) end
    for _, tbl in ipairs({ 'phone_app_accounts', 'phone_app_sessions', 'phone_passwords' }) do
        local okDel, res = pcall(function()
            return MySQL.update.await(('DELETE FROM %s WHERE app = ?'):format(tbl), { app })
        end)
        removed = removed + (okDel and (tonumber(res) or 0) or 0)
    end
    return removed
end

---/wipephoneaccounts [app] - wipes every phone app account, or one app's, along with all of that
---app's content and its saved Passwords-app logins. Admin-only, runnable from the server console.
---Content goes too on purpose: these apps key their rows by username, so leaving them behind means
---re-registering a name silently inherits the old account's posts, matches and messages.
---@param source integer player server id (0 from console)
---@param args table { app?: string }
lib.addCommand('wipephoneaccounts', {
    help = 'Wipe phone app accounts and all their content. No argument wipes every app; pass one of mail, birdy, photogram, cherry, vibez, ryde to wipe just that one.',
    params = {
        { name = 'app', type = 'string', help = 'mail | birdy | photogram | cherry | vibez | ryde (blank = all)', optional = true },
    },
    restricted = 'group.admin',
}, function(source, args)
    local app = args and args.app and args.app:lower() or nil
    if app == '' or app == 'all' then app = nil end

    if app and not APP_TABLES[app] then
        local msg = ('unknown app "%s". Use one of: %s'):format(app, table.concat(APP_ORDER, ', '))
        print(('^1[sd-phone:accounts]^0 %s'):format(msg))
        if source and source > 0 then
            TriggerClientEvent('ox_lib:notify', source, {
                title = 'Phone accounts', description = msg, type = 'error',
            })
        end
        return
    end

    local removed = 0
    if app then
        removed = wipeApp(app)
    else
        for _, key in ipairs(APP_ORDER) do removed = removed + wipeApp(key) end
        -- Anything left in the shared tables belongs to an app with no content of its own.
        removed = removed + clearTable('phone_app_sessions')
        removed = removed + clearTable('phone_app_accounts')
        removed = removed + clearTable('phone_passwords')
    end

    local msg = ('wiped %s (%d row%s)'):format(
        app and (app .. ' accounts') or 'every phone app account',
        removed, removed == 1 and '' or 's')
    print(('^3[sd-phone:accounts]^0 %s'):format(msg))
    if source and source > 0 then
        TriggerClientEvent('ox_lib:notify', source, {
            title = 'Phone accounts', description = msg, type = 'success',
        })
    end
end)

---/wipephotogram - kept for the muscle memory; identical to `/wipephoneaccounts photogram`. It
---used to leave the content tables behind, which meant re-registering a username inherited the
---old account's posts and followers.
---@param source integer player server id (0 from console)
lib.addCommand('wipephotogram', {
    help = 'Wipe ALL Photogram accounts and their content. Same as /wipephoneaccounts photogram.',
    restricted = 'group.admin',
}, function(source)
    local removed = wipeApp('photogram')
    local msg = ('wiped photogram accounts (%d row%s)'):format(removed, removed == 1 and '' or 's')
    print(('^3[sd-phone:accounts]^0 %s'):format(msg))
    if source and source > 0 then
        TriggerClientEvent('ox_lib:notify', source, {
            title = 'Photogram', description = msg, type = 'success',
        })
    end
end)

---Public export: exports['sd-phone']:accountExists(app, username). Returns whether an account
---exists for one of the engine's account apps; the username is trimmed and lowercased.
---@param app string account app key
---@param username string account username
---@return boolean exists
exports('accountExists', function(app, username)
    return actions.accountExists(app, username)
end)

---Public export: exports['sd-phone']:getAppAccount(app, username). Returns one account as
---{ username, name, email, phone }, or nil when the app is unknown or no such account exists.
---@param app string account app key
---@param username string account username
---@return table|nil account public shape { username, name, email, phone }
exports('getAppAccount', function(app, username)
    return actions.getPublicAccount(app, username)
end)

---Public export: exports['sd-phone']:getSessionAccount(app, citizenid). Returns the account a
---citizen is currently signed into for `app`, in the same public shape as getAppAccount, or nil.
---@param app string account app key
---@param citizenid string framework per-character id
---@return table|nil account public shape { username, name, email, phone }
exports('getSessionAccount', function(app, citizenid)
    return actions.getPublicSession(app, citizenid)
end)
