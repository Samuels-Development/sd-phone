---@type table Shared server helpers (server.util): schema creation and back-fill.
local util = require 'server.util'

---@type table Store module; the table returned at end of file.
local store = {}

---Creates the call recordings table. One row per recording, holding only the Fivemanage-hosted
---URL and enough call context to say who the conversation was with. Runs once at boot.
function store.ensureSchema()
    util.ensureTable('phone_call_recordings', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS `phone_call_recordings` (
            `id`          INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`   VARCHAR(64)  NOT NULL,
            `peer_number` VARCHAR(32)  NOT NULL DEFAULT '',
            `peer_name`   VARCHAR(80)  NULL,
            `direction`   VARCHAR(16)  NOT NULL DEFAULT 'outgoing',
            `one_sided`   TINYINT(1)   NOT NULL DEFAULT 0,
            `url`         VARCHAR(512) NOT NULL,
            `duration`    INT          NOT NULL DEFAULT 0,
            `created_at`  BIGINT       NOT NULL,
            KEY `citizenid` (`citizenid`),
            KEY `created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
end

---Inserts one recording row (fields already sanitized by the actions layer).
---@param citizenid string owner, meaning the character who pressed record
---@param rec { peerNumber: string, peerName: string|nil, direction: string, oneSided: boolean, url: string, duration: integer, ts: integer }
---@return integer|nil insertId
function store.insert(citizenid, rec)
    return MySQL.insert.await([[
        INSERT INTO `phone_call_recordings`
            (citizenid, peer_number, peer_name, direction, one_sided, url, duration, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        citizenid, rec.peerNumber, rec.peerName, rec.direction,
        rec.oneSided and 1 or 0, rec.url, rec.duration, rec.ts,
    })
end

---A character's recordings, newest first. Read-only.
---@param citizenid string
---@param limit integer
---@return table[] rows
function store.listFor(citizenid, limit)
    return MySQL.query.await(
        'SELECT * FROM `phone_call_recordings` WHERE citizenid = ? ORDER BY created_at DESC, id DESC LIMIT ?',
        { citizenid, limit }) or {}
end

---How many recordings a character holds.
---@param citizenid string
---@return integer count
function store.countFor(citizenid)
    return tonumber(MySQL.scalar.await(
        'SELECT COUNT(*) FROM `phone_call_recordings` WHERE citizenid = ?', { citizenid })) or 0
end

---Deletes one recording, scoped to its owner so an id alone cannot reach another character's row.
---@param citizenid string
---@param id integer
---@return integer removed
function store.delete(citizenid, id)
    return tonumber(MySQL.update.await(
        'DELETE FROM `phone_call_recordings` WHERE id = ? AND citizenid = ?', { id, citizenid })) or 0
end

---Drops the oldest rows a character holds beyond `keep`, so a full list makes room for a new one.
---@param citizenid string
---@param keep integer
---@return integer removed
function store.trim(citizenid, keep)
    return tonumber(MySQL.update.await([[
        DELETE FROM `phone_call_recordings`
        WHERE citizenid = ?
          AND id NOT IN (
              SELECT id FROM (
                  SELECT id FROM `phone_call_recordings`
                  WHERE citizenid = ? ORDER BY created_at DESC, id DESC LIMIT ?
              ) AS keepers
          )
    ]], { citizenid, citizenid, keep })) or 0
end

---Drops recordings older than the keep window. A no-op when the window is 0.
---@param days integer
---@return integer removed
function store.prune(days)
    if days <= 0 then return 0 end
    return tonumber(MySQL.update.await(
        'DELETE FROM `phone_call_recordings` WHERE created_at < ?', { os.time() - days * 86400 })) or 0
end

return store
