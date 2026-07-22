-- Services app. Maps framework JOBS to "companies" the phone surfaces: a public directory
-- (locate / call / message) plus boss management of the company's shared balance and employee
-- roster. Society money + employee reads route through bridge/server/society.lua (adapts
-- qb-banking / Renewed-Banking / qbx_management / qb-management / esx_addonaccount).
return {
    -- ESX-ONLY fallback. On QBCore/QBox boss status is read from the grade's
    -- `isboss` flag and this is ignored. On ESX (no isboss flag) it's the minimum
    -- grade treated as a boss when a company has no own `bossGrade`.
    DefaultBossGrade = 3,

    -- Job a fired employee is reset to (QBCore/QBox and ESX both use 'unemployed').
    UnemployedJob = 'unemployed',

    -- Cap on how many employees the roster returns.
    EmployeeLimit = 100,

    -- Jobs tab (multi-job). Only active on QBCore/QBox; the tab is hidden on ESX.
    -- Max jobs a player can keep saved at once. Set to 0 to disable the cap
    -- (unlimited saved jobs) - this also hides the X/X capacity bar in the app.
    MaxSavedJobs = 5,
    -- Jobs never listed, switchable, or accept-able from the Jobs tab (resign to
    -- unemployed via the Actions tab's Quit instead).
    JobBlacklist = { 'unemployed' },
    -- Drop the player off duty when they switch active job (mirrors sd-multijob).
    SwitchOffDuty = true,

    -- Business invoicing. On-duty employees send a banking invoice from their
    -- business to another player; the target pays it from the Banking app and
    -- the sender is notified. Only active on QBCore/QBox (on-duty state must be
    -- resolvable); the section is hidden on ESX, like the Jobs tab.
    -- Payout: when a society bank is available the payment is credited to the
    -- business account; otherwise it falls back to the sending employee's own
    -- bank (see bridge/server/society.lua). A per-company `commission` (below)
    -- splits off a cut of the society-credited payment to the sending employee.
    InvoicesEnabled = true,
    -- Smallest and largest amount a single invoice may be for.
    MinInvoiceAmount = 1,
    MaxInvoiceAmount = 1000000,

    -- One entry per company. `job` is the framework job name (the key everything
    -- keys off). `coords` powers the client-side "Locate" waypoint. Listing a job
    -- here adds it to the public directory and enables Job Calls / company
    -- messaging; jobs NOT listed here still get the rest of the Actions tab (duty,
    -- bank, employees, quit) - they just won't appear in the directory.
    -- `bossGrade` is an ESX-ONLY fallback (overrides DefaultBossGrade for this
    -- company); QBCore/QBox ignore it and use the grade's isboss flag.
    -- `commission` is an OPTIONAL fraction 0.0-1.0 of a paid business invoice
    -- that goes to the sending employee, with the remainder going to the society
    -- account (the two always sum to the invoice amount, so no money is minted).
    -- Absent or 0 means the whole amount goes to the society. Only applies when a
    -- society bank is available; the no-society fallback already pays the sending
    -- employee in full, so no commission is split there.
    Companies = {
        {
            job = 'police',
            label = 'Police',
            location = 'Mission Row',
            color = '#0A84FF',
            emoji = '🚓',
            canCall = true,
            callNumber = '911',
            bossGrade = 3,
            coords = { x = 425.1, y = -979.5, z = 30.7 },
        },
        {
            job = 'ambulance',
            label = 'Ambulance',
            location = 'Pillbox',
            color = '#C0392B',
            emoji = '🚑',
            canCall = true,
            callNumber = '912',
            bossGrade = 3,
            coords = { x = 307.7, y = -1433.4, z = 29.9 },
        },
        {
            job = 'mechanic',
            label = 'Mechanic',
            location = 'LS Customs',
            color = '#3A3A3C',
            emoji = '⚙️',
            canCall = false,
            bossGrade = 2,
            commission = 0.1,
            coords = { x = -347.3, y = -133.8, z = 39.0 },
        },
        {
            job = 'taxi',
            label = 'Taxi',
            location = 'Taxi HQ',
            color = '#27AE60',
            emoji = '🚕',
            canCall = false,
            bossGrade = 2,
            commission = 0.15,
            coords = { x = 895.7, y = -179.3, z = 74.7 },
        },
    },
}
