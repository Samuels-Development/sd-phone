---@type table Store module; the table returned at end of file. Two tables: published articles and
---the ordered "Breaking" ticker lines. Every statement is parameterized.
local store = {}

---Creates the article + ticker tables if they don't exist. Runs once at boot from init.lua.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_weazel_articles` (
            `id`         INT AUTO_INCREMENT PRIMARY KEY,
            `category`   VARCHAR(24)  NOT NULL,
            `headline`   VARCHAR(160) NOT NULL,
            `dek`        VARCHAR(255) NOT NULL,
            `body`       TEXT         NOT NULL,
            `author`     VARCHAR(80)  NOT NULL,
            `author_cid` VARCHAR(60)  NOT NULL,
            `image`      VARCHAR(512) NULL,
            `featured`   TINYINT(1)   NOT NULL DEFAULT 0,
            `views`      INT          NOT NULL DEFAULT 0,
            `created_at` BIGINT       NOT NULL,
            `updated_at` BIGINT       NOT NULL,
            KEY `created_at` (`created_at`),
            KEY `featured` (`featured`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_weazel_breaking` (
            `id`         INT AUTO_INCREMENT PRIMARY KEY,
            `text`       VARCHAR(220) NOT NULL,
            `pos`        INT          NOT NULL DEFAULT 0,
            `created_at` BIGINT       NOT NULL,
            KEY `pos` (`pos`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]])
end

---The most-recent articles, newest-first. Read-only.
---@param limit integer max rows to return (config WZ.ArticlesPerFeed)
---@return table[] rows article rows, empty when none
function store.articles(limit)
    return MySQL.query.await(
        'SELECT * FROM `phone_weazel_articles` ORDER BY created_at DESC LIMIT ?', { limit }) or {}
end

---One article by id. Read-only.
---@param id integer article id
---@return table|nil row article row, nil when missing
function store.articleById(id)
    return MySQL.single.await('SELECT * FROM `phone_weazel_articles` WHERE id = ?', { id })
end

---Inserts a freshly-sanitized article row; views always start at 0.
---@param a table row-ready fields from actions.sanitize plus the stamped author/timestamps
---@return integer id auto-increment id of the new article
function store.insertArticle(a)
    return MySQL.insert.await([[
        INSERT INTO `phone_weazel_articles`
            (category, headline, dek, body, author, author_cid, image, featured, views, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ]], { a.category, a.headline, a.dek, a.body, a.author, a.author_cid, a.image, a.featured, a.created_at, a.updated_at })
end

---Updates the editable fields of an existing article. Author/views/created_at are never touched.
---@param id integer article id
---@param a table row-ready fields from actions.sanitize plus updated_at
function store.updateArticle(id, a)
    MySQL.query.await([[
        UPDATE `phone_weazel_articles`
        SET category = ?, headline = ?, dek = ?, body = ?, image = ?, featured = ?, updated_at = ?
        WHERE id = ?
    ]], { a.category, a.headline, a.dek, a.body, a.image, a.featured, a.updated_at, id })
end

---Delete an article. Idempotent - a missing id deletes nothing.
---@param id integer article id
function store.deleteArticle(id)
    MySQL.query.await('DELETE FROM `phone_weazel_articles` WHERE id = ?', { id })
end

---Clears the featured flag on every article except `keepId` (pass nil/0 to clear all).
---@param keepId integer|nil article id keeping its featured flag
function store.clearFeatured(keepId)
    MySQL.query.await('UPDATE `phone_weazel_articles` SET featured = 0 WHERE id <> ?', { keepId or 0 })
end

---Count one view of an article. A no-op for a missing id.
---@param id integer article id
function store.bumpViews(id)
    MySQL.query.await('UPDATE `phone_weazel_articles` SET views = views + 1 WHERE id = ?', { id })
end

---An article's current view total (0 when missing). Read-only.
---@param id integer article id
---@return integer views
function store.viewsOf(id)
    return MySQL.scalar.await('SELECT views FROM `phone_weazel_articles` WHERE id = ?', { id }) or 0
end

---Ticker lines in display order. Read-only.
---@return table[] rows { text } rows, empty when none
function store.breaking()
    return MySQL.query.await('SELECT text FROM `phone_weazel_breaking` ORDER BY pos ASC, id ASC') or {}
end

---Replaces the whole ticker with `lines` (already trimmed/clamped by the caller), preserving
---their order.
---@param lines string[] ticker lines in display order
---@param ts integer unix seconds stamp for the new rows
function store.replaceBreaking(lines, ts)
    MySQL.query.await('DELETE FROM `phone_weazel_breaking`')
    for i = 1, #lines do
        MySQL.insert.await(
            'INSERT INTO `phone_weazel_breaking` (text, pos, created_at) VALUES (?, ?, ?)',
            { lines[i], i, ts })
    end
end

return store
