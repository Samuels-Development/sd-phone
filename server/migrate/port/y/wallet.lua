---@type table Wallet porter (server.migrate.port.y.wallet). Copies YSeries banking transactions
---into sd-phone's Wallet ledger, writing one signed row per side that resolves to a character.
local M = {}

---@type table Migration SQL (server.migrate.store): the bank-transaction writer.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'
---@type table Shared server helpers (server.util): trim.
local util = require 'server.util'

---@type integer Rows read per page.
local PAGE <const> = 5000

---@param ctx table migration context (numberToCid, digits, dryRun)
---@return { imported: number, skipped: number }
function M.run(ctx)
    if not ystore.table('banking_transactions') then return { imported = 0, skipped = 0 } end

    local migrated, skipped, offset = 0, 0, 0

    while true do
        local page = ystore.page('banking_transactions',
            '`id`, `sender_number`, `recipient_number`, `amount`, `reason`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, t in ipairs(page) do
            local senderCid = ctx.numberToCid[ctx.digits(t.sender_number)]
            local recipientCid = ctx.numberToCid[ctx.digits(t.recipient_number)]
            local amount = math.floor(tonumber(t.amount) or 0)
            local ts = tonumber(t.ts) or os.time()
            local label = (util.trim(t.reason)):sub(1, 120)
            if label == '' then label = 'Transfer' end

            if amount == 0 or (not senderCid and not recipientCid) then
                skipped = skipped + 1
            else
                if senderCid then
                    rows[#rows + 1] = { senderCid, label, -amount, 'transfer', ts, ('yt%s-o'):format(t.id) }
                    migrated = migrated + 1
                end
                if recipientCid then
                    rows[#rows + 1] = { recipientCid, label, amount, 'transfer', ts, ('yt%s-i'):format(t.id) }
                    migrated = migrated + 1
                end
            end
        end

        if not ctx.dryRun and #rows > 0 then store.insertBankTx(rows) end
    end

    return { imported = migrated, skipped = skipped }
end

return M
