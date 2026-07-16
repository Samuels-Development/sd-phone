---@type table Store module; the table returned at end of file. One row per listing; the feed is
---just the most recent rows across all players. `price` is NULL for "wanted" posts and `image`
---is an optional remote URL. Every value is a ? parameter.
local store = {}

---True if a column already exists on the given table (information_schema probe).
---@param tbl string table name
---@param name string column name
---@return boolean exists
local function columnExists(tbl, name)
    local row = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
    ]], { tbl, name })
    return row ~= nil and tonumber(row.n) > 0
end

---Creates the marketplace_listings table if it doesn't exist and back-fills the `email` and
---`images` columns. Runs once at boot.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `marketplace_listings` (
            `id`         INT AUTO_INCREMENT PRIMARY KEY,
            `citizenid`  VARCHAR(60)  NOT NULL,
            `title`      VARCHAR(80)  NOT NULL,
            `body`       TEXT         NOT NULL,
            `price`      BIGINT       NULL,
            `image`      VARCHAR(512) NULL,
            `number`     VARCHAR(20)  NOT NULL,
            `email`      VARCHAR(128) NULL,
            `created_at` BIGINT       NOT NULL,
            KEY `citizenid` (`citizenid`),
            KEY `created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    if not columnExists('marketplace_listings', 'email') then
        MySQL.query.await('ALTER TABLE `marketplace_listings` ADD COLUMN `email` VARCHAR(128) NULL AFTER `number`')
    end
    if not columnExists('marketplace_listings', 'images') then
        MySQL.query.await('ALTER TABLE `marketplace_listings` ADD COLUMN `images` TEXT NULL AFTER `image`')
    end
end

---Persists a new listing. `price`/`image`/`images`/`email` may be nil (stored as SQL NULL);
---`images` is a JSON-encoded array string.
---@param citizenid string owner citizenid (resolved server-side, never from the payload)
---@param title string listing title (pre-capped)
---@param body string listing body (pre-capped)
---@param price integer|nil asking price, nil for a "wanted" post
---@param image string|nil first photo URL (legacy column + card thumbnail)
---@param images string|nil JSON array of photo URLs
---@param number string contact number digits (may be '')
---@param email string|nil contact email
---@param ts integer unix seconds created_at (server-set)
---@return integer insertId new row id
function store.insert(citizenid, title, body, price, image, images, number, email, ts)
    return MySQL.insert.await(
        'INSERT INTO `marketplace_listings` (citizenid, title, body, price, image, images, number, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        { citizenid, title, body, price, image, images, number, email, ts })
end

---Updates an existing listing's editable fields in place; owner and created_at never change.
---@param id integer listing row id
---@param title string listing title (pre-capped)
---@param body string listing body (pre-capped)
---@param price integer|nil asking price, nil for a "wanted" post
---@param image string|nil first photo URL
---@param images string|nil JSON array of photo URLs
---@param number string contact number digits (may be '')
---@param email string|nil contact email
function store.update(id, title, body, price, image, images, number, email)
    MySQL.update.await(
        'UPDATE `marketplace_listings` SET title = ?, body = ?, price = ?, image = ?, images = ?, number = ?, email = ? WHERE id = ?',
        { title, body, price, image, images, number, email, id })
end

---A single listing row by id, or nil. Read-only.
---@param id integer listing row id
---@return table|nil row
function store.byId(id)
    return MySQL.single.await('SELECT * FROM `marketplace_listings` WHERE id = ?', { id })
end

---The most-recent `limit` listings across everyone, newest-first (id order = insert order).
---Read-only.
---@param limit integer max rows (config MP.ListLimit, never client input)
---@return table[] rows
function store.recent(limit)
    return MySQL.query.await(
        'SELECT * FROM `marketplace_listings` ORDER BY id DESC LIMIT ?', { limit }) or {}
end

---How many listings a character currently has - drives the MaxListingsPerPlayer cap.
---@param citizenid string owner citizenid
---@return integer count
function store.countFor(citizenid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `marketplace_listings` WHERE citizenid = ?', { citizenid }) or 0
end

---Owner citizenid of a listing, or nil if it doesn't exist.
---@param id integer listing row id
---@return string|nil citizenid
function store.ownerOf(id)
    return MySQL.scalar.await('SELECT citizenid FROM `marketplace_listings` WHERE id = ?', { id })
end

---Remove a listing row. Ownership is checked by the caller (actions.delete).
---@param id integer listing row id
function store.delete(id)
    MySQL.query.await('DELETE FROM `marketplace_listings` WHERE id = ?', { id })
end

return store
