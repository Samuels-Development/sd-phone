---@type table Number + passcode porter (server.migrate.port.numbers). Adopts each resolved
---player's lb-phone number as their sd-phone number, and their lb-phone pin as the lock passcode,
---but only when they do not already have one. Runs first.
local M = {}

local store = require 'server.migrate.store'

---@param ctx table migration context (resolvedPhones, dryRun)
---@return { set: number, skipped: number, conflict: number }
function M.run(ctx)
    local set, skipped, conflict = 0, 0, 0
    for _, p in ipairs(ctx.resolvedPhones) do
        local status = store.adoptNumber(p.cid, p.number, p.pin, ctx.dryRun)
        if status == 'set' then
            set = set + 1
        elseif status == 'conflict' then
            conflict = conflict + 1
        else
            skipped = skipped + 1
        end
    end
    return { set = set, skipped = skipped, conflict = conflict }
end

return M
