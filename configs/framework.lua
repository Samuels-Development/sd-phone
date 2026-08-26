-- Framework-specific settings.
--
-- ox_core, not yet wired: employee and owner NAMES come back blank in the Services roster, the
-- MDT people search and Homes offline lookups, and jail features stay off. Identity, cash and
-- bank money, jobs, gangs and society balances are all wired.
--
-- Only ox_core needs anything here: QBCore, QBox, ESX and ND all name
-- their concepts the same way on every install, so the bridge reads them without asking.
--
-- ND in particular needs NOTHING configured. Its `nd_groups` table carries an `isJob` flag per
-- group, so the phone reads which groups are jobs and which are gangs straight from ND, and
-- `nd_group_ranks.isBoss` gives it a real boss grade rather than the guess ox_core needs below.
-- Not wired on ND, because ND_Core has no such concept: company balances (the Services app keeps
-- its roster, hiring and boss actions, but shows no shared account), on-duty state, and jail.
--
-- ox_core has no jobs or gangs. It has GROUPS, and a group's `type` is a free-form string the
-- server owner picks when creating it (types/index.ts declares it `type?: string`, with no
-- enforced vocabulary and no default). So the phone cannot guess which of your groups are jobs
-- and which are gangs the way it can on the other three - you tell it here.
return {
    OxCore = {
        -- Group types the phone treats as JOBS. Matched in order, first hit wins, so put your
        -- primary type first. A group whose type is not listed in either table is ignored by the
        -- phone entirely: it will not show as a job, a gang, or in the Services app.
        JobTypes = { 'job' },

        -- Group types the phone treats as GANGS. Kept separate from JobTypes because the phone
        -- gates apps on them independently (a gang-only app must not unlock for a police group).
        GangTypes = { 'gang' },

        -- Treat the top grade of a group as its boss grade. ox_core has per-grade permissions
        -- rather than a boss flag, so there is nothing to read; the phone falls back to "highest
        -- grade in the group is the boss", which is how QBCore's isboss behaves in practice.
        -- Set false to refuse every boss action instead, leaving the Services app read-only.
        TopGradeIsBoss = true,
    },
}
