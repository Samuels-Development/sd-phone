---@type table Shared server helpers (server.util): envelopes + index bootstrap.
local util = require 'server.util'

---@type table Moderation module; the table returned at end of file.
local moderation = {}

-- One row per (citizenid, scope). A player muted in several scopes has several rows.
---@type table<string, boolean> Valid mute scopes.
local SCOPES = {
    birdy     = true,
    photogram = true,
    cherry    = true,
    darkchat  = true,
    sms       = true,
    calls     = true,
}
moderation.SCOPES = SCOPES

---Creates the mute table idempotently.
function moderation.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_admin_mutes (
            id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            citizenid  VARCHAR(64)  NOT NULL,
            scope      VARCHAR(24)  NOT NULL,
            reason     VARCHAR(200) NOT NULL DEFAULT '',
            admin_cid  VARCHAR(64)  NOT NULL,
            admin_name VARCHAR(64)  NOT NULL DEFAULT '',
            expires_at BIGINT       NULL,
            created_at BIGINT       NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_mute (citizenid, scope)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

-- Per-cid mute cache so every message/post send doesn't hit the DB. Entries expire after TTL
-- seconds and are dropped on any mutation for that cid; expiry of individual mutes is always
-- re-checked in Lua against expires_at, so a cached row can never extend a mute.
---@type table<string, { at: integer, rows: table[] }>
local cache = {}
---@type integer Cache TTL in seconds.
local TTL = 30

---Active (non-expired) mute rows for a citizen, from cache when fresh.
---@param citizenid string framework per-character id
---@return table[] rows { scope, reason, admin_name, expires_at|nil, created_at }
local function rowsFor(citizenid)
    if not citizenid or citizenid == '' then return {} end
    local now = os.time()
    local hit = cache[citizenid]
    local rows
    if hit and now - hit.at < TTL then
        rows = hit.rows
    else
        rows = MySQL.query.await(
            'SELECT scope, reason, admin_name, expires_at, created_at FROM phone_admin_mutes WHERE citizenid = ?',
            { citizenid }
        ) or {}
        cache[citizenid] = { at = now, rows = rows }
    end
    local active = {}
    for _, r in ipairs(rows) do
        if not r.expires_at or tonumber(r.expires_at) > now then
            active[#active + 1] = r
        end
    end
    return active
end

---Active mutes for a citizen in the camelCase shape the admin UI renders.
---@param citizenid string framework per-character id
---@return table[] mutes { scope, reason, adminName, expiresAt|nil, createdAt }
function moderation.activeMutes(citizenid)
    local out = {}
    for _, r in ipairs(rowsFor(citizenid)) do
        out[#out + 1] = {
            scope     = r.scope,
            reason    = r.reason,
            adminName = r.admin_name,
            expiresAt = r.expires_at and tonumber(r.expires_at) or nil,
            createdAt = tonumber(r.created_at),
        }
    end
    return out
end

---Whether a citizen is muted in a scope right now.
---@param citizenid string framework per-character id
---@param scope string one of SCOPES
---@return boolean muted
---@return integer|nil expiresAt epoch seconds, nil while muted permanently (or not muted)
function moderation.isMuted(citizenid, scope)
    for _, r in ipairs(rowsFor(citizenid)) do
        if r.scope == scope then return true, r.expires_at and tonumber(r.expires_at) or nil end
    end
    return false, nil
end

---Drop-in guard for app actions: nil when the citizen may act, a ready failure envelope when
---muted in the scope. Call at the top of post/send actions.
---@param citizenid string|nil framework per-character id (nil-safe)
---@param scope string one of SCOPES
---@return table|nil failEnvelope
function moderation.guard(citizenid, scope)
    if not citizenid or citizenid == '' then return nil end
    local muted, expiresAt = moderation.isMuted(citizenid, scope)
    if not muted then return nil end
    local suffix = expiresAt and (' until ' .. os.date('%d/%m/%Y %H:%M', expiresAt)) or ''
    return util.fail(('You have been muted by an admin%s.'):format(suffix))
end

---Upserts one mute row per scope. Invalid scopes are skipped; durationSecs nil = permanent.
---@param citizenid string target citizenid
---@param scopes string[] scopes to mute
---@param durationSecs integer|nil seconds from now, nil for permanent
---@param reason string admin-supplied reason
---@param adminCid string acting admin's citizenid
---@param adminName string acting admin's display name
---@return integer applied number of scopes actually muted
function moderation.mute(citizenid, scopes, durationSecs, reason, adminCid, adminName)
    local now = os.time()
    local expiresAt = durationSecs and (now + durationSecs) or nil
    local applied = 0
    for _, scope in ipairs(scopes or {}) do
        if SCOPES[scope] then
            MySQL.update.await([[
                INSERT INTO phone_admin_mutes (citizenid, scope, reason, admin_cid, admin_name, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE reason = VALUES(reason), admin_cid = VALUES(admin_cid),
                    admin_name = VALUES(admin_name), expires_at = VALUES(expires_at), created_at = VALUES(created_at)
            ]], { citizenid, scope, reason or '', adminCid, adminName, expiresAt, now })
            applied = applied + 1
        end
    end
    cache[citizenid] = nil
    return applied
end

---Removes one scope's mute, or every scope when scope is nil. Idempotent.
---@param citizenid string target citizenid
---@param scope string|nil scope to unmute, nil for all
---@return integer removed rows removed
function moderation.unmute(citizenid, scope)
    local removed
    if scope then
        removed = MySQL.update.await(
            'DELETE FROM phone_admin_mutes WHERE citizenid = ? AND scope = ?', { citizenid, scope })
    else
        removed = MySQL.update.await(
            'DELETE FROM phone_admin_mutes WHERE citizenid = ?', { citizenid })
    end
    cache[citizenid] = nil
    return tonumber(removed) or 0
end

---Every active mute on the server, newest first, keyset-paginated by row id. Expired rows are
---pruned on the way through. Read-only apart from the prune.
---@param cursor integer|nil last row id of the previous page, nil for the first page
---@param limit integer page size (already clamped by the caller)
---@return table[] rows, integer|nil nextCursor
function moderation.listAll(cursor, limit)
    local now = os.time()
    MySQL.update.await('DELETE FROM phone_admin_mutes WHERE expires_at IS NOT NULL AND expires_at <= ?', { now })
    local rows = MySQL.query.await([[
        SELECT id, citizenid, scope, reason, admin_name, expires_at, created_at
        FROM phone_admin_mutes
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
            citizenid = r.citizenid,
            scope     = r.scope,
            reason    = r.reason,
            adminName = r.admin_name,
            expiresAt = r.expires_at and tonumber(r.expires_at) or nil,
            createdAt = tonumber(r.created_at),
        }
    end
    return out, nextCursor
end

return moderation
