-- vRP adapter. Only read when bridge/shared/framework.lua detects a started `vrp`
-- resource, so QBox, QBCore and ESX servers never load a line of it. It is loaded
-- through a pcall in bridge/shared/vrp_version.lua, which means a missing or broken
-- file degrades to defaults instead of taking the resource down.
--
-- vRP has no job field, no grade, no boss flag and no duty flag. It has GROUPS and
-- PERMISSION STRINGS, and nothing else. Everywhere the phone asks for a job name, a
-- grade number or "is this player a boss", the answer comes from the mapping below -
-- there is no heuristic and no guessing. A job that is not described here does not
-- exist as far as the phone is concerned, which is the safe direction: every
-- job-gated app simply stays hidden.
return {
    -- Which vRP lineage this server runs. 'auto' probes vrp's own files and is right
    -- for every stock install: vRP 2 ships vRPShared.lua and vRP 1 ships
    -- lib/Tools.lua, and no install has both. Set 1 or 2 only if you run a fork that
    -- renamed those files. An install that matches neither is treated as 2, because
    -- the vRP 2 path verifies itself at runtime and prints a warning when its
    -- handshake fails, whereas a wrong guess of 1 would quietly return nothing
    -- forever.
    Version = 'auto',

    -- What a "phone owner" is on vRP 2. 'character' keys every phone row on the vRP
    -- character id, so each character carries their own number, contacts, messages
    -- and bank log - the default, and the model the rest of the phone assumes.
    -- 'account' keys on the vRP user id instead, so all of an account's characters
    -- share one phone.
    --
    -- CHANGING THIS AFTER PLAYERS HAVE PHONES ORPHANS EVERY ROW: the keys stop
    -- matching and every player is handed a blank handset while the old data sits
    -- unreachable in the tables. Decide once, before go-live.
    --
    -- vRP 1 has no characters at all - one identity per account - so it always
    -- behaves as 'account' and ignores this setting.
    IdentityScope = 'character',

    -- The `_config.gtype` your job groups and gang groups are declared under in vRP's
    -- cfg/groups.lua. vRP allows a player only one group per gtype, and that
    -- exclusivity is exactly what makes a job a job: joining `police_sergeant` evicts
    -- `police` automatically. The adapter reads the active job straight off that
    -- rule, so a group listed under Jobs below that does NOT carry
    -- `_config.gtype = JobGtype` will stack instead of replacing, and promoting
    -- someone will leave their old rank attached.
    JobGtype  = 'job',
    GangGtype = 'gang',

    -- Milliseconds a resolved job/grade/boss triple is served from memory before it
    -- is read from vRP again. Most callers ask for all three in one breath, and this
    -- collapses that burst into a single round trip. Raising it makes a promotion
    -- take that much longer to be seen by the phone; setting it to 0 disables the
    -- cache and re-reads on every single question.
    JobCacheTtl = 250,

    -- Where a fired employee lands. vRP has no "unemployed job", so firing has to
    -- mean something concrete. Leave this nil and firing simply REMOVES the
    -- employee's current JobGtype group, which is the safer default because a firing
    -- must always revoke - a failure to add a replacement group must never leave the
    -- old rank in place. Name a group here only if your server has a real one that
    -- civilians are expected to hold.
    UnemployedGroup = nil,

    -- One entry per job the phone knows about. `job` is the name used everywhere else
    -- the phone names a job - configs/services.lua, configs/mdt.lua, configs/apps.lua
    -- gates - so these strings must match those files exactly. A job missing from this
    -- table resolves to no job at all.
    Jobs = {
        {
            job   = 'police',
            label = 'Police',

            -- Rank-per-group servers, the common convention: list every rank group
            -- LOW TO HIGH. The player's grade is the index of the highest group they
            -- hold, minus one, so the order of this list IS the promotion ladder.
            -- Servers that run a single group per job and express rank through
            -- permissions list one entry here and use `gradePermissions` below.
            --
            -- Every group named here must carry `_config.gtype = JobGtype` in vRP's
            -- cfg/groups.lua, or vRP will not evict the old rank on promotion and the
            -- player will read as their highest-ever rank forever.
            groups      = { 'police', 'police_sergeant', 'police_lieutenant', 'police_chief' },

            -- Display names for each grade, index-matched to `groups`. Shown wherever
            -- the phone prints a rank; a missing entry falls back to the grade number.
            gradeLabels = { 'Officer', 'Sergeant', 'Lieutenant', 'Chief' },

            -- Grade from permissions instead of from group index, for the one-group
            -- convention. Only consulted when `groups` has a single entry, and the
            -- highest matching level wins. Nil means grade 0 for everyone in the
            -- group.
            --
            -- PLAIN PERMISSIONS ONLY. vRP's "!name.arg" function-permission form is
            -- REFUSED here and answers false, never true: vRP hands those to
            -- registered permission functions, and several of the stock ones
            -- (`inside`, `in_vehicle`, `in_owned_vehicle`, `home`, `item`,
            -- `aptitude`) block on a round trip to the player's client, which cannot
            -- be done from inside the phone's adapter. A "!" entry is therefore not a
            -- slow permission, it is a permission that is never granted. Use a plain
            -- permission string or a group.
            gradePermissions = nil,
            -- e.g. { { perm = 'police.sergeant', level = 1 }, { perm = 'police.chief', level = 3 } }

            -- Boss status, which gates every company management action: the shared
            -- balance, deposits, withdrawals, hiring, firing, promoting and demoting.
            -- EITHER of these satisfies it - membership of any group in `bossGroups`,
            -- or holding `bossPermission`.
            --
            -- With both left nil the adapter falls back to `grade >=` the ESX boss
            -- grade the caller already supplies (a company's own `bossGrade` in
            -- configs/services.lua, or DefaultBossGrade there), so an unconfigured
            -- vRP server behaves exactly like an ESX one rather than handing the
            -- whole company to grade 0.
            --
            -- `bossPermission` is a PLAIN permission; the "!" form is refused, as
            -- described above.
            bossGroups     = { 'police_chief' },
            bossPermission = nil,

            -- On-duty state, which vRP has no concept of. Leave both nil - the
            -- default - and `job.getDuty()` returns nothing, so the phone falls back
            -- to its own stored duty preference exactly as it does on ESX. Set both
            -- to wire duty to a real vRP group: `dutyPermission` is how the adapter
            -- READS whether the player is on duty, `dutyGroup` is the group it adds
            -- or removes to CHANGE it. Setting only one leaves duty unresolvable and
            -- is treated as if neither were set.
            --
            -- `dutyPermission` is a PLAIN permission; the "!" form is refused, as
            -- described above.
            dutyPermission = nil,
            dutyGroup      = nil,
        },

        -- The five entries below are COMMENTED OUT on purpose, and they are the ones
        -- most servers need next. configs/mdt.lua ships six departments and
        -- configs/services.lua ships several companies, but a job with no entry in
        -- this table resolves to no job at all: that is the intended fail-closed
        -- behaviour, and it also means a stock vRP install looks broken rather than
        -- unconfigured. The MDT terminal for a department whose job is unmapped never
        -- appears, and its Services company is unreachable.
        --
        -- Uncomment the ones your server runs and change the group names to match your
        -- own cfg/groups.lua. The group names here are only plausible defaults; vRP
        -- servers hand-write their groups, so there is no convention to guess at.
        --
        -- { job = 'sheriff',   label = 'Sheriff',
        --   groups      = { 'sheriff', 'sheriff_sergeant', 'sheriff_chief' },
        --   gradeLabels = { 'Deputy', 'Sergeant', 'Sheriff' },
        --   bossGroups  = { 'sheriff_chief' } },
        --
        -- { job = 'sasp',      label = 'State Police',
        --   groups      = { 'sasp', 'sasp_sergeant', 'sasp_commander' },
        --   gradeLabels = { 'Trooper', 'Sergeant', 'Commander' },
        --   bossGroups  = { 'sasp_commander' } },
        --
        -- { job = 'ambulance', label = 'EMS',
        --   groups      = { 'emergency', 'emergency_senior', 'emergency_chief' },
        --   gradeLabels = { 'Paramedic', 'Senior Paramedic', 'Chief' },
        --   bossGroups  = { 'emergency_chief' } },
        --
        -- { job = 'judge',     label = 'Judge',
        --   groups      = { 'judge' },
        --   gradeLabels = { 'Judge' },
        --   bossGroups  = { 'judge' } },
        --
        -- { job = 'lawyer',    label = 'Lawyer',
        --   groups      = { 'lawyer' },
        --   gradeLabels = { 'Attorney' } },
    },

    -- Gangs, in exactly the same shape as Jobs and read under GangGtype. Nothing in
    -- the phone consumes a gang today, so an empty table costs nothing; this exists
    -- so that the day something does, it reads real groups rather than silently
    -- finding nobody.
    Gangs = {},

    -- Offline vehicle records for the MDT, and for the MDT only. vRP core stores a
    -- player's vehicles as a bare (user_id, model) pair with NO PLATE, and vRP 2 has
    -- no vehicle table at all, so MDT vehicle search and plate lookups are off by
    -- default and return an empty page. Point this at a third-party vRP garage
    -- table to switch them on: `plateCol` is what makes a lookup possible at all,
    -- `modelCol` names the vehicle, and `stateCol` is optional and only decides
    -- whether a row reads as stored or out.
    --
    -- This does NOT wire up the Garages app. That app needs a full garage profile -
    -- a state column with its stored/out values, a garage column, and prop and
    -- condition keys - which these five fields cannot supply, so it stays empty on
    -- vRP. See configs/garages.lua.
    Vehicles = nil,
    -- e.g. { table = 'vrp_user_vehicles', idCol = 'user_id', plateCol = 'plate',
    --        modelCol = 'vehicle', stateCol = nil }

    -- Adds INDEX(firstname) and INDEX(name) to vRP's identity table, exactly once.
    -- vRP indexes only `registration` and `phone`, so MDT citizen search reads every
    -- row on a server with tens of thousands of characters. Off by default, because
    -- turning it on ALTERs a table sd-phone does not own, and leaving it off costs
    -- nothing but search speed.
    --
    -- Be clear about what it buys you: a search for text ANYWHERE in a name still
    -- scans the table, because no index can serve a leading wildcard. These indexes
    -- only help a lookup anchored at the start of a name. Turn it on when searches
    -- have become slow, not in anticipation.
    AddSearchIndexes = false,

    -- One-shot rewrite of `vrp:u<user_id>` phone keys to `vrp:c<cid>` after a
    -- vRP 1 -> vRP 2 migration, so a player's phone follows them across the upgrade.
    -- It runs once and is then remembered, so leaving it true afterwards is harmless.
    -- Only accounts holding EXACTLY ONE character are rewritten; accounts with
    -- several are skipped and logged by user_id, because there is no honest way to
    -- decide which of them inherits the phone - handing it to the wrong character
    -- would give them another person's messages. Off unless you have actually
    -- migrated.
    MigrateV1Keys = false,

    -- Reserved, and deliberately not implemented. vRP mints its own DDD-DDDD number
    -- for each identity; sd-phone mints and owns its own, in its own format and with
    -- its own uniqueness rules, and the two cannot be reconciled. vRP's number is
    -- read for one purpose only: the MDT shows it beside the phone's own number on a
    -- citizen record. Setting this true does nothing.
    AdoptVrpPhoneNumber = false,
}
