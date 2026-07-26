---@type table Mail porter (server.migrate.port.mail). Copies lb-phone mail accounts across and
---folds each account's received messages into sd-phone's JSON messages column. Also owns mail
---login state, read from lb's logged-in accounts table.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table Mail persistence (server.mail.store): its session index reconciler.
local mailStore = require 'server.mail.store'
---@type table Mail app config (configs.mail): the one domain this server issues addresses on.
local mailCfg = require 'configs.mail'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---The local part of an address, also used as the display name lb-phone does not store.
---@param address any
---@return string
local function localPart(address)
    return (tostring(address or ''):match('^([^@]+)') or 'mail'):lower()
end

---Rewrites an address onto this server's configured mail domain.
---
---lb-phone servers run their own domain (eyefind.info on the dump this was built against), but
---every sd-phone path that validates an address assumes `configs/mail.lua` Domain: registration
---rejects anything else outright, and recovery appends it. A migrated account left on a foreign
---domain is second-class, so the local part is kept and the domain replaced.
---@param address any
---@return string
local function onOurDomain(address)
    return localPart(address) .. '@' .. mailCfg.Domain
end

---@type table<string, string> HTML entities worth decoding; anything rarer is left alone.
local ENTITIES = {
    ['&nbsp;'] = ' ', ['&amp;'] = '&', ['&lt;'] = '<', ['&gt;'] = '>',
    ['&quot;'] = '"', ['&#39;'] = "'", ['&apos;'] = "'", ['&hellip;'] = '...',
}

---Flattens an HTML mail body into readable plain text.
---
---Other lb-phone resources send formatted mail (`<h2>`, `<br>`, `<strong>`), but sd-phone renders a
---body as plain text, so the markup showed up raw. Converting here rather than rendering the HTML
---keeps foreign, player-authored content away from `dangerouslySetInnerHTML`.
---@param body any
---@return string
local function htmlToText(body)
    local s = tostring(body or '')
    if not s:find('<') then return s end

    s = s:gsub('<%s*[bB][rR]%s*/?%s*>', '\n')
    s = s:gsub('<%s*/%s*[pP]%s*>', '\n\n')
    s = s:gsub('<%s*/%s*[hH]%d%s*>', '\n\n')
    s = s:gsub('<%s*/%s*[dD][iI][vV]%s*>', '\n')
    s = s:gsub('<%s*[lL][iI]%s*>', '\n- ')
    s = s:gsub('<[^>]->', '')
    for entity, char in pairs(ENTITIES) do s = s:gsub(entity, char) end

    -- Markup-heavy templates are written across indented source lines; without this the text keeps
    -- their leading whitespace and reads as though it is badly aligned.
    s = s:gsub('[ \t]+\n', '\n'):gsub('\n[ \t]+', '\n')
    s = s:gsub('\n\n\n+', '\n\n')
    return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

---@param ctx table migration context (numberToCid, dryRun)
---@return { accounts: number, messages: number, sessions: number, logins: number, collided: number, skipped: number }
function M.run(ctx)
    local out = { accounts = 0, messages = 0, sessions = 0, logins = 0, collided = 0, skipped = 0 }
    if not store.lbSource('mail_accounts', 'address') then return out end

    -- Two lb addresses can share a local part across different domains and collide once both are
    -- rewritten onto ours. First one wins; the rest are counted and dropped rather than silently
    -- merged into someone else's inbox.
    local accounts, addressOf, taken = store.lbMailAccounts(), {}, {}
    local kept = {}
    for _, a in ipairs(accounts) do
        local addr = onOurDomain(a.address)
        if taken[addr] then
            out.collided = out.collided + 1
        else
            taken[addr] = true
            addressOf[a.address] = addr
            kept[#kept + 1] = { raw = a.address, email = addr, password = a.password }
        end
    end

    local inbox, logins = {}, {}
    for _, a in ipairs(kept) do
        inbox[a.email] = {}
        logins[a.email] = {}
    end

    if store.lbSource('mail_messages') then
        for _, m in ipairs(store.lbMailMessages()) do
            local to = addressOf[m.recipient]
            local box = to and inbox[to]
            if box then
                local from = addressOf[m.sender] or onOurDomain(m.sender)
                -- Built to the shape server/mail/actions.lua writes for a real send. Getting this
                -- wrong renders a message with an empty sender, no recipients and no body.
                -- Attachments are deliberately dropped: sd-phone's are a tagged union
                -- ({ kind = 'photo' | 'audio' | ... }) and lb's format is unrelated.
                box[#box + 1] = {
                    id      = ('lbm%s'):format(m.id),
                    folder  = 'inbox',
                    from    = { name = localPart(m.sender), email = from },
                    to      = { to },
                    subject = tostring(m.subject or ''),
                    body    = htmlToText(m.content),
                    sentAt  = os.date('!%Y-%m-%dT%H:%M:%S', math.floor(tonumber(m.ts) or os.time())),
                    read    = m.read and true or false,
                    flagged = false,
                }
                out.messages = out.messages + 1
            else
                out.skipped = out.skipped + 1
            end
        end
    end

    local grants = {}
    if store.lbSource('logged_in_accounts') then
        for _, l in ipairs(store.lbLoggedIn()) do
            if l.app == 'mail' then
                local cid = ctx.numberToCid[digits(l.phone_number)]
                local addr = addressOf[l.username]
                local box = addr and logins[addr]
                if cid and box then
                    box[#box + 1] = cid
                    out.sessions = out.sessions + 1
                    grants[#grants + 1] = { app = 'mail', username = addr, cid = cid, email = addr }
                end
            end
        end
    end

    local rows = {}
    for _, a in ipairs(kept) do
        rows[#rows + 1] = {
            a.email:sub(1, 64),
            tostring(a.password or ''):sub(1, 255),
            localPart(a.raw):sub(1, 64),
            store.encodeJson(inbox[a.email]) or '[]',
            store.encodeJson(logins[a.email]) or '[]',
        }
        out.accounts = out.accounts + 1
    end

    -- The accounts engine copies mail accounts across at boot, which has already happened by the
    -- time the import runs. Insert them here too, or these accounts have no engine row for the
    -- login grant below to attach a password to, and no recovery path at all until a restart.
    local engineRows = {}
    for _, a in ipairs(kept) do
        engineRows[#engineRows + 1] = { 'mail', a.email:sub(1, 64), localPart(a.raw):sub(1, 50), '' }
    end

    if not ctx.dryRun then
        store.insertMailAccounts(rows)
        store.insertPgAccounts(engineRows)
        -- The session index is derived from logged_in_citizens and is normally rebuilt at boot,
        -- which has already happened by the time the import runs. Rebuild it now so migrated
        -- players are signed into mail immediately rather than after the next restart.
        if out.sessions > 0 then pcall(mailStore.reconcileSessions) end
        out.logins = store.grantMigratedLogins(grants)
    end
    return out
end

return M
