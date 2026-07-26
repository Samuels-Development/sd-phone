local H = require 'support.harness'

local store = H.newStore()
store.tables['phone_mail_accounts_lb'] = true
store.tables['phone_mail_messages'] = true
store.tables['phone_logged_in_accounts'] = true
store.lbTable = function(name)
    if name == 'mail_accounts' then return 'phone_mail_accounts_lb' end
    return 'phone_' .. name
end
store.lbMailAccounts = function()
    return { { address = 'jay@ls.mail', password = '$2a$11$abc' },
             { address = 'kim@ls.mail', password = '$2a$11$def' } }
end
store.lbMailMessages = function()
    return {
        { id = 1, recipient = 'jay@ls.mail', sender = 'kim@ls.mail', subject = 'hi',
          content = 'hello', attachments = nil, actions = nil, read = true, ts = 1700000000 },
        { id = 2, recipient = 'jay@ls.mail', sender = 'sys@ls.mail', subject = 'two',
          content = 'body', attachments = nil, actions = nil, read = false, ts = 1700000100 },
        { id = 3, recipient = 'ghost@ls.mail', sender = 'x@ls.mail', subject = 'orphan',
          content = 'body', attachments = nil, actions = nil, read = false, ts = 1700000200 },
    }
end
store.lbLoggedIn = function()
    return { { phone_number = '(555) 010-0001', app = 'mail', username = 'jay@ls.mail' },
             { phone_number = '(555) 010-0001', app = 'instagram', username = 'jay' } }
end
store.insertMailAccounts = function(rows) store.record('mail', rows) end

local M = H.load('server/migrate/port/mail.lua', store)
local res = M.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })

H.eq(res.accounts, 2, 'both accounts import')
H.eq(res.messages, 2, 'only messages addressed to a known account')
H.eq(res.sessions, 1, 'one mail login, instagram row ignored')
H.eq(res.skipped, 1, 'orphan message skipped')

local jay = store.calls.mail[1]
H.eq(jay[1], 'jay@ls.mail', 'email')
H.eq(jay[2], '$2a$11$abc', 'bcrypt preserved')
H.eq(jay[3], 'jay', 'display name from local part')
H.eq(jay[4], 'json:2', 'two messages encoded')
H.eq(jay[5], 'json:1', 'one logged-in citizen')

local kim = store.calls.mail[2]
H.eq(kim[4], '[]', 'empty message array falls back to a literal empty json array')
H.eq(kim[5], '[]', 'no sessions falls back to a literal empty json array')

local dry = H.newStore()
dry.tables = store.tables
for k, v in pairs(store) do if dry[k] == nil then dry[k] = v end end
-- newStore already defines lbTable, so the loop above skips it; the rescued mail table name
-- only resolves with the suite's override.
dry.lbTable = store.lbTable
dry.insertMailAccounts = function(rows) dry.record('mail', rows) end
local M2 = H.load('server/migrate/port/mail.lua', dry)
local res2 = M2.run({ numberToCid = {}, dryRun = true })
H.eq(res2.accounts, 2, 'dry run counts accounts')
H.eq(res2.sessions, 0, 'unresolved owner creates no login')
H.eq(dry.calls.mail, nil, 'dry run writes nothing')

-- Regression: with no lb data, `phone_mail_accounts` is sd-phone's OWN table. Resolving on the bare
-- name alone made the porter run `SELECT address, password` against it and crash. Confirmed against
-- a real database on 2026-07-26.
local collide = H.newStore()
collide.foreign['phone_mail_accounts'] = true
collide.lbMailAccounts = function() error('must not read sd-phone\'s own mail table', 0) end
collide.insertMailAccounts = function(rows) collide.record('mail', rows) end
local M3 = H.load('server/migrate/port/mail.lua', collide)
local ok, res3 = pcall(M3.run, { numberToCid = {}, dryRun = false })
H.eq(ok, true, 'sd-shaped mail table does not crash the porter')
H.eq(ok and res3.accounts, 0, 'sd-shaped mail table imports nothing')
H.eq(collide.calls.mail, nil, 'sd-shaped mail table is never written back to')

return true
