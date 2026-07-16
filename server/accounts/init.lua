---@type table Accounts persistence layer (server.accounts.store): schema bootstrap + legacy migration.
local store   = require 'server.accounts.store'
---@type table Authoritative account handlers (server.accounts.actions): validation + all mutation.
local actions = require 'server.accounts.actions'

---Bootstraps the schema and runs the one-time legacy credential migration in a thread, each
---step pcall-guarded independently.
CreateThread(function()
    local okSchema, err = pcall(store.ensureSchema)
    if not okSchema then
        print(('^1[sd-phone:accounts]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    local okMig, merr = pcall(store.migrateLegacy)
    if not okMig then
        print(('^1[sd-phone:accounts]^0 legacy migration failed: %s'):format(merr))
    end
    print('^2[sd-phone:accounts]^0 schema ready')
end)

-- Authoritative account callbacks: thin delegates into server.accounts.actions.
lib.callback.register('sd-phone:server:accounts:register',     function(src, payload) return actions.register(src, payload) end)
lib.callback.register('sd-phone:server:accounts:login',        function(src, payload) return actions.login(src, payload) end)
lib.callback.register('sd-phone:server:accounts:logout',       function(src, payload) return actions.logout(src, payload) end)
lib.callback.register('sd-phone:server:accounts:me',           function(src, payload) return actions.me(src, payload) end)
lib.callback.register('sd-phone:server:accounts:requestReset', function(src, payload) return actions.requestReset(src, payload) end)
lib.callback.register('sd-phone:server:accounts:confirmReset', function(src, payload) return actions.confirmReset(src, payload) end)
lib.callback.register('sd-phone:server:accounts:changePassword', function(src, payload) return actions.changePassword(src, payload) end)
lib.callback.register('sd-phone:server:accounts:suggestCode',  function(src, payload) return actions.suggestCode(src, payload) end)
lib.callback.register('sd-phone:server:accounts:myNumber',     function(src)          return actions.myNumber(src) end)
lib.callback.register('sd-phone:server:accounts:myEmail',      function(src)          return actions.myEmail(src) end)
lib.callback.register('sd-phone:server:accounts:savePassword',   function(src, payload) return actions.savePassword(src, payload) end)
lib.callback.register('sd-phone:server:accounts:listPasswords',  function(src)          return actions.listPasswords(src) end)
lib.callback.register('sd-phone:server:accounts:deletePassword', function(src, payload) return actions.deletePassword(src, payload) end)

---@type string[] Tables truncated by /wipephoneaccounts.
local WIPE_TABLES = {
    'phone_app_accounts',
    'phone_app_sessions',
    'phone_passwords',
    'phone_mail_accounts',
    'phone_birdy_profiles',
    'phone_birdy_posts',
    'phone_birdy_likes',
    'phone_birdy_follows',
    'phone_birdy_dms',
    'phone_birdy_notifications',
}

---/wipephoneaccounts - truncates every table in WIPE_TABLES (admin-only), each TRUNCATE
---pcall-guarded; runnable from the server console.
---@param source integer player server id (0 from console)
lib.addCommand('wipephoneaccounts', {
    help = 'Wipe EVERY phone app account (mail, birdy, photogram, cherry, vibez), all birdy content, and the passwords vault',
    restricted = 'group.admin',
}, function(source)
    local wiped, failed = 0, 0
    for i = 1, #WIPE_TABLES do
        local okTruncate = pcall(function()
            MySQL.query.await('TRUNCATE TABLE ' .. WIPE_TABLES[i])
        end)
        if okTruncate then wiped = wiped + 1 else failed = failed + 1 end
    end

    local msg = ('wiped %d account table%s%s'):format(
        wiped, wiped == 1 and '' or 's',
        failed > 0 and (' (%d missing/failed)'):format(failed) or ''
    )
    print(('^3[sd-phone:accounts]^0 %s'):format(msg))
    if source and source > 0 then
        TriggerClientEvent('ox_lib:notify', source, {
            title = 'Phone accounts', description = msg, type = 'success',
        })
    end
end)

---/wipephotogram - deletes Photogram accounts, their sessions, and saved Passwords-app logins,
---leaving every other app's accounts intact (admin-only).
---@param source integer player server id (0 from console)
lib.addCommand('wipephotogram', {
    help = 'Wipe ALL Photogram accounts (plus their sessions and saved logins). Everyone must re-register.',
    restricted = 'group.admin',
}, function(source)
    local removed = 0
    local ok = pcall(function()
        removed = MySQL.update.await('DELETE FROM phone_app_accounts WHERE app = ?', { 'photogram' }) or 0
        MySQL.update.await('DELETE FROM phone_app_sessions WHERE app = ?', { 'photogram' })
        MySQL.update.await('DELETE FROM phone_passwords   WHERE app = ?', { 'photogram' })
    end)

    local msg = ok
        and ('wiped %d Photogram account%s'):format(removed, removed == 1 and '' or 's')
        or  'failed to wipe Photogram accounts (see server console)'
    print(('^3[sd-phone:accounts]^0 %s'):format(msg))
    if source and source > 0 then
        TriggerClientEvent('ox_lib:notify', source, {
            title = 'Photogram', description = msg, type = ok and 'success' or 'error',
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
