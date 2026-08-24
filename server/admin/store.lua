---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx').
local framework = require 'bridge.shared.framework'
---@type table Shared server helpers (server.util): digits + index bootstrap.
local util = require 'server.util'

---@type table Store module; the table returned at end of file.
local store = {}

---@type string Resolves an app account username to the citizenid signed into it; formatted with
---(app, username expression) wherever a content row carries an account rather than a character.
local SESSION_CID = [[(
    SELECT s.citizenid FROM phone_app_sessions s
    JOIN phone_app_accounts a ON a.id = s.account_id
    WHERE a.app = '%s' AND a.username = %s
    LIMIT 1
)]]

---@type string Subquery for every Squawk handle one character is tied to: the accounts they
---created plus the one they are signed into. Takes the citizenid twice.
local BIRDY_HANDLES_FOR_CID = [[
    SELECT handle FROM phone_birdy_profiles WHERE citizenid = ?
    UNION
    SELECT a.username FROM phone_app_sessions s
    JOIN phone_app_accounts a ON a.id = s.account_id
    WHERE a.app = 'birdy' AND s.citizenid = ?
]]

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

    -- Squawk is multi-account: a character can hold several profiles, and can also be signed into
    -- one another character created, so both sides of the link are listed.
    -- logged_in is derived from live sessions, not the profile column: that column is a legacy
    -- per-account flag and cannot say which characters are in the account right now.
    local birdy = MySQL.query.await(([[
        SELECT p.handle, p.display_name, p.bio, p.verified, p.verified_type, p.protected,
               UNIX_TIMESTAMP(p.created_at) AS created_at,
               EXISTS(SELECT 1 FROM phone_app_sessions s
                      JOIN phone_app_accounts a ON a.id = s.account_id
                      WHERE a.app = 'birdy' AND a.username = p.handle) AS logged_in
        FROM phone_birdy_profiles p WHERE p.handle IN (%s) ORDER BY p.created_at
    ]]):format(BIRDY_HANDLES_FOR_CID), { cid, cid }) or {}

    if not settings and #accounts == 0 and #birdy == 0 then return nil end

    local function count(sql)
        return tonumber(MySQL.scalar.await(sql, { cid })) or 0
    end

    local handles = {}
    for i = 1, #birdy do handles[i] = birdy[i].handle end
    local birdyPosts = 0
    if #handles > 0 then
        local marks = {}
        for i = 1, #handles do marks[i] = '?' end
        birdyPosts = tonumber(MySQL.scalar.await(
            ('SELECT COUNT(*) FROM phone_birdy_posts WHERE author IN (%s)'):format(table.concat(marks, ',')),
            handles)) or 0
    end

    local counts = {
        birdyPosts = birdyPosts,
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

    local birdyList = {}
    for i, b in ipairs(birdy) do
        birdyList[i] = {
            handle      = b.handle,
            displayName = b.display_name,
            bio         = b.bio,
            verified    = util.truthy(b.verified),
            verifiedType = b.verified_type,
            loggedIn    = util.truthy(b.logged_in),
            protected   = util.truthy(b.protected),
            createdAt   = tonumber(b.created_at),
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
        birdy = birdyList,
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
            verifiedType = r.verified_type,
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

    local rows = MySQL.query.await(([[
        SELECT p.id, p.author, p.body, p.parent_id, p.images, p.views,
               UNIX_TIMESTAMP(p.created_at) AS ts,
               pr.handle, pr.display_name, pr.verified, pr.verified_type,
               %s AS author_cid,
               (SELECT COUNT(*) FROM phone_birdy_likes l WHERE l.post_id = p.id) AS likes,
               (SELECT COUNT(*) FROM phone_birdy_posts c WHERE c.parent_id = p.id) AS replies
        FROM phone_birdy_posts p
        LEFT JOIN phone_birdy_profiles pr ON pr.handle = p.author
        WHERE (? IS NULL OR p.author IN (%s))
          AND (? IS NULL OR p.body LIKE ? OR pr.handle LIKE ?)
          AND (? IS NULL OR p.created_at < FROM_UNIXTIME(?)
               OR (p.created_at = FROM_UNIXTIME(?) AND p.id < ?))
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ?
    ]]):format(SESSION_CID:format('birdy', 'p.author'), BIRDY_HANDLES_FOR_CID),
        { authorCid, authorCid, authorCid, like, like, like, ts, ts, ts, id, limit + 1 }) or {}

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

---Sets the verified badge on one Birdy profile. The type is written as-is, so callers must have
---checked it against verify.TYPES first - an unknown string would store fine and then render as
---the blue fallback, which is exactly the wrong badge to hand out by accident.
---@param handle string profile handle
---@param vtype string|nil badge type, or nil to clear the badge
---@return integer affected
function store.setBirdyVerified(handle, vtype)
    return tonumber(MySQL.update.await(
        'UPDATE phone_birdy_profiles SET verified = ?, verified_type = ? WHERE handle = ?',
        { vtype and 1 or 0, vtype, handle })) or 0
end

---Clears the legacy logged_in flag on whichever Birdy profile this character is signed into, so
---the one-time credential import cannot sign them back in on a later boot. Call before dropping
---the engine session, or the lookup finds nothing.
---@param cid string citizenid being signed out
function store.clearBirdyLoggedIn(cid)
    MySQL.update.await([[
        UPDATE phone_birdy_profiles SET logged_in = 0
        WHERE handle IN (
            SELECT a.username FROM phone_app_sessions s
            JOIN phone_app_accounts a ON a.id = s.account_id
            WHERE a.app = 'birdy' AND s.citizenid = ?
        )
    ]], { cid })
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

-- Adapter shape: { deletable: boolean, list: fun(ts, id, like, limit): rows, delete?: fun(id): removed,
-- thread?: { list: fun(id, limit): rows, delete?: fun(id): removed }, shape?: fun(item, row) }.
-- `thread` is what one row expands into: the replies under a post, or the surrounding room and
-- conversation lines around a message, which is the context a single line can never be judged
-- without. `shape` corrects the normalized row afterwards, for an app whose `url` column holds
-- audio rather than a picture, or a count only that app knows how to derive.
---@type table<string, table>
local CONTENT = {}

---@type integer Thread rows returned before the anchor row.
local THREAD_BEFORE = 40
---@type integer Thread rows returned after it, so the anchor stays near the end of a long log.
local THREAD_AFTER = 15

---Deletes one Dark Chat message and its reactions. Shared by the adapter's row delete and its
---thread delete: both remove a row of the same table, so they stay one implementation.
---@param id string|number message row id
---@return integer removed
local function deleteDarkchatMessage(id)
    MySQL.update.await('DELETE FROM darkchat_reactions WHERE message_id = ?', { id })
    return tonumber(MySQL.update.await('DELETE FROM darkchat_messages WHERE id = ?', { id })) or 0
end

CONTENT.messages = {
    deletable = false,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, created_at AS ts, citizenid AS author_cid, conversation, direction, kind, body, meta
            FROM phone_messages
            WHERE direction = 'outgoing'
              AND (? IS NULL OR body LIKE ? OR conversation LIKE ?)
              AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    thread = {
        -- Both sides of the conversation this text belongs to, incoming included: the list itself
        -- only ever shows outgoing lines, which read as half a conversation.
        list = function(id)
            local anchor = MySQL.single.await(
                'SELECT citizenid, conversation, created_at FROM phone_messages WHERE id = ?', { id })
            if not anchor then return {} end

            local before = MySQL.query.await([[
                SELECT id, created_at AS ts, citizenid AS author_cid, conversation, direction, kind, body, meta
                FROM phone_messages
                WHERE citizenid = ? AND conversation = ?
                  AND (created_at < ? OR (created_at = ? AND id <= ?))
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            ]], { anchor.citizenid, anchor.conversation, anchor.created_at, anchor.created_at, id, THREAD_BEFORE }) or {}

            local after = MySQL.query.await([[
                SELECT id, created_at AS ts, citizenid AS author_cid, conversation, direction, kind, body, meta
                FROM phone_messages
                WHERE citizenid = ? AND conversation = ?
                  AND (created_at > ? OR (created_at = ? AND id > ?))
                ORDER BY created_at ASC, id ASC
                LIMIT ?
            ]], { anchor.citizenid, anchor.conversation, anchor.created_at, anchor.created_at, id, THREAD_AFTER }) or {}

            local out = {}
            for i = #before, 1, -1 do out[#out + 1] = before[i] end
            for _, r in ipairs(after) do out[#out + 1] = r end
            return out
        end,
    },
}

CONTENT.darkchat = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, created_at AS ts, citizenid AS author_cid, room_id, author, kind, body, meta,
                   (SELECT COUNT(*) FROM darkchat_reactions r WHERE r.message_id = darkchat_messages.id) AS likes
            FROM darkchat_messages
            WHERE (? IS NULL OR body LIKE ? OR author LIKE ? OR room_id LIKE ?)
              AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    delete = deleteDarkchatMessage,
    thread = {
        list = function(id)
            local anchor = MySQL.single.await(
                'SELECT room_id, created_at FROM darkchat_messages WHERE id = ?', { id })
            if not anchor then return {} end

            local before = MySQL.query.await([[
                SELECT id, created_at AS ts, citizenid AS author_cid, room_id, author, kind, body, meta
                FROM darkchat_messages
                WHERE room_id = ? AND (created_at < ? OR (created_at = ? AND id <= ?))
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            ]], { anchor.room_id, anchor.created_at, anchor.created_at, id, THREAD_BEFORE }) or {}

            local after = MySQL.query.await([[
                SELECT id, created_at AS ts, citizenid AS author_cid, room_id, author, kind, body, meta
                FROM darkchat_messages
                WHERE room_id = ? AND (created_at > ? OR (created_at = ? AND id > ?))
                ORDER BY created_at ASC, id ASC
                LIMIT ?
            ]], { anchor.room_id, anchor.created_at, anchor.created_at, id, THREAD_AFTER }) or {}

            local out = {}
            for i = #before, 1, -1 do out[#out + 1] = before[i] end
            for _, r in ipairs(after) do out[#out + 1] = r end
            return out
        end,
        delete = deleteDarkchatMessage,
    },
}

CONTENT.photogram = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await(([[
            SELECT p.id, p.created_at AS ts, %s AS author_cid, p.author, p.caption AS body, p.images,
                   (SELECT COUNT(*) FROM phone_photogram_likes l WHERE l.post_id = p.id) AS likes,
                   (SELECT COUNT(*) FROM phone_photogram_comments c WHERE c.post_id = p.id) AS comments
            FROM phone_photogram_posts p
            WHERE (? IS NULL OR p.caption LIKE ? OR p.author LIKE ?)
              AND (? IS NULL OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT ?
        ]]):format(SESSION_CID:format('photogram', 'p.author')),
            { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    thread = {
        list = function(id, limit)
            return MySQL.query.await(([[
                SELECT c.id, c.created_at AS ts, %s AS author_cid, c.author, c.body, c.gif_url,
                       (SELECT COUNT(*) FROM phone_photogram_comment_likes l WHERE l.comment_id = c.id) AS likes
                FROM phone_photogram_comments c
                WHERE c.post_id = ?
                ORDER BY c.created_at ASC, c.id ASC
                LIMIT ?
            ]]):format(SESSION_CID:format('photogram', 'c.author')), { id, limit }) or {}
        end,
        delete = function(id)
            MySQL.update.await('DELETE FROM phone_photogram_comment_likes WHERE comment_id = ?', { id })
            return tonumber(MySQL.update.await('DELETE FROM phone_photogram_comments WHERE id = ?', { id })) or 0
        end,
    },
    delete = function(id)
        MySQL.update.await('DELETE FROM phone_photogram_comment_likes WHERE comment_id IN (SELECT id FROM phone_photogram_comments WHERE post_id = ?)', { id })
        MySQL.update.await('DELETE FROM phone_photogram_comments WHERE post_id = ?', { id })
        MySQL.update.await('DELETE FROM phone_photogram_likes WHERE post_id = ?', { id })
        MySQL.update.await('DELETE FROM phone_photogram_saves WHERE post_id = ?', { id })
        return tonumber(MySQL.update.await('DELETE FROM phone_photogram_posts WHERE id = ?', { id })) or 0
    end,
}

CONTENT.vibez = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await(([[
            SELECT p.id, p.created_at AS ts, %s AS author_cid, p.author, p.caption AS body,
                   p.sound AS title, 'video' AS kind, p.video, p.thumb, p.views,
                   (SELECT COUNT(*) FROM phone_vibez_likes l WHERE l.post_id = p.id) AS likes,
                   (SELECT COUNT(*) FROM phone_vibez_comments c WHERE c.post_id = p.id) AS comments
            FROM phone_vibez_posts p
            WHERE (? IS NULL OR p.caption LIKE ? OR p.author LIKE ?)
              AND (? IS NULL OR p.created_at < ? OR (p.created_at = ? AND p.id < ?))
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT ?
        ]]):format(SESSION_CID:format('vibez', 'p.author')),
            { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    thread = {
        list = function(id, limit)
            return MySQL.query.await(([[
                SELECT c.id, c.created_at AS ts, %s AS author_cid, c.author, c.body, c.gif_url,
                       (SELECT COUNT(*) FROM phone_vibez_comment_likes l WHERE l.comment_id = c.id) AS likes
                FROM phone_vibez_comments c
                WHERE c.post_id = ?
                ORDER BY c.created_at ASC, c.id ASC
                LIMIT ?
            ]]):format(SESSION_CID:format('vibez', 'c.author')), { id, limit }) or {}
        end,
        delete = function(id)
            MySQL.update.await('DELETE FROM phone_vibez_comment_likes WHERE comment_id = ?', { id })
            return tonumber(MySQL.update.await('DELETE FROM phone_vibez_comments WHERE id = ?', { id })) or 0
        end,
    },
    delete = function(id)
        MySQL.update.await('DELETE FROM phone_vibez_comment_likes WHERE comment_id IN (SELECT id FROM phone_vibez_comments WHERE post_id = ?)', { id })
        MySQL.update.await('DELETE FROM phone_vibez_comments WHERE post_id = ?', { id })
        MySQL.update.await('DELETE FROM phone_vibez_likes WHERE post_id = ?', { id })
        MySQL.update.await('DELETE FROM phone_vibez_saves WHERE post_id = ?', { id })
        return tonumber(MySQL.update.await('DELETE FROM phone_vibez_posts WHERE id = ?', { id })) or 0
    end,
}

CONTENT.cherry = {
    deletable = false,
    list = function(ts, id, like, limit)
        return MySQL.query.await(([[
            SELECT p.username AS id, p.updated_at AS ts, %s AS author_cid, p.username,
                   p.name, p.age, p.gender, p.about AS body, p.photos
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
        -- Under unique phones, also match photos taken on SIM profiles the searched character activated.
        local simActive = require('server.sim.state').active
        local identityFilter = simActive
            and 'OR citizenid IN (SELECT identity FROM phone_sim_cards WHERE owner_cid LIKE ?)'
            or ''
        return MySQL.query.await(([[
            SELECT id, UNIX_TIMESTAMP(created_at) AS ts, citizenid AS author_cid, url, favorite
            FROM phone_photos
            WHERE (? IS NULL OR citizenid LIKE ? %s)
              AND (? IS NULL OR created_at < FROM_UNIXTIME(?)
                   OR (created_at = FROM_UNIXTIME(?) AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]]):format(identityFilter), simActive
            and { like, like, like, ts, ts, ts, id, limit }
            or  { like, like, ts, ts, ts, id, limit }) or {}
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

---@type integer Seconds this server's local time runs ahead of UTC, measured once at load.
local UTC_DRIFT = (function()
    local now = os.time()
    local utc = os.date('!*t', now)
    return type(utc) == 'table' and (now - os.time(utc)) or 0
end)()

---Parses the ISO-8601 UTC stamp that Mail and Notes store (`2026-08-24T12:00:00`, optionally with
---a fractional part) into epoch seconds. They are the only apps keeping a string timestamp, and
---every other reader here works in epochs.
---@param iso any raw column or JSON value
---@return integer|nil epoch seconds, nil when the value is not a stamp
local function isoToEpoch(iso)
    if type(iso) ~= 'string' then return nil end
    local y, mo, d, h, mi, s = iso:match('^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)')
    if not y then return nil end
    return os.time({
        year = tonumber(y) or 0, month = tonumber(mo) or 0, day = tonumber(d) or 0,
        hour = tonumber(h) or 0, min  = tonumber(mi) or 0, sec = tonumber(s) or 0, isdst = false,
    }) + UTC_DRIFT
end

CONTENT.mail = {
    deletable = false,
    -- One row per mailbox, not per email: Mail keeps every message in a JSON column on the
    -- account, so the messages are what the row expands into. The search still reaches them,
    -- because LIKE over that column matches the JSON text a body sits in.
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT email AS id, UNIX_TIMESTAMP(created_at) AS ts, created_by_cid AS author_cid,
                   email AS title, display_name AS body
            FROM phone_mail_accounts
            WHERE (? IS NULL OR email LIKE ? OR display_name LIKE ? OR messages LIKE ?)
              AND (? IS NULL OR created_at < FROM_UNIXTIME(?)
                   OR (created_at = FROM_UNIXTIME(?) AND email < ?))
            ORDER BY created_at DESC, email DESC
            LIMIT ?
        ]], { like, like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    thread = {
        list = function(id, limit)
            local row = MySQL.single.await('SELECT messages FROM phone_mail_accounts WHERE email = ?', { id })
            if not row then return {} end

            local messages = row.messages
            if type(messages) == 'string' then
                local okJson, decoded = pcall(json.decode, messages)
                messages = okJson and decoded or nil
            end
            if type(messages) ~= 'table' then return {} end

            local out = {}
            for i = #messages, 1, -1 do
                if #out >= limit then break end
                local m = messages[i]
                if type(m) == 'table' then
                    local from    = type(m.from) == 'table' and m.from or {}
                    local subject = type(m.subject) == 'string' and m.subject or ''
                    out[#out + 1] = {
                        id     = tostring(m.id or i),
                        ts     = isoToEpoch(m.sentAt),
                        author = from.email or from.name,
                        kind   = m.folder,
                        body   = subject ~= '' and (subject .. '\n' .. (m.body or '')) or (m.body or ''),
                    }
                end
            end
            return out
        end,
    },
}

CONTENT.documents = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, updated_at AS ts, citizenid AS author_cid, name AS title, content AS body,
                   kind, url, locked, source,
                   (SELECT COUNT(*) FROM phone_document_signatures s WHERE s.doc_id = phone_documents.id) AS comments
            FROM phone_documents
            WHERE (? IS NULL OR name LIKE ? OR content LIKE ? OR citizenid LIKE ?)
              AND (? IS NULL OR updated_at < ? OR (updated_at = ? AND id < ?))
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    thread = {
        -- Who signed it. A forged document is only ever an argument about its signatures.
        list = function(id, limit)
            return MySQL.query.await([[
                SELECT id, created_at AS ts, citizenid AS author_cid, signer AS author, image
                FROM phone_document_signatures
                WHERE doc_id = ?
                ORDER BY created_at ASC, id ASC
                LIMIT ?
            ]], { id, limit }) or {}
        end,
        delete = function(id)
            return tonumber(MySQL.update.await('DELETE FROM phone_document_signatures WHERE id = ?', { id })) or 0
        end,
    },
    delete = function(id)
        MySQL.update.await('DELETE FROM phone_document_signatures WHERE doc_id = ?', { id })
        return tonumber(MySQL.update.await('DELETE FROM phone_documents WHERE id = ?', { id })) or 0
    end,
    -- Only an image document has a picture behind `url`; a PDF or a text file would render as a
    -- broken thumbnail. The lock is worth surfacing because a locked document cannot be edited
    -- by its owner, which is what makes a forged one worth arguing about.
    shape = function(item, row)
        if row.kind ~= 'image' then item.media = {} end
        item.label = util.truthy(row.locked) and 'locked' or row.source or nil
    end,
}

CONTENT.weazelnews = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, created_at AS ts, author_cid, author, headline AS title, category,
                   CONCAT_WS('\n\n', NULLIF(dek, ''), body) AS body, image, views, featured
            FROM phone_weazel_articles
            WHERE (? IS NULL OR headline LIKE ? OR dek LIKE ? OR body LIKE ? OR author LIKE ?)
              AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    delete = function(id)
        return tonumber(MySQL.update.await('DELETE FROM phone_weazel_articles WHERE id = ?', { id })) or 0
    end,
    shape = function(item, row)
        item.label = util.truthy(row.featured) and 'featured' or row.category or nil
    end,
}

CONTENT.review = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT r.id, r.created_at AS ts, r.citizenid AS author_cid, r.author, r.business_id,
                   r.rating, r.body, r.image,
                   (SELECT COUNT(*) FROM phone_review_helpful h WHERE h.review_id = r.id) AS likes
            FROM phone_review_reviews r
            WHERE (? IS NULL OR r.body LIKE ? OR r.author LIKE ? OR r.business_id LIKE ?)
              AND (? IS NULL OR r.created_at < ? OR (r.created_at = ? AND r.id < ?))
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ?
        ]], { like, like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    delete = function(id)
        MySQL.update.await('DELETE FROM phone_review_helpful WHERE review_id = ?', { id })
        return tonumber(MySQL.update.await('DELETE FROM phone_review_reviews WHERE id = ?', { id })) or 0
    end,
    shape = function(item, row)
        item.title = row.business_id
        local rating = tonumber(row.rating) or 0
        item.label  = rating > 0 and (rating .. '/5') or nil
    end,
}

CONTENT.notes = {
    deletable = false,
    -- Notes stamp themselves with an ISO string, so the epoch the cursor needs is derived in SQL
    -- while the ordering stays on the raw column: the two agree because ISO stamps sort the same
    -- either way, and only the raw column has an index behind it.
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, UNIX_TIMESTAMP(STR_TO_DATE(updated_at, '%Y-%m-%dT%H:%i:%s')) AS ts,
                   citizenid AS author_cid, body, images
            FROM phone_notes
            WHERE (? IS NULL OR body LIKE ? OR citizenid LIKE ?)
              AND (? IS NULL OR UNIX_TIMESTAMP(STR_TO_DATE(updated_at, '%Y-%m-%dT%H:%i:%s')) < ?
                   OR (UNIX_TIMESTAMP(STR_TO_DATE(updated_at, '%Y-%m-%dT%H:%i:%s')) = ? AND id < ?))
            ORDER BY updated_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
}

CONTENT.voicememos = {
    deletable = true,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, created_at AS ts, citizenid AS author_cid, name AS title, url, duration,
                   'audio' AS kind
            FROM phone_voice_memos
            WHERE (? IS NULL OR name LIKE ? OR citizenid LIKE ?)
              AND (? IS NULL OR created_at < ? OR (created_at = ? AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    delete = function(id)
        return tonumber(MySQL.update.await('DELETE FROM phone_voice_memos WHERE id = ?', { id })) or 0
    end,
    -- A memo's `url` is a recording, so it is handed over as audio rather than left to render as
    -- a picture that will never load.
    shape = function(item, row)
        item.media = type(row.url) == 'string' and row.url ~= '' and { { url = row.url, audio = row.url } } or {}
        item.imageUrl = nil
        local seconds = tonumber(row.duration) or 0
        item.label = seconds > 0 and ('%d:%02d'):format(seconds // 60, seconds % 60) or nil
    end,
}

CONTENT.groups = {
    deletable = false,
    list = function(ts, id, like, limit)
        return MySQL.query.await([[
            SELECT id, UNIX_TIMESTAMP(created_at) AS ts, leader_cid AS author_cid, name AS title,
                   avatar AS image, members
            FROM phone_groups
            WHERE (? IS NULL OR name LIKE ? OR leader_cid LIKE ?)
              AND (? IS NULL OR created_at < FROM_UNIXTIME(?)
                   OR (created_at = FROM_UNIXTIME(?) AND id < ?))
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        ]], { like, like, like, ts, ts, ts, id, limit }) or {}
    end,
    shape = function(item, row)
        local members = row.members
        if type(members) == 'string' then
            local okJson, decoded = pcall(json.decode, members)
            members = okJson and decoded or nil
        end
        local n = type(members) == 'table' and #members or 0
        item.label = n > 0 and (n .. (n == 1 and ' member' or ' members')) or nil
    end,
}

---Whether an app id has a content adapter, whether its rows can be deleted, and whether a row
---expands into a thread the panel can open.
---@param app string
---@return boolean known, boolean deletable, boolean threaded
function store.contentInfo(app)
    local adapter = CONTENT[app]
    if not adapter then return false, false, false end
    return true, adapter.deletable, adapter.thread ~= nil
end

---@type integer Hardest cap on media carried per row, so one absurd post cannot bloat a page.
local MAX_MEDIA = 12

---Every media reference on one adapter row: a JSON `images`/`photos` array, a single `image`,
---`url` or `gif_url` column, or a `video` with its poster frame. Returns an empty table when the
---row carries none, so the panel never has to null-check. `images` arrives as a JSON string from
---TEXT columns and can arrive pre-decoded from a real JSON column, so both are accepted.
---@param r table raw adapter row
---@return table[] media { url = string, video = string|nil }
local function mediaOf(r)
    local out = {}

    local function push(url, video)
        if type(url) ~= 'string' or url == '' or #out >= MAX_MEDIA then return end
        out[#out + 1] = { url = url, video = video }
    end

    for _, column in ipairs({ r.images or false, r.photos or false }) do
        local list = column
        if type(list) == 'string' and list ~= '' then
            local okJson, decoded = pcall(json.decode, list)
            list = okJson and decoded or nil
        end
        if type(list) == 'table' then
            for _, url in ipairs(list) do push(url) end
        end
    end

    -- Only when the JSON array held nothing: classifieds write the same picture to both columns.
    if #out == 0 then push(r.image) end
    push(r.url)
    push(r.gif_url)

    -- Texts and Dark Chat lines keep an attached picture in meta.gifUrl rather than a column of
    -- its own, so an image message reads as "(no text)" without this.
    local meta = r.meta
    if type(meta) == 'string' and meta ~= '' then
        local okMeta, decoded = pcall(json.decode, meta)
        meta = okMeta and decoded or nil
    end
    if type(meta) == 'table' then push(meta.gifUrl) end

    if type(r.video) == 'string' and r.video ~= '' then
        push((type(r.thumb) == 'string' and r.thumb ~= '') and r.thumb or r.video, r.video)
    end
    return out
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

    -- Guarded per app, like the media wall: a table this server never created empties one tab
    -- rather than failing the callback that draws it.
    local okQuery, rows = pcall(adapter.list, ts, id, like, limit + 1)
    if not okQuery or type(rows) ~= 'table' then return {}, nil end

    local nextCursor = nil
    if #rows > limit then
        rows[limit + 1] = nil
        local last = rows[limit]
        nextCursor = ('%d:%s'):format(tonumber(last.ts) or 0, last.id)
    end

    local items = {}
    for i, r in ipairs(rows) do
        local media = mediaOf(r)
        items[i] = {
            id        = tostring(r.id),
            createdAt = tonumber(r.ts),
            authorCid = r.author_cid,
            kind      = r.kind,
            title     = r.title,
            body      = r.body,
            media     = media,
            images    = #media > 0 and #media or nil,
            imageUrl  = media[1] and media[1].url or nil,
            likes     = tonumber(r.likes),
            comments  = tonumber(r.comments),
            views     = tonumber(r.views),
            price     = r.price and tonumber(r.price) or nil,
            label     = r.room_id and ('#' .. r.room_id .. ' as ' .. tostring(r.author))
                or (r.author and ('@' .. r.author))
                or (r.username and ('@' .. r.username .. (r.name and (' · ' .. r.name .. ', ' .. tostring(r.age)) or '')))
                or (r.conversation and ((lib.string.startsWith(r.conversation, 'g-')) and ('group ' .. r.conversation) or ('to ' .. util.formatNumber(r.conversation))))
                or nil,
        }
        if adapter.shape then adapter.shape(items[i], r) end
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

---@type integer Most thread rows one expansion returns, before plus after the anchor.
local THREAD_LIMIT = THREAD_BEFORE + THREAD_AFTER

---What one content row expands into, oldest first: the replies under a post, or the room and
---conversation lines around a message. The row the thread was opened from is flagged `anchor`
---so the panel can mark it in a wall of surrounding context.
---@param app string adapter key (validated + threaded-checked by the caller)
---@param id string anchor row id
---@return table[] items
function store.contentThread(app, id)
    local rows = CONTENT[app].thread.list(id, THREAD_LIMIT) or {}
    local items = {}
    for i, r in ipairs(rows) do
        items[i] = {
            id        = tostring(r.id),
            createdAt = tonumber(r.ts),
            authorCid = r.author_cid,
            handle    = r.author,
            body      = r.body,
            kind      = r.kind,
            direction = r.direction,
            media     = mediaOf(r),
            likes     = tonumber(r.likes),
            anchor    = tostring(r.id) == tostring(id) or nil,
        }
    end
    return items
end

---Whether an app's thread rows can be deleted one at a time.
---@param app string adapter key
---@return boolean
function store.threadDeletable(app)
    local adapter = CONTENT[app]
    return adapter ~= nil and adapter.thread ~= nil and adapter.thread.delete ~= nil
end

---Deletes one row inside a thread: a comment, or a single line of a room log.
---@param app string adapter key (validated + threadDeletable-checked by the caller)
---@param id string thread row id
---@return integer removed
function store.deleteThreadItem(app, id)
    return CONTENT[app].thread.delete(id)
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

---Every image and clip posted anywhere on the phone, newest first, as one merged wall.
---
---Each app is queried on its own and the results are merged in Lua rather than UNIONed in SQL:
---the tables disagree on column names, on how they store a timestamp, and Squawk keeps a JSON
---array where the others keep a single URL. A per-app pcall means an app whose table this server
---never created drops out of the wall instead of emptying it.
---@param limit? integer rows per app before merging (default 40)
---@return table[] rows { app, url, author, createdAt, id }
function store.mediaWall(limit)
    local n = math.floor(tonumber(limit) or 40)
    local out = {}

    local function pull(app, sql, shape)
        local okQuery, rows = pcall(MySQL.query.await, (sql):format(n))
        if not okQuery or not rows then return end
        for _, r in ipairs(rows) do shape(r) end
    end

    pull('photos', [[
        SELECT id, url, citizenid, UNIX_TIMESTAMP(created_at) AS ts
        FROM phone_photos ORDER BY created_at DESC LIMIT %d
    ]], function(r)
        out[#out + 1] = { app = 'photos', id = r.id, url = r.url, author = r.citizenid, createdAt = tonumber(r.ts) or 0 }
    end)

    pull('clout', [[
        SELECT id, video, thumb, author, created_at AS ts
        FROM phone_vibez_posts ORDER BY created_at DESC LIMIT %d
    ]], function(r)
        out[#out + 1] = { app = 'clout', id = r.id, url = r.thumb ~= '' and r.thumb or r.video,
                          video = r.video, author = r.author, createdAt = tonumber(r.ts) or 0 }
    end)

    pull('photogram', [[
        SELECT id, media, username, UNIX_TIMESTAMP(timestamp) AS ts
        FROM phone_instagram_posts ORDER BY timestamp DESC LIMIT %d
    ]], function(r)
        out[#out + 1] = { app = 'photogram', id = tostring(r.id), url = r.media, author = r.username, createdAt = tonumber(r.ts) or 0 }
    end)

    pull('squawk', [[
        SELECT id, images, author, UNIX_TIMESTAMP(created_at) AS ts
        FROM phone_birdy_posts WHERE images IS NOT NULL AND images <> '' ORDER BY created_at DESC LIMIT %d
    ]], function(r)
        local okJson, list = pcall(json.decode, r.images)
        if not okJson or type(list) ~= 'table' then return end
        for _, url in ipairs(list) do
            out[#out + 1] = { app = 'squawk', id = r.id, url = url, author = r.author, createdAt = tonumber(r.ts) or 0 }
        end
    end)

    table.sort(out, function(a, b) return a.createdAt > b.createdAt end)
    return out
end

---@type integer How many days of history the dashboard charts cover.
local TREND_DAYS = 14

---@type { key: string, tbl: string, col: string, unix: boolean }[] One entry per charted series.
---`unix` marks a column stored as epoch seconds rather than a TIMESTAMP, which the two tables
---below disagree on - phone_messages counts seconds, phone_birdy_posts holds a real timestamp.
local TREND_SERIES = {
    { key = 'messages',   tbl = 'phone_messages',      col = 'created_at', unix = true  },
    { key = 'calls',      tbl = 'phone_calls',         col = 'called_at',  unix = true  },
    { key = 'birdyPosts', tbl = 'phone_birdy_posts',   col = 'created_at', unix = false },
    { key = 'cloutPosts', tbl = 'phone_vibez_posts',   col = 'created_at', unix = true  },
    { key = 'photos',     tbl = 'phone_photos',        col = 'created_at', unix = false },
    { key = 'accounts',   tbl = 'phone_app_accounts',  col = 'created_at', unix = false },
}

---Daily counts per series for the last TREND_DAYS days, oldest first and zero-filled, so the
---panel can draw a line without knowing which days had no rows.
---
---Each series is pcall-guarded on its own: an app whose table this server has never created
---returns an empty line instead of taking the whole dashboard down with it.
---@return table<string, integer[]> series key -> one count per day
---@return string[] days ISO dates matching the arrays, oldest first
function store.trends()
    local days = {}
    local now  = os.time()
    for i = TREND_DAYS - 1, 0, -1 do
        days[#days + 1] = os.date('%Y-%m-%d', now - i * 86400)
    end

    local out = {}
    for _, s in ipairs(TREND_SERIES) do
        local line = {}
        for i = 1, TREND_DAYS do line[i] = 0 end

        local okQuery, rows = pcall(function()
            local where = s.unix
                and ('%s >= UNIX_TIMESTAMP(CURDATE() - INTERVAL %d DAY)'):format(s.col, TREND_DAYS - 1)
                or  ('%s >= CURDATE() - INTERVAL %d DAY'):format(s.col, TREND_DAYS - 1)
            local bucket = s.unix and ('DATE(FROM_UNIXTIME(%s))'):format(s.col) or ('DATE(%s)'):format(s.col)
            return MySQL.query.await(('SELECT %s AS d, COUNT(*) AS n FROM %s WHERE %s GROUP BY d')
                :format(bucket, s.tbl, where))
        end)

        if okQuery and rows then
            local byDay = {}
            for _, r in ipairs(rows) do byDay[tostring(r.d):sub(1, 10)] = tonumber(r.n) or 0 end
            for i = 1, TREND_DAYS do line[i] = byDay[days[i]] or 0 end
        end

        out[s.key] = line
    end

    return out, days
end

return store
