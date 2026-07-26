local H = require 'support.harness'

local store = H.newStore()
store.tables['phone_phones'] = true
store.lbPhoneSettings = function()
    return {
        { phone_number = '(555) 010-0001', settings = {
            wallpaper = { background = 'cloud8', blur = true },
            display   = { theme = 'dark', brightness = 0.5, size = 0.7 },
            sound     = { ringtone = 'default', texttone = 'ping', volume = 0.5, callVolume = 1 },
            time      = { twelveHourClock = false },
            apps      = { { 'Phone' }, { 'Mail' } },
        } },
        { phone_number = '(555) 010-0002', settings = {} },
        { phone_number = '(555) 010-9999', settings = { display = { theme = 'light' } } },
    }
end
store.fillSettings = function(rows) store.record('settings', rows) end

local M = H.load('server/migrate/port/settings.lua', store)
local res = M.run({ numberToCid = { ['5550100001'] = 'CID1', ['5550100002'] = 'CID2' }, dryRun = false })

H.eq(res.imported, 1, 'only the populated resolved phone imports')
H.eq(res.skipped, 2, 'empty blob and unresolved owner are skipped')

local r = store.calls.settings[1]
H.eq(r[1],  'CID1',   'citizenid')
H.eq(r[2],  'cloud8', 'wallpaper')
H.eq(r[3],  1,        'blur_lock')
H.eq(r[4],  1,        'blur_home')
H.eq(r[5],  'dark',   'theme')
H.eq(r[6],  50,       'brightness 0.5 becomes 50')
H.eq(r[7],  70,       'phone_scale 0.7 becomes 70')
H.eq(r[8],  1,        'twelveHourClock false becomes hour24 1')
H.eq(r[9],  'default','ringtone')
H.eq(r[10], 'ping',   'notification_tone')
H.eq(r[11], 50,       'ringtone_volume')
H.eq(r[12], 100,      'call_volume 1.0 becomes 100')
H.eq(r[13], 'json:2', 'home_layout encoded')

local dry = H.newStore()
dry.tables['phone_phones'] = true
dry.lbPhoneSettings = store.lbPhoneSettings
dry.fillSettings = function(rows) dry.record('settings', rows) end
local M2 = H.load('server/migrate/port/settings.lua', dry)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = true })
H.eq(res2.imported, 1, 'dry run still counts')
H.eq(dry.calls.settings, nil, 'dry run writes nothing')

return true
