---@type table Recycle bin module; the table returned at end of file.
local bin = {}

---@type table Admin persistence layer (server.admin.store): row snapshots + restores.
local store = require 'server.admin.store'

---@type table Shared helpers (server.util): the ok/fail response envelopes.
local util = require 'server.util'

---@type integer Days a snapshot is kept before the sweep drops it.
local KEEP_DAYS = 30

---Creates the bin table. Called from the admin module's schema bootstrap.
function bin.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_admin_bin (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            app         VARCHAR(32)  NOT NULL,
            target_id   VARCHAR(64)  NOT NULL,
            excerpt     VARCHAR(300) NOT NULL DEFAULT '',
            lost        VARCHAR(120) NOT NULL DEFAULT '',
            author_cid  VARCHAR(64)  NULL,
            payload     MEDIUMTEXT   NOT NULL,
            admin_cid   VARCHAR(64)  NULL,
            admin_name  VARCHAR(80)  NULL,
            restored_at BIGINT       NULL,
            restored_by VARCHAR(80)  NULL,
            created_at  BIGINT       NOT NULL,
            KEY idx_admin_bin_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---Records what a delete is about to remove. Called before the delete runs, because afterwards
---there is nothing left to copy. Returns quietly when the app declares no source table: the
---delete still goes ahead, it just cannot be undone.
---@param app string adapter key
---@param id string row id
---@param authorCid string|nil
---@param adminCid string
---@param adminName string
---@return boolean kept
function bin.keep(app, id, authorCid, adminCid, adminName)
    local recoverable, lost = store.contentSource(app)
    if not recoverable then return false end

    local row, excerpt = store.snapshotRow(app, id)
    if not row then return false end

    MySQL.insert.await([[
        INSERT INTO phone_admin_bin
            (app, target_id, excerpt, lost, author_cid, payload, admin_cid, admin_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], { app, tostring(id), excerpt, lost or '', authorCid, json.encode(row), adminCid, adminName, os.time() })
    return true
end

---One page of the bin, newest first, keyset-paginated by row id. The payload itself is never sent
---to the panel: it can be several kilobytes of a row nobody is going to read, and the excerpt is
---what makes an entry recognisable.
---@param cursor integer|nil last row id of the previous page
---@param limit integer page size (already clamped)
---@return table[] rows, integer|nil nextCursor
function bin.list(cursor, limit)
    local rows = MySQL.query.await([[
        SELECT id, app, target_id, excerpt, lost, author_cid, admin_name,
               restored_at, restored_by, created_at
        FROM phone_admin_bin
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
            id         = tonumber(r.id),
            app        = r.app,
            targetId   = r.target_id,
            excerpt    = r.excerpt,
            lost       = r.lost ~= '' and r.lost or nil,
            authorCid  = r.author_cid,
            adminName  = r.admin_name,
            restoredAt = tonumber(r.restored_at),
            restoredBy = r.restored_by,
            createdAt  = tonumber(r.created_at),
        }
    end
    return out, nextCursor
end

---Puts one entry's row back where it came from. The entry stays in the bin afterwards, marked
---restored: it is the record that the delete happened at all, and losing that on an undo would
---leave the audit log describing a row that exists.
---@param id integer bin row id
---@param adminName string
---@return boolean ok
---@return table? refusal keyed refusal envelope when ok is false
function bin.restore(id, adminName)
    local entry = MySQL.single.await(
        'SELECT app, payload, restored_at FROM phone_admin_bin WHERE id = ?', { id })
    if not entry then return false, util.fail('admin.notFound', 'Not found') end
    if entry.restored_at then return false, util.fail('admin.alreadyRestored', 'Already restored') end

    local okJson, row = pcall(json.decode, entry.payload)
    if not okJson or type(row) ~= 'table' then return false, util.fail('admin.unreadableSnapshot', 'Unreadable snapshot') end

    local okRestore, refusal = store.restoreRow(entry.app, row)
    if not okRestore then return false, refusal end

    MySQL.update.await(
        'UPDATE phone_admin_bin SET restored_at = ?, restored_by = ? WHERE id = ?',
        { os.time(), adminName, id })
    return true
end

---Drops entries past the keep window. A bin that grows forever is a copy of every deleted post
---this server has ever had, which is not what an undo is for.
---@return integer removed
function bin.prune()
    return tonumber(MySQL.update.await(
        'DELETE FROM phone_admin_bin WHERE created_at < ?', { os.time() - KEEP_DAYS * 86400 })) or 0
end

return bin
