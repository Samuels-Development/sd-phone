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
store.insertPgSessions = function(rows) store.record('sess', rows) end

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
dry.insertPgSessions = function(rows) dry.record('sess', rows) end
local M2 = H.load('server/migrate/port/sessions.lua', dry)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = true })
H.eq(res2.written, 1, 'dry run counts')
H.eq(dry.calls.sess, nil, 'dry run writes nothing')

local absent = H.newStore()
local M3 = H.load('server/migrate/port/sessions.lua', absent)
local res3 = M3.run({ numberToCid = {}, dryRun = false })
H.eq(res3.written, 0, 'missing source table is a clean no-op')

return true
