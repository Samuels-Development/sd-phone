local H = require 'support.harness'

local store = H.newStore()
store.tables['phone_wallet_transactions'] = true
store.lbWallet = function()
    return {
        { id = 1, phone_number = '(555) 010-0001', amount = -250, company = 'Burger Shot',
          ts = 1700000000 },
        { id = 2, phone_number = '(555) 010-9999', amount = 100, company = 'Refund',
          ts = 1700000100 },
    }
end
store.insertBankTx = function(rows) store.record('tx', rows) end

local M = H.load('server/migrate/port/wallet.lua', store)
local res = M.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })

H.eq(res.imported, 1, 'only the resolved owner imports')
H.eq(res.skipped, 1, 'unresolved owner skipped')

local r = store.calls.tx[1]
H.eq(r[1], 'CID1',        'citizenid')
H.eq(r[2], 'Burger Shot', 'company becomes label')
H.eq(r[3], -250,          'amount preserved with sign')
H.eq(r[4], 'wallet',      'category')
H.eq(r[5], 1700000000,    'created_at seconds')
H.eq(r[6], 'lbw1',        'deterministic source id makes a re-import a no-op')

local dry = H.newStore()
dry.tables['phone_wallet_transactions'] = true
dry.lbWallet = store.lbWallet
dry.insertBankTx = function(rows) dry.record('tx', rows) end
local M2 = H.load('server/migrate/port/wallet.lua', dry)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = true })
H.eq(res2.imported, 1, 'dry run counts')
H.eq(dry.calls.tx, nil, 'dry run writes nothing')

return true
