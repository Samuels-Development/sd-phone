---@type table Sessions porter (server.migrate.port.sessions). Turns lb-phone's logged-in accounts
---into accounts-engine sessions so migrated players stay signed in. Mail is excluded: the mail
---porter owns mail login state.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'

---@type table<string, string> lb app name -> sd app name.
local APPS = { instagram = 'photogram', twitter = 'birdy' }

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---@param ctx table migration context (numberToCid, dryRun)
---@return { written: number, deferred: number, skipped: number }
function M.run(ctx)
    local rows, written, deferred, skipped = {}, 0, 0, 0
    if not store.tableExists(store.lbTable('logged_in_accounts')) then
        return { written = 0, deferred = 0, skipped = 0 }
    end

    for _, l in ipairs(store.lbLoggedIn()) do
        local app = APPS[l.app]
        local cid = ctx.numberToCid[digits(l.phone_number)]
        if not app or not cid then
            skipped = skipped + 1
        elseif app == 'birdy' then
            -- Squawk is still one account per character; its porter arrives with the
            -- multi-account refactor and these rows are picked up then.
            deferred = deferred + 1
        else
            rows[#rows + 1] = { app, cid, l.username }
            written = written + 1
        end
    end

    if not ctx.dryRun then store.insertPgSessions(rows) end
    return { written = written, deferred = deferred, skipped = skipped }
end

return M
