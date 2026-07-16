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

---Creates the single Mail table idempotently. Run once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_mail_accounts (
            email              VARCHAR(64)  NOT NULL,
            password_hash      VARCHAR(255) NOT NULL,
            display_name       VARCHAR(64)  NOT NULL,
            messages           JSON         NOT NULL,
            logged_in_citizens JSON         NOT NULL,
            created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
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
---@return boolean
function store.insertAccount(email, passwordHash, displayName)
    local ok = pcall(function()
        MySQL.insert.await([[
            INSERT INTO phone_mail_accounts (email, password_hash, display_name, messages, logged_in_citizens)
            VALUES (?, ?, ?, '[]', '[]')
        ]], { email, passwordHash, displayName })
    end)
    return ok
end

---Adds a citizenid to an account's logged-in list. Idempotent.
---@param email string
---@param citizenid string
---@return boolean
function store.addSession(email, citizenid)
    local acc = store.getAccount(email); if not acc then return false end
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
    return (affected or 0) > 0
end

---Lists every account the given citizenid is currently logged into, via JSON_SEARCH.
---Read-only.
---@param citizenid string
---@return table[] hydrated accounts
function store.listAccountsForCitizen(citizenid)
    local rows = MySQL.query.await([[
        SELECT email, password_hash, display_name, messages, logged_in_citizens
        FROM phone_mail_accounts
        WHERE JSON_SEARCH(logged_in_citizens, 'one', ?) IS NOT NULL
        ORDER BY created_at ASC
    ]], { citizenid }) or {}

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

return store
