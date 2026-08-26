---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'
---@type table sd-phone config root (configs/config.lua): Messages.MaxBodyLength body cap.
local config = require 'configs.config'
---@type table Authoritative message handlers (server.messages.actions): systemText delivery.
local actions = require 'server.messages.actions'
---@type table Messages persistence layer (server.messages.store): identity-keyed thread reads.
local store = require 'server.messages.store'
---@type table Contacts persistence layer (server.contacts.store): saved-name resolution for titles.
local contacts = require 'server.contacts.store'
---@type table Settings persistence layer (server.settings.store): number <-> identity mapping.
local settings = require 'server.settings.store'
---@type table Player bridge (bridge.server.player): identity resolution from a server id.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): digit/trim/number-format sanitizers.
local util = require 'server.util'

---@type table Messages module; the table returned at end of file. Exposes the app-attributed send
---so events.lua can answer the legacy dispatch events with the same delivery.
local messages = {}

local registerExport, registerPro, warnOnce = shim.registerExport, shim.registerPro, shim.warnOnce

---@type integer Messages returned per thread when the caller names no cap.
local THREAD_PAGE <const> = 100

---The mailbox identity behind a qs-smartphone argument. The docs say these exports accept "the
---specified player or phone number", so a server id, an identity and a number all resolve.
---@param who any server id, data identity or phone number
---@return string|nil citizenid
local function identityOf(who)
    local src = tonumber(who)
    if src and GetPlayerName(src) then return player.getIdentifier(src) end

    local digits = shim.digits(who)
    if digits then
        local cid = settings.getCitizenByNumber(digits)
        if cid then return cid end
    end
    return type(who) == 'string' and who ~= '' and who or nil
end

---A stable digit short code for an app name, so every message a named app sends files under one
---thread. sd-phone keys a thread by its peer NUMBER, and an app is not a number, so one is minted
---from the name; the 9-prefix keeps it clear of a generated player number.
---@param appName string
---@return string
local function codeFor(appName)
    local hash = 0
    for i = 1, #appName do
        hash = (hash * 31 + appName:byte(i)) % 1000000
    end
    return ('9%05d'):format(hash)
end

---A thread's display title in the owner's own address book: the saved contact name, else the
---formatted number.
---@param book table<string, string> digits -> saved name
---@param conversation string thread key
---@return string
local function titleOf(book, conversation)
    if conversation:sub(1, 2) == 'g-' then return 'Group' end
    return book[util.digits(conversation)] or util.formatNumber(conversation)
end

---Delivers one app-attributed system text into a mailbox, exactly as the Messages app would show
---it. Returns false when the recipient has no number on record.
---@param appName any display name the thread is attributed to
---@param targetNumber any recipient phone number
---@param message any body
---@return boolean delivered, string|nil messageId
function messages.fromApp(appName, targetNumber, message)
    local name = shim.str(appName)
    if name == '' then name = 'Service' end
    name = name:sub(1, 64)

    local target = shim.digits(targetNumber)
    if not target then return false end

    local text = shim.str(message)
    local maxBody = config.Messages.MaxBodyLength
    if #text > maxBody then text = text:sub(1, maxBody) end
    if text == '' then return false end

    return actions.systemText(codeFor(name), name, target, text)
end

---GetMessageConversations(source): every conversation in the mailbox as { ok, threads }. Read from
---the store rather than the source-keyed action so an offline player or a bare number still
---resolves, which is what the docs promise.
registerExport('GetMessageConversations', function(source)
    local cid = identityOf(source)
    if not cid then return { ok = false, threads = {} } end

    local book = {}
    for _, row in ipairs(contacts.listContacts(cid) or {}) do
        local digits = util.digits(row.phone or '')
        if digits ~= '' then book[digits] = row.name end
    end

    local threads = {}
    for _, row in ipairs(store.threadPreviews(cid)) do
        threads[#threads + 1] = {
            id           = row.conversation,
            title        = titleOf(book, row.conversation),
            number       = row.conversation,
            unread       = math.floor(tonumber(row.unread) or 0),
            group        = row.conversation:sub(1, 2) == 'g-',
            lastMessage  = row.body or '',
            lastSender   = row.sender,
            timestamp    = math.floor(tonumber(row.created_at) or 0),
        }
    end
    return { ok = true, threads = threads }
end)

---GetThreadMessages(source, threadId, limit): one conversation's history as { ok, items }. The docs
---mention pagination without ever naming its arguments, so a trailing row cap is accepted and an
---offset is not.
registerExport('GetThreadMessages', function(source, threadId, limit)
    local cid = identityOf(source)
    local conversation = type(threadId) == 'string' and threadId or shim.digits(threadId)
    if not cid or not conversation then return { ok = false, items = {} } end

    local items = {}
    for _, row in ipairs(store.threadMessages(cid, conversation, tonumber(limit) or THREAD_PAGE)) do
        items[#items + 1] = {
            id        = row.id,
            messageId = row.mid,
            text      = row.body or '',
            kind      = row.kind,
            sender    = row.sender,
            direction = row.direction,
            read      = util.truthy(row.is_read),
            timestamp = math.floor(tonumber(row.created_at) or 0),
        }
    end
    return { ok = true, items = items }
end)

---GetMessageUnreadCount(source): the mailbox's unread tally. Returns the documented TABLE, not a
---number, so a caller reading .unreadTotal off it still works.
registerExport('GetMessageUnreadCount', function(source)
    local cid = identityOf(source)
    return { unreadTotal = cid and store.unreadCount(cid) or 0 }
end)

---SendNewMessageFromApp(source, appName, message): the V3 three-argument form. The thread is
---attributed to the app name and files under a short code minted from it.
registerExport('SendNewMessageFromApp', function(source, appName, message)
    local cid = identityOf(source)
    local number = cid and settings.ensurePhoneNumber(cid) or nil
    if not number then return false end
    return (messages.fromApp(appName, number, message))
end)

---sendNewMessageFromApp(source, phoneNumber, message, appName): the PRO four-argument form, which
---names the recipient number second and the app LAST. Forwarding the V3 order positionally would
---send the message as the app name, so the two are registered separately.
---
---`source` only picks the sender's mailbox in PRO; here the number argument already addresses the
---recipient, so it is used only when the number is missing.
registerPro('sendNewMessageFromApp', function(source, phoneNumber, message, appName)
    local target = shim.digits(phoneNumber)
    if not target then
        local cid = identityOf(source)
        target = cid and settings.ensurePhoneNumber(cid) or nil
    end
    if not target then return false end
    return (messages.fromApp(appName, target, message))
end)

---SendNewMessageFromApp on the PRO name as well: a caller that only swapped the resource string in
---a community bridge keeps the V3 argument order.
registerPro('SendNewMessageFromApp', function(source, appName, message)
    warnOnce('pro.SendNewMessageFromApp', ('SendNewMessageFromApp was called on qs-smartphone-pro (by %s); the PascalCase name carries the V3 (source, appName, message) order, which is what was used'):format(GetInvokingResource() or 'unknown'))
    local cid = identityOf(source)
    local number = cid and settings.ensurePhoneNumber(cid) or nil
    if not number then return false end
    return (messages.fromApp(appName, number, message))
end)

return messages
