---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Store module; the table returned at end of file.
local store = {}

---Builds an SQL fragment that strips the common phone-number separators from a column for
---digit-to-digit comparison.
---@param col string literal column name to wrap
---@return string sql nested REPLACE(...) expression over the column
local function stripCol(col)
    return ("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(%s,'-',''),' ',''),'(',''),')',''),'+',''),'.','')"):format(col)
end

---Generates a random 10-digit phone number as raw digits, with the first block starting at 200.
---@return string number ten raw digits
local function genNumber()
    return ('%03d%03d%04d'):format(math.random(200, 989), math.random(100, 999), math.random(0, 9999))
end

---Returns true if a column already exists on the given table (information_schema probe).
---@param tbl string table name
---@param name string column name
---@return boolean exists
local function columnExists(tbl, name)
    local row = MySQL.single.await([[
        SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
    ]], { tbl, name })
    return row ~= nil and tonumber(row.n) > 0
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
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_settings (
            citizenid          VARCHAR(64) NOT NULL,
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
            wallpaper          VARCHAR(255) NULL,
            passcode           VARCHAR(8)   NULL,
            face_id            TINYINT(1)   NOT NULL DEFAULT 0,
            chat_text_scale    DECIMAL(3,2) NULL,
            hour24             TINYINT(1)   NULL,
            locale             VARCHAR(8)   NULL,
            updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    if not columnExists('phone_settings', 'airplane_mode') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN airplane_mode TINYINT(1) NOT NULL DEFAULT 0')
    end
    if not columnExists('phone_settings', 'hour24') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN hour24 TINYINT(1) NULL')
    end
    for _, col in ipairs({
        { 'card_name',    'VARCHAR(64) NULL'  },
        { 'card_avatar',  'VARCHAR(512) NULL' },
        { 'card_email',   'VARCHAR(128) NULL' },
        { 'card_address', 'VARCHAR(128) NULL' },
    }) do
        if not columnExists('phone_settings', col[1]) then
            MySQL.query.await(('ALTER TABLE phone_settings ADD COLUMN %s %s'):format(col[1], col[2]))
        end
    end
    if not columnExists('phone_settings', 'phone_number') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN phone_number VARCHAR(20) NULL AFTER citizenid')
    end
    if not columnExists('phone_settings', 'ringtone') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN ringtone VARCHAR(64) NULL')
    end
    if not columnExists('phone_settings', 'notification_tone') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN notification_tone VARCHAR(64) NULL')
    end
    if not columnExists('phone_settings', 'installed_apps') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN installed_apps TEXT NULL')
    end
    if not columnExists('phone_settings', 'home_layout') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN home_layout TEXT NULL')
    end
    if not columnExists('phone_settings', 'lock_clock') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN lock_clock TEXT NULL')
    end
    if not columnExists('phone_settings', 'wallpaper') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN wallpaper VARCHAR(255) NULL')
    end
    if not columnExists('phone_settings', 'passcode') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN passcode VARCHAR(8) NULL')
    end
    if not columnExists('phone_settings', 'face_id') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN face_id TINYINT(1) NOT NULL DEFAULT 0')
    end
    if not columnExists('phone_settings', 'chat_text_scale') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN chat_text_scale DECIMAL(3,2) NULL')
    end
    if not columnExists('phone_settings', 'locale') then
        MySQL.query.await('ALTER TABLE phone_settings ADD COLUMN locale VARCHAR(8) NULL')
    end

    MySQL.query.await([[
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
    if not columnExists('phone_custom_ringtones', 'kind') then
        MySQL.query.await("ALTER TABLE phone_custom_ringtones ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'ringtone' AFTER id")
    end

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_notif_prefs (
            citizenid VARCHAR(64) NOT NULL,
            app       VARCHAR(32) NOT NULL,
            enabled   TINYINT(1)  NOT NULL DEFAULT 1,
            PRIMARY KEY (citizenid, app)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
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
    return row.enabled == true or tonumber(row.enabled) == 1
end

---Persists a player's notification preference for an app (upsert); no-op for an unusable app id.
---@param citizenid string framework per-character id
---@param app string app slug
---@param on boolean whether notifications are enabled
function store.setNotifPref(citizenid, app, on)
    local a = sanitizeApp(app)
    if not citizenid or citizenid == '' or not a then return end
    MySQL.update.await([[
        INSERT INTO phone_notif_prefs (citizenid, app, enabled) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)
    ]], { citizenid, a, on == true and 1 or 0 })
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
        'SELECT card_name, card_avatar, card_email, card_address FROM phone_settings WHERE citizenid = ?',
        { citizenid }
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
        INSERT INTO phone_settings (citizenid, card_name, card_avatar, card_email, card_address)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            card_name    = VALUES(card_name),
            card_avatar  = VALUES(card_avatar),
            card_email   = VALUES(card_email),
            card_address = VALUES(card_address)
    ]], {
        citizenid,
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
function store.getInstalledApps(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await(
        'SELECT installed_apps FROM phone_settings WHERE citizenid = ?',
        { citizenid }
    )
    if not row or not row.installed_apps or row.installed_apps == '' then return {} end
    local ok, decoded = pcall(json.decode, row.installed_apps)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---Persists a player's installed downloadable app ids, leaving other settings intact.
---@param citizenid string framework per-character id
---@param ids string[] installed app ids
function store.setInstalledApps(citizenid, ids)
    if not citizenid or citizenid == '' then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, installed_apps) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE installed_apps = VALUES(installed_apps)
    ]], { citizenid, json.encode(ids or {}) })
end

---Reads a player's saved home-screen layout JSON, or nil if unset. Read-only.
---@param citizenid string framework per-character id
---@return string|nil layout opaque layout JSON
function store.getHomeLayout(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT home_layout FROM phone_settings WHERE citizenid = ?',
        { citizenid }
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
        INSERT INTO phone_settings (citizenid, home_layout) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE home_layout = VALUES(home_layout)
    ]], { citizenid, layout })
end

---Reads a player's phone number, or nil if not yet assigned. Read-only.
---@param citizenid string framework per-character id
---@return string|nil number raw-digit phone number
function store.getPhoneNumber(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await(
        'SELECT phone_number FROM phone_settings WHERE citizenid = ?',
        { citizenid }
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
        ('SELECT citizenid FROM phone_settings WHERE %s = ? LIMIT 1'):format(stripCol('phone_number')),
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
        ('SELECT 1 AS hit FROM phone_settings WHERE %s = ? LIMIT 1'):format(stripCol('phone_number')),
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
        INSERT INTO phone_settings (citizenid, phone_number) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE phone_number = VALUES(phone_number)
    ]], { citizenid, clean })
end

---Returns a player's number, generating and saving a unique one on first access; tries 20
---random candidates against numberExists, then accepts an unchecked one.
---@param citizenid string framework per-character id
---@return string|nil number raw-digit phone number, nil only when citizenid is unusable
function store.ensurePhoneNumber(citizenid)
    if not citizenid or citizenid == '' then return nil end

    local existing = store.getPhoneNumber(citizenid)
    if existing then return existing end

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
        'SELECT citizenid, phone_number FROM phone_settings WHERE citizenid IN (' .. placeholders .. ')', list) or {}
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
function store.getLockClock(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT lock_clock FROM phone_settings WHERE citizenid = ?', { citizenid })
    if not row or not row.lock_clock or row.lock_clock == '' then return nil end
    local ok, decoded = pcall(json.decode, row.lock_clock)
    if not ok or type(decoded) ~= 'table' then return nil end
    return decoded
end

---Persists a player's lockscreen clock config, rebuilding the stored JSON from only the
---sanitised fields; a fully-invalid payload is ignored.
---@param citizenid string framework per-character id
---@param cfg { font?: string, layout?: string, color?: string, scale?: number }
function store.setLockClock(citizenid, cfg)
    if not citizenid or citizenid == '' or type(cfg) ~= 'table' then return end
    local clean = {
        font   = sanitizeSlug(cfg.font),
        layout = sanitizeSlug(cfg.layout),
        color  = sanitizeHex(cfg.color),
        scale  = clampScale(cfg.scale),
    }
    if not clean.font and not clean.layout and not clean.color and not clean.scale then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, lock_clock) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE lock_clock = VALUES(lock_clock)
    ]], { citizenid, json.encode(clean) })
end

---Clamps a wallpaper key to [%w._-/:] capped at 255 chars; nil for empty/invalid input.
---@param v any client-supplied wallpaper key
---@return string|nil clean key stripped to [%w._-/:], nil if unusable
local function sanitizeWallpaper(v)
    if type(v) ~= 'string' then return nil end
    local clean = (v:gsub('[^%w%._%-/:]', ''))
    if clean == '' then return nil end
    return clean:sub(1, 255)
end

---Reads a player's saved wallpaper key, or nil if unset. Read-only.
---@param citizenid string framework per-character id
---@return string|nil wallpaper saved key
function store.getWallpaper(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT wallpaper FROM phone_settings WHERE citizenid = ?', { citizenid })
    if not row or not row.wallpaper or row.wallpaper == '' then return nil end
    return row.wallpaper
end

---Persists a player's selected wallpaper, leaving other settings intact; an empty or invalid
---value is ignored.
---@param citizenid string framework per-character id
---@param value string wallpaper key
function store.setWallpaper(citizenid, value)
    if not citizenid or citizenid == '' then return end
    local clean = sanitizeWallpaper(value)
    if not clean then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, wallpaper) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE wallpaper = VALUES(wallpaper)
    ]], { citizenid, clean })
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
function store.getChatTextScale(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT chat_text_scale FROM phone_settings WHERE citizenid = ?', { citizenid })
    if not row or row.chat_text_scale == nil then return nil end
    return tonumber(row.chat_text_scale)
end

---Persist a player's chat-bubble text size multiplier, leaving other settings intact. An
---out-of-range / non-numeric value is ignored.
---@param citizenid string framework per-character id
---@param scale number multiplier (clamped to 0.8-1.5)
function store.setChatTextScale(citizenid, scale)
    if not citizenid or citizenid == '' then return end
    local clean = clampChatTextScale(scale)
    if not clean then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, chat_text_scale) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE chat_text_scale = VALUES(chat_text_scale)
    ]], { citizenid, clean })
end

-- Mirrors SUPPORTED_LOCALES in web/src/i18n/index.ts.
---@type table<string, boolean> Whitelist of storable phone locales.
local SUPPORTED_LOCALES = {
    en = true, fr = true, es = true, de = true, it = true,
    pt = true, nl = true, pl = true, da = true, no = true,
}

---Reads a player's saved phone language, or nil if unset. Read-only.
---@param citizenid string framework per-character id
---@return string|nil locale saved locale code
function store.getLocale(citizenid)
    if not citizenid or citizenid == '' then return nil end
    local row = MySQL.single.await('SELECT locale FROM phone_settings WHERE citizenid = ?', { citizenid })
    if not row or not row.locale or row.locale == '' then return nil end
    return row.locale
end

---Persists a player's chosen phone language, whitelist-checked against SUPPORTED_LOCALES.
---@param citizenid string framework per-character id
---@param locale any client-supplied locale code
function store.setLocale(citizenid, locale)
    if not citizenid or citizenid == '' then return end
    if type(locale) ~= 'string' or not SUPPORTED_LOCALES[locale] then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, locale) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE locale = VALUES(locale)
    ]], { citizenid, locale })
end

---Clamps a passcode to a bare 4-6 digit string, or nil.
---@param v any client-supplied passcode
---@return string|nil pin 4-6 digit string, nil if unusable
local function sanitizePin(v)
    if type(v) ~= 'string' then return nil end
    return v:match('^%d%d%d%d%d?%d?$')
end

local util = require 'server.util'
local isTruthy = util.truthy

---Reads a player's lock security (passcode + Face Unlock); `passcode` is nil when no code is
---set and `faceId` is forced false whenever no passcode exists. Read-only.
---@param citizenid string framework per-character id
---@return { passcode: string|nil, faceId: boolean }
function store.getSecurity(citizenid)
    if not citizenid or citizenid == '' then return { passcode = nil, faceId = false } end
    local row = MySQL.single.await('SELECT passcode, face_id FROM phone_settings WHERE citizenid = ?', { citizenid })
    if not row then return { passcode = nil, faceId = false } end
    local pin = sanitizePin(row.passcode)
    return { passcode = pin, faceId = pin ~= nil and isTruthy(row.face_id) }
end

---Persists a player's lock security; a nil or non-4-6-digit `passcode` clears it and forces
---Face Unlock off.
---@param citizenid string framework per-character id
---@param passcode string|nil 4-6 digit code, nil to clear
---@param faceId boolean Face Unlock enabled (only honoured alongside a valid passcode)
function store.setSecurity(citizenid, passcode, faceId)
    if not citizenid or citizenid == '' then return end
    local pin = sanitizePin(passcode)
    local face = pin ~= nil and faceId == true
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, passcode, face_id) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE passcode = VALUES(passcode), face_id = VALUES(face_id)
    ]], { citizenid, pin, face and 1 or 0 })
end

---Reads a player's saved tone selections; fields are nil when unset. Read-only.
---@param citizenid string framework per-character id
---@return { ringtone: string|nil, notificationTone: string|nil }
function store.getTones(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local row = MySQL.single.await(
        'SELECT ringtone, notification_tone FROM phone_settings WHERE citizenid = ?',
        { citizenid }
    )
    return {
        ringtone         = row and row.ringtone or nil,
        notificationTone = row and row.notification_tone or nil,
    }
end

-- In-memory airplane-mode cache, keyed by citizenid; the DB holds the durable copy.
---@type table<string, boolean> Cached airplane-mode flag per citizenid.
local airplaneCache = {}

---Returns true if a player currently has airplane mode on, lazily warming the cache from the DB
---on first read.
---@param citizenid string framework per-character id
---@return boolean on
function store.isAirplane(citizenid)
    if not citizenid or citizenid == '' then return false end
    local cached = airplaneCache[citizenid]
    if cached ~= nil then return cached end
    local row = MySQL.single.await('SELECT airplane_mode FROM phone_settings WHERE citizenid = ?', { citizenid })
    local on = row ~= nil and isTruthy(row.airplane_mode)
    airplaneCache[citizenid] = on
    return on
end

---Sets a player's airplane mode: cache first, then the DB write-through.
---@param citizenid string framework per-character id
---@param on boolean airplane mode enabled
function store.setAirplane(citizenid, on)
    if not citizenid or citizenid == '' then return end
    on = on == true
    airplaneCache[citizenid] = on
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, airplane_mode) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE airplane_mode = VALUES(airplane_mode)
    ]], { citizenid, on and 1 or 0 })
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
function store.getHour24(citizenid)
    if not citizenid or citizenid == '' then return defaultHour24() end
    local row = MySQL.single.await('SELECT hour24 FROM phone_settings WHERE citizenid = ?', { citizenid })
    if row and row.hour24 ~= nil then
        return row.hour24 == true or tonumber(row.hour24) == 1
    end
    return defaultHour24()
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

---Persists a player's tone selections, leaving any other settings intact; a nil or invalid
---field is left unchanged.
---@param citizenid string framework per-character id
---@param ringtone string|nil ringtone slug
---@param notificationTone string|nil notification tone slug
function store.setTones(citizenid, ringtone, notificationTone)
    if not citizenid or citizenid == '' then return end
    local r = sanitizeTone(ringtone)
    local n = sanitizeTone(notificationTone)
    if not r and not n then return end
    MySQL.update.await([[
        INSERT INTO phone_settings (citizenid, ringtone, notification_tone)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            ringtone          = COALESCE(VALUES(ringtone), ringtone),
            notification_tone = COALESCE(VALUES(notification_tone), notification_tone)
    ]], { citizenid, r, n })
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

return store
