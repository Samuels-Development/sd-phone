---@type table Store module; the table returned at end of file.
local store = {}


local util = require 'server.util'
local function newId() return util.newId(10) end

---@type fun(): string Public alias - composers outside this module (mail actions, the
---accounts-engine delivery mailer) mint their message ids through the store.
store.newId = newId

-- Server-side pepper mixed into every password hash.
---@type string
local PEPPER = 'sd-phone-v1::mail::do-not-leak-this-string'

---Hashes a password into a stable, deterministic 24-character hex digest.
---@param password string
---@return string 24-char hex digest
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

---Decodes a JSON column value: tables pass through, strings are JSON-decoded, and anything
---else (or a failed decode) becomes {}.
---@param value any
---@return table
local function decodeJson(value)
    if value == nil then return {} end
    if type(value) == 'table' then return value end
    if type(value) == 'string' then
        local ok, decoded = pcall(json.decode, value)
        if ok and type(decoded) == 'table' then return decoded end
    end
    return {}
end

---Encode a table for a JSON column; nil becomes an empty array/object.
---@param tbl table|nil
---@return string
local function encodeJson(tbl) return json.encode(tbl or {}) end

---@type integer Hard ceiling on one account's stored messages blob. Every append, mark-read and
---flag is a read-decode-encode-write of the WHOLE blob on the main thread, so the blob size is
---what a caller pays per call - MaxMessagesPerAccount alone does not bound it, because one
---message can carry a 10k body plus five 5k note attachments.
local MAX_ACCOUNT_BYTES = 512 * 1024

---Drops the oldest messages until the array's encoded size fits the account budget. The newest
---message is always kept, even alone over budget, so a delivery is never silently lost.
---@param messages table[] oldest-first
---@return table[] messages the same array when it already fits
local function fitBudget(messages)
    local total, from = 2, 1
    for i = #messages, 1, -1 do
        local encodedOk, encoded = pcall(json.encode, messages[i])
        total = total + ((encodedOk and type(encoded) == 'string') and #encoded + 1 or MAX_ACCOUNT_BYTES)
        if total > MAX_ACCOUNT_BYTES and i < #messages then from = i + 1; break end
    end
    if from == 1 then return messages end

    local out = {}
    for i = from, #messages do out[#out + 1] = messages[i] end
    return out
end

---Hydrate a raw row from `phone_mail_accounts` into the canonical Lua shape with `messages`
---and `logged_in_citizens` pre-decoded.
---@param row table|nil
---@return table|nil
local function hydrateRow(row)
    if not row then return nil end
    return {
        email              = row.email,
        password_hash      = row.password_hash,
        display_name       = row.display_name,
        messages           = decodeJson(row.messages),
        logged_in_citizens = decodeJson(row.logged_in_citizens),
    }
end

---@type integer Rows per statement when the session index is rebuilt, matching the lb-phone
---importer's chunk size.
local RECONCILE_CHUNK = 300

---Rebuilds `phone_mail_sessions` from `logged_in_citizens`, which stays the source of truth.
---Runs every boot so an older install, a hand-edited row or a table truncated out from under the
---index self-heals; when the two already agree it is two reads and no writes.
---@return integer added
---@return integer removed
local function reconcileSessions()
    local accounts = MySQL.query.await('SELECT email, logged_in_citizens FROM phone_mail_accounts') or {}
    local want = {}
    for i = 1, #accounts do
        local email = accounts[i].email
        local list = decodeJson(accounts[i].logged_in_citizens)
        for j = 1, #list do
            local cid = list[j]
            if type(cid) == 'string' and cid ~= '' and type(email) == 'string' then
                want[cid .. '\0' .. email:lower()] = { cid, email }
            end
        end
    end

    local have = MySQL.query.await('SELECT citizenid, email FROM phone_mail_sessions') or {}
    local stale = {}
    for i = 1, #have do
        local key = tostring(have[i].citizenid) .. '\0' .. tostring(have[i].email):lower()
        if want[key] then want[key] = nil else stale[#stale + 1] = have[i] end
    end

    local add = {}
    for _, pair in pairs(want) do add[#add + 1] = pair end

    for i = 1, #add, RECONCILE_CHUNK do
        local groups, params = {}, {}
        for j = i, math.min(i + RECONCILE_CHUNK - 1, #add) do
            groups[#groups + 1] = '(?,?)'
            params[#params + 1] = add[j][1]
            params[#params + 1] = add[j][2]
        end
        MySQL.query.await(
            'INSERT IGNORE INTO phone_mail_sessions (citizenid, email) VALUES ' .. table.concat(groups, ','), params)
    end

    for i = 1, #stale, RECONCILE_CHUNK do
        local groups, params = {}, {}
        for j = i, math.min(i + RECONCILE_CHUNK - 1, #stale) do
            groups[#groups + 1] = '(?,?)'
            params[#params + 1] = stale[j].citizenid
            params[#params + 1] = stale[j].email
        end
        MySQL.query.await(
            'DELETE FROM phone_mail_sessions WHERE (citizenid, email) IN (' .. table.concat(groups, ',') .. ')', params)
    end

    return #add, #stale
end

---Creates the single Mail table idempotently. Run once at boot. lb-phone's mail app uses the
---same table name with a different shape; such a table is moved aside first.
---@type fun(): integer, integer Public alias so the lb-phone importer can rebuild the index right
---after it writes logged_in_citizens, instead of leaving mail signed out until the next boot.
store.reconcileSessions = reconcileSessions

function store.ensureSchema()
    util.rescueLegacyTable('phone_mail_accounts', 'password_hash')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mail_accounts (
            email              VARCHAR(64)  NOT NULL,
            password_hash      VARCHAR(255) NOT NULL,
            display_name       VARCHAR(64)  NOT NULL,
            messages           JSON         NOT NULL,
            logged_in_citizens JSON         NOT NULL,
            created_by_cid     VARCHAR(64)  NULL,
            created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Signing out only drops the session, so the concurrent-session cap cannot bound how many
    -- accounts one character has minted. This column is what a lifetime cap counts.
    util.ensureColumns('phone_mail_accounts', {
        display_name       = "display_name VARCHAR(64) NOT NULL DEFAULT ''",
        messages           = 'messages JSON NULL',
        logged_in_citizens = 'logged_in_citizens JSON NULL',
        created_by_cid     = 'created_by_cid VARCHAR(64) NULL',
        created_at         = 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
    })
    util.ensureIndex('phone_mail_accounts', 'idx_phone_mail_accounts_creator', '(created_by_cid)')

    -- Index over logged_in_citizens: JSON_SEARCH cannot use one, so every badge snapshot scanned
    -- the whole accounts table and decoded each match's messages blob. The collation has to match
    -- first: joining two IMPLICIT collations is a hard "illegal mix of collations" error, not a
    -- slow query, on a database whose accounts table drifted to MariaDB's newer default.
    util.ensureCollation('phone_mail_accounts')

    util.ensureTable('phone_mail_sessions', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS phone_mail_sessions (
            citizenid VARCHAR(64) NOT NULL,
            email     VARCHAR(64) NOT NULL,
            PRIMARY KEY (citizenid, email),
            KEY idx_phone_mail_sessions_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    util.ensureTable('phone_mail_saved_emails', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS phone_mail_saved_emails (
            citizenid  VARCHAR(64)  NOT NULL,
            email      VARCHAR(128) NOT NULL,
            declined   TINYINT(1)   NOT NULL DEFAULT 0,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Backfills installs that created the table before the declined flag existed.
    local declinedPresent = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_mail_saved_emails' AND column_name = 'declined'
    ]])
    if (tonumber(declinedPresent) or 0) == 0 then
        MySQL.query.await('ALTER TABLE phone_mail_saved_emails ADD COLUMN declined TINYINT(1) NOT NULL DEFAULT 0')
    end

    -- Last, after every CREATE TABLE above: this is the only step here that reads player data, so
    -- a throw inside it must not cost the tables below it.
    local added, removed = reconcileSessions()
    if added + removed > 0 then
        print(('^3[sd-phone]^0 phone_mail_sessions reconciled: +%d, -%d'):format(added, removed))
    end
end

---Reads a single mail account (nil if no row matches); the email match is case-insensitive.
---Read-only.
---@param email string
---@return table|nil
function store.getAccount(email)
    if not email or email == '' then return nil end
    local row = MySQL.single.await(
        'SELECT email, password_hash, display_name, messages, logged_in_citizens FROM phone_mail_accounts WHERE email = ?',
        { email }
    )
    return hydrateRow(row)
end

---Inserts a brand-new account with empty messages + sessions. Returns false when the insert
---fails.
---@param email string
---@param passwordHash string
---@param displayName string
---@param createdByCid string|nil creator citizenid, stamped so a lifetime cap can count them
---@return boolean
function store.insertAccount(email, passwordHash, displayName, createdByCid)
    local ok = pcall(function()
        MySQL.insert.await([[
            INSERT INTO phone_mail_accounts (email, password_hash, display_name, messages, logged_in_citizens, created_by_cid)
            VALUES (?, ?, ?, '[]', '[]', ?)
        ]], { email, passwordHash, displayName, createdByCid })
    end)
    return ok
end

---How many accounts a character has ever created, signed in or not. Read-only.
---@param citizenid string
---@return number
function store.countAccountsCreatedBy(citizenid)
    local n = MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_mail_accounts WHERE created_by_cid = ?', { citizenid })
    return tonumber(n) or 0
end

---Adds a citizenid to an account's logged-in list. Idempotent.
---@param email string
---@param citizenid string
---@return boolean
function store.addSession(email, citizenid)
    local acc = store.getAccount(email); if not acc then return false end
    -- Mirrored on the idempotent path too, so a session that predates the index (or one an
    -- external write added to the JSON) picks up its row here rather than waiting for a boot.
    MySQL.insert.await(
        'INSERT IGNORE INTO phone_mail_sessions (citizenid, email) VALUES (?, ?)', { citizenid, acc.email })
    for i = 1, #acc.logged_in_citizens do
        if acc.logged_in_citizens[i] == citizenid then return true end
    end
    acc.logged_in_citizens[#acc.logged_in_citizens + 1] = citizenid
    local affected = MySQL.update.await(
        'UPDATE phone_mail_accounts SET logged_in_citizens = ? WHERE email = ?',
        { encodeJson(acc.logged_in_citizens), email }
    )
    return (affected or 0) > 0
end

---Removes a citizenid from an account's logged-in list. No-op when the citizenid was never in
---the list.
---@param email string
---@param citizenid string
---@return boolean
function store.removeSession(email, citizenid)
    local acc = store.getAccount(email); if not acc then return false end
    local filtered = {}
    for i = 1, #acc.logged_in_citizens do
        if acc.logged_in_citizens[i] ~= citizenid then
            filtered[#filtered + 1] = acc.logged_in_citizens[i]
        end
    end
    local affected = MySQL.update.await(
        'UPDATE phone_mail_accounts SET logged_in_citizens = ? WHERE email = ?',
        { encodeJson(filtered), email }
    )
    MySQL.update.await(
        'DELETE FROM phone_mail_sessions WHERE citizenid = ? AND email = ?', { citizenid, acc.email })
    return (affected or 0) > 0
end

---Lists every account the given citizenid is currently logged into, as an indexed join over
---`phone_mail_sessions`. Read-only.
---
---`logged_in_citizens` stays the source of truth: the junction only narrows which rows are read,
---and each candidate is still confirmed against the JSON, so an index row the JSON disagrees with
---is ignored rather than trusted.
---@param citizenid string
---@return table[] hydrated accounts
function store.listAccountsForCitizen(citizenid)
    local rows = MySQL.query.await([[
        SELECT a.email, a.password_hash, a.display_name, a.messages, a.logged_in_citizens
        FROM phone_mail_sessions s
        JOIN phone_mail_accounts a ON a.email = s.email
        WHERE s.citizenid = ?
          AND JSON_SEARCH(a.logged_in_citizens, 'one', ?) IS NOT NULL
        ORDER BY a.created_at ASC
    ]], { citizenid, citizenid }) or {}

    for i = 1, #rows do rows[i] = hydrateRow(rows[i]) end
    return rows
end

---Appends a message to an account's messages array, pruning the oldest past `maxRetained`.
---Returns false if the account doesn't exist.
---@param email string
---@param message table
---@param maxRetained number cap on stored messages per account; oldest pruned first
---@return boolean
function store.appendMessage(email, message, maxRetained)
    local acc = store.getAccount(email); if not acc then return false end
    acc.messages[#acc.messages + 1] = message

    if maxRetained and #acc.messages > maxRetained then
        local trimmed = {}
        local offset = #acc.messages - maxRetained
        for i = offset + 1, #acc.messages do
            trimmed[#trimmed + 1] = acc.messages[i]
        end
        acc.messages = trimmed
    end
    acc.messages = fitBudget(acc.messages)

    local affected = MySQL.update.await(
        'UPDATE phone_mail_accounts SET messages = ? WHERE email = ?',
        { encodeJson(acc.messages), email }
    )
    return (affected or 0) > 0
end

---Mutates a single message inside the account's JSON by id via `apply(message) -> message|nil`;
---apply returning nil deletes the message. Returns false when no message matched.
---@param email string
---@param messageId string
---@param apply fun(msg: table): table|nil
---@return boolean updated true if a message was found + persisted
function store.mutateMessage(email, messageId, apply)
    local acc = store.getAccount(email); if not acc then return false end
    local rewritten = {}
    local hit = false
    for i = 1, #acc.messages do
        local m = acc.messages[i]
        if m.id == messageId then
            hit = true
            local replaced = apply(m)
            if replaced ~= nil then
                rewritten[#rewritten + 1] = replaced
            end
        else
            rewritten[#rewritten + 1] = m
        end
    end
    if not hit then return false end
    local affected = MySQL.update.await(
        'UPDATE phone_mail_accounts SET messages = ? WHERE email = ?',
        { encodeJson(rewritten), email }
    )
    return (affected or 0) > 0
end

---Marks every listed message id as read in a single read-modify-write, so a "mark all" cannot
---lose updates by racing N concurrent single-message writes. Ids not present are ignored.
---@param email string
---@param ids string[]
---@return number changed count of messages newly flagged read
function store.markManyRead(email, ids)
    local acc = store.getAccount(email); if not acc then return 0 end
    local want = {}
    for i = 1, #ids do want[ids[i]] = true end
    local changed = 0
    for i = 1, #acc.messages do
        local m = acc.messages[i]
        if want[m.id] and m.read ~= true then
            m.read = true
            changed = changed + 1
        end
    end
    if changed == 0 then return 0 end
    MySQL.update.await(
        'UPDATE phone_mail_accounts SET messages = ? WHERE email = ?',
        { encodeJson(acc.messages), email }
    )
    return changed
end

---Overwrites an account's stored password hash.
---@param email string
---@param passwordHash string
function store.setPasswordHash(email, passwordHash)
    MySQL.update.await('UPDATE phone_mail_accounts SET password_hash = ? WHERE email = ?', { passwordHash, email })
end

---Permanently deletes an account and all its mail.
---@param email string
function store.deleteAccount(email)
    if not email or email == '' then return end
    MySQL.update.await('DELETE FROM phone_mail_accounts WHERE email = ?', { email })
    MySQL.update.await('DELETE FROM phone_mail_sessions WHERE email = ?', { email })
end

---Counts unread inbox messages across every Mail account the citizen is signed into.
---Read-only.
---@param citizenid string
---@return number
function store.unreadCount(citizenid)
    local accounts = store.listAccountsForCitizen(citizenid)
    local n = 0
    for i = 1, #accounts do
        local msgs = accounts[i].messages
        for j = 1, #msgs do
            local m = msgs[j]
            if m.folder == 'inbox' and m.read ~= true then n = n + 1 end
        end
    end
    return n
end

---A citizenid's saved compose addresses, oldest-saved first. Read-only.
---@param citizenid string
---@return string[]
function store.listSavedEmails(citizenid)
    local rows = MySQL.query.await(
        'SELECT email FROM phone_mail_saved_emails WHERE citizenid = ? AND declined = 0 ORDER BY created_at ASC, email ASC',
        { citizenid }) or {}
    local out = {}
    for i = 1, #rows do out[#out + 1] = rows[i].email end
    return out
end

---Addresses the citizenid declined the save prompt for; each suppresses future prompts.
---Read-only.
---@param citizenid string
---@return string[]
function store.listDeclinedEmails(citizenid)
    local rows = MySQL.query.await(
        'SELECT email FROM phone_mail_saved_emails WHERE citizenid = ? AND declined = 1 ORDER BY created_at ASC, email ASC',
        { citizenid }) or {}
    local out = {}
    for i = 1, #rows do out[#out + 1] = rows[i].email end
    return out
end

---Saves an address for a citizenid; a previously declined row is revived to saved. Returns
---false only when the per-character cap of saved rows is already reached.
---@param citizenid string
---@param email string
---@param maxSaved integer
---@return boolean
function store.addSavedEmail(citizenid, email, maxSaved)
    local count = tonumber(MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_mail_saved_emails WHERE citizenid = ? AND declined = 0', { citizenid })) or 0
    if count >= maxSaved then return false end
    MySQL.insert.await([[
        INSERT INTO phone_mail_saved_emails (citizenid, email, declined) VALUES (?, ?, 0)
        ON DUPLICATE KEY UPDATE declined = 0
    ]], { citizenid, email })
    return true
end

---Records a declined save prompt so the address is never offered again. A no-op when the
---address is already saved (INSERT IGNORE keeps the saved row).
---@param citizenid string
---@param email string
function store.declineSavedEmail(citizenid, email)
    MySQL.insert.await('INSERT IGNORE INTO phone_mail_saved_emails (citizenid, email, declined) VALUES (?, ?, 1)', { citizenid, email })
end

---Removes a saved address. Idempotent.
---@param citizenid string
---@param email string
function store.removeSavedEmail(citizenid, email)
    MySQL.update.await('DELETE FROM phone_mail_saved_emails WHERE citizenid = ? AND email = ?', { citizenid, email })
end

return store
