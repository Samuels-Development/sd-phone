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
---@type table<string, boolean> Apps offering the in-app account switcher. Squawk owns its own
---register/login because it writes a profile row beside the account, so adding it to DIRECT_APPS
---would let the generic register mint an account with no profile; switching only moves a session.
local SWITCH_APPS    = { photogram = true, cherry = true, vibez = true, ryde = true, birdy = true }
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

---@type table Accounts limits (configs/accounts.lua).
local ACCT_CFG = config.Accounts or {}

---How many accounts one character may create in an app; 0 means unlimited.
---@param app string account app key
---@return integer limit
local function accountLimit(app)
    local per = type(ACCT_CFG.PerApp) == 'table' and ACCT_CFG.PerApp[app] or nil
    local n = tonumber(per) or tonumber(ACCT_CFG.MaxPerApp) or 1
    return n < 0 and 0 or math.floor(n)
end

---@type fun(app: string): integer Public alias, so an app that owns its own registration (Mail)
---caps itself from configs/accounts.lua instead of carrying a second number of its own.
actions.accountLimit = accountLimit

---The refusal to hand back when `cid` has already created as many accounts in `app` as the
---config allows; nil while there is room. 0 configured means unlimited.
---@param app string account app key
---@param count integer accounts this character has created in the app
---@return string|nil refusal
function actions.accountCapMessage(app, count)
    local limit = accountLimit(app)
    if limit <= 0 or count < limit then return nil end
    return limit == 1
        and 'You already have an account for this app'
        or ('You can have at most %d accounts for this app'):format(limit)
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
---recovery contacts (at least one required, each unique per app), and display name. Pass the
---caller's citizenid so a recovery number they do not own is refused; every client-reachable
---path has one, and the guard lives here rather than in a caller so no route can skip it.
---@param app string account app key (already validated)
---@param payload table|nil client-supplied { username, password, name?, email?, phone? }
---@param cid string|nil caller citizenid; when given, the recovery phone must be theirs
---@return table envelope on success data = { account }
function actions.createAccount(app, payload, cid)
    payload = payload or {}
    local username, ue = validUsername(app, payload.username); if not username then return fail(ue) end
    local password, pe = validPassword(payload.password); if not password then return fail(pe) end
    local email, ee = validEmail(payload.email); if ee then return fail(ee) end
    local phone, he = validPhone(payload.phone); if he then return fail(he) end

    -- Recovery codes go to this number, so one the caller does not own is useless to them and
    -- lets a character sidestep the per-app contact-uniqueness cap below.
    if phone and cid then
        local mine = digits(settings.getPhoneNumber(cid))
        if mine ~= '' and phone ~= mine then
            return fail('Use your own phone number so you can recover the account')
        end
    end
    if not email and not phone then
        return fail('Add an email or phone number so you can recover the account')
    end
    local displayName = trim(payload.name)
    if displayName == '' then displayName = username end
    if #displayName > 50 then return fail('Name must be 50 characters or fewer') end

    if store.getAccount(app, username) then return fail('That username is taken') end

    -- Accounts may share a recovery email and number; what caps a character is how many they
    -- have created here. Usernames stay unique per app, so the accounts remain distinguishable.
    if cid then
        local capped = actions.accountCapMessage(app, store.countAccountsFor(app, cid))
        if capped then return fail(capped) end
    end

    local id = store.insertAccount(app, username, displayName, store.hashPassword(password), email, phone, cid)
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
    if not util.cooldown(cid, 'accounts:register', 1500) then return fail('Slow down') end
    -- Failed attempts count too, and a player setting up all four apps hits several of them
    -- ('username taken', weak password), so the budget has to clear a whole first-session setup.
    if not util.rateLimit(cid, 'accounts:register', 600000, 30) then
        return fail('Too many sign-up attempts. Try again shortly')
    end

    local res = actions.createAccount(app, payload, cid)
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
    -- SWITCH_APPS rather than DIRECT_APPS: Squawk registers itself, but it still needs a plain
    -- logout, or its only exit is signOutOrSwitch and it can never reach a signed-out state.
    if not SWITCH_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source)
    if cid then store.clearSession(app, cid) end
    return ok()
end

---Signs `cid` out of every account in one app, or out of every account app at once when `app` is
---nil. Ends sessions only: vault entries are left alone, so Settings > Passwords still offers a
---one-tap way back in.
---@param cid string framework per-character id
---@param app? string account app key; nil clears every app the engine knows
---@return integer signedOut accounts the caller was signed out of
function actions.signOutEverywhere(cid, app)
    local signedOut = 0

    -- Mail predates the engine and keeps its sessions in its own table, so it is never covered by
    -- the shared session clears below.
    if app == nil or app == 'mail' then
        for _, acc in ipairs(mailStore.listAccountsForCitizen(cid)) do
            if mailStore.removeSession(acc.email, cid) then signedOut = signedOut + 1 end
        end
    end

    if app == nil then
        signedOut = signedOut + store.clearAllSessions(cid)
    elseif app ~= 'mail' then
        signedOut = signedOut + store.clearSession(app, cid)
    end

    return signedOut
end

---How many accounts the caller has in `app` against the configured cap, plus the refusal to show
---when they are at it. Read-only; the create paths enforce the same cap themselves.
---@param source number player server id
---@param payload table|nil client-supplied { app }
---@return table envelope on success data = { limit, count, canCreate, message? }
function actions.capacity(source, payload)
    local app = payload and payload.app
    if not ALL_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end

    -- Mail predates the engine, so its mailboxes are counted off its own created_by_cid rather
    -- than the engine's account table, exactly as its own create path does.
    local key = tostring(app)
    local count = key == 'mail'
        and mailStore.countAccountsCreatedBy(cid)
        or store.countAccountsFor(key, cid)

    local capped = actions.accountCapMessage(key, count)
    return ok({ limit = accountLimit(key), count = count, canCreate = capped == nil, message = capped })
end

---Signs the caller out of one app's accounts, or out of every account app when no app is given.
---@param source number player server id
---@param payload table|nil client-supplied { app? }
---@return table envelope on success data = { signedOut }
function actions.signOutAll(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local app = payload.app
    if app ~= nil and not ALL_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end
    if not util.cooldown(cid, 'accounts:signOutAll', 1000) then return fail('Slow down') end

    return ok({ signedOut = actions.signOutEverywhere(cid, app) })
end

---The caller's saved logins for one app, as switch targets: username + display name, and which
---one is signed in. Passwords never leave the server.
---@param source number player server id
---@param payload table|nil client-supplied { app }
---@return table envelope on success data = { accounts, active }
function actions.switchable(source, payload)
    local app = payload and payload.app
    if not SWITCH_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end

    local current = store.getSessionAccount(app, cid)
    local out = {}
    for _, row in ipairs(store.listVaultEntries(cid)) do
        if row.app == app then
            local acc = store.getAccount(app, row.username)
            if acc then
                out[#out + 1] = { username = acc.username, name = acc.displayName, email = acc.email }
            end
        end
    end
    return ok({ accounts = out, active = current and current.username or nil })
end

---Signs the caller into another of their own saved accounts without retyping the password. The
---vault is a convenience, not an authority: its stored password is verified against the account,
---so a stale entry fails rather than granting access.
---@param source number player server id
---@param payload table|nil client-supplied { app, username }
---@return table envelope on success data = { me }
function actions.switchAccount(source, payload)
    payload = payload or {}
    local app = payload.app
    if not SWITCH_APPS[app] then return fail('Unknown app') end
    local cid = player.getIdentifier(source); if not cid then return fail('Player not found') end
    if not util.cooldown(cid, 'accounts:switch', 500) then return fail('Slow down') end

    local username = trim(payload.username):lower()
    if username == '' then return fail('Pick an account') end

    local saved
    for _, row in ipairs(store.listVaultEntries(cid)) do
        if row.app == app and row.username:lower() == username then saved = row break end
    end
    if not saved then return fail('No saved password for that account') end

    local acc = store.getAccount(app, saved.username)
    if not acc or not actions.verifyPassword(acc, saved.password) then
        return fail('Saved password no longer works. Sign in again')
    end

    store.setSession(app, cid, acc.id)
    return ok({ me = publicAccount(acc) })
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

---Resolves a recovery identity (a username, or the email or phone number on file) to the single
---matching account and its delivery channel; ambiguity or no match returns an error.
---@param app string account app key
---@param raw string trimmed client-supplied identity
---@return table|nil acc matched account
---@return string|nil channel 'email' or 'sms'
---@return string|nil err
local function resolveRecovery(app, raw)
    if raw == '' then return nil, nil, 'Enter the username, email or phone number on the account' end

    -- A username names exactly one account, so it is the only identity that still resolves once
    -- several accounts share a recovery contact. Identity and delivery are separate here: the
    -- name picks the account, its stored contact decides where the code goes. Mail usernames are
    -- addresses, which is why an address identifies the mailbox rather than being the
    -- destination - a code sent to the mailbox you are locked out of is no use.
    local named = raw:lower()
    if app == 'mail' and not named:find('@', 1, true) then named = named .. '@' .. MAIL_DOMAIN end
    local byName = store.getAccount(app, named)
    if byName then
        local canEmail = app ~= 'mail' and byName.email and byName.email ~= ''
        local canSms   = byName.phone and byName.phone ~= ''
        if canEmail then return byName, 'email', nil end
        if canSms   then return byName, 'sms',   nil end
        return nil, nil, 'That account has no email or phone number to send a code to'
    end

    local email, phone, channel
    if raw:find('@', 1, true) or raw:match('%a') then
        if app == 'mail' then
            return nil, nil, 'No Mail account uses that address'
        end
        local e = raw:lower()
        if not e:find('@', 1, true) then e = e .. '@' .. MAIL_DOMAIN end
        email, channel = e, 'email'
    else
        local p = digits(raw)
        if #p < 7 or #p > 15 then return nil, nil, 'Enter the username, email or phone number on the account' end
        phone, channel = p, 'sms'
    end

    local matches = store.findAccountsByContact(app, email, phone)
    if #matches == 0 then return nil, nil, 'No account uses that contact' end
    if #matches > 1 then
        return nil, nil, 'More than one account uses that contact. Enter the account username instead'
    end
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

---Every mail address this character is signed into, for the recovery-email quick fill. `email` is
---the first and is kept so an older UI build still fills something.
---@param source number player server id
---@return table envelope data = { email?, emails }
function actions.myEmail(source)
    local cid = player.getIdentifier(source)
    if not cid then return ok({ emails = {} }) end
    local emails = {}
    for _, acc in ipairs(mailStore.listAccountsForCitizen(cid)) do
        if acc.email and acc.email ~= '' then emails[#emails + 1] = acc.email end
    end
    return ok({ email = emails[1], emails = emails })
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
