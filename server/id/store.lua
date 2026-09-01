---@type table Store module; the table returned at end of file.
local store = {}

---Create the ID table if it doesn't exist. Run once at boot. The only thing the app persists is
---the portrait: every other field on a card is read live from the framework's own records.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_id (
            citizenid    VARCHAR(64)  NOT NULL,
            portrait_url VARCHAR(512) NULL,
            portrait_at  INT          NULL,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---A character's portrait URL, or nil when none was taken. Read-only.
---@param cid string citizenid
---@return string|nil url
function store.getPortrait(cid)
    local row = MySQL.single.await('SELECT portrait_url FROM phone_id WHERE citizenid = ?', { cid })
    return row and row.portrait_url or nil
end

---Sets or clears a character's portrait.
---@param cid string citizenid
---@param url string|nil upload URL, nil to clear
function store.setPortrait(cid, url)
    MySQL.query.await([[
        INSERT INTO phone_id (citizenid, portrait_url, portrait_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE portrait_url = VALUES(portrait_url), portrait_at = VALUES(portrait_at)
    ]], { cid, url, url and os.time() or nil })
end

return store
