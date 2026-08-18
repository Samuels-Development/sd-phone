---@type table Version bridge (bridge.server.version): manifest version + latest GitHub release.
local version = require 'bridge.server.version'
---@type table Shared server helpers (server.util): the degraded-table registry.
local util = require 'server.util'

---@type string GitHub repo the update check reads releases from.
local UPDATE_REPO = 'Samuels-Development/sd-phone'

---@type integer Milliseconds between quiescence checks while modules bootstrap.
local TICK_MS = 1000
---@type integer Consecutive quiet ticks before the summary prints. Waiting for the count to stop
---moving, rather than a fixed delay, keeps the total right on a first boot where schema work is
---slow (new indexes, the foreign keys and their orphan sweep all land on that first start).
local QUIET_TICKS = 3

---@type table Boot reporter; the table returned at end of file. Modules report their schema state
---here instead of each printing its own line - thirty-odd "schema ready" prints told a server
---owner nothing that one summary does not.
local M = {}

local ready = 0
local failures = {}

---Records a module's schema as bootstrapped.
function M.schemaReady()
    ready = ready + 1
end

---Records a module's schema as failed. Printed immediately as well as counted: a failure is rare
---and worth seeing at the point it happens, next to whatever else the console is saying.
---@param name string module name
---@param err any error the bootstrap raised
function M.schemaFailed(name, err)
    failures[#failures + 1] = name
    print(('^1[sd-phone]^0 %s schema bootstrap failed: %s'):format(name, err))
end

-- Single boot summary: version, schema count, and an update notice when one is due.
CreateThread(function()
    local last, quiet = -1, 0
    while quiet < QUIET_TICKS do
        Wait(TICK_MS)
        if ready == last then quiet = quiet + 1 else quiet, last = 0, ready end
    end

    local current = version.current()
    print(('^2[sd-phone]^0 v%s ready ^2·^0 %d schemas'):format(current or '?', ready))

    if #failures > 0 then
        print(('^1[sd-phone]^0 %d schema(s) failed: %s'):format(#failures, table.concat(failures, ', ')))
    end

    -- Tables another resource already owns under the same name. The statements against them are
    -- skipped rather than fatal, so this line is the only thing standing between a half-built
    -- schema and an owner who never finds out which table to rename.
    local degraded = util.degraded()
    if #degraded > 0 then
        print(('^3[sd-phone]^0 %d table(s) degraded: %s'):format(#degraded, table.concat(degraded, ', ')))
        print('^3[sd-phone]^0 these names are already used by another resource. Rename them (or drop them if unused) and restart.')
    end

    if not current then return end
    local latest = version.latest(UPDATE_REPO)
    if latest and version.isNewer(current, latest) then
        print(('^3[sd-phone]^0 update available: ^2v%s^0 (running ^3v%s^0) - https://github.com/%s/releases')
            :format(latest, current, UPDATE_REPO))
    end
end)

return M
