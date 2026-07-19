-- Unique phones + SIM cards (opt-in). When enabled, characters no longer auto-receive a phone
-- number: numbers live on sim_card items, and whichever SIM sits in your phone decides WHOSE
-- phone data you see (messages, call log, contacts, photos, settings - everything). Steal a
-- phone with its SIM and you read the owner's phone from their perspective; the number follows
-- the SIM, and the Cloud Backup section in Settings lets a player carry their data to a new
-- phone + SIM (the number stays behind on the old SIM).
--
-- Without a SIM the phone still opens but shows a "No SIM" screen and every server action is
-- refused - no number, no service, no browsing.
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

    -- Inventory item that carries a phone number in its metadata ({ number = '2075550123' }).
    -- Create SIMs with the export or the /givesim admin command; add the item definition to
    -- your inventory (see README - "Unique Phones & SIM Cards").
    SimItem = 'sim_card',

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
