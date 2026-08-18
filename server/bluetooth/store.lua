---@type table Shared server helpers (server.util): the oxmysql TINYINT coercion.
local util = require 'server.util'
---@type fun(v: any): boolean Boolean coercion for oxmysql TINYINT columns.
local isTruthy = util.truthy
---@type table Pure Bluetooth maths (shared.bluetooth): id clamping.
local bt = require 'shared.bluetooth'

---@type table Store module; the table returned at end of file.
local store = {}

---Creates phone_bluetooth: one row per character, holding the radio switch and every device that
---character has paired. Mirrors phone_wifi rather than adding a junction table.
function store.ensureSchema()
    util.ensureTable('phone_bluetooth', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS phone_bluetooth (
            citizenid  VARCHAR(64) NOT NULL,
            enabled    TINYINT(1)  NOT NULL DEFAULT 1,
            paired     LONGTEXT    NULL,
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Builds the MySQL JSON path for one device id, escaping the quoted-key delimiters so an id
---carrying a quote or a backslash cannot reshape the path around the key it names.
---@param id string sanitized device id
---@return string path '$."<id>"'
local function pathFor(id)
    return ('$."%s"'):format((id:gsub('([\\"])', '\\%1')))
end

---Reads a character's Bluetooth state. A character with no row yet gets a switched-on radio and
---nothing paired, matching how a fresh phone has always started.
---@param citizenid string framework per-character id
---@return { enabled: boolean, paired: table<string, string> } paired maps device id to its last known name
function store.get(citizenid)
    if not citizenid or citizenid == '' then return { enabled = true, paired = {} } end
    local row = MySQL.single.await('SELECT enabled, paired FROM phone_bluetooth WHERE citizenid = ?', { citizenid })
    if not row then return { enabled = true, paired = {} } end

    local paired = {}
    if row.paired and row.paired ~= '' then
        local ok, decoded = pcall(json.decode, row.paired)
        if ok and type(decoded) == 'table' then
            for id, name in pairs(decoded) do
                if type(id) == 'string' and name ~= nil then
                    paired[id] = type(name) == 'string' and name or id
                end
            end
        end
    end

    return { enabled = isTruthy(row.enabled), paired = paired }
end

---Persists the radio switch, leaving paired devices intact.
---@param citizenid string framework per-character id
---@param on boolean radio enabled
function store.setEnabled(citizenid, on)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_bluetooth (citizenid, enabled) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)
    ]], { citizenid, on == true and 1 or 0 })
end

---Remembers a device, keeping the name beside its id so an unregistered device still shows a label
---instead of a bare id. Merged DB-side in one statement, so two pairings in flight cannot lose each
---other.
---@param citizenid string framework per-character id
---@param id string device id
---@param name string device name at the time of pairing
function store.remember(citizenid, id, name)
    if not citizenid or citizenid == '' then return end
    local clean = bt.cleanId(id)
    if not clean then return end

    MySQL.update.await([[
        INSERT INTO phone_bluetooth (citizenid, paired) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE paired = JSON_MERGE_PATCH(COALESCE(paired, '{}'), VALUES(paired))
    ]], { citizenid, json.encode({ [clean] = type(name) == 'string' and name ~= '' and name or clean }) })
end

---Drops a device from a character's paired list, so auto-reconnect stops picking it up.
---@param citizenid string framework per-character id
---@param id string device id
function store.forget(citizenid, id)
    if not citizenid or citizenid == '' then return end
    local clean = bt.cleanId(id)
    if not clean then return end
    MySQL.update.await(
        "UPDATE phone_bluetooth SET paired = JSON_REMOVE(COALESCE(paired, '{}'), ?) WHERE citizenid = ?",
        { pathFor(clean), citizenid }
    )
end

---Forgets a character's Bluetooth settings: the radio toggle and every paired device. Part of
---Reset All Settings - pairings are a setting, not content.
---@param citizenid string framework per-character id
function store.resetFor(citizenid)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await('DELETE FROM phone_bluetooth WHERE citizenid = ?', { citizenid })
end
return store
