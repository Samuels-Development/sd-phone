local H = require 'support.harness'

---Runs `build()` twice through a porter and asserts both runs produce the same key columns.
---Deterministic ids plus INSERT IGNORE are what make a re-run a no-op, so drifting keys here
---would mean the second import duplicates rows instead of ignoring them.
---@param label string
---@param path string porter module path
---@param build fun(): table store mock, freshly built
---@param bucket string recorded insert bucket to compare
---@param keys integer[] column indexes forming the target primary key
local function twice(label, path, build, bucket, keys)
    local out = {}
    for run = 1, 2 do
        local store = build()
        local M = H.load(path, store)
        M.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })
        local seen = {}
        for _, row in ipairs(store.calls[bucket] or {}) do
            local parts = {}
            for i, k in ipairs(keys) do parts[i] = tostring(row[k]) end
            seen[#seen + 1] = table.concat(parts, '|')
        end
        table.sort(seen)
        out[run] = table.concat(seen, ',')
    end
    H.eq(out[2], out[1], label .. ' produces identical keys on a re-run')
    H.eq(out[1] ~= '', true, label .. ' actually produced rows')
end

twice('settings', 'server/migrate/port/settings.lua', function()
    local s = H.newStore()
    s.tables['phone_phones'] = true
    s.lbPhoneSettings = function()
        return { { phone_number = '(555) 010-0001',
                   settings = { display = { theme = 'dark' }, wallpaper = { background = 'x' } } } }
    end
    s.fillSettings = function(rows) s.record('settings', rows) end
    return s
end, 'settings', { 1 })

twice('wallet', 'server/migrate/port/wallet.lua', function()
    local s = H.newStore()
    s.tables['phone_wallet_transactions'] = true
    s.lbWallet = function()
        return { { id = 1, phone_number = '(555) 010-0001', amount = -250,
                   company = 'Burger Shot', ts = 1700000000 } }
    end
    s.insertBankTx = function(rows) s.record('tx', rows) end
    return s
end, 'tx', { 1, 2, 3, 5 })

-- created_at is stamped at import time and is deliberately excluded: the target primary key is
-- (mid, citizenid, emoji), so a differing timestamp cannot cause a duplicate.
twice('reactions', 'server/migrate/port/reactions.lua', function()
    local s = H.newStore()
    s.tables['phone_message_reactions'] = true
    s.lbReactions = function()
        return { { message_id = 42, phone_number = '(555) 010-0001', reaction = 'heart' } }
    end
    s.insertReactions = function(rows) s.record('rx', rows) end
    return s
end, 'rx', { 1, 2, 3 })

twice('voicememos', 'server/migrate/port/voicememos.lua', function()
    local s = H.newStore()
    s.tables['phone_voice_memos_recordings'] = true
    s.lbVoiceMemos = function()
        return { { id = 1, phone_number = '(555) 010-0001', file_name = 'Memo',
                   file_url = 'http://a.mp3', file_length = 12, ts = 1700000000 } }
    end
    s.insertVoiceMemos = function(rows) s.record('vm', rows) end
    return s
end, 'vm', { 1, 2, 3, 5 })

twice('photogram', 'server/migrate/port/photogram.lua', function()
    local s = H.newStore()
    s.tables['phone_instagram_accounts'] = true
    s.tables['phone_instagram_posts'] = true
    s.lbIgAccounts = function()
        return { { username = 'jay', display_name = 'Jay', password = 'h', bio = '',
                   profile_image = nil, private = false, verified = false,
                   phone_number = '(555) 010-0001', ts = 1700000000 } }
    end
    s.lbIgPosts = function()
        return { { id = 'p1', username = 'jay', media = '[]', caption = 'c',
                   location = nil, ts = 1700000100 } }
    end
    s.existingPhotogramUsernames = function() return {} end
    for _, k in ipairs({ 'Profiles', 'Posts', 'Comments', 'Likes', 'CommentLikes', 'Follows',
                         'Stories', 'StoryViews', 'Dms', 'Notifications', 'Accounts', 'Sessions' }) do
        s['insertPg' .. k] = function(rows) s.record(k, rows) end
    end
    return s
end, 'Posts', { 1, 2 })

twice('mail', 'server/migrate/port/mail.lua', function()
    local s = H.newStore()
    s.tables['phone_mail_accounts'] = true
    s.tables['phone_mail_messages'] = true
    s.lbMailAccounts = function() return { { address = 'jay@ls.mail', password = 'h' } } end
    s.lbMailMessages = function()
        return { { id = 1, recipient = 'jay@ls.mail', sender = 'k@ls.mail', subject = 's',
                   content = 'b', attachments = nil, actions = nil, read = true, ts = 1700000000 } }
    end
    s.insertMailAccounts = function(rows) s.record('mail', rows) end
    return s
end, 'mail', { 1 })

twice('sessions', 'server/migrate/port/sessions.lua', function()
    local s = H.newStore()
    s.tables['phone_logged_in_accounts'] = true
    s.lbLoggedIn = function()
        return { { phone_number = '(555) 010-0001', app = 'instagram', username = 'jay' } }
    end
    s.insertPgSessions = function(rows) s.record('sess', rows) end
    return s
end, 'sess', { 1, 2, 3 })

return true
