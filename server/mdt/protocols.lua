---@type table sd-phone config root (configs/config.lua); read for the authored-text caps.
local config = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, string caps.
local util   = require 'server.util'
---@type table MDT permissions (server.mdt.access): the read gate and the audited write wrapper.
local access = require 'server.mdt.access'

---@type table Protocols module; the table returned at end of file. The medical terminal's standing
---orders, and the counterpart of the penal code: a reference a medic reads, not a thing with
---consequences attached, so nothing here totals or charges anything.
local protocols = {}

---@type table MDT limits (configs/mdt.lua).
local LIMITS = ((config.Mdt or {}).Limits or {})

---@type table<string, boolean> Valid categories; mirrors the ProtocolCategory union in
---web/src/apps/mdt/data.ts.
local CATEGORIES = {
    assessment = true,
    airway     = true,
    cardiac    = true,
    trauma     = true,
    medical    = true,
    admin      = true,
}

---@type table<string, boolean> Valid urgencies; mirrors the ProtocolPriority union.
local PRIORITIES = { immediate = true, urgent = true, routine = true }

---@type table|nil Cached catalog: { rows = Protocol[], byCode = table<string, Protocol> }. Dropped
---on every write, exactly as the penal code's is.
local cache

---Reads the catalog into memory, or returns the cached copy.
---@return table catalog { rows: table[], byCode: table<string, table> }
local function load()
    if cache then return cache end

    local rows = MySQL.query.await([[
        SELECT `code`, `label`, `category`, `priority`, `description`, `body`
        FROM phone_mdt_protocols
        ORDER BY FIELD(`priority`, 'immediate', 'urgent', 'routine'), `code`
    ]]) or {}

    local byCode = {}
    for i = 1, #rows do
        rows[i].body = rows[i].body or ''
        byCode[rows[i].code] = rows[i]
    end

    cache = { rows = rows, byCode = byCode }
    return cache
end

---Drops the cached catalog so the next read hits the table.
function protocols.invalidate()
    cache = nil
end

---Every protocol, most urgent first then by code.
---@return table[] rows
function protocols.all()
    return load().rows
end

---One protocol by code, or nil.
---@param code any
---@return table|nil protocol
function protocols.byCode(code)
    if type(code) ~= 'string' then return nil end
    return load().byCode[code]
end

---The whole protocol set. Read by the Protocols section and by the report editor's picker.
protocols.list = access.gated('protocols.view', function()
    return util.ok({ rows = protocols.all() })
end)

---Creates or replaces one protocol, keyed on its code.
protocols.save = access.audited('protocols.manage', function(_, payload)
    local code = util.limitedString(payload.code, 16)
    if not code then return util.fail('mdt.codeRequired', 'A code is required') end

    local label = util.limitedString(payload.label, tonumber(LIMITS.ProtocolTitle) or 120)
    if not label then return util.fail('mdt.titleRequired', 'A title is required') end

    local category = type(payload.category) == 'string' and payload.category or ''
    if not CATEGORIES[category] then return util.fail('mdt.pickValidCategory', 'Pick a valid category') end

    local priority = type(payload.priority) == 'string' and payload.priority or ''
    if not PRIORITIES[priority] then priority = 'routine' end

    local description = util.limitedString(payload.description, 255) or ''
    local body = util.limitedString(payload.body, tonumber(LIMITS.ProtocolBody) or 4000) or ''

    MySQL.query.await([[
        INSERT INTO phone_mdt_protocols (`code`, `label`, `category`, `priority`, `description`, `body`)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            `label`       = VALUES(`label`),
            `category`    = VALUES(`category`),
            `priority`    = VALUES(`priority`),
            `description` = VALUES(`description`),
            `body`        = VALUES(`body`)
    ]], { code, label, category, priority, description, body })

    protocols.invalidate()
    return util.ok({ protocol = protocols.byCode(code) }),
        { entityType = 'protocol', entityId = code, details = { label = label, category = category } }
end)

---Removes one protocol.
protocols.delete = access.audited('protocols.manage', function(_, payload)
    local code = util.limitedString(payload.code, 16)
    if not code or not protocols.byCode(code) then return util.fail('mdt.protocolNoLongerExists', 'That protocol no longer exists') end

    MySQL.update.await('DELETE FROM phone_mdt_protocols WHERE `code` = ?', { code })
    protocols.invalidate()
    return util.ok({ code = code }), { entityType = 'protocol', entityId = code }
end)

return protocols
