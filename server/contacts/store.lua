---@type table Store module; the table returned at end of file.
local store = {}


local util = require 'server.util'
local function newId() return util.newId(7) end

store.newId = newId

---Creates the contacts, call-log, and blocked-numbers tables idempotently, back-filling the
---`avatar` and `seen` columns on older installs. Run once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_contacts (
            id          VARCHAR(16)  NOT NULL,
            citizenid   VARCHAR(64)  NOT NULL,
            name        VARCHAR(64)  NOT NULL,
            phone       VARCHAR(32)  NOT NULL,
            email       VARCHAR(128) NULL,
            address     VARCHAR(128) NULL,
            color       VARCHAR(16)  NOT NULL,
            avatar      VARCHAR(512) NULL,
            favorite    TINYINT(1)   NOT NULL DEFAULT 0,
            created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_phone_contacts_cid (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    local col = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_contacts' AND column_name = 'avatar'
    ]])
    if not col or tonumber(col.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_contacts ADD COLUMN avatar VARCHAR(512) NULL AFTER color')
    end

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_calls (
            id          VARCHAR(16)  NOT NULL,
            citizenid   VARCHAR(64)  NOT NULL,
            `number`    VARCHAR(32)  NOT NULL,
            name        VARCHAR(64)  NULL,
            direction   VARCHAR(16)  NOT NULL,
            duration    INT          NOT NULL DEFAULT 0,
            seen        TINYINT(1)   NOT NULL DEFAULT 0,
            called_at   BIGINT       NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_phone_calls_cid (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    local citizenidCol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_calls' AND column_name = 'citizenid'
    ]])
    if not citizenidCol or tonumber(citizenidCol.n) == 0 then
        MySQL.query.await("ALTER TABLE phone_calls ADD COLUMN citizenid VARCHAR(64) NOT NULL DEFAULT ''")
    end

    local numberCol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_calls' AND column_name = 'number'
    ]])
    if not numberCol or tonumber(numberCol.n) == 0 then
        MySQL.query.await("ALTER TABLE phone_calls ADD COLUMN `number` VARCHAR(32) NOT NULL DEFAULT ''")
    end

    local nameCol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_calls' AND column_name = 'name'
    ]])
    if not nameCol or tonumber(nameCol.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_calls ADD COLUMN name VARCHAR(64) NULL')
    end

    local calledAtCol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_calls' AND column_name = 'called_at'
    ]])
    if not calledAtCol or tonumber(calledAtCol.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_calls ADD COLUMN called_at BIGINT NOT NULL DEFAULT 0')
    end

    local directionCol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_calls' AND column_name = 'direction'
    ]])
    if not directionCol or tonumber(directionCol.n) == 0 then
        MySQL.query.await("ALTER TABLE phone_calls ADD COLUMN direction VARCHAR(16) NOT NULL DEFAULT ''")
    end

    local durationCol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_calls' AND column_name = 'duration'
    ]])
    if not durationCol or tonumber(durationCol.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_calls ADD COLUMN duration INT NOT NULL DEFAULT 0')
    end

    local seenCol = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_calls' AND column_name = 'seen'
    ]])
    if not seenCol or tonumber(seenCol.n) == 0 then
        MySQL.query.await('ALTER TABLE phone_calls ADD COLUMN seen TINYINT(1) NOT NULL DEFAULT 1')
        MySQL.query.await('ALTER TABLE phone_calls ALTER COLUMN seen SET DEFAULT 0')
    end

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_blocked (
            citizenid  VARCHAR(64) NOT NULL,
            number     VARCHAR(32) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Normalise any value to its bare digits ('' when nil or digit-free), matching how blocked
---numbers are stored.
---@param s any
---@return string
local function digitsOf(s) return (tostring(s or ''):gsub('%D', '')) end

---True if `number` is on the owner's block list. Garbage input (no citizenid, no digits) is
---never blocked rather than an error.
---@param citizenid string
---@param number string
---@return boolean
function store.isBlocked(citizenid, number)
    if not citizenid or citizenid == '' then return false end
    local d = digitsOf(number)
    if d == '' then return false end
    local row = MySQL.single.await(
        'SELECT 1 AS hit FROM phone_blocked WHERE citizenid = ? AND number = ? LIMIT 1',
        { citizenid, d }
    )
    return row ~= nil
end

---Adds a number to the owner's block list. Idempotent (upsert); a silent no-op on garbage
---input.
---@param citizenid string
---@param number string
function store.blockNumber(citizenid, number)
    local d = digitsOf(number)
    if not citizenid or citizenid == '' or d == '' or #d > 32 then return end
    MySQL.update.await([[
        INSERT INTO phone_blocked (citizenid, number) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE number = VALUES(number)
    ]], { citizenid, d })
end

---Remove a number from the owner's block list. Idempotent; a silent no-op on garbage input.
---@param citizenid string
---@param number string
function store.unblockNumber(citizenid, number)
    local d = digitsOf(number)
    if not citizenid or citizenid == '' or d == '' then return end
    MySQL.update.await('DELETE FROM phone_blocked WHERE citizenid = ? AND number = ?', { citizenid, d })
end

---List every contact owned by a player, alphabetised server-side. Read-only.
---@param citizenid string
---@return table[]
function store.listContacts(citizenid)
    return MySQL.query.await([[
        SELECT id, name, phone, email, address, color, avatar, favorite
        FROM phone_contacts
        WHERE citizenid = ?
        ORDER BY name ASC
    ]], { citizenid }) or {}
end

---Reads one contact, scoped to its owner; nil if missing or not theirs. Read-only.
---@param id string
---@param citizenid string
---@return table|nil
function store.getContact(id, citizenid)
    if not id or id == '' then return nil end
    return MySQL.single.await([[
        SELECT id, name, phone, email, address, color, avatar, favorite
        FROM phone_contacts
        WHERE id = ? AND citizenid = ?
    ]], { id, citizenid })
end

---Counts a player's contacts. Read-only.
---@param citizenid string
---@return number
function store.countContacts(citizenid)
    local row = MySQL.single.await(
        'SELECT COUNT(*) AS n FROM phone_contacts WHERE citizenid = ?',
        { citizenid }
    )
    return row and tonumber(row.n) or 0
end

---Inserts a new contact row.
---@param id string
---@param citizenid string
---@param c { name: string, phone: string, email: string|nil, address: string|nil, color: string, avatar: string|nil }
---@return boolean
function store.insertContact(id, citizenid, c)
    local affected = MySQL.insert.await([[
        INSERT INTO phone_contacts (id, citizenid, name, phone, email, address, color, avatar)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ]], { id, citizenid, c.name, c.phone, c.email, c.address, c.color, c.avatar })
    return affected ~= nil
end

---Updates an existing contact's editable fields. The citizenid in the WHERE clause is the
---ownership boundary.
---@param id string
---@param citizenid string
---@param c { name: string, phone: string, email: string|nil, address: string|nil, avatar: string|nil }
---@return boolean
function store.updateContact(id, citizenid, c)
    local affected = MySQL.update.await([[
        UPDATE phone_contacts
        SET name = ?, phone = ?, email = ?, address = ?, avatar = ?
        WHERE id = ? AND citizenid = ?
    ]], { c.name, c.phone, c.email, c.address, c.avatar, id, citizenid })
    return (affected or 0) > 0
end

---Hard-delete a contact. The citizenid in the WHERE clause is the ownership boundary.
---@param id string
---@param citizenid string
---@return boolean
function store.deleteContact(id, citizenid)
    local affected = MySQL.update.await(
        'DELETE FROM phone_contacts WHERE id = ? AND citizenid = ?',
        { id, citizenid }
    )
    return (affected or 0) > 0
end

---Set a contact's favourite flag. The citizenid in the WHERE clause is the ownership boundary.
---@param id string
---@param citizenid string
---@param favorite boolean
---@return boolean
function store.setFavorite(id, citizenid, favorite)
    local affected = MySQL.update.await(
        'UPDATE phone_contacts SET favorite = ? WHERE id = ? AND citizenid = ?',
        { favorite and 1 or 0, id, citizenid }
    )
    return (affected or 0) > 0
end

---Lists a player's recent calls, newest first, capped at `limit`. The cap is a validated
---integer interpolated into the query. Read-only.
---@param citizenid string
---@param limit number
---@return table[]
function store.listCalls(citizenid, limit)
    local n = math.floor(tonumber(limit) or 50)
    if n < 1 then n = 1 end
    return MySQL.query.await(([[
        SELECT id, `number` AS number, name, direction, duration, called_at
        FROM phone_calls
        WHERE citizenid = ?
        ORDER BY called_at DESC
        LIMIT %d
    ]]):format(n), { citizenid }) or {}
end

---Inserts a call-log entry.
---@param id string
---@param citizenid string
---@param call { number: string, name: string|nil, direction: string, duration: number, calledAt: number }
---@return boolean
function store.insertCall(id, citizenid, call)
    local affected = MySQL.insert.await([[
        INSERT INTO phone_calls (id, citizenid, `number`, name, direction, duration, called_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ]], { id, citizenid, call.number, call.name, call.direction, call.duration, call.calledAt })
    return affected ~= nil
end

---Prunes a player's call log down to the newest `keep` rows. The LIMIT is a validated integer
---interpolated into the query.
---@param citizenid string
---@param keep number
function store.pruneCalls(citizenid, keep)
    local n = math.floor(tonumber(keep) or 100)
    if n < 1 then n = 1 end
    MySQL.update.await(([[
        DELETE FROM phone_calls
        WHERE citizenid = ?
          AND id NOT IN (
              SELECT id FROM (
                  SELECT id FROM phone_calls
                  WHERE citizenid = ?
                  ORDER BY called_at DESC
                  LIMIT %d
              ) AS keep_rows
          )
    ]]):format(n), { citizenid, citizenid })
end

---Delete a single call-log entry. The citizenid in the WHERE clause is the ownership boundary.
---@param id string
---@param citizenid string
---@return boolean
function store.deleteCall(id, citizenid)
    local affected = MySQL.update.await(
        'DELETE FROM phone_calls WHERE id = ? AND citizenid = ?',
        { id, citizenid }
    )
    return (affected or 0) > 0
end

---Wipe a player's entire call log. Scoped to its owner; idempotent.
---@param citizenid string
function store.clearCalls(citizenid)
    MySQL.update.await('DELETE FROM phone_calls WHERE citizenid = ?', { citizenid })
end

---Counts a player's unacknowledged missed calls. Read-only.
---@param citizenid string
---@return number
function store.unreadMissedCount(citizenid)
    local row = MySQL.single.await(
        "SELECT COUNT(*) AS n FROM phone_calls WHERE citizenid = ? AND direction = 'missed' AND seen = 0",
        { citizenid }
    )
    return row and tonumber(row.n) or 0
end

---Marks every unseen missed call as acknowledged. Scoped to its owner; idempotent.
---@param citizenid string
function store.markMissedSeen(citizenid)
    MySQL.update.await(
        "UPDATE phone_calls SET seen = 1 WHERE citizenid = ? AND direction = 'missed' AND seen = 0",
        { citizenid }
    )
end

return store
