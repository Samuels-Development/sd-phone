-- Phone battery. Off by default: with this disabled the phone never runs out of charge and
-- every battery export reads as a healthy phone.
--
-- Rates are SECONDS PER ONE PERCENT, given as a { min, max } range that is re-rolled on every
-- step so drain is not metronomic. With the defaults a full charge lasts roughly 1h30 with the
-- phone open and about 2h45 closed, and a full recharge takes about 12 minutes.
--
-- Nothing charges a phone on its own: wire up the affordances below, or drive them yourself
-- with exports['sd-phone']:chargePhone(source, amount) and :toggleCharging(source, true).
return {
    -- Master switch. Off = the phone has no battery at all.
    Enabled = false,

    -- Level a phone that has never been seen before starts at.
    StartLevel = 100,

    DrainSeconds       = { 50, 60 },   -- phone open
    DrainClosedSeconds = { 80, 120 },  -- phone closed
    ChargeSeconds      = { 5, 10 },

    -- Drain at all while the phone is closed?
    DrainWhenClosed = true,

    -- Count time spent disconnected? Charging always accrues while offline regardless, so a
    -- phone left on a charger is full when the player returns.
    DrainWhileOffline = false,

    -- Seconds between safety checkpoints while a phone is live.
    FlushSeconds = 300,

    -- Halves the drain rate. Unlike lb-phone, this never slows charging down.
    LowPowerMode = {
        Enabled      = true,
        Multiplier   = 2,
        PromptAt     = 20,     -- offer it when crossing this level
        AutoEnableAt = false,  -- or a level to switch it on automatically
    },

    -- Levels that raise a warning when crossed downward. Crossing, not equality: setting the
    -- battery from 25 straight to 15 still warns.
    WarnAt = { 20, 10, 5 },

    -- 'dead'      = the phone will not open, calls and notifications are refused
    -- 'noservice' = the phone opens with no service (the No SIM path); offline apps still work
    DeadBehaviour = 'dead',

    -- Let a flat phone still dial the numbers below. Only reachable under DeadBehaviour
    -- 'noservice': under 'dead' the phone will not open at all, so there is no dialler to use.
    AllowEmergencyCalls = true,
    EmergencyNumbers    = { '911' },

    -- Charges on use. Add the item to your inventory before enabling.
    PowerBank = {
        Enabled = true,
        Item    = 'phone_powerbank',
        Charge  = 50,     -- percentage points restored
        Consume = true,   -- false = finite uses tracked in item metadata
        Uses    = 3,      -- only read when Consume = false
        Seconds = 60,     -- 0 = instant, otherwise ramp the charge over this long
    },

    -- A cable item that latches charging on, plus optional ox_target props and radius zones.
    Cable = {
        Enabled = true,
        Item    = 'phone_cable',
        Props   = { 'prop_laptop_01a' },
        Zones   = {},     -- { { coords = { x = 0.0, y = 0.0, z = 0.0 }, radius = 2.0, label = 'Charger' } }
    },

    -- Charge while seated in a vehicle.
    Vehicle = {
        Enabled    = true,
        DriverOnly = false,
        Classes    = false,  -- or a list of vehicle class ids
    },
}
