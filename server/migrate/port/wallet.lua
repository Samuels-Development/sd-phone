---@type table Wallet porter (server.migrate.port.wallet). Copies lb-phone wallet transactions
---into sd-phone's bank transaction history. The lb logo column has no target and is dropped.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { imported: number, skipped: number }
function M.run(ctx)
    local rows, imported, skipped = {}, 0, 0
    if not store.lbSource('wallet_transactions') then
        return { imported = 0, skipped = 0 }
    end

    for _, t in ipairs(store.lbWallet()) do
        local cid = ctx.numberToCid[digits(t.phone_number)]
        if cid then
            rows[#rows + 1] = {
                cid,
                tostring(t.company or ''):sub(1, 120),
                math.floor(tonumber(t.amount) or 0),
                'wallet',
                math.floor(tonumber(t.ts) or 0),
                ('lbw%s'):format(t.id),
            }
            imported = imported + 1
        else
            skipped = skipped + 1
        end
    end

    if not ctx.dryRun then store.insertBankTx(rows) end
    return { imported = imported, skipped = skipped }
end

return M
