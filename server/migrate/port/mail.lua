---@type table Mail porter (server.migrate.port.mail). Copies lb-phone mail accounts across and
---folds each account's received messages into sd-phone's JSON messages column. Also owns mail
---login state, read from lb's logged-in accounts table.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---The local part of an address, used as the display name lb-phone does not store.
---@param address string
---@return string
local function localPart(address)
    local name = tostring(address or ''):match('^([^@]+)') or 'Mail'
    return name:sub(1, 64)
end

---@param ctx table migration context (numberToCid, dryRun)
---@return { accounts: number, messages: number, sessions: number, skipped: number }
function M.run(ctx)
    local out = { accounts = 0, messages = 0, sessions = 0, skipped = 0 }
    if not store.tableExists(store.lbTable('mail_accounts')) then return out end

    local inbox, logins = {}, {}
    local accounts = store.lbMailAccounts()
    for _, a in ipairs(accounts) do
        inbox[a.address] = {}
        logins[a.address] = {}
    end

    if store.tableExists(store.lbTable('mail_messages')) then
        for _, m in ipairs(store.lbMailMessages()) do
            local box = inbox[m.recipient]
            if box then
                box[#box + 1] = {
                    id = tostring(m.id),
                    sender = m.sender,
                    subject = m.subject,
                    message = m.content,
                    attachments = m.attachments,
                    actions = m.actions,
                    read = m.read and true or false,
                    date = math.floor(tonumber(m.ts) or 0),
                }
                out.messages = out.messages + 1
            else
                out.skipped = out.skipped + 1
            end
        end
    end

    if store.tableExists(store.lbTable('logged_in_accounts')) then
        for _, l in ipairs(store.lbLoggedIn()) do
            if l.app == 'mail' then
                local cid = ctx.numberToCid[digits(l.phone_number)]
                local box = logins[l.username]
                if cid and box then
                    box[#box + 1] = cid
                    out.sessions = out.sessions + 1
                end
            end
        end
    end

    local rows = {}
    for _, a in ipairs(accounts) do
        rows[#rows + 1] = {
            tostring(a.address):sub(1, 64),
            tostring(a.password or ''):sub(1, 255),
            localPart(a.address),
            store.encodeJson(inbox[a.address]) or '[]',
            store.encodeJson(logins[a.address]) or '[]',
        }
        out.accounts = out.accounts + 1
    end

    if not ctx.dryRun then store.insertMailAccounts(rows) end
    return out
end

return M
