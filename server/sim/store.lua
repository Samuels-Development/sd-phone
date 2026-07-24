---@type table Shared server helpers (server.util): digits/formatNumber.
local util = require 'server.util'

---@type table Store module; the table returned at end of file. Persistence for the SIM registry
---(number -> data identity) and the per-character cloud-backup pointers.
local store = {}

---Generates a random 10-digit phone number as raw digits, with the first block starting at 200
---(mirrors server.settings.store's generator).
---@return string number ten raw digits
local function genNumber()
    return ('%03d%03d%04d'):format(math.random(200, 989), math.random(100, 999), math.random(0, 9999))
end

---Creates the SIM registry and cloud-backup tables.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_sim_cards (
            number     VARCHAR(20) NOT NULL,
            identity   VARCHAR(64) NOT NULL,
            owner_cid  VARCHAR(64) NULL,
            adopted_by VARCHAR(64) NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (number),
            INDEX idx_phone_sim_identity (identity)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    local hasAdoptedBy = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_sim_cards' AND column_name = 'adopted_by'
    ]])
    if (tonumber(hasAdoptedBy) or 0) == 0 then
        MySQL.query.await('ALTER TABLE phone_sim_cards ADD COLUMN adopted_by VARCHAR(64) NULL')
    end
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cloud_backups (
            citizenid  VARCHAR(64) NOT NULL,
            identity   VARCHAR(64) NOT NULL,
            enabled    TINYINT(1)  NOT NULL DEFAULT 1,
            password   VARCHAR(64) NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    local hasPassword = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_cloud_backups' AND column_name = 'password'
    ]])
    if (tonumber(hasPassword) or 0) == 0 then
        MySQL.query.await('ALTER TABLE phone_cloud_backups ADD COLUMN password VARCHAR(64) NULL')
    end
    local hasDevice = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_cloud_backups' AND column_name = 'device_identity'
    ]])
    if (tonumber(hasDevice) or 0) == 0 then
        MySQL.query.await('ALTER TABLE phone_cloud_backups ADD COLUMN device_identity VARCHAR(64) NULL')
        MySQL.query.await('ALTER TABLE phone_cloud_backups ADD COLUMN auto_sync TINYINT(1) NOT NULL DEFAULT 1')
        MySQL.query.await('ALTER TABLE phone_cloud_backups ADD COLUMN synced_at BIGINT NULL')
    end

    -- Multi-profile backups: one row per (character, phone). The single-slot table above stays
    -- as the migration source and is otherwise unused.
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cloud_profiles (
            citizenid       VARCHAR(64) NOT NULL,
            device_identity VARCHAR(64) NOT NULL,
            identity        VARCHAR(64) NOT NULL,
            enabled         TINYINT(1)  NOT NULL DEFAULT 1,
            auto_sync       TINYINT(1)  NOT NULL DEFAULT 1,
            synced_at       BIGINT      NULL,
            color           VARCHAR(32) NULL,
            number          VARCHAR(32) NULL,
            updated_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, device_identity)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_cloud_accounts (
            citizenid  VARCHAR(64) NOT NULL,
            password   VARCHAR(64) NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    -- One-shot migration of single-slot rows (a legacy pointer row's device IS its identity).
    -- Only when the profiles table has never been populated, so deleted profiles stay deleted.
    local migrated = MySQL.scalar.await('SELECT 1 FROM phone_cloud_profiles LIMIT 1')
    if not migrated then
        pcall(function()
            MySQL.query.await([[
                INSERT IGNORE INTO phone_cloud_profiles
                    (citizenid, device_identity, identity, enabled, auto_sync, synced_at)
                SELECT citizenid, COALESCE(device_identity, identity), identity, enabled,
                       COALESCE(auto_sync, 1), synced_at
                FROM phone_cloud_backups
            ]])
            MySQL.query.await([[
                INSERT IGNORE INTO phone_cloud_accounts (citizenid, password)
                SELECT citizenid, password FROM phone_cloud_backups WHERE password IS NOT NULL
            ]])
        end)
    end

    -- Last-opened / equipped phone per character. Survives resource and server restarts so
    -- keybind opens and call routing keep the same device without requiring a fresh item use.
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_player_equipment (
            citizenid  VARCHAR(64) NOT NULL,
            device_id  VARCHAR(64) NULL,
            color      VARCHAR(32) NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Reads the character's last-equipped phone preference. Read-only.
---@param citizenid string
---@return { deviceId: string|nil, color: string|nil }|nil
function store.getEquipment(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT device_id, color FROM phone_player_equipment WHERE citizenid = ?',
        { citizenid })
    if not row then return nil end
    return {
        deviceId = (type(row.device_id) == 'string' and row.device_id ~= '') and row.device_id or nil,
        color    = (type(row.color) == 'string' and row.color ~= '') and row.color or nil,
    }
end

---Persists the character's last-equipped phone (device identity + frame colour).
---@param citizenid string
---@param deviceId string|nil
---@param color string|nil
function store.setEquipment(citizenid, deviceId, color)
    if not citizenid or citizenid == '' then return end
    MySQL.insert.await([[
        INSERT INTO phone_player_equipment (citizenid, device_id, color)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE device_id = VALUES(device_id), color = VALUES(color)
    ]], { citizenid, deviceId, color })
end

---True when a number is already claimed - by a registered SIM or by any legacy
---phone_settings row (pre-SIM assignments must never be duplicated onto a new SIM).
---@param digits string bare-digit number
---@return boolean taken
local function numberTaken(digits)
    local sim = MySQL.scalar.await('SELECT 1 FROM phone_sim_cards WHERE number = ? LIMIT 1', { digits })
    if sim then return true end
    local legacy = MySQL.scalar.await('SELECT 1 FROM phone_settings WHERE phone_number = ? LIMIT 1', { digits })
    return legacy ~= nil
end

---True when a number is free to assign to a SIM: on no SIM and held by no legacy
---phone_settings assignment. Read-only.
---@param number string phone number in any formatting
---@return boolean available
function store.numberAvailable(number)
    local digits = util.digits(number)
    if digits == '' then return false end
    return not numberTaken(digits)
end

---Generates a phone number that is free in both the SIM registry and phone_settings; tries 20
---random candidates, then accepts an unchecked one.
---@return string number ten raw digits
function store.generateNumber()
    for _ = 1, 20 do
        local candidate = genNumber()
        if not numberTaken(candidate) then return candidate end
    end
    return genNumber()
end

---Reads a SIM registry row by number. Read-only.
---@param number string phone number in any formatting
---@return { number: string, identity: string, owner_cid: string|nil }|nil
function store.get(number)
    local digits = util.digits(number)
    if digits == '' then return nil end
    return MySQL.single.await(
        'SELECT number, identity, owner_cid FROM phone_sim_cards WHERE number = ?', { digits })
end

---Registers a new SIM. When `bindCid` is given the SIM is character-bound: its identity is that
---citizenid (so the character's pre-SIM data carries over) and, unless a number was passed, it
---reuses the character's already-assigned number when that number isn't on a SIM yet. A blank
---SIM gets a fresh `sim:<number>` identity.
---@param opts? { number?: string, bindCid?: string }
---@return string|nil number registered bare-digit number, nil when the requested number is taken
function store.create(opts)
    opts = opts or {}
    local digits = util.digits(opts.number)

    if digits ~= '' then
        if store.get(digits) then return nil end
    elseif opts.bindCid then
        local existing = MySQL.scalar.await(
            'SELECT phone_number FROM phone_settings WHERE citizenid = ?', { opts.bindCid })
        existing = util.digits(existing)
        if existing ~= '' and not store.get(existing) then digits = existing end
    end
    if digits == '' then digits = store.generateNumber() end

    local identity = opts.bindCid or ('sim:' .. digits)
    MySQL.update.await([[
        INSERT INTO phone_sim_cards (number, identity, owner_cid) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE number = number
    ]], { digits, identity, opts.bindCid })
    return digits
end

---Resolves a SIM number to its data identity, registering unknown numbers on the fly (a SIM
---spawned raw through an inventory admin tool still works: it becomes a blank `sim:<number>`
---profile). First activation also stamps `owner_cid` - the character a blank SIM "belongs" to,
---used to gate Face Unlock so a thief's face never unlocks a stolen phone.
---@param number string bare-digit SIM number
---@param activatorCid string|nil real citizenid of the player activating the SIM
---@return string|nil identity data identity for the number, nil for an unusable number
function store.ensureRegistered(number, activatorCid)
    local digits = util.digits(number)
    if digits == '' then return nil end

    local row = store.get(digits)
    if not row then
        -- Unknown number: honour a legacy phone_settings assignment (that character's number
        -- became a SIM), otherwise open a fresh blank profile.
        local legacyCid = MySQL.scalar.await(
            'SELECT citizenid FROM phone_settings WHERE phone_number = ? LIMIT 1', { digits })
        local identity = legacyCid or ('sim:' .. digits)
        MySQL.update.await([[
            INSERT INTO phone_sim_cards (number, identity, owner_cid) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE number = number
        ]], { digits, identity, activatorCid })
        return identity
    end

    if not row.owner_cid and activatorCid then
        MySQL.update.await(
            'UPDATE phone_sim_cards SET owner_cid = ? WHERE number = ? AND owner_cid IS NULL',
            { activatorCid, digits })
        row.owner_cid = activatorCid
    end
    return row.identity
end

---One-shot claim of a SIM's legacy profile for device-mode grandfathering: atomically stamps
---`adopted_by` on the card, succeeding only for the FIRST phone to adopt it. A second phone that
---later receives the same SIM sees the claim and gets the number, not the data.
---@param number string bare-digit SIM number
---@param identity string data identity being adopted (the card's legacy sim:/citizenid identity)
---@return boolean claimed true only when THIS call took the (previously unclaimed) card
function store.claimAdoption(number, identity)
    local digits = util.digits(number)
    if digits == '' or not identity or identity == '' then return false end
    local affected = MySQL.update.await(
        'UPDATE phone_sim_cards SET adopted_by = ? WHERE number = ? AND adopted_by IS NULL',
        { identity, digits })
    return (tonumber(affected) or 0) > 0
end

---Shapes a phone_cloud_profiles row for callers.
---@param row table raw DB row
---@return table profile
local function shapeProfile(row)
    return {
        deviceIdentity = row.device_identity,
        identity       = row.identity,
        enabled        = util.truthy(row.enabled),
        autoSync       = util.truthy(row.auto_sync),
        syncedAt       = tonumber(row.synced_at),
        color          = row.color,
        number         = row.number,
    }
end

---A character's backup profiles, most recently synced first. Read-only.
---@param citizenid string real (framework) citizenid
---@return table[] profiles
function store.listProfiles(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local rows = MySQL.query.await([[
        SELECT device_identity, identity, enabled, auto_sync, synced_at, color, number
        FROM phone_cloud_profiles WHERE citizenid = ?
        ORDER BY synced_at DESC
    ]], { citizenid }) or {}
    local out = {}
    for i = 1, #rows do out[i] = shapeProfile(rows[i]) end
    return out
end

---One phone's backup profile, or nil.
---@param citizenid string real (framework) citizenid
---@param deviceIdentity string phone identity
---@return table|nil profile
function store.getProfile(citizenid, deviceIdentity)
    if not citizenid or citizenid == '' or not deviceIdentity or deviceIdentity == '' then return nil end
    local row = MySQL.single.await([[
        SELECT device_identity, identity, enabled, auto_sync, synced_at, color, number
        FROM phone_cloud_profiles WHERE citizenid = ? AND device_identity = ?
    ]], { citizenid, deviceIdentity })
    return row and shapeProfile(row) or nil
end

---Creates or re-enables a phone's backup profile with its snapshot namespace.
---@param citizenid string real (framework) citizenid
---@param deviceIdentity string phone identity
---@param cloudIdentity string snapshot identity
function store.upsertProfile(citizenid, deviceIdentity, cloudIdentity)
    if not citizenid or citizenid == '' or not deviceIdentity or deviceIdentity == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_cloud_profiles (citizenid, device_identity, identity, enabled)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE enabled = 1, identity = VALUES(identity)
    ]], { citizenid, deviceIdentity, cloudIdentity })
end

---Flips one profile's enabled flag.
---@param citizenid string real (framework) citizenid
---@param deviceIdentity string phone identity
---@param on boolean
function store.setProfileEnabled(citizenid, deviceIdentity, on)
    MySQL.update.await(
        'UPDATE phone_cloud_profiles SET enabled = ? WHERE citizenid = ? AND device_identity = ?',
        { on == true and 1 or 0, citizenid, deviceIdentity })
end

---Flips one profile's auto-sync flag.
---@param citizenid string real (framework) citizenid
---@param deviceIdentity string phone identity
---@param on boolean
function store.setProfileAuto(citizenid, deviceIdentity, on)
    MySQL.update.await(
        'UPDATE phone_cloud_profiles SET auto_sync = ? WHERE citizenid = ? AND device_identity = ?',
        { on == true and 1 or 0, citizenid, deviceIdentity })
end

---Records a completed snapshot sync plus the picker labels (frame colour + number at sync time).
---@param citizenid string real (framework) citizenid
---@param deviceIdentity string phone identity
---@param syncedAt number unix epoch
---@param color string|nil frame colour
---@param number string|nil bare-digit number
function store.setProfileSynced(citizenid, deviceIdentity, syncedAt, color, number)
    MySQL.update.await([[
        UPDATE phone_cloud_profiles SET synced_at = ?, color = ?, number = ?
        WHERE citizenid = ? AND device_identity = ?
    ]], { syncedAt, color, number, citizenid, deviceIdentity })
end

---Converts a legacy pointer profile to its minted snapshot namespace.
---@param citizenid string real (framework) citizenid
---@param deviceIdentity string phone identity
---@param identity string new snapshot identity
function store.setProfileIdentity(citizenid, deviceIdentity, identity)
    MySQL.update.await(
        'UPDATE phone_cloud_profiles SET identity = ? WHERE citizenid = ? AND device_identity = ?',
        { identity, citizenid, deviceIdentity })
end

---Deletes one profile row (the caller wipes the snapshot data itself).
---@param citizenid string real (framework) citizenid
---@param deviceIdentity string phone identity
function store.deleteProfile(citizenid, deviceIdentity)
    MySQL.update.await(
        'DELETE FROM phone_cloud_profiles WHERE citizenid = ? AND device_identity = ?',
        { citizenid, deviceIdentity })
end

---How many backup profiles a character holds (enabled or not - disabled ones keep snapshots).
---@param citizenid string real (framework) citizenid
---@return number
function store.profileCount(citizenid)
    local n = MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_cloud_profiles WHERE citizenid = ?', { citizenid })
    return tonumber(n) or 0
end

---The character's cloud-account password hash, or nil when never set.
---@param citizenid string real (framework) citizenid
---@return string|nil passwordHash
function store.getBackupPassword(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT password FROM phone_cloud_accounts WHERE citizenid = ?', { citizenid })
    return row and row.password or nil
end

---Sets the character-level backup password (upsert; one password guards every profile).
---@param citizenid string real (framework) citizenid
---@param passwordHash string
function store.setBackupPassword(citizenid, passwordHash)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_cloud_accounts (citizenid, password) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE password = VALUES(password)
    ]], { citizenid, passwordHash })
end

---Moves a registered SIM to a different number, keeping its identity, owner and backups intact.
---Refuses when the target number is already claimed by a SIM or a legacy phone_settings row of
---a DIFFERENT identity. Also re-points the identity's phone_settings mirror.
---@param oldNumber string current bare-digit number
---@param newNumber string requested bare-digit number
---@return boolean ok
---@return string|nil err 'not_found' | 'taken'
function store.renameNumber(oldNumber, newNumber)
    local oldDigits, newDigits = util.digits(oldNumber), util.digits(newNumber)
    if oldDigits == '' or newDigits == '' then return false, 'not_found' end
    if oldDigits == newDigits then return true end

    local row = store.get(oldDigits)
    if not row then return false, 'not_found' end
    if store.get(newDigits) then return false, 'taken' end
    local legacyCid = MySQL.scalar.await(
        'SELECT citizenid FROM phone_settings WHERE phone_number = ? LIMIT 1', { newDigits })
    if legacyCid and legacyCid ~= row.identity then return false, 'taken' end

    MySQL.update.await('UPDATE phone_sim_cards SET number = ? WHERE number = ?', { newDigits, oldDigits })
    MySQL.update.await('UPDATE phone_settings SET phone_number = ? WHERE citizenid = ?', { newDigits, row.identity })
    return true
end

return store
