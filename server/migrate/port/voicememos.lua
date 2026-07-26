---@type table Voice memo porter (server.migrate.port.voicememos). Copies lb-phone voice memo
---recordings to their owner's sd-phone memo list. A memo with no URL is unplayable and skipped.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { imported: number, skipped: number }
function M.run(ctx)
    local rows, imported, skipped = {}, 0, 0
    if not store.tableExists(store.lbTable('voice_memos_recordings')) then
        return { imported = 0, skipped = 0 }
    end

    for _, v in ipairs(store.lbVoiceMemos()) do
        local cid = ctx.numberToCid[digits(v.phone_number)]
        local url = tostring(v.file_url or '')
        if cid and url ~= '' then
            local name = tostring(v.file_name or '')
            if name == '' then name = 'Recording' end
            rows[#rows + 1] = {
                cid, name:sub(1, 120), url:sub(1, 512),
                math.floor(tonumber(v.file_length) or 0),
                math.floor(tonumber(v.ts) or 0),
            }
            imported = imported + 1
        else
            skipped = skipped + 1
        end
    end

    if not ctx.dryRun then store.insertVoiceMemos(rows) end
    return { imported = imported, skipped = skipped }
end

return M
