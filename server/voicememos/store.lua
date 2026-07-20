---@type table Store module; the table returned at end of file.
local store = {}

---Creates the phone_voice_memos table if it doesn't exist. One row per recording; only the
---Fivemanage-hosted URL is stored. Runs once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_voice_memos` (
            `id`         INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`  VARCHAR(64)  NOT NULL,
            `name`       VARCHAR(120) NOT NULL,
            `url`        VARCHAR(512) NOT NULL,
            `duration`   INT          NOT NULL DEFAULT 0,
            `created_at` BIGINT       NOT NULL,
            KEY `citizenid` (`citizenid`),
            KEY `created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
end

---Inserts one memo row (name and duration already sanitized by the actions layer).
---@param citizenid string owner's framework per-character id
---@param name string display name
---@param url string Fivemanage-hosted audio URL
---@param duration integer recording length in seconds
---@param ts integer unix creation time
---@return integer insertId new memo id
function store.insert(citizenid, name, url, duration, ts)
    return MySQL.insert.await(
        'INSERT INTO `phone_voice_memos` (citizenid, name, url, duration, created_at) VALUES (?, ?, ?, ?, ?)',
        { citizenid, name, url, duration, ts })
end

---A player's most recent memos, newest first. Read-only.
---@param citizenid string owner's framework per-character id
---@param limit integer maximum rows to return (config VoiceMemos.ListLimit)
---@return table[] rows raw memo rows (empty when none)
function store.recent(citizenid, limit)
    return MySQL.query.await(
        'SELECT * FROM `phone_voice_memos` WHERE citizenid = ? ORDER BY id DESC LIMIT ?',
        { citizenid, limit }) or {}
end

---How many memos a player has stored. Read-only.
---@param citizenid string owner's framework per-character id
---@return integer count
function store.countFor(citizenid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `phone_voice_memos` WHERE citizenid = ?', { citizenid }) or 0
end

---Whether the player already has a memo with this exact URL (idempotent saves). Read-only.
---@param citizenid string owner's framework per-character id
---@param url string hosted audio URL
---@return boolean
function store.hasUrl(citizenid, url)
    return MySQL.scalar.await(
        'SELECT 1 FROM `phone_voice_memos` WHERE citizenid = ? AND url = ? LIMIT 1', { citizenid, url }) ~= nil
end

---The citizenid that owns a memo (nil when the row doesn't exist). Read-only.
---@param id integer memo id
---@return string|nil citizenid
function store.ownerOf(id)
    return MySQL.scalar.await('SELECT citizenid FROM `phone_voice_memos` WHERE id = ?', { id })
end

---One full memo row by id (nil when the row doesn't exist). Read-only.
---@param id integer memo id
---@return table|nil row
function store.getById(id)
    return MySQL.single.await('SELECT * FROM `phone_voice_memos` WHERE id = ?', { id })
end

---Renames a memo; ownership was checked by the caller.
---@param id integer memo id
---@param name string new display name (already trimmed/capped)
function store.rename(id, name)
    MySQL.query.await('UPDATE `phone_voice_memos` SET name = ? WHERE id = ?', { name, id })
end

---Deletes a memo row; ownership was checked by the caller.
---@param id integer memo id
function store.delete(id)
    MySQL.query.await('DELETE FROM `phone_voice_memos` WHERE id = ?', { id })
end

return store
