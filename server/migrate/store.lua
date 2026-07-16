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

---An lb-phone table name for `name`, prefixed. Callers pass literal suffixes only.
---@param name string suffix, e.g. 'phones'
---@return string full table name
local function lbt(name) return PREFIX .. name end

store.lbTable = lbt

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

---Blocks until every table in `names` exists, or gives up after `tries` polls. Returns false on
---timeout.
---@param names string[] table names that must all exist
---@param tries integer max polls
---@param delayMs integer wait between polls
---@return boolean ready
function store.waitForTables(names, tries, delayMs)
    for _ = 1, tries do
        local allThere = true
        for _, n in ipairs(names) do
            if not store.tableExists(n) then allThere = false break end
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
    return MySQL.query.await(([[
        SELECT id, phone_number, link, is_favourite, `timestamp` AS created_at
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
---@param prefixSql string 'INSERT IGNORE INTO ... (cols) VALUES'
---@param cols integer columns per row
---@param rows any[][] one parameter array per row
local function insertMulti(prefixSql, cols, rows)
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
        MySQL.query.await(prefixSql .. ' ' .. table.concat(groups, ','), params)
    end
end

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

return store
