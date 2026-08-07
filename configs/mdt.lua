-- MDT app - the Mobile Police Terminal. It runs on the phone and on sd-tablet, in
-- a layout suited to each. Every threshold the server enforces is declared here and
-- nowhere else: the UI only ever hides controls, it never grants them.
return {
    -- Whether this server runs an MDT at all. ON by default, so a fresh install has
    -- working terminals without a second config to find.
    --
    -- Turn it OFF if nobody on your server should have one: leaving it on builds a
    -- dozen tables, seeds the penal code and ticks a dispatch sweep. Which players
    -- see an icon is a separate question, answered per player by their job through
    -- server/appgate.lua, so this switch is about the backend existing at all. The
    -- app catalog cannot decide it either: a companion device carries its own
    -- catalog and this server never reads it.
    --
    -- To run a terminal on the phone itself, set `mdt` to `enabled = true` in
    -- configs/apps.lua as well.
    Enabled = true,

    -- Departments whose members reach the MDT. A player's ACTIVE framework job
    -- must appear here or every callback refuses, including the reads.
    --   job       framework job name
    --   type      'leo' | 'ems' | 'doj' - drives terminology on the frontend
    --   label     full department name shown in the header strip
    --   short     abbreviation used on the seal
    --   seal      DepartmentSeal artwork id ('lspd', 'bcso', 'sasp', 'doj', 'ems')
    --   accent    department colour, hex
    --   callsign  prefix for auto-generated callsigns ('LS' -> LS-104)
    --   bossGrade ESX-only boss threshold (ESX has no isboss flag)
    Departments = {
        {
            job       = 'police',
            type      = 'leo',
            label     = 'Los Santos Police Department',
            short     = 'LSPD',
            seal      = 'lspd',
            accent    = '#1D4ED8',
            callsign  = 'LS',
            bossGrade = 4,
        },
        {
            job       = 'sheriff',
            type      = 'leo',
            label     = 'Blaine County Sheriff Office',
            short     = 'BCSO',
            seal      = 'bcso',
            accent    = '#166534',
            callsign  = 'BC',
            bossGrade = 4,
        },
        {
            job       = 'sasp',
            type      = 'leo',
            label     = 'San Andreas State Police',
            short     = 'SASP',
            seal      = 'sasp',
            accent    = '#7C2D12',
            callsign  = 'SA',
            bossGrade = 4,
        },

        -- An `ems` department gets the MEDICAL terminal instead of the police
        -- one: Patients rather than Profiles, Protocols rather than the penal
        -- code, and no Vehicles, Warrants or Jail. Its paperwork lives in its
        -- own domain, which the server enforces - a medic cannot read a police
        -- report and an officer cannot read a medical one.
        --
        -- Fire, air ambulance or a second hospital are just more `ems`
        -- departments; they each get their own roster, chat and call board.
        {
            job       = 'ambulance',
            type      = 'ems',
            label     = 'San Andreas Medical Services',
            short     = 'SAMS',
            seal      = 'ems',
            accent    = '#E11D48',
            callsign  = 'M',
            bossGrade = 4,
        },

        -- A `doj` department gets the COURT terminal: a docket, expungement
        -- petitions and a read-only view of the police paperwork a case is
        -- built on. It has no dispatch board, no jail and no seized handsets,
        -- because a court does not police - it rules on what policing produced.
        --
        -- `bench = true` marks the department that WEARS THE ROBE. Only a bench
        -- department reaches the ruling keys (court.rule, expunge.rule,
        -- warrants.void); an attorney department files and argues. Both read the
        -- same docket, which is what makes a hearing a conversation rather than
        -- two disconnected screens.
        {
            job       = 'judge',
            type      = 'doj',
            bench     = true,
            label     = 'San Andreas Superior Court',
            short     = 'SASC',
            seal      = 'doj',
            accent    = '#6D28D9',
            callsign  = 'HON',
            bossGrade = 3,
        },
        {
            job       = 'lawyer',
            type      = 'doj',
            label     = 'San Andreas Bar Association',
            short     = 'SABA',
            seal      = 'doj',
            accent    = '#7C3AED',
            callsign  = 'ATT',
            bossGrade = 3,
        },
    },

    -- When true a boss of their department (QBCore/QBox `isboss` flag, ESX
    -- grade >= bossGrade) holds every permission below. The chain-of-command
    -- guard on roster.grade / roster.dismiss still applies to a boss: nobody
    -- re-grades a peer, a superior, or themselves.
    BossBypass = true,

    -- Permission key -> MINIMUM job grade. A key that is not listed here is
    -- DENIED, not permitted, so a fresh install behaves predictably. Grades are
    -- the framework's own ladder, so grade 4 on a three-rank job simply means
    -- "nobody but a boss".
    Permissions = {
        ['home.view']        = 0,
        ['persons.view']     = 0,
        ['profiles.view']    = 0,
        ['vehicles.view']    = 0,
        ['reports.view']     = 0,
        ['reports.create']   = 0,
        ['reports.edit.own'] = 0,
        ['cases.view']       = 0,
        ['warrants.view']    = 0,
        ['offences.view']    = 0,
        ['roster.view']      = 0,
        ['employees.view']   = 0,
        ['dispatch.view']    = 0,
        ['dispatch.attach']  = 0,
        ['dispatch.status']  = 0,
        ['chat.view']        = 0,
        ['chat.send']        = 0,
        ['bulletins.view']   = 0,

        -- Standing orders. Every sworn member reads their own department's SOPs;
        -- there is no manage key because configs/sops.lua is the only author.
        ['sops.view']        = 0,
        ['me.update']        = 0,

        -- Medical terminal. `patients.view` is the EMS counterpart of
        -- persons.view and `protocols.view` of offences.view; a department of
        -- type 'leo' never sees either section, so listing them here costs a
        -- police server nothing.
        ['patients.view']    = 0,
        ['protocols.view']   = 0,

        -- Court terminal. A `doj` department never sees a police-only key and a
        -- police department never sees one of these, so listing them costs a
        -- server that runs no court nothing. The ruling keys are additionally
        -- reserved for a department marked `bench`, whatever the grade.
        ['court.view']       = 0,
        ['court.file']       = 0,
        ['expunge.view']     = 0,
        ['expunge.file']     = 0,
        ['court.manage']     = 1,
        ['court.rule']       = 1,
        ['expunge.rule']     = 1,
        ['warrants.void']    = 2,

        -- Internal Affairs. Filing a complaint is deliberately open to every
        -- sworn grade: a probationer who witnesses misconduct must be able to
        -- report it. Reading and investigating the file is not.
        ['affairs.file']     = 0,

        -- Reading a seized handset. Set above 0 to keep it off patrol grades, and every
        -- lookup writes an audit row naming the officer and whose phone they opened.
        ['phone.view']       = 1,

        ['persons.edit']     = 1,
        ['vehicles.edit']    = 1,
        ['patients.edit']    = 1,
        ['cases.create']     = 1,
        ['cases.edit']       = 1,
        ['jail.view']        = 1,

        ['warrants.issue']   = 2,
        ['jail.book']        = 2,

        ['reports.edit.any'] = 3,
        ['warrants.close']   = 3,
        ['bulletins.manage'] = 3,
        ['roster.callsign']  = 3,
        ['roster.radio']     = 3,

        ['affairs.view']       = 3,
        ['affairs.investigate'] = 3,

        ['reports.delete']   = 4,
        ['cases.delete']     = 4,
        ['protocols.manage'] = 4,
        ['roster.grade']     = 4,
        ['roster.dismiss']   = 4,
        ['logs.view']        = 4,
        ['affairs.close']    = 4,
    },

    -- Booking and sentencing. Months and fine are always derived server-side
    -- from the report's charge rows; these only bound what an officer may take
    -- OFF that figure.
    Jail = {
        MaxFine            = 25000, -- hard ceiling on a single citation
        MaxReductionMonths = 12,    -- most an officer may cut from a sentence
        MaxFineReduction   = 2500,  -- most an officer may cut from a citation
        MaxMonths          = 240,   -- hard ceiling on a single sentence
        -- Prison system. 'auto' probes, in order: qbx_prison, qb-prison, xt-prison,
        -- pickle_prisons, tk_jail, esx_tk_jail, qb-policejob, ps-policejob, esx_jail,
        -- esx-qalle-jail, rcore_prison.
        Resource           = 'auto',
        -- What the prison counts a sentence in. 'auto' trusts the adapter, which is right for
        -- every script above. Override only if yours was reconfigured: getting this wrong is the
        -- difference between a six month sentence and a six second one.
        TimeUnit           = 'auto', -- 'auto' | 'months' | 'minutes' | 'seconds'
        -- Real seconds one MDT month is worth, used only for prisons that count in seconds or
        -- minutes. Ignored by month-based prisons, which take the sentence as-is.
        SecondsPerMonth    = 60,
        JailAccount        = 'bank', -- account a citation is debited from
    },

    -- Warrants. Closing a warrant expires it rather than deleting it, so the
    -- record survives for the audit trail.
    Warrants = {
        DefaultExpiryDays = 7,
        MaxExpiryDays     = 90,
        MaxBond           = 500000,
    },

    -- Dispatch is entirely in memory. TTL is how long a call stays on the board
    -- with nobody attached before it expires.
    Dispatch = {
        CallTTL        = 900,      -- seconds
        MaxCalls       = 60,
        CallsignFormat = '%s-%03d', -- prefix, sequence
        SweepSeconds   = 15,

        -- Whether police and medical share one call board. Off by default: a
        -- medic's board carries medical calls and medical units only, and an
        -- officer's carries neither. Turn it on for a server that wants both
        -- services looking at one CAD, in which case every unit and every call
        -- is visible to both and the seal on a row says which service it is.
        Shared         = false,

        -- How often, in milliseconds, unit positions are refreshed for the CAD map. Coarse on
        -- purpose: the map wants to know roughly where a unit is, and a tighter tick pushes the
        -- whole board to every terminal that much more often. Skipped entirely with nobody on air.
        PositionMs     = 4000,
    },

    -- Department radio channel. In-memory ring buffer, nothing persisted.
    Chat = {
        MaxMessages = 50,
        MaxLength   = 300,
        RateWindow  = 60000, -- ms
        RateMax     = 20,    -- messages per window
    },

    -- Row caps for the paginated master lists.
    Paging = {
        PageSize    = 25,
        MaxPageSize = 50,
        MaxPage     = 400,
    },

    -- Report types offered in the editor. Must match the ReportType union in
    -- web/src/apps/mdt/data.ts.
    ReportTypes = { 'Incident', 'Traffic', 'Arrest', 'Investigation', 'Warrant' },

    -- The medical terminal's own report types, offered instead of the list
    -- above when the author's department is type 'ems'. Must match the
    -- EmsReportType union in web/src/apps/mdt/data.ts.
    EmsReportTypes = { 'Patient Care', 'Trauma', 'Cardiac', 'Overdose', 'Transport', 'Death' },

    -- Roles a person can hold on a MEDICAL report, replacing the police
    -- suspect/victim/witness set. Must match EMS_INVOLVED_ROLES in
    -- web/src/apps/mdt/data.ts.
    EmsInvolvedRoles = { 'patient', 'witness', 'responder', 'other' },

    -- Officer-set flags offered on a citizen record. Must match PERSON_FLAGS in
    -- web/src/apps/mdt/data.ts.
    PersonFlags = { 'wanted', 'armed', 'gang', 'mental_health', 'flight_risk', 'informant' },

    -- Content caps for officer-authored text.
    Limits = {
        ReportTitle   = 160,
        ReportBody    = 12000,
        CaseTitle     = 160,
        CaseSummary   = 4000,
        CaseNote      = 1000,
        PersonNotes   = 4000,
        VehicleNotes  = 2000,
        BulletinTitle = 120,
        BulletinBody  = 4000,
        Callsign      = 12,
        RadioChannel  = 12,
        MediaUrl      = 512,
        Charges       = 40, -- charge lines per report
        Involved      = 24, -- involved persons per report

        -- Medical terminal.
        MedicalNotes  = 4000,
        Allergies     = 400,
        Conditions    = 400,
        Medications   = 400,
        ProtocolTitle = 120,
        ProtocolBody  = 4000,
    },
}
