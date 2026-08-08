---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player = require 'bridge.server.player'

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
---@param cid string|nil citizenid whose footprint is wiped
---@return string|nil cid wiped citizenid, nil when unresolvable
---@return integer|nil rows counted rows deleted (nil only alongside a nil cid)
local function wipeCid(cid)
    if not cid or cid == '' then return nil end

    local userFor, accountIds = {}, {}
    local sessions = MySQL.query.await([[
        SELECT s.app, s.account_id, a.username
        FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE s.citizenid = ?
    ]], { cid }) or {}
    for _, r in ipairs(sessions) do
        userFor[r.app] = r.username
        accountIds[#accountIds + 1] = r.account_id
    end

    local number = MySQL.scalar.await('SELECT phone_number FROM phone_settings WHERE citizenid = ?', { cid })

    local rows = 0

    rows = rows + del('DELETE FROM phone_photo_album_items WHERE album_id IN (SELECT id FROM phone_photo_albums WHERE citizenid = ?)', { cid })
    -- Every racer's results on a track this character built, since the track row itself goes below
    -- and a leaderboard pointing at a track that no longer exists is unreadable.
    rows = rows + del('DELETE FROM phone_racing_results WHERE track_id IN (SELECT id FROM phone_racing_tracks WHERE citizenid = ?)', { cid })

    for _, t in ipairs(CID_SINGLE) do
        rows = rows + del(('DELETE FROM %s WHERE %s = ?'):format(t[1], t[2]), { cid })
    end
    for _, t in ipairs(CID_PAIR) do
        rows = rows + del(('DELETE FROM %s WHERE %s = ? OR %s = ?'):format(t[1], t[2], t[3]), { cid, cid })
    end

    if number then
        rows = rows + del('DELETE FROM phone_service_messages WHERE citizen_number = ? OR staff_cid = ?', { number, cid })
    else
        rows = rows + del('DELETE FROM phone_service_messages WHERE staff_cid = ?', { cid })
    end

    local pg = userFor['photogram']
    if pg then
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

    local ch = userFor['cherry']
    if ch then
        del('DELETE FROM phone_cherry_messages WHERE match_id IN (SELECT id FROM phone_cherry_matches WHERE a = ? OR b = ?)', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_messages WHERE sender = ?', { ch })
        rows = rows + del('DELETE FROM phone_cherry_matches WHERE a = ? OR b = ?', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_swipes WHERE swiper = ? OR target = ?', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_blocks WHERE blocker = ? OR blocked = ?', { ch, ch })
        rows = rows + del('DELETE FROM phone_cherry_profiles WHERE username = ?', { ch })
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

    local ry = userFor['ryde']
    if ry then
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

---Deletes only the login identities one character owns, leaving the rest of their phone intact.
---
---Narrower than wipeCid on purpose, and safer in the one place wipeCid is not: an account another
---character is still signed into is SKIPPED rather than deleted, because both of these are shared
---objects. A mail account carries its own messages in the row, so removing it is self-contained;
---an app account is only reachable through phone_app_sessions, so ownership is "nobody else holds
---a session". App CONTENT keyed to the handle (posts, photos, matches) is deliberately left alone
---so this stays predictable; /wipemyphone is the full reset.
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

    local sessions = MySQL.query.await([[
        SELECT s.account_id, s.app, a.username
        FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE s.citizenid = ?
    ]], { cid }) or {}
    for _, s in ipairs(sessions) do
        local shared = tonumber(MySQL.scalar.await(
            'SELECT COUNT(*) FROM phone_app_sessions WHERE account_id = ? AND citizenid <> ?',
            { s.account_id, cid })) or 0

        if shared > 0 then
            result.skipped[#result.skipped + 1] = ('%s:%s (%d other session(s))'):format(s.app, s.username, shared)
        else
            del('DELETE FROM phone_app_accounts WHERE id = ?', { s.account_id })
            result.apps[#result.apps + 1] = ('%s:%s'):format(s.app, s.username)
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

return { wipeCid = wipeCid, wipeAccountsFor = wipeAccountsFor }
