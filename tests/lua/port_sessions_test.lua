local H = require 'support.harness'

local store = H.newStore()
store.tables['phone_logged_in_accounts'] = true
store.lbLoggedIn = function()
    return { { phone_number = '(555) 010-0001', app = 'instagram', username = 'jay' },
             { phone_number = '(555) 010-0001', app = 'twitter',   username = 'jaytweets' },
             { phone_number = '(555) 010-0001', app = 'mail',      username = 'jay@ls.mail' },
             { phone_number = '(555) 010-0001', app = 'tiktok',    username = 'jaytok' },
             { phone_number = '(555) 010-9999', app = 'instagram', username = 'ghost' } }
end
store.insertPgSessions = function(rows) store.record('sess', rows); return #rows, #rows end

local M = H.load('server/migrate/port/sessions.lua', store)
local res = M.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })

H.eq(res.written, 1, 'only the photogram session is written')
H.eq(res.deferred, 1, 'twitter deferred for project A')
H.eq(res.skipped, 3, 'mail, tiktok and unresolved owner skipped')

local r = store.calls.sess[1]
H.eq(r[1], 'photogram', 'app mapped from instagram')
H.eq(r[2], 'CID1',      'citizenid')
H.eq(r[3], 'jay',       'username')

local dry = H.newStore()
dry.tables['phone_logged_in_accounts'] = true
dry.lbLoggedIn = store.lbLoggedIn
dry.insertPgSessions = function(rows) dry.record('sess', rows); return #rows, #rows end
local M2 = H.load('server/migrate/port/sessions.lua', dry)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = true })
H.eq(res2.written, 1, 'dry run counts')
H.eq(dry.calls.sess, nil, 'dry run writes nothing')

local absent = H.newStore()
local M3 = H.load('server/migrate/port/sessions.lua', absent)
local res3 = M3.run({ numberToCid = {}, dryRun = false })
H.eq(res3.written, 0, 'missing source table is a clean no-op')

-- Regression: the session insert resolves account_id by lookup, so it silently matches nothing when
-- photogram has not created the accounts. Reporting those as written marked the domain done and
-- permanently lost every login. Observed on a real server 2026-07-26.
local none = H.newStore()
none.tables['phone_logged_in_accounts'] = true
none.lbLoggedIn = store.lbLoggedIn
none.insertPgSessions = function() return 0, 0 end
local M4 = H.load('server/migrate/port/sessions.lua', none)
local ok4, err4 = pcall(M4.run, { numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })
H.eq(ok4, false, 'linking nothing raises so the domain is not marked done')
H.eq(type(err4) == 'string' and err4:find('photogram') ~= nil, true, 'the error names the likely cause')

-- Regression: on a re-run every session already exists, so INSERT IGNORE affects no rows. Judging
-- success on rows inserted rather than accounts linked turned that into a false failure, which is
-- exactly what happened on a real server 2026-07-26.
local rerun = H.newStore()
rerun.tables['phone_logged_in_accounts'] = true
rerun.lbLoggedIn = store.lbLoggedIn
rerun.insertPgSessions = function(rows) return #rows, 0 end
local M6 = H.load('server/migrate/port/sessions.lua', rerun)
local ok6, res6 = pcall(M6.run, { numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })
H.eq(ok6, true, 'a re-run that inserts nothing is success, not failure')
H.eq(ok6 and res6.written, 1, 'already-present sessions still count as written')
H.eq(ok6 and res6.created, 0, 'nothing new was created')
H.eq(ok6 and res6.orphan, 0, 'no orphans on a clean re-run')

-- Partial linking is legitimate: an account that was never migrated is an orphan, not a failure.
local partial = H.newStore()
partial.tables['phone_logged_in_accounts'] = true
partial.lbLoggedIn = function()
    return { { phone_number = '(555) 010-0001', app = 'instagram', username = 'jay' },
             { phone_number = '(555) 010-0001', app = 'instagram', username = 'gone' } }
end
partial.insertPgSessions = function(rows) partial.record('sess', rows); return 1, 1 end
local M5 = H.load('server/migrate/port/sessions.lua', partial)
local res5 = M5.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })
H.eq(res5.written, 1, 'written reflects rows that actually landed')
H.eq(res5.orphan, 1, 'the unmatched account is reported as an orphan')

return true
