---@type table Backup module; the table returned at end of file. Cloud-backup restore engine:
---copies one phone profile's data onto another identity. Mirrors the table catalog in
---server/admin/wipe.lua - keep the two in sync when an app gains a new per-character table.
local backup = {}

---Runs one statement, swallowing errors (a missing optional-app table must not abort a restore).
---@param sql string parameterized statement
---@param params table statement parameters
---@return integer affected rows affected (0 on failure)
local function run(sql, params)
    local ok, res = pcall(function() return MySQL.update.await(sql, params) end)
    return ok and (tonumber(res) or 0) or 0
end

---Column metadata for a table: names in ordinal order, the auto-increment column (skipped on
---copy so fresh ids are allocated), and the primary-key column set.
---@param tbl string table name
---@return string[] cols, table<string, boolean> autoinc, table<string, boolean> pk
local function describe(tbl)
    local cols, autoinc, pk = {}, {}, {}
    local ok, rows = pcall(function()
        return MySQL.query.await([[
            SELECT COLUMN_NAME AS name, EXTRA AS extra, COLUMN_KEY AS ckey
            FROM information_schema.columns
            WHERE table_schema = DATABASE() AND table_name = ?
            ORDER BY ORDINAL_POSITION
        ]], { tbl })
    end)
    if not ok or type(rows) ~= 'table' then return cols, autoinc, pk end
    for _, r in ipairs(rows) do
        cols[#cols + 1] = r.name
        if tostring(r.extra or ''):find('auto_increment') then autoinc[r.name] = true end
        if r.ckey == 'PRI' then pk[r.name] = true end
    end
    return cols, autoinc, pk
end

---Copies every row of `tbl` owned by `fromId` to `toId` in a single INSERT IGNORE ... SELECT.
---Globally-unique random-id PKs are remapped deterministically (MD5 of old id + new identity,
---truncated to the column's 16-char shape) so a second restore is an idempotent no-op instead
---of a duplicate; PKs that include the identity column need no remap. Cross-copy references
---like phone_messages.mid are left untouched on purpose - reactions keep linking.
---@param tbl string table name
---@param cidCol string identity column
---@param fromId string source identity
---@param toId string target identity
---@return integer rows
local function copyTable(tbl, cidCol, fromId, toId)
    local cols, autoinc, pk = describe(tbl)
    if #cols == 0 then return 0 end

    -- Remap `id` only when it is the sole primary key (identity-composite PKs copy verbatim).
    local remapId = pk.id and not pk[cidCol]
    local names, exprs, params = {}, {}, {}
    for _, col in ipairs(cols) do
        if not autoinc[col] then
            names[#names + 1] = ('`%s`'):format(col)
            if col == cidCol then
                exprs[#exprs + 1] = '?'
                params[#params + 1] = toId
            elseif col == 'id' and remapId then
                exprs[#exprs + 1] = ('SUBSTRING(MD5(CONCAT(`%s`, ?)), 1, 16)'):format(col)
                params[#params + 1] = toId
            else
                exprs[#exprs + 1] = ('`%s`'):format(col)
            end
        end
    end
    params[#params + 1] = fromId

    return run(('INSERT IGNORE INTO `%s` (%s) SELECT %s FROM `%s` WHERE `%s` = ?')
        :format(tbl, table.concat(names, ','), table.concat(exprs, ','), tbl, cidCol), params)
end

---@type table<integer, string[]> Copied tables: { table, identity column }. Everything a
---restore should carry to the new SIM. Deliberately absent: number-keyed public content
---(marketplace/pages/service messages - tied to the old number), username-keyed social apps
---(Photogram/Birdy/Cherry/Ryde survive via account login, and their sessions ARE copied via
---phone_app_sessions), and darkchat/groups room state (moved, not copied, below).
local COPY = {
    { 'phone_contacts',          'citizenid' },
    { 'phone_blocked',           'citizenid' },
    { 'phone_calls',             'citizenid' },
    { 'phone_messages',          'citizenid' },
    { 'phone_message_reactions', 'citizenid' },
    { 'phone_notes',             'citizenid' },
    { 'phone_custom_ringtones',  'citizenid' },
    { 'phone_notif_prefs',       'citizenid' },
    { 'phone_photos',            'citizenid' },
    { 'phone_photo_albums',      'citizenid' },
    { 'phone_voice_memos',       'citizenid' },
    { 'phone_map_markers',       'citizenid' },
    { 'phone_passwords',         'citizenid' },
    { 'phone_alarms',            'citizenid' },
    { 'phone_timer_recents',     'citizenid' },
    { 'phone_stock_holdings',    'citizenid' },
    { 'phone_stock_wallet',      'citizenid' },
    { 'phone_casino_chips',      'citizenid' },
    { 'phone_cookie',            'citizenid' },
    { 'phone_game_stats',        'citizenid' },
    { 'phone_radio_saved',       'citizenid' },
    { 'phone_service_prefs',     'citizenid' },
    { 'phone_bank_transactions', 'citizenid' },
    { 'phone_app_sessions',      'citizenid' },
}

---@type string[] phone_settings columns carried by a restore. The number, citizenid and
---timestamps stay out: the new SIM keeps its own number.
local SETTINGS_COLS = {
    'active_group_id', 'ringtone', 'notification_tone', 'card_name', 'card_avatar',
    'card_email', 'card_address', 'installed_apps', 'home_layout', 'lock_clock',
    'wallpaper', 'passcode', 'face_id', 'chat_text_scale', 'hour24',
    'ringtone_volume', 'call_volume', 'locale', 'dark_theme', 'theme',
}

---Restores a phone profile: copies `fromId`'s data onto `toId` (the current SIM identity) and
---moves live group-chat membership over, rewriting the stored member number to the new SIM's.
---The source profile keeps its rows - whoever holds the old SIM keeps what was on it.
---@param fromId string backed-up identity
---@param toId string current SIM identity
---@param toNumber string current SIM bare-digit number
---@return integer rows total rows written
function backup.restore(fromId, toId, toNumber)
    local rows = 0

    -- Settings row: overwrite the new profile's preferences with the backup's.
    local setParts = {}
    for _, col in ipairs(SETTINGS_COLS) do
        setParts[#setParts + 1] = ('a.`%s` = b.`%s`'):format(col, col)
    end
    rows = rows + run(([[
        UPDATE phone_settings a
        JOIN phone_settings b ON b.citizenid = ?
        SET %s WHERE a.citizenid = ?
    ]]):format(table.concat(setParts, ', ')), { fromId, toId })

    for _, t in ipairs(COPY) do
        rows = rows + copyTable(t[1], t[2], fromId, toId)
    end

    -- Photo album contents: no identity column; remap both sides of the join like copyTable did.
    rows = rows + run([[
        INSERT IGNORE INTO phone_photo_album_items (album_id, photo_id, added_at)
        SELECT SUBSTRING(MD5(CONCAT(i.album_id, ?)), 1, 16),
               SUBSTRING(MD5(CONCAT(i.photo_id, ?)), 1, 16),
               i.added_at
        FROM phone_photo_album_items i
        JOIN phone_photo_albums a ON a.id = i.album_id
        WHERE a.citizenid = ?
    ]], { toId, toId, fromId })

    -- Group chats fan out by the member rows, so membership MOVES to the restored profile
    -- (the old SIM drops out) and the stored member number becomes the new SIM's number.
    rows = rows + run(
        'UPDATE IGNORE phone_message_group_members SET citizenid = ?, number = ? WHERE citizenid = ?',
        { toId, toNumber, fromId })
    rows = rows + run(
        'UPDATE phone_message_groups SET owner_cid = ? WHERE owner_cid = ?', { toId, fromId })

    -- Mailboxes: add the new identity to every account the old identity was signed into.
    local ok, mails = pcall(function()
        return MySQL.query.await(
            "SELECT email, logged_in_citizens FROM phone_mail_accounts WHERE JSON_SEARCH(logged_in_citizens, 'one', ?) IS NOT NULL",
            { fromId })
    end)
    if ok and type(mails) == 'table' then
        for _, m in ipairs(mails) do
            local arr = json.decode(m.logged_in_citizens or '[]') or {}
            local present = false
            for _, c in ipairs(arr) do
                if c == toId then present = true break end
            end
            if not present then
                arr[#arr + 1] = toId
                rows = rows + run(
                    'UPDATE phone_mail_accounts SET logged_in_citizens = ? WHERE email = ?',
                    { json.encode(arr), m.email })
            end
        end
    end

    return rows
end

return backup
