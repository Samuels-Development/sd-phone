-- Ryde app settings. The destination list shown in "Where to?" (pickup is
-- always the rider's live position), plus the fare/payout rules.
return {
    -- Saved destinations offered in the Ryde "Where to?" picker. Riders can
    -- also drop a custom pin on the map; these are just the quick-pick shortcuts.
    -- `x`/`y` are GTA world coords (same projection the Maps app uses).
    Locations = {
        { name = 'Legion Square',           sub = 'Downtown Los Santos', x = 195.0,   y = -930.0 },
        { name = 'Los Santos Intl Airport', sub = 'LSIA, Terminal 1',     x = -1037.0, y = -2738.0 },
        { name = 'Del Perro Pier',          sub = 'Del Perro Beach',      x = -1850.0, y = -1240.0 },
        { name = 'Maze Bank Arena',         sub = 'La Puerta',            x = -250.0,  y = -2030.0 },
        { name = 'Vinewood Sign',           sub = 'Vinewood Hills',       x = 720.0,   y = 1200.0 },
        { name = 'Vespucci Beach',          sub = 'Vespucci',             x = -1230.0, y = -1490.0 },
        { name = 'Sandy Shores',            sub = 'Blaine County',        x = 1960.0,  y = 3740.0 },
        { name = 'Paleto Bay',              sub = 'North Blaine County',  x = -160.0,  y = 6360.0 },
        { name = 'Mirror Park',             sub = 'East Los Santos',      x = 1140.0,  y = -645.0 },
        { name = 'Diamond Casino',          sub = 'East Vinewood',        x = 925.0,   y = 46.0 },
    },

    -- Fraction of the agreed fare the driver actually receives on drop-off.
    -- 1.0 = the driver keeps the whole fare; 0.9 would skim a 10% platform cut.
    DriverCut = 0.8,

    -- The agreed fare leaves the rider's bank when the driver starts the trip
    -- and is paid out at drop-off. A rider who cancels or disconnects after the
    -- start pays for the share already driven (the driver gets their cut of it),
    -- so nobody can cancel at the kerb to ride for free. false refunds the rider
    -- in full on any cancel after the start, as older versions did.
    RiderCancelPays = true,

    -- Guard rails on the fare a driver may quote (whole dollars).
    MinFare = 1,
    MaxFare = 100000,

    -- Leaderboard ranking. Drivers are ranked by a confidence-weighted rating, so a
    -- driver with one lucky 5-star can't outrank a high-volume driver with a strong
    -- average. The score is:
    --     (avg_rating * trips + PriorRating * Weight) / (trips + Weight)
    -- Few trips -> the score sits near PriorRating; many trips -> it converges on the
    -- driver's true average. Higher Weight = more trips needed before a driver's own
    -- average outweighs the prior. (Defaults reproduce the original behaviour.)
    LeaderboardPriorRating = 4.5,
    LeaderboardWeight      = 10,
}
