---@type table Lookup-index catalog (server.migrations): indexes the identity scans below lean on.
local migrations = require 'server.migrations'

---@type table Backup module; the table returned at end of file. Cloud-backup restore engine:
---copies one phone profile's data onto another identity. Mirrors the table catalog in
---server/admin/wipe.lua - keep the two in sync when an app gains a new per-character table.
local backup = {}

---Runs one statement, swallowing errors (a missing optional-app table must not abort a restore).
---@param sql string parameterized statement
---@param params table statement parameters
---@return integer affected rows affected (0 on failure)
---@return boolean ok false when the statement raised
local function run(sql, params)
    local ok, res = pcall(function() return MySQL.update.await(sql, params) end)
    if not ok then return 0, false end
    return tonumber(res) or 0, true
end

---@type table<string, table> Memoised describe() results. A table's shape can't change while the
---resource is up, and one sync probed information_schema once per copied table. Callers only read
---these, never mutate them. A failed probe is not cached.
local shapeCache = {}

---Column metadata for a table: names in ordinal order, the auto-increment column (skipped on
---copy so fresh ids are allocated), and the primary-key column set.
---@param tbl string table name
---@return string[] cols, table<string, boolean> autoinc, table<string, boolean> pk
local function describe(tbl)
    local hit = shapeCache[tbl]
    if hit then return hit[1], hit[2], hit[3] end

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
    shapeCache[tbl] = { cols, autoinc, pk }
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
---@return boolean ok false when the copy statement raised
local function copyTable(tbl, cidCol, fromId, toId)
    local cols, autoinc, pk = describe(tbl)
    if #cols == 0 then return 0, true end

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
---phone_app_sessions), darkchat/groups room state (moved, not copied, below), and every VALUE
---table.
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

---@type string[] Tables holding value: the stocks app's cash and shares, casino chips, and owned
---phone cases, which a case store hands out as items. A snapshot never copies them and a restore
---never writes them, so backing up, spending and restoring cannot bring the spent value back;
---value stays with the phone identity that earned it. The wipe still clears them under a cloud
---identity, because snapshots taken before this rule hold copies.
local VALUE = {
    'phone_stock_holdings',
    'phone_stock_wallet',
    'phone_casino_chips',
    'phone_cases',
}

---@type { kind: string, tbl: string, col: string, cid: string }[] Sign-ins and memberships a phone
---holds in rows other identities share: the mailboxes it is signed into, the group chats it is a
---member of, and the ones it owns. They cannot be copied under a cloud identity, so a sync
---records which ones the phone held (phone_cloud_access) and a restore grants only those.
local ACCESS = {
    { kind = 'mail',  tbl = 'phone_mail_sessions',         col = 'email',    cid = 'citizenid' },
    { kind = 'group', tbl = 'phone_message_group_members', col = 'group_id', cid = 'citizenid' },
    { kind = 'owner', tbl = 'phone_message_groups',        col = 'id',       cid = 'owner_cid' },
}

---`?, ?, ...` for an IN list of `n` parameters.
---@param n integer
---@return string
local function placeholders(n)
    return ('?'):rep(n, ', ')
end

---@type string[] phone_settings columns carried by a restore. The number, citizenid and
---timestamps stay out: the new SIM keeps its own number.
local SETTINGS_COLS = {
    'active_group_id', 'ringtone', 'notification_tone', 'card_name', 'card_avatar',
    'card_email', 'card_address', 'installed_apps', 'home_layout', 'lock_clock', 'card_style',
    'wallpaper', 'wallpaper_home', 'blur_lock', 'blur_home', 'custom_wallpapers', 'passcode',
    'face_id', 'chat_text_scale', 'phone_scale', 'phone_align', 'phone_tilt', 'dock_style', 'open_anim',
    'wallpaper_parallax', 'hour24', 'ringtone_volume',
    'call_volume', 'locale', 'dark_theme', 'theme', 'icon_theme', 'icon_custom', 'show_app_names',
}

---Overwrites `toId`'s phone_settings preference columns with `fromId`'s, creating the target
---row when it doesn't exist yet (a fresh cloud snapshot has none).
---@param fromId string source identity
---@param toId string target identity
---@return integer rows
---@return boolean ok false when either statement raised
local function copySettings(fromId, toId)
    local rows, created = run('INSERT IGNORE INTO phone_settings (citizenid) VALUES (?)', { toId })
    local setParts = {}
    for _, col in ipairs(SETTINGS_COLS) do
        setParts[#setParts + 1] = ('a.`%s` = b.`%s`'):format(col, col)
    end
    local updated, ok = run(([[
        UPDATE phone_settings a
        JOIN phone_settings b ON b.citizenid = ?
        SET %s WHERE a.citizenid = ?
    ]]):format(table.concat(setParts, ', ')), { fromId, toId })
    return rows + updated, created and ok
end

---True when every named table exists, so a join copy over an app this server never created is
---skipped as empty rather than counted as a failed statement.
---@param ... string table names
---@return boolean
local function tablesExist(...)
    for i = 1, select('#', ...) do
        if #describe((select(i, ...))) == 0 then return false end
    end
    return true
end

---Copies document signature rows across identities, remapping their own id and the doc_id FK
---the way copyTable remapped phone_documents. The signer's citizenid copies VERBATIM: it names
---who signed (possibly another character), not who owns the document.
---@param fromId string source identity
---@param toId string target identity
---@return integer rows
---@return boolean ok false when the copy statement raised
local function copyDocSignatures(fromId, toId)
    if not tablesExist('phone_document_signatures', 'phone_documents') then return 0, true end
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
---@return boolean ok false when the copy statement raised
local function copyAlbumItems(fromId, toId)
    if not tablesExist('phone_photo_album_items', 'phone_photo_albums') then return 0, true end
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

---Copies a phone profile's data from one identity to another: settings, every COPY table and
---the join-keyed children. Never a VALUE table.
---@param fromId string source identity
---@param toId string target identity
---@return integer rows total rows written
---@return boolean ok false when any copy statement raised
local function copyAll(fromId, toId)
    local rows, ok = copySettings(fromId, toId)
    for _, t in ipairs(COPY) do
        local n, fine = copyTable(t[1], t[2], fromId, toId)
        rows, ok = rows + n, ok and fine
    end
    local docs, docsOk = copyDocSignatures(fromId, toId)
    local albums, albumsOk = copyAlbumItems(fromId, toId)
    return rows + docs + albums, ok and docsOk and albumsOk
end

---@type table<string, { from: string, print: string }> Per cloud identity: the phone it was last
---copied from and that phone's data fingerprint at the time. A sync whose phone still matches
---skips the wipe-and-copy. Held in memory, so the first sync after a restart always copies.
local synced = {}

---Aggregate select list for the fingerprint: a row count plus every row's columns hashed and
---XORed together, so row order is irrelevant. Columns are read as bytes, so a table mixing
---collations still concatenates. The 64-bit hash comes back as text: as a number it would lose
---bits on the way into Lua.
---@param cols string[] column names
---@param alias string table alias the columns are read through
---@return string selectList
local function hashColumns(cols, alias)
    local parts = {}
    for i, col in ipairs(cols) do
        parts[i] = ('IFNULL(CAST(%s.`%s` AS BINARY), 0x00)'):format(alias, col)
    end
    return ([[
        COUNT(*) AS n,
        CAST(COALESCE(BIT_XOR(
            CAST(CONV(SUBSTRING(MD5(CONCAT_WS(0x1f, %s)), 1, 16), 16, 10) AS UNSIGNED)
        ), 0) AS CHAR) AS h
    ]]):format(table.concat(parts, ', '))
end

---Fingerprint of everything a sync would copy or record from `fromId`, read in ONE statement: the
---settings columns, every COPY table, the join-keyed children, the ACCESS rows, plus whether
---`cloudId`'s snapshot row still exists (so a snapshot wiped behind this module's back is copied
---again). Tables this server never created are left out, as the copy leaves them out. Nil when
---the read fails.
---@param fromId string enrolled phone identity
---@param cloudId string snapshot identity
---@return string|nil fingerprint
local function fingerprint(fromId, cloudId)
    local selects, params = {}, {}
    local function add(label, sql, id)
        selects[#selects + 1] = ("SELECT '%s' AS t, %s"):format(label, sql)
        params[#params + 1] = id
    end

    local have = {}
    for _, col in ipairs(describe('phone_settings')) do have[col] = true end

    local settingsCols = {}
    for _, col in ipairs(SETTINGS_COLS) do
        if have[col] then settingsCols[#settingsCols + 1] = col end
    end

    if #settingsCols > 0 then
        local hash = hashColumns(settingsCols, 'x')
        add('phone_settings', hash .. ' FROM phone_settings x WHERE x.citizenid = ?', fromId)
        add('~snapshot', "COUNT(*) AS n, '' AS h FROM phone_settings x WHERE x.citizenid = ?", cloudId)
    end

    for _, t in ipairs(COPY) do
        local cols = {}
        for _, col in ipairs(describe(t[1])) do
            if col ~= t[2] then cols[#cols + 1] = col end
        end
        if #cols > 0 then
            local hash = hashColumns(cols, 'x')
            add(t[1], ('%s FROM `%s` x WHERE x.`%s` = ?'):format(hash, t[1], t[2]), fromId)
        end
    end

    if tablesExist('phone_document_signatures', 'phone_documents') then
        add('phone_document_signatures', ([[
            %s FROM phone_document_signatures x
            JOIN phone_documents d ON d.id = x.doc_id
            WHERE d.citizenid = ?
        ]]):format(hashColumns(describe('phone_document_signatures'), 'x')), fromId)
    end

    if tablesExist('phone_photo_album_items', 'phone_photo_albums') then
        add('phone_photo_album_items', ([[
            %s FROM phone_photo_album_items x
            JOIN phone_photo_albums a ON a.id = x.album_id
            WHERE a.citizenid = ?
        ]]):format(hashColumns(describe('phone_photo_album_items'), 'x')), fromId)
    end

    for _, a in ipairs(ACCESS) do
        if #describe(a.tbl) > 0 then
            local hash = hashColumns({ a.col }, 'x')
            add('access:' .. a.kind, ('%s FROM `%s` x WHERE x.`%s` = ?'):format(hash, a.tbl, a.cid), fromId)
        end
    end

    if #selects == 0 then return nil end

    local ok, rows = pcall(function()
        return MySQL.query.await(table.concat(selects, ' UNION ALL '), params)
    end)
    if not ok or type(rows) ~= 'table' then return nil end

    local parts = {}
    for i, r in ipairs(rows) do
        parts[i] = ('%s=%s:%s'):format(tostring(r.t), tostring(r.n), tostring(r.h))
    end
    table.sort(parts)
    return table.concat(parts, ';')
end

---True when `id` is a snapshot namespace rather than a live phone identity.
---@param id any
---@return boolean
local function isCloud(id)
    return type(id) == 'string' and id:sub(1, 6) == 'cloud:'
end

---Records under `cloudId` every ACCESS row `fromId` holds right now: the backup-time list a
---restore later grants from. The caller has already wiped the previous list.
---@param fromId string enrolled phone identity
---@param cloudId string snapshot identity
---@return boolean ok false when a read or write failed
local function recordAccess(fromId, cloudId)
    local ok = true
    for _, a in ipairs(ACCESS) do
        if #describe(a.tbl) > 0 then
            local sql = ('SELECT `%s` AS ref FROM `%s` WHERE `%s` = ?'):format(a.col, a.tbl, a.cid)
            local read, rows = pcall(function() return MySQL.query.await(sql, { fromId }) end)
            if not read or type(rows) ~= 'table' then
                ok = false
            elseif #rows > 0 then
                local values, params = {}, {}
                for i, r in ipairs(rows) do
                    values[i] = '(?, ?, ?)'
                    params[#params + 1] = cloudId
                    params[#params + 1] = a.kind
                    params[#params + 1] = tostring(r.ref)
                end
                local _, wrote = run('INSERT IGNORE INTO phone_cloud_access (identity, kind, ref) VALUES '
                    .. table.concat(values, ', '), params)
                ok = ok and wrote
            end
        end
    end
    return ok
end

---The ACCESS rows a snapshot recorded at backup time, by kind. Empty for anything but a cloud
---identity: a legacy pointer backup never recorded any, and reading them off its live identity
---would hand over whatever that phone holds today.
---@param cloudId string snapshot identity
---@return table<string, string[]> refs kind -> recorded refs
local function recordedAccess(cloudId)
    local out = {}
    for _, a in ipairs(ACCESS) do out[a.kind] = {} end
    if not isCloud(cloudId) then return out end

    local ok, rows = pcall(function()
        return MySQL.query.await('SELECT kind, ref FROM phone_cloud_access WHERE identity = ?', { cloudId })
    end)
    if not ok or type(rows) ~= 'table' then return out end

    for _, r in ipairs(rows) do
        local list = out[r.kind]
        if list then list[#list + 1] = r.ref end
    end
    return out
end

---Grants `toId` the recorded group chats: membership MOVES from the source phone (group chats
---fan out by member rows, so the old phone drops out) with the stored member number rewritten to
---the new SIM's, and ownership follows. Only groups recorded at backup time AND still held by the
---source phone move: one joined after the backup, or one the phone was removed from, never does.
---@param access table<string, string[]> recordedAccess result
---@param toId string current phone identity
---@param toNumber string current bare-digit number
---@param liveFromId string the profile's source phone identity
---@return integer rows
local function grantGroups(access, toId, toNumber, liveFromId)
    local rows = 0
    local groups, owned = access.group, access.owner

    if #groups > 0 then
        local params = { toId, toNumber, liveFromId }
        for _, id in ipairs(groups) do params[#params + 1] = id end
        rows = rows + run(([[
            UPDATE IGNORE phone_message_group_members SET citizenid = ?, number = ?
            WHERE citizenid = ? AND group_id IN (%s)
        ]]):format(placeholders(#groups)), params)
    end

    if #owned > 0 then
        local params = { toId, liveFromId }
        for _, id in ipairs(owned) do params[#params + 1] = id end
        rows = rows + run(([[
            UPDATE phone_message_groups SET owner_cid = ?
            WHERE owner_cid = ? AND id IN (%s)
        ]]):format(placeholders(#owned)), params)
    end

    return rows
end

---Signs `toId` into the recorded mailboxes, the source phone staying signed in too. Only
---mailboxes recorded at backup time AND that the source phone is still signed into: one signed
---into after the backup never transfers, and one signed out of since is never signed back in.
---The phone_mail_sessions row is written even when the JSON already carries `toId`, so that index
---ends up right whichever write an earlier restore made.
---@param emails string[] recorded mailboxes
---@param toId string current phone identity
---@param liveFromId string the profile's source phone identity
---@return integer rows
local function grantMail(emails, toId, liveFromId)
    if #emails == 0 then return 0 end

    local ok, mails = pcall(function()
        return MySQL.query.await(('SELECT email, logged_in_citizens FROM phone_mail_accounts WHERE email IN (%s)')
            :format(placeholders(#emails)), emails)
    end)
    if not ok or type(mails) ~= 'table' then return 0 end

    local rows = 0
    for _, m in ipairs(mails) do
        local arr = json.decode(m.logged_in_citizens or '[]') or {}
        if lib.table.contains(arr, liveFromId) then
            run('INSERT IGNORE INTO phone_mail_sessions (citizenid, email) VALUES (?, ?)', { toId, m.email })
            if not lib.table.contains(arr, toId) then
                arr[#arr + 1] = toId
                rows = rows + run('UPDATE phone_mail_accounts SET logged_in_citizens = ? WHERE email = ?',
                    { json.encode(arr), m.email })
            end
        end
    end
    return rows
end

---Deletes every snapshot row a cloud identity holds (profile deletion, and the wipe phase of
---a sync), VALUE tables included. The phone_settings row goes too - a dead namespace keeps
---nothing. Anything but a `cloud:` identity is refused: this deletes by identity across every
---phone table, and a live phone's data must never be the target.
---@param cloudId string snapshot identity ('cloud:' prefixed)
function backup.wipe(cloudId)
    if not isCloud(cloudId) then return end
    synced[cloudId] = nil
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
    for _, tbl in ipairs(VALUE) do
        run(('DELETE FROM `%s` WHERE citizenid = ?'):format(tbl), { cloudId })
    end
    run('DELETE FROM phone_cloud_access WHERE identity = ?', { cloudId })
    run('DELETE FROM phone_settings WHERE citizenid = ?', { cloudId })
end

---Snapshot sync: replaces the cloud profile's rows with a fresh copy of the enrolled phone's.
---Wipe-then-copy (not merge) so deletions and edits on the phone reach the snapshot. Mailbox
---sign-ins and group memberships are only RECORDED (recordAccess), never granted to the cloud
---identity - it is a dead namespace that never acts.
---
---A phone whose data fingerprint still matches the one its snapshot was copied at is skipped:
---the snapshot already holds exactly that data, and a holster-triggered auto-sync otherwise
---rewrote every row of every table. The fingerprint is only recorded after a copy in which no
---statement failed, so a partial snapshot is always copied again.
---@param fromId string enrolled phone identity
---@param cloudId string snapshot identity ('cloud:' prefixed)
---@return integer rows total rows written (0 when skipped as unchanged)
function backup.sync(fromId, cloudId)
    if not isCloud(cloudId) or fromId == cloudId then return 0 end
    local current = fingerprint(fromId, cloudId)
    local last = synced[cloudId]
    if current and last and last.from == fromId and last.print == current then return 0 end

    backup.wipe(cloudId)
    local rows, ok = copyAll(fromId, cloudId)
    local recorded = recordAccess(fromId, cloudId)
    if current and ok and recorded then synced[cloudId] = { from = fromId, print = current } end
    return rows
end

---Restores a phone profile: copies the snapshot `fromId`'s data onto `toId` (the current SIM
---identity), then grants the mailboxes and group chats it recorded at backup time (grantMail,
---grantGroups), each only while the source phone `liveFromId` still holds it. Nothing is read
---live off the source phone as something to hand over, so whoever holds it now keeps whatever
---they signed into or joined since. The source profile keeps its rows.
---
---Only a cloud snapshot restores. A legacy pointer backup names a live phone identity, and
---copying from it would hand over whatever that phone holds today, so it writes nothing. Nor is
---anything written when `toId` is the profile's own phone, unless `allowSelf` (character mode,
---where every phone is the character): elsewhere a self-restore would only copy the phone's data
---back over itself under fresh ids.
---@param fromId string cloud snapshot identity
---@param toId string current SIM identity
---@param toNumber string current SIM bare-digit number
---@param liveFromId string|nil previously enrolled phone identity (defaults to fromId)
---@param allowSelf boolean|nil restore onto `liveFromId` itself (character mode)
---@return integer rows total rows written
function backup.restore(fromId, toId, toNumber, liveFromId, allowSelf)
    liveFromId = liveFromId or fromId
    if not isCloud(fromId) or toId == fromId then return 0 end
    if toId == liveFromId and not allowSelf then return 0 end

    local rows = copyAll(fromId, toId)
    local access = recordedAccess(fromId)
    rows = rows + grantGroups(access, toId, toNumber, liveFromId)
    return rows + grantMail(access.mail, toId, liveFromId)
end

---Adds the lookup indexes server.migrations declares for the tables a sync reads and wipes by
---identity. Run at boot by server/sim/init.lua while cloud backup is on.
function backup.ensureIndexes()
    for _, t in ipairs(COPY) do migrations.applyIndexes(t[1]) end
end

return backup
