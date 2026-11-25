---@type table Store module; the table returned at end of file. One row per note, scoped to a
---citizenid (PK citizenid+id); every statement filters by citizenid. Sketches and images are
---stored inline as JSON arrays, timestamps as the client's ISO strings. `sketch_count` and
---`sketch_bytes` describe the sketches column so a list and the storage caps never read it.
local store = {}

---@type table Shared server helpers (server.util): legacy-table rescue.
local util = require 'server.util'
---@type table Column back-fills (server.migrations): the sketch metadata columns.
local migrations = require 'server.migrations'
---@type table Sketch checks (server.notes.sketches): counting a stored column without decoding it.
local sketchCheck = require 'server.notes.sketches'

---Creates the phone_notes table if it doesn't exist, and back-fills the `images` column. Runs
---once at boot. lb-phone uses the same table name with a different shape; such a table is moved
---aside first so the CREATE below builds the real sd-phone one.
function store.ensureSchema()
    util.rescueLegacyTable('phone_notes', 'citizenid')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_notes` (
            `citizenid`  VARCHAR(60) NOT NULL,
            `id`         VARCHAR(40) NOT NULL,
            `body`       MEDIUMTEXT  NOT NULL,
            `sketches`   MEDIUMTEXT  NOT NULL,
            `images`     MEDIUMTEXT  NULL,
            `sketch_count` SMALLINT UNSIGNED NULL,
            `sketch_bytes` INT UNSIGNED NULL,
            `created_at` VARCHAR(40) NOT NULL,
            `updated_at` VARCHAR(40) NOT NULL,
            PRIMARY KEY (`citizenid`, `id`),
            KEY `updated` (`citizenid`, `updated_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    util.ensureColumns('phone_notes', {
        body       = '`body` MEDIUMTEXT NULL',
        sketches   = '`sketches` MEDIUMTEXT NULL',
        images     = '`images` MEDIUMTEXT NULL',
        created_at = "`created_at` VARCHAR(40) NOT NULL DEFAULT ''",
        updated_at = "`updated_at` VARCHAR(40) NOT NULL DEFAULT ''",
    })

    local hasImages = MySQL.scalar.await([[
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'phone_notes' AND COLUMN_NAME = 'images' LIMIT 1
    ]])
    if not hasImages then
        MySQL.query.await('ALTER TABLE `phone_notes` ADD COLUMN `images` MEDIUMTEXT NULL AFTER `sketches`')
    end

    migrations.apply('phone_notes')
end

---@type integer Ceiling on one read of a player's notes. Each row carries a body plus sketch and
---image JSON, so an uncapped read is heavy per row as well as unbounded in count.
local NOTES_CAP <const> = 300

---A player's notes, newest-edited first, capped, every column included. Read-only. Heavy: each
---row carries its sketches. The phone's list reads store.summaries instead.
---@param cid string owner citizenid
---@return table[] rows note rows, empty when none
function store.forPlayer(cid)
    return MySQL.query.await(([[
        SELECT id, body, sketches, images, created_at, updated_at
        FROM `phone_notes` WHERE citizenid = ? ORDER BY updated_at DESC
        LIMIT %d
    ]]):format(NOTES_CAP), { cid }) or {}
end

---Fills in the sketch metadata of a player's rows written before it existed (or by a writer that
---skips it, like the lb-phone import). Reads those rows' sketches once; afterwards every write
---keeps the metadata current.
---@param cid string owner citizenid
---@return table<string, integer> counts sketch count per note id it filled in
function store.fillSketchMeta(cid)
    local rows = MySQL.query.await([[
        SELECT id, sketches FROM `phone_notes`
        WHERE citizenid = ? AND (sketch_count IS NULL OR sketch_bytes IS NULL)
    ]], { cid }) or {}
    local filled = {}
    for i = 1, #rows do
        local raw = rows[i].sketches or '[]'
        local count = sketchCheck.countStored(raw)
        MySQL.update.await('UPDATE `phone_notes` SET sketch_count = ?, sketch_bytes = ? WHERE citizenid = ? AND id = ?',
            { count, #raw, cid, rows[i].id })
        filled[rows[i].id] = count
    end
    return filled
end

---A player's notes for the list, newest-edited first, capped: the text, the image URLs and the
---sketch count, never the sketches themselves. Read-only, apart from filling in missing sketch
---metadata the first time a legacy row is listed.
---@param cid string owner citizenid
---@return table[] rows { id, body, images, sketch_count, created_at, updated_at }
function store.summaries(cid)
    local rows = MySQL.query.await(([[
        SELECT id, body, images, sketch_count, created_at, updated_at
        FROM `phone_notes` WHERE citizenid = ? ORDER BY updated_at DESC
        LIMIT %d
    ]]):format(NOTES_CAP), { cid }) or {}
    local filled
    for i = 1, #rows do
        if rows[i].sketch_count == nil then
            filled = filled or store.fillSketchMeta(cid)
            rows[i].sketch_count = filled[rows[i].id] or 0
        end
    end
    return rows
end

---One of a player's notes with everything on it. Read-only.
---@param cid string owner citizenid
---@param id string note id
---@return table|nil row nil when the player has no such note
function store.get(cid, id)
    return MySQL.single.await([[
        SELECT id, body, sketches, images, created_at, updated_at
        FROM `phone_notes` WHERE citizenid = ? AND id = ?
    ]], { cid, id })
end

---What a save needs to know about a note before writing it: whether it exists, the images already
---on it and how much sketch data it holds. Read-only.
---@param cid string owner citizenid
---@param id string note id
---@return table|nil row { images, sketch_bytes } nil when the player has no such note
function store.meta(cid, id)
    return MySQL.single.await(
        'SELECT images, sketch_bytes FROM `phone_notes` WHERE citizenid = ? AND id = ?', { cid, id })
end

---Sketch data a player keeps across their notes, leaving one note out (the one being replaced).
---Legacy rows are measured first, so the total is never short. Read-only apart from that fill.
---@param cid string owner citizenid
---@param exceptId string|nil note id to leave out
---@return integer bytes
function store.sketchBytesFor(cid, exceptId)
    store.fillSketchMeta(cid)
    return tonumber(MySQL.scalar.await(
        'SELECT COALESCE(SUM(sketch_bytes), 0) FROM `phone_notes` WHERE citizenid = ? AND id <> ?',
        { cid, exceptId or '' })) or 0
end

---Inserts or updates a note, sketches included. `created_at` is only set on first insert, and the
---sketch metadata is written alongside the sketches it describes.
---@param cid string owner citizenid
---@param id string note id (client-generated, <= 40 chars)
---@param body string note text
---@param sketches string JSON array of sketch data URLs
---@param images string JSON array of image URLs
---@param createdAt string ISO timestamp
---@param updatedAt string ISO timestamp
---@param sketchCount integer|nil entries in `sketches`; counted from the text when omitted
function store.upsert(cid, id, body, sketches, images, createdAt, updatedAt, sketchCount)
    local count = sketchCount or sketchCheck.countStored(sketches)
    MySQL.query.await([[
        INSERT INTO `phone_notes` (citizenid, id, body, sketches, images, sketch_count, sketch_bytes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            body         = VALUES(body),
            sketches     = VALUES(sketches),
            images       = VALUES(images),
            sketch_count = VALUES(sketch_count),
            sketch_bytes = VALUES(sketch_bytes),
            updated_at   = VALUES(updated_at)
    ]], { cid, id, body, sketches, images, count, #sketches, createdAt, updatedAt })
end

---Inserts or updates a note's text and images and leaves its sketches as they are. An autosave
---while typing takes this path, so megabytes of unchanged drawings are not rewritten every pause.
---A brand-new note starts with no sketches.
---@param cid string owner citizenid
---@param id string note id (client-generated, <= 40 chars)
---@param body string note text
---@param images string JSON array of image URLs
---@param createdAt string ISO timestamp
---@param updatedAt string ISO timestamp
function store.saveText(cid, id, body, images, createdAt, updatedAt)
    MySQL.query.await([[
        INSERT INTO `phone_notes` (citizenid, id, body, sketches, images, sketch_count, sketch_bytes, created_at, updated_at)
        VALUES (?, ?, ?, '[]', ?, 0, 2, ?, ?)
        ON DUPLICATE KEY UPDATE
            body       = VALUES(body),
            images     = VALUES(images),
            updated_at = VALUES(updated_at)
    ]], { cid, id, body, images, createdAt, updatedAt })
end

---Deletes a note, scoped to its owner. Idempotent.
---@param cid string owner citizenid
---@param id string note id
function store.delete(cid, id)
    MySQL.query.await('DELETE FROM `phone_notes` WHERE citizenid = ? AND id = ?', { cid, id })
end

---Whether this player already has a note with this id (a primary-key lookup). Read-only.
---@param cid string owner citizenid
---@param id string note id
---@return boolean exists
function store.exists(cid, id)
    return MySQL.scalar.await('SELECT 1 FROM `phone_notes` WHERE citizenid = ? AND id = ? LIMIT 1', { cid, id }) ~= nil
end

---How many notes this player has (drives the per-player cap). Read-only.
---@param cid string owner citizenid
---@return integer count
function store.countFor(cid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `phone_notes` WHERE citizenid = ?', { cid }) or 0
end

---Whether the player already has a note with this exact body (idempotent saves). Read-only.
---@param cid string owner citizenid
---@param body string
---@return boolean
function store.hasBody(cid, body)
    return MySQL.scalar.await(
        'SELECT 1 FROM `phone_notes` WHERE citizenid = ? AND body = ? LIMIT 1', { cid, body }) ~= nil
end

---A player's notes whose text contains `q`, newest-edited first. Read-only.
---@param cid string
---@param q string
---@param limit integer
---@return { id: string, body: string }[]
function store.search(cid, q, limit)
    local like = '%' .. util.escapeLike(q) .. '%'
    return MySQL.query.await(([[
        SELECT id, body FROM `phone_notes`
        WHERE citizenid = ? AND body LIKE ? ESCAPE '\\'
        ORDER BY updated_at DESC
        LIMIT %d
    ]]):format(limit), { cid, like }) or {}
end

return store
