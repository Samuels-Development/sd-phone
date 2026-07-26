---@type table Boot orchestration for the lb-phone import (server.migrate.init). Runs each domain
---porter once, marking domains done individually so a later version imports only what it added,
---and registers `sdphone:migrate [dry]` for manual runs.
local config    = require 'configs.config'
local framework = require 'bridge.shared.framework'
local store     = require 'server.migrate.store'
local identity  = require 'server.migrate.identity'
local plan      = require 'server.migrate.plan'

---@type string Whole-import marker written before domains were marked individually.
local LEGACY_MIGRATION = 'lbphone-import-v1'

---@type string[] Domains that the legacy marker covered, backfilled so they are not re-run.
local LEGACY_DOMAINS = {
    'numbers', 'contacts', 'blocked', 'calls', 'messages', 'photos', 'notes',
}

---@type { key: string, label: string, run: fun(ctx: table): table }[] Domains, in run order.
local PORTS = {
    { key = 'numbers',    label = 'numbers',    run = require('server.migrate.port.numbers').run },
    { key = 'contacts',   label = 'contacts',   run = require('server.migrate.port.contacts').run },
    { key = 'blocked',    label = 'blocked',    run = require('server.migrate.port.blocked').run },
    { key = 'calls',      label = 'calls',      run = require('server.migrate.port.calls').run },
    { key = 'messages',   label = 'messages',   run = require('server.migrate.port.messages').run },
    -- After messages: joins on the `m<id>` mid values that porter writes.
    { key = 'reactions',  label = 'reactions',  run = require('server.migrate.port.reactions').run },
    { key = 'photos',     label = 'photos',     run = require('server.migrate.port.photos').run },
    { key = 'notes',      label = 'notes',      run = require('server.migrate.port.notes').run },
    { key = 'settings',   label = 'settings',   run = require('server.migrate.port.settings').run },
    { key = 'photogram',  label = 'photogram',  run = require('server.migrate.port.photogram').run },
    { key = 'mail',       label = 'mail',       run = require('server.migrate.port.mail').run },
    { key = 'wallet',     label = 'wallet',     run = require('server.migrate.port.wallet').run },
    { key = 'voicememos', label = 'voicememos', run = require('server.migrate.port.voicememos').run },
    -- Last: links sessions to the accounts the photogram porter created.
    { key = 'sessions',   label = 'sessions',   run = require('server.migrate.port.sessions').run },
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
    'phone_photogram_profiles', 'phone_photogram_posts', 'phone_photogram_comments',
    'phone_photogram_likes', 'phone_photogram_comment_likes', 'phone_photogram_follows',
    'phone_photogram_stories', 'phone_photogram_story_views', 'phone_photogram_dms',
    'phone_photogram_notifications', 'phone_app_accounts', 'phone_app_sessions',
    { 'phone_mail_accounts', 'password_hash' }, { 'phone_message_reactions', 'mid' },
    'phone_bank_transactions', 'phone_voice_memos',
}

---@type table<string, string[]> Source tables each domain reads, for the pre-flight row count. A
---domain missing here simply reports no estimate.
local DOMAIN_SOURCES = {
    numbers    = { 'phones' },
    contacts   = { 'phone_contacts' },
    blocked    = { 'phone_blocked_numbers' },
    calls      = { 'phone_calls' },
    messages   = { 'message_channels', 'message_members', 'message_messages' },
    reactions  = { 'message_reactions' },
    photos     = { 'photos', 'photo_albums', 'photo_album_photos' },
    notes      = { 'notes' },
    settings   = { 'phones' },
    photogram  = {
        'instagram_accounts', 'instagram_posts', 'instagram_comments', 'instagram_likes',
        'instagram_follows', 'instagram_follow_requests', 'instagram_stories',
        'instagram_stories_views', 'instagram_messages', 'instagram_notifications',
    },
    mail       = { 'mail_accounts', 'mail_messages' },
    wallet     = { 'wallet_transactions' },
    voicememos = { 'voice_memos_recordings' },
    sessions   = { 'logged_in_accounts' },
}

---@type integer Rows per second the import sustains, measured against a production dump. Only ever
---used to set expectations before a long run, never to make a decision.
local ROWS_PER_SECOND = 12000

---A rough human duration for a row count.
---@param rows integer
---@return string
local function estimate(rows)
    local secs = rows / ROWS_PER_SECOND
    if secs < 90 then return ('~%ds'):format(math.max(1, math.floor(secs + 0.5))) end
    return ('~%dm'):format(math.max(1, math.floor(secs / 60 + 0.5)))
end

---Thousands-separated, so six and seven figure counts stay readable in a console.
---@param n integer
---@return string
local function comma(n)
    local s = tostring(math.floor(n))
    local out = s:reverse():gsub('(%d%d%d)', '%1,'):reverse()
    return (out:gsub('^,', ''))
end

---`3 contacts` / `1 contact`. Nouns ending in a consonant + y, or in a sibilant, do not take a
---bare `s`, which produced "storys" and "mailboxs".
---@param n integer
---@param noun string singular form
---@return string
local function plural(n, noun)
    if n == 1 then return ('%s %s'):format(comma(n), noun) end
    local suffixed
    if noun:match('[^aeiou]y$') then
        suffixed = noun:sub(1, -2) .. 'ies'
    elseif noun:match('([sxz])$') or noun:match('([cs]h)$') then
        suffixed = noun .. 'es'
    else
        suffixed = noun .. 's'
    end
    return ('%s %s'):format(comma(n), suffixed)
end

---A one-line human summary of what a domain actually brought across, or nil when it brought
---nothing. Reads the counters the porter returned rather than what it was asked to process, so the
---figures are what landed.
---@param key string domain key
---@param res table|nil counts returned by the porter
---@return string|nil
local function summarise(key, res)
    if type(res) ~= 'table' then return nil end
    local parts = {}
    for _, field in ipairs(SUMMARY_FIELDS[key] or {}) do
        local n = tonumber(res[field[1]]) or 0
        if n > 0 then parts[#parts + 1] = plural(n, field[2]) end
    end
    if #parts == 0 then return nil end
    return table.concat(parts, ', ')
end

---@type table<string, { [1]: string, [2]: string }[]> What to show per domain in the closing
---summary: the counter each porter returns, paired with a human noun. Counters that are zero are
---left out, so a server without a given app produces no line for it.
local SUMMARY_FIELDS = {
    numbers    = { { 'set', 'phone number' } },
    contacts   = { { 'migrated', 'contact' } },
    blocked    = { { 'migrated', 'blocked number' } },
    calls      = { { 'migrated', 'call' } },
    messages   = { { 'migrated', 'message' }, { 'groups', 'group chat' } },
    reactions  = { { 'imported', 'reaction' } },
    photos     = { { 'photos', 'photo' }, { 'albums', 'album' }, { 'links', 'album photo' } },
    notes      = { { 'migrated', 'note' } },
    settings   = { { 'imported', 'settings profile' } },
    photogram  = {
        { 'profiles', 'Photogram account' }, { 'posts', 'post' }, { 'comments', 'comment' },
        { 'stories', 'story' }, { 'dms', 'direct message' }, { 'follows', 'follow' },
    },
    mail       = { { 'accounts', 'mailbox' }, { 'messages', 'email' } },
    wallet     = { { 'imported', 'wallet transaction' } },
    voicememos = { { 'imported', 'voice memo' } },
    sessions   = { { 'written', 'signed-in account' }, { 'deferred', 'login held for Squawk' } },
}

---Print a namespaced migration log line.
---@param msg string
local function log(msg) print(('^5[sd-phone:migrate]^0 %s'):format(msg)) end

---A porter's counts as `5 imported, 2 skipped`, ordered so the headline number reads first.
---@param res table counts returned by a porter
---@return string
local function describe(res)
    if type(res) ~= 'table' then return 'done' end
    local order = {
        'imported', 'accounts', 'profiles', 'posts', 'written', 'messages', 'sessions',
        'comments', 'likes', 'commentLikes', 'follows', 'stories', 'views', 'dms',
        'notifications', 'deferred', 'set', 'conflict', 'skipped',
    }
    local seen, parts = {}, {}
    for _, key in ipairs(order) do
        local v = res[key]
        if type(v) == 'number' and v > 0 then
            seen[key] = true
            parts[#parts + 1] = ('%d %s'):format(v, key)
        end
    end
    for key, v in pairs(res) do
        if not seen[key] and type(v) == 'number' and v > 0 then
            parts[#parts + 1] = ('%d %s'):format(v, key)
        end
    end
    if #parts == 0 then return 'nothing to import' end
    return table.concat(parts, ', ')
end

---Elapsed seconds since a GetGameTimer() reading, to one decimal.
---@param since integer
---@return string
local function elapsed(since) return ('%.1fs'):format((GetGameTimer() - since) / 1000) end

---Runs the import. `force` re-runs domains already marked done; `dryRun` counts without writing.
---@param opts { force?: boolean, dryRun?: boolean }
local function run(opts)
    local cfg = config.Migrate or {}
    local dryRun = opts.dryRun or cfg.dryRun or false
    local startedAt = GetGameTimer()

    log('==================== lb-phone import ====================')
    if dryRun then log('^3DRY RUN: counting only, nothing will be written.^0') end

    if not store.tableExists(store.lbTable('phones')) then
        log('no lb-phone tables found in this database, nothing to import.')
        log('=========================================================')
        return
    end

    store.ensureMarkerTable()

    -- Installs that finished the pre-domain-marker import get their domains backfilled, so only
    -- the domains added since actually run.
    if store.backfillLegacyDomains(LEGACY_MIGRATION, LEGACY_DOMAINS) then
        log(('found a completed %s import; its %d domains are marked done.')
            :format(LEGACY_MIGRATION, #LEGACY_DOMAINS))
    end

    local split = plan.build(PORTS, store.completedDomains(), cfg.domains, opts.force)
    local queue = split.queue

    if #queue == 0 then
        log(('nothing to do: %d domains already imported, %d disabled in configs/migrate.lua.')
            :format(#split.alreadyDone, #split.disabled))
        log('run `sdphone:migrate` from the server console to force a re-import.')
        log('=========================================================')
        return
    end

    local names = {}
    for i, port in ipairs(queue) do names[i] = port.key end
    log(('%d domains to import: %s'):format(#queue, table.concat(names, ', ')))
    if #split.alreadyDone > 0 then
        log(('already imported, skipping: %s'):format(table.concat(split.alreadyDone, ', ')))
    end
    if #split.disabled > 0 then
        log(('disabled in configs/migrate.lua: %s'):format(table.concat(split.disabled, ', ')))
    end

    -- Up to 2 minutes: on a large lb-phone database the schema bootstrap has to rename the
    -- colliding lb tables and convert collations before the markers appear.
    log('waiting for sd-phone tables to be ready...')
    if not store.waitForTables(TARGETS, 240, 500) then
        log('^1sd-phone tables not ready in time, aborting import. Nothing was written.^0')
        log('^1this usually means another resource is still creating them; restart sd-phone.^0')
        log('=========================================================')
        return
    end

    local ctx = identity.build(cfg, framework)
    ctx.dryRun = dryRun
    local s = ctx.stats
    log(('matching players: %d lb-phone phones -> %d resolved, %d unresolved, %d ambiguous')
        :format(s.total, s.resolved, s.unresolved, s.ambiguous))

    local unmatched = s.unresolved + s.ambiguous
    if s.total > 0 and unmatched > 0 then
        local pct = unmatched / s.total * 100
        local line = ('^3%d of %d phones (%.1f%%) could not be matched to a character; their data is skipped.^0')
            :format(unmatched, s.total, pct)
        log(line)
        if pct >= 25 then
            log('^1that is a high proportion. Check configs/migrate.lua identifierMode before continuing.^0')
        end
    end
    if s.resolved == 0 then
        log('^1no phones matched any character, so every domain would import nothing. Aborting.^0')
        log('=========================================================')
        return
    end

    -- Hand the resolved numbers to the readers so they filter in SQL. Without it every porter pulls
    -- its whole source table across the bridge and discards the vast majority in Lua.
    local owned = {}
    for _, p in ipairs(ctx.resolvedPhones) do
        if p.number and p.number ~= '' then owned[#owned + 1] = p.number end
    end
    store.publishOwnedNumbers(owned)

    -- Pre-flight sizing. A production lb-phone database runs to millions of rows and the import
    -- can take many minutes, so the size is reported up front rather than leaving an operator
    -- staring at a console wondering whether it has hung.
    local sizes, totalRows = {}, 0
    for _, port in ipairs(queue) do
        local sources = DOMAIN_SOURCES[port.key]
        local n = sources and store.lbRowCount(sources) or 0
        sizes[port.key] = n
        totalRows = totalRows + n
    end
    if totalRows > 0 then
        log(('%s source row(s) to process, %s at this scale.'):format(comma(totalRows), estimate(totalRows)))
        if totalRows > 250000 then
            log('^3large database: the server will be busy until this finishes. It runs once.^0')
        end
    end

    local okCount, failed, doneRows, results = 0, {}, 0, {}
    for _, port in ipairs(queue) do
        local at = GetGameTimer()
        local n = sizes[port.key] or 0
        if n > 50000 then
            log((' .. %-11s reading %s rows, %s'):format(port.label, comma(n), estimate(n)))
        end
        local ok, res = pcall(port.run, ctx)
        doneRows = doneRows + n
        local pct = totalRows > 0 and math.floor(doneRows / totalRows * 100) or 100
        if ok then
            okCount = okCount + 1
            results[port.key] = res
            log((' -> %-11s %s (%s, %d%%)'):format(port.label, describe(res), elapsed(at), pct))
            if not dryRun then store.recordDomain(port.key, res) end
        else
            failed[#failed + 1] = port.key
            log((' -> %-11s ^1FAILED:^0 %s'):format(port.label, tostring(res)))
        end
    end

    store.clearOwnedNumbers()

    -- The UI hydrates its per-player visuals a few seconds into boot, which on a first import is
    -- before this has written phone_settings. Tell anyone already connected to pull again, or their
    -- wallpaper and tones stay stock until the resource is restarted a second time.
    if not dryRun and okCount > 0 then
        TriggerClientEvent('sd-phone:client:rehydrate', -1)
    end

    -- Closing overview. The per-domain lines above scroll past during a long run, so what actually
    -- came across is restated once, in plain terms, at the end.
    log('======================= imported ========================')
    local any = false
    for _, port in ipairs(queue) do
        local line = summarise(port.key, results[port.key])
        if line then
            any = true
            log(('  %-11s %s'):format(port.label, line))
        end
    end
    if not any then log('  nothing: no lb-phone data matched a character on this server.') end

    log('=========================================================')
    log(('import finished in %s: %d ok, %d failed.'):format(elapsed(startedAt), okCount, #failed))
    if dryRun then
        log('^3DRY RUN: no data was written and no domain was marked done.^0')
    elseif #failed > 0 then
        log(('^1%d domain(s) failed and were not marked done: %s^0')
            :format(#failed, table.concat(failed, ', ')))
        log('^1they will be retried automatically on the next start.^0')
    end
    log('=========================================================')
end

-- Drops every table sd-phone owns and forgets the import markers, so the next start rebuilds the
-- schema from scratch and re-imports. Server console only, and requires the confirm word: this
-- destroys every player's phone. lb-phone's own tables are left alone, or there would be nothing
-- left to import from.
RegisterCommand('sdphone:wipedata', function(source, args)
    if source ~= 0 then return end
    if (args[1] or '') ~= 'CONFIRM' then
        log('^1this deletes every phone in the database, and cannot be undone.^0')
        log('run `sdphone:wipedata CONFIRM` if that is really what you want.')
        return
    end

    CreateThread(function()
        ---@type string[] Tables sd-phone creates (server.admin.tables).
        local owned = require 'server.admin.tables'
        log('==================== wiping sd-phone ====================')

        local dropped, kept = store.dropOwnedTables(owned)

        log(('%d table(s) dropped%s.'):format(dropped, kept > 0 and (', %d left alone'):format(kept) or ''))
        log('lb-phone source tables were left untouched, so the import can run again.')
        log('restart the resource to rebuild the schema and re-import.')
        log('=========================================================')
    end)
end, true)

-- Boot: imports any domain not yet marked done. Adding a porter later means only that porter runs.
CreateThread(function()
    local cfg = config.Migrate
    if not cfg or cfg.enabled == false then return end
    local ok, err = pcall(run, { force = false, dryRun = false })
    if not ok then
        log(('^1import crashed:^0 %s'):format(err))
        log('^1no domain was marked done, so the import retries on the next start.^0')
    end
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
