---@type table Store module; the table returned at end of file.
local store = {}

---Creates the phone_secret_apps table (one row per citizenid + unlocked app id).
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_secret_apps (
            citizenid   VARCHAR(64) NOT NULL,
            app_id      VARCHAR(32) NOT NULL,
            unlocked_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, app_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---True if the citizen already unlocked this secret app. Read-only.
---@param citizenid string framework per-character id
---@param appId string secret app id
---@return boolean
function store.has(citizenid, appId)
    if not citizenid or citizenid == '' then return false end
    return MySQL.scalar.await(
        'SELECT 1 FROM phone_secret_apps WHERE citizenid = ? AND app_id = ?', { citizenid, appId }
    ) ~= nil
end

---Unlocks a secret app for a citizen. Idempotent (INSERT IGNORE on the composite key).
---@param citizenid string framework per-character id
---@param appId string secret app id
function store.unlock(citizenid, appId)
    if not citizenid or citizenid == '' then return end
    MySQL.query.await(
        'INSERT IGNORE INTO phone_secret_apps (citizenid, app_id) VALUES (?, ?)', { citizenid, appId }
    )
end

---The citizen's unlocked secret app ids. Read-only.
---@param citizenid string framework per-character id
---@return string[] ids
function store.list(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local rows = MySQL.query.await(
        'SELECT app_id FROM phone_secret_apps WHERE citizenid = ?', { citizenid }
    ) or {}
    local out = {}
    for i = 1, #rows do out[i] = rows[i].app_id end
    return out
end

---Removes a secret app unlock for a citizen.
---@param citizenid string framework per-character id
---@param appId string secret app id
---@return boolean
function store.remove(citizenid, appId)
    if not citizenid or citizenid == '' or not appId or appId == '' then return false end
    local affected = MySQL.update.await(
        'DELETE FROM phone_secret_apps WHERE citizenid = ? AND app_id = ?', { citizenid, appId }
    )
    return (affected or 0) > 0
end

return store
