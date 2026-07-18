---@type table sd-phone config root (configs/config.lua): aggregated per-app config tables.
local config      = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name lookups from a live source,
---plus citizenid -> source resolution for the delivery fan-out.
local player      = require 'bridge.server.player'
---@type table Mail persistence layer (server.mail.store): account-row CRUD + in-row JSON message ops.
local store       = require 'server.mail.store'
---@type table Accounts-engine persistence (server.accounts.store): cross-app contact-uniqueness lookups.
local acctStore   = require 'server.accounts.store'
---@type table Accounts-engine actions (server.accounts.actions): credential mirror + password verify.
local acctActions = require 'server.accounts.actions'
---@type table Home-screen badge engine (server.badges.init): recomputes + pushes unread counts.
local badges      = require 'server.badges.init'

---@type table Mail app config (configs/mail.lua): domain, length limits, per-player caps.
local mailCfg = config.Mail

---@type table Actions module; the table returned at end of file.
local actions = {}

-- Server-side compose caps.
---@type integer Max recipients accepted per send/draft; larger lists are rejected outright.
local MAX_RECIPIENTS = 20
---@type integer Subject cap (chars); longer subjects are truncated.
local MAX_SUBJECT_LEN = 200
---@type integer Body cap (chars); longer bodies are truncated.
local MAX_BODY_LEN = 10000
---@type integer Sign-in password length bound: the larger of mailCfg.MaxPasswordLength and 64.
local MAX_SIGNIN_PASSWORD_LEN = math.max(mailCfg.MaxPasswordLength, 64)

local util = require 'server.util'
local ok, fail, trim = util.ok, util.fail, util.trim


---Resolves a connected source to its citizenid + display name.
---@param source number
---@return { cid: string, name: string }|nil
local function whois(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    return { cid = cid, name = player.getName(source) }
end


---Permissive email-format check for recipient addresses: an `@` with non-empty local + host
---parts, no whitespace, and a host that is the configured domain or contains at least one `.`.
---@param email string
---@return boolean
local function looksLikeEmail(email)
    if type(email) ~= 'string' then return false end
    if email:find('%s') then return false end
    local at = email:find('@', 1, true)
    if not at or at == 1 or at == #email then return false end
    local host = email:sub(at + 1)
    if host:lower() == mailCfg.Domain then return true end
    if not host:find('.', 1, true) then return false end
    return true
end

---Normalizes a player-supplied own address (bare username or full email) into the canonical
---local@Domain form. Foreign domains are rejected; the finished address is length-capped.
---@param raw any
---@return string|nil normalized, string? message
local function validateEmail(raw)
    local trimmed = trim(raw):lower()
    local at = trimmed:find('@', 1, true)
    local localPart = at and trimmed:sub(1, at - 1) or trimmed
    if at and trimmed:sub(at + 1) ~= mailCfg.Domain then
        return nil, ('Email addresses are @%s only'):format(mailCfg.Domain)
    end
    if #localPart < 2 then
        return nil, 'Username must be at least 2 characters'
    end
    if not localPart:match('^[%w][%w%.%_%-]*$') then
        return nil, 'Letters, numbers, dots, dashes and _ only'
    end
    local email = localPart .. '@' .. mailCfg.Domain
    if #email > mailCfg.MaxEmailLength then
        return nil, ('Email must be %d characters or fewer'):format(mailCfg.MaxEmailLength)
    end
    return email, nil
end

---Validates password length against the configs/mail.lua bounds.
---@param raw any
---@return string|nil normalized, string? message
local function validatePassword(raw)
    if type(raw) ~= 'string' then return nil, 'Password is required' end
    if #raw < mailCfg.MinPasswordLength then
        return nil, ('Password must be at least %d characters'):format(mailCfg.MinPasswordLength)
    end
    if #raw > mailCfg.MaxPasswordLength then
        return nil, ('Password must be %d characters or fewer'):format(mailCfg.MaxPasswordLength)
    end
    return raw, nil
end

---Validates display-name length against the configs/mail.lua bounds; the name is trimmed.
---@param raw any
---@return string|nil normalized, string? message
local function validateDisplayName(raw)
    local trimmed = trim(raw)
    if #trimmed < mailCfg.MinNameLength then
        return nil, ('Name must be at least %d character%s'):format(
            mailCfg.MinNameLength,
            mailCfg.MinNameLength == 1 and '' or 's'
        )
    end
    if #trimmed > mailCfg.MaxNameLength then
        return nil, ('Name must be %d characters or fewer'):format(mailCfg.MaxNameLength)
    end
    return trimmed, nil
end

---Reshapes a hydrated store account into the React `MailAccount` shape; password_hash and the
---logged_in_citizens session list are omitted.
---@param acc { email: string, display_name: string }
---@return { id: string, name: string, email: string }
local function serializeAccount(acc)
    return { id = acc.email, name = acc.display_name, email = acc.email }
end

---Reshapes a hydrated message into the React `MailMessage` shape, injecting `accountId` and
---filling fallbacks for rows written by older builds.
---@param accountEmail string
---@param msg table
---@return table
local function serializeMessage(accountEmail, msg)
    return {
        id        = msg.id,
        accountId = accountEmail,
        folder    = msg.folder    or 'inbox',
        from      = msg.from      or { name = '', email = '' },
        to        = msg.to        or {},
        subject   = msg.subject   or '',
        body      = msg.body      or '',
        sentAt    = msg.sentAt    or '',
        read      = msg.read      == true,
        flagged   = msg.flagged   == true,
    }
end

---Public alias used by init.lua's mailbox export.
actions.serializeMessage = serializeMessage

---Delivery fan-out: resolves each entry's citizenid to a live source and, when online, sends
---the message as a live UI event, a phone banner, and a badge repush. Offline citizens are
---skipped.
---@param pushes { citizenid: string, message: table }[]
function actions.deliver(pushes)
    if type(pushes) ~= 'table' then return end
    for i = 1, #pushes do
        local src = player.getSourceByIdentifier(pushes[i].citizenid)
        if src then
            local msg  = pushes[i].message
            local from = msg.from or {}
            TriggerClientEvent('sd-phone:client:mail:received', src, msg)
            TriggerClientEvent('sd-phone:client:notify', src, {
                app = 'mail', appId = 'mail',
                title = (from.name and from.name ~= '') and from.name or (from.email or 'Mail'),
                body  = (msg.subject and msg.subject ~= '') and msg.subject or 'New email',
                time  = 'now', quietInApp = true,
            })
            badges.push(src)
        end
    end
end

---Loads the full Mail snapshot for the calling player: every account their citizenid is signed
---into and every message inside those accounts. Read-only.
---@param source number
---@return table
function actions.list(source)
    local me = whois(source); if not me then return fail('Player not found') end
    local accounts = store.listAccountsForCitizen(me.cid)

    local outAccounts = {}
    local outMessages = {}
    for i = 1, #accounts do
        local acc = accounts[i]
        outAccounts[i] = serializeAccount(acc)
        for j = 1, #acc.messages do
            outMessages[#outMessages + 1] = serializeMessage(acc.email, acc.messages[j])
        end
    end

    return ok({ accounts = outAccounts, messages = outMessages })
end

---Creates a brand-new email account and signs the caller straight into it. Every field is
---validated server-side; the password is hashed and mirrored into the accounts engine.
---@param source number
---@param payload { email?: string, password?: string, displayName?: string, phone?: string }
---@return table
function actions.signUp(source, payload)
    payload = payload or {}
    local me = whois(source); if not me then return fail('Player not found') end

    local email, ee = validateEmail(payload.email); if not email then return fail(ee) end
    local password, pe = validatePassword(payload.password); if not password then return fail(pe) end
    local displayName, ne = validateDisplayName(payload.displayName); if not displayName then return fail(ne) end

    local phone = (tostring(payload.phone or '')):gsub('%D', '')
    if phone ~= '' and (#phone < 7 or #phone > 15) then
        return fail('That phone number looks invalid')
    end
    if phone ~= '' and #acctStore.findAccountsByContact('mail', nil, phone) > 0 then
        return fail('That phone number is already in use')
    end

    if store.getAccount(email) then
        return fail('That email is already registered')
    end

    local sessions = store.listAccountsForCitizen(me.cid)
    if #sessions >= mailCfg.MaxAccountsPerPlayer then
        return fail(('You can have at most %d accounts signed in'):format(mailCfg.MaxAccountsPerPlayer))
    end

    if not store.insertAccount(email, store.hashPassword(password), displayName) then
        return fail('Failed to create account')
    end
    store.addSession(email, me.cid)

    acctActions.createAccount('mail', {
        username = email, password = password, name = displayName,
        email = email, phone = phone ~= '' and phone or nil,
    })

    local acc = store.getAccount(email)
    if not acc then return fail('Account vanished after creation') end
    return ok({ account = serializeAccount(acc) })
end

---Signs into an existing email account; any player who knows the password may sign in. The
---accounts engine is verified first, then the legacy hash column. Idempotent.
---@param source number
---@param payload { email?: string, password?: string }
---@return table
function actions.signIn(source, payload)
    payload = payload or {}
    local me = whois(source); if not me then return fail('Player not found') end

    local email, ee = validateEmail(payload.email); if not email then return fail(ee) end
    if type(payload.password) ~= 'string' or payload.password == '' then
        return fail('Password is required')
    end
    if #payload.password > MAX_SIGNIN_PASSWORD_LEN then
        return fail('Email or password is incorrect')
    end

    local acc = store.getAccount(email)
    local valid = false
    if acc then
        local engineAcc = acctStore.getAccount('mail', email)
        if engineAcc then valid = acctActions.verifyPassword(engineAcc, payload.password) end
        if not valid then valid = acc.password_hash == store.hashPassword(payload.password) end
    end
    if not valid then
        return fail('Email or password is incorrect')
    end

    local sessions = store.listAccountsForCitizen(me.cid)
    for i = 1, #sessions do
        if sessions[i].email == email then
            return ok({ account = serializeAccount(acc) })
        end
    end
    if #sessions >= mailCfg.MaxAccountsPerPlayer then
        return fail(('You can have at most %d accounts signed in'):format(mailCfg.MaxAccountsPerPlayer))
    end

    store.addSession(email, me.cid)
    return ok({ account = serializeAccount(acc) })
end

---Signs out of an account on this player's phone; the account survives, only the caller's
---session is dropped.
---@param source number
---@param payload { email?: string }
---@return table
function actions.signOut(source, payload)
    payload = payload or {}
    local me = whois(source); if not me then return fail('Player not found') end

    local email = trim(payload.email):lower()
    if email == '' then return fail('Email is required') end

    store.removeSession(email, me.cid)
    return ok({ email = email })
end

---Sends a new message: persists a `sent` copy on the sender and an `inbox` copy on every
---recipient that exists, returning the signed-in citizenids for the delivery fan-out.
---@param source number
---@param payload { fromEmail?: string, to?: string[], subject?: string, body?: string }
---@return table
function actions.send(source, payload)
    payload = payload or {}
    local me = whois(source); if not me then return fail('Player not found') end

    local fromEmail = trim(payload.fromEmail):lower()
    if fromEmail == '' then return fail('Sender account is required') end

    local sender = store.getAccount(fromEmail)
    if not sender then return fail('Sender account not found') end

    local owns = false
    for i = 1, #sender.logged_in_citizens do
        if sender.logged_in_citizens[i] == me.cid then owns = true; break end
    end
    if not owns then return fail('You are not signed into that account') end

    local toRaw = payload.to or {}
    if type(toRaw) ~= 'table' or #toRaw == 0 then return fail('At least one recipient is required') end
    if #toRaw > MAX_RECIPIENTS then return fail('Too many recipients') end

    local recipients = {}
    local seen = {}
    for i = 1, #toRaw do
        local addr = trim(toRaw[i]):lower()
        if addr ~= '' and #addr <= mailCfg.MaxEmailLength and not seen[addr] and looksLikeEmail(addr) then
            recipients[#recipients + 1] = addr
            seen[addr] = true
        end
    end
    if #recipients == 0 then return fail('No valid recipient addresses') end

    local subject = trim(payload.subject)
    if #subject > MAX_SUBJECT_LEN then subject = subject:sub(1, MAX_SUBJECT_LEN) end
    local body    = type(payload.body) == 'string' and payload.body or ''
    if #body > MAX_BODY_LEN then body = body:sub(1, MAX_BODY_LEN) end
    local sentAt  = os.date('!%Y-%m-%dT%H:%M:%S')

    local sentMessage = {
        id      = store.newId(),
        folder  = 'sent',
        from    = { name = sender.display_name, email = sender.email },
        to      = recipients,
        subject = subject,
        body    = body,
        sentAt  = sentAt,
        read    = true,
        flagged = false,
    }
    store.appendMessage(sender.email, sentMessage, mailCfg.MaxMessagesPerAccount)

    local pushes = {}
    for i = 1, #recipients do
        local addr = recipients[i]
        local recipient = store.getAccount(addr)
        if recipient then
            local inboxMessage = {
                id      = store.newId(),
                folder  = 'inbox',
                from    = { name = sender.display_name, email = sender.email },
                to      = recipients,
                subject = subject,
                body    = body,
                sentAt  = sentAt,
                read    = false,
                flagged = false,
            }
            store.appendMessage(addr, inboxMessage, mailCfg.MaxMessagesPerAccount)

            for j = 1, #recipient.logged_in_citizens do
                pushes[#pushes + 1] = {
                    citizenid = recipient.logged_in_citizens[j],
                    message   = serializeMessage(addr, inboxMessage),
                }
            end
        end
    end

    ---First-party send announcement, fired once per compose.
    TriggerEvent('sd-phone:server:mail:sent', {
        system    = false,
        id        = sentMessage.id,
        citizenid = me.cid,
        from      = { name = sender.display_name, email = sender.email },
        to        = recipients,
        subject   = subject,
        body      = body,
        sentAt    = sentAt,
    })

    return ok({
        sent   = serializeMessage(sender.email, sentMessage),
        pushes = pushes,
    })
end

---Composes and delivers mail as the system: no sender account, no ownership proof, no sent
---copy. Persists an `inbox` copy on every recipient that exists, then runs the fan-out.
---@param mail { to: string|string[], subject?: string, body?: string, from?: { name?: string, email?: string } }
---@return table envelope; data.delivered counts recipient accounts that existed
function actions.systemSend(mail)
    if type(mail) ~= 'table' then return fail('Mail payload must be a table') end

    local toRaw = type(mail.to) == 'string' and { mail.to } or mail.to
    if type(toRaw) ~= 'table' or #toRaw == 0 then return fail('At least one recipient is required') end
    if #toRaw > MAX_RECIPIENTS then return fail('Too many recipients') end

    local recipients = {}
    local seen = {}
    for i = 1, #toRaw do
        local addr = trim(toRaw[i]):lower()
        if addr ~= '' and #addr <= mailCfg.MaxEmailLength and not seen[addr] and looksLikeEmail(addr) then
            recipients[#recipients + 1] = addr
            seen[addr] = true
        end
    end
    if #recipients == 0 then return fail('No valid recipient addresses') end

    local from = type(mail.from) == 'table' and mail.from or {}
    local fromName = trim(from.name)
    if fromName == '' then fromName = 'System' end
    if #fromName > mailCfg.MaxNameLength then fromName = fromName:sub(1, mailCfg.MaxNameLength) end
    local fromEmail = trim(from.email):lower()
    if fromEmail == '' then fromEmail = 'no-reply@' .. mailCfg.Domain end
    if #fromEmail > mailCfg.MaxEmailLength then fromEmail = fromEmail:sub(1, mailCfg.MaxEmailLength) end

    local subject = trim(mail.subject)
    if #subject > MAX_SUBJECT_LEN then subject = subject:sub(1, MAX_SUBJECT_LEN) end
    local body = type(mail.body) == 'string' and mail.body or ''
    if #body > MAX_BODY_LEN then body = body:sub(1, MAX_BODY_LEN) end
    local sentAt = os.date('!%Y-%m-%dT%H:%M:%S')

    local delivered = 0
    local sentId
    local pushes = {}
    for i = 1, #recipients do
        local addr = recipients[i]
        local recipient = store.getAccount(addr)
        if recipient then
            local inboxMessage = {
                id      = store.newId(),
                folder  = 'inbox',
                from    = { name = fromName, email = fromEmail },
                to      = recipients,
                subject = subject,
                body    = body,
                sentAt  = sentAt,
                read    = false,
                flagged = false,
            }
            store.appendMessage(addr, inboxMessage, mailCfg.MaxMessagesPerAccount)
            delivered = delivered + 1
            sentId = sentId or inboxMessage.id

            for j = 1, #recipient.logged_in_citizens do
                pushes[#pushes + 1] = {
                    citizenid = recipient.logged_in_citizens[j],
                    message   = serializeMessage(addr, inboxMessage),
                }
            end
        end
    end

    ---First-party send announcement (system shape), fired once before the fan-out.
    TriggerEvent('sd-phone:server:mail:sent', {
        system    = true,
        id        = sentId,
        from      = { name = fromName, email = fromEmail },
        to        = recipients,
        subject   = subject,
        body      = body,
        sentAt    = sentAt,
        delivered = delivered,
    })

    actions.deliver(pushes)
    return ok({ delivered = delivered })
end

---Saves the caller's compose as a draft on the sender account: same ownership proof and caps
---as `send`, persisting a single `drafts` copy and delivering to nobody.
---@param source number
---@param payload { fromEmail?: string, to?: string[], subject?: string, body?: string }
---@return table
function actions.saveDraft(source, payload)
    payload = payload or {}
    local me = whois(source); if not me then return fail('Player not found') end

    local fromEmail = trim(payload.fromEmail):lower()
    if fromEmail == '' then return fail('Sender account is required') end

    local sender = store.getAccount(fromEmail)
    if not sender then return fail('Sender account not found') end

    local owns = false
    for i = 1, #sender.logged_in_citizens do
        if sender.logged_in_citizens[i] == me.cid then owns = true; break end
    end
    if not owns then return fail('You are not signed into that account') end

    local recipients = {}
    local seen = {}
    local toRaw = payload.to
    if type(toRaw) == 'table' then
        if #toRaw > MAX_RECIPIENTS then return fail('Too many recipients') end
        for i = 1, #toRaw do
            local addr = trim(toRaw[i]):lower()
            if addr ~= '' and #addr <= mailCfg.MaxEmailLength and not seen[addr] and looksLikeEmail(addr) then
                recipients[#recipients + 1] = addr
                seen[addr] = true
            end
        end
    end

    local subject = trim(payload.subject)
    if #subject > MAX_SUBJECT_LEN then subject = subject:sub(1, MAX_SUBJECT_LEN) end
    local body = type(payload.body) == 'string' and payload.body or ''
    if #body > MAX_BODY_LEN then body = body:sub(1, MAX_BODY_LEN) end

    local draft = {
        id      = store.newId(),
        folder  = 'drafts',
        from    = { name = sender.display_name, email = sender.email },
        to      = recipients,
        subject = subject,
        body    = body,
        sentAt  = os.date('!%Y-%m-%dT%H:%M:%S'),
        read    = true,
        flagged = false,
    }
    store.appendMessage(sender.email, draft, mailCfg.MaxMessagesPerAccount)

    return ok({ draft = serializeMessage(sender.email, draft) })
end

---Ownership gate for the per-message mutators: the caller's citizenid must appear in the
---account's signed-in list.
---@param source number
---@param accountEmail string
---@return string|nil cid, table|nil err
local function requireOwnership(source, accountEmail)
    local me = whois(source); if not me then return nil, fail('Player not found') end
    if type(accountEmail) ~= 'string' or accountEmail == '' then return nil, fail('Account email is required') end
    local acc = store.getAccount(accountEmail); if not acc then return nil, fail('Account not found') end
    for i = 1, #acc.logged_in_citizens do
        if acc.logged_in_citizens[i] == me.cid then return me.cid, nil end
    end
    return nil, fail('You are not signed into that account')
end

---Marks a message as read. Ownership-gated; a bogus message id is a no-op.
---@param source number
---@param payload { accountEmail?: string, messageId?: string }
---@return table
function actions.markRead(source, payload)
    payload = payload or {}
    local _, err = requireOwnership(source, payload.accountEmail); if err then return err end
    store.mutateMessage(payload.accountEmail, payload.messageId or '', function(m)
        m.read = true
        return m
    end)
    return ok()
end

---Toggles a message's flag. Ownership-gated; the new state derives from the stored message.
---@param source number
---@param payload { accountEmail?: string, messageId?: string }
---@return table
function actions.toggleFlag(source, payload)
    payload = payload or {}
    local _, err = requireOwnership(source, payload.accountEmail); if err then return err end
    store.mutateMessage(payload.accountEmail, payload.messageId or '', function(m)
        m.flagged = not (m.flagged == true)
        return m
    end)
    return ok()
end

---Moves a message to the bin, or hard-deletes it if it's already there. The flag clears on the
---way in. Ownership-gated.
---@param source number
---@param payload { accountEmail?: string, messageId?: string }
---@return table
function actions.moveToBin(source, payload)
    payload = payload or {}
    local _, err = requireOwnership(source, payload.accountEmail); if err then return err end
    store.mutateMessage(payload.accountEmail, payload.messageId or '', function(m)
        if m.folder == 'bin' then return nil end
        m.folder = 'bin'
        m.flagged = false
        return m
    end)
    return ok()
end

---Moves a message to a specific folder, whitelist-checked against the five real folders.
---Moving into the bin clears the flag. Ownership-gated.
---@param source number
---@param payload { accountEmail?: string, messageId?: string, folder?: string }
---@return table
function actions.move(source, payload)
    payload = payload or {}
    local _, err = requireOwnership(source, payload.accountEmail); if err then return err end
    local folder = payload.folder
    if folder ~= 'inbox' and folder ~= 'drafts' and folder ~= 'sent' and folder ~= 'spam' and folder ~= 'bin' then
        return { success = false, message = 'Bad folder' }
    end
    store.mutateMessage(payload.accountEmail, payload.messageId or '', function(m)
        -- Returning nil would hard-delete; a same-folder move must be a no-op.
        if m.folder == folder then return m end
        m.folder = folder
        if folder == 'bin' then m.flagged = false end
        return m
    end)
    return ok()
end

---Hard-deletes a draft (and only a draft): used when an edited draft is re-sent or re-saved so
---the stale copy doesn't linger. Any other folder is left untouched. Ownership-gated.
---@param source number
---@param payload { accountEmail?: string, messageId?: string }
---@return table
function actions.discardDraft(source, payload)
    payload = payload or {}
    local _, err = requireOwnership(source, payload.accountEmail); if err then return err end
    store.mutateMessage(payload.accountEmail, payload.messageId or '', function(m)
        if m.folder ~= 'drafts' then return m end
        return nil
    end)
    return ok()
end

---Permanently deletes an account the caller is signed into, along with all its mail and
---sessions. Gated by the signed-in ownership check.
---@param source number
---@param payload { email?: string }
---@return table
function actions.deleteAccount(source, payload)
    payload = payload or {}
    local email = trim(payload.email or ''):lower()
    local _, err = requireOwnership(source, email); if err then return err end
    store.deleteAccount(email)
    return ok({ email = email })
end

return actions
