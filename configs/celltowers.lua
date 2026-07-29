-- Cell towers - degradable cellular service by location. Leave Towers empty and the whole
-- system is inert: every phone always has full service and StatusBar.SignalBars keeps drawing
-- the static bar count, exactly as before.
return {
    -- Each entry is a mast position and the flat radius it covers. Service at a point is the
    -- BEST reading across every tower: 1 - distance / range. So a player 200 units from a
    -- 250-range tower (20%) who is also 750 units from a 1000-range tower (25%) gets 25% - the
    -- further mast wins because it reaches better.
    --
    -- Distance is horizontal only. The Z you put here is ignored by the maths, so you can paste
    -- coordinates straight off an antenna prop without the height eating your coverage, and a
    -- pilot at altitude keeps the same service as the ground below them.
    Towers = {
        -- { tower = vec3(2792.25, 5996.05, 355.19), range = 1000.0 },
        -- { tower = vec3(1858.30, 3694.04,  37.91), range =  750.0 },
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
