---@type table Shared shim helpers (server.compat.qssmartphone.shared): export registration + warn-once.
local shim = require 'server.compat.qssmartphone.shared'
---@type table Authoritative mail handlers (server.mail.actions): systemSend validation + fan-out.
local actions = require 'server.mail.actions'
---@type table Mail persistence layer (server.mail.store): account lookups by identity or address.
local store = require 'server.mail.store'
---@type table Settings persistence layer (server.settings.store): number -> identity mapping.
local settings = require 'server.settings.store'
---@type table Player bridge (bridge.server.player): identity resolution from a server id.
local player = require 'bridge.server.player'

---@type table Mail module; the table returned at end of file. Exposes the system send so events.lua
---answers the legacy mail events through exactly the same path as the exports.
local mail = {}

local registerExport, registerPro, warnOnce = shim.registerExport, shim.registerPro, shim.warnOnce

---The mail identity behind a qs-smartphone argument. The docs say the mail exports accept a player,
---an identifier or an email address, so all three resolve; an address short-circuits to itself.
---@param who any server id, data identity, phone number or email address
---@return string|nil citizenid, string|nil address when the argument was already an address
local function identityOf(who)
    if type(who) == 'string' and who:find('@', 1, true) then
        return nil, who:lower()
    end

    local src = tonumber(who)
    if src and GetPlayerName(src) then return player.getIdentifier(src) end

    local digits = shim.digits(who)
    if digits then
        local cid = settings.getCitizenByNumber(digits)
        if cid then return cid end
    end
    return type(who) == 'string' and who ~= '' and who or nil
end

---The address to deliver to for one argument: an address given outright, else the identity's first
---registered account in creation order. Nil when there is no mailbox to reach.
---@param who any
---@return string|nil
local function addressOf(who)
    local cid, address = identityOf(who)
    if address then return address end
    if not cid then return nil end

    local accounts = store.listAccountsForCitizen(cid)
    return accounts[1] and accounts[1].email or nil
end

---Sends one system mail to whoever `who` resolves to. `button` is the PRO Quest button, which
---sd-phone's Mail app has no counterpart for; it is reported once and dropped.
---@param who any recipient (player, identity, number or address)
---@param subject any
---@param body any
---@param from any sender display name
---@param button any
---@return boolean sent
function mail.send(who, subject, body, from, button)
    if button ~= nil then
        warnOnce('sendNewMail.button', ('mail Quest buttons are not supported (called by %s); the mail was delivered without its button, so any buttonEvent it carried will never fire'):format(GetInvokingResource() or 'unknown'))
    end

    local to = addressOf(who)
    if not to then return false end

    local sender = shim.str(from)
    local result = actions.systemSend({
        to      = to,
        subject = shim.str(subject),
        body    = shim.str(body),
        from    = sender ~= '' and { name = sender } or nil,
    })
    return result.success == true
end

---GetMailAccount(source): the player's registered mail account, or nil when they never made one.
---Accepts a player, an identifier or an email address, as the docs describe.
registerExport('GetMailAccount', function(source)
    local cid, address = identityOf(source)
    local account = address and store.getAccount(address) or nil
    if not account and cid then account = store.listAccountsForCitizen(cid)[1] end
    if not account then return nil end

    return { id = account.email, email = account.email, name = account.display_name }
end)

---SendMail(source, title, body): a system email straight into the player's mailbox. Delivered even
---while the recipient is offline, since it is written to the mailbox rather than pushed.
registerExport('SendMail', function(source, title, body)
    return mail.send(source, title, body, nil, nil)
end)

---sendMail(...): legacy, never documented. Its public call sites pass a payload table shaped like
---the mail event, so both (target, payload) and a lone self-addressed payload are read.
registerExport('sendMail', function(a, b)
    warnOnce('sendMail', ('sendMail is an undocumented legacy export (called by %s); its arguments were read loosely as a target plus a { sender, subject, message } payload'):format(GetInvokingResource() or 'unknown'))
    local payload = type(a) == 'table' and a or (type(b) == 'table' and b or nil)
    if not payload then return false end

    local who = type(a) == 'table' and (a.source or a.citizenid or a.identifier or a.number or a.email) or a
    return mail.send(who, payload.subject or payload.title, payload.message or payload.body,
        payload.sender, payload.button)
end)

---sendNewMailToOffline(...): legacy, never documented; the offline sibling of the mail event. Every
---sd-phone mail is written to the mailbox first and pushed second, so an offline recipient is the
---ordinary path rather than a separate one.
registerExport('sendNewMailToOffline', function(a, b)
    warnOnce('sendNewMailToOffline', ('sendNewMailToOffline is an undocumented legacy export (called by %s); sd-phone writes every mail to the mailbox first, so it was delivered through the ordinary send'):format(GetInvokingResource() or 'unknown'))
    local payload = type(a) == 'table' and a or (type(b) == 'table' and b or nil)
    if not payload then return false end

    local who = type(a) == 'table' and (a.source or a.citizenid or a.identifier or a.number or a.email) or a
    return mail.send(who, payload.subject or payload.title, payload.message or payload.body,
        payload.sender, payload.button)
end)

---sendNewMail(source, { sender, subject, message, button }): the PRO mail export.
registerPro('sendNewMail', function(source, payload)
    if type(payload) ~= 'table' then return false end
    return mail.send(source, payload.subject, payload.message, payload.sender, payload.button)
end)

---hasEmailAccount(source): whether the player holds a mail account at all, which is what PRO means
---by "logged into the Mail app".
registerPro('hasEmailAccount', function(source)
    local cid = identityOf(source)
    if not cid then return false end
    return store.listAccountsForCitizen(cid)[1] ~= nil
end)

return mail
