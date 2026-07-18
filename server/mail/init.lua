---@type table Mail persistence layer (server.mail.store): schema bootstrap + read-only lookups
---for the exports.
local store   = require 'server.mail.store'
---@type table Authoritative mail handlers (server.mail.actions): validation + mutation per
---callback, plus the shared delivery fan-out.
local actions = require 'server.mail.actions'
---@type table Home-screen badge engine (server.badges.init): recomputes + pushes unread counts.
local badges  = require 'server.badges.init'
---@type table Shared server helpers (server.util): failure envelopes + input trims for the exports.
local util    = require 'server.util'
local fail, trim = util.fail, util.trim

---Boots the mail schema; a failure is printed and non-fatal.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:mail]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:mail]^0 schema ready')
end)

---Completes a successful send envelope: runs the delivery fan-out, then strips the pushes list
---from the envelope.
---@param result table envelope from actions.send
---@return table
local function dispatchSend(result)
    if result.success and result.data then
        actions.deliver(result.data.pushes)
        result.data = { sent = result.data.sent }
    end
    return result
end

-- Authoritative Mail callbacks: thin delegates into server.mail.actions.
lib.callback.register('sd-phone:server:mail:list', function(src)
    return actions.list(src)
end)

lib.callback.register('sd-phone:server:mail:signUp', function(src, payload)
    return actions.signUp(src, payload)
end)

---Sign-in repushes the badge snapshot.
lib.callback.register('sd-phone:server:mail:signIn', function(src, payload)
    local result = actions.signIn(src, payload)
    badges.push(src)
    return result
end)

---Sign-out repushes the badge snapshot.
lib.callback.register('sd-phone:server:mail:signOut', function(src, payload)
    local result = actions.signOut(src, payload)
    badges.push(src)
    return result
end)

---Send fans out the persisted inbox copies and strips the push list before the envelope returns.
lib.callback.register('sd-phone:server:mail:send', function(src, payload)
    return dispatchSend(actions.send(src, payload))
end)

lib.callback.register('sd-phone:server:mail:saveDraft', function(src, payload)
    return actions.saveDraft(src, payload)
end)

---Mark-read repushes the badge snapshot.
lib.callback.register('sd-phone:server:mail:markRead', function(src, payload)
    local result = actions.markRead(src, payload)
    badges.push(src)
    return result
end)

lib.callback.register('sd-phone:server:mail:toggleFlag', function(src, payload)
    return actions.toggleFlag(src, payload)
end)

---Move-to-bin repushes the badge snapshot.
lib.callback.register('sd-phone:server:mail:moveToBin', function(src, payload)
    local result = actions.moveToBin(src, payload)
    badges.push(src)
    return result
end)

---Discarding a draft repushes the badge snapshot.
lib.callback.register('sd-phone:server:mail:discardDraft', function(src, payload)
    local result = actions.discardDraft(src, payload)
    badges.push(src)
    return result
end)

---Move repushes the badge snapshot.
lib.callback.register('sd-phone:server:mail:move', function(src, payload)
    local result = actions.move(src, payload)
    badges.push(src)
    return result
end)

---Delete-account repushes the badge snapshot.
lib.callback.register('sd-phone:server:mail:deleteAccount', function(src, payload)
    local result = actions.deleteAccount(src, payload)
    badges.push(src)
    return result
end)

---@type table<string, true> The five real folders getMailbox accepts; 'flagged' is a virtual
---view, matching the actions.move whitelist.
local FOLDERS = { inbox = true, drafts = true, sent = true, spam = true, bin = true }

-- Public Mail exports, reachable only by other server resources.

---Sends mail as the system - exports['sd-phone']:sendMail(mail). Unknown recipient addresses
---are silently skipped; `delivered` counts recipient accounts that existed.
---@param mail { to: string|string[], subject?: string, body?: string, from?: { name?: string, email?: string } }
---@return { success: boolean, delivered: number }
exports('sendMail', function(mail)
    local result = actions.systemSend(mail)
    return {
        success   = result.success == true,
        delivered = result.data and result.data.delivered or 0,
    }
end)

---Sends mail on a player's behalf from another resource. Mirrors the NUI send payload and
---walks the full compose validation in actions.send; the push list is stripped.
---@param source number acting player's server id (the sender's identity resolves from it)
---@param payload table
---@return table envelope; data.sent is the serialized sent copy on success
exports('sendMailFromPlayer', function(source, payload)
    if type(source) ~= 'number' then return fail('Acting player source is required') end
    if type(payload) ~= 'table' then return fail('Payload must be a table') end
    return dispatchSend(actions.send(source, payload))
end)

---Lists every mail account a player is signed into as { id, name, email }; empty when the
---source is offline or signed into nothing.
---@param source number player server id
---@return { id: string, name: string, email: string }[]
exports('getMailAccounts', function(source)
    if type(source) ~= 'number' then return {} end
    local result = actions.list(source)
    return result.success and result.data.accounts or {}
end)

---Same account shape keyed by citizenid instead of a live source; works for offline players.
---The citizenid must be a non-empty string without % or _.
---@param citizenid string
---@return { id: string, name: string, email: string }[]
exports('getMailAddresses', function(citizenid)
    if type(citizenid) ~= 'string' or citizenid == '' or citizenid:find('[%%_]') then return {} end
    local accounts = store.listAccountsForCitizen(citizenid)
    local out = {}
    for i = 1, #accounts do
        out[i] = { id = accounts[i].email, name = accounts[i].display_name, email = accounts[i].email }
    end
    return out
end)

---Whether a mail address resolves to a registered account. Trimmed + lowercased before the
---lookup; a non-string or empty address is false.
---@param email string
---@return boolean
exports('mailAddressExists', function(email)
    local addr = trim(email):lower()
    if addr == '' then return false end
    return store.getAccount(addr) ~= nil
end)

---Reads a mailbox's messages in the serialized MailMessage shape; nil when the account doesn't
---exist or the folder isn't one of the five real ones. Omit folder for every message.
---@param email string
---@param folder? string
---@return table[]|nil
exports('getMailbox', function(email, folder)
    local addr = trim(email):lower()
    if addr == '' then return nil end
    if folder ~= nil and not FOLDERS[folder] then return nil end
    local acc = store.getAccount(addr)
    if not acc then return nil end
    local out = {}
    for i = 1, #acc.messages do
        local msg = acc.messages[i]
        if not folder or (msg.folder or 'inbox') == folder then
            out[#out + 1] = actions.serializeMessage(acc.email, msg)
        end
    end
    return out
end)
