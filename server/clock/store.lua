---@type table Store module; the table returned at end of file.
local store = {}

---@type integer How many recent timer durations recentsFor returns (newest first).
local RECENTS_LIMIT = 8

---True if a column already exists.
---@param tbl string table name
---@param col string column name
---@return boolean exists
local function columnExists(tbl, col)
    return MySQL.scalar.await([[
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1
    ]], { tbl, col }) ~= nil
end

---Creates the clock tables if they don't exist and back-fills later alarm columns. `phone_alarms`
---is keyed (citizenid, id); `phone_timer_recents` holds one row per distinct duration. Runs once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_alarms` (
            `citizenid` VARCHAR(60)      NOT NULL,
            `id`        VARCHAR(40)      NOT NULL,
            `hour`      TINYINT UNSIGNED NOT NULL,
            `minute`    TINYINT UNSIGNED NOT NULL,
            `label`       VARCHAR(60)    NOT NULL DEFAULT '',
            `days`        VARCHAR(40)    NOT NULL DEFAULT '',
            `enabled`     TINYINT(1)     NOT NULL DEFAULT 1,
            `sound`       TINYINT(1)     NOT NULL DEFAULT 1,
            `snooze`      TINYINT(1)     NOT NULL DEFAULT 0,
            `snooze_secs` INT            NOT NULL DEFAULT 60,
            PRIMARY KEY (`citizenid`, `id`),
            KEY `bytime` (`citizenid`, `hour`, `minute`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_timer_recents` (
            `citizenid` VARCHAR(60)  NOT NULL,
            `seconds`   INT UNSIGNED NOT NULL,
            `used_at`   BIGINT       NOT NULL,
            PRIMARY KEY (`citizenid`, `seconds`),
            KEY `recency` (`citizenid`, `used_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])

    for _, c in ipairs({
        { 'sound',       'TINYINT(1) NOT NULL DEFAULT 1' },
        { 'snooze',      'TINYINT(1) NOT NULL DEFAULT 0' },
        { 'snooze_secs', 'INT NOT NULL DEFAULT 60' },
    }) do
        if not columnExists('phone_alarms', c[1]) then
            MySQL.query.await(('ALTER TABLE `phone_alarms` ADD COLUMN `%s` %s'):format(c[1], c[2]))
        end
    end
end

---A character's alarms, ordered by time of day. Read-only; the caller normalises the TINYINT
---flags.
---@param cid string framework per-character id
---@return table rows
function store.alarmsFor(cid)
    return MySQL.query.await([[
        SELECT id, `hour`, `minute`, label, days, enabled, sound, snooze, snooze_secs
        FROM `phone_alarms` WHERE citizenid = ? ORDER BY `hour`, `minute`
    ]], { cid }) or {}
end

---Inserts or updates one alarm, matched on the client-owned id; the (citizenid, id) primary key
---scopes the upsert to the caller's own rows.
---@param cid string framework per-character id
---@param a table validated alarm { id, hour, minute, label, days, enabled, sound, snooze, snoozeSecs }
function store.upsertAlarm(cid, a)
    MySQL.query.await([[
        INSERT INTO `phone_alarms` (citizenid, id, `hour`, `minute`, label, days, enabled, sound, snooze, snooze_secs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            `hour`      = VALUES(`hour`),
            `minute`    = VALUES(`minute`),
            label       = VALUES(label),
            days        = VALUES(days),
            enabled     = VALUES(enabled),
            sound       = VALUES(sound),
            snooze      = VALUES(snooze),
            snooze_secs = VALUES(snooze_secs)
    ]], { cid, a.id, a.hour, a.minute, a.label, a.days, a.enabled and 1 or 0, a.sound and 1 or 0, a.snooze and 1 or 0, a.snoozeSecs or 60 })
end

---Delete one alarm, scoped to the owner by the (citizenid, id) key.
---@param cid string framework per-character id
---@param id string client-generated alarm id
function store.deleteAlarm(cid, id)
    MySQL.query.await('DELETE FROM `phone_alarms` WHERE citizenid = ? AND id = ?', { cid, id })
end

---Whether the caller already owns an alarm with this id.
---@param cid string framework per-character id
---@param id string client-generated alarm id
---@return boolean exists
function store.alarmExists(cid, id)
    return MySQL.scalar.await('SELECT 1 FROM `phone_alarms` WHERE citizenid = ? AND id = ? LIMIT 1', { cid, id }) ~= nil
end

---How many alarms a character has.
---@param cid string framework per-character id
---@return integer n
function store.countAlarms(cid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `phone_alarms` WHERE citizenid = ?', { cid }) or 0
end

---The character's most-recently-used timer durations (seconds), newest first.
---@param cid string framework per-character id
---@return table seconds integer[]
function store.recentsFor(cid)
    local rows = MySQL.query.await([[
        SELECT seconds FROM `phone_timer_recents`
        WHERE citizenid = ? ORDER BY used_at DESC LIMIT ]] .. RECENTS_LIMIT, { cid }) or {}
    local out = {}
    for i = 1, #rows do out[i] = rows[i].seconds end
    return out
end

---Records a started duration, bumping its recency when already seen (upsert on (citizenid, seconds)).
---@param cid string framework per-character id
---@param seconds integer validated duration
---@param usedAt integer unix seconds
function store.addRecent(cid, seconds, usedAt)
    MySQL.query.await([[
        INSERT INTO `phone_timer_recents` (citizenid, seconds, used_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE used_at = VALUES(used_at)
    ]], { cid, seconds, usedAt })
end

return store
