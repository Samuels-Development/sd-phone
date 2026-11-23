-- Phone cases - a case is designed and bought at a case store in the world, where the player's own
-- phone is shown in 3D and dressed as they choose. A case is a shell in one of seven styles and any
-- of 64 colours, and on top of it a pattern, something stuck on the back, a charm that hangs off the
-- corner and swings, and a sticker (an icon, a brand, or one of the player's own gallery photos),
-- each optional. Other players see it on the prop. The models come from sd-phone-props (sd_case_*);
-- with that resource missing or outdated the stores still sell cases, there is just nothing to see.
--
-- A bought case is an inventory item: use it and it is fitted to the phone you are using (the one
-- you last took out). It then belongs to that phone: it is kept on the phone's own item, so it
-- shows on that phone only, each phone can have its own, and it goes with the phone when the phone
-- is given, sold or stolen. Fitting another hands the old one back, and so does taking it off (the
-- phone's Settings, Phone Case). A loose case can be given, traded or sold like anything else.

return {
    Enabled  = true,    -- false: no stores, no case item, and nobody's case is drawn
    Account  = 'bank',  -- what a case is paid from. Only 'bank' is supported.

    -- The item a case is. It needs to exist in your inventory (see the README: one item, not
    -- stackable, usable) and the inventory has to keep data on single items, because the design is
    -- stored on the item itself. ox_inventory, qb-inventory, qs-inventory and the others sd-phone
    -- reads SIM cards from all do.
    --   * AsItems = false, or an inventory that cannot keep data on an item: there is no item.
    --     A bought case goes on a list the character keeps (MaxOwned of them) and is swapped at any
    --     case store under "Your cases".
    Item     = 'phone_case',
    AsItems  = true,

    -- The chat command that lists a player's phones and lets them fit a case from their pockets to
    -- one, or take one off. It exists for inventories that have no buttons on their items. With
    -- ox_inventory the same actions are buttons on the phone and case items (see the README), so the
    -- command is left out there unless CommandAlways is true. false: no command at all.
    Command       = 'phonecase',
    CommandAlways = false,
    MaxOwned = 12,      -- only without items: designs a character can keep

    -- Where cases are sold: by default outside two of the Digital Den electronics shops, whose own
    -- interiors cannot be entered. Each store is a clerk to talk to (with a target resource) or a spot to
    -- stand on and press E (without one), and a blip on the map.
    --   coords  where the clerk stands, and which way they face (the 4th number)
    --   ped     the clerk's model; false for no clerk, just the spot
    --   blip    false to leave this store off the map
    Stores = {
        { name = 'Digital Den Little Seoul', coords = vec4(-658.85, -854.77, 24.51, 358.96), ped = 'a_m_y_hipster_02' },   -- Vespucci Boulevard and Palomino Avenue, outside the shop
        { name = 'Digital Den Mirror Park',  coords = vec4(1137.70, -470.50, 66.64, 255.0), ped = 'a_f_y_hipster_02' },   -- Mirror Park Boulevard, at the shop door
    },
    Blip = { sprite = 459, colour = 47, scale = 0.7, label = 'Phone Cases' },   -- false for no blips at all
    Radius = 8.0,       -- metres from a store's clerk within which a case can be bought

    -- The phone on show stands in a studio (sd_case_studio in sd-phone-props): a dark room with a
    -- curved screen wall behind the phone that moves in the colour of the case being designed, far
    -- from the store, where no weather or daylight reaches. false, or an sd-phone-props without the
    -- studio, shows the phone in front of whatever is behind the clerk instead.
    Studio = true,

    -- What each part costs. A case's price is its style plus every extra it carries; colours are
    -- free. Give Pattern, Accessory, Charm or Sticker one number for all of them, or a table by
    -- name with `default` for the rest: Pattern = { default = 120, carbon = 250 }.
    Prices = {
        Style = {
            slim    = 150,   -- a thin satin shell
            gloss   = 200,   -- the same shell, polished
            fabric  = 300,   -- woven cloth
            leather = 450,   -- pebbled leather
            wallet  = 600,   -- leather with a card pocket (no accessory or sticker on it)
            rugged  = 500,   -- a thick rubber bumper case
            bumper  = 350,   -- a metal frame only: the back of the phone stays bare
        },
        Pattern   = 120,
        Accessory = { default = 90, ring = 110 },
        Charm     = { default = 75, lanyard = 60, pearls = 140, beads = 90 },
        Sticker   = 25,
        Photo     = 150,    -- a sticker made from one of the player's own gallery photos
    },

    -- Frame colours that already come in a case and so cannot take another. The props for these
    -- are the phone inside a leather case; putting a second one over it would fight for space.
    NoCase = { 'leather_brown', 'leather_black', 'leather_tan' },
}
