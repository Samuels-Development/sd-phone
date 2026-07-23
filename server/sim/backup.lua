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

---@type table<string, string[]> Self/cross-referencing FK columns pointing at a remapped
---single-column `id` PK; each gets the same MD5 transform so parents stay linked after a copy.
local FK_REMAP = {
    phone_documents        = { 'folder_id' },
    phone_document_folders = { 'parent_id' },
}

---Copies every row of `tbl` owned by `fromId` to `toId` in a single INSERT IGNORE ... SELECT.
---Globally-unique random-id PKs are remapped deterministically (MD5 of old id + new identity,
---truncated to the column's 16-char shape) so a second restore is an idempotent no-op instead
---of a duplicate; PKs that include the identity column need no remap. FK columns in FK_REMAP get
---the same transform so folder/parent links survive; cross-copy refs like phone_messages.mid don't.
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
    local fkSet = {}
    for _, col in ipairs(FK_REMAP[tbl] or {}) do fkSet[col] = true end

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
            elseif fkSet[col] then
                exprs[#exprs + 1] =
                    ('CASE WHEN `%s` IS NULL THEN NULL ELSE SUBSTRING(MD5(CONCAT(`%s`, ?)), 1, 16) END')
                        :format(col, col)
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
    { 'phone_documents',         'citizenid' },
    { 'phone_document_folders',  'citizenid' },
    { 'phone_signatures',        'citizenid' },
}

---@type string[] phone_settings columns carried by a restore. The number, citizenid and
---timestamps stay out: the new SIM keeps its own number.
local SETTINGS_COLS = {
    'active_group_id', 'ringtone', 'notification_tone', 'card_name', 'card_avatar',
    'card_email', 'card_address', 'installed_apps', 'home_layout', 'lock_clock',
    'wallpaper', 'wallpaper_home', 'blur_lock', 'blur_home', 'custom_wallpapers', 'passcode',
    'face_id', 'chat_text_scale', 'phone_scale', 'phone_align', 'hour24', 'ringtone_volume',
    'call_volume', 'locale', 'dark_theme', 'theme',
}

---Overwrites `toId`'s phone_settings preference columns with `fromId`'s, creating the target
---row when it doesn't exist yet (a fresh cloud snapshot has none).
---@param fromId string source identity
---@param toId string target identity
---@return integer rows
local function copySettings(fromId, toId)
    local rows = run('INSERT IGNORE INTO phone_settings (citizenid) VALUES (?)', { toId })
    local setParts = {}
    for _, col in ipairs(SETTINGS_COLS) do
        setParts[#setParts + 1] = ('a.`%s` = b.`%s`'):format(col, col)
    end
    return rows + run(([[
        UPDATE phone_settings a
        JOIN phone_settings b ON b.citizenid = ?
        SET %s WHERE a.citizenid = ?
    ]]):format(table.concat(setParts, ', ')), { fromId, toId })
end

---Copies document signature rows across identities, remapping their own id and the doc_id FK
---the way copyTable remapped phone_documents. The signer's citizenid copies VERBATIM: it names
---who signed (possibly another character), not who owns the document.
---@param fromId string source identity
---@param toId string target identity
---@return integer rows
local function copyDocSignatures(fromId, toId)
    return run([[
        INSERT IGNORE INTO phone_document_signatures (id, doc_id, citizenid, signer, image, created_at)
        SELECT SUBSTRING(MD5(CONCAT(s.id, ?)), 1, 16),
               SUBSTRING(MD5(CONCAT(s.doc_id, ?)), 1, 16),
               s.citizenid, s.signer, s.image, s.created_at
        FROM phone_document_signatures s
        JOIN phone_documents d ON d.id = s.doc_id
        WHERE d.citizenid = ?
    ]], { toId, toId, fromId })
end

---Copies album membership rows across identities, remapping both foreign ids the way
---copyTable remapped their parents (no identity column of its own).
---@param fromId string source identity
---@param toId string target identity
---@return integer rows
local function copyAlbumItems(fromId, toId)
    return run([[
        INSERT IGNORE INTO phone_photo_album_items (album_id, photo_id, added_at)
        SELECT SUBSTRING(MD5(CONCAT(i.album_id, ?)), 1, 16),
               SUBSTRING(MD5(CONCAT(i.photo_id, ?)), 1, 16),
               i.added_at
        FROM phone_photo_album_items i
        JOIN phone_photo_albums a ON a.id = i.album_id
        WHERE a.citizenid = ?
    ]], { toId, toId, fromId })
end

---Deletes every snapshot row a cloud identity holds (profile deletion, and the wipe phase of
---a sync). The phone_settings row goes too - a dead namespace keeps nothing.
---@param cloudId string snapshot identity ('cloud:' prefixed)
function backup.wipe(cloudId)
    -- Join-keyed children go first: their parent rows are the only link to the cloud identity.
    run([[
        DELETE i FROM phone_photo_album_items i
        JOIN phone_photo_albums a ON a.id = i.album_id
        WHERE a.citizenid = ?
    ]], { cloudId })
    run([[
        DELETE s FROM phone_document_signatures s
        JOIN phone_documents d ON d.id = s.doc_id
        WHERE d.citizenid = ?
    ]], { cloudId })
    for _, t in ipairs(COPY) do
        run(('DELETE FROM `%s` WHERE `%s` = ?'):format(t[1], t[2]), { cloudId })
    end
    run('DELETE FROM phone_settings WHERE citizenid = ?', { cloudId })
end

---Snapshot sync: replaces the cloud profile's rows with a fresh copy of the enrolled phone's.
---Wipe-then-copy (not merge) so deletions and edits on the phone reach the snapshot. Restore
---side effects (group-membership move, mail-login append) deliberately stay out - the cloud
---identity is a dead namespace that never acts.
---@param fromId string enrolled phone identity
---@param cloudId string snapshot identity ('cloud:' prefixed)
---@return integer rows total rows written
function backup.sync(fromId, cloudId)
    backup.wipe(cloudId)

    local rows = copySettings(fromId, cloudId)
    for _, t in ipairs(COPY) do
        rows = rows + copyTable(t[1], t[2], fromId, cloudId)
    end
    rows = rows + copyDocSignatures(fromId, cloudId)
    return rows + copyAlbumItems(fromId, cloudId)
end

---Restores a phone profile: copies `fromId`'s data onto `toId` (the current SIM identity) and
---moves live group-chat membership over, rewriting the stored member number to the new SIM's.
---The source profile keeps its rows - whoever holds the old SIM keeps what was on it. Live
---room state (groups, mail logins) can't come from a snapshot, so it moves from `liveFromId` -
---the previously enrolled phone - which for legacy pointer backups IS the backup identity.
---@param fromId string backed-up identity (cloud snapshot, or a phone identity on legacy rows)
---@param toId string current SIM identity
---@param toNumber string current SIM bare-digit number
---@param liveFromId string|nil previously enrolled phone identity (defaults to fromId)
---@return integer rows total rows written
function backup.restore(fromId, toId, toNumber, liveFromId)
    liveFromId = liveFromId or fromId
    local rows = copySettings(fromId, toId)

    for _, t in ipairs(COPY) do
        rows = rows + copyTable(t[1], t[2], fromId, toId)
    end

    rows = rows + copyDocSignatures(fromId, toId)
    rows = rows + copyAlbumItems(fromId, toId)

    -- Group chats fan out by the member rows, so membership MOVES to the restored profile
    -- (the old phone drops out) and the stored member number becomes the new SIM's number.
    rows = rows + run(
        'UPDATE IGNORE phone_message_group_members SET citizenid = ?, number = ? WHERE citizenid = ?',
        { toId, toNumber, liveFromId })
    rows = rows + run(
        'UPDATE phone_message_groups SET owner_cid = ? WHERE owner_cid = ?', { toId, liveFromId })

    -- Mailboxes: add the new identity to every account the previously enrolled phone was
    -- signed into (mail logins are live state - the snapshot identity never signs in).
    local ok, mails = pcall(function()
        return MySQL.query.await(
            "SELECT email, logged_in_citizens FROM phone_mail_accounts WHERE JSON_SEARCH(logged_in_citizens, 'one', ?) IS NOT NULL",
            { liveFromId })
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
