-- Wi-Fi - local networks that carry data where the cell towers cannot, or will not. Turn Enabled
-- off and the whole system is inert: nothing is scanned, nothing connects, and the phone falls
-- back to cell service alone.
return {
    Enabled = true,

    -- Each network is a router somewhere in the world. `id` is what everything else refers to:
    -- the exports, the app gating, and a player's remembered networks, so renaming one drops
    -- every connection to it. `ssid` is only ever what the player reads on screen.
    --
    -- `password` nil or omitted leaves the network open, which the phone shows without a padlock
    -- and joins in one tap. Anything else is checked SERVER-SIDE, so the answer never travels to
    -- a client that has not earned it.
    --
    -- Unlike cell towers, range here is a true sphere: distance counts height. A router is a box
    -- in a room rather than a mast on a hill, so the floor above should be able to sit outside a
    -- network the floor below is on.
    Networks = {
        -- Open networks: public places that would plausibly hand out free Wi-Fi.
        { id = 'legion',    ssid = 'Legion Square Free',    coords = vec3(  195.0,  -935.0,  30.7), range = 55.0 },
        { id = 'pier',      ssid = 'Del Perro Pier Guest',  coords = vec3(-1850.0, -1240.0,   8.6), range = 65.0 },
        { id = 'lsia',      ssid = 'LSIA Terminal WiFi',    coords = vec3(-1035.0, -2730.0,  20.2), range = 80.0 },
        { id = 'pillbox',   ssid = 'Pillbox Medical',       coords = vec3(  298.0,  -584.0,  43.3), range = 50.0 },

        -- Secured networks: somewhere with a reason to keep people out.
        { id = 'missionrow', ssid = 'LSPD-Secure',          coords = vec3(  441.0,  -982.0,  30.7), range = 45.0, password = 'lspd1234' },
        { id = 'mazebank',   ssid = 'MazeBank-Corporate',   coords = vec3(  -70.0,  -800.0,  44.2), range = 50.0, password = 'maze2024' },
        { id = 'lifeinvader',ssid = 'LifeInvader-Staff',    coords = vec3(-1047.9,  -233.5,  39.0), range = 40.0, password = 'gofuckyourself' },
        { id = 'unicorn',    ssid = 'Unicorn-VIP',          coords = vec3(  127.0, -1298.0,  29.2), range = 35.0, password = 'backstage' },
        { id = 'casino',     ssid = 'Diamond-Guest',        coords = vec3(  925.0,    46.0,  81.1), range = 60.0, password = 'jackpot' },

        -- Out in the sticks, where the towers do not reach. This one is the point of the whole
        -- feature: a dead zone you can still get data in, if you know where to stand.
        { id = 'gordo',      ssid = 'Gordo Ranger Station', coords = vec3( 2900.0,  5800.0,  98.0), range = 70.0, password = 'ranger' },
        { id = 'sandy',      ssid = 'Sandy Medical',        coords = vec3( 1839.0,  3672.0,  34.3), range = 45.0 },
        { id = 'paleto',     ssid = 'Paleto Sheriff',       coords = vec3( -448.0,  6012.0,  31.7), range = 45.0, password = 'paleto' },
    },

    -- What a connection actually carries. Data is the whole point of Wi-Fi, so it is on; calls
    -- and texts ride the cellular network and stay refused in a dead zone unless you switch
    -- Wi-Fi calling on here, which is a real thing phones do.
    Provides = {
        Data = true,
        Call = false,
        Text = false,
    },

    -- Rejoin a network the player has connected to before as soon as they walk back into it,
    -- without asking for the password again. False makes every join deliberate.
    Remember = true,

    -- Seconds between scans while the phone is on screen. Nothing runs while it is holstered.
    ScanSeconds = 2,

    -- Level below which the phone gives up and drops the connection, 0 to 1 across the radius.
    -- A little above zero so a player standing exactly on the edge does not flap in and out.
    DropBelow = 0.05,
}
