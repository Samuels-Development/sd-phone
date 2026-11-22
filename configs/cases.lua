-- Cases app - phone cases a player designs, buys and wears on the phone in their hand. A case is
-- a shell in one of seven styles and any of 64 colours, and on top of it a pattern, something stuck
-- on the back, a charm that hangs off the corner and swings, and a sticker (an icon, a brand, or one
-- of the player's own gallery photos), each optional. Other players see it on the prop. The models
-- come from sd-phone-props (sd_case_*); with that resource missing or outdated the app still sells
-- cases, there is just nothing to see.
--
-- The app itself is switched on or off in configs/apps.lua (id 'cases').

return {
    Account  = 'bank',  -- what a case is paid from. Only 'bank' is supported.
    MaxOwned = 12,      -- designs a character can keep; buying another needs one deleted first

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
