---@type table sd-phone config root (configs/config.lua).
local config      = require 'configs.config'
---@type table Accounts persistence layer (server.accounts.store): account/session/vault CRUD + hashing.
local store       = require 'server.accounts.store'
---@type table Reset-code delivery (server.accounts.delivery): targeted in-game mail/SMS sends.
local delivery    = require 'server.accounts.delivery'
---@type table Mail persistence layer (server.mail.store): account lookups + legacy credential sync.
local mailStore   = require 'server.mail.store'
---@type table Birdy persistence layer (server.birdy.store): legacy password hasher for migrated rows.
local birdyStore  = require 'server.birdy.store'
---@type table Settings persistence layer (server.settings.store): citizenid -> phone-number lookups.
local settings    = require 'server.settings.store'
---@type table Player bridge (bridge.server.player): citizenid resolution from a server id.
local player      = require 'bridge.server.player'

---@type string Mail app domain (config.Mail.Domain), appended to bare mail usernames.
local MAIL_DOMAIN = config.Mail.Domain

---@type table Actions module; the table returned at end of file.
local actions     = {}

local util = require 'server.util'
local ok, fail, digits, trim = util.ok, util.fail, util.digits, util.trim


-- App whitelists; every handler resolves its payload `app` against one of these.
---@type table<string, boolean> Apps served by the generic register/login/logout/me callbacks.
local DIRECT_APPS    = { photogram = true, cherry = true, vibez = true, ryde = true }
---@type table<string, boolean> Every account app the engine knows (reset + vault callbacks).
local ALL_APPS       = { photogram = true, cherry = true, vibez = true, birdy = true, mail = true, ryde = true }

---@type table<string, fun(password: string): string> Legacy per-app password hashers for migrated rows.
local LEGACY_HASHERS = {
    birdy = birdyStore.hashPassword,
    mail  = mailStore.hashPassword,
}



---@type integer Longest password any creation path accepts.
local MAX_PASSWORD_LEN = math.max(64, config.Birdy.MaxPasswordLength or 0, config.Mail.MaxPasswordLength or 0)

---Checks a plaintext password against an account's stored hash, trying the app's legacy hasher
---on an engine-hash miss and re-hashing a legacy match with the engine hash.
---@param account table account row (store shape, passwordHash included)
---@param plain any client-supplied plaintext password
---@return boolean verified
function actions.verifyPassword(account, plain)
    if type(plain) ~= 'string' or plain == '' or #plain > MAX_PASSWORD_LEN then return false end
    if store.hashPassword(plain) == account.passwordHash then return true end
    local legacy = LEGACY_HASHERS[account.app]
    if legacy and legacy(plain) == account.passwordHash then
        store.setPassword(account.id, store.hashPassword(plain))
        return true
    end
    return false
end

---Validates and normalises a username: mail accounts use the email address capped at 64, every
---other app is a plain handle capped at 30 with a character whitelist.
---@param app string account app key
---@param raw any client-supplied username
---@return string|nil username, string|nil err
local function validUsername(app, raw)
    local u = trim(raw):lower()
    if app == 'mail' then
        if #u < 5 or #u > 64 or u:find('%s') or not u:find('@', 1, true) then
            return nil, 'That email address looks invalid'
        end
        return u, nil
    end
    if #u < 3 then return nil, 'Username needs at least 3 characters' end
    if #u > 30 then return nil, 'Username must be 30 characters or fewer' end
    if not u:match('^[%w_%.]+$') then return nil, 'Letters, numbers, _ and . only' end
    return u, nil
end

---Validates a password: 6-64 characters, strings only.
---@param raw any client-supplied password
---@return string|nil password, string|nil err
local function validPassword(raw)
    if type(raw) ~= 'string' or #raw < 6 then return nil, 'Password must be at least 6 characters' end
    if #raw > 64 then return nil, 'Password must be 64 characters or fewer' end
    return raw, nil
end

---Validates an optional recovery email: nil when blank, otherwise it must resolve to an existing
---Mail-app account (a bare username gets the mail domain appended).
---@param raw any client-supplied email
---@return string|nil email, string|nil err
local function validEmail(raw)
    local e = trim(raw):lower()
    if e == '' then return nil, nil end
    if not e:find('@', 1, true) then e = e .. '@' .. MAIL_DOMAIN end
    if not mailStore.getAccount(e) then
        return nil, 'No Mail account with that address exists'
    end
    return e, nil
end

---Validates an optional recovery phone: nil when blank, otherwise 7-15 digits.
---@param raw any client-supplied phone number
---@return string|nil phone, string|nil err
local function validPhone(raw)
    local p = digits(raw)
    if p == '' then return nil, nil end
    if #p < 7 or #p > 15 then return nil, 'That phone number looks invalid' end
    return p, nil
end

---Creates an account for an already-whitelisted app: validates username/password, optional
---recovery contacts (at least one required, each unique per app), and display name.
---@param app string account app key (already validated)
---@param payload table|nil client-supplied { username, password, name?, email?, phone? }
---@return table envelope on success data = { account }
function actions.createAccount(app, payload)
    payload = payload or {}
    local username, ue = validUsername(app, payload.username); if not username then return fail(ue) end
    local password, pe = validPassword(payload.password); if not password then return fail(pe) end
    local email, ee = validEmail(payload.email); if ee then return fail(ee) end
    local phone, he = validPhone(payload.phone); if he then return fail(he) end
    if not email and not phone then
        return fail('Add an email or phone number so you can recover the account')
    end
    local displayName = trim(payload.name)
    if displayName == '' then displayName = username end
    if #displayName > 50 then return fail('Name must be 50 characters or fewer') end

    if store.getAccount(app, username) then return fail('That username is taken') end

    if email and #store.findAccountsByContact(app, email, nil) > 0 then
        return fail('That email is already in use')
    end
    if phone and #store.findAccountsByContact(app, nil, phone) > 0 then
        return fail('That phone number is already in use')
    end

    local id = store.insertAccount(app, username, displayName, store.hashPassword(password), email, phone)
    if not id then return fail('Failed to create the account') end
    return ok({ account = store.getAccountById(id) })
end

---Returns the account shape handed back to a client: identity + recovery contacts, never the
---password hash.
---@param a table account row
---@return table public fields { username, name, email, phone }
local function publicAccount(a)
    return { username = a.username, name = a.displayName, email = a.email, phone = a.phone }
end

---Registers a new account for one of the direct apps and signs the caller into it, with the
---session keyed to the citizenid resolved from `source`.
---@param source number player server id
---@param payload table|nil client-supplied registration fields (see createAccount)
---@return table envelope on success data = { me }
function actions.register(source, payload)
    payload = payload or {}
    local app = payload.app
    if not DIRECT_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end

    local res = actions.createAccount(app, payload)
    if not res.success then return res end
    store.setSession(app, cid, res.data.account.id)
    return ok({ me = publicAccount(res.data.account) })
end

---Signs the caller into an existing account, trying the identity as a username first, then as
---the linked recovery email; failure returns a uniform 'Wrong username or password'.
---@param source number player server id
---@param payload table|nil client-supplied { app, username, password }
---@return table envelope on success data = { me }
function actions.login(source, payload)
    payload = payload or {}
    local app = payload.app
    if not DIRECT_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end

    local raw = trim(payload.username):lower()
    if raw == '' then return fail('Wrong username or password') end

    local acc = store.getAccount(app, raw)
    if not acc then
        local e = raw
        if not e:find('@', 1, true) then e = e .. '@' .. MAIL_DOMAIN end
        local matches = store.findAccountsByContact(app, e, nil)
        if #matches == 1 then acc = matches[1] end
    end
    if not acc or not actions.verifyPassword(acc, payload.password) then
        return fail('Wrong username or password')
    end
    store.setSession(app, cid, acc.id)
    return ok({ me = publicAccount(acc) })
end

---Signs the caller out of an app, clearing only their own session.
---@param source number player server id
---@param payload table|nil client-supplied { app }
---@return table envelope
function actions.logout(source, payload)
    local app = payload and payload.app
    if not DIRECT_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source)
    if cid then store.clearSession(app, cid) end
    return ok()
end

---Returns the caller's current session account in public shape; loggedIn = false when there is
---no session or no identity.
---@param source number player server id
---@param payload table|nil client-supplied { app }
---@return table envelope data = { loggedIn, me? }
function actions.me(source, payload)
    local app = payload and payload.app
    if not DIRECT_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source)
    if not cid then return ok({ loggedIn = false }) end
    local acc = store.getSessionAccount(app, cid)
    if not acc then return ok({ loggedIn = false }) end
    return ok({ loggedIn = true, me = publicAccount(acc) })
end

-- In-memory password-reset code state, keyed app:accountId.
---@type table<string, { code: string, expires: integer, attempts: integer, channel: string }> Live codes by app:accountId.
local resetCodes     = {}
---@type table<string, { count: integer, windowStart: integer }> Issue-rate windows by app:accountId.
local resetRequests  = {}

---@type integer Reset-code lifetime in seconds.
local CODE_TTL       = 600
---@type integer Wrong guesses allowed per code before it is voided.
local MAX_ATTEMPTS   = 5
---@type integer Codes issuable per account within one request window.
local MAX_REQUESTS   = 3
---@type integer Issue-rate window length in seconds.
local REQUEST_WINDOW = 600

---Builds the reset-state key from app and resolved account id.
---@param app string account app key
---@param accountId number account row id
---@return string key
local function resetKey(app, accountId) return app .. ':' .. accountId end

---Resolves a recovery identity (the email or phone number on file) to the single matching
---account and its delivery channel; ambiguity or no match returns an error.
---@param app string account app key
---@param raw string trimmed client-supplied identity
---@return table|nil acc, string|nil channel ('email'|'sms'), string|nil err
local function resolveRecovery(app, raw)
    if raw == '' then return nil, nil, 'Enter the email or phone number on the account' end

    local email, phone, channel
    if raw:find('@', 1, true) or raw:match('%a') then
        if app == 'mail' then
            return nil, nil, 'Use the phone number linked to the account'
        end
        local e = raw:lower()
        if not e:find('@', 1, true) then e = e .. '@' .. MAIL_DOMAIN end
        email, channel = e, 'email'
    else
        local p = digits(raw)
        if #p < 7 or #p > 15 then return nil, nil, 'Enter the email or phone number on the account' end
        phone, channel = p, 'sms'
    end

    local matches = store.findAccountsByContact(app, email, phone)
    if #matches == 0 then return nil, nil, 'No account uses that contact' end
    if #matches > 1 then return nil, nil, 'More than one account uses that contact. Ask an admin for help' end
    return matches[1], channel, nil
end

---Issues a password-reset code, rate-limited per account and delivered only to the linked
---mailbox or phone number; the response carries just the channel name.
---@param source number player server id
---@param payload { app: string, identity: string }|nil
---@return table envelope data = { channel }
function actions.requestReset(source, payload)
    payload = payload or {}
    local app = payload.app
    if not ALL_APPS[app] then return fail('Unknown app') end

    local acc, channel, err = resolveRecovery(app, trim(payload.identity))
    if not acc then return fail(err) end

    local key = resetKey(app, acc.id)
    local now = os.time()
    local req = resetRequests[key]
    if req and now - req.windowStart < REQUEST_WINDOW and req.count >= MAX_REQUESTS then
        return fail('Too many codes requested. Try again in a few minutes')
    end
    if not req or now - req.windowStart >= REQUEST_WINDOW then
        resetRequests[key] = { count = 0, windowStart = now }
        req = resetRequests[key]
    end

    local code = ('%06d'):format(math.random(0, 999999))
    local sent
    if channel == 'email' then
        sent = delivery.sendCodeEmail(acc.email, app, code)
        if not sent then return fail('Could not deliver the email. The linked address may have been deleted') end
    else
        sent = delivery.sendCodeSms(acc.phone, app, code)
        if not sent then return fail('Could not deliver the text. The linked number is not active') end
    end

    req.count = req.count + 1
    resetCodes[key] = { code = code, expires = now + CODE_TTL, attempts = 0, channel = channel }
    return ok({ channel = channel })
end

---Returns the live reset code when the caller's registered number or mail sign-in received it;
---every miss returns the same empty ok envelope.
---@param source number player server id
---@param payload { app: string, identity: string }|nil
---@return table envelope data = { code?, source? }
function actions.suggestCode(source, payload)
    payload = payload or {}
    local app = payload.app
    if not ALL_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source)
    if not cid then return ok({}) end

    local acc = (resolveRecovery(app, trim(payload.identity)))
    if not acc then return ok({}) end

    local entry = resetCodes[resetKey(app, acc.id)]
    if not entry or os.time() > entry.expires then return ok({}) end

    if entry.channel == 'sms' then
        local myNumber = digits(settings.getPhoneNumber(cid))
        if acc.phone and myNumber ~= '' and myNumber == acc.phone then
            return ok({ code = entry.code, source = 'messages' })
        end
    else
        local mailAcc = acc.email and mailStore.getAccount(acc.email)
        if mailAcc then
            for i = 1, #mailAcc.logged_in_citizens do
                if mailAcc.logged_in_citizens[i] == cid then
                    return ok({ code = entry.code, source = 'mail' })
                end
            end
        end
    end
    return ok({})
end

---Redeems a reset code and sets a new password, enforcing expiry and attempt limits, deleting
---the code on success, and syncing mail's credential column and vault copies.
---@param source number player server id
---@param payload { app: string, identity: string, code: string, password: string }|nil
---@return table envelope
function actions.confirmReset(source, payload)
    payload = payload or {}
    local app = payload.app
    if not ALL_APPS[app] then return fail('Unknown app') end

    local acc = (resolveRecovery(app, trim(payload.identity)))
    if not acc then return fail('That code has expired. Request a new one') end

    local key = resetKey(app, acc.id)
    local entry = resetCodes[key]
    if not entry or os.time() > entry.expires then
        resetCodes[key] = nil
        return fail('That code has expired. Request a new one')
    end
    entry.attempts = entry.attempts + 1
    if entry.attempts > MAX_ATTEMPTS then
        resetCodes[key] = nil
        return fail('Too many wrong attempts. Request a new code')
    end
    if digits(payload.code) ~= entry.code then return fail('Wrong code') end

    local password, pe = validPassword(payload.password); if not password then return fail(pe) end

    store.setPassword(acc.id, store.hashPassword(password))
    if app == 'mail' then
        mailStore.setPasswordHash(acc.username, mailStore.hashPassword(password))
    end
    store.syncVaultPassword(app, acc.username, password)
    resetCodes[key] = nil
    return ok()
end

---Changes an account's password using the current password, syncing mail's credential column
---and saved Passwords-app copies.
---@param source number player server id
---@param payload { app?: string, identity?: string, currentPassword?: string, newPassword?: string }
---@return table envelope
function actions.changePassword(source, payload)
    payload = payload or {}
    local app = payload.app
    if not ALL_APPS[app] then return fail('Unknown app') end
    local username = trim(payload.identity or '')
    if username == '' then return fail('Account is required') end
    local acc = store.getAccount(app, username)
    if not acc or not actions.verifyPassword(acc, payload.currentPassword) then
        return fail('Current password is incorrect')
    end
    local password, pe = validPassword(payload.newPassword); if not password then return fail(pe) end
    store.setPassword(acc.id, store.hashPassword(password))
    if app == 'mail' then
        mailStore.setPasswordHash(acc.username, mailStore.hashPassword(password))
    end
    store.syncVaultPassword(app, acc.username, password)
    return ok()
end

---Saves one login into the caller's own Passwords-app vault, with fields capped to their column
---widths and a bare email getting the mail domain appended.
---@param source number player server id
---@param payload { app: string, username: string, password: string, email?: string, phone?: string }|nil
---@return table envelope
function actions.savePassword(source, payload)
    payload = payload or {}
    local app = payload.app
    if not ALL_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end

    local username = trim(payload.username):lower()
    local password = payload.password
    if username == '' or type(password) ~= 'string' or password == '' then
        return fail('Nothing to save')
    end
    if #username > 64 then return fail('Username must be 64 characters or fewer') end
    if #password > 64 then return fail('Password must be 64 characters or fewer') end
    local email = trim(payload.email):lower()
    if email ~= '' and not email:find('@', 1, true) then email = email .. '@' .. MAIL_DOMAIN end
    if #email > 120 then return fail('That email address looks invalid') end
    local phone = digits(payload.phone)
    if #phone > 20 then return fail('That phone number looks invalid') end

    store.saveVaultEntry(cid, app, username, password,
        email ~= '' and email or nil,
        phone ~= '' and phone or nil)
    return ok()
end

---Returns the caller's own vault entries; empty for an unresolvable identity.
---@param source number player server id
---@return table envelope data = { entries }
function actions.listPasswords(source)
    local cid = player.getIdentifier(source)
    if not cid then return ok({ entries = {} }) end
    return ok({ entries = store.listVaultEntries(cid) })
end

---Deletes one vault entry, scoped to the caller's citizenid; the id must be a finite integer.
---@param source number player server id
---@param payload { id?: number }|nil
---@return table envelope
function actions.deletePassword(source, payload)
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end
    local id = tonumber(payload and payload.id)
    if not id or id ~= id or id == math.huge or id == -math.huge or id ~= math.floor(id) then
        return fail('Entry not found')
    end
    store.deleteVaultEntry(cid, id)
    return ok()
end

---Returns the caller's own phone number.
---@param source number player server id
---@return table envelope data = { number }
function actions.myNumber(source)
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end
    return ok({ number = settings.getPhoneNumber(cid) })
end

---Returns the first mail account this character is signed into; nil when signed out of Mail.
---@param source number player server id
---@return table envelope data = { email? }
function actions.myEmail(source)
    local cid = player.getIdentifier(source)
    if not cid then return ok({}) end
    local accounts = mailStore.listAccountsForCitizen(cid)
    local first = accounts[1]
    return ok({ email = first and first.email or nil })
end

---Resolves an export-supplied (app, username) pair to a full account row, nil for an unknown
---app or blank/non-string username; the username is trimmed and lowercased.
---@param app any account app key (must be in ALL_APPS)
---@param username any account username
---@return table|nil account full store row, passwordHash included
local function exportAccount(app, username)
    if type(app) ~= 'string' or not ALL_APPS[app] then return nil end
    if type(username) ~= 'string' then return nil end
    local u = trim(username):lower()
    if u == '' then return nil end
    return store.getAccount(app, u)
end

---Returns whether an account exists for `app`.
---@param app string account app key
---@param username string account username
---@return boolean exists
function actions.accountExists(app, username)
    return exportAccount(app, username) ~= nil
end

---Returns one account in its public shape, or nil when the app is unknown or no such account
---exists.
---@param app string account app key
---@param username string account username
---@return table|nil account public shape
function actions.getPublicAccount(app, username)
    local acc = exportAccount(app, username)
    return acc and publicAccount(acc) or nil
end

---Returns the account a citizen is currently signed into for `app`, in public shape; nil on
---any miss.
---@param app string account app key
---@param citizenid string framework per-character id
---@return table|nil account public shape
function actions.getPublicSession(app, citizenid)
    if type(app) ~= 'string' or not ALL_APPS[app] then return nil end
    if type(citizenid) ~= 'string' or citizenid == '' then return nil end
    local acc = store.getSessionAccount(app, citizenid)
    return acc and publicAccount(acc) or nil
end

return actions
