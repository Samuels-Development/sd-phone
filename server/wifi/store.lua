---@type table Shared server helpers (server.util): the oxmysql TINYINT coercion.
local util = require 'server.util'
---@type fun(v: any): boolean Boolean coercion for oxmysql TINYINT columns.
local isTruthy = util.truthy

---@type integer Cap on a stored network id, matching the citizenid column's own width.
local MAX_ID = 64

---@type table Store module; the table returned at end of file.
local store = {}

---Creates phone_wifi: one row per character, holding the radio switch, every network that character
---has joined and the ones they declined. `declined` shipped later, so it is added separately too.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_wifi (
            citizenid  VARCHAR(64) NOT NULL,
            enabled    TINYINT(1)  NOT NULL DEFAULT 1,
            known      LONGTEXT    NULL,
            declined   LONGTEXT    NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    pcall(MySQL.query.await, 'ALTER TABLE phone_wifi ADD COLUMN IF NOT EXISTS declined LONGTEXT NULL AFTER known')
end

---Clamps a network id to a storable string; nil for empty / non-string input.
---@param v any network id
---@return string|nil id capped at MAX_ID chars, nil if unusable
local function sanitizeId(v)
    if type(v) ~= 'string' or v == '' then return nil end
    return v:sub(1, MAX_ID)
end

---Builds the MySQL JSON path for one network id, escaping the quoted-key delimiters so an id
---carrying a quote or a backslash cannot reshape the path around the key it names.
---@param id string sanitized network id
---@return string path '$."<id>"'
local function pathFor(id)
    return ('$."%s"'):format((id:gsub('([\\"])', '\\%1')))
end

---Reads a character's Wi-Fi state. A character with no row yet gets a switched-on radio and
---nothing remembered, which is the same state a fresh session has always started in.
---@param citizenid string framework per-character id
---@return { enabled: boolean, known: table<string, string|boolean>, declined: table<string, boolean> }
function store.get(citizenid)
    if not citizenid or citizenid == '' then return { enabled = true, known = {}, declined = {} } end
    local row = MySQL.single.await('SELECT enabled, known, declined FROM phone_wifi WHERE citizenid = ?', { citizenid })
    if not row then return { enabled = true, known = {}, declined = {} } end

    local known = {}
    if row.known and row.known ~= '' then
        local ok, decoded = pcall(json.decode, row.known)
        if ok and type(decoded) == 'table' then
            for id, saved in pairs(decoded) do
                if type(id) == 'string' and saved ~= nil then
                    known[id] = type(saved) == 'string' and saved or true
                end
            end
        end
    end

    local declined = {}
    if row.declined and row.declined ~= '' then
        local ok, decoded = pcall(json.decode, row.declined)
        if ok and type(decoded) == 'table' then
            for id, off in pairs(decoded) do
                if type(id) == 'string' and off then declined[id] = true end
            end
        end
    end

    return { enabled = isTruthy(row.enabled), known = known, declined = declined }
end

---Persists a character's radio switch, leaving their remembered networks intact.
---@param citizenid string framework per-character id
---@param on boolean radio enabled
function store.setEnabled(citizenid, on)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_wifi (citizenid, enabled) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)
    ]], { citizenid, on == true and 1 or 0 })
end

---Records a network a character has joined, keeping the password that worked beside its id. The
---merge happens DB-side in one statement, so two joins in flight together cannot lose each other.
---@param citizenid string framework per-character id
---@param id string network id
---@param password string|nil the password the server validated, nil for an open network
function store.remember(citizenid, id, password)
    if not citizenid or citizenid == '' then return end
    local clean = sanitizeId(id)
    if not clean then return end

    local value = (type(password) == 'string' and password ~= '') and password or true
    MySQL.update.await([[
        INSERT INTO phone_wifi (citizenid, known) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE known = JSON_MERGE_PATCH(COALESCE(known, '{}'), VALUES(known))
    ]], { citizenid, json.encode({ [clean] = value }) })
end

---Drops a network from a character's remembered list, so auto-rejoin stops picking it up. Removed
---DB-side in one statement, so a forget and a join landing together cannot lose each other.
---@param citizenid string framework per-character id
---@param id string network id
function store.forget(citizenid, id)
    if not citizenid or citizenid == '' then return end
    local clean = sanitizeId(id)
    if not clean then return end
    MySQL.update.await(
        "UPDATE phone_wifi SET known = JSON_REMOVE(COALESCE(known, '{}'), ?) WHERE citizenid = ?",
        { pathFor(clean), citizenid }
    )
end

---Records that the player left a network on purpose, so it is never rejoined on its own again.
---Cleared only by joining it by hand, which is the player asking for it back.
---@param citizenid string framework per-character id
---@param id string network id
---@param on boolean true to decline, false to clear
function store.setDeclined(citizenid, id, on)
    if not citizenid or citizenid == '' then return end
    local clean = sanitizeId(id)
    if not clean then return end

    if on then
        MySQL.update.await([[
            INSERT INTO phone_wifi (citizenid, declined) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE declined = JSON_MERGE_PATCH(COALESCE(declined, '{}'), VALUES(declined))
        ]], { citizenid, json.encode({ [clean] = true }) })
        return
    end

    MySQL.update.await(
        "UPDATE phone_wifi SET declined = JSON_REMOVE(COALESCE(declined, '{}'), ?) WHERE citizenid = ?",
        { pathFor(clean), citizenid }
    )
end

return store
