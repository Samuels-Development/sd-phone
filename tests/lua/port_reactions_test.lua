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
store.existingMids = function(mids)
    local set = {}
    for _, m in ipairs(mids) do if m ~= 'm99' then set[m] = true end end
    return set
end

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
dry.existingMids = store.existingMids
local M2 = H.load('server/migrate/port/reactions.lua', dry)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = true })
H.eq(res2.imported, 1, 'dry run counts')
H.eq(dry.calls.rx, nil, 'dry run writes nothing')

-- A reaction whose message never migrated has nothing to render against, so it is counted as an
-- orphan and dropped rather than imported as junk.
local orph = H.newStore()
orph.tables['phone_message_reactions'] = true
orph.lbReactions = function()
    return { { message_id = 1, phone_number = '(555) 010-0001', reaction = 'heart' },
             { message_id = 99, phone_number = '(555) 010-0001', reaction = 'thumb' } }
end
orph.existingMids = function() return { m1 = true } end
orph.insertReactions = function(rows) orph.record('rx', rows) end
local M6 = H.load('server/migrate/port/reactions.lua', orph)
local res6 = M6.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })
H.eq(res6.imported, 1, 'only the reaction with a migrated message imports')
H.eq(res6.orphan, 1, 'the reaction with no message is reported as an orphan')
H.eq(#orph.calls.rx, 1, 'the orphan is never written')

-- Regression: same collision as mail. `phone_message_reactions` is sd-phone's own table when no lb
-- data is present, and querying it for `message_id, phone_number, reaction` throws.
local collide = H.newStore()
collide.foreign['phone_message_reactions'] = true
collide.lbReactions = function() error('must not read sd-phone\'s own reactions table', 0) end
collide.insertReactions = function(rows) collide.record('rx', rows) end
local M3 = H.load('server/migrate/port/reactions.lua', collide)
local ok, res3 = pcall(M3.run, { numberToCid = {}, dryRun = false })
H.eq(ok, true, 'sd-shaped reactions table does not crash the porter')
H.eq(ok and res3.imported, 0, 'sd-shaped reactions table imports nothing')
H.eq(collide.calls.rx, nil, 'sd-shaped reactions table is never written back to')

return true
