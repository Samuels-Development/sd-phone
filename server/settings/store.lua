---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Server-wide helpers (server.util).
local util = require 'server.util'
---@type table Post-0.9.0 column back-fills (server.migrations).
local migrations = require 'server.migrations'
---@type table Locale bridge (bridge.shared.locale): which catalogues this install ships.
local localeBridge = require 'bridge.shared.locale'
---@type fun(v: any): boolean Boolean coercion for oxmysql TINYINT columns.
local isTruthy = util.truthy

---@type table Store module; the table returned at end of file.
local store = {}

---Builds an SQL fragment that strips the common phone-number separators from a column for
---digit-to-digit comparison.
---@param col string literal column name to wrap
---@return string sql nested REPLACE(...) expression over the column
local function stripCol(col)
    return ("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(%s,'-',''),' ',''),'(',''),')',''),'+',''),'.','')"):format(col)
end

---@type fun(): string Random number candidate at config.Phone.Number.Length (server.util).
local genNumber = util.randomNumber

---Returns a varchar column's declared character cap, or nil when the column is missing or not
---length-bounded (information_schema probe).
---@param tbl string table name
---@param name string column name
---@return number|nil length
local function columnLength(tbl, name)
    local row = MySQL.single.await([[
        SELECT CHARACTER_MAXIMUM_LENGTH AS n FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
    ]], { tbl, name })
    return row and tonumber(row.n) or nil
end

---Clamps a tone id to a lowercase slug capped at 64 chars; nil for empty/invalid input.
---@param id any client-supplied tone id
---@return string|nil clean lowercase [a-z0-9_-] slug, nil if unusable
local function sanitizeTone(id)
    if type(id) ~= 'string' then return nil end
    local clean = (id:lower():gsub('[^a-z0-9_-]', ''))
    if clean == '' then return nil end
    return clean:sub(1, 64)
end

---Creates the phone_settings table plus the phone_custom_ringtones and phone_notif_prefs
---satellite tables, backfilling columns on older installs.
function store.ensureSchema()
    util.ensureTable('phone_settings', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS phone_settings (
            citizenid          VARCHAR(64) NOT NULL,
            device             VARCHAR(16) NOT NULL DEFAULT 'phone',
            phone_number       VARCHAR(20) NULL,
            active_group_id    VARCHAR(16) NULL,
            ringtone           VARCHAR(64) NULL,
            notification_tone  VARCHAR(64) NULL,
            airplane_mode      TINYINT(1)  NOT NULL DEFAULT 0,
            card_name          VARCHAR(64)  NULL,
            card_avatar        VARCHAR(512) NULL,
            card_email         VARCHAR(128) NULL,
            card_address       VARCHAR(128) NULL,
            installed_apps     TEXT         NULL,
            home_layout        TEXT         NULL,
            lock_clock         TEXT         NULL,
            card_style         TEXT         NULL,
            wallpaper          VARCHAR(512) NULL,
            wallpaper_home     VARCHAR(512) NULL,
            blur_lock          TINYINT(1)   NULL,
            blur_home          TINYINT(1)   NULL,
            island_pet         VARCHAR(16)  NULL,
            custom_wallpapers  TEXT         NULL,
            passcode           VARCHAR(8)   NULL,
            face_id            TINYINT(1)   NOT NULL DEFAULT 0,
            chat_text_scale    DECIMAL(3,2) NULL,
            reduce_motion      TINYINT      NULL,
            bold_text          TINYINT(1)   NULL,
            text_scale         DECIMAL(3,2) NULL,
            app_labels         TEXT         NULL,
            phone_scale        TINYINT UNSIGNED NULL,
            brightness         TINYINT UNSIGNED NULL,
            phone_align        VARCHAR(16) NULL,
            phone_tilt         VARCHAR(48) NULL,
            dock_style         VARCHAR(12) NULL,
            open_anim          VARCHAR(12) NULL,
            wallpaper_parallax TINYINT(1)  NULL,
            hour24             TINYINT(1)   NULL,
            caller_id          TINYINT(1)   NULL,
            streamer_mode      TINYINT(1)   NULL,
            streamer_hide      VARCHAR(255) NULL,
            reopen_app         TINYINT(1)   NULL,
            setup_done         TINYINT(1)   NULL,
            theme              VARCHAR(8)   NULL,
            dark_theme         VARCHAR(16)  NULL,
            light_theme        VARCHAR(16)  NULL,
            accent             VARCHAR(16)  NULL,
            shell              VARCHAR(16)  NULL,
            game_time          TINYINT(1)   NULL,
            palette_custom     LONGTEXT     NULL,
            icon_theme         VARCHAR(16)  NULL,
            icon_custom        LONGTEXT     NULL,
            show_app_names     TINYINT(1)   NOT NULL DEFAULT 1,
            home_density       VARCHAR(12)  NULL,
            home_icon_scale    SMALLINT     NULL,
            ringtone_volume    TINYINT UNSIGNED NULL,
            call_volume        TINYINT UNSIGNED NULL,
            locale             VARCHAR(8)   NULL,
            updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, device)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    -- Columns added since v0.9.0 live in server/migrations.lua; everything above is the current
    -- shape, which every fresh install gets from the CREATE TABLE directly.
    migrations.apply('phone_settings')

    -- Number-to-citizen is the hottest lookup in the resource (every dial, text and contact add)
    -- and the primary key cannot serve it.
    util.ensureIndex('phone_settings', 'idx_phone_settings_number', '(phone_number)')

    -- Settings became per-device, so the key widened. Existing rows already carry device='phone'
    -- from the column default, which is what makes this safe: every row a player had stays their
    -- phone's, and a tablet mints its own row on first use. Keyed off the second PK column rather
    -- than a version flag, so it is a no-op on every boot after the first.
    local pkSecond = MySQL.scalar.await([[
        SELECT COLUMN_NAME FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'phone_settings'
          AND index_name = 'PRIMARY' AND SEQ_IN_INDEX = 2
    ]])
    if pkSecond ~= 'device' then
        MySQL.query.await('ALTER TABLE phone_settings DROP PRIMARY KEY, ADD PRIMARY KEY (citizenid, device)')
    end

    local appNamesNullable = MySQL.scalar.await([[
        SELECT IS_NULLABLE FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_settings'
          AND COLUMN_NAME = 'show_app_names'
    ]])
    if appNamesNullable == 'YES' then
        MySQL.update.await('UPDATE phone_settings SET show_app_names = 1 WHERE show_app_names IS NULL')
        MySQL.query.await('ALTER TABLE phone_settings MODIFY show_app_names TINYINT(1) NOT NULL DEFAULT 1')
    end

    -- Personalisation columns added after the table shipped. Keyed off the first of them so the
    -- whole group is added in one ALTER on an existing install and skipped on every boot after,
    -- and so a fresh install (which gets them from the CREATE TABLE above) never runs it at all.
    local hasPersonalisation = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_settings'
          AND COLUMN_NAME = 'reduce_motion'
    ]])
    if tonumber(hasPersonalisation) == 0 then
        MySQL.query.await([[
            ALTER TABLE phone_settings
                ADD COLUMN reduce_motion TINYINT      NULL,
                ADD COLUMN bold_text     TINYINT(1)   NULL,
                ADD COLUMN text_scale    DECIMAL(3,2) NULL,
                ADD COLUMN app_labels    TEXT         NULL
        ]])
    end

    -- reduce_motion holds three levels (0 full, 1 reduced, 2 off), so it must NOT be TINYINT(1):
    -- oxmysql maps that width to a Lua boolean, which would read both 1 and 2 back as `true` and
    -- collapse the setting to off/on. Early installs got the narrow type; widen them.
    local motionType = MySQL.scalar.await([[
        SELECT COLUMN_TYPE FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_settings'
          AND COLUMN_NAME = 'reduce_motion'
    ]])
    if type(motionType) == 'string' and motionType:lower():find('tinyint(1)', 1, true) then
        MySQL.query.await('ALTER TABLE phone_settings MODIFY reduce_motion TINYINT NULL')
    end

    util.ensureColumns('phone_settings', {
        card_style = 'card_style TEXT NULL',
    })

    local hasBankBrand = MySQL.scalar.await([[
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'phone_settings'
          AND COLUMN_NAME = 'bank_brand'
    ]])
    if tonumber(hasBankBrand) == 1 then
        MySQL.query.await('ALTER TABLE phone_settings DROP COLUMN bank_brand')
    end

    util.ensureTable('phone_custom_ringtones', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS phone_custom_ringtones (
            citizenid  VARCHAR(64)  NOT NULL,
            id         VARCHAR(32)  NOT NULL,
            kind       VARCHAR(16)  NOT NULL DEFAULT 'ringtone',
            name       VARCHAR(64)  NOT NULL,
            url        VARCHAR(512) NOT NULL,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_notif_prefs (
            citizenid VARCHAR(64) NOT NULL,
            app       VARCHAR(32) NOT NULL,
            enabled   TINYINT(1)  NOT NULL DEFAULT 1,
            sounds    TINYINT(1)  NOT NULL DEFAULT 1,
            tone      VARCHAR(32) NULL,
            PRIMARY KEY (citizenid, app)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    util.ensureColumns('phone_notif_prefs', {
        sounds = 'sounds TINYINT(1) NOT NULL DEFAULT 1',
        tone   = 'tone VARCHAR(32) NULL',
    })

    -- setPhoneNumber has always written bare digits; only rows imported from another phone
    -- resource can still carry separators. Normalising them once lets the number lookups compare
    -- the bare column, so idx_phone_settings_number can be SEEKED instead of scanned through a
    -- REPLACE() wrapper that made the predicate non-sargable.
    util.runOnce('settings_phone_number_bare_digits', function()
        local n = MySQL.update.await((
            'UPDATE phone_settings SET phone_number = %s ' ..
            'WHERE phone_number IS NOT NULL AND phone_number <> %s'
        ):format(stripCol('phone_number'), stripCol('phone_number')))
        return { normalized = tonumber(n) or 0 }
    end)
end

---Clamps an app id to a lowercase slug capped at 32 chars; nil for empty/invalid input.
---@param v any client-supplied app id
---@return string|nil clean lowercase [a-z0-9_-] slug, nil if unusable
local function sanitizeApp(v)
    if type(v) ~= 'string' then return nil end
    local clean = (v:lower():gsub('[^a-z0-9_-]', ''))
    if clean == '' then return nil end
    return clean:sub(1, 32)
end

---Returns true if a player wants notifications from `app`, defaulting to true when never
---toggled or when the app id is unusable. Read-only.
---@param citizenid string framework per-character id
---@param app string app slug
---@return boolean enabled
function store.getNotifPref(citizenid, app)
    local a = sanitizeApp(app)
    if not citizenid or citizenid == '' or not a then return true end
    local row = MySQL.single.await(
        'SELECT enabled FROM phone_notif_prefs WHERE citizenid = ? AND app = ?', { citizenid, a })
    if not row then return true end
    return isTruthy(row.enabled)
end

---Every stored notification override for a player, keyed by app slug. Apps left at their
---defaults have no row and are simply absent. Read-only.
---@param citizenid string framework per-character id
---@return table<string, { enabled: boolean, sounds: boolean, tone: string|nil }>
function store.getNotifPrefs(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local rows = MySQL.query.await(
        'SELECT app, enabled, sounds, tone FROM phone_notif_prefs WHERE citizenid = ?', { citizenid }) or {}

    local out = {}
    for i = 1, #rows do
        local r = rows[i]
        out[r.app] = {
            enabled = isTruthy(r.enabled),
            sounds  = isTruthy(r.sounds),
            tone    = (type(r.tone) == 'string' and r.tone ~= '') and r.tone or nil,
        }
    end
    return out
end

---@type integer Cap on stored notification overrides per character. Only a muted app keeps a row,
---so this sits far above the phone's whole app list, custom apps included.
local MAX_NOTIF_PREFS = 64

---Persists a player's notification preferences for an app; no-op for an unusable app id. A row is
---kept only while something differs from the defaults getNotifPrefs falls back to, so an app
---returned to enabled + sounds + default tone drops its row instead of storing the default - the
---app id is client-supplied and would otherwise be an uncapped primary key. Omitted fields keep
---whatever is already stored.
---@param citizenid string framework per-character id
---@param app string app slug
---@param patch { enabled: boolean|nil, sounds: boolean|nil, tone: string|nil }
function store.setNotifPref(citizenid, app, patch)
    local a = sanitizeApp(app)
    if not citizenid or citizenid == '' or not a then return end
    patch = type(patch) == 'table' and patch or {}

    local row = MySQL.single.await(
        'SELECT enabled, sounds, tone FROM phone_notif_prefs WHERE citizenid = ? AND app = ?',
        { citizenid, a })

    ---A patched flag wins, else what is stored, else the default. Written out rather than folded
    ---into and/or, which silently drops a patched `false`.
    ---@param patched any
    ---@param stored any
    ---@return boolean
    local function flag(patched, stored)
        if patched ~= nil then return patched == true end
        if stored ~= nil then return isTruthy(stored) end
        return true
    end

    local enabled = flag(patch.enabled, row and row.enabled)
    local sounds  = flag(patch.sounds,  row and row.sounds)

    local tone
    if patch.tone == nil then
        tone = row and row.tone or nil
    elseif type(patch.tone) == 'string' and patch.tone ~= '' then
        tone = sanitizeTone(patch.tone)
    end

    if enabled and sounds and not tone then
        if row then
            MySQL.update.await('DELETE FROM phone_notif_prefs WHERE citizenid = ? AND app = ?', { citizenid, a })
        end
        return
    end

    if not row then
        local countRow = MySQL.single.await(
            'SELECT COUNT(*) AS n FROM phone_notif_prefs WHERE citizenid = ?', { citizenid })
        if countRow and tonumber(countRow.n) >= MAX_NOTIF_PREFS then return end
    end

    MySQL.update.await([[
        INSERT INTO phone_notif_prefs (citizenid, app, enabled, sounds, tone) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), sounds = VALUES(sounds), tone = VALUES(tone)
    ]], { citizenid, a, enabled and 1 or 0, sounds and 1 or 0, tone })
end

---Trims a string and clamps it to `n` chars; nil / non-string / empty becomes nil.
---@param v any client-supplied string
---@param n number maximum kept length
---@return string|nil trimmed string, nil if unusable
local function trimClamp(v, n)
    if type(v) ~= 'string' then return nil end
    local s = (v:gsub('^%s+', ''):gsub('%s+$', ''))
    if s == '' then return nil end
    return s:sub(1, n)
end

---Reads a player's custom "My Card" overrides; nil fields = unset. Read-only.
---@param citizenid string framework per-character id
---@return { name: string|nil, avatar: string|nil, email: string|nil, address: string|nil }
function store.getCard(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await(
        'SELECT card_name, card_avatar, card_email, card_address FROM phone_settings WHERE citizenid = ? AND device = ?',
        { citizenid, 'phone' }
    )
    if not row then return {} end
    return {
        name    = row.card_name,
        avatar  = row.card_avatar,
        email   = row.card_email,
        address = row.card_address,
    }
end

---Persists a player's "My Card" overrides in one upsert; every field is trimmed and clamped to
---its column size, and an empty field stores NULL.
---@param citizenid string framework per-character id
---@param fields { name?: string, avatar?: string, email?: string, address?: string }
function store.setCard(citizenid, fields)
    if not citizenid or citizenid == '' then return end
    fields = fields or {}
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, card_name, card_avatar, card_email, card_address)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            card_name    = VALUES(card_name),
            card_avatar  = VALUES(card_avatar),
            card_email   = VALUES(card_email),
            card_address = VALUES(card_address)
    ]], {
        citizenid,
        'phone',
        trimClamp(fields.name, 64),
        trimClamp(fields.avatar, 512),
        trimClamp(fields.email, 128),
        trimClamp(fields.address, 128),
    })
end

---Reads a player's installed downloadable app ids (JSON array column); an unparseable column
---yields {}.
---@param citizenid string framework per-character id
---@return string[] ids installed app ids ({} when unset or unparseable)
function store.getInstalledApps(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await(
        'SELECT installed_apps FROM phone_settings WHERE citizenid = ? AND device = ?',
        { citizenid, device }
    )
    if not row or not row.installed_apps or row.installed_apps == '' then return {} end
    local ok, decoded = pcall(json.decode, row.installed_apps)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---Persists a player's installed downloadable app ids, leaving other settings intact.
---@param citizenid string framework per-character id
---@param ids string[] installed app ids
function store.setInstalledApps(citizenid, ids, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, installed_apps) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE installed_apps = VALUES(installed_apps)
    ]], { citizenid, device, json.encode(ids or {}) })
end

---Reads a player's saved home-screen layout JSON, or nil if unset. Read-only.
---@param citizenid string framework per-character id
---@return string|nil layout opaque layout JSON
function store.getHomeLayout(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT home_layout FROM phone_settings WHERE citizenid = ? AND device = ?',
        { citizenid, 'phone' }
    )
    if not row or not row.home_layout or row.home_layout == '' then return nil end
    return row.home_layout
end

---Persists a player's home-screen layout (an opaque JSON string), leaving other settings intact.
---@param citizenid string framework per-character id
---@param layout string opaque layout JSON
function store.setHomeLayout(citizenid, layout)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, home_layout) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE home_layout = VALUES(home_layout)
    ]], { citizenid, 'phone', layout })
end

---@type string[] Columns a Reset All Settings carries across. Everything NOT listed is a
---preference and goes back to its default. What survives is the three things a preference reset
---has no business touching: identity (the number), what you signed up to (setup state, your
---installed apps, your group, your lock) and content you authored (contact card, uploaded
---wallpapers, custom palettes and icon themes).
local RESET_KEEP = {
    'phone_number', 'setup_done', 'installed_apps', 'active_group_id',
    'card_name', 'card_avatar', 'card_email', 'card_address',
    'custom_wallpapers', 'palette_custom', 'icon_custom',
    'passcode', 'face_id',
}

---@type string[] An Erase keeps only what the character cannot function without. Losing the
---number would strand their contacts, call history and anyone who has them saved.
local ERASE_KEEP = { 'phone_number' }

---Resets one profile's settings row.
---
---The row is DELETED and re-created from a KEEP list rather than having each preference nulled
---by name. Naming the columns to clear would silently miss every column added afterwards - the
---reset would quietly stop covering new settings, which is exactly how the old one came to do
---nothing at all. Inverted, a new column resets by default, which is the safe direction.
---@param citizenid string framework per-character id
---@param device string|nil device key, defaults to 'phone'
---@param scope string|nil 'settings' (preferences only) or 'erase' (factory), defaults to erase
function store.resetSettings(citizenid, device, scope)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local keep = scope == 'settings' and RESET_KEEP or ERASE_KEEP
    local row = MySQL.single.await(
        'SELECT ' .. table.concat(keep, ', ') .. ' FROM phone_settings WHERE citizenid = ? AND device = ?',
        { citizenid, device })
    if not row then return end

    local cols, marks, vals = { 'citizenid', 'device' }, { '?', '?' }, { citizenid, device }
    for _, col in ipairs(keep) do
        local v = row[col]
        if v ~= nil then
            if type(v) == 'boolean' then v = v and 1 or 0 end
            cols[#cols + 1]  = col
            marks[#marks + 1] = '?'
            vals[#vals + 1]  = v
        end
    end

    local sets = {}
    for _, col in ipairs(cols) do sets[#sets + 1] = col .. ' = VALUES(' .. col .. ')' end
    MySQL.transaction.await({
        { query = 'DELETE FROM phone_settings WHERE citizenid = ? AND device = ?', values = { citizenid, device } },
        {
            query = 'INSERT INTO phone_settings (' .. table.concat(cols, ', ') .. ') VALUES ('
                .. table.concat(marks, ', ') .. ') ON DUPLICATE KEY UPDATE ' .. table.concat(sets, ', '),
            values = vals,
        },
    })

    store.forgetAirplane(citizenid, device)
end

---Reads a player's phone number, or nil if not yet assigned. Read-only.
---@param citizenid string framework per-character id
---@return string|nil number raw-digit phone number
function store.getPhoneNumber(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT phone_number FROM phone_settings WHERE citizenid = ? AND device = ?',
        { citizenid, 'phone' }
    )
    return row and row.phone_number or nil
end

---Finds the citizen who owns a given phone number, comparing raw digits on both sides; input
---with no digits returns nil. Read-only.
---@param number string phone number in any formatting
---@return string|nil citizenid owner, nil if unowned
function store.getCitizenByNumber(number)
    local digits = (tostring(number or ''):gsub('%D', ''))
    if digits == '' then return nil end
    local row = MySQL.single.await(
        'SELECT citizenid FROM phone_settings WHERE phone_number = ? LIMIT 1',
        { digits }
    )
    return row and row.citizenid or nil
end

---Returns true if any character already owns this number, compared digit-to-digit. Read-only.
---@param number string phone number in any formatting
---@return boolean taken
function store.numberExists(number)
    local digits = (tostring(number or ''):gsub('%D', ''))
    local row = MySQL.single.await(
        'SELECT 1 AS hit FROM phone_settings WHERE phone_number = ? LIMIT 1',
        { digits }
    )
    return row ~= nil
end

---Persists a player's phone number as bare digits, leaving any other settings intact.
---@param citizenid string framework per-character id
---@param number string phone number in any formatting (separators stripped)
function store.setPhoneNumber(citizenid, number)
    if not citizenid or citizenid == '' then return end
    local clean = (tostring(number or ''):gsub('%D', ''))
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, phone_number) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE phone_number = VALUES(phone_number)
    ]], { citizenid, 'phone', clean })
end

---Clears a phone identity's number mirror (device mode: a phone whose SIM was pulled has no
---number and must report none). A no-op when the row does not exist.
---@param citizenid string phone data identity
function store.clearPhoneNumber(citizenid)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await("UPDATE phone_settings SET phone_number = NULL WHERE citizenid = ? AND device = 'phone'", { citizenid })
end

---True when a phone identity already has a settings row (used by device-mode identity minting to
---decide whether to ADOPT an existing SIM/character profile instead of opening a blank one).
---Read-only.
---@param citizenid string phone data identity
---@return boolean hasData
function store.hasData(citizenid)
    if not citizenid or citizenid == '' then return false end
    return MySQL.scalar.await("SELECT 1 FROM phone_settings WHERE citizenid = ? AND device = 'phone' LIMIT 1", { citizenid }) ~= nil
end

---Returns a player's number, generating and saving a unique one on first access; tries 20
---random candidates against numberExists, then accepts an unchecked one. Under unique-phones
---mode numbers live on SIM cards (server/sim), so first-access generation is disabled and only
---an already-synced number is returned.
---@param citizenid string framework per-character id
---@return string|nil number raw-digit phone number, nil only when citizenid is unusable
function store.ensurePhoneNumber(citizenid)
    if not citizenid or citizenid == '' then return nil end

    local existing = store.getPhoneNumber(citizenid)
    if existing then return existing end

    -- Under unique phones, numbers come from SIMs/devices and are never minted here - EXCEPT
    -- in character-data mode, which keeps the stock auto-assign as the SIM-less fallback.
    local sim = require 'server.sim.state'
    if sim.active and not sim.character then return nil end

    local number
    for _ = 1, 20 do
        local candidate = genNumber()
        if not store.numberExists(candidate) then
            number = candidate
            break
        end
    end
    number = number or genNumber()
    store.setPhoneNumber(citizenid, number)
    -- Announces the first assignment (citizenid, number).
    TriggerEvent('sd-phone:server:number:assigned', citizenid, number)
    return number
end

---Batch-resolves many citizenids to their stored phone numbers in one query, returning a
---cid -> bare-digit-number map; ids with no settings row are absent.
---@param cids string[] citizenids to resolve
---@return table<string, string> cid -> digits number
function store.numbersFor(cids)
    if type(cids) ~= 'table' then return {} end
    local seen, list = {}, {}
    for i = 1, #cids do
        local c = cids[i]
        if c and c ~= '' and not seen[c] then seen[c] = true; list[#list + 1] = c end
    end
    if #list == 0 then return {} end
    local placeholders = ('?,'):rep(#list):sub(1, -2)
    local rows = MySQL.query.await(
        "SELECT citizenid, phone_number FROM phone_settings WHERE device = 'phone' AND citizenid IN (" .. placeholders .. ')', list) or {}
    local out = {}
    for i = 1, #rows do out[rows[i].citizenid] = (tostring(rows[i].phone_number or ''):gsub('%D', '')) end
    return out
end

---Clamps a font/layout id to a lowercase slug capped at 16 chars; nil for invalid input.
---@param v any client-supplied slug
---@return string|nil clean lowercase [a-z0-9_-] slug, nil if unusable
local function sanitizeSlug(v)
    if type(v) ~= 'string' then return nil end
    local clean = (v:lower():gsub('[^a-z0-9_-]', ''))
    if clean == '' then return nil end
    return clean:sub(1, 16)
end

---Validates a #rrggbb hex colour, returning it verbatim or nil.
---@param v any client-supplied colour
---@return string|nil colour '#rrggbb', nil if not exactly that shape
local function sanitizeHex(v)
    if type(v) ~= 'string' then return nil end
    return v:match('^#%x%x%x%x%x%x$')
end

---Clamps the clock scale multiplier to 0.7-1.4; nil for non-numbers and NaN, infinities fall to
---the nearest bound.
---@param v any client-supplied scale
---@return number|nil scale clamped multiplier, nil if unusable
local function clampScale(v)
    local n = tonumber(v)
    if not n or n ~= n then return nil end
    if n < 0.7 then n = 0.7 elseif n > 1.4 then n = 1.4 end
    return n
end

---Reads a player's lockscreen clock config (font / layout / colour / scale), or nil if unset or
---unparseable. Read-only.
---@param citizenid string framework per-character id
---@return { font: string|nil, layout: string|nil, color: string|nil }|nil
function store.getLockClock(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT lock_clock FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row or not row.lock_clock or row.lock_clock == '' then return nil end
    local ok, decoded = pcall(json.decode, row.lock_clock)
    if not ok or type(decoded) ~= 'table' then return nil end
    return decoded
end

---Persists a player's lockscreen clock config, rebuilding the stored JSON from only the
---sanitised fields; a fully-invalid payload is ignored.
---@param citizenid string framework per-character id
---@param cfg { font?: string, layout?: string, color?: string, scale?: number }
function store.setLockClock(citizenid, cfg, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' or type(cfg) ~= 'table' then return end
    local clean = {
        font   = sanitizeSlug(cfg.font),
        layout = sanitizeSlug(cfg.layout),
        color  = sanitizeHex(cfg.color),
        scale  = clampScale(cfg.scale),
    }
    if not clean.font and not clean.layout and not clean.color and not clean.scale then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, lock_clock) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE lock_clock = VALUES(lock_clock)
    ]], { citizenid, device, json.encode(clean) })
end

---Reads a player's saved bank-card style; nil when they have never customised it or the stored
---JSON is unparseable.
---@param citizenid string framework per-character id
---@param device string|nil device scope, defaults to 'phone'
---@return { bank: string|nil, color: string|nil, pattern: string|nil }|nil
function store.getCardStyle(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT card_style FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row or not row.card_style or row.card_style == '' then return nil end
    local ok, decoded = pcall(json.decode, row.card_style)
    if not ok or type(decoded) ~= 'table' then return nil end
    return decoded
end

---Persists a player's bank-card style, storing only the three sanitised slugs.
---@param citizenid string framework per-character id
---@param style table { bank?: string, color?: string, pattern?: string }
---@param device string|nil device scope, defaults to 'phone'
---@return boolean stored false when no field survived sanitising
function store.setCardStyle(citizenid, style, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' or type(style) ~= 'table' then return false end
    local clean = {
        bank    = sanitizeSlug(style.bank),
        color   = sanitizeSlug(style.color),
        pattern = sanitizeSlug(style.pattern),
    }
    if not clean.bank and not clean.color and not clean.pattern then return false end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, card_style) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE card_style = VALUES(card_style)
    ]], { citizenid, device, json.encode(clean) })
    return true
end

---Validates a wallpaper image URL: http(s) scheme, no whitespace or control chars, within the
---512-char column cap; nil for anything else (never truncated, a cut URL is a broken URL).
---@param v any client-supplied URL
---@return string|nil url verbatim URL, nil if unusable
local function sanitizeWallpaperUrl(v)
    if type(v) ~= 'string' or #v > 512 then return nil end
    if v:find('[%c%s]') then return nil end
    if not v:match('^https?://.') then return nil end
    return v
end

---Sanitizes a wallpaper value: a full http(s) URL passes sanitizeWallpaperUrl, anything else is
---treated as a bundled-asset key and stripped to [%w._-/:] capped at 255 chars; nil if unusable.
---@param v any client-supplied wallpaper key or URL
---@return string|nil clean wallpaper value, nil if unusable
local function sanitizeWallpaper(v)
    if type(v) ~= 'string' then return nil end
    if v:match('^https?://') then return sanitizeWallpaperUrl(v) end
    local clean = (v:gsub('[^%w%._%-/:]', ''))
    if clean == '' then return nil end
    return clean:sub(1, 255)
end

---Reads a player's wallpaper preferences: lock/home wallpaper keys (nil = unset; a home of nil
---mirrors the lock one client-side) plus the per-screen blur flags. Read-only.
---@param citizenid string framework per-character id
---@return { lock: string|nil, home: string|nil, blurLock: boolean, blurHome: boolean }
function store.getWallpapers(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return { blurLock = false, blurHome = false } end
    local row = MySQL.single.await(
        'SELECT wallpaper, wallpaper_home, blur_lock, blur_home FROM phone_settings WHERE citizenid = ? AND device = ?',
        { citizenid, device })
    if not row then return { blurLock = false, blurHome = false } end
    return {
        lock     = row.wallpaper ~= '' and row.wallpaper or nil,
        home     = row.wallpaper_home ~= '' and row.wallpaper_home or nil,
        blurLock = isTruthy(row.blur_lock),
        blurHome = isTruthy(row.blur_home),
    }
end

---Persists a player's lock and/or home wallpaper (upsert), leaving other settings intact. A
---nil / invalid field leaves that screen's wallpaper unchanged (COALESCE).
---@param citizenid string framework per-character id
---@param lock any lock-screen wallpaper key
---@param home any home-screen wallpaper key
function store.setWallpaper(citizenid, lock, home, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local l = sanitizeWallpaper(lock)
    local h = sanitizeWallpaper(home)
    if not l and not h then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, wallpaper, wallpaper_home) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            wallpaper      = COALESCE(VALUES(wallpaper), wallpaper),
            wallpaper_home = COALESCE(VALUES(wallpaper_home), wallpaper_home)
    ]], { citizenid, device, l, h })
end

---Persists a player's per-screen wallpaper blur flags (upsert); a nil field leaves that
---screen's flag unchanged (COALESCE).
---@param citizenid string framework per-character id
---@param lockOn any blur the lock screen wallpaper
---@param homeOn any blur the home screen wallpaper
function store.setBlur(citizenid, lockOn, homeOn, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if lockOn == nil and homeOn == nil then return end
    local l = lockOn ~= nil and (lockOn == true and 1 or 0) or nil
    local h = homeOn ~= nil and (homeOn == true and 1 or 0) or nil
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, blur_lock, blur_home) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            blur_lock = COALESCE(VALUES(blur_lock), blur_lock),
            blur_home = COALESCE(VALUES(blur_home), blur_home)
    ]], { citizenid, device, l, h })
end

---@type table<string, boolean> Pets the island offers. An id from an older or hand-edited client
---is stored as 'none' rather than refused, so a stale UI cannot write a pet the shell cannot draw.
local ISLAND_PETS = {
    none = true, cat = true, dog = true, fox = true, bunny = true, hamster = true,
    hedgehog = true, raccoon = true, panda = true, duck = true, penguin = true,
    owl = true, frog = true, turtle = true, axolotl = true, dragon = true,
}

---Saves the character's Dynamic Island pet.
---@param citizenid string
---@param pet any
function store.setIslandPet(citizenid, pet, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local id = type(pet) == 'string' and ISLAND_PETS[pet] and pet or 'none'
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, island_pet) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE island_pet = VALUES(island_pet)
    ]], { citizenid, device, id })
end

---@type integer Cap on saved custom wallpapers per character.
local MAX_CUSTOM_WALLPAPERS = 24

---Writes a player's custom wallpaper list (JSON array column), leaving other settings intact.
---@param citizenid string framework per-character id
---@param list string[] wallpaper URLs
local function writeCustomWallpapers(citizenid, list)
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, custom_wallpapers) VALUES (?, 'phone', ?)
        ON DUPLICATE KEY UPDATE custom_wallpapers = VALUES(custom_wallpapers)
    ]], { citizenid, json.encode(list) })
end

---Reads a player's custom wallpaper URLs (JSON array column); an unparseable column yields {}.
---Read-only.
---@param citizenid string framework per-character id
---@return string[] urls custom wallpaper URLs ({} when unset or unparseable)
function store.getCustomWallpapers(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await(
        "SELECT custom_wallpapers FROM phone_settings WHERE citizenid = ? AND device = 'phone'", { citizenid })
    if not row or not row.custom_wallpapers or row.custom_wallpapers == '' then return {} end
    local ok, decoded = pcall(json.decode, row.custom_wallpapers)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---Appends a custom wallpaper URL to a player's list; a duplicate is a silent success, and the
---list is capped at MAX_CUSTOM_WALLPAPERS.
---@param citizenid string framework per-character id
---@param url any client-supplied image URL
---@return boolean ok false when the URL is unusable or the cap is hit
function store.addCustomWallpaper(citizenid, url)
    if not citizenid or citizenid == '' then return false end
    local clean = sanitizeWallpaperUrl(url)
    if not clean then return false end
    local list = store.getCustomWallpapers(citizenid)
    for i = 1, #list do
        if list[i] == clean then return true end
    end
    if #list >= MAX_CUSTOM_WALLPAPERS then return false end
    list[#list + 1] = clean
    writeCustomWallpapers(citizenid, list)
    return true
end

---Removes a custom wallpaper URL from a player's list; an absent URL is a no-op.
---@param citizenid string framework per-character id
---@param url any URL to remove
function store.removeCustomWallpaper(citizenid, url)
    if not citizenid or citizenid == '' or type(url) ~= 'string' or url == '' then return end
    local list = store.getCustomWallpapers(citizenid)
    local kept, removed = {}, false
    for i = 1, #list do
        if list[i] == url then removed = true else kept[#kept + 1] = list[i] end
    end
    if not removed then return end
    writeCustomWallpapers(citizenid, kept)
end

---Clamps the chat-bubble text multiplier to 0.8-1.5; nil for non-numbers and NaN, infinities
---fall to the nearest bound.
---@param v any client-supplied scale
---@return number|nil scale clamped multiplier, nil if unusable
local function clampChatTextScale(v)
    local n = tonumber(v)
    if not n or n ~= n then return nil end
    if n < 0.8 then n = 0.8 elseif n > 1.5 then n = 1.5 end
    return n
end

---Reads a player's chat-bubble text size multiplier, tonumber-coerced, or nil if unset.
---Read-only.
---@param citizenid string framework per-character id
---@return number|nil scale saved multiplier
function store.getChatTextScale(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT chat_text_scale FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row or row.chat_text_scale == nil then return nil end
    return tonumber(row.chat_text_scale)
end

---Persist a player's chat-bubble text size multiplier, leaving other settings intact. An
---out-of-range / non-numeric value is ignored.
---@param citizenid string framework per-character id
---@param scale number multiplier (clamped to 0.8-1.5)
function store.setChatTextScale(citizenid, scale, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local clean = clampChatTextScale(scale)
    if not clean then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, chat_text_scale) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE chat_text_scale = VALUES(chat_text_scale)
    ]], { citizenid, device, clean })
end

---Clamps the accessibility text multiplier. Deliberately narrower than the chat scale: this one
---resizes the whole UI, and past 1.3 the fixed-height rows and the status bar start to collide.
---@param v any client-supplied multiplier
---@return number|nil value rounded to 2dp within 0.85-1.30, nil if unusable
local function clampTextScale(v)
    local n = tonumber(v)
    if not n or n ~= n then return nil end
    if n < 0.85 then n = 0.85 elseif n > 1.30 then n = 1.30 end
    return math.floor(n * 100 + 0.5) / 100
end

---Persist the accessibility trio, leaving other settings intact. Each field is optional, so the
---UI can toggle one switch without echoing the other two back.
---@param citizenid string framework per-character id
---@param opts table { reduceMotion: boolean?, boldText: boolean?, textScale: number? }
---@param device string|nil 'phone' | 'tablet'
function store.setAccessibility(citizenid, opts, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' or type(opts) ~= 'table' then return end

    local sets, args = {}, {}
    -- Motion is three levels (0 full, 1 reduced, 2 off) kept in the original boolean column: the
    -- display width in TINYINT(1) is cosmetic, the range is still -128..127.
    if opts.motion ~= nil then
        local level = math.floor(tonumber(opts.motion) or 0)
        if level >= 0 and level <= 2 then
            sets[#sets + 1] = 'reduce_motion'
            args[#args + 1] = level
        end
    end
    if opts.boldText ~= nil then
        sets[#sets + 1] = 'bold_text'
        args[#args + 1] = opts.boldText == true and 1 or 0
    end
    if opts.textScale ~= nil then
        local clean = clampTextScale(opts.textScale)
        if clean then
            sets[#sets + 1] = 'text_scale'
            args[#args + 1] = clean
        end
    end
    if #sets == 0 then return end

    -- Column names come from the fixed list above, never from the payload, so the concat cannot
    -- carry anything a client chose. Values stay bound.
    local cols, placeholders, updates = {}, {}, {}
    for i = 1, #sets do
        cols[i] = sets[i]
        placeholders[i] = '?'
        updates[i] = ('%s = VALUES(%s)'):format(sets[i], sets[i])
    end
    local insertArgs = { citizenid, device }
    for i = 1, #args do insertArgs[#insertArgs + 1] = args[i] end

    MySQL.update.await(([[
        INSERT INTO phone_settings (citizenid, device, %s) VALUES (?, ?, %s)
        ON DUPLICATE KEY UPDATE %s
    ]]):format(table.concat(cols, ', '), table.concat(placeholders, ', '), table.concat(updates, ', ')), insertArgs)
end

---Persist per-app home screen name overrides. Stored as one JSON object rather than a row per
---app: it is read on every phone open and never queried by app id, so a column is cheaper than a
---join. An empty/absent label clears that app back to its configured name.
---@param citizenid string framework per-character id
---@param labels table<string, string> appId -> label
---@param device string|nil 'phone' | 'tablet'
function store.setAppLabels(citizenid, labels, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' or type(labels) ~= 'table' then return end

    local clean, count = {}, 0
    for id, label in pairs(labels) do
        if count >= 64 then break end
        if type(id) == 'string' and id ~= '' and #id <= 64
            and type(label) == 'string' then
            local trimmed = label:gsub('^%s+', ''):gsub('%s+$', '')
            -- Only store a real override. A blank or unchanged-length-zero label means "use the
            -- configured name", and storing it would grow the blob for no reason.
            if trimmed ~= '' then
                clean[id] = trimmed:sub(1, 24)
                count = count + 1
            end
        end
    end

    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, app_labels) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE app_labels = VALUES(app_labels)
    ]], { citizenid, device, json.encode(clean) })
end

---@type table<string, boolean> The home-grid presets the UI offers. Stored as a name rather than
---an index: an index would have to agree with the order the client happens to list them in, and
---the column reads as itself in the database.
local HOME_DENSITIES = { compact = true, default = true, large = true }

---Persist the home screen density preset, leaving other settings intact. An unknown preset is
---dropped rather than stored, so a client cannot park a value the UI can never render.
---@param citizenid string framework per-character id
---@param density any client-supplied preset name
---@param device string|nil 'phone' | 'tablet'
function store.setHomeDensity(citizenid, density, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if type(density) ~= 'string' or not HOME_DENSITIES[density] then return end

    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, home_density) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE home_density = VALUES(home_density)
    ]], { citizenid, device, density })
end

---Persist the home screen icon scale, leaving other settings intact.
---
---Stored as a WHOLE PERCENT rather than the fraction the UI works in, because the column is an
---integer and a float would come back off by a rounding error every time. The bounds match the
---slider's, so a client cannot park a size the grid would refuse to render.
---@param citizenid string framework per-character id
---@param scale any client-supplied fraction, 0.85 to 1.15
---@param device string|nil 'phone' | 'tablet'
function store.setHomeIconScale(citizenid, scale, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end

    local n = tonumber(scale)
    if not n or n ~= n then return end
    local pct = lib.math.round(n * 100)
    if pct < 85 or pct > 115 then return end

    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, home_icon_scale) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE home_icon_scale = VALUES(home_icon_scale)
    ]], { citizenid, device, pct })
end

---Clamps a 0-100 slider value to an integer; nil for non-numbers and NaN, out-of-range values
---fall to the nearest bound. Shared by the phone frame scale and screen brightness.
---@param v any client-supplied slider value
---@return number|nil value integer 0-100, nil if unusable
local function clampSlider(v)
    local n = tonumber(v)
    if not n or n ~= n then return nil end
    n = lib.math.round(n)
    if n < 0 then n = 0 elseif n > 100 then n = 100 end
    return n
end

---Reads a player's phone frame scale (slider value 0-100), tonumber-coerced, or nil if unset.
---Read-only.
---@param citizenid string framework per-character id
---@return number|nil scale saved slider value
function store.getPhoneScale(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT phone_scale FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row or row.phone_scale == nil then return nil end
    return tonumber(row.phone_scale)
end

---Persists a player's phone frame scale, leaving other settings intact. An out-of-range /
---non-numeric value is ignored.
---@param citizenid string framework per-character id
---@param scale number slider value (clamped to 0-100)
function store.setPhoneScale(citizenid, scale, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local clean = clampSlider(scale)
    if not clean then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, phone_scale) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE phone_scale = VALUES(phone_scale)
    ]], { citizenid, device, clean })
end

---@type integer Degrees the phone may be turned or leaned in either direction. Mirrors TILT_LIMIT
---in web/src/shell/phoneTilt.ts, which clamps to the same range before anything is sent here.
local TILT_LIMIT <const> = 25

---Rounds one tilt angle to a whole degree inside the supported range; nil for anything
---non-numeric, so a half-broken payload cannot write a garbage axis.
---@param v any client-supplied angle in degrees
---@return integer|nil degrees
local function clampTilt(v)
    local n = tonumber(v)
    if not n or n ~= n then return nil end
    n = math.floor(n + 0.5)
    if n < -TILT_LIMIT then n = -TILT_LIMIT elseif n > TILT_LIMIT then n = TILT_LIMIT end
    return n
end

---Persists a player's 3D tilt: turn is the rotateY angle, lean the rotateX one. A flat 0/0 IS
---stored rather than skipped, because that is how a player turns the effect back off - only a
---payload with no usable axis at all is ignored.
---@param citizenid string framework per-character id
---@param tilt { turn?: number, lean?: number }
function store.setPhoneTilt(citizenid, tilt, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' or type(tilt) ~= 'table' then return end
    local turn, lean = clampTilt(tilt.turn), clampTilt(tilt.lean)
    if not turn and not lean then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, phone_tilt) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE phone_tilt = VALUES(phone_tilt)
    ]], { citizenid, device, json.encode({ turn = turn or 0, lean = lean or 0 }) })
end

---@type table<string, boolean> Dock tray treatments the UI offers. Mirrors DOCK_STYLES in
---web/src/shell/shellLook.ts; anything else is dropped rather than stored, so a stale client
---cannot park a value the shell has no rendering for.
local DOCK_STYLES <const> = {
    glass = true, tinted = true, solid = true, outline = true, clear = true, hidden = true,
}

---@type table<string, boolean> Phone open/close animation styles. Mirrors OPEN_ANIMS in the same
---module, on the same terms.
local OPEN_ANIMS <const> = { slide = true, fade = true, pop = true, flip = true }

---Persists the caller's shell presentation preferences: dock treatment, open/close animation and
---wallpaper parallax. Fields are individually optional, so flipping one control does not have to
---echo the other two back, and an unrecognised value leaves that column as it was.
---@param citizenid string framework per-character id
---@param opts { dockStyle?: string, openAnim?: string, wallpaperParallax?: boolean }
function store.setInterface(citizenid, opts, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' or type(opts) ~= 'table' then return end

    local sets, args = {}, {}
    if opts.dockStyle ~= nil and DOCK_STYLES[opts.dockStyle] then
        sets[#sets + 1] = 'dock_style'
        args[#args + 1] = opts.dockStyle
    end
    if opts.openAnim ~= nil and OPEN_ANIMS[opts.openAnim] then
        sets[#sets + 1] = 'open_anim'
        args[#args + 1] = opts.openAnim
    end
    if opts.wallpaperParallax ~= nil then
        sets[#sets + 1] = 'wallpaper_parallax'
        args[#args + 1] = opts.wallpaperParallax == true and 1 or 0
    end
    if #sets == 0 then return end

    -- Column names come from the fixed list above, never from the payload, so the concat cannot
    -- carry anything a client chose. Values stay bound.
    local cols, placeholders, updates = {}, {}, {}
    for i = 1, #sets do
        cols[i] = sets[i]
        placeholders[i] = '?'
        updates[i] = ('%s = VALUES(%s)'):format(sets[i], sets[i])
    end
    local insertArgs = { citizenid, device }
    for i = 1, #args do insertArgs[#insertArgs + 1] = args[i] end

    MySQL.update.await(([[
        INSERT INTO phone_settings (citizenid, device, %s) VALUES (?, ?, %s)
        ON DUPLICATE KEY UPDATE %s
    ]]):format(table.concat(cols, ', '), table.concat(placeholders, ', '), table.concat(updates, ', ')), insertArgs)
end

---Reads a player's screen brightness (slider value 0-100), or nil when never set.
---@param citizenid string framework per-character id
---@return number|nil brightness
function store.getBrightness(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT brightness FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row or row.brightness == nil then return nil end
    return tonumber(row.brightness)
end

---Persists a player's screen brightness, leaving other settings intact. An out-of-range /
---non-numeric value is ignored. 0 is a valid setting (fully dimmed), so the clamp result is
---compared against nil rather than tested for truthiness.
---@param citizenid string framework per-character id
---@param brightness number slider value (clamped to 0-100)
function store.setBrightness(citizenid, brightness, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local clean = clampSlider(brightness)
    if clean == nil then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, brightness) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE brightness = VALUES(brightness)
    ]], { citizenid, device, clean })
end

-- Mirrors the PhoneAlign union in web/src/stores/themeStore.tsx.
---@type table<string, boolean> Whitelist of storable phone anchor positions.
local PHONE_ALIGNS = {
    ['top-left'] = true,    ['top-center'] = true,    ['top-right'] = true,
    ['middle-left'] = true, ['middle-center'] = true, ['middle-right'] = true,
    ['bottom-left'] = true, ['bottom-center'] = true, ['bottom-right'] = true,
}

---Reads a player's phone anchor position, or nil if unset. Read-only.
---@param citizenid string framework per-character id
---@return string|nil align saved anchor position
function store.getPhoneAlign(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT phone_align FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row or not row.phone_align or row.phone_align == '' then return nil end
    return row.phone_align
end

---Persists a player's phone anchor position, whitelist-checked against PHONE_ALIGNS.
---@param citizenid string framework per-character id
---@param align any client-supplied anchor position
function store.setPhoneAlign(citizenid, align, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if type(align) ~= 'string' or not PHONE_ALIGNS[align] then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, phone_align) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE phone_align = VALUES(phone_align)
    ]], { citizenid, device, align })
end

---Clamps a volume to an integer 0-100; nil for non-numbers and NaN, out-of-range values fall to
---the nearest bound.
---@param v any client-supplied volume
---@return number|nil volume integer 0-100, nil if unusable
local function clampVolume(v)
    local n = tonumber(v)
    if not n or n ~= n then return nil end
    n = lib.math.round(n)
    if n < 0 then n = 0 elseif n > 100 then n = 100 end
    return n
end

---Reads a player's ringtone and call volumes (0-100); each field is nil when unset, and a stored
---0 is returned as 0. Read-only.
---@param citizenid string framework per-character id
---@return { ringtone: number|nil, call: number|nil }
function store.getVolumes(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await(
        'SELECT ringtone_volume, call_volume FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row then return {} end
    return {
        ringtone = row.ringtone_volume ~= nil and tonumber(row.ringtone_volume) or nil,
        call     = row.call_volume     ~= nil and tonumber(row.call_volume)     or nil,
    }
end

---Persists a player's ringtone and/or call volume (upsert), leaving other settings intact. Each
---field is clamped to 0-100; a nil / invalid field leaves that column unchanged (COALESCE).
---@param citizenid string framework per-character id
---@param ringtone any ringtone-and-alert volume 0-100
---@param call any call volume 0-100
function store.setVolumes(citizenid, ringtone, call, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local r = clampVolume(ringtone)
    local c = clampVolume(call)
    if r == nil and c == nil then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, ringtone_volume, call_volume)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            ringtone_volume = COALESCE(VALUES(ringtone_volume), ringtone_volume),
            call_volume     = COALESCE(VALUES(call_volume), call_volume)
    ]], { citizenid, device, r, c })
end

---Whether a locale code is one this install ships a catalogue for.
---@param code any client-supplied locale code
---@return boolean
local function storableLocale(code)
    if type(code) ~= 'string' or code == '' then return false end
    for _, available in ipairs(localeBridge.available()) do
        if available == code then return true end
    end
    return false
end

---Reads a player's saved phone language, or nil if unset. Read-only.
---@param citizenid string framework per-character id
---@return string|nil locale saved locale code
function store.getLocale(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT locale FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row or not row.locale or row.locale == '' then return nil end
    return row.locale
end

---Persists a player's chosen phone language, refused unless a catalogue for it is on disk.
---@param citizenid string framework per-character id
---@param locale any client-supplied locale code
function store.setLocale(citizenid, locale, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if not storableLocale(locale) then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, locale) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE locale = VALUES(locale)
    ]], { citizenid, device, locale })
end

---Clamps a passcode to a bare 4-6 digit string, or nil.
---@param v any client-supplied passcode
---@return string|nil pin 4-6 digit string, nil if unusable
local function sanitizePin(v)
    if type(v) ~= 'string' then return nil end
    return v:match('^%d%d%d%d%d?%d?$')
end

---Reads a player's lock security (passcode + Face Unlock); `passcode` is nil when no code is
---set and `faceId` is forced false whenever no passcode exists. Read-only.
---@param citizenid string framework per-character id
---@return { passcode: string|nil, faceId: boolean }
function store.getSecurity(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return { passcode = nil, faceId = false } end
    local row = MySQL.single.await('SELECT passcode, face_id FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row then return { passcode = nil, faceId = false } end
    local pin = sanitizePin(row.passcode)
    return { passcode = pin, faceId = pin ~= nil and isTruthy(row.face_id) }
end

---Persists a player's lock security; a nil or non-4-6-digit `passcode` clears it and forces
---Face Unlock off.
---@param citizenid string framework per-character id
---@param passcode string|nil 4-6 digit code, nil to clear
---@param faceId boolean Face Unlock enabled (only honoured alongside a valid passcode)
function store.setSecurity(citizenid, passcode, faceId, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local pin = sanitizePin(passcode)
    local face = pin ~= nil and faceId == true
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, passcode, face_id) VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE passcode = VALUES(passcode), face_id = VALUES(face_id)
    ]], { citizenid, device, pin, face and 1 or 0 })
end

---Reads a player's saved tone selections; fields are nil when unset. Read-only.
---@param citizenid string framework per-character id
---@return { ringtone: string|nil, notificationTone: string|nil }
function store.getTones(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await(
        'SELECT ringtone, notification_tone FROM phone_settings WHERE citizenid = ? AND device = ?',
        { citizenid, device }
    )
    return {
        ringtone         = row and row.ringtone or nil,
        notificationTone = row and row.notification_tone or nil,
    }
end

-- In-memory airplane-mode cache, keyed by citizenid; the DB holds the durable copy.
---@type table<string, boolean> Cached airplane-mode flag per citizenid.
local airplaneCache = {}

---Cache key for one device's airplane flag. Keyed by citizenid AND device because the column is
---per-device: a shared key would let the tablet answer with the phone's radio state.
---@param citizenid string framework per-character id
---@param device string device id
---@return string key
local function airplaneKey(citizenid, device)
    return citizenid .. '\0' .. device
end

---Returns true if a player currently has airplane mode on, lazily warming the cache from the DB
---on first read.
---@param citizenid string framework per-character id
---@return boolean on
function store.isAirplane(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return false end
    local cached = airplaneCache[airplaneKey(citizenid, device)]
    if cached ~= nil then return cached end
    local row = MySQL.single.await('SELECT airplane_mode FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    local on = row ~= nil and isTruthy(row.airplane_mode)
    airplaneCache[airplaneKey(citizenid, device)] = on
    return on
end

---Sets a player's airplane mode: cache first, then the DB write-through.
---@param citizenid string framework per-character id
---@param on boolean airplane mode enabled
function store.setAirplane(citizenid, on, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    on = on == true
    airplaneCache[airplaneKey(citizenid, device)] = on
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, airplane_mode) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE airplane_mode = VALUES(airplane_mode)
    ]], { citizenid, device, on and 1 or 0 })
end

---Drops a character's cached airplane state, so the next read reloads from the row. Anything
---that writes airplane_mode WITHOUT going through setAirplane - the settings reset rewrites the
---whole row - has to call this, or the server keeps answering from the stale cache and calls
---stay blocked on a phone whose airplane toggle reads off.
---@param citizenid string framework per-character id
---@param device string|nil device key, defaults to 'phone'
function store.forgetAirplane(citizenid, device)
    if not citizenid or citizenid == '' then return end
    airplaneCache[airplaneKey(citizenid, device or 'phone')] = nil
end

---Clears a character's per-app notification preferences, so every app goes back to its default
---of notifying. These live in their own table, so wiping the settings row does not touch them.
---@param citizenid string framework per-character id
function store.resetNotifPrefs(citizenid)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await('DELETE FROM phone_notif_prefs WHERE citizenid = ?', { citizenid })
end

---The server default 24-hour preference for a player who has never toggled it
---(config.Lockscreen.Use24Hour).
---@return boolean default
local function defaultHour24()
    return (config.Lockscreen and config.Lockscreen.Use24Hour) == true
end

---Returns true if a player prefers 24-hour time, falling back to the configured default when
---the hour24 column is NULL. Read-only.
---@param citizenid string framework per-character id
---@return boolean hour24
function store.getHour24(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return defaultHour24() end
    local row = MySQL.single.await('SELECT hour24 FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if row and row.hour24 ~= nil then
        return row.hour24 == true or tonumber(row.hour24) == 1
    end
    return defaultHour24()
end

---True once this profile finished the first-run setup. Server-side twin of the client's
---localStorage flag, so a cleared FiveM cache or another PC never re-runs Hello. Read-only.
---@param citizenid string framework per-character id
---@return boolean done
function store.getSetupDone(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return false end
    local row = MySQL.single.await('SELECT setup_done FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    return row ~= nil and (row.setup_done == true or tonumber(row.setup_done) == 1)
end

---Marks this profile's first-run setup as completed (upsert, one-way).
---@param citizenid string framework per-character id
function store.setSetupDone(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, setup_done) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE setup_done = 1
    ]], { citizenid, device })
end

---Returns true when a player's number may be shown to whoever they call, defaulting to true
---when the caller_id column is NULL (an unset preference is not a withheld one). Read-only.
---
---The IS NULL flag is not decoration: oxmysql maps a TINYINT(1) to a Lua boolean, and a NULL
---one arrives as `false` rather than nil, so an unset column is indistinguishable from a stored
---0 unless the query says so. Reading it directly defaulted every phone to withholding.
---@param citizenid string framework per-character id
---@return boolean showCallerId
function store.getCallerId(citizenid)
    if not citizenid or citizenid == '' then return true end
    local row = MySQL.single.await(
        'SELECT caller_id, caller_id IS NULL AS caller_id_unset FROM phone_settings WHERE citizenid = ?',
        { citizenid })
    if row and not isTruthy(row.caller_id_unset) then
        return isTruthy(row.caller_id)
    end
    return true
end

---Persists whether this player's number is shown to whoever they call (upsert).
---@param citizenid string framework per-character id
---@param on boolean show my number on outgoing calls
function store.setCallerId(citizenid, on)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, caller_id) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE caller_id = VALUES(caller_id)
    ]], { citizenid, on == true and 1 or 0 })
end

---Returns true when a player has Streamer Mode on, defaulting to false. Read-only.
---@param citizenid string framework per-character id
---@return boolean streamerMode
function store.getStreamerMode(citizenid)
    if not citizenid or citizenid == '' then return false end
    local row = MySQL.single.await('SELECT streamer_mode FROM phone_settings WHERE citizenid = ?', { citizenid })
    return row ~= nil and (row.streamer_mode == true or tonumber(row.streamer_mode) == 1)
end

---@type table<string, true> The categories Streamer Mode can hide. A key absent from a stored
---config means "hide it": the master switch is opt-out per category, so a config written by an
---older client keeps hiding anything it did not know about rather than silently exposing it.
local STREAMER_KEYS = {
    balance = true, transactions = true, card = true,
    investments = true, number = true, previews = true,
}

---Returns a player's per-category Streamer Mode config, or nil when they have never tuned it
---(which the client reads as "hide everything"). Read-only.
---@param citizenid string framework per-character id
---@return table<string, boolean>|nil
function store.getStreamerHide(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT streamer_hide FROM phone_settings WHERE citizenid = ?', { citizenid })
    if not row or not row.streamer_hide or row.streamer_hide == '' then return nil end
    local ok, decoded = pcall(json.decode, row.streamer_hide)
    if not ok or type(decoded) ~= 'table' then return nil end
    return decoded
end

---Persists a player's per-category Streamer Mode config, rebuilding the stored JSON from only
---the known keys so a patched client cannot grow the column without bound.
---@param citizenid string framework per-character id
---@param cfg table<string, boolean>
function store.setStreamerHide(citizenid, cfg)
    if not citizenid or citizenid == '' or type(cfg) ~= 'table' then return end
    local clean = {}
    for key in pairs(STREAMER_KEYS) do
        clean[key] = cfg[key] ~= false
    end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, streamer_hide) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE streamer_hide = VALUES(streamer_hide)
    ]], { citizenid, json.encode(clean) })
end

---Persists a player's Streamer Mode preference (upsert), coerced to a strict boolean.
---@param citizenid string framework per-character id
---@param on boolean hide money figures on screen
function store.setStreamerMode(citizenid, on)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, streamer_mode) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE streamer_mode = VALUES(streamer_mode)
    ]], { citizenid, on == true and 1 or 0 })
end

---Persists a player's 24-hour time preference (upsert), coerced to a strict boolean.
---@param citizenid string framework per-character id
---@param on boolean prefer 24-hour time
function store.setHour24(citizenid, on)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, hour24) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE hour24 = VALUES(hour24)
    ]], { citizenid, on == true and 1 or 0 })
end

---Returns true if a player wants the phone to reopen into the holstered app, defaulting to
---false when the reopen_app column is NULL. Read-only.
---@param citizenid string framework per-character id
---@return boolean reopenApp
function store.getReopenApp(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return false end
    local row = MySQL.single.await('SELECT reopen_app FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if row and row.reopen_app ~= nil then
        return row.reopen_app == true or tonumber(row.reopen_app) == 1
    end
    return false
end

---Persists a player's reopen-into-app preference (upsert), coerced to a strict boolean.
---@param citizenid string framework per-character id
---@param on boolean reopen into the holstered app
function store.setReopenApp(citizenid, on, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, reopen_app) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE reopen_app = VALUES(reopen_app)
    ]], { citizenid, device, on == true and 1 or 0 })
end

---Returns a player's light/dark theme, defaulting to 'light'. Read-only.
---@param citizenid string framework per-character id
---@return string theme 'light' | 'dark'
function store.getTheme(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return 'light' end
    local row = MySQL.single.await('SELECT theme FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    return row and row.theme == 'dark' and 'dark' or 'light'
end

---Persists a player's light/dark theme (upsert), whitelisted to the known values.
---@param citizenid string framework per-character id
---@param theme string 'light' | 'dark'
function store.setTheme(citizenid, theme, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    theme = theme == 'dark' and 'dark' or 'light'
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, theme) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE theme = VALUES(theme)
    ]], { citizenid, device, theme })
end

-- Mirrors CUSTOM_ID in web/src/apps/settings/appearance/paletteRamp.ts.
---@type integer Bounds on the slug after the 'custom:' prefix. 8 keeps the longest id at 15
---characters, which is what lets a player-designed palette share dark_theme VARCHAR(16).
local CUSTOM_PALETTE_MIN, CUSTOM_PALETTE_MAX = 4, 8

---True for a well-formed player-designed palette id.
---@param v any client-supplied palette id
---@return boolean
local function isCustomPaletteId(v)
    if type(v) ~= 'string' or not v:match('^custom:[a-z0-9]+$') then return false end
    local slug = #v - #'custom:'
    return slug >= CUSTOM_PALETTE_MIN and slug <= CUSTOM_PALETTE_MAX
end
---@type table<string, boolean> Selectable dark-mode palettes; anything else falls back to graphite.
local DARK_THEMES = { graphite = true, black = true, warm = true, midnight = true, moss = true, plum = true, slate = true, ocean = true, rose = true, clay = true }

---@type table<string, boolean> Selectable light-mode palettes; anything else falls back to silver.
local LIGHT_THEMES = { silver = true, snow = true, linen = true, sky = true, mint = true, blush = true, sand = true, lavender = true, stone = true, dusk = true }

---@type table<string, boolean> Preset accent colours; mirrors ACCENT_PRESETS in web/src/apps/settings/appearance/accentRamp.ts.
local ACCENTS = {
    blue = true, indigo = true, purple = true, pink = true, red = true, orange = true,
    yellow = true, green = true, mint = true, teal = true, brown = true, gray = true,
}

---@type string Accent used when the stored value is missing or not storable.
local ACCENT_DEFAULT = 'blue'

---A custom accent is stored as `custom:<hue>`, hue being 0-359.
---@param v any client-supplied accent id
---@return boolean
local function isCustomAccentId(v)
    if type(v) ~= 'string' then return false end
    local hue = v:match('^custom:(%d%d?%d?)$')
    return hue ~= nil and tonumber(hue) <= 359
end

---@param v any client-supplied accent id
---@return boolean
local function isStorableAccent(v)
    return type(v) == 'string' and (ACCENTS[v] == true or isCustomAccentId(v))
end

---@type table<string, boolean> Chassis ids that exist in the UI bundle; mirrors SHELLS in
---web/src/shell/shells.ts. A config naming anything else is ignored rather than trusted.
local SHELL_IDS = {
    ios = true, android = true, edge = true, classic = true, compact = true,
    droplet = true, dual = true, rugged = true, gaming = true, waterfall = true,
}

---@type string Shell used when nothing valid is stored and the config forces nothing.
local SHELL_DEFAULT = 'ios'

---@type table Shell policy (configs/shells.lua).
local SHELL_CFG = config.Shells or {}

---The shells a player may actually be on, config order preserved, unknown ids dropped. Never
---empty: a config that lists nothing real still leaves the default, so the picker cannot brick.
---@return string[] ids
local function allowedShells()
    local out = {}
    local list = type(SHELL_CFG.Allowed) == 'table' and SHELL_CFG.Allowed or {}
    for i = 1, #list do
        local id = list[i]
        if SHELL_IDS[id] then out[#out + 1] = id end
    end
    if #out == 0 then out[1] = SHELL_DEFAULT end
    return out
end

---Resolves what a stored choice actually renders as. Forced wins over the player's pick without
---overwriting it, so clearing Forced hands their own shell back instead of resetting it.
---@param stored any the player's stored shell, if any
---@return string shell, boolean allowChoice
local function resolveShell(stored)
    local allowed = allowedShells()
    local forced  = SHELL_IDS[SHELL_CFG.Forced] and SHELL_CFG.Forced or nil
    local choose  = SHELL_CFG.AllowPlayerChoice ~= false and forced == nil
    if forced then return forced, false end
    for i = 1, #allowed do
        if allowed[i] == stored then return stored, choose end
    end
    return allowed[1], choose
end

---Persists the caller's chassis choice. Stored even when the config currently forces a shell, so
---the pick survives an operator turning Forced on and off again.
---@param citizenid string framework per-character id
---@param shell string a key of SHELL_IDS
function store.setShell(citizenid, shell, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if not SHELL_IDS[shell] then return end
    if not lib.table.contains(allowedShells(), shell) then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, shell) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE shell = VALUES(shell)
    ]], { citizenid, device, shell })
end

---Returns a player's selected dark-mode palette, defaulting to 'graphite'. Read-only.
---@param citizenid string framework per-character id
---@return string darkTheme a key of DARK_THEMES
function store.getDarkTheme(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return 'graphite' end
    local row = MySQL.single.await('SELECT dark_theme FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    local v = row and row.dark_theme
    if type(v) == 'string' and (DARK_THEMES[v] or isCustomPaletteId(v)) then return v end
    return 'graphite'
end

---Persists a player's dark-mode palette (upsert), whitelisted to the known values.
---@param citizenid string framework per-character id
---@param theme string a key of DARK_THEMES
function store.setDarkTheme(citizenid, theme, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if type(theme) ~= 'string' or not (DARK_THEMES[theme] or isCustomPaletteId(theme)) then theme = 'graphite' end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, dark_theme) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE dark_theme = VALUES(dark_theme)
    ]], { citizenid, device, theme })
end
function store.getLightTheme(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return 'silver' end
    local row = MySQL.single.await('SELECT light_theme FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    local v = row and row.light_theme
    if type(v) == 'string' and (LIGHT_THEMES[v] or isCustomPaletteId(v)) then return v end
    return 'silver'
end

---Persists a player's light-mode palette (upsert), whitelisted to the known values.
---@param citizenid string framework per-character id
---@param theme string a key of LIGHT_THEMES
function store.setLightTheme(citizenid, theme, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if type(theme) ~= 'string' or not (LIGHT_THEMES[theme] or isCustomPaletteId(theme)) then theme = 'silver' end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, light_theme) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE light_theme = VALUES(light_theme)
    ]], { citizenid, device, theme })
end

---Persists whether the phone shows the in-game clock instead of the player's PC clock.
---@param citizenid string framework per-character id
---@param on boolean true to show game time
function store.setGameTime(citizenid, on, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, game_time) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE game_time = VALUES(game_time)
    ]], { citizenid, device, on and 1 or 0 })
end

---Persists the accent colour applied over whichever palette is active.
---@param citizenid string framework per-character id
---@param accent string a key of ACCENTS or `custom:<hue>`
function store.setAccent(citizenid, accent, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if not isStorableAccent(accent) then accent = ACCENT_DEFAULT end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, accent) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE accent = VALUES(accent)
    ]], { citizenid, device, accent })
end

-- Mirrors the IconThemeId union in web/src/stores/iconThemeStore.ts.
---@type table<string, boolean> Whitelist of storable home-screen icon themes.
local ICON_THEMES = {
    default = true, glass  = true, flat = true, light = true, pastel   = true,
    sand    = true, slate  = true, tinted = true, noir = true, mono    = true,
    contrast = true,
}

-- Mirrors CUSTOM_ID / MAX_CUSTOM_ICON_THEMES in web/src/stores/iconThemeStore.ts.
---@type integer Bounds on the slug after the 'custom:' prefix. 8 keeps the longest id at 15
---characters, which is what lets a player-designed theme share icon_theme VARCHAR(16).
local CUSTOM_ICON_MIN, CUSTOM_ICON_MAX = 4, 8
---@type integer Cap on player-designed icon themes per character.
local MAX_CUSTOM_ICON_THEMES = 12
---@type integer Cap on a player-designed theme's display name, in characters.
local CUSTOM_ICON_NAME_MAX = 24
-- Mirrors IconTexture in web/src/stores/iconThemeStore.ts.
---@type table<string, boolean> Whitelist of tile textures a theme may name.
local ICON_TEXTURES = { none = true, noise = true, dots = true, stripes = true }
---@type integer Cap on per-app overrides inside one theme.
local MAX_ICON_OVERRIDES = 40
---@type table|nil Lua 5.4 utf8 library, so a name is bounded in characters rather than bytes.
local utf8lib = _G.utf8

---True for a well-formed player-designed icon theme id, whether or not that theme exists. The
---UI applies before it saves, so an id is accepted here and falls back to Default at render.
---@param v any client-supplied icon theme id
---@return boolean
local function isCustomIconId(v)
    if type(v) ~= 'string' or not v:match('^custom:[a-z0-9]+$') then return false end
    local slug = #v - #'custom:'
    return slug >= CUSTOM_ICON_MIN and slug <= CUSTOM_ICON_MAX
end

---True for any icon theme id this server will store: a built-in, or a well-formed custom one.
---@param v any client-supplied icon theme id
---@return boolean
local function isStorableIconTheme(v)
    return (type(v) == 'string' and ICON_THEMES[v] == true) or isCustomIconId(v)
end

---Returns a player's home-screen icon theme, defaulting to 'default'. Read-only.
---@param citizenid string framework per-character id
---@return string iconTheme a built-in id or a 'custom:' one
function store.getIconTheme(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return 'default' end
    local row = MySQL.single.await('SELECT icon_theme FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    local v = row and row.icon_theme
    if isStorableIconTheme(v) then return v end
    return 'default'
end

---Persists a player's home-screen icon theme (upsert), whitelisted to the built-ins plus any
---well-formed custom id.
---@param citizenid string framework per-character id
---@param theme any client-supplied icon theme id
function store.setIconTheme(citizenid, theme, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    if not isStorableIconTheme(theme) then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, icon_theme) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE icon_theme = VALUES(icon_theme)
    ]], { citizenid, device, theme })
end

---A trimmed name's length in characters, or nil when the string is not valid UTF-8.
---@param s string trimmed display name
---@return integer|nil chars
local function nameLength(s)
    if utf8lib then return utf8lib.len(s) end
    return #s
end

---Validates one colour recipe: the source, the base colour a 'fixed' source needs, and the
---optional toward/amount mix pair, which is all-or-nothing. Nil for anything malformed.
---@param v any client-supplied recipe
---@return table|nil recipe { from: string, color: string|nil, toward: string|nil, amount: number|nil }
local function sanitizeRecipe(v)
    if type(v) ~= 'table' then return nil end
    if v.from ~= 'accent' and v.from ~= 'fixed' then return nil end
    local clean = { from = v.from }
    if v.color ~= nil then
        local hex = sanitizeHex(v.color)
        if not hex then return nil end
        clean.color = hex
    elseif v.from == 'fixed' then
        return nil
    end
    if (v.toward ~= nil) ~= (v.amount ~= nil) then return nil end
    if v.toward ~= nil then
        local hex = sanitizeHex(v.toward)
        if not hex then return nil end
        if type(v.amount) ~= 'number' or v.amount ~= v.amount then return nil end
        if v.amount < 0 or v.amount > 1 then return nil end
        clean.toward = hex
        clean.amount = v.amount
    end
    return clean
end

---A finite number inside [lo, hi], or nil. The type test drops NaN, and both infinities fall out
---of the bounds compare.
---@param v any client-supplied number
---@param lo number inclusive lower bound
---@param hi number inclusive upper bound
---@return number|nil value
local function boundedNumber(v, lo, hi)
    if type(v) ~= 'number' or v ~= v then return nil end
    if v < lo or v > hi then return nil end
    return v
end

---True for a plausible app or glyph id: at most 32 characters of [a-z0-9_-] behind an
---alphanumeric first one, which is also what keeps '__proto__' out of the overrides map.
---@param v any client-supplied id
---@return boolean
local function isAppId(v)
    if type(v) ~= 'string' or #v > 32 then return false end
    return v:match('^[a-z0-9][a-z0-9_%-]*$') ~= nil
end

---Validates a theme's per-app overrides, capped at MAX_ICON_OVERRIDES entries. An empty table is
---a legal no-op; nil refuses the whole theme.
---@param v any client-supplied override map
---@return table|nil overrides appId -> { background: table|nil, glyph: table|nil, icon: string|nil }
local function sanitizeIconOverrides(v)
    if type(v) ~= 'table' then return nil end
    local out, count = {}, 0
    for key, entry in pairs(v) do
        if not isAppId(key) or type(entry) ~= 'table' then return nil end
        local clean, fields = {}, 0
        if entry.background ~= nil then
            clean.background = sanitizeRecipe(entry.background)
            if not clean.background then return nil end
            fields = fields + 1
        end
        if entry.glyph ~= nil then
            clean.glyph = sanitizeRecipe(entry.glyph)
            if not clean.glyph then return nil end
            fields = fields + 1
        end
        if entry.icon ~= nil then
            if not isAppId(entry.icon) then return nil end
            clean.icon = entry.icon
            fields = fields + 1
        end
        if fields == 0 then return nil end
        count = count + 1
        if count > MAX_ICON_OVERRIDES then return nil end
        out[key] = clean
    end
    return out
end

---Validates one label style block: colour recipe, CSS font weight and the show flag.
---@param v any client-supplied label block
---@return table|nil label { color: table|nil, weight: number|nil, show: boolean|nil }
local function sanitizeIconLabel(v)
    if type(v) ~= 'table' then return nil end
    local clean = {}
    if v.color ~= nil then
        clean.color = sanitizeRecipe(v.color)
        if not clean.color then return nil end
    end
    if v.weight ~= nil then
        clean.weight = boundedNumber(v.weight, 100, 900)
        if not clean.weight then return nil end
    end
    if v.show ~= nil then
        if type(v.show) ~= 'boolean' then return nil end
        clean.show = v.show
    end
    return clean
end

---Validates a tile border: the colour recipe is required, the width is 0-4 pixels.
---@param v any client-supplied border block
---@return table|nil border { color: table, width: number }
local function sanitizeIconBorder(v)
    if type(v) ~= 'table' then return nil end
    local color = sanitizeRecipe(v.color)
    local width = boundedNumber(v.width, 0, 4)
    if not color or not width then return nil end
    return { color = color, width = width }
end

---Validates a theme's wallpaper exactly as the wallpaper setting does, but refusing anything
---sanitizeWallpaper would have had to rewrite: a theme is stored whole or not at all.
---@param v any client-supplied wallpaper key or URL
---@return string|nil wallpaper
local function sanitizeThemeWallpaper(v)
    local clean = sanitizeWallpaper(v)
    if clean ~= v then return nil end
    return clean
end

---Writes the optional look fields a theme shares with its dark variant onto `clean`. False when a
---field that IS present is malformed, which drops the whole theme.
---@param v table client-supplied theme or variant
---@param clean table destination, mutated in place
---@return boolean ok
local function applyIconTraits(v, clean)
    if v.radius ~= nil then
        clean.radius = boundedNumber(v.radius, 0, 0.5)
        if not clean.radius then return false end
    end
    if v.background2 ~= nil then
        clean.background2 = sanitizeRecipe(v.background2)
        if not clean.background2 then return false end
    end
    if v.angle ~= nil then
        clean.angle = boundedNumber(v.angle, 0, 360)
        if not clean.angle then return false end
    end
    if v.gloss ~= nil then
        clean.gloss = boundedNumber(v.gloss, 0, 1)
        if not clean.gloss then return false end
    end
    if v.texture ~= nil then
        if type(v.texture) ~= 'string' or not ICON_TEXTURES[v.texture] then return false end
        clean.texture = v.texture
    end
    if v.glyphScale ~= nil then
        clean.glyphScale = boundedNumber(v.glyphScale, 0.6, 1.4)
        if not clean.glyphScale then return false end
    end
    if v.glyphWeight ~= nil then
        clean.glyphWeight = boundedNumber(v.glyphWeight, 1, 3)
        if not clean.glyphWeight then return false end
    end
    if v.hue ~= nil then
        clean.hue = boundedNumber(v.hue, -180, 180)
        if not clean.hue then return false end
    end
    if v.saturation ~= nil then
        clean.saturation = boundedNumber(v.saturation, 0, 2)
        if not clean.saturation then return false end
    end
    if v.border ~= nil then
        clean.border = sanitizeIconBorder(v.border)
        if not clean.border then return false end
    end
    if v.bevel ~= nil then
        if type(v.bevel) ~= 'boolean' then return false end
        if v.bevel then clean.bevel = true end
    end
    if v.glow ~= nil then
        clean.glow = boundedNumber(v.glow, 0, 1)
        if not clean.glow then return false end
    end
    if v.label ~= nil then
        local label = sanitizeIconLabel(v.label)
        if not label then return false end
        if next(label) ~= nil then clean.label = label end
    end
    if v.overrides ~= nil then
        local overrides = sanitizeIconOverrides(v.overrides)
        if not overrides then return false end
        if next(overrides) ~= nil then clean.overrides = overrides end
    end
    if v.wallpaper ~= nil then
        clean.wallpaper = sanitizeThemeWallpaper(v.wallpaper)
        if not clean.wallpaper then return false end
    end
    return true
end

---Validates a theme's dark-mode variant: every field the theme itself carries, minus a nested
---variant of its own.
---@param v any client-supplied variant
---@return table|nil variant
local function sanitizeIconVariant(v)
    if type(v) ~= 'table' or v.dark ~= nil then return nil end
    local clean = {}
    if v.background ~= nil then
        clean.background = sanitizeRecipe(v.background)
        if not clean.background then return nil end
    end
    if v.glyph ~= nil then
        clean.glyph = sanitizeRecipe(v.glyph)
        if not clean.glyph then return nil end
    end
    if v.depth ~= nil then
        if type(v.depth) ~= 'boolean' then return nil end
        if v.depth then clean.depth = true end
    end
    if not applyIconTraits(v, clean) then return nil end
    return clean
end

---Validates one player-designed icon theme, rebuilding it from only the sanitised fields so no
---client JSON is ever stored verbatim. Nil when any field is malformed.
---@param v any client-supplied theme
---@return table|nil theme { id: string, name: string, background: table, glyph: table, ... }
local function sanitizeCustomIconTheme(v)
    if type(v) ~= 'table' or not isCustomIconId(v.id) then return nil end
    if type(v.name) ~= 'string' then return nil end
    local name = (v.name:gsub('^%s+', ''):gsub('%s+$', ''))
    local chars = nameLength(name)
    if not chars or chars < 1 or chars > CUSTOM_ICON_NAME_MAX then return nil end
    if v.depth ~= nil and type(v.depth) ~= 'boolean' then return nil end
    local background = sanitizeRecipe(v.background)
    local glyph      = sanitizeRecipe(v.glyph)
    if not background or not glyph then return nil end
    local clean = { id = v.id, name = name, background = background, glyph = glyph }
    if v.depth == true then clean.depth = true end
    if not applyIconTraits(v, clean) then return nil end
    if v.dark ~= nil then
        local dark = sanitizeIconVariant(v.dark)
        if not dark then return nil end
        if next(dark) ~= nil then clean.dark = dark end
    end
    return clean
end

---Decodes an icon_custom column into validated themes; an unparseable column, a malformed entry
---or a duplicate id is dropped rather than served.
---@param raw any stored column value
---@return table[] themes
local function decodeCustomIconThemes(raw)
    if not raw or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return {} end
    local out, seen = {}, {}
    for i = 1, #decoded do
        local clean = sanitizeCustomIconTheme(decoded[i])
        if clean and not seen[clean.id] and #out < MAX_CUSTOM_ICON_THEMES then
            seen[clean.id] = true
            out[#out + 1] = clean
        end
    end
    return out
end

---Reads a player's player-designed icon themes (JSON array column); an unparseable column or a
---malformed entry yields nothing for that entry. Read-only.
---@param citizenid string framework per-character id
---@return table[] themes
function store.getCustomIconThemes(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await("SELECT icon_custom FROM phone_settings WHERE citizenid = ? AND device = 'phone'", { citizenid })
    if not row then return {} end
    return decodeCustomIconThemes(row.icon_custom)
end

---Upserts one player-designed icon theme by id, capped at MAX_CUSTOM_ICON_THEMES per character.
---@param citizenid string framework per-character id
---@param theme any client-supplied theme definition
---@return boolean ok, string|nil reason 'invalid' or 'limit' when refused
function store.saveCustomIconTheme(citizenid, theme)
    if not citizenid or citizenid == '' then return false, 'invalid' end
    local clean = sanitizeCustomIconTheme(theme)
    if not clean then return false, 'invalid' end
    local list = store.getCustomIconThemes(citizenid)
    local at
    for i = 1, #list do
        if list[i].id == clean.id then at = i break end
    end
    if not at and #list >= MAX_CUSTOM_ICON_THEMES then return false, 'limit' end
    list[at or (#list + 1)] = clean
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, icon_custom) VALUES (?, 'phone', ?)
        ON DUPLICATE KEY UPDATE icon_custom = VALUES(icon_custom)
    ]], { citizenid, json.encode(list) })
    return true, nil
end

---Removes one player-designed icon theme; a character using it falls back to Default in the same
---statement, so no row is ever left pointing at a theme that no longer exists.
---@param citizenid string framework per-character id
---@param id any theme id to remove
---@return boolean removed
function store.deleteCustomIconTheme(citizenid, id)
    if not citizenid or citizenid == '' or not isCustomIconId(id) then return false end
    local list = store.getCustomIconThemes(citizenid)
    local kept, removed = {}, false
    for i = 1, #list do
        if list[i].id == id then removed = true else kept[#kept + 1] = list[i] end
    end
    if not removed then return false end
    MySQL.update.await([[
        UPDATE phone_settings
        SET icon_custom = ?,
            icon_theme  = CASE WHEN icon_theme = ? THEN 'default' ELSE icon_theme END
        WHERE citizenid = ?
    ]], { json.encode(kept), id, citizenid })
    return true
end

-- Mirrors MAX_CUSTOM_PALETTES / PALETTE_NAME_MAX in
-- web/src/apps/settings/appearance/paletteRamp.ts.
---@type integer Cap on player-designed palettes per character.
local MAX_CUSTOM_PALETTES = 12
---@type integer Longest palette name a player may store.
local PALETTE_NAME_MAX = 24

---Validates one player-designed palette, rebuilding it from only the sanitised fields so no
---client JSON is ever stored verbatim. Nil when any field is malformed.
---@param v any client-supplied palette
---@return table|nil palette { id: string, name: string, mode: string, hue, tint, depth: integer }
local function sanitizeCustomPalette(v)
    if type(v) ~= 'table' or not isCustomPaletteId(v.id) then return nil end
    if v.mode ~= 'light' and v.mode ~= 'dark' then return nil end
    if type(v.name) ~= 'string' then return nil end
    local name = (v.name:gsub('^%s+', ''):gsub('%s+$', ''))
    local chars = nameLength(name)
    if not chars or chars < 1 or chars > PALETTE_NAME_MAX then return nil end
    local hue, tint, depth = tonumber(v.hue), tonumber(v.tint), tonumber(v.depth)
    if not hue or not tint or not depth then return nil end
    return {
        id    = v.id,
        name  = name,
        mode  = v.mode,
        hue   = lib.math.round(lib.math.clamp(hue, 0, 359)),
        tint  = lib.math.round(lib.math.clamp(tint, 0, 100)),
        depth = lib.math.round(lib.math.clamp(depth, 0, 100)),
    }
end

---Decodes a palette_custom column into validated palettes; an unparseable column, a malformed
---entry or a duplicate id is dropped rather than served.
---@param raw any stored column value
---@return table[] palettes
local function decodeCustomPalettes(raw)
    if not raw or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return {} end
    local out, seen = {}, {}
    for i = 1, #decoded do
        local clean = sanitizeCustomPalette(decoded[i])
        if clean and not seen[clean.id] and #out < MAX_CUSTOM_PALETTES then
            seen[clean.id] = true
            out[#out + 1] = clean
        end
    end
    return out
end

---Reads a player's designed palettes (JSON array column on the phone row, since the library is
---shared across a character's devices even though the active choice is not). Read-only.
---@param citizenid string framework per-character id
---@return table[] palettes
function store.getCustomPalettes(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await("SELECT palette_custom FROM phone_settings WHERE citizenid = ? AND device = 'phone'", { citizenid })
    if not row then return {} end
    return decodeCustomPalettes(row.palette_custom)
end

---Upserts one player-designed palette by id, capped at MAX_CUSTOM_PALETTES per character.
---@param citizenid string framework per-character id
---@param palette any client-supplied palette definition
---@return boolean ok, string|nil reason 'invalid' or 'limit' when refused
function store.saveCustomPalette(citizenid, palette)
    if not citizenid or citizenid == '' then return false, 'invalid' end
    local clean = sanitizeCustomPalette(palette)
    if not clean then return false, 'invalid' end
    local list = store.getCustomPalettes(citizenid)
    local at
    for i = 1, #list do
        if list[i].id == clean.id then at = i break end
    end
    if not at and #list >= MAX_CUSTOM_PALETTES then return false, 'limit' end
    list[at or (#list + 1)] = clean
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, palette_custom) VALUES (?, 'phone', ?)
        ON DUPLICATE KEY UPDATE palette_custom = VALUES(palette_custom)
    ]], { citizenid, json.encode(list) })
    return true, nil
end

---Removes one player-designed palette. Every device row pointing at it falls back to its
---built-in default in the same statement, so no row is left naming a palette that is gone.
---@param citizenid string framework per-character id
---@param id any palette id to remove
---@return boolean removed
function store.deleteCustomPalette(citizenid, id)
    if not citizenid or citizenid == '' or not isCustomPaletteId(id) then return false end
    local list = store.getCustomPalettes(citizenid)
    local kept, removed = {}, false
    for i = 1, #list do
        if list[i].id == id then removed = true else kept[#kept + 1] = list[i] end
    end
    if not removed then return false end
    MySQL.update.await([[
        UPDATE phone_settings
        SET palette_custom = CASE WHEN device = 'phone' THEN ? ELSE palette_custom END,
            dark_theme     = CASE WHEN dark_theme  = ? THEN 'graphite' ELSE dark_theme  END,
            light_theme    = CASE WHEN light_theme = ? THEN 'silver'   ELSE light_theme END
        WHERE citizenid = ?
    ]], { json.encode(kept), id, id, citizenid })
    return true
end
---Returns true if a player wants app names printed under their home-screen icons. Read-only.
---@param citizenid string framework per-character id
---@return boolean showAppNames
function store.getShowAppNames(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return true end
    local row = MySQL.single.await('SELECT show_app_names FROM phone_settings WHERE citizenid = ? AND device = ?', { citizenid, device })
    if not row then return true end
    return isTruthy(row.show_app_names)
end

---Persists a player's show-app-names preference (upsert), coerced to a strict boolean.
---@param citizenid string framework per-character id
---@param on boolean print app names under the home-screen icons
function store.setShowAppNames(citizenid, on, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, show_app_names) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE show_app_names = VALUES(show_app_names)
    ]], { citizenid, device, on == true and 1 or 0 })
end

---Persists a player's tone selections, leaving any other settings intact; a nil or invalid
---field is left unchanged.
---@param citizenid string framework per-character id
---@param ringtone string|nil ringtone slug
---@param notificationTone string|nil notification tone slug
function store.setTones(citizenid, ringtone, notificationTone, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return end
    local r = sanitizeTone(ringtone)
    local n = sanitizeTone(notificationTone)
    if not r and not n then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, device, ringtone, notification_tone)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            ringtone          = COALESCE(VALUES(ringtone), ringtone),
            notification_tone = COALESCE(VALUES(notification_tone), notification_tone)
    ]], { citizenid, device, r, n })
end

---@type integer Cap on saved custom tones per character per kind.
local MAX_CUSTOM_TONES = 30

---Normalises a tone kind to 'ringtone' or 'notification'.
---@param kind any client-supplied kind
---@return string kind 'ringtone' or 'notification'
local function normKind(kind)
    return kind == 'notification' and 'notification' or 'ringtone'
end

---List a player's custom (YouTube) tones of a kind, oldest first. Read-only, scoped to the
---caller's citizenid.
---@param citizenid string framework per-character id
---@param kind 'ringtone'|'notification'
---@return { id: string, name: string, url: string }[]
function store.listCustomTones(citizenid, kind)
    if not citizenid or citizenid == '' then return {} end
    local rows = MySQL.query.await(
        'SELECT id, name, url FROM phone_custom_ringtones WHERE citizenid = ? AND kind = ? ORDER BY created_at ASC',
        { citizenid, normKind(kind) }
    )
    return rows or {}
end

---Saves a custom tone for a player: every field is clamped to its column size, the per-kind
---list is capped at MAX_CUSTOM_TONES, and the upsert keys on (citizenid, id).
---@param citizenid string framework per-character id
---@param kind 'ringtone'|'notification'
---@param id string tone id (clamped to 32 [a-zA-Z0-9_-] chars)
---@param name string display name (clamped to 64 chars)
---@param url string audio URL (clamped to 512 chars)
---@return boolean ok false when a field is unusable or the cap is hit
function store.addCustomTone(citizenid, kind, id, name, url)
    if not citizenid or citizenid == '' then return false end
    local k         = normKind(kind)
    local cleanId   = type(id) == 'string'   and ((id:gsub('[^a-zA-Z0-9_-]', '')):sub(1, 32)) or ''
    local cleanName = type(name) == 'string' and name:sub(1, 64)  or ''
    local cleanUrl  = type(url) == 'string'  and url:sub(1, 512) or ''
    if cleanId == '' or cleanName == '' or cleanUrl == '' then return false end

    local countRow = MySQL.single.await(
        'SELECT COUNT(*) AS n FROM phone_custom_ringtones WHERE citizenid = ? AND kind = ?',
        { citizenid, k }
    )
    if countRow and tonumber(countRow.n) >= MAX_CUSTOM_TONES then return false end

    MySQL.update.await([[
        INSERT INTO phone_custom_ringtones (citizenid, id, kind, name, url)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE kind = VALUES(kind), name = VALUES(name), url = VALUES(url)
    ]], { citizenid, cleanId, k, cleanName, cleanUrl })
    return true
end

---Removes one of a player's custom tones, keyed on (citizenid, id).
---@param citizenid string framework per-character id
---@param id string tone id
function store.removeCustomTone(citizenid, id)
    if not citizenid or citizenid == '' or type(id) ~= 'string' or id == '' then return end
    MySQL.update.await(
        'DELETE FROM phone_custom_ringtones WHERE citizenid = ? AND id = ?',
        { citizenid, id }
    )
end

---Decodes a JSON settings column, falling back to `fallback` on an empty or unparseable value.
---@param raw any stored column value
---@param fallback any value to return when the column can't be decoded
---@return any
local function decodeColumn(raw, fallback)
    if not raw or raw == '' then return fallback end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return fallback end
    return decoded
end

---The caller's whole settings row in ONE query, derived exactly as the individual getters do.
---The per-field getters each ran their own single-column PK lookup, so building the snapshot the
---settings screen wants cost 16 round trips per hydrate. Custom tones and their own table stay
---separate. Read-only apart from warming the airplane cache.
---@param citizenid string framework per-character id
---@return table snapshot the settings:get payload shape
function store.snapshot(citizenid, device)
    device = device or 'phone'
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await([[
        SELECT *,
               hour24             IS NULL AS hour24_unset,
               wallpaper_parallax IS NULL AS parallax_unset,
               caller_id          IS NULL AS caller_id_unset
        FROM phone_settings WHERE citizenid = ? AND device = ?
    ]], { citizenid, device })

    -- Uploaded wallpapers and player-designed icon packs are a library, not this device's look, so
    -- they live on the phone's row and both devices read the same one. Which wallpaper and which
    -- pack are ACTIVE stay on the device row above.
    local shared = row
    if device ~= 'phone' then
        shared = MySQL.single.await("SELECT custom_wallpapers, icon_custom, palette_custom FROM phone_settings WHERE citizenid = ? AND device = 'phone'", { citizenid })
    end

    local airplane = airplaneCache[airplaneKey(citizenid, device)]
    if airplane == nil then
        airplane = row ~= nil and isTruthy(row.airplane_mode) or false
        airplaneCache[airplaneKey(citizenid, device)] = airplane
    end

    local pin = row and sanitizePin(row.passcode) or nil
    -- Explicit if, not `cond and value or default`: hour24 is a BOOLEAN, so an explicitly stored
    -- false collapses through the `or` and silently reports the configured default instead of the
    -- player's choice. store.getHour24 above already spells it out this way.
    local hour24
    if row and not isTruthy(row.hour24_unset) then
        hour24 = isTruthy(row.hour24)
    else
        hour24 = defaultHour24()
    end
    -- Explicit if, not `cond and value or default`, for the same reason hour24 above spells it
    -- out: parallax defaults ON, so an unset column has to reach the client as nil (take the
    -- default) while a stored 0 has to survive as false. Collapsing both to false would make the
    -- toggle impossible to turn off - the next hydrate would put it straight back.
    local parallax
    if row and not isTruthy(row.parallax_unset) then parallax = isTruthy(row.wallpaper_parallax) end

    local dark = row and row.dark_theme
    if type(dark) ~= 'string' or not (DARK_THEMES[dark] or isCustomPaletteId(dark)) then dark = 'graphite' end
    local light = row and row.light_theme
    if type(light) ~= 'string' or not (LIGHT_THEMES[light] or isCustomPaletteId(light)) then light = 'silver' end
    local accent = row and row.accent
    if not isStorableAccent(accent) then accent = ACCENT_DEFAULT end
    local shell, shellChoice = resolveShell(row and row.shell)
    local icons = row and row.icon_theme
    if not isStorableIconTheme(icons) then icons = 'default' end
    local showAppNames = row == nil or isTruthy(row.show_app_names)
    local homeDensity = row and row.home_density
    if type(homeDensity) ~= 'string' or not HOME_DENSITIES[homeDensity] then homeDensity = 'default' end

    -- Stored as a whole percent, handed back as the fraction the UI works in.
    local iconPct = row and tonumber(row.home_icon_scale)
    local homeIconScale = (iconPct and iconPct >= 85 and iconPct <= 115) and (iconPct / 100) or 1

    -- Belt and braces against the TINYINT(1) boolean mapping: if a driver still hands this back
    -- as a boolean, `true` means the player asked for less motion, so read it as 'reduced'
    -- rather than letting tonumber() return nil and silently restoring full animation.
    local motionLevel = 0
    if row ~= nil and row.reduce_motion ~= nil then
        if row.reduce_motion == true then motionLevel = 1
        elseif row.reduce_motion ~= false then motionLevel = math.floor(tonumber(row.reduce_motion) or 0) end
        if motionLevel < 0 then motionLevel = 0 elseif motionLevel > 2 then motionLevel = 2 end
    end

    return {
        ringtone         = row and row.ringtone or nil,
        notificationTone = row and row.notification_tone or nil,
        airplaneMode     = airplane,
        hour24           = hour24,
        callerId         = (row == nil or isTruthy(row.caller_id_unset)) and true or isTruthy(row.caller_id),
        streamerMode     = row ~= nil and isTruthy(row.streamer_mode) or false,
        streamerHide     = row and decodeColumn(row.streamer_hide, nil) or nil,
        reopenApp        = row ~= nil and (row.reopen_app == true or tonumber(row.reopen_app) == 1),
        setupDone        = row ~= nil and (row.setup_done == true or tonumber(row.setup_done) == 1),
        theme            = (row and row.theme == 'dark') and 'dark' or 'light',
        darkTheme        = dark,
        lightTheme       = light,
        accent           = accent,
        shell            = shell,
        gameTime         = row ~= nil and isTruthy(row.game_time) or false,
        shellChoice      = shellChoice,
        shellsAllowed    = allowedShells(),
        iconTheme        = icons,
        customIconThemes = shared and decodeCustomIconThemes(shared.icon_custom) or {},
        customPalettes   = shared and decodeCustomPalettes(shared.palette_custom) or {},
        showAppNames     = showAppNames,
        homeDensity      = homeDensity,
        homeIconScale    = homeIconScale,
        lockClock        = row and decodeColumn(row.lock_clock, nil) or nil,
        wallpaper        = (row and row.wallpaper ~= '') and row.wallpaper or nil,
        wallpaperHome    = (row and row.wallpaper_home ~= '') and row.wallpaper_home or nil,
        blurLock         = row ~= nil and isTruthy(row.blur_lock),
        blurHome         = row ~= nil and isTruthy(row.blur_home),
        islandPet        = (row and row.island_pet ~= '') and row.island_pet or nil,
        customWallpapers = shared and decodeColumn(shared.custom_wallpapers, {}) or {},
        chatTextScale    = (row and row.chat_text_scale ~= nil) and tonumber(row.chat_text_scale) or nil,
        appLabels        = row and decodeColumn(row.app_labels, {}) or {},
        motion           = motionLevel,
        boldText         = row ~= nil and isTruthy(row.bold_text) or false,
        textScale        = (row and row.text_scale ~= nil) and tonumber(row.text_scale) or nil,
        phoneScale       = (row and row.phone_scale ~= nil) and tonumber(row.phone_scale) or nil,
        brightness       = (row and row.brightness ~= nil) and tonumber(row.brightness) or nil,
        phoneAlign       = (row and row.phone_align ~= '') and row.phone_align or nil,
        phoneTilt        = row and decodeColumn(row.phone_tilt, nil) or nil,
        dockStyle        = (row and row.dock_style ~= '') and row.dock_style or nil,
        openAnim         = (row and row.open_anim ~= '') and row.open_anim or nil,
        wallpaperParallax = parallax,
        ringtoneVol      = (row and row.ringtone_volume ~= nil) and tonumber(row.ringtone_volume) or nil,
        callVol          = (row and row.call_volume ~= nil) and tonumber(row.call_volume) or nil,
        locale           = (row and row.locale ~= '') and row.locale or nil,
        passcode         = pin,
        faceId           = pin ~= nil and row ~= nil and isTruthy(row.face_id),
    }
end

return store
