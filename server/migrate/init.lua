---@type table Import entry points (server.migrate.init). The engine lives in server.migrate.runner;
---this wires it to the three ways a run is asked for: the boot thread, the server console, and the
---admin panel's migration page.
local config      = require 'configs.config'
---@type table Import engine (server.migrate.runner): scan, run, cancel.
local runner      = require 'server.migrate.runner'
---@type table Import telemetry (server.migrate.events): console + panel fan-out.
local events      = require 'server.migrate.events'
---@type table Migration SQL (server.migrate.store): used here only for the wipe command.
local store       = require 'server.migrate.store'
---@type table Panel permission gate (server.admin.permissions): ace check.
local permissions = require 'server.admin.permissions'
---@type table Response envelopes (server.util): ok / fail.
local util        = require 'server.util'
---@type table Player bridge (bridge.server.player): who started a run, for the log.
local player      = require 'bridge.server.player'

---Print a namespaced line for the commands that run outside a migration.
---@param msg string
local function log(msg) print(('^5[sd-phone:migrate]^0 %s'):format(msg)) end

---Registers one migration callback behind the same ace gate the admin panel uses. The gate runs on
---every call; the client entry point is never the security boundary.
---@param name string action suffix, e.g. 'migrateScan'
---@param fn fun(src: number, payload: table|nil): table
local function reg(name, fn)
    lib.callback.register('sd-phone:server:admin:' .. name, function(src, payload)
        if not permissions.isAllowed(src) then return util.fail('migrate.notAuthorized', 'Not authorized') end
        return fn(src, payload)
    end)
end

---Preview: what the chosen source has, what already landed, and how big the job is. Writes nothing.
---A nil source falls back to whichever import source this database actually carries.
reg('migrateScan', function(_src, payload)
    local sourceKey = type(payload) == 'table' and payload.source or nil
    local ok, res = pcall(runner.scan, sourceKey)
    if not ok then return util.fail('migrate.scanFailed', 'Scan failed: {error}', { error = tostring(res) }) end
    return util.ok(res)
end)

---Current run state plus its log so far, and start watching. A panel opening part way through a
---run gets everything it missed in this one answer.
reg('migrateState', function(src)
    events.subscribe(src)
    return util.ok(events.snapshot())
end)

---Stop receiving pushes. Sent when the migration page is left or the panel closes.
reg('migrateWatch', function(src, payload)
    if payload and payload.on == false then
        events.unsubscribe(src)
    else
        events.subscribe(src)
    end
    return util.ok()
end)

---Starts a run for the ticked domains. Returns as soon as the thread is spawned: progress arrives
---as pushes, never as this answer.
reg('migrateStart', function(src, payload)
    local selection
    if type(payload) == 'table' and type(payload.domains) == 'table' then
        selection = {}
        local any = false
        for _, key in ipairs(payload.domains) do
            if type(key) == 'string' then selection[key] = true; any = true end
        end
        if not any then return util.fail('migrate.selectLeastOneDomainImport', 'Select at least one domain to import.') end
    end

    events.subscribe(src)
    local started, refusal = runner.start({
        domains = selection,
        source  = type(payload) == 'table' and payload.source or nil,
        dryRun  = type(payload) == 'table' and payload.dryRun == true,
        by      = player.getName(src) or ('player %d'):format(src),
    })
    if not started then
        return refusal or util.fail('migrate.couldNotStartMigration', 'Could not start the migration.')
    end
    return util.ok()
end)

---Asks the running import to stop after the domain in flight.
reg('migrateStop', function()
    if not runner.cancel() then return util.fail('migrate.noMigrationRunning', 'No migration is running.') end
    return util.ok()
end)

-- Boot: imports any domain not yet marked done, unless the server has turned the automatic run off
-- and drives it from the admin panel instead. Adding a porter later means only that porter runs.
CreateThread(function()
    local cfg = config.Migrate
    if not cfg or cfg.enabled == false then return end
    runner.start({ force = false, dryRun = false, by = 'server start' })
end)

-- Manual trigger from the server console only (source 0). Both arguments are optional and order
-- does not matter: `dry` previews without writing, and an import source name picks which phone to
-- read from (`lbphone` or `yseries`), defaulting to whichever this database actually carries.
--   sdphone:migrate                -> real run, detected source
--   sdphone:migrate dry            -> preview, detected source
--   sdphone:migrate yseries dry    -> preview, YSeries
-- Ignores the domain markers.
RegisterCommand('sdphone:migrate', function(source, args)
    if source ~= 0 then return end

    local dryRun, sourceKey = false, nil
    for i = 1, #args do
        local arg = tostring(args[i]):lower()
        if arg == 'dry' then dryRun = true else sourceKey = arg end
    end

    local started, refusal = runner.start({
        force  = true,
        dryRun = dryRun,
        source = sourceKey,
        by     = 'server console',
    })
    if not started then log(('^1%s^0'):format(refusal and refusal.message or 'could not start')) end
end, true)

-- Drops every table sd-phone owns and forgets the import markers, so the next start rebuilds the
-- schema from scratch and re-imports. Server console only, and requires the confirm word: this
-- destroys every player's phone. The source phone's own tables are left alone, or there would be
-- nothing left to import from.
RegisterCommand('sdphone:wipedata', function(source, args)
    if source ~= 0 then return end
    if (args[1] or '') ~= 'CONFIRM' then
        log('^1this deletes every phone in the database, and cannot be undone.^0')
        log('run `sdphone:wipedata CONFIRM` if that is really what you want.')
        return
    end
    if runner.busy() then
        log('^1a migration is running; wait for it to finish before wiping.^0')
        return
    end

    CreateThread(function()
        ---@type string[] Tables sd-phone creates (server.admin.tables).
        local owned = require 'server.admin.tables'
        log('==================== wiping sd-phone ====================')

        local dropped, kept = store.dropOwnedTables(owned)

        log(('%d table(s) dropped%s.'):format(dropped, kept > 0 and (', %d left alone'):format(kept) or ''))
        log('the source phone tables were left untouched, so the import can run again.')
        log('restart the resource to rebuild the schema and re-import.')
        log('=========================================================')
    end)
end, true)
