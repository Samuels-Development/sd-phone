---@type table Flags module; the table returned at end of file.
local flags = {}

---@type table Watchlist config (configs/moderation.lua): rules, apps and sweep cadence.
local config = require 'configs.moderation'
---@type table Admin persistence layer (server.admin.store): the content adapters a sweep reads.
local store  = require 'server.admin.store'

---@type integer Rows one page of a sweep reads.
local PAGE = 50
---@type integer Longest excerpt kept with a flag, in characters.
local EXCERPT = 400
---@type integer Longest matched fragment kept, in characters.
local MATCHED = 64

---Creates the flags table. Called from the admin module's schema bootstrap, inside the same
---pcall as the rest, so a failure here degrades the panel rather than the resource.
function flags.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_admin_flags (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            app          VARCHAR(32)  NOT NULL,
            target_id    VARCHAR(64)  NOT NULL,
            rule_id      VARCHAR(32)  NOT NULL,
            rule_label   VARCHAR(64)  NOT NULL,
            matched      VARCHAR(64)  NOT NULL DEFAULT '',
            author_cid   VARCHAR(64)  NULL,
            excerpt      VARCHAR(500) NOT NULL DEFAULT '',
            status       VARCHAR(16)  NOT NULL DEFAULT 'open',
            handled_by   VARCHAR(64)  NULL,
            handled_name VARCHAR(80)  NULL,
            handled_at   BIGINT       NULL,
            created_at   BIGINT       NOT NULL,
            UNIQUE KEY uniq_admin_flag (app, target_id, rule_id),
            KEY idx_admin_flags_status (status, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---One page of an app's rows in the shape a sweep reads. Squawk keeps its own reader because its
---posts resolve handles the generic adapters know nothing about; everything else is a content
---adapter, so a new app in the config sweeps the moment it has one.
---@param app string app id from the config
---@param cursor string|nil page cursor from the previous call
---@return table[] rows, string|nil nextCursor
local function readPage(app, cursor)
    if app == 'birdy' then
        return store.listBirdyPosts(cursor, PAGE, nil, nil)
    end
    local known = store.contentInfo(app)
    if not known then return {}, nil end
    return store.listContent(app, cursor, PAGE, nil)
end

---The text of one row a rule is tested against: everything a player wrote, and nothing the
---server generated around it.
---@param row table
---@return string lowercased
local function textOf(row)
    local parts = {}
    if type(row.title) == 'string' then parts[#parts + 1] = row.title end
    if type(row.body) == 'string'  then parts[#parts + 1] = row.body end
    return table.concat(parts, '\n'):lower()
end

---Files one flag, or leaves the existing one alone. The unique key is what makes a sweep safe to
---run as often as an operator likes: re-reading the same post cannot file it twice, and a flag an
---admin already dismissed stays dismissed instead of reopening on the next pass.
---@param app string
---@param row table
---@param rule table
---@param matched string the fragment that tripped the rule
---@return boolean filed true when this call created the row
local function file(app, row, rule, matched)
    local body = type(row.body) == 'string' and row.body or (row.title or '')
    local n = MySQL.insert.await([[
        INSERT IGNORE INTO phone_admin_flags
            (app, target_id, rule_id, rule_label, matched, author_cid, excerpt, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        app, tostring(row.id), rule.id, rule.label,
        matched:sub(1, MATCHED), row.authorCid, body:sub(1, EXCERPT), os.time(),
    })
    return (tonumber(n) or 0) > 0
end

---Reads recent content across the configured apps and files a flag for every rule match.
---Read-only against every app: the sweep never edits or removes what it finds.
---@return integer filed, integer scanned
function flags.sweep()
    local rules = {}
    for _, rule in ipairs(config.Rules or {}) do
        if type(rule.patterns) == 'table' and #rule.patterns > 0 then rules[#rules + 1] = rule end
    end
    if #rules == 0 then return 0, 0 end

    local oldest  = os.time() - (tonumber(config.LookbackHours) or 24) * 3600
    local maxRows = tonumber(config.MaxRowsPerApp) or 400
    local filed, scanned = 0, 0

    for _, app in ipairs(config.Apps or {}) do
        local cursor, rows, stop = nil, 0, false

        while not stop do
            -- Guarded per app: one app's missing table costs that app's rows, not the sweep.
            local okPage, page, nextCursor = pcall(readPage, app, cursor)
            if not okPage or type(page) ~= 'table' or #page == 0 then break end

            for _, row in ipairs(page) do
                if (tonumber(row.createdAt) or 0) < oldest then stop = true break end

                scanned = scanned + 1
                rows = rows + 1
                local text = textOf(row)
                for _, rule in ipairs(rules) do
                    for _, pattern in ipairs(rule.patterns) do
                        local hit = text:match(pattern)
                        if hit then
                            if file(app, row, rule, hit) then filed = filed + 1 end
                            break
                        end
                    end
                end
            end

            cursor = nextCursor
            if not cursor or rows >= maxRows then stop = true end
        end
    end

    return filed, scanned
end

---One page of flags, newest first, keyset-paginated by row id.
---@param status string|nil 'open' | 'actioned' | 'dismissed', nil for every status
---@param cursor integer|nil last row id of the previous page
---@param limit integer page size (already clamped)
---@return table[] rows, integer|nil nextCursor
function flags.list(status, cursor, limit)
    local rows = MySQL.query.await([[
        SELECT id, app, target_id, rule_id, rule_label, matched, author_cid, excerpt, status,
               handled_name, handled_at, created_at
        FROM phone_admin_flags
        WHERE (? IS NULL OR status = ?)
          AND (? IS NULL OR id < ?)
        ORDER BY id DESC
        LIMIT ?
    ]], { status, status, cursor, cursor, limit + 1 }) or {}

    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        nextCursor = rows[limit].id
    end

    local out = {}
    for i, r in ipairs(rows) do
        out[i] = {
            id          = tonumber(r.id),
            app         = r.app,
            targetId    = r.target_id,
            ruleId      = r.rule_id,
            ruleLabel   = r.rule_label,
            matched     = r.matched,
            authorCid   = r.author_cid,
            excerpt     = r.excerpt,
            status      = r.status,
            handledName = r.handled_name,
            handledAt   = tonumber(r.handled_at),
            createdAt   = tonumber(r.created_at),
        }
    end
    return out, nextCursor
end

---How many flags are waiting, for the panel's queue badge.
---@return integer
function flags.openCount()
    local row = MySQL.single.await("SELECT COUNT(*) AS n FROM phone_admin_flags WHERE status = 'open'")
    return tonumber(row and row.n) or 0
end

---Marks one flag handled. `actioned` and `dismissed` both close it; what separates them is only
---what the admin decided, which is why both are kept rather than deleting the row.
---@param id integer flag row id
---@param status string 'actioned' | 'dismissed' | 'open'
---@param adminCid string
---@param adminName string
---@return integer updated
function flags.resolve(id, status, adminCid, adminName)
    local reopening = status == 'open'
    return tonumber(MySQL.update.await([[
        UPDATE phone_admin_flags
        SET status = ?, handled_by = ?, handled_name = ?, handled_at = ?
        WHERE id = ?
    ]], {
        status,
        reopening and nil or adminCid,
        reopening and nil or adminName,
        reopening and nil or os.time(),
        id,
    })) or 0
end

---Drops every flag pointing at one row, used when the content behind it is deleted: a queue entry
---for something that no longer exists is noise an admin has to read to dismiss.
---@param app string
---@param targetId string
---@return integer removed
function flags.clearFor(app, targetId)
    return tonumber(MySQL.update.await(
        'DELETE FROM phone_admin_flags WHERE app = ? AND target_id = ?', { app, targetId })) or 0
end

return flags
