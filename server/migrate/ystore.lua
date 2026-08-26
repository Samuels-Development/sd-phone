---@type table Migration SQL (server.migrate.store): shared table probing and target writes.
local store = require 'server.migrate.store'

---@type table YSeries source reads; the table returned at end of file. Every YSeries data table is
---keyed by `phone_imei`, so almost everything here joins through the imei -> citizenid map that
---yidentity builds.
local ystore = {}

---@type string Table-name prefix YSeries ships with. Not configurable: unlike lb-phone it has no
---rename convention, so a differently-prefixed install is a fork we cannot recognise anyway.
local PREFIX <const> = 'yphone_'

---The full table name for a YSeries table, or nil when this database has no such table.
---@param name string table name without the yphone_ prefix
---@return string|nil
function ystore.table(name)
    local full = PREFIX .. name
    if not store.tableExists(full) then return nil end
    return full
end

---Whether a YSeries database is present at all. `holders` is the owner map: without it nothing can
---be attributed to a character, so its absence means there is nothing importable here.
---@return boolean
function ystore.present()
    return store.tableExists(PREFIX .. 'holders')
end

---Total rows across a list of YSeries tables, skipping any this database does not have.
---@param names string[] table names without the prefix
---@return integer
function ystore.rowCount(names)
    local total = 0
    for i = 1, #names do
        local tbl = ystore.table(names[i])
        if tbl then
            local n = MySQL.scalar.await(('SELECT COUNT(*) FROM `%s`'):format(tbl))
            total = total + (tonumber(n) or 0)
        end
    end
    return total
end

---Every character that holds a phone, as { citizenid, imei }. This is the spine of the whole
---import: no row anywhere else can be attributed without it.
---@return { citizenid: string, imei: string }[]
function ystore.holders()
    local tbl = ystore.table('holders')
    if not tbl then return {} end
    local rows = MySQL.query.await(
        ('SELECT holder_identifier AS citizenid, phone_imei AS imei FROM `%s`'):format(tbl)) or {}
    return rows
end

---Every SIM, newest-primary first so the primary number wins when a device carries several.
---@return { imei: string, number: string, primary: any, slot: any }[]
function ystore.sims()
    local tbl = ystore.table('sim_cards')
    if not tbl then return {} end
    return MySQL.query.await(([[
        SELECT phone_imei AS imei, sim_number AS number, `primary`, slot
        FROM `%s`
        WHERE phone_imei IS NOT NULL AND sim_number IS NOT NULL AND sim_number <> ''
        ORDER BY `primary` DESC, slot ASC, id ASC
    ]]):format(tbl)) or {}
end

---The settings row per device: lock pin, wallpapers, airplane mode and the weaker citizen_id hint.
---@return table[]
function ystore.settings()
    local tbl = ystore.table('settings')
    if not tbl then return {} end
    return MySQL.query.await(([[
        SELECT phone_imei, pin, citizen_id, face_recognition, homescreen_wallpaper,
               lockscreen_wallpaper, theme, airplane, do_not_disturb
        FROM `%s`
    ]]):format(tbl)) or {}
end

---Reads a page of one YSeries table, ordered by its primary key so paging is stable under writes.
---@param name string table name without the prefix
---@param columns string SELECT list
---@param offset integer
---@param limit integer
---@param orderBy? string ORDER BY column, defaults to id
---@param where? string WHERE clause without the keyword
---@return table[]
function ystore.page(name, columns, offset, limit, orderBy, where)
    local tbl = ystore.table(name)
    if not tbl then return {} end
    local clause = where and (' WHERE ' .. where) or ''
    return MySQL.query.await(('SELECT %s FROM `%s`%s ORDER BY %s LIMIT %d OFFSET %d')
        :format(columns, tbl, clause, orderBy or '`id`', limit, offset)) or {}
end

---The username -> owning imei map for one social app, read from its `<app>_loggedin` table. YSeries
---keeps social accounts in a username-keyed table with no owner column; the logged-in table is what
---ties an account to a handset, and through it to a character.
---@param app string app prefix, e.g. 'twitter'
---@return table<string, string> username -> phone_imei
function ystore.accountOwners(app)
    local tbl = ystore.table(app .. '_loggedin')
    if not tbl then return {} end

    local rows = MySQL.query.await(
        ('SELECT username, phone_imei FROM `%s` WHERE username IS NOT NULL AND phone_imei IS NOT NULL'):format(tbl)) or {}

    local out = {}
    for _, r in ipairs(rows) do
        if not out[r.username] then out[r.username] = r.phone_imei end
    end
    return out
end

---A MySQL DATETIME string for an epoch seconds value, defaulting to now.
---
---sd-phone's target columns are split between BIGINT epoch seconds (messages, calls, wallet,
---photogram, marketplace, pages) and real TIMESTAMP columns (photos, albums, every phone_birdy_*).
---Handing an integer to a TIMESTAMP column does not error: MariaDB stores '0000-00-00 00:00:00',
---which reads back as a zero date and sorts every row to the bottom of a DESC ordering. Use this
---for the TIMESTAMP columns and pass the raw number to the BIGINT ones.
---@param ts any epoch seconds
---@return string
function ystore.stamp(ts)
    local n = tonumber(ts)
    if not n or n <= 0 then n = os.time() end
    return os.date('!%Y-%m-%d %H:%M:%S', n)
end

---Row count for one YSeries table, 0 when absent.
---@param name string table name without the prefix
---@param where? string WHERE clause without the keyword
---@return integer
function ystore.count(name, where)
    local tbl = ystore.table(name)
    if not tbl then return 0 end
    local clause = where and (' WHERE ' .. where) or ''
    local n = MySQL.scalar.await(('SELECT COUNT(*) FROM `%s`%s'):format(tbl, clause))
    return tonumber(n) or 0
end

return ystore
