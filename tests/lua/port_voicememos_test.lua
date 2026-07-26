local H = require 'support.harness'

local store = H.newStore()
store.tables['phone_voice_memos_recordings'] = true
store.lbVoiceMemos = function()
    return { { id = 1, phone_number = '(555) 010-0001', file_name = 'Memo 1',
               file_url = 'http://a.mp3', file_length = 12, ts = 1700000000 },
             { id = 2, phone_number = '(555) 010-0001', file_name = 'Broken',
               file_url = '', file_length = 0, ts = 1700000100 },
             { id = 3, phone_number = '(555) 010-9999', file_name = 'Orphan',
               file_url = 'http://b.mp3', file_length = 5, ts = 1700000200 },
             { id = 4, phone_number = '(555) 010-0001', file_name = '',
               file_url = 'http://c.mp3', file_length = 7, ts = 1700000300 } }
end
store.insertVoiceMemos = function(rows) store.record('vm', rows) end

local M = H.load('server/migrate/port/voicememos.lua', store)
local res = M.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })

H.eq(res.imported, 2, 'two valid memos')
H.eq(res.skipped, 2, 'empty url and unresolved owner skipped')

local r = store.calls.vm[1]
H.eq(r[1], 'CID1',        'citizenid')
H.eq(r[2], 'Memo 1',      'name')
H.eq(r[3], 'http://a.mp3','url')
H.eq(r[4], 12,            'duration')
H.eq(r[5], 1700000000,    'created_at')
H.eq(store.calls.vm[2][2], 'Recording', 'blank name falls back')

local dry = H.newStore()
dry.tables['phone_voice_memos_recordings'] = true
dry.lbVoiceMemos = store.lbVoiceMemos
dry.insertVoiceMemos = function(rows) dry.record('vm', rows) end
local M2 = H.load('server/migrate/port/voicememos.lua', dry)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = true })
H.eq(res2.imported, 2, 'dry run counts')
H.eq(dry.calls.vm, nil, 'dry run writes nothing')

return true
