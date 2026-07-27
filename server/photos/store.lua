---@type table Store module; the table returned at end of file.
local store = {}

---@type table Shared server helpers (server.util): legacy-table rescue.
local util = require 'server.util'

---@type string Alphabet for generated row ids (base-36, lowercase).
local ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'
---@type integer Generated id length.
local ID_LEN   = 12

---Generates a 12-character base-36 id for a photo or album row; not cryptographic.
---@return string id
function store.newId()
    local out = {}
    for i = 1, ID_LEN do
        local n = math.random(1, #ID_CHARS)
        out[i] = ID_CHARS:sub(n, n)
    end
    return table.concat(out)
end

---Creates the Photos tables if they don't exist and back-fills newer columns: phone_photos,
---phone_photo_albums, and the phone_photo_album_items join table.
function store.ensureSchema()
    util.rescueLegacyTable('phone_photos', 'citizenid')
    util.rescueLegacyTable('phone_photo_albums', 'citizenid')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_photos (
            id         VARCHAR(16)  NOT NULL,
            citizenid  VARCHAR(64)  NOT NULL,
            url        VARCHAR(512) NOT NULL,
            favorite   TINYINT(1)   NOT NULL DEFAULT 0,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_phone_photos_owner (citizenid, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    local hasFav = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'phone_photos'
          AND COLUMN_NAME = 'favorite'
    ]])
    if (hasFav or 0) == 0 then
        MySQL.query.await('ALTER TABLE phone_photos ADD COLUMN favorite TINYINT(1) NOT NULL DEFAULT 0')
    end

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_photo_albums (
            id         VARCHAR(16) NOT NULL,
            citizenid  VARCHAR(64) NOT NULL,
            name       VARCHAR(64) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_phone_albums_owner (citizenid, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_photo_album_items (
            album_id VARCHAR(16) NOT NULL,
            photo_id VARCHAR(16) NOT NULL,
            added_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (album_id, photo_id),
            INDEX idx_album_items_photo (photo_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Referential integrity, added on boot so existing installs migrate with no manual SQL.
    -- Each is a no-op once present; orphaned children are cleared first (they point at a
    -- parent that is already gone) and a type or collation mismatch is skipped, never fatal.
    util.ensureForeignKey('phone_photo_album_items', 'album_id', 'phone_photo_albums', 'id', 'fk_photo_album_items_album')
    util.ensureForeignKey('phone_photo_album_items', 'photo_id', 'phone_photos', 'id', 'fk_photo_album_items_photo')
end

---Persists a freshly-uploaded photo against its owner.
---@param id string generated row id
---@param citizenid string owner's framework per-character id
---@param url string hosted media URL
---@return boolean inserted
function store.insertPhoto(id, citizenid, url)
    local affected = MySQL.insert.await(
        'INSERT INTO phone_photos (id, citizenid, url) VALUES (?, ?, ?)',
        { id, citizenid, url }
    )
    return affected ~= nil
end

---Whether the player already has a photo with this exact URL (idempotent saves). Read-only.
---@param citizenid string owner's framework per-character id
---@param url string hosted media URL
---@return boolean
function store.hasUrl(citizenid, url)
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_photos WHERE citizenid = ? AND url = ? LIMIT 1', { citizenid, url }) ~= nil
end

---@type string Video-URL test, mirroring isVideoUrl() in web/src/core/photosApi.ts.
local VIDEO_RE <const> = '\\.(mp4|webm|mov|m4v|ogg)([?#]|$)'

---Splits an opaque "ts:id" cursor. nil/'' means the first page.
---@param cursor string|nil
---@return integer|nil ts, string|nil id
local function splitCursor(cursor)
    if type(cursor) ~= 'string' or cursor == '' then return nil, nil end
    local ts, id = cursor:match('^(%d+):(.+)$')
    return tonumber(ts), id
end

---One page of a player's photos, newest first. Returns up to `limit + 1` rows so the caller can
---tell whether a further page exists without a second COUNT. Read-only.
---@param citizenid string owner's framework per-character id
---@param cursor string|nil opaque "ts:id" cursor from the previous page
---@param limit integer page size
---@param filter 'favorites'|'videos'|nil smart-album narrowing
---@return { id: string, url: string, favorite: any, created_at: number, ts: integer }[] rows
function store.listForCitizen(citizenid, cursor, limit, filter)
    local ts, id = splitCursor(cursor)
    local where, params = { 'citizenid = ?' }, { citizenid }

    if filter == 'favorites' then
        where[#where + 1] = 'favorite = 1'
    elseif filter == 'videos' then
        where[#where + 1] = 'url REGEXP ?'
        params[#params + 1] = VIDEO_RE
    end

    if ts then
        -- created_at stays bare on the left of the comparison so idx_phone_photos_owner
        -- (citizenid, created_at) can still range-scan; wrapping it in UNIX_TIMESTAMP() here
        -- would force a full scan of the player's rows on every page.
        where[#where + 1] = '(created_at < FROM_UNIXTIME(?) OR (created_at = FROM_UNIXTIME(?) AND id < ?))'
        params[#params + 1] = ts
        params[#params + 1] = ts
        params[#params + 1] = id
    end
    params[#params + 1] = limit + 1

    return MySQL.query.await(([[
        SELECT id, url, favorite, created_at, UNIX_TIMESTAMP(created_at) AS ts
        FROM phone_photos
        WHERE %s
        ORDER BY created_at DESC, id DESC
        LIMIT ?
    ]]):format(table.concat(where, ' AND ')), params) or {}
end

---Totals behind the Recents / Favourites / Videos tiles, which a single page cannot report.
---@param citizenid string owner's framework per-character id
---@return { total: integer, favorites: integer, videos: integer }
function store.countsFor(citizenid)
    local row = MySQL.single.await([[
        SELECT COUNT(*) AS total,
               SUM(favorite = 1) AS favorites,
               SUM(url REGEXP ?) AS videos
        FROM phone_photos
        WHERE citizenid = ?
    ]], { VIDEO_RE, citizenid })
    return {
        total     = math.floor(tonumber(row and row.total) or 0),
        favorites = math.floor(tonumber(row and row.favorites) or 0),
        videos    = math.floor(tonumber(row and row.videos) or 0),
    }
end

---Sets the favourite flag on a photo the caller owns; a foreign photo id matches zero rows and
---reports false, and a same-value replay still reports true.
---@param photoId string photo row id
---@param citizenid string caller's framework per-character id
---@param value boolean desired favourite state
---@return boolean updated
function store.setFavorite(photoId, citizenid, value)
    local affected = MySQL.update.await(
        'UPDATE phone_photos SET favorite = ? WHERE id = ? AND citizenid = ?',
        { value and 1 or 0, photoId, citizenid }
    )
    return (affected or 0) > 0
end

---Hard-deletes a photo the caller owns, returning its url and clearing its album-membership
---rows after a confirmed delete.
---@param photoId string photo row id
---@param citizenid string caller's framework per-character id
---@return string|nil url of the deleted photo, nil when nothing matched
function store.deletePhoto(photoId, citizenid)
    local url = MySQL.scalar.await(
        'SELECT url FROM phone_photos WHERE id = ? AND citizenid = ?',
        { photoId, citizenid }
    )
    if not url then return nil end
    local affected = MySQL.update.await(
        'DELETE FROM phone_photos WHERE id = ? AND citizenid = ?',
        { photoId, citizenid }
    )
    if (affected or 0) > 0 then
        MySQL.update.await('DELETE FROM phone_photo_album_items WHERE photo_id = ?', { photoId })
        return url
    end
    return nil
end

---Trims the oldest photos for one player down to `maxRetained`, deleting their
---album-membership rows with them; no-op at or under the cap.
---@param citizenid string owner's framework per-character id
---@param maxRetained number cap on retained photo rows
function store.pruneOldest(citizenid, maxRetained)
    if not maxRetained or maxRetained <= 0 then return end
    local row = MySQL.single.await(
        'SELECT COUNT(*) AS n FROM phone_photos WHERE citizenid = ?',
        { citizenid }
    )
    local count = row and tonumber(row.n) or 0
    if count <= maxRetained then return end

    local rows = MySQL.query.await([[
        SELECT id FROM phone_photos
        WHERE citizenid = ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?
    ]], { citizenid, count - maxRetained }) or {}
    if #rows == 0 then return end

    local ids, marks = {}, {}
    for i = 1, #rows do
        ids[i]   = rows[i].id
        marks[i] = '?'
    end
    local inList = table.concat(marks, ',')
    MySQL.update.await(('DELETE FROM phone_photo_album_items WHERE photo_id IN (%s)'):format(inList), ids)
    MySQL.update.await(('DELETE FROM phone_photos WHERE id IN (%s)'):format(inList), ids)
end

---Creates a custom album for the player.
---@param id string generated row id
---@param citizenid string owner's framework per-character id
---@param name string trimmed album name
---@return boolean inserted
function store.createAlbum(id, citizenid, name)
    local affected = MySQL.insert.await(
        'INSERT INTO phone_photo_albums (id, citizenid, name) VALUES (?, ?, ?)',
        { id, citizenid, name }
    )
    return affected ~= nil
end

---Returns how many albums a player owns. Read-only.
---@param citizenid string owner's framework per-character id
---@return number count
function store.countAlbums(citizenid)
    return MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_photo_albums WHERE citizenid = ?',
        { citizenid }
    ) or 0
end

---Deletes a custom album and its membership rows, but only if the caller owns it; the photos
---themselves are never touched.
---@param albumId string album row id
---@param citizenid string caller's framework per-character id
---@return boolean deleted
function store.deleteAlbum(albumId, citizenid)
    local owns = MySQL.scalar.await(
        'SELECT 1 FROM phone_photo_albums WHERE id = ? AND citizenid = ?',
        { albumId, citizenid }
    )
    if not owns then return false end
    MySQL.update.await('DELETE FROM phone_photo_album_items WHERE album_id = ?', { albumId })
    MySQL.update.await('DELETE FROM phone_photo_albums WHERE id = ?', { albumId })
    return true
end

---Returns one player's custom albums, newest first, each annotated with a photo count and a
---cover URL (the newest photo in the album). Read-only.
---@param citizenid string owner's framework per-character id
---@return { id: string, name: string, count: number, cover: string|nil, created_at: number }[] rows
function store.listAlbums(citizenid)
    return MySQL.query.await([[
        SELECT
            a.id,
            a.name,
            a.created_at,
            (SELECT COUNT(*) FROM phone_photo_album_items i WHERE i.album_id = a.id) AS count,
            (SELECT p.url
               FROM phone_photo_album_items i
               JOIN phone_photos p ON p.id = i.photo_id
              WHERE i.album_id = a.id
              ORDER BY p.created_at DESC
              LIMIT 1) AS cover
        FROM phone_photo_albums a
        WHERE a.citizenid = ?
        ORDER BY a.created_at DESC
    ]], { citizenid }) or {}
end

---Adds photos to an album: album ownership is verified up front, only photos the caller owns
---are inserted, and duplicate memberships are silently ignored (INSERT IGNORE).
---@param albumId string album row id
---@param citizenid string caller's framework per-character id
---@param photoIds string[] photo ids to add (caller caps and type-checks the list)
---@return boolean albumOwned
function store.addPhotosToAlbum(albumId, citizenid, photoIds)
    local owns = MySQL.scalar.await(
        'SELECT 1 FROM phone_photo_albums WHERE id = ? AND citizenid = ?',
        { albumId, citizenid }
    )
    if not owns then return false end
    for i = 1, #photoIds do
        MySQL.insert.await([[
            INSERT IGNORE INTO phone_photo_album_items (album_id, photo_id)
            SELECT ?, ?
            WHERE EXISTS (SELECT 1 FROM phone_photos WHERE id = ? AND citizenid = ?)
        ]], { albumId, photoIds[i], photoIds[i], citizenid })
    end
    return true
end

---Removes a single photo from an album once the caller is confirmed as the album's owner.
---@param albumId string album row id
---@param photoId string photo row id
---@param citizenid string caller's framework per-character id
---@return boolean removed
function store.removePhotoFromAlbum(albumId, photoId, citizenid)
    local owns = MySQL.scalar.await(
        'SELECT 1 FROM phone_photo_albums WHERE id = ? AND citizenid = ?',
        { albumId, citizenid }
    )
    if not owns then return false end
    local affected = MySQL.update.await(
        'DELETE FROM phone_photo_album_items WHERE album_id = ? AND photo_id = ?',
        { albumId, photoId }
    )
    return (affected or 0) > 0
end

---Returns the photos in one album, newest first; a foreign citizenid reads as an empty album.
---Read-only.
---@param albumId string album row id
---@param citizenid string caller's framework per-character id
---@return { id: string, url: string, favorite: any, created_at: number }[] rows
function store.listAlbumPhotos(albumId, citizenid)
    return MySQL.query.await([[
        SELECT p.id, p.url, p.favorite, p.created_at
        FROM phone_photo_album_items i
        JOIN phone_photos p       ON p.id = i.photo_id
        JOIN phone_photo_albums a ON a.id = i.album_id
        WHERE i.album_id = ? AND a.citizenid = ?
        ORDER BY p.created_at DESC, p.id DESC
    ]], { albumId, citizenid }) or {}
end

return store
