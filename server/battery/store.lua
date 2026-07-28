---@type table Main config (configs.config): reads the Battery group.
local config = require 'configs.config'
---@type table SIM session resolver (server.sim.session): the acting data identity.
local session = require 'server.sim.session'
---@type table Player bridge (bridge.server.player): citizenid lookup from a server id.
local player = require 'bridge.server.player'
---@type table Boot reporter (server.boot).
local boot = require 'server.boot'
---@type table Shared server helpers (server.util): truthy coercion for TINYINT(1).
local util = require 'server.util'

local store = {}

---Injectable clock so tests can pin time.
---@return integer seconds
function store._now() return os.time() end

---Average of a { min, max } seconds-per-percent range.
---@param range integer[]
---@return number
local function avg(range)
    return (range[1] + range[2]) / 2
end

---@param v number
---@return integer
local function clamp(v)
    if v < 0 then return 0 end
    if v > 100 then return 100 end
    return math.floor(v)
end

---The identity a battery row belongs to: the acting phone profile under unique phones, the
---character otherwise.
---@param source number player server id
---@return string|nil owner
function store.ownerKey(source)
    local identity = session.identity and session.identity(source) or nil
    if identity then return identity end
    return player.getIdentifier(source)
end

---Current level for a stored row, projected forward from its checkpoint. Only consulted for an
---owner with no live client; a connected client's own value always wins.
---@param row table { level:integer, charging:boolean, updated_at:integer }
---@return integer level 0-100
function store.derive(row)
    local cfg = config.Battery
    local elapsed = math.max(0, store._now() - (row.updated_at or 0))

    if row.charging then
        return clamp(row.level + math.floor(elapsed / avg(cfg.ChargeSeconds)))
    end
    if not cfg.DrainWhileOffline or not cfg.DrainWhenClosed then return clamp(row.level) end
    return clamp(row.level - math.floor(elapsed / avg(cfg.DrainClosedSeconds)))
end

function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_battery` (
            `owner`      VARCHAR(64)      NOT NULL,
            `level`      TINYINT UNSIGNED NOT NULL DEFAULT 100,
            `charging`   TINYINT(1)       NOT NULL DEFAULT 0,
            `low_power`  TINYINT(1)       NOT NULL DEFAULT 0,
            `updated_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`owner`)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    ]])
end

---Reads an owner's checkpoint. A never-seen phone starts at the configured level, falling back
---to the pre-battery StatusBar key.
---@param owner string
---@return table state { level:integer, charging:boolean, lowPower:boolean, updatedAt:integer }
function store.read(owner)
    local row = owner and MySQL.single.await(
        'SELECT `level`, `charging`, `low_power`, UNIX_TIMESTAMP(`updated_at`) AS `updated_at` FROM `phone_battery` WHERE `owner` = ?',
        { owner }
    )
    if not row then
        local start = config.Battery.StartLevel or (config.StatusBar and config.StatusBar.BatteryStart) or 100
        return { level = clamp(start), charging = false, lowPower = false, updatedAt = store._now() }
    end
    return {
        level     = clamp(row.level),
        charging  = util.truthy(row.charging),
        lowPower  = util.truthy(row.low_power),
        updatedAt = row.updated_at or store._now(),
    }
end

---Writes a checkpoint.
---@param owner string
---@param level integer
---@param charging boolean
---@param lowPower boolean
---@return boolean written
function store.write(owner, level, charging, lowPower)
    if not owner then return false end
    MySQL.prepare.await([[
        INSERT INTO `phone_battery` (`owner`, `level`, `charging`, `low_power`)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE `level` = VALUES(`level`), `charging` = VALUES(`charging`), `low_power` = VALUES(`low_power`)
    ]], { owner, clamp(level), charging and 1 or 0, lowPower and 1 or 0 })
    return true
end

CreateThread(function()
    if not config.Battery or not config.Battery.Enabled then return end
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('battery', err)
        return
    end
    boot.schemaReady()
end)

return store
