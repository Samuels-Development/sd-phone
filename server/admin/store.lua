---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx').
local framework = require 'bridge.shared.framework'
---@type table Shared server helpers (server.util): digits + index bootstrap.
local util = require 'server.util'

---@type table Store module; the table returned at end of file.
local store = {}

---Creates the audit table and the phone-number search index idempotently.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_admin_audit (
            id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            admin_cid  VARCHAR(64)  NOT NULL,
            admin_name VARCHAR(64)  NOT NULL DEFAULT '',
            action     VARCHAR(48)  NOT NULL,
            target_cid VARCHAR(64)  NULL,
            detail     VARCHAR(512) NOT NULL DEFAULT '',
            created_at BIGINT       NOT NULL,
            PRIMARY KEY (id),
            INDEX idx_admin_audit_target (target_cid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    util.ensureIndex('phone_settings', 'idx_phone_settings_number', '(phone_number)')
end

---Appends one audit row. Never throws; a failed insert only prints.
---@param adminCid string acting admin's citizenid
---@param adminName string acting admin's display name
---@param action string short action slug, e.g. 'wipe-phone'
---@param targetCid string|nil target citizenid when the action has one
---@param detail string|nil free-form context (already truncated by the caller)
function store.audit(adminCid, adminName, action, targetCid, detail)
    local okIns, err = pcall(function()
        MySQL.insert.await([[
            INSERT INTO phone_admin_audit (admin_cid, admin_name, action, target_cid, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ]], { adminCid, adminName, action, targetCid, (detail or ''):sub(1, 512), os.time() })
    end)
    if not okIns then print(('^1[sd-phone:admin]^0 audit insert failed: %s'):format(err)) end
end

-- ---------------------------------------------------------------------------
-- Framework character-name lookups. Table/column names follow the stock QBCore/
-- QBox (`players`) and ESX (`users`) schemas; every query is pcall-guarded so a
-- customised schema degrades to citizenid-only display instead of erroring.
-- ---------------------------------------------------------------------------

---Batch-resolves citizenids to character names from the framework's own table.
---@param cids string[] citizenids to resolve
---@return table<string, string> cid -> "First Last"
function store.namesFor(cids)
    if type(cids) ~= 'table' or #cids == 0 then return {} end
    local seen, list = {}, {}
    for _, c in ipairs(cids) do
        if c and c ~= '' and not seen[c] then seen[c] = true; list[#list + 1] = c end
    end
    if #list == 0 then return {} end
    local placeholders = ('?,'):rep(#list):sub(1, -2)

    local out = {}
    pcall(function()
        if framework.name == 'qb' then
            local rows = MySQL.query.await(
                ('SELECT citizenid, charinfo FROM players WHERE citizenid IN (%s)'):format(placeholders), list) or {}
            for _, r in ipairs(rows) do
                local info = json.decode(r.charinfo or '{}') or {}
                if info.firstname then
                    out[r.citizenid] = ('%s %s'):format(info.firstname, info.lastname or '')
                end
            end
        elseif framework.name == 'esx' then
            local rows = MySQL.query.await(
                ('SELECT identifier, firstname, lastname FROM users WHERE identifier IN (%s)'):format(placeholders), list) or {}
            for _, r in ipairs(rows) do
                out[r.identifier] = ('%s %s'):format(r.firstname or '', r.lastname or '')
            end
        end
    end)
    return out
end

---Finds citizenids whose character name matches a LIKE pattern in the framework's own table.
---@param like string SQL LIKE pattern (already escaped/wrapped by the caller)
---@param limit integer maximum rows
---@return string[] cids
function store.searchByName(like, limit)
    local out = {}
    pcall(function()
        if framework.name == 'qb' then
            local rows = MySQL.query.await([[
                SELECT citizenid FROM players
                WHERE CONCAT(
                    JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.firstname')), ' ',
                    JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.lastname'))
                ) LIKE ?
                LIMIT ?
            ]], { like, limit }) or {}
            for _, r in ipairs(rows) do out[#out + 1] = r.citizenid end
        elseif framework.name == 'esx' then
            local rows = MySQL.query.await([[
                SELECT identifier FROM users
                WHERE CONCAT(firstname, ' ', lastname) LIKE ?
                LIMIT ?
            ]], { like, limit }) or {}
            for _, r in ipairs(rows) do out[#out + 1] = r.identifier end
        end
    end)
    return out
end

-- ---------------------------------------------------------------------------
-- Player search + overview
-- ---------------------------------------------------------------------------

---Escapes LIKE wildcards in user input.
---@param s string raw query text
---@return string escaped
local function escapeLike(s)
    return (s:gsub('[%%_\\]', '\\%0'))
end

---Searches phone-side data for players: citizenid prefix, phone number digits, contact-card
---name, Birdy handle/display name, app-account username, and the framework character name.
---Merged results are offset-paginated: every branch is capped at `offset + limit + 1` rows,
---so page depth stays bounded while the merge dedupes across sources.
---@param query string raw search text (>= 2 chars, enforced by the caller)
---@param limit integer page size
---@param offset integer merged rows to skip (previous pages)
---@return table[] hits { citizenid, matchedOn }, integer|nil nextOffset
function store.searchPlayers(query, limit, offset)
    local like   = '%' .. escapeLike(query) .. '%'
    local digits = util.digits(query)
    local depth  = offset + limit + 1
    local hits, order = {}, {}

    local function add(cid, label)
        if not cid or cid == '' then return end
        if hits[cid] then return end
        hits[cid] = label
        order[#order + 1] = cid
    end

    local settingsRows = MySQL.query.await([[
        SELECT citizenid, phone_number, card_name FROM phone_settings
        WHERE citizenid LIKE ?
           OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone_number,'-',''),' ',''),'(',''),')',''),'+',''),'.','') LIKE ?)
           OR card_name LIKE ?
        ORDER BY updated_at DESC
        LIMIT ?
    ]], { escapeLike(query) .. '%', digits, '%' .. digits .. '%', like, depth }) or {}
    for _, r in ipairs(settingsRows) do
        add(r.citizenid, r.card_name and r.card_name ~= '' and 'card' or 'phone')
    end

    local birdyRows = MySQL.query.await([[
        SELECT citizenid, handle FROM phone_birdy_profiles
        WHERE handle LIKE ? OR display_name LIKE ?
        LIMIT ?
    ]], { like, like, depth }) or {}
    for _, r in ipairs(birdyRows) do add(r.citizenid, '@' .. r.handle) end

    local accountRows = MySQL.query.await([[
        SELECT s.citizenid, a.app, a.username
        FROM phone_app_accounts a
        JOIN phone_app_sessions s ON s.account_id = a.id
        WHERE a.username LIKE ?
        LIMIT ?
    ]], { like, depth }) or {}
    for _, r in ipairs(accountRows) do add(r.citizenid, ('%s:%s'):format(r.app, r.username)) end

    for _, cid in ipairs(store.searchByName(like, depth)) do add(cid, 'name') end

    local out = {}
    for i = offset + 1, math.min(#order, offset + limit) do
        out[#out + 1] = { citizenid = order[i], matchedOn = hits[order[i]] }
    end
    local nextOffset = #order > offset + limit and (offset + limit) or nil
    return out, nextOffset
end

---Most recently active phones, newest first, keyset-paginated on (updated_at, citizenid) - the
---Players page's default listing before any search. Read-only.
---@param cursor string|nil opaque "ts:cid" cursor from the previous page
---@param limit integer page size (already clamped)
---@return table[] hits { citizenid, matchedOn }, string|nil nextCursor
function store.listRecentPlayers(cursor, limit)
    local ts, cid
    if type(cursor) == 'string' and cursor ~= '' then
        ts, cid = cursor:match('^(%d+):(.+)$')
        ts = tonumber(ts)
    end

    local rows = MySQL.query.await([[
        SELECT citizenid, UNIX_TIMESTAMP(updated_at) AS ts
        FROM phone_settings
        WHERE (? IS NULL OR updated_at < FROM_UNIXTIME(?)
               OR (updated_at = FROM_UNIXTIME(?) AND citizenid < ?))
        ORDER BY updated_at DESC, citizenid DESC
        LIMIT ?
    ]], { ts, ts, ts, cid, limit + 1 }) or {}

    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        local last = rows[limit]
        nextCursor = ('%d:%s'):format(last.ts, last.citizenid)
    end
    local out = {}
    for i, r in ipairs(rows) do
        out[i] = { citizenid = r.citizenid, matchedOn = 'recent' }
    end
    return out, nextCursor
end

---SIM registry page: newest first, filtered by number digits / identity / activator citizenid.
---@param q string search text ('' lists everything)
---@param limit integer page size
---@param offset integer rows to skip
---@return table[] rows { number, identity, ownerCid, createdAt }
---@return number|nil nextCursor offset for the next page, nil on the last one
function store.listSims(q, limit, offset)
    local rows
    if q == '' then
        rows = MySQL.query.await([[
            SELECT number, identity, owner_cid AS ownerCid, UNIX_TIMESTAMP(created_at) AS createdAt
            FROM phone_sim_cards ORDER BY created_at DESC LIMIT ? OFFSET ?
        ]], { limit, offset })
    else
        local digits = q:gsub('%D', '')
        local like = '%' .. q .. '%'
        rows = MySQL.query.await([[
            SELECT number, identity, owner_cid AS ownerCid, UNIX_TIMESTAMP(created_at) AS createdAt
            FROM phone_sim_cards
            WHERE number LIKE ? OR identity LIKE ? OR owner_cid LIKE ?
            ORDER BY created_at DESC LIMIT ? OFFSET ?
        ]], { '%' .. (digits ~= '' and digits or q) .. '%', like, like, limit, offset })
    end
    rows = rows or {}
    return rows, #rows == limit and (offset + limit) or nil
end

---SIMs registered to a character: activated by them or opening their bound profile.
---@param cid string target citizenid
---@return table[] sims { number, identity, owner_cid, created_at }
function store.simsFor(cid)
    local rows = MySQL.query.await([[
        SELECT number, identity, owner_cid AS ownerCid, UNIX_TIMESTAMP(created_at) AS createdAt
        FROM phone_sim_cards
        WHERE owner_cid = ? OR identity = ?
        ORDER BY created_at ASC
    ]], { cid, cid })
    return rows or {}
end

---One player's full phone overview: settings, per-app content counts, accounts + sessions, and
---the Birdy profile. Read-only.
---@param cid string target citizenid
---@return table|nil overview nil when the player has no phone footprint at all
function store.playerOverview(cid)
    local settings = MySQL.single.await([[
        SELECT phone_number, passcode, face_id, installed_apps, locale, theme, dark_theme,
               card_name, card_email, airplane_mode, UNIX_TIMESTAMP(updated_at) AS updated_at
        FROM phone_settings WHERE citizenid = ?
    ]], { cid })

    local accounts = MySQL.query.await([[
        SELECT a.id, a.app, a.username, a.display_name, a.email, a.phone,
               UNIX_TIMESTAMP(a.created_at) AS created_at
        FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE s.citizenid = ?
        ORDER BY a.app, a.username
    ]], { cid }) or {}

    local birdy = MySQL.single.await([[
        SELECT handle, display_name, bio, verified, logged_in, protected,
               UNIX_TIMESTAMP(created_at) AS created_at
        FROM phone_birdy_profiles WHERE citizenid = ?
    ]], { cid })

    if not settings and #accounts == 0 and not birdy then return nil end

    local function count(sql)
        return tonumber(MySQL.scalar.await(sql, { cid })) or 0
    end
    local counts = {
        birdyPosts = count('SELECT COUNT(*) FROM phone_birdy_posts WHERE author_cid = ?'),
        messages   = count('SELECT COUNT(*) FROM phone_messages WHERE citizenid = ?'),
        calls      = count('SELECT COUNT(*) FROM phone_calls WHERE citizenid = ?'),
        photos     = count('SELECT COUNT(*) FROM phone_photos WHERE citizenid = ?'),
        contacts   = count('SELECT COUNT(*) FROM phone_contacts WHERE citizenid = ?'),
    }

    local accountList = {}
    for i, a in ipairs(accounts) do
        accountList[i] = {
            id          = a.id,
            app         = a.app,
            username    = a.username,
            displayName = a.display_name,
            email       = a.email,
            phone       = a.phone,
            createdAt   = tonumber(a.created_at),
        }
    end

    return {
        settings = settings and {
            phoneNumber  = settings.phone_number,
            hasPasscode  = settings.passcode ~= nil and settings.passcode ~= '',
            faceId       = util.truthy(settings.face_id),
            airplane     = util.truthy(settings.airplane_mode),
            locale       = settings.locale,
            theme        = settings.theme,
            darkTheme    = settings.dark_theme,
            cardName     = settings.card_name,
            cardEmail    = settings.card_email,
            installedApps = json.decode(settings.installed_apps or '[]') or {},
            updatedAt    = tonumber(settings.updated_at),
        } or nil,
        accounts = accountList,
        birdy = birdy and {
            handle      = birdy.handle,
            displayName = birdy.display_name,
            bio         = birdy.bio,
            verified    = util.truthy(birdy.verified),
            loggedIn    = util.truthy(birdy.logged_in),
            protected   = util.truthy(birdy.protected),
            createdAt   = tonumber(birdy.created_at),
        } or nil,
        counts = counts,
    }
end

-- ---------------------------------------------------------------------------
-- Birdy moderation reads
-- ---------------------------------------------------------------------------

---Splits an opaque "ts:id" cursor. nil/'' means first page.
---@param cursor string|nil
---@return integer|nil ts, string|nil id
local function splitCursor(cursor)
    if type(cursor) ~= 'string' or cursor == '' then return nil, nil end
    local ts, id = cursor:match('^(%d+):(.+)$')
    return tonumber(ts), id
end

---Maps raw post rows to the admin UI shape and derives the next cursor.
---@param rows table[] raw rows including ts
---@param limit integer page size
---@return table[] posts, string|nil nextCursor
local function shapePosts(rows, limit)
    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        local last = rows[limit]
        nextCursor = ('%d:%s'):format(last.ts, last.id)
    end
    local posts = {}
    for i, r in ipairs(rows) do
        posts[i] = {
            id        = r.id,
            authorCid = r.author_cid,
            body      = r.body,
            parentId  = r.parent_id,
            images    = json.decode(r.images or 'null'),
            views     = tonumber(r.views) or 0,
            likes     = tonumber(r.likes) or 0,
            replies   = tonumber(r.replies) or 0,
            handle    = r.handle,
            display   = r.display_name,
            verified  = util.truthy(r.verified),
            createdAt = tonumber(r.ts),
        }
    end
    return posts, nextCursor
end

---Recent Birdy posts across all players, newest first, keyset-paginated on (created_at, id).
---Optional text filter over the body and the author handle. Read-only.
---@param cursor string|nil opaque "ts:id" cursor from the previous page
---@param limit integer page size (already clamped)
---@param query string|nil optional filter text
---@param authorCid string|nil restrict to one author's posts
---@return table[] posts, string|nil nextCursor
function store.listBirdyPosts(cursor, limit, query, authorCid)
    local ts, id = splitCursor(cursor)
    local like = (type(query) == 'string' and query ~= '') and ('%' .. escapeLike(query) .. '%') or nil

    local rows = MySQL.query.await([[
        SELECT p.id, p.author_cid, p.body, p.parent_id, p.images, p.views,
               UNIX_TIMESTAMP(p.created_at) AS ts,
               pr.handle, pr.display_name, pr.verified,
               (SELECT COUNT(*) FROM phone_birdy_likes l WHERE l.post_id = p.id) AS likes,
               (SELECT COUNT(*) FROM phone_birdy_posts c WHERE c.parent_id = p.id) AS replies
        FROM phone_birdy_posts p
        LEFT JOIN phone_birdy_profiles pr ON pr.citizenid = p.author_cid
        WHERE (? IS NULL OR p.author_cid = ?)
          AND (? IS NULL OR p.body LIKE ? OR pr.handle LIKE ?)
          AND (? IS NULL OR p.created_at < FROM_UNIXTIME(?)
               OR (p.created_at = FROM_UNIXTIME(?) AND p.id < ?))
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?
    ]], { authorCid, authorCid, like, like, like, ts, ts, ts, id, limit + 1 }) or {}

    return shapePosts(rows, limit)
end

---Deletes one Birdy post plus its direct replies, all their likes, and every notification
---pointing at them.
---@param id string post row id
---@return integer removed total rows removed
function store.deleteBirdyPost(id)
    local removed = 0
    local function del(sql, params)
        removed = removed + (tonumber(MySQL.update.await(sql, params)) or 0)
    end
    del('DELETE FROM phone_birdy_likes WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE parent_id = ?)', { id })
    del('DELETE FROM phone_birdy_notifications WHERE post_id IN (SELECT id FROM phone_birdy_posts WHERE parent_id = ?)', { id })
    del('DELETE FROM phone_birdy_posts WHERE parent_id = ?', { id })
    del('DELETE FROM phone_birdy_likes WHERE post_id = ?', { id })
    del('DELETE FROM phone_birdy_notifications WHERE post_id = ?', { id })
    del('DELETE FROM phone_birdy_posts WHERE id = ?', { id })
    return removed
end

---Sets the verified flag on a Birdy profile.
---@param cid string profile owner citizenid
---@param verified boolean
---@return integer affected
function store.setBirdyVerified(cid, verified)
    return tonumber(MySQL.update.await(
        'UPDATE phone_birdy_profiles SET verified = ? WHERE citizenid = ?',
        { verified and 1 or 0, cid })) or 0
end

---Clears the legacy logged_in flag on a Birdy profile (used on admin force-logout).
---@param cid string profile owner citizenid
function store.clearBirdyLoggedIn(cid)
    MySQL.update.await('UPDATE phone_birdy_profiles SET logged_in = 0 WHERE citizenid = ?', { cid })
end

---Clears a player's passcode and Face ID so they can get back into a locked phone.
---@param cid string target citizenid
---@return integer affected
function store.resetPasscode(cid)
    return tonumber(MySQL.update.await(
        'UPDATE phone_settings SET passcode = NULL, face_id = 0 WHERE citizenid = ?', { cid })) or 0
end

-- ---------------------------------------------------------------------------
-- Comms reads (messages + calls), keyset-paginated
-- ---------------------------------------------------------------------------

---One player's messages, newest first, keyset-paginated on (created_at, id). Read-only.
---@param cid string target citizenid
---@param cursor string|nil opaque "ts:id" cursor
---@param limit integer page size (already clamped)
---@return table[] messages, string|nil nextCursor
function store.listMessagesFor(cid, cursor, limit)
    local ts, id = splitCursor(cursor)
    local rows = MySQL.query.await([[
        SELECT id, conversation, sender, direction, kind, body, created_at AS ts
        FROM phone_messages
        WHERE citizenid = ?
          AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
        ORDER BY created_at DESC, id DESC
        LIMIT ?
    ]], { cid, ts, ts, ts, id, limit + 1 }) or {}

    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        nextCursor = ('%d:%s'):format(rows[limit].ts, rows[limit].id)
    end
    local out = {}
    for i, r in ipairs(rows) do
        out[i] = {
            id           = r.id,
            conversation = r.conversation,
            sender       = r.sender,
            direction    = r.direction,
            kind         = r.kind,
            body         = r.body,
            createdAt    = tonumber(r.ts),
        }
    end
    return out, nextCursor
end

---One player's call log, newest first, keyset-paginated on (called_at, id). Read-only.
---@param cid string target citizenid
---@param cursor string|nil opaque "ts:id" cursor
---@param limit integer page size (already clamped)
---@return table[] calls, string|nil nextCursor
function store.listCallsFor(cid, cursor, limit)
    local ts, id = splitCursor(cursor)
    local rows = MySQL.query.await([[
        SELECT id, `number`, name, direction, duration, called_at AS ts
        FROM phone_calls
        WHERE citizenid = ?
          AND (? IS NULL OR called_at < ? OR (called_at = ? AND id < ?))
        ORDER BY called_at DESC, id DESC
        LIMIT ?
    ]], { cid, ts, ts, ts, id, limit + 1 }) or {}

    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        nextCursor = ('%d:%s'):format(rows[limit].ts, rows[limit].id)
    end
    local out = {}
    for i, r in ipairs(rows) do
        out[i] = {
            id        = r.id,
            number    = r.number,
            name      = r.name,
            direction = r.direction,
            duration  = tonumber(r.duration) or 0,
            calledAt  = tonumber(r.ts),
        }
    end
    return out, nextCursor
end

-- ---------------------------------------------------------------------------
-- Generic per-app content browser. Every adapter returns rows in one shape:
-- { id, ts, authorCid?, label?, title?, body, kind?, images? } keyset-paged
-- newest-first on (ts, id) with an opaque "ts:id" cursor.
-- ---------------------------------------------------------------------------

---Resolves a photogram/cherry account username to the citizenid signed into it (subquery
---fragment used inside the adapters below).
local SESSION_CID = [[(
    SELECT s.citizenid FROM phone_app_sessions s
    JOIN phone_app_accounts a ON a.id = s.account_id
    WHERE a.app = '%s' AND a.username = %s
    LIMIT 1
)]]

-- Adapter shape: { deletable: boolean, list: fun(ts, id, like, limit): rows, delete?: fun(id): removed }.
---@type table<string, table>
local CONTENT = {}

CONTENT.messages = {
    deletable = false,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, created_at AS ts, citizenid AS author_cid, conversation, direction, kind, body
            FROM phone_messages
            WHERE direction = 'outgoing'
              AND (? IS NULL OR body LIKE ? OR conversation LIKE ?)
              AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
}

CONTENT.darkchat = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, created_at AS ts, citizenid AS author_cid, room_id, author, kind, body
            FROM darkchat_messages
            WHERE (? IS NULL OR body LIKE ? OR author LIKE ? OR room_id LIKE ?)
              AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    delete = function(id)
        MySQL.update.await('DELETE FROM darkchat_reactions WHERE message_id = ?', { id })
        return tonumber(MySQL.update.await('DELETE FROM darkchat_messages WHERE id = ?', { id })) or 0
    end,
}

CONTENT.photogram = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await(([[
            SELECT p.id, p.created_at AS ts, %s AS author_cid, p.author, p.caption AS body, p.images
            FROM phone_photogram_posts p
            WHERE (? IS NULL OR p.caption LIKE ? OR p.author LIKE ?)
              AND (? IS NULL OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT ?
        ]]):format(SESSION_CID:format('photogram', 'p.author')),
            { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    delete = function(id)
        MySQL.update.await('DELETE FROM phone_photogram_comment_likes WHERE comment_id IN (SELECT id FROM phone_photogram_comments WHERE post_id = ?)', { id })
        MySQL.update.await('DELETE FROM phone_photogram_comments WHERE post_id = ?', { id })
        MySQL.update.await('DELETE FROM phone_photogram_likes WHERE post_id = ?', { id })
        MySQL.update.await('DELETE FROM phone_photogram_saves WHERE post_id = ?', { id })
        return tonumber(MySQL.update.await('DELETE FROM phone_photogram_posts WHERE id = ?', { id })) or 0
    end,
}

CONTENT.cherry = {
    deletable = false,
    list = function(ts, id, like, limit)
        return MySQL.query.await(([[
            SELECT p.username AS id, p.updated_at AS ts, %s AS author_cid, p.username,
                   p.name, p.age, p.gender, p.about AS body
            FROM phone_cherry_profiles p
            WHERE (? IS NULL OR p.username LIKE ? OR p.name LIKE ? OR p.about LIKE ?)
              AND (? IS NULL OR p.updated_at < ? OR (p.updated_at = ? AND p.username < ?))
            ORDER BY p.updated_at DESC, p.username DESC
            LIMIT ?
        ]]):format(SESSION_CID:format('cherry', 'p.username')),
            { like, like, like, like, ts, ts, ts, id, limit }) or {}
    end,
}

CONTENT.gallery = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, UNIX_TIMESTAMP(created_at) AS ts, citizenid AS author_cid, url, favorite
            FROM phone_photos
            WHERE (? IS NULL OR citizenid LIKE ?)
              AND (? IS NULL OR created_at < FROM_UNIXTIME(?)
                   OR (created_at = FROM_UNIXTIME(?) AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, ts, ts, ts, id, limit }) or {}
    end,
    delete = function(id)
        MySQL.update.await('DELETE FROM phone_photo_album_items WHERE photo_id = ?', { id })
        return tonumber(MySQL.update.await('DELETE FROM phone_photos WHERE id = ?', { id })) or 0
    end,
}

---Shared adapter for the two classifieds-style tables (marketplace_listings / pages_posts).
---@param tbl string table name
---@return table adapter
local function classifieds(tbl)
    return {
        deletable = true,
        list = function(ts, id, like, limit)
            return MySQL.query.await(([[
                SELECT id, created_at AS ts, citizenid AS author_cid, title, body, price, images, image
                FROM %s
                WHERE (? IS NULL OR title LIKE ? OR body LIKE ?)
                  AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            ]]):format(tbl), { like, like, like, ts, ts, ts, id, limit }) or {}
        end,
        delete = function(id)
            return tonumber(MySQL.update.await(('DELETE FROM %s WHERE id = ?'):format(tbl), { id })) or 0
        end,
    }
end
CONTENT.marketplace = classifieds('marketplace_listings')
CONTENT.pages       = classifieds('pages_posts')

---Whether an app id has a content adapter, and whether its rows can be deleted.
---@param app string
---@return boolean known, boolean deletable
function store.contentInfo(app)
    local adapter = CONTENT[app]
    if not adapter then return false, false end
    return true, adapter.deletable
end

---One page of an app's content, normalized. Read-only.
---@param app string adapter key (validated by the caller)
---@param cursor string|nil opaque "ts:id" cursor
---@param limit integer page size (already clamped)
---@param query string|nil optional filter text
---@return table[] items, string|nil nextCursor
function store.listContent(app, cursor, limit, query)
    local adapter = CONTENT[app]
    local ts, id = splitCursor(cursor)
    local like = (type(query) == 'string' and query ~= '') and ('%' .. escapeLike(query) .. '%') or nil

    local rows = adapter.list(ts, id, like, limit + 1)
    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        local last = rows[limit]
        nextCursor = ('%d:%s'):format(tonumber(last.ts) or 0, last.id)
    end

    local items = {}
    for i, r in ipairs(rows) do
        local images = nil
        if r.images then
            local decoded = json.decode(r.images)
            if type(decoded) == 'table' then images = #decoded end
        end
        if (not images or images == 0) and r.image then images = 1 end
        items[i] = {
            id        = tostring(r.id),
            createdAt = tonumber(r.ts),
            authorCid = r.author_cid,
            kind      = r.kind,
            title     = r.title,
            body      = r.body,
            images    = images,
            imageUrl  = r.url,
            price     = r.price and tonumber(r.price) or nil,
            label     = r.room_id and ('#' .. r.room_id .. ' as ' .. tostring(r.author))
                or (r.author and ('@' .. r.author))
                or (r.username and ('@' .. r.username .. (r.name and (' · ' .. r.name .. ', ' .. tostring(r.age)) or '')))
                or (r.conversation and ((r.conversation:sub(1, 2) == 'g-') and ('group ' .. r.conversation) or ('to ' .. util.formatNumber(r.conversation))))
                or nil,
        }
    end
    return items, nextCursor
end

---Deletes one content row (plus its per-app satellites).
---@param app string adapter key (validated + deletable-checked by the caller)
---@param id string row id
---@return integer removed
function store.deleteContent(app, id)
    return CONTENT[app].delete(id)
end

-- ---------------------------------------------------------------------------
-- Audit + dashboard reads
-- ---------------------------------------------------------------------------

---Audit log, newest first, keyset-paginated by row id. Read-only.
---@param cursor integer|nil last row id of the previous page
---@param limit integer page size (already clamped)
---@return table[] rows, integer|nil nextCursor
function store.listAudit(cursor, limit)
    local rows = MySQL.query.await([[
        SELECT id, admin_cid, admin_name, action, target_cid, detail, created_at
        FROM phone_admin_audit
        WHERE (? IS NULL OR id < ?)
        ORDER BY id DESC
        LIMIT ?
    ]], { cursor, cursor, limit + 1 }) or {}

    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        nextCursor = rows[limit].id
    end
    local out = {}
    for i, r in ipairs(rows) do
        out[i] = {
            id        = r.id,
            adminCid  = r.admin_cid,
            adminName = r.admin_name,
            action    = r.action,
            targetCid = r.target_cid,
            detail    = r.detail,
            createdAt = tonumber(r.created_at),
        }
    end
    return out, nextCursor
end

---Whole-table dashboard counts. Called only when the dashboard loads.
---@return table stats
function store.stats()
    local function count(sql)
        return tonumber(MySQL.scalar.await(sql)) or 0
    end
    return {
        phones      = count('SELECT COUNT(*) FROM phone_settings'),
        appAccounts = count('SELECT COUNT(*) FROM phone_app_accounts'),
        birdyPosts  = count('SELECT COUNT(*) FROM phone_birdy_posts'),
        messages    = count('SELECT COUNT(*) FROM phone_messages'),
        activeMutes = count(('SELECT COUNT(*) FROM phone_admin_mutes WHERE expires_at IS NULL OR expires_at > %d'):format(os.time())),
    }
end

return store
