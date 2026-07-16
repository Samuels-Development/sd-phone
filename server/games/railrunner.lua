---@type table Player bridge (bridge.server.player): identity + display names from a server-trusted src.
local player = require 'bridge.server.player'

---@type table Rail Runner module; the table returned at end of file. Per-character high scores,
---coin wallet and unlocked cosmetics - one row per character - powering the real (all-players)
---leaderboard and the coin shop. Callbacks live under the shared `sd-phone:server:games:*` namespace.
local rr = {}

-- Authoritative skin catalog; cost 0 = the free default everyone owns.
---@type table<string, integer> Skin id -> coin cost.
local SKINS = {
    classic = 0, teal = 150, crimson = 150, gold = 350, neon = 500,
    robot = 700, ninja = 900, astronaut = 1200, alien = 1500,
}
---@type string The free default skin every profile owns.
local DEFAULT_SKIN = 'classic'

---@type integer Max coins one reported run may credit.
local COIN_MAX_PER_RUN = 1000
---@type integer Max distance one reported run may claim.
local DIST_MAX         = 100000

---@return string|nil citizenid for a server-trusted src (nil when offline)
local function cidOf(src)  return player.getIdentifier(src) end
---@return string display name for DB rows, capped to the column's VARCHAR(64)
local function nameOf(src) return (player.getName(src) or ('Player ' .. tostring(src))):sub(1, 64) end

---Coerces a client-reported run value to an integer in [0, cap]. Non-numbers, NaN and +-inf
---collapse to 0.
---@param v any client-supplied value
---@param cap integer inclusive upper bound
---@return integer clamped
local function clampRun(v, cap)
    local n = tonumber(v)
    if not n or n ~= n or n == math.huge or n == -math.huge then return 0 end
    return math.max(0, math.min(cap, math.floor(n)))
end

---Creates the profile table if it doesn't exist. Runs once at boot.
function rr.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_railrunner (
            citizenid   VARCHAR(64) NOT NULL,
            name        VARCHAR(64) NULL,
            best        INT NOT NULL DEFAULT 0,
            coins       INT NOT NULL DEFAULT 0,
            total_coins BIGINT NOT NULL DEFAULT 0,
            plays       INT NOT NULL DEFAULT 0,
            unlocked    TEXT NULL,
            selected    VARCHAR(32) NOT NULL DEFAULT 'classic',
            PRIMARY KEY (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Decodes a stored unlocked-skins JSON array, falling back to just the default skin on NULL or
---garbage.
---@param s string|nil raw column value
---@return table unlocked skin id array (never empty)
local function decodeUnlocked(s)
    local good, t = pcall(function() return s and json.decode(s) end)
    if good and type(t) == 'table' and #t > 0 then return t end
    return { DEFAULT_SKIN }
end

---Fetches a character's row, creating the starter row (default skin owned + selected) on first
---play.
---@param cid string citizenid
---@param name string display name for the row
---@return table row phone_railrunner row
local function ensureRow(cid, name)
    local r = MySQL.single.await('SELECT * FROM phone_railrunner WHERE citizenid = ?', { cid })
    if not r then
        MySQL.insert.await(
            'INSERT INTO phone_railrunner (citizenid, name, unlocked, selected) VALUES (?, ?, ?, ?)',
            { cid, name, json.encode({ DEFAULT_SKIN }), DEFAULT_SKIN })
        r = MySQL.single.await('SELECT * FROM phone_railrunner WHERE citizenid = ?', { cid })
    end
    return r
end

---Shapes a DB row into the profile the web renders, guaranteeing the default skin is always
---present in unlocked.
---@param r table phone_railrunner row
---@return table profile { best, coins, totalCoins, plays, unlocked, selected }
local function profileOf(r)
    local unlocked = decodeUnlocked(r.unlocked)
    local hasDefault = false
    for _, id in ipairs(unlocked) do if id == DEFAULT_SKIN then hasDefault = true break end end
    if not hasDefault then table.insert(unlocked, 1, DEFAULT_SKIN) end
    return {
        best       = r.best or 0,
        coins      = r.coins or 0,
        totalCoins = tonumber(r.total_coins) or 0,
        plays      = r.plays or 0,
        unlocked   = unlocked,
        selected   = r.selected or DEFAULT_SKIN,
    }
end

---The caller's own profile (created on first read). Read-only.
---@param src integer player server id
---@return table|nil profile nil when the caller has no identity
function rr.getProfile(src)
    local cid = cidOf(src); if not cid then return nil end
    return profileOf(ensureRow(cid, nameOf(src)))
end

---Banks a finished run: credits coins, bumps plays, raises best; dist/coins are clamped. Returns
---the updated profile plus whether this run set a new personal best.
---@param src integer player server id
---@param dist any client-reported distance
---@param coins any client-reported coins collected
---@return table|nil result { profile, newBest }, nil when the caller has no identity
function rr.submit(src, dist, coins)
    local cid = cidOf(src); if not cid then return nil end
    local name = nameOf(src)
    local r = ensureRow(cid, name)
    dist  = clampRun(dist, DIST_MAX)
    coins = clampRun(coins, COIN_MAX_PER_RUN)
    local prevBest = r.best or 0
    local newBest  = dist > prevBest
    local best     = newBest and dist or prevBest
    MySQL.update.await([[
        UPDATE phone_railrunner
        SET name = ?, best = ?, coins = coins + ?, total_coins = total_coins + ?, plays = plays + 1
        WHERE citizenid = ?
    ]], { name, best, coins, coins, cid })
    return { profile = profileOf(ensureRow(cid, name)), newBest = newBest }
end

---Buys a skin from the catalog. The cost comes from SKINS only, debited via a guarded
---compare-and-swap on the coin balance and unlocked list.
---@param src integer player server id
---@param skin any skin id to buy
---@return table|nil profile updated profile, nil + message on failure
---@return string? message failure reason
function rr.buy(src, skin)
    local cid = cidOf(src); if not cid then return nil, 'Player not found' end
    local cost = SKINS[skin]
    if cost == nil then return nil, 'Unknown item' end
    local r = ensureRow(cid, nameOf(src))
    local unlocked = decodeUnlocked(r.unlocked)
    for _, id in ipairs(unlocked) do if id == skin then return nil, 'Already owned' end end
    if (r.coins or 0) < cost then return nil, 'Not enough coins' end
    unlocked[#unlocked + 1] = skin
    local affected = MySQL.update.await(
        "UPDATE phone_railrunner SET coins = coins - ?, unlocked = ? WHERE citizenid = ? AND coins >= ? AND COALESCE(unlocked, '') = ?",
        { cost, json.encode(unlocked), cid, cost, r.unlocked or '' })
    if not affected or affected == 0 then
        r = ensureRow(cid, nameOf(src))
        for _, id in ipairs(decodeUnlocked(r.unlocked)) do if id == skin then return nil, 'Already owned' end end
        return nil, 'Not enough coins'
    end
    return profileOf(ensureRow(cid, nameOf(src)))
end

---Equips a skin the caller owns (the default is always owned). Ownership is checked against the
---stored unlocked list.
---@param src integer player server id
---@param skin any skin id to equip
---@return table|nil profile updated profile, nil + message on failure
---@return string? message failure reason
function rr.select(src, skin)
    local cid = cidOf(src); if not cid then return nil, 'Player not found' end
    if SKINS[skin] == nil then return nil, 'Unknown item' end
    local r = ensureRow(cid, nameOf(src))
    local owned = skin == DEFAULT_SKIN
    for _, id in ipairs(decodeUnlocked(r.unlocked)) do if id == skin then owned = true break end end
    if not owned then return nil, 'Not unlocked' end
    MySQL.update.await('UPDATE phone_railrunner SET selected = ? WHERE citizenid = ?', { skin, cid })
    return profileOf(ensureRow(cid, nameOf(src)))
end

---Top 20 by best distance (all players), plus the caller's own best + rank. Read-only; exposes
---only display names and distances.
---@param src integer player server id
---@return table board { top, you = { best, rank? } }
function rr.leaderboard(src)
    local rows = MySQL.query.await(
        'SELECT name, best FROM phone_railrunner WHERE best > 0 ORDER BY best DESC, plays ASC LIMIT 20') or {}
    local top = {}
    for _, row in ipairs(rows) do top[#top + 1] = { name = row.name, best = row.best } end

    local you = { best = 0, rank = nil }
    local cid = cidOf(src)
    if cid then
        local me = MySQL.single.await('SELECT best FROM phone_railrunner WHERE citizenid = ?', { cid })
        local myBest = me and me.best or 0
        you.best = myBest
        if myBest > 0 then
            local higher = MySQL.single.await('SELECT COUNT(*) AS n FROM phone_railrunner WHERE best > ?', { myBest })
            you.rank = (higher and tonumber(higher.n) or 0) + 1
        end
    end
    return { top = top, you = you }
end

---Read the caller's own profile (identity from source only).
lib.callback.register('sd-phone:server:games:rrProfile', function(src)
    local p = rr.getProfile(src)
    if not p then return { success = false, message = 'Player not found' } end
    return { success = true, data = p }
end)

---Bank a finished run on the caller's own row (clamped in rr.submit).
lib.callback.register('sd-phone:server:games:rrSubmit', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local r = rr.submit(src, payload.dist, payload.coins)
    if not r then return { success = false, message = 'Player not found' } end
    return { success = true, data = r }
end)

---Buy a skin with the caller's own coins (cost + ownership validated in rr.buy).
lib.callback.register('sd-phone:server:games:rrBuy', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local p, msg = rr.buy(src, payload.skin)
    if not p then return { success = false, message = msg } end
    return { success = true, data = p }
end)

---Equip a skin the caller owns (ownership validated in rr.select).
lib.callback.register('sd-phone:server:games:rrSelect', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local p, msg = rr.select(src, payload.skin)
    if not p then return { success = false, message = msg } end
    return { success = true, data = p }
end)

---Global top-20 leaderboard plus the caller's own rank. Read-only.
lib.callback.register('sd-phone:server:games:rrLeaderboard', function(src)
    return { success = true, data = rr.leaderboard(src) }
end)

-- One-shot boot thread: creates the profile schema.
CreateThread(function()
    local good, err = pcall(rr.ensureSchema)
    if not good then print(('^1[sd-phone:games]^0 railrunner schema bootstrap failed: %s'):format(err)) end
end)

return rr
