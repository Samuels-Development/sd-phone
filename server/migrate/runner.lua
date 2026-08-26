---@type table Import engine (server.migrate.runner). Owns the domain table, the pre-flight scan the
---admin panel previews from, and the single run that both the boot thread and the panel drive.
local config    = require 'configs.config'
local framework = require 'bridge.shared.framework'
---@type table Migration SQL (server.migrate.store): source reads, target writes, markers.
local store     = require 'server.migrate.store'
---@type table Domain planner (server.migrate.plan): queue / done / disabled split.
local plan      = require 'server.migrate.plan'
---@type table Import phrasing (server.migrate.format): counts, durations, summaries.
local fmt       = require 'server.migrate.format'
---@type table Import telemetry (server.migrate.events): console + panel fan-out.
local events    = require 'server.migrate.events'
---@type table Import source registry (server.migrate.sources): which phone the rows come from.
local sources   = require 'server.migrate.sources.init'

local runner = {}

---@type table<string, string> What the panel calls each domain. sd-phone's own name leads, because
---that is what the data becomes and the only name that holds on every server. Where lb-phone ships
---the same app under a different name, its default follows in brackets so the operator recognises
---what they are migrating from. Names that match on both sides take no bracket.
local TITLES = {
    numbers    = 'Phone numbers',
    contacts   = 'Contacts',
    blocked    = 'Blocked numbers',
    calls      = 'Call history',
    messages   = 'Messages',
    reactions  = 'Message reactions',
    photos     = 'Photos and albums',
    notes      = 'Notes',
    settings   = 'Phone settings',
    photogram  = 'Photogram (InstaPic)',
    birdy      = 'Squawk (Birdy)',
    vibez      = 'Clout (Trendy)',
    mail       = 'Mail',
    wallet     = 'Bank (Wallet)',
    voicememos = 'Voice Memos',
    sessions   = 'Signed-in accounts',
}

---@type table<string, string> One line per domain describing what it carries, for the panel.
local BLURB = {
    numbers    = 'Phone numbers and lock passcodes. Everything else keys off this.',
    contacts   = 'Saved contacts and their avatars.',
    blocked    = 'Blocked number list.',
    calls      = 'Call history.',
    messages   = 'SMS threads including group chats.',
    reactions  = 'Reactions on migrated messages.',
    photos     = 'Camera roll photos and albums.',
    notes      = 'Notes app entries.',
    settings   = 'Wallpaper, theme, clock format, ringtones, volumes, home layout.',
    photogram  = 'Photogram accounts, posts, comments, likes, follows, stories and DMs.',
    birdy      = 'Squawk accounts, posts and replies, likes, reposts, follows and DMs.',
    vibez      = 'Clout accounts, videos, comments, likes, saves, follows and notifications.',
    mail       = 'Mailboxes and their received messages.',
    wallet     = 'Wallet transaction history.',
    voicememos = 'Voice memo recordings.',
    sessions   = 'Keeps migrated players signed into their accounts.',
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
    'phone_birdy_profiles', 'phone_birdy_posts', 'phone_birdy_likes', 'phone_birdy_reposts',
    'phone_birdy_follows', 'phone_birdy_dms', 'phone_birdy_notifications',
    'phone_vibez_profiles', 'phone_vibez_posts', 'phone_vibez_comments', 'phone_vibez_likes',
    'phone_vibez_comment_likes', 'phone_vibez_saves', 'phone_vibez_follows',
    'phone_vibez_notifications',
    { 'phone_mail_accounts', 'password_hash' }, { 'phone_message_reactions', 'mid' },
    'phone_bank_transactions', 'phone_voice_memos',
}

---@type boolean True while a run owns the engine. One run at a time, server wide: the writes are
---fill-only so a double run could not corrupt anything, but it would double every porter's work
---and interleave two sets of progress into one log.
local busy = false

---@type boolean Set by runner.cancel(); read between porters.
local cancelRequested = false

---@type table|nil The last completed scan. A scan reads the whole roster and counts every source
---table, so while a run owns the database the panel is handed this instead of competing with the
---import for the same reads.
local lastScan = nil

---@return boolean
function runner.busy() return busy end

---Marker bookkeeping shared by the scan and the run: makes sure the marker table exists and that a
---pre-domain-marker install has its domains backfilled.
---@return table<string, boolean> completed domain keys
local function completed(src)
    store.ensureMarkerTable()
    if src.legacyMark then store.backfillLegacyDomains(src.legacyMark, src.legacyDomains or {}) end

    local out = {}
    for mark in pairs(store.completedDomains()) do
        local domain = sources.domainFor(src, mark)
        if domain then out[domain] = true end
    end
    return out
end

---Every import source this database could be read from, for the panel's source picker.
---@return { key: string, label: string, title: string, blurb: string, present: boolean }[]
function runner.sourceList()
    local out = {}
    for _, src in ipairs(sources.all) do
        local ok, present = pcall(src.detect)
        out[#out + 1] = {
            key = src.key, label = src.label, title = src.title, blurb = src.blurb,
            present = ok and present == true,
        }
    end
    return out
end

---Pre-flight preview: what is on the other side, what has already landed, and how big the job is.
---Writes nothing. This is what the admin panel renders before anything runs.
---@return table
function runner.scan(sourceKey)
    if busy and lastScan then
        local cached = {}
        for k, v in pairs(lastScan) do cached[k] = v end
        cached.busy = true
        return cached
    end

    local src = sources.resolve(sourceKey)

    if not src.detect() then
        return {
            ok = true, lbFound = false, source = src.key, sources = runner.sourceList(),
            domains = {}, totalRows = 0, busy = busy,
        }
    end

    local cfg   = config.Migrate or {}
    local done  = completed(src)
    local stats = store.completedDomainStats()
    local ctx   = src.identity(cfg, framework)

    local domains, totalRows = {}, 0
    for _, port in ipairs(src.ports) do
        local rows = src.rowCount(port.key)
        local status = 'pending'
        if cfg.domains and cfg.domains[port.key] == false then
            status = 'disabled'
        elseif done[port.key] then
            status = 'done'
        end

        domains[#domains + 1] = {
            key      = port.key,
            label    = port.label,
            title    = TITLES[port.key] or port.label,
            blurb    = BLURB[port.key],
            rows     = rows,
            status   = status,
            requires = (src.requires or {})[port.key],
            estimate = fmt.estimate(rows),
            -- A finished domain is settled: its writes were fill-only and every row it could place
            -- is already placed, so running it again can only repeat work to no effect.
            locked   = status == 'done',
            stats    = stats[port.key],
            summary  = fmt.summarise(port.key, stats[port.key]),
        }
        if status == 'pending' then totalRows = totalRows + rows end
    end

    lastScan = {
        ok        = true,
        lbFound   = true,
        source    = src.key,
        sources   = runner.sourceList(),
        busy      = busy,
        domains   = domains,
        totalRows = totalRows,
        estimate  = fmt.estimate(totalRows),
        identity  = ctx.stats,
    }
    return lastScan
end

---Asks the current run to stop. Porters are not interruptible, so the run ends after the domain
---in flight finishes; everything it completed stays marked done.
---@return boolean whether there was a run to stop
function runner.cancel()
    if not busy then return false end
    cancelRequested = true
    events.log('warn', 'stop requested; finishing the current domain then halting.')
    return true
end

---Live rows-per-second, falling back to the measured constant until this run has a sample worth
---trusting. A tiny early sample would swing the ETA wildly, so it only takes over past 5k rows.
---@param doneRows integer
---@param startedAt integer GetGameTimer() reading
---@return number
local function throughput(doneRows, startedAt)
    local secs = (GetGameTimer() - startedAt) / 1000
    if doneRows < 5000 or secs < 2 then return fmt.ROWS_PER_SECOND end
    return math.max(1, doneRows / secs)
end

---Runs the import. Everything it reports goes through `events`, so the console sees the same run
---the panel does.
---@param opts { domains?: table<string, boolean>, dryRun?: boolean, force?: boolean, by?: string }
local function execute(opts)
    local src       = sources.resolve(opts.source)
    local cfg       = config.Migrate or {}
    local dryRun    = opts.dryRun or cfg.dryRun or false
    local selection = opts.domains
    local startedAt = GetGameTimer()

    events.reset({
        phase     = 'running',
        dryRun    = dryRun,
        by        = opts.by,
        startedAt = os.time(),
        doneRows  = 0,
        totalRows = 0,
        domains   = {},
    })

    events.log('info', dryRun
        and ('starting %s import (DRY RUN: counting only, nothing will be written).'):format(src.title)
        or  ('starting %s import.'):format(src.title))

    if not src.detect() then
        events.log('warn', ('no %s tables found in this database, nothing to import.'):format(src.title))
        events.setState({ phase = 'done', finishedAt = os.time() }, true)
        return
    end

    local done = completed(src)

    -- An explicit tick in the panel overrides the config file, but never the completion marker: a
    -- finished domain has already placed every row it could, and its writes are fill-only, so
    -- running it again is pure repeated work. `force` (the console command) still overrules this.
    local split
    if selection then
        local queue, settled, unpicked = {}, {}, {}
        for _, port in ipairs(src.ports) do
            if not selection[port.key] then
                unpicked[#unpicked + 1] = port.key
            elseif done[port.key] and not opts.force then
                settled[#settled + 1] = port.key
            else
                queue[#queue + 1] = port
            end
        end
        split = { queue = queue, alreadyDone = settled, disabled = unpicked }
    else
        split = plan.build(src.ports, done, cfg.domains, opts.force)
    end

    local queue = split.queue
    if #queue == 0 then
        events.log('info', 'nothing to do: every domain is already imported, disabled or unselected.')
        events.setState({ phase = 'done', finishedAt = os.time() }, true)
        return
    end

    local names = {}
    for i, port in ipairs(queue) do names[i] = port.key end
    events.log('info', ('%d domain(s) to import: %s'):format(#queue, table.concat(names, ', ')))
    if #split.alreadyDone > 0 then
        events.log('info', ('already finished, left alone: %s'):format(table.concat(split.alreadyDone, ', ')))
    end

    events.log('info', 'waiting for sd-phone tables to be ready...')
    if not store.waitForTables(TARGETS, 240, 500) then
        events.log('error', 'sd-phone tables not ready in time, aborting. Nothing was written.')
        events.log('error', 'this usually means another resource is still creating them; restart sd-phone.')
        events.setState({ phase = 'failed', finishedAt = os.time() }, true)
        return
    end

    local ctx = src.identity(cfg, framework)
    ctx.dryRun = dryRun
    local s = ctx.stats
    events.log('info', ('matching players: %d lb-phone phones -> %d resolved, %d unresolved, %d ambiguous')
        :format(s.total, s.resolved, s.unresolved, s.ambiguous))
    events.setState({ identity = s })

    local unmatched = s.unresolved + s.ambiguous
    if s.total > 0 and unmatched > 0 then
        local pct = unmatched / s.total * 100
        events.log('warn', ('%d of %d phones (%.1f%%) could not be matched to a character; their data is skipped.')
            :format(unmatched, s.total, pct))
        if pct >= 25 then
            events.log('error', 'that is a high proportion. Check configs/migrate.lua identifierMode before continuing.')
        end
    end
    if s.resolved == 0 then
        events.log('error', 'no phones matched any character, so every domain would import nothing. Aborting.')
        events.setState({ phase = 'failed', finishedAt = os.time() }, true)
        return
    end

    -- Hand the resolved numbers to the readers so they filter in SQL. Without it every porter pulls
    -- its whole source table across the bridge and discards the vast majority in Lua.
    local owned = {}
    for _, p in ipairs(ctx.resolvedPhones) do
        if p.number and p.number ~= '' then owned[#owned + 1] = p.number end
    end
    store.publishOwnedNumbers(owned)

    local sizes, totalRows = {}, 0
    local domainState = {}
    for _, port in ipairs(queue) do
        local n = src.rowCount(port.key)
        sizes[port.key] = n
        totalRows = totalRows + n
        domainState[port.key] = { status = 'queued', rows = n }
    end
    events.setState({ totalRows = totalRows, domains = domainState }, true)

    if totalRows > 0 then
        events.log('info', ('%s source row(s) to process, %s at this scale.')
            :format(fmt.comma(totalRows), fmt.estimate(totalRows)))
        if totalRows > 250000 then
            events.log('warn', 'large database: the server will be busy until this finishes.')
        end
    end

    local okCount, failed, doneRows, results = 0, {}, 0, {}
    local stopped = false

    for _, port in ipairs(queue) do
        if cancelRequested then stopped = true break end

        local at = GetGameTimer()
        local n  = sizes[port.key] or 0
        domainState[port.key].status = 'running'
        -- A porter reads its whole source before it writes anything, which can be minutes with no
        -- rows moving. Saying so is the difference between a rate of zero meaning "pulling data"
        -- and it looking like the import has hung.
        events.setState({
            currentDomain = port.key, currentRows = 0, currentTotal = n, currentStage = 'reading',
        }, true)
        events.log('info', ('%s: reading %s row(s), %s'):format(port.label, fmt.comma(n), fmt.estimate(n)))

        -- Progress from inside the heavy porters. A porter counts in whatever unit suits it -
        -- channels, accounts, mailboxes - and the fraction is scaled onto this domain's row count
        -- here, so no porter has to know what the pre-flight measured. The eleven small ones never
        -- call this, so their bar simply jumps at the boundary. Pushes are throttled in `events`,
        -- so calling this per row is safe.
        -- A porter runs in three acts and only the middle one is quick: it reads its whole source,
        -- walks it in Lua, then writes far more rows than it read. Letting the Lua walk report the
        -- whole domain put the bar at 100% seconds in and left the long write looking like a stall,
        -- so the walk is capped at LOOP_SHARE and the writes carry it the rest of the way.
        local LOOP_SHARE <const> = 0.45
        local loopSeen, writeSeen = 0, 0
        local writeDone, writeTotal = 0, 0
        local stage = 'reading'

        local function pushProgress(urgent)
            local seen = math.max(0, math.min(n, math.max(loopSeen, writeSeen)))
            local rate = throughput(doneRows + seen, startedAt)
            local left = math.max(0, totalRows - (doneRows + seen))
            events.setState({
                currentRows  = seen,
                currentTotal = n,
                currentStage = stage,
                writeDone    = writeDone,
                writeTotal   = writeTotal,
                doneRows     = doneRows + seen,
                etaSeconds   = left / rate,
            }, urgent)
        end

        ctx.report = function(processed, total)
            local frac = (total and total > 0) and math.min(1, (tonumber(processed) or 0) / total) or 0
            loopSeen = math.floor(n * LOOP_SHARE * frac)
            if stage == 'reading' then stage = 'building' end
            pushProgress()
            return not cancelRequested
        end

        -- Each insert call reports its own size, so everything past LOOP_SHARE tracks the write
        -- actually in flight rather than guessing at a total nobody knows up front.
        store.onProgress(function(written, total)
            total = tonumber(total) or 0
            if total ~= writeTotal then writeTotal, writeDone = total, 0 end
            writeDone = writeDone + (tonumber(written) or 0)
            stage = 'writing'
            local frac = writeTotal > 0 and math.min(1, writeDone / writeTotal) or 0
            writeSeen = math.floor(n * (LOOP_SHARE + (0.99 - LOOP_SHARE) * frac))
            pushProgress()
        end)

        local ok, res = pcall(port.run, ctx)
        store.onProgress(nil)
        ctx.report = nil
        doneRows = doneRows + n

        local rate = throughput(doneRows, startedAt)
        local left = math.max(0, totalRows - doneRows)

        if ok then
            okCount = okCount + 1
            results[port.key] = res
            domainState[port.key].status  = 'done'
            domainState[port.key].summary = fmt.describe(res)
            events.log('ok', ('%s: %s (%s)'):format(port.label, fmt.describe(res), fmt.elapsed(at)))
            -- Say why anything was left behind, at the point the number is printed. Nearly every
            -- skip is a row that was already covered rather than one that failed to import.
            for _, line in ipairs(fmt.reasons(port.key, res)) do
                events.log('info', ('    %s'):format(line))
            end
            -- A porter can report that it has work it could not finish yet. Marking it done would
            -- retire it permanently: the sessions porter holds Twitter logins until Squawk's porter
            -- exists, and recording it complete would strand them for good.
            if type(res) == 'table' and res.retry then
                events.log('warn', ('%s left pending; it runs again next start.'):format(port.label))
            elseif not dryRun then
                store.recordDomain(sources.markFor(src, port.key), res)
            end
        else
            failed[#failed + 1] = port.key
            domainState[port.key].status  = 'failed'
            domainState[port.key].summary = tostring(res)
            events.log('error', ('%s FAILED: %s'):format(port.label, tostring(res)))
        end

        events.setState({
            doneRows     = doneRows,
            currentRows  = n,
            etaSeconds   = left / rate,
            domains      = domainState,
        }, true)
    end

    store.clearOwnedNumbers()

    -- The UI hydrates its per-player visuals a few seconds into boot, which on a first import is
    -- before this has written phone_settings. Tell anyone already connected to pull again, or their
    -- wallpaper and tones stay stock until the resource is restarted a second time.
    if not dryRun and okCount > 0 then
        TriggerClientEvent('sd-phone:client:rehydrate', -1)
    end

    local any = false
    for _, port in ipairs(queue) do
        local line = fmt.summarise(port.key, results[port.key])
        if line then
            any = true
            events.log('ok', ('imported %s: %s'):format(port.label, line))
        end
    end
    if not any then events.log('info', 'nothing came across: no lb-phone data matched a character here.') end

    events.log('info', ('finished in %s: %d ok, %d failed.')
        :format(fmt.elapsed(startedAt), okCount, #failed))
    if dryRun then
        events.log('warn', 'DRY RUN: no data was written and no domain was marked done.')
    elseif #failed > 0 then
        events.log('error', ('%d domain(s) failed and were not marked done: %s')
            :format(#failed, table.concat(failed, ', ')))
        events.log('error', 'they will be retried automatically on the next start.')
    end

    events.setState({
        phase      = stopped and 'cancelled' or (#failed > 0 and 'failed' or 'done'),
        finishedAt = os.time(),
        okCount    = okCount,
        failedList = failed,
        currentDomain = nil,
        etaSeconds = 0,
    }, true)

    if stopped then events.log('warn', 'stopped by request; completed domains stay marked done.') end
end

---Starts a run in its own thread and returns immediately. The caller never waits: a real import
---runs for minutes and progress arrives through `events`.
---@param opts { domains?: table<string, boolean>, dryRun?: boolean, force?: boolean, by?: string }
---@return boolean started, string|nil reason
function runner.start(opts)
    if busy then return false, 'A migration is already running.' end
    if not config.Migrate then return false, 'configs/migrate.lua is missing.' end

    busy = true
    cancelRequested = false

    CreateThread(function()
        local ok, err = pcall(execute, opts or {})
        if not ok then
            events.log('error', ('import crashed: %s'):format(err))
            events.log('error', 'domains that completed are marked done; the rest retry on the next start.')
            events.setState({ phase = 'failed', finishedAt = os.time() }, true)
        end
        busy = false
        cancelRequested = false
    end)

    return true
end

return runner
