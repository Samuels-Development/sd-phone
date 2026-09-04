---@type table Store module; the table returned at end of file.
local store = {}

local config   = require 'configs.config'
local settings = require 'server.settings.store'

---@type table Payphone config (configs/payphone.lua).
local cfg = config.Payphone or require 'configs.payphone'

---Creates the payphone-number table idempotently. One row per physical booth, keyed by its
---rounded world position.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_payphones (
            location   VARCHAR(64) NOT NULL,
            number     VARCHAR(20) NOT NULL,
            created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (location),
            UNIQUE KEY uq_phone_payphones_number (number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---@param number string candidate, digits only
---@return boolean taken already in use by a player phone or another payphone
local function numberTaken(number)
    if settings.numberExists(number) then return true end
    return MySQL.scalar.await('SELECT 1 FROM phone_payphones WHERE number = ? LIMIT 1', { number }) ~= nil
end

---A fresh payphone number: the configured prefix + 7 random digits, checked for uniqueness
---against player numbers and other payphones.
---@return string number
local function genNumber()
    local prefix = tostring(cfg.NumberPrefix or '444'):gsub('%D', ''):sub(1, 3)
    if #prefix < 3 then prefix = '444' end
    for _ = 1, 20 do
        local candidate = ('%s%03d%04d'):format(prefix, math.random(100, 999), math.random(0, 9999))
        if not numberTaken(candidate) then return candidate end
    end
    return ('%s%03d%04d'):format(prefix, math.random(100, 999), math.random(0, 9999))
end

---The already-minted number for a booth location, or nil when that booth has never been used.
---Read-only, so it is the safe half of numberFor for a caller that must not create a row.
---@param location string rounded-coords key
---@return string|nil number
function store.lookupNumber(location)
    return MySQL.scalar.await('SELECT number FROM phone_payphones WHERE location = ?', { location })
end

---@type integer Hard ceiling on distinct booth rows. The map holds a few hundred payphone props,
---so this can only be approached by keys no real booth occupies; minting stops rather than letting
---a new bypass write rows without limit.
local MAX_BOOTHS = 5000
---@type integer|nil Row count, read once on the first mint and tracked locally afterwards.
local boothCount = nil

---The persistent number for a booth location, minted on first use. The INSERT IGNORE makes two
---simultaneous first calls from one booth converge on a single row. Nil once the table is at its
---ceiling: the caller treats that booth as having no number rather than growing the table.
---@param location string rounded-coords key
---@return string|nil number
function store.numberFor(location)
    local existing = store.lookupNumber(location)
    if existing then return existing end

    if not boothCount then
        boothCount = tonumber(MySQL.scalar.await('SELECT COUNT(*) FROM phone_payphones')) or 0
    end
    if boothCount >= MAX_BOOTHS then return nil end

    local number = genNumber()
    MySQL.insert.await('INSERT IGNORE INTO phone_payphones (location, number) VALUES (?, ?)', { location, number })
    boothCount = boothCount + 1
    return store.lookupNumber(location) or number
end

---The booth location owning a number, or nil when it isn't a payphone number. Read-only.
---@param number string digits
---@return string|nil location
function store.locationForNumber(number)
    if not number or number == '' then return nil end
    return MySQL.scalar.await('SELECT location FROM phone_payphones WHERE number = ?', { number })
end

return store
