-- Minigames other resources start on a player's phone through the sd-phone exports. Every round
-- is opened, timed and judged on the server, so a client that fakes a win has nothing to fake:
-- the answer is checked here and the caller redeems a receipt the server minted.
return {
    -- Whether the minigame exports work at all.
    Enabled = true,

    -- Seconds the server keeps an unfinished round before abandoning it, whatever the game's own
    -- clock says. Covers a player who crashes or unloads mid-round.
    RoundTimeout = 180,

    -- Seconds a winning receipt stays redeemable. The calling resource only needs long enough to
    -- pass it to its own server event.
    ReceiptLifetime = 60,

    -- Shortest gap between two answers the server accepts, in milliseconds. A player needs roughly
    -- a fifth of a second to read feedback and press again; anything quicker is a script.
    MinAnswerGap = 200,

    -- Defaults per game. Whatever the calling resource passes overrides these key by key, and any
    -- key it leaves out falls back to the value here.
    Games = {
        -- Anagram: put the scrambled letters back in order.
        anagram = { attempts = 3, time = 45 },

        -- Lockpick: feel along the barrel for where each pin gives. Positions stay on the server.
        lockpick = {
            pins      = 3,  -- pins to set
            tolerance = 5,  -- how near the give counts, on a 0..100 barrel
            breaks    = 3,  -- picks you may snap
            time      = 40, -- seconds on the clock
        },

        -- Scanner: pick the trace that matches the target exactly.
        scanner = {
            bars     = 7,  -- readings per signature
            options  = 6,  -- traces in the lineup
            attempts = 2,  -- reads allowed
            time     = 30, -- seconds on the clock
        },

        -- Sequence: watch the pads flash, then play the order back.
        simon = {
            pads   = 4,   -- pads on the board, 3..6
            length = 5,   -- steps in the sequence
            pace   = 520, -- milliseconds per flash
            time   = 45,  -- seconds on the clock
        },

        -- Skill check: stop the dial in the gate on the right key.
        skillcheck = {
            rounds = 3,    -- gates to clear
            period = 1500, -- milliseconds for one turn of the dial
            window = 15,   -- gate width, as a percentage of the dial
            shrink = 82,   -- percentage the gate keeps after each hit
            time   = 25,   -- seconds on the clock
        },

        -- Var hack: pull the named register out of each column.
        varhack = {
            columns  = 4,  -- registers to pull, in order
            rows     = 7,  -- values per column
            mistakes = 2,  -- wrong pulls forgiven
            time     = 30, -- seconds on the clock
        },

        -- Wires: cut the live one. Which it is never leaves the server.
        wires = {
            wires = 5,  -- wires in the loom, 3..7
            clues = 3,  -- clues narrowing it down
            cuts  = 1,  -- wrong cuts before it blows
            time  = 35, -- seconds on the clock
        },

        -- Circuit: flip the switches until every output line reads live.
        circuit = {
            inputs   = 4,  -- switches on the board, 3..6
            outputs  = 3,  -- lines that must all go live
            attempts = 3,  -- arrangements you may try
            time     = 45, -- seconds on the clock
        },

        -- Intrusion: hop toward the core past honeypots only the server knows about.
        intrusion = {
            layers = 4,  -- hops between you and the core
            width  = 3,  -- nodes to choose from at each hop
            traps  = 1,  -- honeypots per layer, always leaving a clean node
            probes = 3,  -- safe tests you may spend
            lives  = 1,  -- honeypots you can survive
            time   = 40, -- seconds on the clock
        },

        -- Router: turn the tiles until the packet crosses the board.
        router = {
            grid = 4,  -- board is grid x grid tiles, 3..6
            time = 45, -- seconds on the clock
        },

        -- Sequencer: put the steps in an order that satisfies every rule.
        sequencer = {
            steps = 5,  -- steps to order, 3..7
            rules = 3,  -- constraints they must satisfy
            time  = 45, -- seconds on the clock
        },

        -- Sweep: probe the grid and flag every live node. The grid stays on the server.
        sweep = {
            grid     = 5,  -- board is grid x grid cells, 4..7
            live     = 4,  -- live nodes hidden in it
            mistakes = 1,  -- live nodes you may probe by accident
            time     = 50, -- seconds on the clock
        },

        -- Decode: read a cipher key, then translate the code written in it.
        decode = {
            symbols = 4,  -- how many glyphs the key holds, 2..8
            digits  = 4,  -- how long the coded message is
            preview = 4,  -- seconds the key stays readable
            time    = 25, -- seconds on the clock
        },

        -- Rewire: find which terminal each wire lands on. The wiring never leaves the server.
        rewire = {
            ports    = 5,  -- terminals down each side, 3..7
            mistakes = 2,  -- wrong connections forgiven
            time     = 30, -- seconds on the clock
        },

        -- Sync: stop the sweeping marker inside the window, which narrows on every hit.
        sync = {
            hits   = 3,    -- windows to catch in a row
            period = 1600, -- milliseconds for one sweep out and back
            window = 18,   -- opening width, as a percentage of the track
            shrink = 74,   -- percentage the window keeps after each hit
            time   = 20,   -- seconds on the clock
        },

        -- Tune: hunt a hidden frequency by signal strength alone. Never sent to the client.
        tune = {
            span      = 100, -- highest reading on the dial
            tolerance = 3,   -- how near counts as locked on
            attempts  = 5,   -- locks allowed
            time      = 30,  -- seconds on the clock
        },

        -- Vent: hold the release to keep the needle inside a drifting band.
        vent = {
            need  = 4,    -- seconds inside the band needed to win
            rise  = 15,   -- gauge points the needle climbs per second
            vent  = 27,   -- gauge points venting sheds per second
            band  = 18,   -- height of the safe band
            drift = 5200, -- milliseconds for the band to swing back and forth
            time  = 20,   -- seconds on the clock
        },

        -- Maze: walk a labyrinth you can only see a few cells of. The map stays on the server.
        maze = {
            width  = 12, -- cells across, 5..30
            height = 14, -- cells down, 5..30
            sight  = 2,  -- how many cells you can see in each direction
            nodes  = 3,  -- keys to collect before the exit unlocks
            time   = 80, -- seconds on the clock
        },

        -- Memory: watch tiles light up, then tap them back. The classic thermite grid.
        memory = {
            grid     = 5,  -- board is grid x grid tiles, 3..6
            targets  = 5,  -- how many tiles light up
            preview  = 3,  -- seconds the pattern stays visible
            time     = 20, -- seconds on the clock, preview included
            mistakes = 2,  -- wrong tiles forgiven before the round is lost
        },

        -- Bypass: crack a keypad code from hot/cold feedback. The code never leaves the server.
        bypass = {
            digits   = 4,     -- length of the code, clamped to 3..6
            attempts = 6,     -- guesses allowed before the round is lost
            time     = 45,    -- seconds on the clock
            repeats  = false, -- whether the same digit may appear twice in the code
        },
    },
}
