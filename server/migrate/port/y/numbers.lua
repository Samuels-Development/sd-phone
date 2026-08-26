---@type table Number + passcode porter (server.migrate.port.y.numbers). Adopts each resolved
---character's YSeries primary SIM number as their sd-phone number, and their device pin as the lock
---passcode, but only when they do not already have one. Runs first.
local M = {}

---@type table Migration SQL (server.migrate.store): the shared number/passcode adopter.
local store = require 'server.migrate.store'

---@param ctx table migration context (cidToImei, imeiToNumber, pins, dryRun)
---@return { set: number, skipped: number, conflict: number }
function M.run(ctx)
    local set, skipped, conflict = 0, 0, 0

    for cid, imei in pairs(ctx.cidToImei) do
        local number = ctx.imeiToNumber[imei]
        if not number then
            skipped = skipped + 1
        else
            local status = store.adoptNumber(cid, number, ctx.pins[imei], ctx.dryRun)
            if status == 'set' then
                set = set + 1
            elseif status == 'conflict' then
                conflict = conflict + 1
            else
                skipped = skipped + 1
            end
        end
    end

    return { set = set, skipped = skipped, conflict = conflict }
end

return M
