-- Garages app - reads the player's owned vehicles from whichever garage system
-- is running and shows them (location, stored/out, fuel/engine/body, etc.).
-- Read-only apart from Valet below, which is the one path that takes a vehicle
-- out of its garage; with Valet.Enabled = false nothing here ever writes.
return {
    Enabled = true,

    -- 'auto' picks the first started resource from the list below. Override
    -- with an exact resource name if auto-detect guesses wrong (e.g. you run
    -- two garage resources side by side). Nearly all supported systems persist
    -- owned vehicles in the framework table (`player_vehicles` on QB/QBox,
    -- `owned_vehicles` on ESX); only the garage-name + state columns differ,
    -- so the bridge resolves those defensively (see bridge profiles).
    System  = 'auto',

    -- Resources checked, in priority order, when System = 'auto'. The first
    -- one that's `started` wins. Add custom/renamed resources here.
    Resources = {
        'qs-advancedgarages', 'jg-advancedgarages', 'qbx_garages', 'qb-garages',
        'cd_garage', 'okokGarage', 'codem-garage', 'lunar_garage', 'nc_garage',
        'op_garages', 'esx_garage',
    },

    -- Default for whether a real photo of each vehicle (matched by spawn name)
    -- shows in the list + detail view, instead of the plain coloured car icon.
    -- When AllowImageToggle is on this is just the starting value each player can
    -- override; when it's off this value is forced for everyone.
    ShowVehicleImages = true,

    -- Let players switch photos <-> icons from a button in the Garages app
    -- header. Each player's choice is remembered on their own device and
    -- survives relogs / restarts. Set false to hide the button and force
    -- ShowVehicleImages for everyone.
    AllowImageToggle = true,

    -- Where the photos come from. `{model}` is replaced with the lowercased
    -- spawn name. Defaults to the official FiveM image set (covers base + DLC
    -- vehicles); point it at your own CDN if you host your own. Any vehicle
    -- without a matching image (e.g. a custom add-on) falls back to the icon.
    VehicleImageUrl = 'https://docs.fivem.net/vehicles/{model}.webp',

    -- Garage waypoint coordinates - used as a FALLBACK. The app first auto-reads
    -- a garage's coords from the running system's own export, so these systems
    -- need NO setup: qs-advancedgarages, qbx_garages, qb-garages,
    -- jg-advancedgarages, cd_garage, op-garages. Only systems without a usable
    -- export (esx, codem, okok, nc, lunar) need entries here, plus any garage a
    -- player built themselves in qs-advancedgarages (those live in
    -- `player_garages`, not the config): key by the exact Location TEXT a
    -- stored OR impounded vehicle shows (open one and copy it - e.g. a garage name, or
    -- 'Impound' to mark the impound lot) and map it to a vec2(x, y). Locations
    -- left out (and vehicles out on the street) simply don't get a button.
    Locations = {
        -- ['Legion Square Garage'] = vec2(215.8, -810.0),
        -- ['Mirror Park Garage']   = vec2(1135.0, -776.0),
        -- ['Impound']              = vec2(409.0, -1623.0),
    },

    -- Mileage is shown ONLY when `jg-vehiclemileage` is running - it's sourced
    -- from that resource's exports (getMileageByPlate) in its own configured
    -- unit. Without it, the mileage row is hidden entirely.

    -- Valet: have a stored vehicle delivered to you from the app. This is the
    -- only feature that takes a car OUT of its garage, so it's off by default.
    -- The vehicle is spawned first and only marked out of the garage once it
    -- exists, so a failed delivery always leaves the car safely stored and
    -- refunds the fee. Impounded vehicles are never eligible (pay the impound),
    -- and neither are boats or aircraft.
    Valet = {
        Enabled = true,

        -- Charged on delivery, refunded if it fails. Account is 'bank' or 'cash'.
        Price   = 100,
        Account = 'bank',

        -- Seconds a player must wait between valets. 0 disables the cooldown.
        Cooldown = 60,

        -- true  - a valet ped drives the car to you from DriveFrom metres away.
        -- false - the car simply appears at the nearest road spot to you.
        Drive     = true,
        Ped       = 'S_M_Y_XMech_01',
        DriveFrom = 75,

        -- Refuse while the player is already in a vehicle.
        BlockInVehicle = true,

        -- Refuse for this many seconds after the player last took damage, so
        -- valet isn't a getaway button mid-chase. 0 disables it. NOTE: this one
        -- is reported by the player's own client and cannot be verified server
        -- side, so treat it as a courtesy guard, not as anti-cheat.
        CombatBlock = 15,

        -- Areas where valet is refused, as { coords, radius, label }. The label
        -- is shown to the player when they're turned down.
        BlockedZones = {
            -- { vec3(1690.0, 2560.0, 45.0), 200.0, 'Bolingbroke' },
            -- { vec3(-1035.0, -2735.0, 20.0), 250.0, 'Airport' },
        },
    },
}
