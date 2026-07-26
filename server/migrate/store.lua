---@type table Data layer for the lb-phone import (server.migrate.store): probes whether lb-phone's
---tables exist, reads lb-phone rows, and runs the chunked INSERT IGNORE writers into sd-phone's own
---tables. Table names are built from a validated prefix; every value is bound as a ? parameter.
local store = {}

local config   = require 'configs.config'
local settings = require 'server.settings.store'

---@type string Validated lb-phone table prefix. Falls back to the default when the configured
---value is not a plain identifier.
local PREFIX = (config.Migrate and config.Migrate.sourcePrefix) or 'phone_'
if type(PREFIX) ~= 'string' or not PREFIX:match('^[%w_]*$') then PREFIX = 'phone_' end

---An lb-phone table name for `name`, prefixed. Callers pass literal suffixes only. When the
---name collides with an sd-phone table (notes, photos, photo_albums, mail_accounts, ...), the
---schema bootstrap renames the lb-phone original to `<name>_lb` (util.rescueLegacyTable);
---prefer that rescued copy whenever it exists so the importer still reads the lb-phone data.
---@param name string suffix, e.g. 'phones'
---@return string full table name
local function lbt(name)
    local full = PREFIX .. name
    local rescued = full .. '_lb'
    local n = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ? AND table_type = 'BASE TABLE'
    ]], { rescued })
    if (tonumber(n) or 0) > 0 then return rescued end
    return full
end

store.lbTable = lbt

---Resolves an lb-phone source table, or nil when this database has no lb data for it.
---
---Checking only that `phone_<name>` exists is not enough: for the names lb-phone and sd-phone share
---(photos, notes, photo_albums, mail_accounts, message_reactions) the bare name is sd-phone's OWN
---table once the schema bootstrap has run, and querying it with lb-phone's column names throws.
---`markerColumn` is a column only the lb-phone shape has, so a porter reads the bare table only when
---it really is lb-phone's.
---@param name string suffix, e.g. 'mail_accounts'
---@param markerColumn string|nil column unique to the lb-phone shape
---@return string|nil table name to read from
function store.lbSource(name, markerColumn)
    local full = PREFIX .. name
    local rescued = full .. '_lb'
    if store.tableExists(rescued) then return rescued end
    if not store.tableExists(full) then return nil end
    if markerColumn and not store.tableHasColumn(full, markerColumn) then return nil end
    return full
end

---True if a base table with this exact name exists in the current schema. Read-only.
---@param name string table name
---@return boolean
function store.tableExists(name)
    local n = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ? AND table_type = 'BASE TABLE'
    ]], { name })
    return (tonumber(n) or 0) > 0
end

---True if the table has the given column. Read-only.
---@param name string table name
---@param column string column name
---@return boolean
function store.tableHasColumn(name, column)
    local n = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
    ]], { name, column })
    return (tonumber(n) or 0) > 0
end

---Blocks until every target exists, or gives up after `tries` polls. A target is either a plain
---table name or `{ name, marker }`; with a marker the table must also carry that column — the
---names lb-phone shares with sd-phone exist from the start in the foreign shape, and only grow
---the marker once the schema bootstrap has moved the foreign table aside and rebuilt sd-phone's.
---@param targets (string|{ [1]: string, [2]: string })[] table names, optionally with a marker column
---@param tries integer max polls
---@param delayMs integer wait between polls
---@return boolean ready
function store.waitForTables(targets, tries, delayMs)
    for _ = 1, tries do
        local allThere = true
        for _, t in ipairs(targets) do
            local name   = type(t) == 'table' and t[1] or t
            local marker = type(t) == 'table' and t[2] or nil
            if not store.tableExists(name) or (marker and not store.tableHasColumn(name, marker)) then
                allThere = false
                break
            end
        end
        if allThere then return true end
        Wait(delayMs)
    end
    return false
end

---Creates the phone_migrations bookkeeping table if absent; one row per completed migration.
function store.ensureMarkerTable()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_migrations (
            name       VARCHAR(64) NOT NULL,
            applied_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            stats      JSON        NULL,
            PRIMARY KEY (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---True if the named migration has already been recorded as done. Read-only.
---@param name string migration name
---@return boolean
function store.migrationDone(name)
    local hit = MySQL.scalar.await('SELECT 1 FROM phone_migrations WHERE name = ? LIMIT 1', { name })
    return hit ~= nil
end

---Records a migration as complete, stamping the per-domain stats as JSON. Idempotent (INSERT IGNORE).
---@param name string migration name
---@param stats table per-domain counts
function store.recordMigration(name, stats)
    MySQL.query.await(
        'INSERT IGNORE INTO phone_migrations (name, stats) VALUES (?, ?)',
        { name, json.encode(stats or {}) }
    )
end

---@type string Marker-row prefix for a single completed domain.
local DOMAIN_MARKER = 'lbphone:'

---The set of domain keys already imported. Gating per domain (rather than one marker for the whole
---import) is what lets a server that ran an earlier version pick up only the domains added since.
---@return table<string, boolean>
function store.completedDomains()
    local rows = MySQL.query.await(
        'SELECT name FROM phone_migrations WHERE name LIKE ?', { DOMAIN_MARKER .. '%' }) or {}
    local set = {}
    for _, r in ipairs(rows) do
        local key = tostring(r.name):sub(#DOMAIN_MARKER + 1)
        if key ~= '' then set[key] = true end
    end
    return set
end

---Marks one domain as imported, stamping its counts. Idempotent (INSERT IGNORE).
---@param key string domain key
---@param stats table counts returned by the porter
function store.recordDomain(key, stats)
    MySQL.query.await(
        'INSERT IGNORE INTO phone_migrations (name, stats) VALUES (?, ?)',
        { DOMAIN_MARKER .. key, json.encode(stats or {}) }
    )
end

---Backfills domain markers for an install that completed the pre-domain-marker import, so those
---domains are not needlessly re-run. Returns true when the legacy marker was found.
---@param legacyName string old whole-import marker name
---@param keys string[] domain keys that marker covered
---@return boolean backfilled
function store.backfillLegacyDomains(legacyName, keys)
    if not store.migrationDone(legacyName) then return false end
    local done = store.completedDomains()
    for _, key in ipairs(keys) do
        if not done[key] then store.recordDomain(key, { backfilled = true }) end
    end
    return true
end

---Loads the framework's persistent character roster: qb/QBox reads `players` (citizenid + license),
---ESX reads `users` (identifier). A non-standard schema degrades to empty maps.
---@param frameworkName 'qb'|'esx'
---@return { cids: table<string, boolean>, licenseToCids: table<string, string[]> }
function store.loadRoster(frameworkName)
    local cids, licenseToCids = {}, {}
    local ok, rows = pcall(function()
        if frameworkName == 'esx' then
            return MySQL.query.await('SELECT identifier AS citizenid, NULL AS license FROM users') or {}
        end
        return MySQL.query.await('SELECT citizenid, license FROM players') or {}
    end)
    if not ok or type(rows) ~= 'table' then return { cids = cids, licenseToCids = licenseToCids } end

    for _, r in ipairs(rows) do
        local cid = r.citizenid
        if cid and cid ~= '' then
            cids[cid] = true
            local lic = r.license
            if lic and lic ~= '' then
                local bucket = licenseToCids[lic]
                if not bucket then bucket = {}; licenseToCids[lic] = bucket end
                bucket[#bucket + 1] = cid
            end
        end
    end
    return { cids = cids, licenseToCids = licenseToCids }
end

---Every lb-phone phone: its owner id, number and lock pin. Read-only.
---@return { id: any, owner_id: string, phone_number: string, pin: string|nil }[]
function store.lbPhones()
    return MySQL.query.await(('SELECT id, owner_id, phone_number, pin FROM %s'):format(lbt('phones'))) or {}
end

---Every lb-phone contact, tagged with its owner's number (`phone_number`). Read-only.
---@return table[]
function store.lbContacts()
    return MySQL.query.await(([[
        SELECT contact_phone_number, firstname, lastname, profile_image, email, address, favourite, phone_number
        FROM %s
    ]]):format(lbt('phone_contacts'))) or {}
end

---Every lb-phone blocked-number pair (owner number -> blocked number). Read-only.
---@return { phone_number: string, blocked_number: string }[]
function store.lbBlocked()
    return MySQL.query.await(
        ('SELECT phone_number, blocked_number FROM %s'):format(lbt('phone_blocked_numbers'))) or {}
end

---Every lb-phone call, with the timestamp pre-converted to a unix epoch in SECONDS (sd-phone's
---called_at contract). Read-only.
---@return { id: any, caller: string, callee: string, duration: number, answered: any, ts: number }[]
function store.lbCalls()
    return MySQL.query.await(([[
        SELECT id, caller, callee, duration, answered, UNIX_TIMESTAMP(timestamp) AS ts
        FROM %s
    ]]):format(lbt('phone_calls'))) or {}
end

---Every lb-phone message channel, newest-activity epoch as `created_at` (seconds). Read-only.
---@return { id: any, is_group: any, name: string|nil, created_at: number }[]
function store.lbChannels()
    return MySQL.query.await(([[
        SELECT id, is_group, name, UNIX_TIMESTAMP(last_message_timestamp) AS created_at
        FROM %s
    ]]):format(lbt('message_channels'))) or {}
end

---Every lb-phone channel membership row. Grouped by the porter. Read-only.
---@return { channel_id: any, phone_number: string, is_owner: any }[]
function store.lbChannelMembers()
    return MySQL.query.await(
        ('SELECT channel_id, phone_number, is_owner FROM %s'):format(lbt('message_members'))) or {}
end

---Every lb-phone message, oldest-first within each channel, timestamp as a unix epoch in seconds.
---Loaded in one pass and grouped by channel in Lua. Read-only.
---@return { id: any, channel_id: any, sender: string, content: string|nil, attachments: string|nil, ts: number }[]
function store.lbMessages()
    return MySQL.query.await(([[
        SELECT id, channel_id, sender, content, attachments, UNIX_TIMESTAMP(timestamp) AS ts
        FROM %s
        ORDER BY channel_id ASC, timestamp ASC
    ]]):format(lbt('message_messages'))) or {}
end

---Every lb-phone photo; `created_at` is kept as the raw datetime string. Read-only.
---@return { id: any, phone_number: string, link: string, is_favourite: any, created_at: string }[]
function store.lbPhotos()
    -- The timestamp comes back as unix seconds: oxmysql hands TIMESTAMP columns to Lua as
    -- millisecond numbers, which a TIMESTAMP insert then coerces to a zero date. The porter
    -- formats these seconds back into a DATETIME literal.
    return MySQL.query.await(([[
        SELECT id, phone_number, link, is_favourite, UNIX_TIMESTAMP(`timestamp`) AS created_ts
        FROM %s
    ]]):format(lbt('photos'))) or {}
end

---Every lb-phone photo album. Read-only.
---@return { id: any, phone_number: string, title: string }[]
function store.lbAlbums()
    return MySQL.query.await(
        ('SELECT id, phone_number, title FROM %s'):format(lbt('photo_albums'))) or {}
end

---Every lb-phone album<->photo link. Read-only.
---@return { album_id: any, photo_id: any }[]
function store.lbAlbumPhotos()
    return MySQL.query.await(
        ('SELECT album_id, photo_id FROM %s'):format(lbt('photo_album_photos'))) or {}
end

---Every lb-phone note, timestamp pre-formatted as an ISO string. Read-only.
---@return { id: any, phone_number: string, title: string|nil, content: string|nil, created_iso: string }[]
function store.lbNotes()
    return MySQL.query.await(([[
        SELECT id, phone_number, title, content,
               DATE_FORMAT(timestamp, '%%Y-%%m-%%dT%%H:%%i:%%s.000Z') AS created_iso
        FROM %s
    ]]):format(lbt('notes'))) or {}
end

---Runs a chunked multi-row INSERT IGNORE. `prefixSql` ends at the word VALUES; one placeholder
---group is appended per row, nil columns emit a literal NULL, and an empty batch is a no-op.
---`suffixSql` is appended after the groups, for an ON DUPLICATE KEY UPDATE tail.
---@param prefixSql string 'INSERT IGNORE INTO ... (cols) VALUES'
---@param cols integer columns per row
---@param rows any[][] one parameter array per row
---@param suffixSql string|nil trailing clause appended after the value groups
local function insertMulti(prefixSql, cols, rows, suffixSql)
    if type(rows) ~= 'table' or #rows == 0 then return end
    local total = #rows
    for i = 1, total, 300 do
        local last = math.min(i + 299, total)
        local groups, params, k = {}, {}, 0
        for j = i, last do
            local r = rows[j]
            local cells = {}
            for c = 1, cols do
                local v = r[c]
                if v == nil then
                    cells[c] = 'NULL'
                else
                    k = k + 1
                    params[k] = v
                    cells[c] = '?'
                end
            end
            groups[#groups + 1] = '(' .. table.concat(cells, ',') .. ')'
        end
        local sql = prefixSql .. ' ' .. table.concat(groups, ',')
        if suffixSql then sql = sql .. ' ' .. suffixSql end
        MySQL.query.await(sql, params)
    end
end

---@type fun(prefixSql: string, cols: integer, rows: any[][], suffixSql?: string) Public alias for porters.
store.insertMulti = insertMulti

---Adopts a player's lb-phone number (and lock passcode) as their sd-phone number. Returns 'set'
---when it wrote, 'skip' when already onboarded, 'conflict' when the number belongs to someone else.
---@param cid string citizenid
---@param number string bare digits
---@param pin string|nil 4-6 digit lock code, or nil
---@param dryRun boolean
---@return 'set'|'skip'|'conflict'
function store.adoptNumber(cid, number, pin, dryRun)
    if not cid or cid == '' or number == '' then return 'skip' end

    local existing = settings.getPhoneNumber(cid)
    if existing and existing ~= '' then return 'skip' end

    local owner = settings.getCitizenByNumber(number)
    if owner and owner ~= cid then return 'conflict' end

    if dryRun then return 'set' end

    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, phone_number, passcode) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            phone_number = IF(phone_number IS NULL OR phone_number = '', VALUES(phone_number), phone_number),
            passcode     = IF(passcode IS NULL OR passcode = '', VALUES(passcode), passcode)
    ]], { cid, number, pin })
    return 'set'
end

---The set of `citizenid|phone` keys already present in phone_contacts. Read-only.
---@return table<string, boolean>
function store.existingContactKeys()
    local rows = MySQL.query.await('SELECT citizenid, phone FROM phone_contacts') or {}
    local set = {}
    for _, r in ipairs(rows) do
        set[('%s|%s'):format(r.citizenid, (tostring(r.phone or ''):gsub('%D', '')))] = true
    end
    return set
end

---Insert a batch of contacts. rows: { id, citizenid, name, phone, email, address, color, avatar, favorite }.
---@param rows any[][]
function store.insertContacts(rows)
    insertMulti('INSERT IGNORE INTO phone_contacts (id, citizenid, name, phone, email, address, color, avatar, favorite) VALUES', 9, rows)
end

---Insert a batch of blocked numbers. rows: { citizenid, number }.
---@param rows any[][]
function store.insertBlocked(rows)
    insertMulti('INSERT IGNORE INTO phone_blocked (citizenid, number) VALUES', 2, rows)
end

---Insert a batch of call-log rows. rows: { id, citizenid, number, name, direction, duration, seen, called_at }.
---@param rows any[][]
function store.insertCalls(rows)
    insertMulti('INSERT IGNORE INTO phone_calls (id, citizenid, `number`, name, direction, duration, seen, called_at) VALUES', 8, rows)
end

---Insert a batch of group threads. rows: { id, name, owner_cid, created_at }.
---@param rows any[][]
function store.insertGroups(rows)
    insertMulti('INSERT IGNORE INTO phone_message_groups (id, name, owner_cid, created_at) VALUES', 4, rows)
end

---Insert a batch of group members. rows: { group_id, citizenid, number, name }.
---@param rows any[][]
function store.insertGroupMembers(rows)
    insertMulti('INSERT IGNORE INTO phone_message_group_members (group_id, citizenid, number, name) VALUES', 4, rows)
end

---Insert a batch of message mailbox copies. rows:
---{ id, mid, citizenid, conversation, sender, direction, kind, body, meta, is_read, withheld, created_at }.
---@param rows any[][]
function store.insertMessages(rows)
    insertMulti('INSERT IGNORE INTO phone_messages (id, mid, citizenid, conversation, sender, direction, kind, body, meta, is_read, withheld, created_at) VALUES', 12, rows)
end

---Insert a batch of photos. rows: { id, citizenid, url, favorite, created_at }.
---@param rows any[][]
function store.insertPhotos(rows)
    insertMulti('INSERT IGNORE INTO phone_photos (id, citizenid, url, favorite, created_at) VALUES', 5, rows)
end

---Insert a batch of albums. rows: { id, citizenid, name }.
---@param rows any[][]
function store.insertAlbums(rows)
    insertMulti('INSERT IGNORE INTO phone_photo_albums (id, citizenid, name) VALUES', 3, rows)
end

---Insert a batch of album<->photo links. rows: { album_id, photo_id }.
---@param rows any[][]
function store.insertAlbumItems(rows)
    insertMulti('INSERT IGNORE INTO phone_photo_album_items (album_id, photo_id) VALUES', 2, rows)
end

---Insert a batch of notes. rows: { citizenid, id, body, sketches, images, created_at, updated_at }.
---@param rows any[][]
function store.insertNotes(rows)
    insertMulti('INSERT IGNORE INTO phone_notes (citizenid, id, body, sketches, images, created_at, updated_at) VALUES', 7, rows)
end

---Every lb-phone phone that carries a settings blob. Read-only.
---@return { phone_number: string, settings: string }[]
function store.lbPhoneSettings()
    return MySQL.query.await(
        ('SELECT phone_number, settings FROM %s WHERE settings IS NOT NULL'):format(lbt('phones'))) or {}
end

---Fill-only settings merge. rows: { citizenid, wallpaper, blur_lock, blur_home, theme, brightness,
---phone_scale, hour24, ringtone, notification_tone, ringtone_volume, call_volume }.
---@param rows any[][]
function store.fillSettings(rows)
    insertMulti([[
        INSERT INTO phone_settings
            (citizenid, wallpaper, blur_lock, blur_home, theme, brightness, phone_scale, hour24,
             ringtone, notification_tone, ringtone_volume, call_volume)
        VALUES
    ]], 12, rows, [[
        ON DUPLICATE KEY UPDATE
            wallpaper         = IF(wallpaper IS NULL, VALUES(wallpaper), wallpaper),
            blur_lock         = IF(blur_lock IS NULL, VALUES(blur_lock), blur_lock),
            blur_home         = IF(blur_home IS NULL, VALUES(blur_home), blur_home),
            theme             = IF(theme IS NULL, VALUES(theme), theme),
            brightness        = IF(brightness IS NULL, VALUES(brightness), brightness),
            phone_scale       = IF(phone_scale IS NULL, VALUES(phone_scale), phone_scale),
            hour24            = IF(hour24 IS NULL, VALUES(hour24), hour24),
            ringtone          = IF(ringtone IS NULL, VALUES(ringtone), ringtone),
            notification_tone = IF(notification_tone IS NULL, VALUES(notification_tone), notification_tone),
            ringtone_volume   = IF(ringtone_volume IS NULL, VALUES(ringtone_volume), ringtone_volume),
            call_volume       = IF(call_volume IS NULL, VALUES(call_volume), call_volume)
    ]])
end

---@return table[]
function store.lbWallet()
    return MySQL.query.await(([[
        SELECT id, phone_number, amount, company, UNIX_TIMESTAMP(`timestamp`) AS ts FROM %s
    ]]):format(lbt('wallet_transactions'))) or {}
end

---@param rows any[][] { citizenid, label, amount, category, created_at, src_id }
function store.insertBankTx(rows)
    insertMulti('INSERT IGNORE INTO phone_bank_transactions (citizenid, label, amount, category, created_at, src_id) VALUES', 6, rows)
end

---@return { message_id: any, phone_number: string, reaction: string }[]
function store.lbReactions()
    return MySQL.query.await(
        ('SELECT message_id, phone_number, reaction FROM %s'):format(lbt('message_reactions'))) or {}
end

---Which of these mids exist in phone_messages, queried in chunks. A reaction whose message was not
---migrated can never render, so the porter drops it rather than importing junk.
---@param mids string[]
---@return table<string, boolean>
function store.existingMids(mids)
    local set = {}
    for i = 1, #mids, 500 do
        local last = math.min(i + 499, #mids)
        local holes, params = {}, {}
        for j = i, last do
            holes[#holes + 1] = '?'
            params[#params + 1] = mids[j]
        end
        local rows = MySQL.query.await(
            ('SELECT DISTINCT mid FROM phone_messages WHERE mid IN (%s)'):format(table.concat(holes, ',')),
            params) or {}
        for _, r in ipairs(rows) do set[r.mid] = true end
    end
    return set
end

---@param rows any[][] { mid, citizenid, emoji, created_at }
function store.insertReactions(rows)
    insertMulti('INSERT IGNORE INTO phone_message_reactions (mid, citizenid, emoji, created_at) VALUES', 4, rows)
end

---@return table[]
function store.lbVoiceMemos()
    return MySQL.query.await(([[
        SELECT id, phone_number, file_name, file_url, file_length,
               UNIX_TIMESTAMP(created_at) AS ts
        FROM %s
    ]]):format(lbt('voice_memos_recordings'))) or {}
end

---@param rows any[][] { citizenid, name, url, duration, created_at, src_id }
function store.insertVoiceMemos(rows)
    insertMulti('INSERT IGNORE INTO phone_voice_memos (citizenid, name, url, duration, created_at, src_id) VALUES', 6, rows)
end

---@return { address: string, password: string }[]
function store.lbMailAccounts()
    return MySQL.query.await(('SELECT address, password FROM %s'):format(lbt('mail_accounts'))) or {}
end

---@return table[]
function store.lbMailMessages()
    return MySQL.query.await(([[
        SELECT id, recipient, sender, subject, content, attachments, actions, `read`,
               UNIX_TIMESTAMP(`timestamp`) AS ts
        FROM %s ORDER BY `timestamp` ASC
    ]]):format(lbt('mail_messages'))) or {}
end

---@return { phone_number: string, app: string, username: string }[]
function store.lbLoggedIn()
    return MySQL.query.await(
        ('SELECT phone_number, app, username FROM %s'):format(lbt('logged_in_accounts'))) or {}
end

---@param rows any[][] { email, password_hash, display_name, messages, logged_in_citizens }
function store.insertMailAccounts(rows)
    insertMulti('INSERT IGNORE INTO phone_mail_accounts (email, password_hash, display_name, messages, logged_in_citizens) VALUES', 5, rows)
end

---Usernames already present in Photogram, so a migrated account never overwrites a live one.
---@return table<string, boolean>
function store.existingPhotogramUsernames()
    local rows = MySQL.query.await('SELECT username FROM phone_photogram_profiles') or {}
    local set = {}
    for _, r in ipairs(rows) do set[r.username] = true end
    return set
end

---@return table[]
function store.lbIgAccounts()
    return MySQL.query.await(([[
        SELECT username, display_name, password, bio, profile_image, private, verified,
               phone_number, UNIX_TIMESTAMP(date_joined) AS ts
        FROM %s
    ]]):format(lbt('instagram_accounts'))) or {}
end

---@return table[]
function store.lbIgPosts()
    return MySQL.query.await(([[
        SELECT id, username, media, caption, location, UNIX_TIMESTAMP(`timestamp`) AS ts FROM %s
    ]]):format(lbt('instagram_posts'))) or {}
end

---@return table[]
function store.lbIgComments()
    return MySQL.query.await(([[
        SELECT id, post_id, username, comment, UNIX_TIMESTAMP(`timestamp`) AS ts FROM %s
    ]]):format(lbt('instagram_comments'))) or {}
end

---@return table[]
function store.lbIgLikes()
    return MySQL.query.await(
        ('SELECT id, username, is_comment FROM %s'):format(lbt('instagram_likes'))) or {}
end

---@return table[]
function store.lbIgFollows()
    return MySQL.query.await(
        ('SELECT followed, follower FROM %s'):format(lbt('instagram_follows'))) or {}
end

---@return table[]
function store.lbIgRequests()
    return MySQL.query.await(([[
        SELECT requester, requestee, UNIX_TIMESTAMP(`timestamp`) AS ts FROM %s
    ]]):format(lbt('instagram_follow_requests'))) or {}
end

---@return table[]
function store.lbIgStories()
    return MySQL.query.await(([[
        SELECT id, username, image, UNIX_TIMESTAMP(`timestamp`) AS ts FROM %s
    ]]):format(lbt('instagram_stories'))) or {}
end

---The viewer column is `viewer` here, not `username` as on every other instagram table.
---@return table[]
function store.lbIgStoryViews()
    return MySQL.query.await(([[
        SELECT story_id, viewer AS username, UNIX_TIMESTAMP(`timestamp`) AS ts FROM %s
    ]]):format(lbt('instagram_stories_views'))) or {}
end

---@return table[]
function store.lbIgMessages()
    return MySQL.query.await(([[
        SELECT id, sender, recipient, content, attachments, UNIX_TIMESTAMP(`timestamp`) AS ts FROM %s
    ]]):format(lbt('instagram_messages'))) or {}
end

---@return table[]
function store.lbIgNotifications()
    return MySQL.query.await(([[
        SELECT id, username, `from` AS from_user, `type`, post_id, UNIX_TIMESTAMP(`timestamp`) AS ts
        FROM %s
    ]]):format(lbt('instagram_notifications'))) or {}
end

---@param rows any[][] { username, display_name, bio, avatar, is_private, verified, created_at }
function store.insertPgProfiles(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_profiles (username, display_name, bio, avatar, is_private, verified, created_at) VALUES', 7, rows)
end

---@param rows any[][] { id, author, images, caption, location, created_at }
function store.insertPgPosts(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_posts (id, author, images, caption, location, created_at) VALUES', 6, rows)
end

---@param rows any[][] { id, post_id, author, body, gif_url, created_at }
function store.insertPgComments(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_comments (id, post_id, author, body, gif_url, created_at) VALUES', 6, rows)
end

---@param rows any[][] { post_id, username, created_at }
function store.insertPgLikes(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_likes (post_id, username, created_at) VALUES', 3, rows)
end

---@param rows any[][] { comment_id, username, created_at }
function store.insertPgCommentLikes(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_comment_likes (comment_id, username, created_at) VALUES', 3, rows)
end

---@param rows any[][] { follower, target, status, created_at }
function store.insertPgFollows(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_follows (follower, target, status, created_at) VALUES', 4, rows)
end

---@param rows any[][] { id, author, image, created_at }
function store.insertPgStories(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_stories (id, author, image, created_at) VALUES', 4, rows)
end

---@param rows any[][] { story_id, username, created_at }
function store.insertPgStoryViews(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_story_views (story_id, username, created_at) VALUES', 3, rows)
end

---@param rows any[][] { id, from_user, to_user, body, kind, meta, reactions, read_flag, created_at }
function store.insertPgDms(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_dms (id, from_user, to_user, body, kind, meta, reactions, read_flag, created_at) VALUES', 9, rows)
end

---@param rows any[][] { id, recipient, kind, actor, post_id, seen, created_at }
function store.insertPgNotifications(rows)
    insertMulti('INSERT IGNORE INTO phone_photogram_notifications (id, recipient, kind, actor, post_id, seen, created_at) VALUES', 7, rows)
end

---Accounts-engine rows for migrated app accounts.
---@param rows any[][] { app, username, display_name, password_hash }
function store.insertPgAccounts(rows)
    insertMulti('INSERT IGNORE INTO phone_app_accounts (app, username, display_name, password_hash) VALUES', 4, rows)
end

---Sessions for migrated app accounts. `linked` counts rows whose account exists and now has a
---session; `inserted` counts only the new ones. They differ on a re-run, where every session is
---already present and INSERT IGNORE affects no rows: that is success, not failure, so callers must
---judge on `linked`.
---@param rows any[][] { app, citizenid, username }
---@return integer linked, integer inserted
function store.insertPgSessions(rows)
    local linked, inserted = 0, 0
    for _, r in ipairs(rows) do
        local id = MySQL.scalar.await(
            'SELECT id FROM phone_app_accounts WHERE app = ? AND username = ? LIMIT 1', { r[1], r[3] })
        if id then
            linked = linked + 1
            local n = MySQL.update.await(
                'INSERT IGNORE INTO phone_app_sessions (app, citizenid, account_id) VALUES (?, ?, ?)',
                { r[1], r[2], id })
            inserted = inserted + (tonumber(n) or 0)
        end
    end
    return linked, inserted
end

---Decodes a JSON column value; accepts strings or already-decoded tables and returns {} for
---anything absent or invalid.
---@param value any
---@return table
function store.decodeJson(value)
    if value == nil then return {} end
    if type(value) == 'table' then return value end
    if type(value) == 'string' then
        local ok, decoded = pcall(json.decode, value)
        if ok and type(decoded) == 'table' then return decoded end
    end
    return {}
end

---Encodes a table for a JSON column; empty or absent tables map to nil.
---@param tbl table|nil
---@return string|nil
function store.encodeJson(tbl)
    if not tbl or next(tbl) == nil then return nil end
    return json.encode(tbl)
end

return store
