-- Racing app - the tablet's race board. Tracks are drawn in-game with the gate
-- creator, ranked events are generated on a timer, and every finish is timed and
-- scored SERVER-side: a client only ever reports which checkpoint it passed and
-- which car it was in. Nothing below runs while Enabled is false.
return {
    -- Whether this server runs Racing at all. Off is genuinely inert: no tables are
    -- built, the generator never ticks, no commands are registered and every
    -- callback refuses immediately. Turn it off if you run the phone alone - the
    -- app is laid out for a tablet, which is also why configs/apps.lua ships it
    -- with enabled = false on phones. To put it on the phone anyway, flip that
    -- flag as well; this one only decides whether the backend exists.
    Enabled = true,

    -- Account entry fees are taken from and prizes paid into: 'cash', 'bank' or
    -- 'crypto'. If the balance there will not cover a buy-in the charge falls back
    -- to the other of cash/bank, and a refund always returns to whichever account
    -- actually paid.
    Currency = 'bank',

    -- Race classes, keyed by letter. A race carries a class CEILING rather than a
    -- fixed class: anyone whose vehicle resolves to that class or below may join,
    -- so an S race is open to everything and a D race is open to D cars only. The
    -- class is always resolved server-side from the model the joiner is sitting in
    -- (see Vehicles), never sent by the client.
    --   level - shown beside the class name in the app. Nothing gates on it: entry
    --           is decided by the car, not by the driver.
    --   label - display name in the UI.
    --   color - hex accent for the class pill. Mirrored by CLASS_COLOR in
    --           web/src/apps/racing/racingTheme.ts, so change both or the app and
    --           this file will disagree.
    Classes = {
        D = { level = 1,  label = 'Rookie',  color = '#9ca3af' },
        C = { level = 1,  label = 'Amateur', color = '#4ade80' },
        B = { level = 5,  label = 'Pro',     color = '#60a5fa' },
        A = { level = 15, label = 'Elite',   color = '#c084fc' },
        S = { level = 25, label = 'Legend',  color = '#fbbf24' },
    },

    -- How a vehicle becomes a race class. Resolved from the model hash in this
    -- order: Models, then FromNativeClass, then Default. Editing these tables is
    -- the only way to change what a car counts as, both for joining a race and for
    -- the class recorded against a finish.
    Vehicles = {
        -- Per-model overrides. Key is the spawn name in lowercase, value is the
        -- class letter. Anything not listed falls through to the native class
        -- below, so this table is for add-ons and for cars whose native class
        -- lies about their real pace.
        Models = {
            ['adder']    = 'S',
            ['zentorno'] = 'S',
            ['emerus']   = 'S',
            ['vacca']    = 'S',
            ['t20']      = 'S',
            ['comet2']   = 'A',
            ['italirsx'] = 'A',
            ['ninef']    = 'A',
            ['banshee']  = 'A',
            ['sultanrs'] = 'B',
            ['feltzer2'] = 'B',
            ['elegy']    = 'B',
            ['zr380']    = 'B',
            ['kuruma']   = 'C',
            ['jester3']  = 'C',
            ['tampa2']   = 'C',
            ['futo']     = 'D',
            ['sultan3']  = 'D',
        },

        -- Fallback keyed by the native GTA vehicle class index the game reports
        -- for a model. An index left out of this table drops to Default, which is
        -- how boats, aircraft and industrial vehicles land in the bottom class
        -- instead of being refused outright. The full index list is:
        --   0 Compacts   1 Sedans      2 SUVs        3 Coupes      4 Muscle
        --   5 Sports Classics          6 Sports      7 Super       8 Motorcycles
        --   9 Off-road  10 Industrial 11 Utility    12 Vans       13 Cycles
        --  14 Boats     15 Helicopters 16 Planes    17 Service    18 Emergency
        --  19 Military  20 Commercial 21 Trains     22 Open Wheel
        FromNativeClass = {
            [7]  = 'S', -- Super
            [22] = 'S', -- Open Wheel
            [6]  = 'A', -- Sports
            [4]  = 'B', -- Muscle
            [5]  = 'B', -- Sports Classics
            [1]  = 'C', -- Sedans
            [3]  = 'C', -- Coupes
            [8]  = 'C', -- Motorcycles
            [9]  = 'C', -- Off-road
            [0]  = 'D', -- Compacts
            [2]  = 'D', -- SUVs
            [12] = 'D', -- Vans
        },

        -- Last resort when neither table matches, including a racer on foot.
        Default = 'D',
    },

    -- Rating (MMR). One number per racer in phone_racing_profiles, shown on the
    -- rankings board and on a driver card.
    MMR = {
        -- What a racer starts on the first time they appear.
        Base = 1000,

        -- How a finish moves the rating.
        --   mode 'linear' - position only. First gains +K, last loses -K, linear
        --                   in between. Opponents' ratings are ignored entirely.
        --   mode 'elo'    - every opponent is a head-to-head duel weighted by the
        --                   rating gap, snapshotted at the green light. Beating a
        --                   higher-rated racer pays more and losing to a
        --                   lower-rated one costs more. In an evenly matched field
        --                   the winner takes roughly K/2; a real upset approaches
        --                   the full K.
        Gain = {
            mode        = 'elo',
            K           = 25,    -- biggest rating swing a single race can cause
            spread      = 400,   -- elo only: rating gap at which the favourite is ~10x more likely to win
            minPlayers  = 2,     -- fields below this award nothing, so nobody farms rating solo
            -- Player-hosted races are unranked by default: only generated events
            -- move ratings and reach the MMR chart. Set true and custom races count
            -- too, which also means two friends in a private lobby can trade rating
            -- between themselves as fast as they can restart.
            customRaces = false,
        },
    },

    -- Did not finish. Once enough racers have crossed the line, everyone still
    -- driving gets a countdown; failing to beat it scores as a loss (the rating
    -- moves as though they finished last and no time is recorded). Disconnecting
    -- mid-race takes the loss on every run the player was part of.
    DNF = {
        Enabled = true,

        -- What arms the countdown.
        --   mode 'count'   - value is a number of finishers, so 1 arms it the
        --                    moment the winner crosses.
        --   mode 'percent' - value is a percentage of the field, rounded up.
        Trigger = { mode = 'count', value = 1 },

        -- Seconds the stragglers get once it is armed. The server floors this at
        -- 10 so a tiny value here cannot make the countdown unwinnable.
        Seconds = 120,
    },

    -- Generated events: how they are driven, and how the pot is divided.
    Ranked = {
        -- Phasing (ghosting): racers in the same event fade out and cannot collide
        -- with each other.
        --   mode 'off'   - never phased, contact racing
        --   mode 'full'  - phased for the whole race
        --   mode 'timed' - phased for `seconds` after the green light, then
        --                  collisions come back for the rest of the race
        Phasing = {
            mode    = 'full',
            seconds = 30,
        },

        -- Camera forced for the duration of a generated event.
        --   'none'  - the racer picks, cinematic cam included
        --   'first' - forced first person, cinematic cam blocked
        --   'third' - forced third person, zoom levels still allowed
        Camera = 'none',

        -- Prize split by finishing position, ranked events ONLY. Index 1 is first
        -- across the line and each value is a fraction of the pool. A position with
        -- no entry wins nothing, and a share nobody finishes into is simply not
        -- paid. Player-hosted races ignore this and pay winner-takes-all of the
        -- buy-ins actually collected. Examples:
        --   { [1] = 1.0 }                                     winner takes all
        --   { [1] = 0.75, [2] = 0.15, [3] = 0.10 }            podium
        --   { [1] = 0.5, [2] = 0.25, [3] = 0.15, [4] = 0.10 } top four paid
        PrizeSplit = { [1] = 0.75, [2] = 0.15, [3] = 0.10 },
    },

    -- Automatic race generation. Every interval the server builds a fresh batch of
    -- events on unique tracks and puts them on the board as "starting in X", which
    -- is what makes the app worth opening on an empty server.
    RaceGen = {
        -- Master switch. Off leaves the board to player-hosted races only.
        Enabled = true,

        -- Minutes between batches.
        IntervalMinutes = 20,

        -- Races per batch. Each one takes a UNIQUE track, so the real count is
        -- capped by how many eligible tracks exist: ten here on a server with four
        -- verified tracks produces four races.
        RacesPerBatch = 10,

        -- Only generate on VERIFIED tracks, the admin-curated flag. Set false to
        -- let any published track host a ranked event, which also means anything a
        -- player saves in the creator can start paying out.
        VerifiedOnly = true,

        -- Each generated race starts this many minutes in the future, picked at
        -- random between the two. Widen the gap for a board that stretches further
        -- ahead; narrow it for one that turns over quickly.
        StartsInMinMinutes = 10,
        StartsInMaxMinutes = 75,

        -- Minutes before the green light that the start-point board appears in the
        -- world, letting players walk up and join without the tablet.
        BoardLeadMinutes = 5,

        -- Circuit lap counts scale with track size: laps are TargetCheckpoints
        -- divided by the track's gate count, rounded, then clamped to min/max. A
        -- short loop therefore runs several laps and a monster track stays at one,
        -- so every generated event lands near the same length. Sprints, which end
        -- somewhere other than where they started, are always a single run.
        Laps = {
            min = 1,
            max = 4,
            TargetCheckpoints = 80,
        },

        -- Buy-in charged to join a generated race, picked at random in this range.
        EntryFee = { min = 250, max = 2500 },

        -- Ranked pools scale with race length and class:
        --   pool = (Base + PerCheckpoint * gates * laps) * ClassMultiplier[class]
        -- then plus or minus Jitter, then rounded to the nearest $50. A class
        -- missing from the multiplier table counts as 1.0. Raise PerCheckpoint to
        -- pay long races better; raise the S multiplier to make the top class worth
        -- the risk.
        PrizePool = {
            Base = 1000,
            PerCheckpoint = 60,
            ClassMultiplier = { D = 0.8, C = 1.0, B = 1.3, A = 1.7, S = 2.2 },
            Jitter = 0.15,
        },

        -- Grid size, picked at random per race. BaseRegistered pads the registered
        -- counter with racers who do not exist, so a new board does not read 0/16 on
        -- every row. Off by default: the count players read is the count that joined.
        -- Raising it only dresses the number, never the grid, so the seats stay open.
        MaxRacers      = { min = 6, max = 16 },
        BaseRegistered = { min = 0, max = 0  },

        -- Event names are built as "<Prefix> <Suffix>". Add your own for local
        -- flavour; the two lists are combined freely, so a handful of each already
        -- gives hundreds of names.
        NamePrefixes = {
            'Midnight', 'Neon', 'Velocity', 'Crimson', 'Chrome', 'Apex', 'Redline',
            'Nitro', 'Phantom', 'Turbo', 'Eclipse', 'Vortex', 'Inferno', 'Static',
            'Golden', 'Savage', 'Electric', 'Wicked', 'Rogue', 'Shadow',
        },
        NameSuffixes = {
            'Rush', 'Sprint', 'Circuit', 'Dash', 'Run', 'Loop', 'Brawl', 'Pursuit',
            'Cup', 'GP', 'Showdown', 'Mile', 'Storm', 'Blitz', 'Fury', 'Drift',
        },
    },

    -- The in-game gate creator: drive the route, drop a gate at each corner, save
    -- it as a track. Everything it produces lands unverified, so a fresh track
    -- cannot be picked up as a ranked event until an admin verifies it.
    Creator = {
        -- Off means the command is never registered AND the save callback refuses,
        -- so tracks can then only arrive through the database.
        Enabled      = true,

        -- Chat command that toggles the creator (without the /). The standalone
        -- sd-racing resource registers a command of the same name, so while both
        -- resources run whichever starts last owns it. Stop sd-racing, or rename
        -- this, to be sure which creator you are driving.
        Command      = 'createtrack',

        -- Ace the command is restricted to, re-checked server-side when the track
        -- is saved. Grant it with `add_ace group.admin command.createtrack allow`
        -- in server.cfg.
        Ace          = 'command.createtrack',

        -- Gates a saved track must have. The floor is what makes a route a route,
        -- a start and a finish; the ceiling bounds both the JSON blob one row
        -- carries and the number of props a client spawns when the race begins.
        MinGates     = 2,
        MaxGates     = 512,

        -- Gate width in metres, the distance between the two posts. Min/Max bound
        -- what the arrow keys can reach, DefaultWidth is where a fresh gate starts,
        -- and WidthStep is the metres added per frame while an arrow key is held,
        -- so raise it for coarser, faster adjustment. Width shapes the posts that
        -- get drawn during the race but NOT whether a checkpoint counts: that is
        -- purely Race.CheckpointRadius below.
        MinWidth     = 2.0,
        MaxWidth     = 50.0,
        DefaultWidth = 12.0,
        WidthStep    = 0.15,

        -- Prop stood at each post while editing. Any small, tall prop works, and it
        -- is spawned translucent and collisionless so it never blocks the builder.
        -- Same candidates as Race.GateProp below.
        FlagModel    = 'prop_beachflag_01',

        -- Metres beyond which already-placed gates stop being drawn. Lower it if a
        -- long track costs you frames in the editor.
        DrawRadius   = 300.0,

        -- Who may open the track creator (the /createtrack command and the phone's
        -- "+" button both read this):
        --   'ace'      - only players holding the Ace above. Their tracks publish
        --                immediately, exactly like every version of this feature
        --                before approval existed.
        --   'everyone' - any player may create a track. A creator who holds the Ace
        --                is trusted and still publishes immediately; everyone else's
        --                track is queued as pending until an admin approves or
        --                rejects it from the phone's admin panel.
        Access = 'ace',
    },

    -- The live race: what the client draws, and what counts as passing a gate.
    Race = {
        -- Horizontal metres from a checkpoint's centre that count as reached. This
        -- is the ONLY hit test: gate width, heading and direction of travel are all
        -- ignored, so a narrow gate on a wide road is still a 14 metre circle.
        -- Shrink it for tighter racing and expect more missed gates at speed.
        CheckpointRadius   = 14.0,

        -- Numbers counted down on the line before the field is released.
        CountdownSeconds   = 3,

        -- Gates carrying a map pin and a GPS line at once: the one being driven to
        -- and the two after it. The set slides forward as each gate is taken rather
        -- than standing as a finished picture of the track, so the minimap stays
        -- readable and the racing line is something you read off the road. Raise it
        -- to show more of what is coming; 1 shows only the gate you are chasing.
        GatesAhead         = 3,

        -- Prop spawned at both posts of every gate for the duration of a race.
        -- Frozen, collisionless and flagged as a mission entity, so a racer drives
        -- straight through it and it cannot be shoved or culled. Local to each
        -- client. Flares read better than flags on a night track:
        --   prop_beachflag_01  the default, a tall marker visible from distance
        --   prop_flare_01a     a lit road flare, low and bright
        --   prop_air_conelight a lit cone, brighter still
        GateProp           = 'prop_beachflag_01',

        -- The lineup check a joined racer has to satisfy at the start line.
        --   LineupRadius      metres from the line they must be inside
        --   LineupFaceDegrees biggest heading error allowed, so 90 accepts the
        --                     whole front 180 degree arc
        --   LineupLineMetres  metres past the line still counted as behind it
        LineupRadius       = 40.0,
        LineupFaceDegrees  = 90.0,
        LineupLineMetres   = 3.5,

        -- The floating checkpoint billboard climbs as the racer falls further back
        -- so it stays visible over buildings and hills. Height ramps from Min at
        -- MarkerNear metres to Max at MarkerFar metres, and holds flat past each
        -- end. Raise MarkerHeightMax for tracks that run behind tall geometry.
        MarkerHeightMin    = 12.0,
        MarkerHeightMax    = 45.0,
        MarkerNear         = 20.0,
        MarkerFar          = 250.0,

        -- Seconds before an abandoned run is swept out of memory. It bounds how
        -- long a run nobody ever finished, a crashed lobby or a field that all
        -- quit, keeps holding its race id.
        RunMaxAgeSeconds   = 3600,
    },

    -- Who reaches the Admin tab: verify, feature, unpublish and delete tracks.
    -- Every one of those handlers re-checks this server-side, so the UI hiding the
    -- tab is presentation only.
    Admin = {
        -- Ace that grants it. Add `add_ace group.admin command.racingadmin allow`
        -- to server.cfg, or point this at an ace you already grant your staff.
        Ace = 'command.racingadmin',

        -- Extra identifiers that count as admin whatever the aces say. Any FiveM
        -- identifier type works: 'fivem:787003', 'license:0123456789abcdef...',
        -- 'steam:110000100000000', 'discord:123456789012345678'. Leave it empty to
        -- rely on the ace alone.
        Identifiers = {},
    },

    -- Hard bounds the server enforces on anything a client sends. The app clamps
    -- the same numbers so the forms look tidy, but these are what actually decide.
    Limits = {
        -- Text caps in characters. Each matches its database column, so raising one
        -- without widening the column truncates the value silently.
        TrackNameMax  = 60,   -- phone_racing_tracks.name
        AliasMax      = 24,   -- phone_racing_profiles.alias
        AvatarUrlMax  = 500,  -- phone_racing_profiles.avatar, https:// only

        -- Bounds on a player-hosted race. Delay is the seconds between hosting and
        -- the green light, so DelayMin is how long the field gets to reach the
        -- start line. PhaseSec bounds 'timed' phasing.
        DelayMin      = 10,
        DelayMax      = 600,
        LapsMin       = 1,
        LapsMax       = 20,
        BuyInMin      = 0,
        BuyInMax      = 100000,
        PhaseSecMin   = 5,
        PhaseSecMax   = 300,

        -- Rows per page in the tracks list and the rankings table. These must match
        -- TRACKS_PER_PAGE and RANKS_PER_PAGE in web/src/apps/racing/data.ts, or the
        -- pager will offer pages the server never fills.
        TracksPerPage = 20,
        RanksPerPage  = 25,

        -- How deep the leaderboard is cached and served. A racer further down still
        -- sees their own true rank on their card, it just is not browsable.
        LeaderboardMax = 500,
    },

    -- Per-character rate limits. `window` is milliseconds and `max` is how many
    -- calls are allowed inside it. Keyed on citizenid rather than on the session,
    -- so dropping and reconnecting does not clear a limit.
    RateLimits = {
        Join     = { window = 60000,  max = 10 }, -- joining a lobby
        Leave    = { window = 60000,  max = 10 }, -- leaving one
        Host     = { window = 300000, max = 3  }, -- hosting a custom race
        Create   = { window = 600000, max = 5  }, -- saving a track from the creator
        Identity = { window = 300000, max = 5  }, -- alias, avatar and HUD writes
        Admin    = { window = 60000,  max = 30 }, -- verify, feature, delete
    },
}
