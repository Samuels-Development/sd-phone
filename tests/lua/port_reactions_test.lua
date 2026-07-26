local H = require 'support.harness'

local store = H.newStore()
store.tables['phone_message_reactions_lb'] = true
store.lbTable = function(name)
    if name == 'message_reactions' then return 'phone_message_reactions_lb' end
    return 'phone_' .. name
end
store.lbReactions = function()
    return { { message_id = 42, phone_number = '(555) 010-0001', reaction = 'heart' },
             { message_id = 43, phone_number = '(555) 010-9999', reaction = 'thumb' },
             { message_id = 44, phone_number = '(555) 010-0001', reaction = '' } }
end
store.insertReactions = function(rows) store.record('rx', rows) end

local M = H.load('server/migrate/port/reactions.lua', store)
local res = M.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })

H.eq(res.imported, 1, 'resolved reaction imports')
H.eq(res.skipped, 2, 'unresolved owner and empty emoji skipped')

local r = store.calls.rx[1]
H.eq(r[1], 'm42',   'mid matches the messages porter format')
H.eq(r[2], 'CID1',  'citizenid')
H.eq(r[3], 'heart', 'emoji')
H.eq(type(r[4]), 'number', 'created_at stamped')

local dry = H.newStore()
dry.tables['phone_message_reactions_lb'] = true
dry.lbTable = store.lbTable
dry.lbReactions = store.lbReactions
dry.insertReactions = function(rows) dry.record('rx', rows) end
local M2 = H.load('server/migrate/port/reactions.lua', dry)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = true })
H.eq(res2.imported, 1, 'dry run counts')
H.eq(dry.calls.rx, nil, 'dry run writes nothing')

return true
