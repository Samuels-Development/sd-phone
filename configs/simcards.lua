-- Unique phones + SIM cards (opt-in). When enabled, characters no longer auto-receive a phone
-- number: numbers live on sim_card items. How the DATA is owned depends on DeviceIdentity below.
--
--   * DeviceIdentity = true  (DEFAULT) - the PHONE owns the data, the SIM only lends a number.
--     Each phone item carries a persistent identity minted on first use, and that identity keys
--     everything (messages, contacts, photos, notes, settings, installed apps, games). Popping
--     a SIM out just drops your number/service: the phone still opens and every non-number app
--     keeps working. Moving a SIM to another phone hands that phone your NUMBER, not your data.
--
--   * DeviceIdentity = false (LEGACY) - the SIM owns the data. Whichever SIM sits in a phone
--     decides WHOSE phone data you see; steal a phone with its SIM and you read the owner's
--     phone. Without a SIM the phone opens to a "No SIM" screen with no service and every
--     server action refused. This is the original unique-phones behaviour, byte-for-byte.
--
-- Either way the number follows the SIM, and the Cloud Backup section in Settings lets a player
-- carry their data to a new phone (the number stays behind on the old SIM).
--
-- Backend support: reading/writing per-slot item metadata is required. Supported out of the box:
--   * ox_inventory              (metadata mode, or the physical SIM-tray container mode below)
--   * qb-inventory / ps / lj    (metadata mode via the QBCore item `info` table)
-- Other inventories (qs / tgiann / codem / origen / jaksam) need a small adapter in
-- server/sim/inv.lua; plain ESX inventory has no item metadata and cannot support this feature.
return {
    -- Master switch. Off = sd-phone behaves exactly as before (numbers auto-assigned per
    -- character, phone always has service).
    Enabled = false,

    -- Where the phone DATA lives (see the header above). true (default) = the phone item owns
    -- its data and a SIM only supplies the number, so a SIM-less phone still opens and works.
    -- false = LEGACY behaviour where the installed SIM's identity IS the data, and a SIM-less
    -- phone is a dead "No SIM" screen. Flipping an existing legacy server to true is safe: on
    -- first use each phone ADOPTS the identity of the SIM currently in it (grandfathering, so no
    -- data is copied or lost), and only from then on does the number float free of the data.
    DeviceIdentity = true,

    -- Inventory item that carries a phone number in its metadata ({ number = '2075550123' }).
    -- Sell or spawn it anywhere like a normal item: a blank card self-activates on first use.
    -- Add the item definition to your inventory (see README - "Unique Phones & SIM Cards").
    SimItem = 'sim_card',

    -- Using a blank sim_card (no number metadata - what shops, loot tables and admin spawns
    -- produce) mints and registers a fresh number on the spot, so selling SIMs needs no script
    -- integration at all. Turn off to refuse blank cards, so only /givesim and the giveSimCard
    -- export (character-bound or hardcoded numbers) produce usable SIMs.
    ActivateBlankSims = true,

    -- ox_inventory only: register every phone item as a 1-slot container ("SIM tray") instead
    -- of writing the number onto the phone item. Players right-click/use the phone to open the
    -- tray and drag the SIM in or out. Trade-off: with containers, USING the phone item opens
    -- the tray (ox intercepts container items client-side), so the phone UI itself only opens
    -- via the keybind. Leave false for the universal metadata mode, where using the phone opens
    -- the phone UI and the SIM is installed by using the sim_card item.
    UseContainers = false,

    -- Metadata mode only: allow ejecting the installed SIM from Settings -> SIM & Backup. The
    -- player gets the sim_card item back (number intact) and the phone loses service. In
    -- container mode ejecting is physical (drag it out of the tray) and this flag is ignored.
    AllowEject = true,

    -- Cloud Backup (Settings -> SIM & Backup). The backup account is the CHARACTER, so a SIM
    -- thief can never restore someone else's backup. Enabling it remembers which phone profile
    -- belongs to the character; restoring on a new SIM copies that profile's data (messages,
    -- contacts, photos, notes, settings, app logins, ...) onto the new SIM's profile. The old
    -- SIM keeps the old number and the data that was on it.
    Backup = {
        Enabled = true,
    },
}
