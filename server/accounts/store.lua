---@type table Store module; the table returned at end of file.
local store = {}

---@type table Shared server helpers (server.util): collation conversion.
local util = require 'server.util'

-- Server-side pepper folded into every password hash.
---@type string Engine password pepper.
local PEPPER = 'sd-phone-v1::accounts::do-not-leak-this-string'

---Hashes a password into a stable 24-char hex digest using the engine's pepper.
---@param password string plaintext password
---@return string hash 24-char hex digest
function store.hashPassword(password)
    local input = password .. PEPPER
    local h1, h2, h3 = 0x12345678, 0x87654321, 0xABCDEF01
    for i = 1, #input do
        local b = input:byte(i)
        h1 = (h1 * 31 + b) & 0xFFFFFFFF
        h2 = ((h2 ~ ((b << (i % 8)) & 0xFFFFFFFF)) + 0x9E3779B9) & 0xFFFFFFFF
        h3 = (((h3 << 5) | (h3 >> 27)) + b * (h1 + 1)) & 0xFFFFFFFF
    end
    return ('%08x%08x%08x'):format(h1, h2, h3)
end

---Creates the engine tables idempotently: phone_app_accounts, phone_app_sessions, and the
---phone_passwords vault.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_app_accounts (
            id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
            app           VARCHAR(24)  NOT NULL,
            username      VARCHAR(64)  NOT NULL,
            display_name  VARCHAR(50)  NOT NULL DEFAULT '',
            password_hash VARCHAR(64)  NOT NULL,
            email         VARCHAR(120) NULL,
            phone         VARCHAR(20)  NULL,
            created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_app_username (app, username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_app_sessions (
            app        VARCHAR(24) NOT NULL,
            citizenid  VARCHAR(64) NOT NULL,
            account_id INT UNSIGNED NOT NULL,
            PRIMARY KEY (app, citizenid, account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_passwords (
            id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            citizenid  VARCHAR(64)  NOT NULL,
            app        VARCHAR(24)  NOT NULL,
            username   VARCHAR(64)  NOT NULL,
            password   VARCHAR(64)  NOT NULL,
            email      VARCHAR(120) NULL,
            phone      VARCHAR(20)  NULL,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_vault (citizenid, app, username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ]])
    -- Tables created before the explicit COLLATE above picked up the server default (newer
    -- MariaDB: utf8mb4_uca1400_ai_ci), which breaks joins against the app tables.
    util.ensureCollation('phone_app_accounts')
    util.ensureCollation('phone_app_sessions')
    util.ensureCollation('phone_passwords')
end

---Maps a phone_app_accounts row to the camelCase account shape, passwordHash included.
---@param row table|nil raw DB row
---@return table|nil account
local function rowToAccount(row)
    if not row then return nil end
    return {
        id           = row.id,
        app          = row.app,
        username     = row.username,
        displayName  = row.display_name,
        passwordHash = row.password_hash,
        email        = row.email,
        phone        = row.phone,
    }
end

---One account by app + username. Read-only.
---@param app string account app key
---@param username string account username (already trimmed/lowered by the caller)
---@return table|nil account
function store.getAccount(app, username)
    return rowToAccount(MySQL.single.await(
        'SELECT * FROM phone_app_accounts WHERE app = ? AND username = ?',
        { app, username }
    ))
end

---One account by row id. Read-only.
---@param id number account row id
---@return table|nil account
function store.getAccountById(id)
    return rowToAccount(MySQL.single.await(
        'SELECT * FROM phone_app_accounts WHERE id = ?', { id }
    ))
end

---Returns accounts in `app` whose linked email or phone matches; nil skips that side of the
---search. Read-only.
---@param app string account app key
---@param email string|nil linked email to match
---@param phone string|nil linked phone (digits) to match
---@return table[] accounts
function store.findAccountsByContact(app, email, phone)
    local rows = MySQL.query.await([[
        SELECT * FROM phone_app_accounts
        WHERE app = ? AND ((? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?))
    ]], { app, email, email, phone, phone }) or {}
    local out = {}
    for i = 1, #rows do out[i] = rowToAccount(rows[i]) end
    return out
end

---Inserts a new account row; returns nil when the insert fails.
---@param app string account app key
---@param username string account username
---@param displayName string display name
---@param passwordHash string peppered hash (never the plaintext)
---@param email string|nil linked recovery email
---@param phone string|nil linked recovery phone (digits)
---@return number|nil insertId
function store.insertAccount(app, username, displayName, passwordHash, email, phone)
    return MySQL.insert.await([[
        INSERT INTO phone_app_accounts (app, username, display_name, password_hash, email, phone)
        VALUES (?, ?, ?, ?, ?, ?)
    ]], { app, username, displayName, passwordHash, email, phone })
end

---Replaces an account's stored hash.
---@param id number account row id
---@param passwordHash string peppered hash
function store.setPassword(id, passwordHash)
    MySQL.update.await('UPDATE phone_app_accounts SET password_hash = ? WHERE id = ?', { passwordHash, id })
end

---Deletes an account and its sessions, sessions first.
---@param id number account row id
function store.deleteAccount(id)
    MySQL.update.await('DELETE FROM phone_app_sessions WHERE account_id = ?', { id })
    MySQL.update.await('DELETE FROM phone_app_accounts WHERE id = ?', { id })
end

---Signs a citizen into an account, replacing any prior session for (app, citizenid).
---@param app string account app key
---@param citizenid string framework per-character id
---@param accountId number account row id
function store.setSession(app, citizenid, accountId)
    MySQL.update.await('DELETE FROM phone_app_sessions WHERE app = ? AND citizenid = ?', { app, citizenid })
    MySQL.insert.await(
        'INSERT INTO phone_app_sessions (app, citizenid, account_id) VALUES (?, ?, ?)',
        { app, citizenid, accountId }
    )
end

---Sign a citizen out of an app (idempotent: no rows is a no-op).
---@param app string account app key
---@param citizenid string framework per-character id
function store.clearSession(app, citizenid)
    MySQL.update.await('DELETE FROM phone_app_sessions WHERE app = ? AND citizenid = ?', { app, citizenid })
end

---Signs a citizen out of every app at once (idempotent).
---@param citizenid string framework per-character id
function store.clearAllSessions(citizenid)
    MySQL.update.await('DELETE FROM phone_app_sessions WHERE citizenid = ?', { citizenid })
end

---Returns every citizen currently signed into an account in `app`. Read-only.
---@param app string account app key
---@param accountId number account row id
---@return string[] citizenids
function store.sessionCitizens(app, accountId)
    local rows = MySQL.query.await(
        'SELECT citizenid FROM phone_app_sessions WHERE app = ? AND account_id = ?',
        { app, accountId }
    ) or {}
    local out = {}
    for i = 1, #rows do out[i] = rows[i].citizenid end
    return out
end

---First (only, for single-session apps) account this citizen is signed into. Read-only.
---@param app string account app key
---@param citizenid string framework per-character id
---@return table|nil account
function store.getSessionAccount(app, citizenid)
    local row = MySQL.single.await([[
        SELECT a.* FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE s.app = ? AND s.citizenid = ?
        LIMIT 1
    ]], { app, citizenid })
    return rowToAccount(row)
end

---Upserts one vault entry for a character, keyed UNIQUE (citizenid, app, username).
---@param citizenid string framework per-character id (the vault's owner)
---@param app string account app key
---@param username string saved login username
---@param password string saved login password, stored plaintext
---@param email string|nil saved linked email
---@param phone string|nil saved linked phone (digits)
function store.saveVaultEntry(citizenid, app, username, password, email, phone)
    MySQL.query.await([[
        INSERT INTO phone_passwords (citizenid, app, username, password, email, phone)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE password = VALUES(password), email = VALUES(email), phone = VALUES(phone)
    ]], { citizenid, app, username, password, email, phone })
end

---Returns all of one character's vault entries, ordered app then username, with the creation
---date pre-formatted. Read-only.
---@param citizenid string framework per-character id
---@return table[] entries
function store.listVaultEntries(citizenid)
    return MySQL.query.await([[
        SELECT id, app, username, password, email, phone, DATE_FORMAT(created_at, '%d/%m/%Y') AS created
        FROM phone_passwords WHERE citizenid = ? ORDER BY app, username
    ]], { citizenid }) or {}
end

---Deletes one vault entry, scoped to citizenid AND id.
---@param citizenid string framework per-character id
---@param id number vault row id
function store.deleteVaultEntry(citizenid, id)
    MySQL.update.await('DELETE FROM phone_passwords WHERE citizenid = ? AND id = ?', { citizenid, id })
end

---Updates every saved vault copy of this login to the new password.
---@param app string account app key
---@param username string account username
---@param password string the new plaintext password
function store.syncVaultPassword(app, username, password)
    MySQL.update.await(
        'UPDATE phone_passwords SET password = ? WHERE app = ? AND username = ?',
        { password, app, username }
    )
end

---Migrates credentials once from the Birdy and Mail tables: Birdy profiles become accounts and
---sessions, Mail accounts copy with the email as username; INSERT IGNORE makes re-runs no-ops.
function store.migrateLegacy()
    MySQL.query.await([[
        INSERT IGNORE INTO phone_app_accounts (app, username, display_name, password_hash)
        SELECT 'birdy', p.handle, p.display_name, p.password
        FROM phone_birdy_profiles p
        WHERE p.handle <> '' AND p.password <> ''
    ]])
    MySQL.query.await([[
        INSERT IGNORE INTO phone_app_sessions (app, citizenid, account_id)
        SELECT 'birdy', p.citizenid, a.id
        FROM phone_birdy_profiles p
        JOIN phone_app_accounts a ON a.app = 'birdy' AND a.username = p.handle COLLATE utf8mb4_unicode_ci
        WHERE p.logged_in = 1
    ]])
    MySQL.query.await([[
        INSERT IGNORE INTO phone_app_accounts (app, username, display_name, password_hash, email)
        SELECT 'mail', m.email, m.display_name, m.password_hash, m.email
        FROM phone_mail_accounts m
    ]])
end

return store
