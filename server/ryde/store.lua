---@type table Store module; the table returned at end of file.
local store = {}


local util = require 'server.util'
local function newId() return util.newId(12) end

store.newId = newId

---Creates every Ryde table idempotently: drivers keyed by Ryde account username, rides keyed by
---rider citizenid and driver username.
function store.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_ryde_drivers (
            username       VARCHAR(64)  NOT NULL,
            display_name   VARCHAR(64)  NOT NULL DEFAULT '',
            vehicle        VARCHAR(64)  NOT NULL DEFAULT '',
            plate          VARCHAR(16)  NOT NULL DEFAULT '',
            color          VARCHAR(16)  NOT NULL DEFAULT '#111111',
            rating_sum     INT          NOT NULL DEFAULT 0,
            rating_count   INT          NOT NULL DEFAULT 0,
            trips          INT          NOT NULL DEFAULT 0,
            earnings_total DECIMAL(12,2) NOT NULL DEFAULT 0,
            created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_ryde_rides (
            id              VARCHAR(16)  NOT NULL,
            rider_username  VARCHAR(64)  NOT NULL,
            rider_name      VARCHAR(64)  NOT NULL DEFAULT '',
            driver_username VARCHAR(64)  NULL,
            driver_name     VARCHAR(64)  NOT NULL DEFAULT '',
            pickup_label    VARCHAR(96)  NOT NULL DEFAULT '',
            pickup_x        FLOAT        NOT NULL DEFAULT 0,
            pickup_y        FLOAT        NOT NULL DEFAULT 0,
            dropoff_label   VARCHAR(96)  NOT NULL DEFAULT '',
            dropoff_x       FLOAT        NOT NULL DEFAULT 0,
            dropoff_y       FLOAT        NOT NULL DEFAULT 0,
            distance        FLOAT        NOT NULL DEFAULT 0,
            fare            DECIMAL(10,2) NOT NULL DEFAULT 0,
            payment         VARCHAR(8)   NOT NULL DEFAULT 'cash',
            paid            TINYINT(1)   NOT NULL DEFAULT 0,
            status          VARCHAR(16)  NOT NULL DEFAULT 'completed',
            rating          TINYINT      NULL,
            created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at    TIMESTAMP    NULL,
            PRIMARY KEY (id),
            INDEX idx_ryde_rides_rider  (rider_username),
            INDEX idx_ryde_rides_driver (driver_username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    util.ensureIndex('phone_ryde_rides', 'idx_ryde_rides_rider_recent', '(rider_username, created_at)')
end

---Fetches a driver record by account username. Read-only.
---@param username string
---@return table|nil
function store.getDriver(username)
    return MySQL.single.await('SELECT * FROM phone_ryde_drivers WHERE username = ?', { username })
end

---Removes a driver record; past rides are left intact.
---@param username string
function store.deleteDriver(username)
    MySQL.query.await('DELETE FROM phone_ryde_drivers WHERE username = ?', { username })
end

---Creates or updates a driver's profile; the upsert only touches the cosmetic columns, never
---the rating/trip/earnings counters.
---@param username string
---@param displayName string
---@param vehicle string
---@param plate string
---@param color string
function store.upsertDriver(username, displayName, vehicle, plate, color)
    MySQL.query.await([[
        INSERT INTO phone_ryde_drivers (username, display_name, vehicle, plate, color)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            vehicle      = VALUES(vehicle),
            plate        = VALUES(plate),
            color        = VALUES(color)
    ]], { username, displayName, vehicle, plate, color })
end

---Credits a completed trip to a driver: one more trip plus their earnings (0 when uncollected).
---@param username string
---@param earnings number
function store.bumpDriverStats(username, earnings)
    MySQL.update.await([[
        UPDATE phone_ryde_drivers
        SET trips = trips + 1, earnings_total = earnings_total + ?
        WHERE username = ?
    ]], { earnings, username })
end

---Folds a rider's star rating into the driver's stored rating sum + count.
---@param username string
---@param stars number
function store.addRating(username, stars)
    MySQL.update.await([[
        UPDATE phone_ryde_drivers
        SET rating_sum = rating_sum + ?, rating_count = rating_count + 1
        WHERE username = ?
    ]], { stars, username })
end

---Persists a finished or cancelled ride; only terminal states reach this table.
---@param r table trip record from server.ryde.actions
function store.insertRide(r)
    MySQL.insert.await([[
        INSERT INTO phone_ryde_rides
            (id, rider_username, rider_name, driver_username, driver_name,
             pickup_label, pickup_x, pickup_y, dropoff_label, dropoff_x, dropoff_y,
             distance, fare, payment, paid, status, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ]], {
        r.id, r.riderUsername, r.riderName, r.driverUsername, r.driverName,
        r.pickup.label, r.pickup.x, r.pickup.y, r.dropoff.label, r.dropoff.x, r.dropoff.y,
        r.distance, r.fare, r.payment, r.paid and 1 or 0, r.status,
    })
end

---Fetches one ride row by id. Read-only.
---@param rideId string
---@return table|nil
function store.getRide(rideId)
    return MySQL.single.await('SELECT * FROM phone_ryde_rides WHERE id = ?', { rideId })
end

---Attaches a rider's star rating to a ride only when it has none yet; returns the affected-row
---count.
---@param rideId string
---@param stars number
---@return number affected rows
function store.setRideRating(rideId, stars)
    return MySQL.update.await(
        'UPDATE phone_ryde_rides SET rating = ? WHERE id = ? AND rating IS NULL',
        { stars, rideId }
    )
end

---Every ride a player took part in, newest first (capped at 100); riders keyed by citizenid,
---drivers by account username. Read-only.
---@param riderKey string citizenid
---@param driverKey string account username (falls back to citizenid)
---@return table[]
function store.ridesForUser(riderKey, driverKey)
    return MySQL.query.await([[
        SELECT * FROM phone_ryde_rides
        WHERE rider_username = ? OR driver_username = ?
        ORDER BY created_at DESC
        LIMIT 100
    ]], { riderKey, driverKey }) or {}
end

---The rider's most recent ride (any status). Read-only.
---@param riderKey string citizenid
---@return table|nil
function store.latestRiderRide(riderKey)
    return MySQL.single.await([[
        SELECT id, status, fare, paid, driver_name
        FROM phone_ryde_rides
        WHERE rider_username = ?
        ORDER BY created_at DESC
        LIMIT 1
    ]], { riderKey })
end

---Top drivers server-wide, ranked by confidence-weighted rating then trip count; unrated
---drivers score a provisional 5. Read-only.
---@param limit number max rows
---@param prior number confidence-weighting prior rating (configs.ryde LeaderboardPriorRating)
---@param weight number confidence weight in trips (configs.ryde LeaderboardWeight)
---@return table[]
function store.leaderboard(limit, prior, weight)
    return MySQL.query.await([[
        SELECT username, display_name, color, trips, earnings_total,
               CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE 5 END AS avg_rating,
               (((CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE 5 END) * trips + ?) / (trips + ?)) AS weighted
        FROM phone_ryde_drivers
        WHERE trips > 0
        ORDER BY weighted DESC, trips DESC
        LIMIT ?
    ]], { prior * weight, weight, limit }) or {}
end

return store
