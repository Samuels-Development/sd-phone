-- Cell towers - degradable cellular service by location. Turn Enabled off and the whole system
-- is inert: every phone always has full service and StatusBar.SignalBars keeps drawing the
-- static bar count, exactly as before, without you having to delete your tower list.
return {
    -- Master switch. False leaves every phone on full service no matter where its owner stands,
    -- so a server can keep the mast list below intact while the system is parked. An empty
    -- Towers list does the same thing on its own, as does a list where every entry is malformed:
    -- a typo must never leave a whole server without phones.
    Enabled = true,

    -- Each entry is a mast position and the flat radius it covers. Service at a point is the
    -- BEST reading across every tower: 1 - distance / range. So a player 200 units from a
    -- 250-range tower (20%) who is also 750 units from a 1000-range tower (25%) gets 25% - the
    -- further mast wins because it reaches better.
    --
    -- Distance is horizontal only. The Z you put here is ignored by the maths, so you can paste
    -- coordinates straight off an antenna prop without the height eating your coverage, and a
    -- pilot at altitude keeps the same service as the ground below them.
    --
    -- This curated eight-mast network covers the whole map. Every town and populated area holds
    -- a usable signal, the back country thins out, and the far corners genuinely drop to nothing:
    --   full service   Los Santos, LSIA, Vinewood, Chumash, Zancudo, Harmony, Sandy Shores, Paleto
    --   fringe         Vespucci Beach, Grapeseed and Chiliad's summit sit around two bars
    --   texts only     Raton Canyon
    --   no service     Mount Gordo, the eastern desert and open ocean
    Towers = {
        { tower = vec3(  -75.00,  -818.00, 326.00), range = 2200.0 },  -- Downtown Los Santos
        { tower = vec3(-1050.00, -2750.00,  20.00), range = 1800.0 },  -- LSIA and the south docks
        { tower = vec3( -438.00,  1075.00, 352.00), range = 1800.0 },  -- Galileo Observatory, Vinewood Hills
        { tower = vec3(-3050.00,  1250.00,  20.00), range = 1600.0 },  -- Chumash, Great Ocean Highway
        { tower = vec3(-2050.00,  3200.00,  32.00), range = 1700.0 },  -- Fort Zancudo
        { tower = vec3(  280.00,  2900.00,  44.00), range = 1800.0 },  -- Harmony, Route 68
        { tower = vec3( 1858.30,  3694.04,  37.91), range = 1700.0 },  -- Sandy Shores and the Alamo Sea
        { tower = vec3( -180.00,  6350.00,  31.00), range = 1600.0 },  -- Paleto Bay and the north coast
    },

    -- Map blips for the masts. This is a setup and debugging aid rather than something to run on
    -- a live server: drawing the coverage circles is how you see where masts overlap and where
    -- the gaps actually fall, which is hard to judge from coordinates alone. Off by default, and
    -- deliberately independent of the Enabled switch above, so a network can be laid out and
    -- looked at before the system is ever switched on.
    Blips = {
        Enabled = false,

        -- The marker sitting on the mast itself. Sprite and colour are GTA's own ids; the full
        -- lists live at https://docs.fivem.net/docs/game-references/blips/ Markers are drawn
        -- short-range so eight of them do not crowd the minimap; open the pause map to see the
        -- whole network and its circles at once.
        Sprite = 1,
        Color  = 3,
        Scale  = 0.8,
        Label  = 'Cell Tower',

        -- The translucent circle showing what that mast reaches. Its size is always the tower's
        -- own range, never a separate number, so the picture on the map cannot drift out of step
        -- with the service the maths actually gives you. Alpha is 0 to 255.
        Radius = {
            Enabled = true,
            Color   = 3,
            Alpha   = 80,
        },
    },

    -- Minimum level each capability needs. Texts get through on a signal too weak to hold a
    -- call, and data-backed apps need the most - the same order a real phone degrades in.
    Thresholds = {
        Text = 0.05,
        Call = 0.15,
        Data = 0.30,
    },

    -- Ascending cutoffs mapping level to the 0..4 status bar bars. Bar count is how many
    -- cutoffs the level reaches, so anything under the first shows no bars at all. Keep the
    -- first entry equal to Thresholds.Text: a phone that cannot manage a text should not be
    -- claiming a bar.
    Bars = { 0.05, 0.25, 0.50, 0.75 },

    -- App namespaces that keep working on no signal whatsoever. Everything not listed needs
    -- Thresholds.Data, so an app added later is covered by default.
    --
    -- contacts, messages and call are here because reading your phone book and threads is
    -- on-device behaviour: they stay readable in a dead zone and it is the SEND that fails,
    -- refused server-side against Thresholds.Text and Thresholds.Call. Leaving `call` out would
    -- also block hangup and decline, stranding a player whose signal drops mid-call in a session
    -- they cannot end. radio is RF, not cellular. payphone is a landline, and being reachable on
    -- one in a dead zone is the entire point of it. voice carries both the voice memo library
    -- and the peer signalling a live call's audio runs on, so gating it would connect calls that
    -- nobody can hear. cookie is a single-player clicker whose save is the player's own
    -- progress; refusing it would lose their clicks rather than tell them anything useful.
    Offline = {
        'settings', 'phone', 'apps', 'sim', 'admin', 'badges', 'compat',
        'notes', 'documents', 'photos', 'albums', 'music', 'clock', 'voice',
        'contacts', 'call', 'calls', 'messages', 'payphone', 'share', 'airshare',
        'radio', 'cookie',
    },
}
