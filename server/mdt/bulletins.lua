---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table MDT permissions (server.mdt.access): identity, wrappers, the audience.
local access = require 'server.mdt.access'
---@type table Shared server helpers (server.util): envelopes, clamps, string caps.
local util   = require 'server.util'
---@type table Job bridge (bridge.server.job): the department a push recipient belongs to.
local job    = require 'bridge.server.job'

---@type table Bulletins module; the table returned at end of file.
local bulletins = {}

---@type table Content caps (configs/mdt.lua).
local LIMITS = config.Mdt.Limits or {}
---@type integer Longest accepted bulletin title, in characters.
local MAX_TITLE = math.floor(tonumber(LIMITS.BulletinTitle) or 120)
---@type integer Longest accepted bulletin body, in characters.
local MAX_BODY = math.floor(tonumber(LIMITS.BulletinBody) or 4000)
---@type integer Bulletins the board holds; older notices stop being listed.
local MAX_BULLETINS = 50

---Public bulletin shape the board renders.
---@param row table bulletin DB row
---@return table bulletin
local function pub(row)
    return {
        id             = tonumber(row.id) or 0,
        title          = row.title or '',
        body           = row.body or '',
        author         = row.author_name or '',
        authorCid      = row.author_cid or '',
        authorCallsign = (row.author_callsign and row.author_callsign ~= '') and row.author_callsign or nil,
        createdAt      = tonumber(row.created_at) or 0,
        updatedAt      = tonumber(row.updated_at) or tonumber(row.created_at) or 0,
    }
end

---Coerces a client-supplied bulletin id to a positive integer, or nil.
---@param v any client-supplied id
---@return integer|nil id
local function bulletinId(v)
    local n = tonumber(v)
    if not util.finite(n) or n ~= math.floor(n) or n < 1 then return nil end
    return math.floor(n)
end

---A department's board, newest first. Notices posted without a department are shared by every
---terminal, which is what the mdtCreateCall-style server-wide notice looks like.
---@param department string framework job name
---@return table[] bulletins
local function board(department)
    local rows = MySQL.query.await([[
        SELECT id, title, body, author_cid, author_name, author_callsign, created_at, updated_at
        FROM phone_mdt_bulletins
        WHERE department = ? OR department = ''
        ORDER BY created_at DESC LIMIT ]] .. MAX_BULLETINS, { department }) or {}

    local out = {}
    for i = 1, #rows do out[i] = pub(rows[i]) end
    return out
end

---Pushes the board to every terminal, reading each department's board once rather than once per
---recipient.
local function broadcast()
    local boards = {}
    for _, src in ipairs(access.audience()) do
        local dept = access.departmentFor(job.getName(src))
        if dept then
            local rows = boards[dept.job]
            if not rows then
                rows = board(dept.job)
                boards[dept.job] = rows
            end
            TriggerClientEvent('sd-phone:client:mdt:bulletin', src, { bulletins = rows })
        end
    end
end

---The department's bulletin board.
bulletins.list = access.gated('bulletins.view', function(_src, _payload, me)
    return util.ok({ rows = board(me.job) })
end)

---Posts a notice, or edits one when `id` is set. The byline, callsign and department are stamped
---server-side on first insert only.
bulletins.save = access.audited('bulletins.manage', function(_src, payload, me)
    local title = util.limitedString(payload.title, MAX_TITLE)
    if not title then return util.fail('mdt.giveBulletinTitle', 'Give the bulletin a title') end
    local body = util.limitedString(payload.body, MAX_BODY)
    if not body then return util.fail('mdt.writeBulletin', 'Write the bulletin') end

    local now = os.time()
    local id
    if payload.id ~= nil then
        id = bulletinId(payload.id)
        if not id then return util.fail('mdt.bulletinNotFound', 'Bulletin not found') end
    end

    if id then
        local existing = MySQL.single.await(
            'SELECT department FROM phone_mdt_bulletins WHERE id = ?', { id })
        if not existing then return util.fail('mdt.bulletinNotFound', 'Bulletin not found') end
        if existing.department ~= '' and existing.department ~= me.job then
            return util.fail('mdt.bulletinBelongsAnotherDepartment', 'That bulletin belongs to another department')
        end
        MySQL.update.await(
            'UPDATE phone_mdt_bulletins SET title = ?, body = ?, updated_at = ? WHERE id = ?',
            { title, body, now, id })
    else
        id = MySQL.insert.await([[
            INSERT INTO phone_mdt_bulletins
                (title, body, author_cid, author_name, author_callsign, department, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ]], { title, body, me.citizenid, me.name, me.callsign, me.job, now, now })
    end

    local row = MySQL.single.await([[
        SELECT id, title, body, author_cid, author_name, author_callsign, created_at, updated_at
        FROM phone_mdt_bulletins WHERE id = ?
    ]], { id })
    if not row then return util.fail('mdt.bulletinNotFound', 'Bulletin not found') end

    broadcast()
    return util.ok({ bulletin = pub(row) }),
        { entityType = 'bulletin', entityId = tostring(id), details = { title = title } }
end)

---Takes a notice off the board.
bulletins.delete = access.audited('bulletins.manage', function(_src, payload, me)
    local id = bulletinId(payload.id)
    if not id then return util.fail('mdt.bulletinNotFound', 'Bulletin not found') end

    local existing = MySQL.single.await(
        'SELECT title, department FROM phone_mdt_bulletins WHERE id = ?', { id })
    if not existing then return util.fail('mdt.bulletinNotFound', 'Bulletin not found') end
    if existing.department ~= '' and existing.department ~= me.job then
        return util.fail('mdt.bulletinBelongsAnotherDepartment', 'That bulletin belongs to another department')
    end

    MySQL.update.await('DELETE FROM phone_mdt_bulletins WHERE id = ?', { id })

    broadcast()
    return util.ok({ id = id }),
        { entityType = 'bulletin', entityId = tostring(id), details = { title = existing.title } }
end)

return bulletins
