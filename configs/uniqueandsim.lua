-- Phones, numbers and who owns what. Pick your setup:
--
--   Stock phone (shared data, automatic numbers)        -> Enabled = false
--   Unique phones, SIM cards carry the number (default) -> Enabled = true, DataOwner = 'device'
--   Unique phones, no SIM items (built-in numbers)      -> Enabled = true, DataOwner = 'device', BuiltInNumbers = true
--   Stock data, SIMs only change your number            -> Enabled = true, DataOwner = 'character'
--   The SIM IS the phone (original unique phones)       -> Enabled = true, DataOwner = 'sim'
--
-- When enabled, numbers come from sim_card items - or, with BuiltInNumbers, from the phone
-- itself (no SIM items at all). Who owns the DATA is DataOwner:
--
--   * DataOwner = 'device' (DEFAULT) - the PHONE owns the data, the SIM only lends a number.
--     Each phone item carries a persistent identity minted on first use, and that identity keys
--     everything (messages, contacts, photos, notes, settings, installed apps, games). Popping
--     a SIM out just drops your number/service: the phone still opens and every non-number app
--     keeps working. Moving a SIM to another phone hands that phone your NUMBER, not your data.
--
--   * DataOwner = 'sim' (LEGACY) - the SIM owns the data. Whichever SIM sits in a phone
--     decides WHOSE phone data you see; steal a phone with its SIM and you read the owner's
--     phone. Without a SIM the phone opens to a "No SIM" screen with no service and every
--     server action refused. This is the original unique-phones behaviour, byte-for-byte.
--
--   * DataOwner = 'character' - the STOCK data model with SIM numbers on top. Every phone
--     opens the holder's own character profile (a stolen phone shows the thief's data, never
--     the owner's), and without a SIM the character keeps a vanilla auto-assigned number with
--     full service. Installing a SIM changes ONLY the number; ejecting falls back to a fresh
--     auto number. Enabling this on an existing stock server keeps everyone's data untouched.
--
-- With 'device'/'sim' the number follows the SIM, and the Cloud Backup section in Settings
-- lets a player carry their data to a new phone (the number stays behind on the old SIM).
-- The last-opened phone is persisted in phone_player_equipment so it survives reconnects
-- and restarts.
--
-- Backend support: reading/writing per-slot item metadata is required. Supported out of the box:
--   * ox_inventory              (metadata mode, or the physical SIM-tray stash mode below)
--   * qb-inventory / ps / lj    (metadata mode via the QBCore item `info` table)
-- Other inventories (qs / tgiann / codem / origen / jaksam) need a small adapter in
-- server/sim/inv.lua; plain ESX inventory has no item metadata and cannot support this feature.
return {
    -- Master switch. Off = sd-phone behaves exactly as before (numbers auto-assigned per
    -- character, phone always has service).
    Enabled = false,

    -- Where the phone DATA lives: 'device' | 'sim' | 'character' (see the header above).
    -- Flipping an existing 'sim' server to 'device' is safe: on first use each phone ADOPTS the
    -- identity of the SIM currently in it (grandfathering, no data copied or lost), and only
    -- from then on does the number float free of the data. (The pre-DataOwner boolean
    -- `DeviceIdentity` is still honoured when this key is absent.)
    DataOwner = 'device',

    -- Unique phones WITHOUT SIM cards ("eSIM"): every phone mints its own permanent number the
    -- first time it is used - no sim_card item, no install/eject, the number lives and dies
    -- with the phone. Pairs with DataOwner 'device' or 'character' ('sim' has no SIM identity
    -- to own data and coerces to 'device'); forces the metadata attach mode. SimItem,
    -- UseContainers, AllowEject, ActivateBlankSims and /givesim become inert.
    BuiltInNumbers = false,

    -- Inventory item that carries a phone number in its metadata ({ number = '2075550123' }).
    -- Sell or spawn it anywhere like a normal item: a blank card self-activates on first use.
    -- Add the item definition to your inventory (see README - "Unique Phones & SIM Cards").
    SimItem = 'sim_card',

    -- Using a blank sim_card (no number metadata - what shops, loot tables and admin spawns
    -- produce) mints and registers a fresh number on the spot, so selling SIMs needs no script
    -- integration at all. Turn off to refuse blank cards, so only /givesim and the giveSimCard
    -- export (character-bound or hardcoded numbers) produce usable SIMs.
    ActivateBlankSims = true,

    -- ox_inventory only: each phone gets a 1-slot SIM-tray stash (sd_phone_sim_<deviceId>)
    -- instead of writing the number onto the phone item. USING the phone opens the phone UI;
    -- the inventory "SIM Tray" button opens the stash. ox cannot toggle buttons at runtime —
    -- use the matching item def from docs/ox_inventory_items.lua (SECTION A with button
    -- when true, SECTION B without when false). Leave false for metadata mode (use sim_card).
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

        -- How many phones one character can back up at once (each holds a full cloud snapshot).
        -- Enabling backup on another phone past the cap asks the player to delete one first.
        MaxProfiles = 3,
    },
}
