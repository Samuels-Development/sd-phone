---@type table Ledger module; the table returned at end of file. Remembers every media URL this
---server has ever hosted, for every app, so a presigned-upload claim can be told apart from a URL
---that already belongs to something else.
---
---It exists because of a real bug. The claim's uniqueness check originally asked phone_photos,
---which is one of more than forty tables holding URLs in the same bucket. A bodycam recording -
---same bucket, video/webm, absent from phone_photos - passed every other check and could be
---claimed into any player's gallery as a trusted row, laundering it out of the MDT's access
---control. Asking "does Photos know this URL" was never the question; "have we ever hosted it"
---is.
local ledger = {}

---@type string Table holding the known URLs.
local TABLE <const> = 'phone_media_urls'

---@type string Marker row proving the one-time backfill finished. A row rather than the table's
---existence, so a backfill that dies part way through is retried on the next boot instead of
---being mistaken for a complete one.
local MARKER <const> = 'sdphone-ledger-backfill-complete'

---@type string The CDN every direct upload lands in. Shared with server.photos.presign, which
---pins claims to this host, so the two can never drift apart.
ledger.HOST = 'https://r2.fivemanage.com/'

---@type boolean Whether the backfill has finished and `has` can be trusted.
local backfilled = false

---Whether the ledger knows enough to answer. False while the first backfill is still running: a
---claim checked against a half-filled ledger would accept URLs it is meant to refuse, so the
---direct-upload path stays shut until this turns true rather than running on a partial answer.
---@return boolean
function ledger.ready()
    return backfilled
end

---Whether this server has hosted this URL before, for any app.
---@param url any
---@return boolean
function ledger.has(url)
    if type(url) ~= 'string' or url == '' then return false end
    return MySQL.scalar.await(('SELECT 1 FROM `%s` WHERE url = ? LIMIT 1'):format(TABLE), { url }) ~= nil
end

---Records a URL as hosted. Idempotent, and never fatal: losing a write here costs a later claim
---its rejection, which is worth a console line but not a failed upload.
---@param url any
function ledger.record(url)
    if type(url) ~= 'string' or url == '' or #url > 512 then return end
    local ok, err = pcall(MySQL.insert.await,
        ('INSERT IGNORE INTO `%s` (url) VALUES (?)'):format(TABLE), { url })
    if not ok then
        print(('^3[sd-phone:media]^0 could not record %s in the URL ledger: %s'):format(url, tostring(err)))
    end
end

---Learns every bucket URL already sitting in the database.
---
---The column list is read from information_schema rather than written out here, and that is the
---whole point: the bug this module fixes was a hardcoded list of one table. Every VARCHAR wide
---enough to hold a URL is scanned, so a table added next year is covered without anyone
---remembering to come back here. Columns that hold no URLs simply match nothing.
---
---Text and JSON columns are deliberately not scanned. Media inside them - a social post's images,
---a message's attachments - was shared out of a player's own gallery and is therefore already in
---phone_photos, which the claim checks separately.
local function backfill()
    local cols = MySQL.query.await([[
        SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND TABLE_NAME LIKE 'phone\_%'
          AND TABLE_NAME <> ?
          AND DATA_TYPE = 'varchar'
          AND CHARACTER_MAXIMUM_LENGTH >= 64
    ]], { TABLE }) or {}

    local scanned = 0
    for i = 1, #cols do
        -- The identifiers come from information_schema, so they are real names rather than
        -- anything a caller supplied; the pattern stays a parameter so its colon never reaches
        -- the SQL text, where oxmysql would read it as a named placeholder.
        local ok = pcall(MySQL.query.await,
            ('INSERT IGNORE INTO `%s` (url) SELECT DISTINCT `%s` FROM `%s` WHERE `%s` LIKE ?')
                :format(TABLE, cols[i].col, cols[i].tbl, cols[i].col),
            { ledger.HOST .. '%' })
        if ok then scanned = scanned + 1 end
        -- One column at a time with a yield between, so a large install's first boot does not
        -- hold the database thread for the whole scan.
        Wait(0)
    end

    MySQL.insert.await(('INSERT IGNORE INTO `%s` (url) VALUES (?)'):format(TABLE), { MARKER })
    local n = MySQL.scalar.await(('SELECT COUNT(*) FROM `%s`'):format(TABLE)) or 0
    print(('^2[sd-phone:media]^0 URL ledger ready: %d known media URLs from %d columns.')
        :format(math.max(0, n - 1), scanned))
end

---Creates the table and, on the first boot that has one, learns what already exists. The backfill
---runs in its own thread because it scans every candidate column on the install; `ready()` stays
---false until it lands.
function ledger.ensureSchema()
    MySQL.query.await(([[
        CREATE TABLE IF NOT EXISTS %s (
            url        VARCHAR(512) NOT NULL,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (url(191))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]]):format(TABLE))

    if MySQL.scalar.await(('SELECT 1 FROM `%s` WHERE url = ? LIMIT 1'):format(TABLE), { MARKER }) then
        backfilled = true
        return
    end

    CreateThread(function()
        local ok, err = pcall(backfill)
        if not ok then
            print(('^1[sd-phone:media]^0 URL ledger backfill failed, direct uploads stay off: %s'):format(tostring(err)))
            return
        end
        backfilled = true
    end)
end

return ledger
