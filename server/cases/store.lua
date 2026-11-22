---@type table Shared server helpers (server.util): the ensureTable drop-in upgrade helper.
local util = require 'server.util'

---@type table Store module; the table returned at end of file. Pure persistence for phone cases:
---callers own validation.
local store = {}

---Creates phone_cases: one row per character, holding the designs they own and the one they wear.
function store.ensureSchema()
    util.ensureTable('phone_cases', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS phone_cases (
            citizenid  VARCHAR(64) NOT NULL,
            equipped   TEXT        NOT NULL,
            owned      LONGTEXT    NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Decodes a JSON column, treating anything unreadable as absent.
---@param text any
---@return table?
local function decode(text)
    if type(text) ~= 'string' or text == '' then return nil end
    local ok, value = pcall(json.decode, text)
    if ok and type(value) == 'table' then return value end
    return nil
end

---Reads a character's cases.
---@param citizenid string framework per-character id
---@return table? equipped the stored design being worn, exactly as it was written
---@return table[] owned the stored designs, oldest first
function store.get(citizenid)
    local row = MySQL.single.await('SELECT equipped, owned FROM phone_cases WHERE citizenid = ?', { citizenid })
    if not row then return nil, {} end
    return decode(row.equipped), decode(row.owned) or {}
end

---Writes a character's cases (upsert, both columns).
---@param citizenid string framework per-character id
---@param equipped table? the design being worn, nil for none
---@param owned table[] every design the character keeps
function store.save(citizenid, equipped, owned)
    MySQL.prepare.await([[
        INSERT INTO phone_cases (citizenid, equipped, owned) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE equipped = VALUES(equipped), owned = VALUES(owned)
    ]], { citizenid, equipped and json.encode(equipped) or '', json.encode(owned) })
end

return store
