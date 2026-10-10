---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player = require 'bridge.server.player'

---@type table Framework bridge (bridge.shared.framework): active framework name for the character-deleted hook.
local framework = require 'bridge.shared.framework'

---Runs one DELETE/UPDATE, swallowing errors.
---@param sql string parameterized statement
---@param params table statement parameters
---@return integer affected rows affected (0 on failure)
local function del(sql, params)
    local ok, res = pcall(function() return MySQL.update.await(sql, params) end)
    return ok and (tonumber(res) or 0) or 0
end

-- Everything a character owns under a single citizenid-shaped column, deleted with WHERE <col> = ?.
---@type table<integer, string[]> Per-character tables: { table, citizenid column }.
local CID_SINGLE = {
    { 'phone_settings',              'citizenid' },
    { 'phone_custom_ringtones',      'citizenid' },
    { 'phone_contacts',              'citizenid' },
    { 'phone_blocked',               'citizenid' },
    { 'phone_calls',                 'citizenid' },
    { 'phone_notes',                 'citizenid' },
    { 'phone_photos',                'citizenid' },
    { 'phone_photo_albums',          'citizenid' },
    { 'phone_voice_memos',           'citizenid' },
    { 'phone_map_markers',           'citizenid' },
    { 'phone_bank_transactions',     'citizenid' },
    { 'phone_radio',                 'citizenid' },
    { 'phone_radio_saved',           'citizenid' },
    { 'phone_game_stats',            'citizenid' },
    { 'phone_casino_chips',          'citizenid' },
    { 'phone_cookie',                'citizenid' },
    { 'phone_alarms',                'citizenid' },
    { 'phone_timer_recents',         'citizenid' },
    { 'phone_stock_holdings',        'citizenid' },
    { 'phone_stock_wallet',          'citizenid' },
    { 'phone_racing_tracks',         'citizenid' },
    { 'phone_racing_profiles',       'citizenid' },
    { 'phone_racing_results',        'citizenid' },
    { 'phone_service_prefs',         'citizenid' },
    { 'phone_notif_prefs',           'citizenid' },
    { 'phone_bluetooth',             'citizenid' },
    { 'phone_wifi',                  'citizenid' },
    { 'phone_health_daily',          'citizenid' },
    { 'phone_id',                    'citizenid' },
    { 'phone_medical_id',            'citizenid' },
    { 'phone_signatures',            'citizenid' },
    { 'phone_garage_images',         'citizenid' },
    { 'phone_mail_saved_emails',     'citizenid' },
    { 'phone_racing_notifications',  'citizenid' },
    { 'phone_service_msg_reads',     'viewer' },
    { 'phone_streak_likes',          'citizenid' },
    { 'phone_streak_posts',          'citizenid' },
    { 'phone_streaks',               'citizenid' },
    { 'marketplace_listings',        'citizenid' },
    { 'pages_posts',                 'citizenid' },
    { 'phone_passwords',             'citizenid' },
    { 'phone_documents',             'citizenid' },
    { 'phone_document_folders',      'citizenid' },
    { 'phone_messages',              'citizenid' },
    { 'phone_message_reactions',     'citizenid' },
    { 'phone_message_group_members', 'citizenid' },
    { 'phone_message_groups',        'owner_cid' },
    { 'phone_groups',                'leader_cid' },
    { 'darkchat_members',            'citizenid' },
    { 'darkchat_messages',           'citizenid' },
    { 'darkchat_nicknames',          'citizenid' },
    { 'darkchat_reactions',          'citizenid' },
    { 'darkchat_rooms',              'owner' },
}

---@type table<integer, string[]> Tables where the character can appear on either side of a
---relation, deleted with WHERE a = ? OR b = ?: { table, columnA, columnB }.
local CID_PAIR = {
    { 'phone_friends', 'owner', 'friend' },
}

---Deletes one character's entire phone footprint: citizenid-keyed rows, social-app rows keyed by
---account username, mail logins, and the global app accounts + sessions the character used.
---
---Accounts are found by the creator COLUMN as well as by session. A session alone is not proof of
---ownership and its absence is not proof of the opposite: signing out deletes the session row, so a
---session-only lookup silently skips every account the character made and then logged out of,
---leaving both the account and its content behind. phone_app_accounts.created_by is added by
---util.ensureColumns rather than the CREATE TABLE, which is why it is easy to miss.
---@param cid string|nil citizenid whose footprint is wiped
---@return string|nil cid wiped citizenid, nil when unresolvable
---@return integer|nil rows counted rows deleted (nil only alongside a nil cid)
local function wipeCid(cid)
    if not cid or cid == '' then return nil end

    local usersFor, accountIds = {}, {}
    local owned = MySQL.query.await([[
        SELECT app, username, id AS account_id FROM phone_app_accounts WHERE created_by = ?
        UNION
        SELECT a.app, a.username, a.id
        FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE s.citizenid = ?
    ]], { cid, cid }) or {}
    for _, r in ipairs(owned) do
        local names = usersFor[r.app] or {}
        names[#names + 1] = r.username
        usersFor[r.app] = names
        accountIds[#accountIds + 1] = r.account_id
    end

    local number = MySQL.scalar.await("SELECT phone_number FROM phone_settings WHERE citizenid = ? AND device = 'phone'", { cid })

    local rows = 0

    rows = rows + del('DELETE FROM phone_photo_album_items WHERE album_id IN (SELECT id FROM phone_photo_albums WHERE citizenid = ?)', { cid })
    -- Every racer's results on a track this character built, since the track row itself goes below
    -- and a leaderboard pointing at a track that no longer exists is unreadable.
    rows = rows + del('DELETE FROM phone_racing_results WHERE track_id IN (SELECT id FROM phone_racing_tracks WHERE citizenid = ?)', { cid })
    -- like_count is a stored column, so posts this character liked are counted down before the
    -- like rows go below; likes left on their own posts go with the posts.
    del('UPDATE phone_streak_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id IN (SELECT post_id FROM phone_streak_likes WHERE citizenid = ?)', { cid })
    rows = rows + del('DELETE FROM phone_streak_likes WHERE post_id IN (SELECT id FROM phone_streak_posts WHERE citizenid = ?)', { cid })
    rows = rows + del('DELETE FROM phone_group_invites WHERE target_cid = ? OR group_id IN (SELECT id FROM phone_groups WHERE leader_cid = ?)', { cid, cid })

    for _, t in ipairs(CID_SINGLE) do
        rows = rows + del(('DELETE FROM %s WHERE %s = ?'):format(t[1], t[2]), { cid })
    end
    for _, t in ipairs(CID_PAIR) do
        rows = rows + del(('DELETE FROM %s WHERE %s = ? OR %s = ?'):format(t[1], t[2], t[3]), { cid, cid })
    end

    if number then
        rows = rows + del('DELETE FROM phone_service_messages WHERE citizen_number = ? OR staff_cid = ?', { number, cid })
        rows = rows + del('DELETE FROM phone_pending_messages WHERE number = ?', { number })
    else
        rows = rows + del('DELETE FROM phone_service_messages WHERE staff_cid = ?', { cid })
    end

    for _, pg in ipairs(usersFor['photogram'] or {}) do
        del('DELETE FROM phone_photogram_comment_likes WHERE comment_id IN (SELECT id FROM phone_photogram_comments WHERE post_id IN (SELECT id FROM phone_photogram_posts WHERE author = ?))', { pg })
        del('DELETE FROM phone_photogram_likes    WHERE post_id  IN (SELECT id FROM phone_photogram_posts   WHERE author = ?)', { pg })
        del('DELETE FROM phone_photogram_saves    WHERE post_id  IN (SELECT id FROM phone_photogram_posts   WHERE author = ?)', { pg })
        del('DELETE FROM phone_photogram_comments WHERE post_id  IN (SELECT id FROM phone_photogram_posts   WHERE author = ?)', { pg })
        del('DELETE FROM phone_photogram_story_views WHERE story_id IN (SELECT id FROM phone_photogram_stories WHERE author = ?)', { pg })
        rows = rows + del('DELETE FROM phone_photogram_comment_likes WHERE username = ?', { pg })
        rows = rows + del('DELETE FROM phone_photogram_likes WHERE username = ?', { pg })
        rows = rows + del('DELETE FROM phone_photogram_saves WHERE username = ?', { pg })
        rows = rows + del('DELETE FROM phone_photogram_comments WHERE author = ?', { pg })
        rows = rows + del('DELETE FROM phone_photogram_story_views WHERE username = ?', { pg })
        rows = rows + del('DELETE FROM phone_photogram_stories WHERE author = ?', { pg })
        rows = rows + del('DELETE FROM phone_photogram_follows WHERE follower = ? OR target = ?', { pg, pg })
        rows = rows + del('DELETE FROM phone_photogram_notifications WHERE recipient = ? OR actor = ?', { pg, pg })
        rows = rows + del('DELETE FROM phone_photogram_dms WHERE from_user = ? OR to_user = ?', { pg, pg })
        rows = rows + del('DELETE FROM phone_photogram_posts WHERE author = ?', { pg })
        rows = rows + del('DELETE FROM phone_photogram_profiles WHERE username = ?', { pg })
    end

    for _, ch in ipairs(usersFor['cherry'] or {}) do
        del('DELETE FROM phone_cherry_messages WHERE match_id IN (SELECT id FROM phone_cherry_matches WHERE a = ? OR b = ?)', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_messages WHERE sender = ?', { ch })
        rows = rows + del('DELETE FROM phone_cherry_matches WHERE a = ? OR b = ?', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_swipes WHERE swiper = ? OR target = ?', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_blocks WHERE blocker = ? OR blocked = ?', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_profiles WHERE username = ?', { ch })
    end

    for _, vz in ipairs(usersFor['vibez'] or {}) do
        del('DELETE FROM phone_vibez_comment_likes WHERE comment_id IN (SELECT id FROM phone_vibez_comments WHERE author = ? OR post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?))', { vz, vz })
        del('DELETE FROM phone_vibez_likes         WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?)', { vz })
        del('DELETE FROM phone_vibez_saves         WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?)', { vz })
        del('DELETE FROM phone_vibez_comments      WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?)', { vz })
        del('DELETE FROM phone_vibez_notifications WHERE post_id IN (SELECT id FROM phone_vibez_posts WHERE author = ?)', { vz })
        rows = rows + del('DELETE FROM phone_vibez_comment_likes WHERE username = ?', { vz })
        rows = rows + del('DELETE FROM phone_vibez_likes         WHERE username = ?', { vz })
        rows = rows + del('DELETE FROM phone_vibez_saves         WHERE username = ?', { vz })
        rows = rows + del('DELETE FROM phone_vibez_comments      WHERE author = ?', { vz })
        rows = rows + del('DELETE FROM phone_vibez_follows       WHERE follower = ? OR target = ?', { vz, vz })
        rows = rows + del('DELETE FROM phone_vibez_notifications WHERE recipient = ? OR actor = ?', { vz, vz })
        rows = rows + del('DELETE FROM phone_vibez_posts         WHERE author = ?', { vz })
        rows = rows + del('DELETE FROM phone_vibez_profiles      WHERE username = ?', { vz })
    end

    -- Squawk keys its content by handle, and one character can hold several accounts, so the wipe
    -- covers every account they created as well as whichever one they are signed into.
    local birdyRows = MySQL.query.await([[
        SELECT handle FROM phone_birdy_profiles WHERE citizenid = ?
        UNION
        SELECT a.username FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE a.app = 'birdy' AND s.citizenid = ?
    ]], { cid, cid }) or {}
    for _, r in ipairs(birdyRows) do
        local h = r.handle
        del('DELETE FROM phone_birdy_likes         WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { h })
        del('DELETE FROM phone_birdy_reposts       WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { h })
        del('DELETE FROM phone_birdy_notifications WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { h })
        del('DELETE FROM phone_birdy_poll_votes    WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { h })
        del('DELETE FROM phone_birdy_poll_options  WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { h })
        del('DELETE FROM phone_birdy_polls         WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE author = ?)', { h })
        rows = rows + del('DELETE FROM phone_birdy_poll_votes    WHERE handle = ?', { h })
        rows = rows + del('DELETE FROM phone_birdy_likes         WHERE handle = ?', { h })
        rows = rows + del('DELETE FROM phone_birdy_reposts       WHERE handle = ?', { h })
        rows = rows + del('DELETE FROM phone_birdy_posts         WHERE author = ?', { h })
        rows = rows + del('DELETE FROM phone_birdy_follows       WHERE follower = ? OR target = ?', { h, h })
        rows = rows + del('DELETE FROM phone_birdy_dms           WHERE from_handle = ? OR to_handle = ?', { h, h })
        rows = rows + del('DELETE FROM phone_birdy_notifications WHERE recipient = ? OR actor = ?', { h, h })
        rows = rows + del('DELETE FROM phone_birdy_profiles      WHERE handle = ?', { h })
        -- By username, not by created_by: accounts made before the creator column existed carry
        -- no owner, and leaving one behind is a login that resolves to a profile that is gone.
        rows = rows + del("DELETE FROM phone_app_accounts WHERE app = 'birdy' AND username = ?", { h })
    end

    for _, ry in ipairs(usersFor['ryde'] or {}) do
        rows = rows + del('DELETE FROM phone_ryde_rides WHERE rider_username = ? OR driver_username = ?', { ry, ry })
        rows = rows + del('DELETE FROM phone_ryde_drivers WHERE username = ?', { ry })
    end

    local mails = MySQL.query.await(
        "SELECT email, logged_in_citizens FROM phone_mail_accounts WHERE JSON_SEARCH(logged_in_citizens, 'one', ?) IS NOT NULL",
        { cid }
    ) or {}
    for _, m in ipairs(mails) do
        local arr = json.decode(m.logged_in_citizens or '[]') or {}
        local keep = {}
        for _, c in ipairs(arr) do if c ~= cid then keep[#keep + 1] = c end end
        del('UPDATE phone_mail_accounts SET logged_in_citizens = ? WHERE email = ?', { json.encode(keep), m.email })
    end
    -- phone_mail_sessions indexes the column rewritten above; it has to be dropped in the same
    -- pass or mail.listAccountsForCitizen keeps reading rows this wipe just signed out of.
    del('DELETE FROM phone_mail_sessions WHERE citizenid = ?', { cid })

    -- Signing out above is not enough: the per-character mail cap counts rows by created_by_cid,
    -- so an account left standing keeps its slot and its address forever, and a "wiped" character
    -- cannot re-register the same email. Deleted after the sign-out pass, so an account shared with
    -- someone else has already had this character removed from it and is then left alone.
    local owned = MySQL.query.await(
        'SELECT email, logged_in_citizens FROM phone_mail_accounts WHERE created_by_cid = ?', { cid }) or {}
    for _, m in ipairs(owned) do
        local signedIn = json.decode(m.logged_in_citizens or '[]') or {}
        local others = 0
        for _, c in ipairs(signedIn) do if c ~= cid then others = others + 1 end end
        if others == 0 then
            del('DELETE FROM phone_mail_sessions WHERE email = ?', { m.email })
            rows = rows + del('DELETE FROM phone_mail_accounts WHERE email = ?', { m.email })
        end
    end

    if #accountIds > 0 then
        local ph = {}
        for i = 1, #accountIds do ph[i] = '?' end
        rows = rows + del(('DELETE FROM phone_app_accounts WHERE id IN (%s)'):format(table.concat(ph, ',')), accountIds)
    end
    rows = rows + del('DELETE FROM phone_app_sessions WHERE citizenid = ?', { cid })

    return cid, rows
end

---/wipemyphone (admin-only): wipes ALL of the caller's own phone data, then tells the client to
---clear the phone UI's localStorage and close. Console is refused.
---@param source integer player server id
lib.addCommand('wipemyphone', {
    help = 'Wipe ALL of YOUR phone data (settings, apps, accounts, content) so your next open is a brand-new phone.',
    restricted = 'group.admin',
}, function(source)
    if not source or source <= 0 then
        print('^1[sd-phone:wipe]^0 must be run by a player, not the console.')
        return
    end

    local cid, rows = wipeCid(player.getIdentifier(source))
    if not cid then
        TriggerClientEvent('ox_lib:notify', source, { title = 'Phone', description = 'Could not resolve your character.', type = 'error' })
        return
    end

    TriggerClientEvent('sd-phone:client:wipe', source)

    print(('^3[sd-phone:wipe]^0 wiped phone data for %s (%d rows)'):format(cid, rows))
    TriggerClientEvent('ox_lib:notify', source, {
        title = 'Phone wiped',
        description = 'Your phone is reset. Open it for a fresh setup.',
        type = 'success',
    })
end)

---QBox fires this once a character's core rows are gone, from every deletion path.
if framework.name == 'qbx' then
    AddEventHandler('qbx_core:server:characterDeleted', function(citizenid)
        local cid, rows = wipeCid(citizenid)
        if cid then
            print(('^3[sd-phone:wipe]^0 wiped phone data for deleted character %s (%d rows)'):format(cid, rows))
        end
    end)
end

---Deletes only the login identities one character owns, leaving the rest of their phone intact.
---
---Narrower than wipeCid on purpose, and safer in the one place wipeCid is not: an account another
---character is still signed into is SKIPPED rather than deleted, because both of these are shared
---objects.
---
---Ownership is read from the creator COLUMN on both tables, never inferred from a session. Signing
---out drops the session row, so a session join finds nothing and would leave the account behind
---forever while it still counts against the per-app cap - which is the whole reason a signed-out
---account looks unwipeable. phone_app_accounts.created_by is added by util.ensureColumns rather
---than the CREATE TABLE, so it is easy to miss when reading the schema. Sessions are still unioned
---in, to catch an account this character uses but did not create.
---
---App CONTENT keyed to the handle (posts, photos, matches) is deliberately left alone so this stays
---predictable; /wipemyphone is the full reset.
---@param cid string|nil citizenid whose accounts are removed
---@return table|nil result { mail: string[], apps: string[], skipped: string[] }, nil when unresolvable
local function wipeAccountsFor(cid)
    if not cid or cid == '' then return nil end

    local result = { mail = {}, apps = {}, skipped = {} }

    local mails = MySQL.query.await(
        'SELECT email, logged_in_citizens FROM phone_mail_accounts WHERE created_by_cid = ?', { cid }) or {}
    for _, m in ipairs(mails) do
        local signedIn = json.decode(m.logged_in_citizens or '[]') or {}
        local others = 0
        for _, c in ipairs(signedIn) do if c ~= cid then others = others + 1 end end

        if others > 0 then
            result.skipped[#result.skipped + 1] = ('%s (%d other session(s))'):format(m.email, others)
        else
            del('DELETE FROM phone_mail_sessions WHERE email = ?', { m.email })
            del('DELETE FROM phone_mail_accounts WHERE email = ?', { m.email })
            result.mail[#result.mail + 1] = m.email
        end
    end

    local apps = MySQL.query.await([[
        SELECT id, app, username FROM phone_app_accounts WHERE created_by = ?
        UNION
        SELECT a.id, a.app, a.username
        FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE s.citizenid = ?
    ]], { cid, cid }) or {}
    for _, a in ipairs(apps) do
        local shared = tonumber(MySQL.scalar.await(
            'SELECT COUNT(*) FROM phone_app_sessions WHERE account_id = ? AND citizenid <> ?',
            { a.id, cid })) or 0

        if shared > 0 then
            result.skipped[#result.skipped + 1] = ('%s:%s (%d other session(s))'):format(a.app, a.username, shared)
        else
            del('DELETE FROM phone_app_sessions WHERE account_id = ?', { a.id })
            del('DELETE FROM phone_app_accounts WHERE id = ?', { a.id })
            result.apps[#result.apps + 1] = ('%s:%s'):format(a.app, a.username)
        end
    end

    del('DELETE FROM phone_app_sessions WHERE citizenid = ?', { cid })

    return result
end

---/wipemyaccounts: deletes the caller's OWN mail and app accounts, then refreshes their phone so
---the apps drop back to their signed-out state. Console is refused, since the command resolves the
---target from the caller's own character and there is none behind the console.
---
---Restricted to group.admin to match /wipemyphone. Drop the `restricted` field to let any player
---clear their own accounts, which is safe: the target is always the caller.
---@param source integer player server id
lib.addCommand('wipemyaccounts', {
    help = 'Delete YOUR OWN mail and app accounts (logins only, not your phone settings or content).',
    restricted = 'group.admin',
}, function(source)
    if not source or source <= 0 then
        lib.print.error('wipemyaccounts must be run by a player, not the console.')
        return
    end

    local cid = player.getIdentifier(source)
    local result = cid and wipeAccountsFor(cid)
    if not result then
        TriggerClientEvent('ox_lib:notify', source, {
            title = 'Phone', description = 'Could not resolve your character.', type = 'error',
        })
        return
    end

    local removed = #result.mail + #result.apps
    TriggerClientEvent('sd-phone:client:profileReset', source)

    lib.print.info(('wiped %d account(s) for %s%s'):format(
        removed, cid,
        #result.skipped > 0 and (', skipped ' .. table.concat(result.skipped, ', ')) or ''))

    TriggerClientEvent('ox_lib:notify', source, {
        title = 'Accounts cleared',
        description = removed > 0
            and ('Removed %d account(s). Reopen the phone to sign in fresh.'):format(removed)
            or 'You had no accounts of your own to remove.',
        type = removed > 0 and 'success' or 'inform',
    })
end)

---@type table<integer, string[]> What Settings > Reset Phone Fully erases: the content the PHONE
---itself owns, as { table, citizenid column }.
---
---Deliberately narrower than CID_SINGLE above. Left alone: phone_passwords (the reset dialog
---promises saved logins survive), group memberships, and anything holding value or belonging to
---another system - bank history, stock holdings and wallet, casino chips, game saves, racing
---data. Erasing a handset should not reach into the economy.
local DEVICE_CONTENT = {
    { 'phone_contacts',              'citizenid' },
    { 'phone_blocked',               'citizenid' },
    { 'phone_calls',                 'citizenid' },
    { 'phone_messages',              'citizenid' },
    { 'phone_message_reactions',     'citizenid' },
    { 'phone_message_group_members', 'citizenid' },
    { 'phone_message_groups',        'owner_cid' },
    { 'phone_notes',                 'citizenid' },
    { 'phone_photos',                'citizenid' },
    { 'phone_photo_albums',          'citizenid' },
    { 'phone_voice_memos',           'citizenid' },
    { 'phone_map_markers',           'citizenid' },
    { 'phone_alarms',                'citizenid' },
    { 'phone_timer_recents',         'citizenid' },
    { 'phone_documents',             'citizenid' },
    { 'phone_document_folders',      'citizenid' },
    { 'phone_radio',                 'citizenid' },
    { 'phone_radio_saved',           'citizenid' },
    { 'phone_custom_ringtones',      'citizenid' },
}

---Erases one character's phone content for Settings > Reset Phone Fully, leaving their settings
---row, saved passwords, groups and everything of value untouched. Album items go first: they key
---on album id rather than citizenid, so deleting the albums first would orphan them.
---@param cid string framework per-character id
---@return integer rows total rows deleted
local function wipeDeviceContent(cid)
    if not cid or cid == '' then return 0 end
    local rows = del('DELETE FROM phone_photo_album_items WHERE album_id IN (SELECT id FROM phone_photo_albums WHERE citizenid = ?)', { cid })
    for _, entry in ipairs(DEVICE_CONTENT) do
        rows = rows + del(('DELETE FROM %s WHERE %s = ?'):format(entry[1], entry[2]), { cid })
    end
    return rows
end

return { wipeCid = wipeCid, wipeAccountsFor = wipeAccountsFor, wipeDeviceContent = wipeDeviceContent }
