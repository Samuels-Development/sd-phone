---@type table Call-history porter (server.migrate.port.calls). Each lb-phone call yields up to two
---sd-phone rows: one for the caller (outgoing) and one for the callee (incoming, or missed when
---unanswered), for parties who resolved. Rows are marked seen; ids derive from the lb-phone call id.
local M = {}

local store = require 'server.migrate.store'
local util  = require 'server.util'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not store.tableExists(store.lbTable('phone_calls')) then return { migrated = 0, skipped = 0 } end

    local rows, migrated, skipped = {}, 0, 0
    for _, c in ipairs(store.lbCalls()) do
        local caller, callee = digits(c.caller), digits(c.callee)
        local callerCid = ctx.numberToCid[caller]
        local calleeCid = ctx.numberToCid[callee]
        local dur = math.floor(tonumber(c.duration) or 0)
        local ts = math.floor(tonumber(c.ts) or 0)
        local any = false

        if callerCid then
            rows[#rows + 1] = { ('c%so'):format(c.id), callerCid, callee, nil, 'outgoing', dur, 1, ts }
            any = true
        end
        if calleeCid then
            local dir = util.truthy(c.answered) and 'incoming' or 'missed'
            rows[#rows + 1] = { ('c%si'):format(c.id), calleeCid, caller, nil, dir, dur, 1, ts }
            any = true
        end

        if any then migrated = migrated + 1 else skipped = skipped + 1 end
    end

    if not ctx.dryRun then store.insertCalls(rows) end
    return { migrated = migrated, skipped = skipped }
end

return M
