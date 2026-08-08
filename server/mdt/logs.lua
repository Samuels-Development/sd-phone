---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table MDT permissions (server.mdt.access): identity and the read wrapper.
local access = require 'server.mdt.access'
---@type table Shared server helpers (server.util): envelopes, clamps, string caps.
local util   = require 'server.util'

---@type table Logs module; the table returned at end of file. Read-only: the write side is
---store.audit and is reached only through access.audited.
local logs = {}

---@type integer Rows one activity page carries.
local PAGE_SIZE = math.max(1, math.floor(tonumber((config.Mdt.Paging or {}).PageSize) or 25))
---@type integer Pages the viewer will page through, so an offset cannot be walked forever.
local MAX_PAGE = math.max(1, math.floor(tonumber((config.Mdt.Paging or {}).MaxPage) or 400))

---Decodes a stored details blob into a table; a malformed or absent blob reads as empty.
---@param raw any details column value
---@return table details
local function decodeDetails(raw)
    if type(raw) == 'table' then return raw end
    if type(raw) ~= 'string' or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    if not ok or type(decoded) ~= 'table' then return {} end
    return decoded
end

---Public audit row the activity viewer renders.
---@param row table audit DB row
---@return table entry
local function pub(row)
    return {
        id            = tonumber(row.id) or 0,
        actor         = row.actor_name or row.actor_cid or '',
        actorCid      = row.actor_cid or '',
        actorCallsign = (row.actor_callsign and row.actor_callsign ~= '') and row.actor_callsign or nil,
        action        = row.action or '',
        entityType    = row.entity_type or '',
        entityId      = row.entity_id or '',
        details       = decodeDetails(row.details),
        createdAt     = tonumber(row.created_at) or 0,
    }
end

---The audit trail, newest first, scoped to the caller's own department and filtered by entity
---type, actor or action.
logs.list = access.gated('logs.view', function(_src, payload, me)
    local where = { "(a.department = ? OR a.department = '')" }
    local params = { me.job }

    local entityType = util.limitedString(payload.entityType, 32)
    if entityType then
        where[#where + 1] = 'a.entity_type = ?'
        params[#params + 1] = entityType
    end

    local actor = util.limitedString(payload.actor, 64)
    if actor then
        where[#where + 1] = 'a.actor_cid = ?'
        params[#params + 1] = actor
    end

    local action = util.limitedString(payload.action, 48)
    if action then
        where[#where + 1] = 'a.action = ?'
        params[#params + 1] = action
    end

    local clause = ' WHERE ' .. table.concat(where, ' AND ')

    local total = math.floor(tonumber(
        MySQL.scalar.await('SELECT COUNT(*) FROM phone_mdt_audit a' .. clause, params)) or 0)

    local pages = lib.math.clamp(math.ceil(total / PAGE_SIZE), 1, MAX_PAGE)
    local page = math.floor(tonumber(payload.page) or 1)
    if page < 1 then page = 1 end
    if page > pages then page = pages end

    local rows = MySQL.query.await(([[
        SELECT a.id, a.actor_cid, a.actor_name, a.actor_callsign, a.action,
               a.entity_type, a.entity_id, a.details, a.created_at
        FROM phone_mdt_audit a%s
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT %d OFFSET %d
    ]]):format(clause, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local out = {}
    for i = 1, #rows do out[i] = pub(rows[i]) end

    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

return logs
