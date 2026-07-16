---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Cookie persistence layer (server.cookie.store): one save row per character.
local store  = require 'server.cookie.store'
---@type table Player bridge (bridge.server.player): citizenid/name lookups from a server id.
local player = require 'bridge.server.player'

---@type table Cookie app config (config.Cookie): leaderboard size, value clamp, alias cap.
local C = config.Cookie or {}
---@type integer Leaderboard row cap (config.Cookie.LeaderboardLimit).
local LIMIT = C.LeaderboardLimit or 25
---@type number Ceiling for saved cookies/earned (config.Cookie.MaxValue).
local MAXV  = C.MaxValue or 1e15
---@type integer Alias length cap (config.Cookie.MaxNicknameLength), well inside the VARCHAR(40)
---column.
local MAXNICK = C.MaxNicknameLength or 20

---@type table Actions module; the table returned at end of file.
local actions = {}

-- Write-behind cache: the latest save lives in memory; dirty entries flush on a timer, on
-- disconnect and on resource stop.
---@type table<string, table> Latest save per citizenid: { name, cookies, earned, owned, ach, rainOn, dirty }.
local cache    = {}
---@type table<integer, string> src -> citizenid.
local srcToCid = {}

---Stable per-character key (framework citizenid) scoping every read/write. Resolved from src via
---the bridge.
---@param src integer player server id
---@return string|nil citizenid (nil when the player can't be resolved)
local function cidOf(src) return player.getIdentifier(src) end

local util = require 'server.util'
local trim, isTruthy = util.trim, util.truthy

---A player's leaderboard label: their custom alias if set, else their character name.
---@param nickname any stored alias column (may be nil)
---@param charName string|nil stored character name
---@return string name
local function displayName(nickname, charName)
    return (type(nickname) == 'string' and nickname ~= '') and nickname or (charName or 'Baker')
end

---Clamps a client-supplied cookie count to [0, MaxValue]; NaN collapses to 0.
---@param v any raw client value
---@return number clamped
local function clampNum(v)
    v = tonumber(v) or 0
    if v ~= v then return 0 end
    if v < 0 then return 0 end
    if v > MAXV then return MAXV end
    return v
end


---Decodes a stored JSON column: nil, non-strings and garbage collapse to {}.
---@param raw any stored column value
---@return table decoded
local function decode(raw)
    if type(raw) ~= 'string' or raw == '' then return {} end
    local ok, d = pcall(json.decode, raw)
    return (ok and type(d) == 'table') and d or {}
end

---The caller's save: the in-memory cache entry when present, else the DB row. A player with no
---row gets an empty save with rain on. Read-only.
---@param src integer player server id
---@return table result { success, data = { cookies, earned, owned, achievements, rainOn } }
function actions.load(src)
    local cid = cidOf(src)
    if not cid then return { success = false } end

    local c = cache[cid]
    if c then
        return { success = true, data = {
            cookies = c.cookies, earned = c.earned,
            owned = c.owned, achievements = c.ach, rainOn = c.rainOn,
        } }
    end

    local row = store.get(cid)
    if not row then
        return { success = true, data = { cookies = 0, earned = 0, owned = {}, achievements = {}, rainOn = true } }
    end
    return { success = true, data = {
        cookies      = row.cookies or 0,
        earned       = row.earned or 0,
        owned        = decode(row.owned),
        achievements = decode(row.achievements),
        rainOn       = isTruthy(row.rain_on),
    } }
end

---Autosaves into memory only; the periodic flush batches DB writes. Numbers are clamped, table
---fields type-checked, the caller's name snapshotted, and src -> citizenid recorded.
---@param src integer player server id
---@param payload table { cookies, earned, owned, achievements, rainOn }
---@return table result
function actions.save(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end
    srcToCid[src] = cid
    cache[cid] = {
        name    = player.getName(src),
        cookies = clampNum(payload.cookies),
        earned  = clampNum(payload.earned),
        owned   = type(payload.owned) == 'table' and payload.owned or {},
        ach     = type(payload.achievements) == 'table' and payload.achievements or {},
        rainOn  = payload.rainOn ~= false,
        dirty   = true,
    }
    return { success = true }
end

---Persists one cached entry if it has unsaved changes, clearing the dirty bit.
---@param cid string citizenid
local function flushCid(cid)
    local c = cache[cid]
    if not c or not c.dirty then return end
    store.save(cid, c.name, c.cookies, c.earned,
        json.encode(c.owned), json.encode(c.ach),
        c.rainOn and 1 or 0, os.time())
    c.dirty = false
end

---Flushes every dirty cached save to the DB (periodic timer + resource stop). Each entry flushes
---under pcall; a failed entry stays dirty and is retried on the next pass.
function actions.flushAll()
    for cid in pairs(cache) do pcall(flushCid, cid) end
end

---A player disconnected: persists their final state now and frees both cache slots.
---@param src integer player server id
function actions.playerDropped(src)
    local cid = srcToCid[src]
    srcToCid[src] = nil
    if not cid then return end
    flushCid(cid)
    cache[cid] = nil
end

---The leaderboard: the top real players by lifetime earned (excluding the caller), plus the
---caller's display label and stored alias. Reads the DB, not the write-behind cache. Read-only.
---@param src integer player server id
---@return table result { success, data = { rivals, me } }
function actions.leaderboard(src)
    local cid = cidOf(src)

    local rivals = {}
    for _, r in ipairs(store.topRivals(LIMIT, cid or '')) do
        rivals[#rivals + 1] = { name = displayName(r.nickname, r.name), cookies = math.floor(r.earned or 0) }
    end

    local row = cid and store.get(cid) or nil
    local nickname = (row and type(row.nickname) == 'string') and row.nickname or ''
    local me = { name = displayName(nickname, player.getName(src)), nickname = nickname }

    return { success = true, data = { rivals = rivals, me = me } }
end

---Sets (or clears, with an empty string) the caller's leaderboard alias, trimmed + capped to
---MaxNicknameLength.
---@param src integer player server id
---@param nickname any raw client alias
---@return table result { success, data = { nickname } }
function actions.setNickname(src, nickname)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(nickname) ~= 'string' then nickname = '' end
    nickname = trim(nickname)
    if #nickname > MAXNICK then nickname = nickname:sub(1, MAXNICK) end
    store.setNickname(cid, nickname ~= '' and nickname or nil)
    return { success = true, data = { nickname = nickname } }
end

return actions
