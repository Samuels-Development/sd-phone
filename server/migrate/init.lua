---@type table Boot orchestration for the lb-phone import (server.migrate.init). Runs each domain
---porter once when lb-phone tables are present and the import has not already run, records a
---completion marker, and registers `sdphone:migrate [dry]` for manual runs.
local config    = require 'configs.config'
local framework = require 'bridge.shared.framework'
local store     = require 'server.migrate.store'
local identity  = require 'server.migrate.identity'

---@type string Marker name.
local MIGRATION = 'lbphone-import-v1'

---@type { key: string, label: string, run: fun(ctx: table): table }[] Domains, in run order.
local PORTS = {
    { key = 'numbers',  label = 'numbers',  run = require('server.migrate.port.numbers').run },
    { key = 'contacts', label = 'contacts', run = require('server.migrate.port.contacts').run },
    { key = 'blocked',  label = 'blocked',  run = require('server.migrate.port.blocked').run },
    { key = 'calls',    label = 'calls',    run = require('server.migrate.port.calls').run },
    { key = 'messages', label = 'messages', run = require('server.migrate.port.messages').run },
    { key = 'photos',   label = 'photos',   run = require('server.migrate.port.photos').run },
    { key = 'notes',    label = 'notes',    run = require('server.migrate.port.notes').run },
}

-- sd-phone tables the porters write into; the migration waits for all of them. Names lb-phone
-- also uses carry a marker column so the wait only passes once the sd-phone shape is in place
-- (the schema bootstrap moves the lb-phone original aside to `<name>_lb`).
---@type (string|{ [1]: string, [2]: string })[]
local TARGETS = {
    'phone_settings', 'phone_contacts', 'phone_calls', 'phone_blocked',
    { 'phone_messages', 'citizenid' }, 'phone_message_groups', 'phone_message_group_members',
    { 'phone_photos', 'citizenid' }, { 'phone_photo_albums', 'citizenid' },
    'phone_photo_album_items', { 'phone_notes', 'citizenid' },
}

---Print a namespaced migration log line.
---@param msg string
local function log(msg) print(('^5[sd-phone:migrate]^0 %s'):format(msg)) end

---Runs the import. `force` ignores the completed marker; `dryRun` counts without writing.
---@param opts { force?: boolean, dryRun?: boolean }
local function run(opts)
    local cfg = config.Migrate or {}
    local dryRun = opts.dryRun or cfg.dryRun or false

    if not store.tableExists(store.lbTable('phones')) then
        log('no lb-phone tables found, nothing to import.')
        return
    end

    store.ensureMarkerTable()
    if not opts.force and store.migrationDone(MIGRATION) then
        log('already imported (marker present). Run `sdphone:migrate` from the console to force.')
        return
    end

    -- Up to 2 minutes: on a large lb-phone database the schema bootstrap has to rename the
    -- colliding lb tables and convert collations before the markers appear.
    if not store.waitForTables(TARGETS, 240, 500) then
        log('^1sd-phone tables not ready in time, aborting import.^0')
        return
    end

    local ctx = identity.build(cfg, framework)
    ctx.dryRun = dryRun
    local s = ctx.stats
    log(('%slb-phone found: %d phones -> %d resolved, %d unresolved, %d ambiguous'):format(
        dryRun and '[DRY RUN] ' or '', s.total, s.resolved, s.unresolved, s.ambiguous))

    local stats = {}
    for _, port in ipairs(PORTS) do
        if not cfg.domains or cfg.domains[port.key] ~= false then
            local ok, res = pcall(port.run, ctx)
            if ok then
                stats[port.key] = res
                log((' - %-9s %s'):format(port.label, json.encode(res)))
            else
                log((' - %-9s ^1failed:^0 %s'):format(port.label, res))
            end
        end
    end

    if not dryRun then store.recordMigration(MIGRATION, stats) end
    log(('%simport complete.'):format(dryRun and '[DRY RUN] no data was written. ' or ''))
end

-- Boot: runs once automatically when enabled.
CreateThread(function()
    local cfg = config.Migrate
    if not cfg or cfg.enabled == false then return end
    local ok, err = pcall(run, { force = false, dryRun = false })
    if not ok then log(('^1import crashed:^0 %s'):format(err)) end
end)

-- Manual trigger from the server console only (source 0): `sdphone:migrate` runs it for real,
-- `sdphone:migrate dry` previews without writing. Ignores the marker.
RegisterCommand('sdphone:migrate', function(source, args)
    if source ~= 0 then return end
    local dryRun = (args[1] or ''):lower() == 'dry'
    CreateThread(function()
        local ok, err = pcall(run, { force = true, dryRun = dryRun })
        if not ok then log(('^1import crashed:^0 %s'):format(err)) end
    end)
end, true)
