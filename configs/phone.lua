-- Phone open / close behaviour.
return {
    -- Inventory items that open the phone when used. Each entry maps an item
    -- name to a frame colour; that colour drives both the on-screen rail and
    -- the prop model held in hand (PropPrefix .. colour). Every colour here has
    -- a model in sd-phone-props; drop the ones your server does not sell. Add a
    -- variant by shipping the matching `sd_phone_<colour>` prop, listing it here
    -- and adding its hex to web/src/shell/frameColors.ts.
    -- Order matters: the keybind opens the first owned variant when the
    -- last-used one isn't held. Every way of opening the phone (keybind, item,
    -- exports, compat commands) requires one of these items, so {} means
    -- nobody can open the phone.
    Items = {
        { item = 'phone_black',         color = 'black'         },
        { item = 'phone_blue',          color = 'blue'          },
        { item = 'phone_green',         color = 'green'         },
        { item = 'phone_orange',        color = 'orange'        },
        { item = 'phone_pink',          color = 'pink'          },
        { item = 'phone_purple',        color = 'purple'        },
        { item = 'phone_red',           color = 'red'           },
        { item = 'phone_yellow',        color = 'yellow'        },
        { item = 'phone_white',         color = 'white'         },
        { item = 'phone_silver',        color = 'silver'        },
        { item = 'phone_graphite',      color = 'graphite'      },
        { item = 'phone_titanium',      color = 'titanium'      },
        { item = 'phone_gold',          color = 'gold'          },
        { item = 'phone_rosegold',      color = 'rosegold',      label = 'Rose Gold Phone' },
        { item = 'phone_bronze',        color = 'bronze'        },
        { item = 'phone_mocha',         color = 'mocha'         },
        { item = 'phone_cream',         color = 'cream'         },
        { item = 'phone_burgundy',      color = 'burgundy'      },
        { item = 'phone_coral',         color = 'coral'         },
        { item = 'phone_peach',         color = 'peach'         },
        { item = 'phone_lime',          color = 'lime'          },
        { item = 'phone_mint',          color = 'mint'          },
        { item = 'phone_sage',          color = 'sage'          },
        { item = 'phone_forest',        color = 'forest'        },
        { item = 'phone_teal',          color = 'teal'          },
        { item = 'phone_cyan',          color = 'cyan'          },
        { item = 'phone_skyblue',       color = 'skyblue',       label = 'Sky Blue Phone' },
        { item = 'phone_navy',          color = 'navy'          },
        { item = 'phone_indigo',        color = 'indigo'        },
        { item = 'phone_lavender',      color = 'lavender'      },
        { item = 'phone_magenta',       color = 'magenta'       },
        { item = 'phone_rose',          color = 'rose'          },
        { item = 'phone_jetblack',      color = 'jetblack',      label = 'Jet Black Phone' },
        { item = 'phone_pearl',         color = 'pearl'         },
        { item = 'phone_ruby',          color = 'ruby'          },
        { item = 'phone_sapphire',      color = 'sapphire'      },
        { item = 'phone_blackgold',     color = 'blackgold',     label = 'Black & Gold Phone' },
        { item = 'phone_whitegold',     color = 'whitegold',     label = 'White & Gold Phone' },
        { item = 'phone_leather_brown', color = 'leather_brown', label = 'Brown Leather Phone' },
        { item = 'phone_leather_black', color = 'leather_black', label = 'Black Leather Phone' },
        { item = 'phone_leather_tan',   color = 'leather_tan',   label = 'Tan Leather Phone' },

        -- The same colours as foldable phones. A foldable has a hinge and unfolds to twice the width
        -- (see Foldable below); a regular phone, every entry above, does not. Which kind a phone is
        -- is said here, on its item, so a server sells both side by side. Drop these to sell only
        -- regular phones, or drop the ones above to sell only foldables. A list where no entry says
        -- `fold` at all is read the old way: every phone folds.
        { item = 'phone_fold_black',         color = 'black',         fold = true, label = 'Foldable Black Phone' },
        { item = 'phone_fold_blue',          color = 'blue',          fold = true, label = 'Foldable Blue Phone' },
        { item = 'phone_fold_green',         color = 'green',         fold = true, label = 'Foldable Green Phone' },
        { item = 'phone_fold_orange',        color = 'orange',        fold = true, label = 'Foldable Orange Phone' },
        { item = 'phone_fold_pink',          color = 'pink',          fold = true, label = 'Foldable Pink Phone' },
        { item = 'phone_fold_purple',        color = 'purple',        fold = true, label = 'Foldable Purple Phone' },
        { item = 'phone_fold_red',           color = 'red',           fold = true, label = 'Foldable Red Phone' },
        { item = 'phone_fold_yellow',        color = 'yellow',        fold = true, label = 'Foldable Yellow Phone' },
        { item = 'phone_fold_white',         color = 'white',         fold = true, label = 'Foldable White Phone' },
        { item = 'phone_fold_silver',        color = 'silver',        fold = true, label = 'Foldable Silver Phone' },
        { item = 'phone_fold_graphite',      color = 'graphite',      fold = true, label = 'Foldable Graphite Phone' },
        { item = 'phone_fold_titanium',      color = 'titanium',      fold = true, label = 'Foldable Titanium Phone' },
        { item = 'phone_fold_gold',          color = 'gold',          fold = true, label = 'Foldable Gold Phone' },
        { item = 'phone_fold_rosegold',      color = 'rosegold',      fold = true, label = 'Foldable Rose Gold Phone' },
        { item = 'phone_fold_bronze',        color = 'bronze',        fold = true, label = 'Foldable Bronze Phone' },
        { item = 'phone_fold_mocha',         color = 'mocha',         fold = true, label = 'Foldable Mocha Phone' },
        { item = 'phone_fold_cream',         color = 'cream',         fold = true, label = 'Foldable Cream Phone' },
        { item = 'phone_fold_burgundy',      color = 'burgundy',      fold = true, label = 'Foldable Burgundy Phone' },
        { item = 'phone_fold_coral',         color = 'coral',         fold = true, label = 'Foldable Coral Phone' },
        { item = 'phone_fold_peach',         color = 'peach',         fold = true, label = 'Foldable Peach Phone' },
        { item = 'phone_fold_lime',          color = 'lime',          fold = true, label = 'Foldable Lime Phone' },
        { item = 'phone_fold_mint',          color = 'mint',          fold = true, label = 'Foldable Mint Phone' },
        { item = 'phone_fold_sage',          color = 'sage',          fold = true, label = 'Foldable Sage Phone' },
        { item = 'phone_fold_forest',        color = 'forest',        fold = true, label = 'Foldable Forest Phone' },
        { item = 'phone_fold_teal',          color = 'teal',          fold = true, label = 'Foldable Teal Phone' },
        { item = 'phone_fold_cyan',          color = 'cyan',          fold = true, label = 'Foldable Cyan Phone' },
        { item = 'phone_fold_skyblue',       color = 'skyblue',       fold = true, label = 'Foldable Sky Blue Phone' },
        { item = 'phone_fold_navy',          color = 'navy',          fold = true, label = 'Foldable Navy Phone' },
        { item = 'phone_fold_indigo',        color = 'indigo',        fold = true, label = 'Foldable Indigo Phone' },
        { item = 'phone_fold_lavender',      color = 'lavender',      fold = true, label = 'Foldable Lavender Phone' },
        { item = 'phone_fold_magenta',       color = 'magenta',       fold = true, label = 'Foldable Magenta Phone' },
        { item = 'phone_fold_rose',          color = 'rose',          fold = true, label = 'Foldable Rose Phone' },
        { item = 'phone_fold_jetblack',      color = 'jetblack',      fold = true, label = 'Foldable Jet Black Phone' },
        { item = 'phone_fold_pearl',         color = 'pearl',         fold = true, label = 'Foldable Pearl Phone' },
        { item = 'phone_fold_ruby',          color = 'ruby',          fold = true, label = 'Foldable Ruby Phone' },
        { item = 'phone_fold_sapphire',      color = 'sapphire',      fold = true, label = 'Foldable Sapphire Phone' },
        { item = 'phone_fold_blackgold',     color = 'blackgold',     fold = true, label = 'Foldable Black & Gold Phone' },
        { item = 'phone_fold_whitegold',     color = 'whitegold',     fold = true, label = 'Foldable White & Gold Phone' },
        { item = 'phone_fold_leather_brown', color = 'leather_brown', fold = true, label = 'Foldable Brown Leather Phone' },
        { item = 'phone_fold_leather_black', color = 'leather_black', fold = true, label = 'Foldable Black Leather Phone' },
        { item = 'phone_fold_leather_tan',   color = 'leather_tan',   fold = true, label = 'Foldable Tan Leather Phone' },

        -- The same colours again as Slate phones, the second design sd-phone-props streams: rounded
        -- polished rails, three lenses straight off the back glass, a punch-hole camera. Which design
        -- a phone is is said here too (`look = 'slate'`; saying nothing is the classic design), so the
        -- four kinds - classic, classic foldable, Slate, Slate foldable - are four items a server
        -- sells side by side. Drop the kinds you do not sell.
        { item = 'phone_slate_black',              color = 'black',         look = 'slate', label = 'Black Slate Phone' },
        { item = 'phone_slate_blue',               color = 'blue',          look = 'slate', label = 'Blue Slate Phone' },
        { item = 'phone_slate_green',              color = 'green',         look = 'slate', label = 'Green Slate Phone' },
        { item = 'phone_slate_orange',             color = 'orange',        look = 'slate', label = 'Orange Slate Phone' },
        { item = 'phone_slate_pink',               color = 'pink',          look = 'slate', label = 'Pink Slate Phone' },
        { item = 'phone_slate_purple',             color = 'purple',        look = 'slate', label = 'Purple Slate Phone' },
        { item = 'phone_slate_red',                color = 'red',           look = 'slate', label = 'Red Slate Phone' },
        { item = 'phone_slate_yellow',             color = 'yellow',        look = 'slate', label = 'Yellow Slate Phone' },
        { item = 'phone_slate_white',              color = 'white',         look = 'slate', label = 'White Slate Phone' },
        { item = 'phone_slate_silver',             color = 'silver',        look = 'slate', label = 'Silver Slate Phone' },
        { item = 'phone_slate_graphite',           color = 'graphite',      look = 'slate', label = 'Graphite Slate Phone' },
        { item = 'phone_slate_titanium',           color = 'titanium',      look = 'slate', label = 'Titanium Slate Phone' },
        { item = 'phone_slate_gold',               color = 'gold',          look = 'slate', label = 'Gold Slate Phone' },
        { item = 'phone_slate_rosegold',           color = 'rosegold',      look = 'slate', label = 'Rose Gold Slate Phone' },
        { item = 'phone_slate_bronze',             color = 'bronze',        look = 'slate', label = 'Bronze Slate Phone' },
        { item = 'phone_slate_mocha',              color = 'mocha',         look = 'slate', label = 'Mocha Slate Phone' },
        { item = 'phone_slate_cream',              color = 'cream',         look = 'slate', label = 'Cream Slate Phone' },
        { item = 'phone_slate_burgundy',           color = 'burgundy',      look = 'slate', label = 'Burgundy Slate Phone' },
        { item = 'phone_slate_coral',              color = 'coral',         look = 'slate', label = 'Coral Slate Phone' },
        { item = 'phone_slate_peach',              color = 'peach',         look = 'slate', label = 'Peach Slate Phone' },
        { item = 'phone_slate_lime',               color = 'lime',          look = 'slate', label = 'Lime Slate Phone' },
        { item = 'phone_slate_mint',               color = 'mint',          look = 'slate', label = 'Mint Slate Phone' },
        { item = 'phone_slate_sage',               color = 'sage',          look = 'slate', label = 'Sage Slate Phone' },
        { item = 'phone_slate_forest',             color = 'forest',        look = 'slate', label = 'Forest Slate Phone' },
        { item = 'phone_slate_teal',               color = 'teal',          look = 'slate', label = 'Teal Slate Phone' },
        { item = 'phone_slate_cyan',               color = 'cyan',          look = 'slate', label = 'Cyan Slate Phone' },
        { item = 'phone_slate_skyblue',            color = 'skyblue',       look = 'slate', label = 'Sky Blue Slate Phone' },
        { item = 'phone_slate_navy',               color = 'navy',          look = 'slate', label = 'Navy Slate Phone' },
        { item = 'phone_slate_indigo',             color = 'indigo',        look = 'slate', label = 'Indigo Slate Phone' },
        { item = 'phone_slate_lavender',           color = 'lavender',      look = 'slate', label = 'Lavender Slate Phone' },
        { item = 'phone_slate_magenta',            color = 'magenta',       look = 'slate', label = 'Magenta Slate Phone' },
        { item = 'phone_slate_rose',               color = 'rose',          look = 'slate', label = 'Rose Slate Phone' },
        { item = 'phone_slate_jetblack',           color = 'jetblack',      look = 'slate', label = 'Jet Black Slate Phone' },
        { item = 'phone_slate_pearl',              color = 'pearl',         look = 'slate', label = 'Pearl Slate Phone' },
        { item = 'phone_slate_ruby',               color = 'ruby',          look = 'slate', label = 'Ruby Slate Phone' },
        { item = 'phone_slate_sapphire',           color = 'sapphire',      look = 'slate', label = 'Sapphire Slate Phone' },
        { item = 'phone_slate_blackgold',          color = 'blackgold',     look = 'slate', label = 'Black & Gold Slate Phone' },
        { item = 'phone_slate_whitegold',          color = 'whitegold',     look = 'slate', label = 'White & Gold Slate Phone' },
        { item = 'phone_slate_leather_brown',      color = 'leather_brown', look = 'slate', label = 'Brown Leather Slate Phone' },
        { item = 'phone_slate_leather_black',      color = 'leather_black', look = 'slate', label = 'Black Leather Slate Phone' },
        { item = 'phone_slate_leather_tan',        color = 'leather_tan',   look = 'slate', label = 'Tan Leather Slate Phone' },

        { item = 'phone_slate_fold_black',         color = 'black',         look = 'slate', fold = true, label = 'Foldable Black Slate Phone' },
        { item = 'phone_slate_fold_blue',          color = 'blue',          look = 'slate', fold = true, label = 'Foldable Blue Slate Phone' },
        { item = 'phone_slate_fold_green',         color = 'green',         look = 'slate', fold = true, label = 'Foldable Green Slate Phone' },
        { item = 'phone_slate_fold_orange',        color = 'orange',        look = 'slate', fold = true, label = 'Foldable Orange Slate Phone' },
        { item = 'phone_slate_fold_pink',          color = 'pink',          look = 'slate', fold = true, label = 'Foldable Pink Slate Phone' },
        { item = 'phone_slate_fold_purple',        color = 'purple',        look = 'slate', fold = true, label = 'Foldable Purple Slate Phone' },
        { item = 'phone_slate_fold_red',           color = 'red',           look = 'slate', fold = true, label = 'Foldable Red Slate Phone' },
        { item = 'phone_slate_fold_yellow',        color = 'yellow',        look = 'slate', fold = true, label = 'Foldable Yellow Slate Phone' },
        { item = 'phone_slate_fold_white',         color = 'white',         look = 'slate', fold = true, label = 'Foldable White Slate Phone' },
        { item = 'phone_slate_fold_silver',        color = 'silver',        look = 'slate', fold = true, label = 'Foldable Silver Slate Phone' },
        { item = 'phone_slate_fold_graphite',      color = 'graphite',      look = 'slate', fold = true, label = 'Foldable Graphite Slate Phone' },
        { item = 'phone_slate_fold_titanium',      color = 'titanium',      look = 'slate', fold = true, label = 'Foldable Titanium Slate Phone' },
        { item = 'phone_slate_fold_gold',          color = 'gold',          look = 'slate', fold = true, label = 'Foldable Gold Slate Phone' },
        { item = 'phone_slate_fold_rosegold',      color = 'rosegold',      look = 'slate', fold = true, label = 'Foldable Rose Gold Slate Phone' },
        { item = 'phone_slate_fold_bronze',        color = 'bronze',        look = 'slate', fold = true, label = 'Foldable Bronze Slate Phone' },
        { item = 'phone_slate_fold_mocha',         color = 'mocha',         look = 'slate', fold = true, label = 'Foldable Mocha Slate Phone' },
        { item = 'phone_slate_fold_cream',         color = 'cream',         look = 'slate', fold = true, label = 'Foldable Cream Slate Phone' },
        { item = 'phone_slate_fold_burgundy',      color = 'burgundy',      look = 'slate', fold = true, label = 'Foldable Burgundy Slate Phone' },
        { item = 'phone_slate_fold_coral',         color = 'coral',         look = 'slate', fold = true, label = 'Foldable Coral Slate Phone' },
        { item = 'phone_slate_fold_peach',         color = 'peach',         look = 'slate', fold = true, label = 'Foldable Peach Slate Phone' },
        { item = 'phone_slate_fold_lime',          color = 'lime',          look = 'slate', fold = true, label = 'Foldable Lime Slate Phone' },
        { item = 'phone_slate_fold_mint',          color = 'mint',          look = 'slate', fold = true, label = 'Foldable Mint Slate Phone' },
        { item = 'phone_slate_fold_sage',          color = 'sage',          look = 'slate', fold = true, label = 'Foldable Sage Slate Phone' },
        { item = 'phone_slate_fold_forest',        color = 'forest',        look = 'slate', fold = true, label = 'Foldable Forest Slate Phone' },
        { item = 'phone_slate_fold_teal',          color = 'teal',          look = 'slate', fold = true, label = 'Foldable Teal Slate Phone' },
        { item = 'phone_slate_fold_cyan',          color = 'cyan',          look = 'slate', fold = true, label = 'Foldable Cyan Slate Phone' },
        { item = 'phone_slate_fold_skyblue',       color = 'skyblue',       look = 'slate', fold = true, label = 'Foldable Sky Blue Slate Phone' },
        { item = 'phone_slate_fold_navy',          color = 'navy',          look = 'slate', fold = true, label = 'Foldable Navy Slate Phone' },
        { item = 'phone_slate_fold_indigo',        color = 'indigo',        look = 'slate', fold = true, label = 'Foldable Indigo Slate Phone' },
        { item = 'phone_slate_fold_lavender',      color = 'lavender',      look = 'slate', fold = true, label = 'Foldable Lavender Slate Phone' },
        { item = 'phone_slate_fold_magenta',       color = 'magenta',       look = 'slate', fold = true, label = 'Foldable Magenta Slate Phone' },
        { item = 'phone_slate_fold_rose',          color = 'rose',          look = 'slate', fold = true, label = 'Foldable Rose Slate Phone' },
        { item = 'phone_slate_fold_jetblack',      color = 'jetblack',      look = 'slate', fold = true, label = 'Foldable Jet Black Slate Phone' },
        { item = 'phone_slate_fold_pearl',         color = 'pearl',         look = 'slate', fold = true, label = 'Foldable Pearl Slate Phone' },
        { item = 'phone_slate_fold_ruby',          color = 'ruby',          look = 'slate', fold = true, label = 'Foldable Ruby Slate Phone' },
        { item = 'phone_slate_fold_sapphire',      color = 'sapphire',      look = 'slate', fold = true, label = 'Foldable Sapphire Slate Phone' },
        { item = 'phone_slate_fold_blackgold',     color = 'blackgold',     look = 'slate', fold = true, label = 'Foldable Black & Gold Slate Phone' },
        { item = 'phone_slate_fold_whitegold',     color = 'whitegold',     look = 'slate', fold = true, label = 'Foldable White & Gold Slate Phone' },
        { item = 'phone_slate_fold_leather_brown', color = 'leather_brown', look = 'slate', fold = true, label = 'Foldable Brown Leather Slate Phone' },
        { item = 'phone_slate_fold_leather_black', color = 'leather_black', look = 'slate', fold = true, label = 'Foldable Black Leather Slate Phone' },
        { item = 'phone_slate_fold_leather_tan',   color = 'leather_tan',   look = 'slate', fold = true, label = 'Foldable Tan Leather Slate Phone' },
    },

    -- ESX only. ESX keeps its item catalogue in the `items` database table and
    -- nowhere else: an item missing from it can never be given or used, which
    -- is why a stock ESX install had the phone registered, givable in theory
    -- and impossible to open in practice. On boot, sd-phone adds any of the
    -- items above that the table doesn't already have, then refreshes ESX's
    -- in-memory catalogue so they work without a restart.
    --
    -- Runs only on ESX AND only when no dedicated inventory resource
    -- (ox_inventory, qs, tgiann, codem...) is started - those own their own
    -- item lists, where you add the items yourself. Nothing is ever
    -- overwritten: existing rows are left exactly as they are. Set false to
    -- manage the rows yourself (sql/esx_items.sql has them ready to import).
    SeedEsxItems = true,

    -- Each Items entry may also carry `label` and `weight`, used only by the
    -- seeder above when it creates a row. Both default sensibly (the label
    -- from the colour, the weight to ESX's own default of 1), so set them only
    -- to override:
    --   { item = 'phone_black', color = 'black', label = 'iFruit', weight = 2 },

    -- Frame colour the phone opens with before any item has been used this
    -- session (the keybind fallback). Must be one of the frame colours.
    DefaultColor = 'black',

    -- Phone numbers: how long a new one is, and how numbers are displayed.
    -- Numbers are always STORED as bare digits, so this changes presentation and
    -- generation only - no database column, contact, message or call log is
    -- rewritten, and every lookup keeps matching on digits.
    Number = {
        -- Digits in a NEWLY generated number. Changing it leaves every existing
        -- number exactly as it is, so a running server ends up with a mix of
        -- lengths, and both keep working everywhere.
        Length = 10,

        -- Area code for new numbers, blank by default. It is part of Length
        -- rather than added to it: '555' with Length 10 gives 555 plus 7 random
        -- digits, so 5551234567. Formats below are unaffected.
        --
        -- It cannot start with 0 or 1 and must leave 4 digits random; break
        -- either rule and it is ignored, with the reason printed on boot.
        Prefix = '',

        -- How a number is displayed, keyed by how many digits it has. Each X is
        -- replaced by the next digit and every other character is printed
        -- literally, so '+44 XXXX XXXXXX', 'XXX-XXXX' and '(XXX) XXX-XXXX' all
        -- work. A digit count with no entry is shown as bare digits.
        --
        -- The table is keyed by length precisely so a Length change is safe:
        -- add an entry for the new length and KEEP the old one, and numbers
        -- already in circulation still read properly next to the new ones.
        Formats = {
            [10] = '(XXX) XXX-XXXX',

            -- An 11-digit entry sits alongside it quite happily, which is what
            -- keeps numbers readable either side of a Length change. This one
            -- renders 12075550123 as +1 (207) 555-0123.
            -- [11] = '+X (XXX) XXX-XXXX',
        },

        -- Custom numbers handed out by hand: phoneadmin's "Change phone number"
        -- and the setSimNumber export (the hook for a paid "vanity number"
        -- script). Those normally accept only Length and the Formats lengths
        -- above, which catches an admin typo. This range accepts every digit
        -- count inside it as well, so a premium player can be given a 2 or 3
        -- digit number while everyone else keeps getting Length digits.
        --
        -- Generated numbers never use it. It must sit inside 2 to 15, a custom
        -- number cannot start with 0, and a company or emergency line (911) is
        -- refused because the dialler resolves those ahead of player numbers.
        -- Set it to nil to accept only the lengths above.
        Custom = { MinLength = 2, MaxLength = 3 },
    },

    -- Default keybind to open / close the phone. Players can rebind
    -- via FiveM's keybinding menu (Settings → Key Bindings → FiveM).
    Keybind  = 'F1',

    -- Hide the phone while the player is dead, swimming, in water,
    -- or carrying a two-handed weapon. The phone is still openable
    -- otherwise - these are just safety blocks against use-on-floor
    -- exploits.
    BlockWhileDead     = true,
    BlockWhileSwimming = true,

    -- Take the phone away while the player is restrained or incapacitated. These read the
    -- FRAMEWORK's state rather than the ped's: someone bleeding out or in last stand is still a
    -- live ped, so BlockWhileDead above (an engine-level IsEntityDead check) misses the window
    -- they actually spend on the floor waiting for EMS.
    --
    -- Cuffs have no agreed source, so the check reads the common state bags, the framework
    -- metadata and the native, which covers cuff scripts that only write one of them.
    --
    -- Both close a phone that is ALREADY open too, since gating only the open would be sidestepped
    -- by opening the phone first and being cuffed after.
    BlockWhileCuffed   = true,
    BlockWhileDowned   = true,

    -- Whether an incoming call throws the whole phone onto the screen. Off, a
    -- ringing phone shows the same closed-shell banner an alarm does, naming
    -- the caller, and the player opens their phone when they want to answer.
    -- On, the call screen takes over the moment the phone rings, which is how
    -- this behaved before the banner existed.
    OpenOnIncomingCall = false,

    -- The boot animation: your logo over a lit backdrop, played once when the
    -- resource starts and the player first opens their phone, never on ordinary
    -- opens after that. Off by default so an untouched install goes straight to
    -- the lockscreen; set true to turn it on. Players who pick No Motion in
    -- Accessibility never see it either way.
    BootScreen = false,

    -- Foldable phone. The body carries a hinge and unfolds sideways to twice the width, and the
    -- interface uses the room rather than scaling up: two home-screen pages side by side, the
    -- list/detail apps (Mail, Files, MDT, Settings) showing both panes at once, and split view
    -- for running two apps together.
    --
    -- On by default. Which phones fold is said by their items (Items above, `fold = true`): those
    -- get the hinge, the rest are regular phones with no hinge key on the shell. Nothing is forced
    -- on a foldable's owner either: it opens the way it was last put away and stays that way until
    -- the hinge is pressed. Set false and no phone folds whatever its item says: no hinge key is
    -- drawn at all, split view is unreachable, and a foldable item is held as a regular phone.
    Foldable = true,

    -- Screen width unfolded, in the UI's own pixels. The closed screen is 440, so 880 is two
    -- phones side by side - which is what makes an unfolded page and a split pane the same width
    -- as an ordinary phone screen, and why no app needs its own wide layout. Change this and
    -- split panes stop matching the closed width, so apps will be laid out at a size they have
    -- never been designed against.
    FoldOpenWidth = 880,

    -- In-hand prop for the foldable body, streamed by sd-phone-props alongside the plain models.
    -- Shut it is FoldPropPrefix .. <colour>, unfolded it adds FoldOpenSuffix, so the phone other
    -- players see opens when the hinge is pressed instead of staying a slab. Only read while
    -- Foldable is true - with it off the prop resolves through PropPrefix exactly as before, so
    -- the original sd_phone_<colour> models are what everyone keeps holding.
    FoldPropPrefix = 'sd_phone_fold_',
    FoldOpenSuffix = '_open',

    -- Keep the original phone in hand while the foldable is SHUT. Off by default, so a shut
    -- foldable is held as its own hinged model. Set true and the shut phone is the plain
    -- sd_phone_<colour> model everyone held before - no hinge, no extra thickness, and
    -- FoldPropOffset below is ignored. Unfolding still swaps in the open fold model unless
    -- FoldPlainOpenProp is on as well.
    FoldPlainShutProp = false,

    -- Keep the original phone in hand while the foldable is UNFOLDED. Off by default, so pressing
    -- the hinge swaps in the open fold model. Set true and the prop stays the plain
    -- sd_phone_<colour> model when the phone is unfolded - the screen still opens wide, the held
    -- phone just does not change - and FoldOpenPropOffset below is ignored. With both this and
    -- FoldPlainShutProp on, the fold models are never used at all.
    FoldPlainOpenProp = false,

    -- Where the SHUT foldable sits in the hand, added on top of PropOffset. The hinge makes this
    -- body 16.5mm thick against the plain phone's 13.5mm, and the extra sits on the palm side,
    -- so the grip clips the fingers that wrap the left edge unless it is lifted clear. Y is the
    -- axis through the screen: MORE negative pushes it further off the palm.
    FoldPropOffset = vec3(0.0, -0.0030, 0.0),

    -- Where the UNFOLDED body sits in the hand, added on top of PropOffset and only while it is
    -- open. The open phone is twice as wide, so leaving it centred like the shut one puts the
    -- hand in the middle of the screen; shifting it slides the grip toward the bottom-right
    -- corner, which is how a device that size is actually held. The screen texture runs u=0 at
    -- -X to u=1 at +X, so -X is the viewer's left: go MORE negative to slide the body further
    -- left of the hand, raise Z to grip lower down it, and lower Y to lift it off the palm.
    FoldOpenPropOffset = vec3(-0.0392, -0.0173, 0.0200),

    -- Let the player walk around while the phone is open (the game keeps
    -- receiving input alongside the UI). Mouse-look, aiming, firing, melee and
    -- weapon switching are suppressed so the mouse only drives the on-screen
    -- cursor; focusing a text field briefly hands full control back to the UI so
    -- typing WASD in a search box doesn't move you. Set false to freeze the
    -- player while the phone is out (the classic behaviour).
    AllowMovement = true,

    -- Keep that movement alive while the Camera app's viewfinder owns the
    -- screen. The mouse still drives the on-screen controls (shutter, zoom,
    -- mode strip), so aim the lens by holding LookKeybind, or by pressing Left
    -- Alt to hand the mouse over until you press it again. Set false to freeze
    -- the player while framing a shot. Needs AllowMovement.
    AllowMovementInCamera = true,

    -- The same, for a video call. The mouse keeps driving the call
    -- buttons, so hold LookKeybind to steer while you walk. Set false to freeze
    -- the player for the length of the video call. Needs AllowMovement.
    AllowMovementInVideoCall = true,

    -- Video calls send the picture peer-to-peer over WebRTC; the call audio stays on your voice
    -- resource. Public STUN is always used, which is enough when both players share a network.
    -- A TURN relay is what carries the picture between players on different home connections.
    -- Without one they get a connected call with a black picture, while their own self-view
    -- still looks fine, because the self-view never leaves their machine.
    --
    -- TURN is only for video calls and nearby-voice capture, the two things that talk browser to
    -- browser. Live broadcasts and MDT bodycams do NOT need it: Live sends its picture through the
    -- game server, and a bodycam is drawn on the watching terminal itself.
    --
    -- Configure it once in configs/voice.lua; the free Cloudflare path is two convars:
    --     set sd_cf_turn_token_id  "your-cloudflare-turn-token-id"
    --     set sd_cf_turn_api_token "your-cloudflare-turn-api-token"
    --
    -- A relay of your own (coturn) can be added for calls on top of that. Use coturn's
    -- static-auth-secret so every player gets their own login that expires by itself:
    --     set sd_phone_turn_url    "turn:turn.example.com:3478"
    --     set sd_phone_turn_secret "the static-auth-secret from turnserver.conf"
    -- A fixed username/password still works, but it is ONE login shared by every player, and anyone
    -- can copy it out of the game and use your relay (and your bandwidth) from anywhere:
    --     set sd_phone_turn_username   "your-username"
    --     set sd_phone_turn_credential "your-password"
    --
    -- Set this false to silence the boot warning if you deliberately run STUN-only.
    WarnAboutTurn = true,

    -- Hold this key/button (while the phone is open) to free the mouse for
    -- camera rotation without closing the phone. Releasing it returns to the
    -- on-screen cursor. Combat stays suppressed, so you can look around but not
    -- shoot. Defaults to the first mouse side button (thumb button), which is
    -- almost never taken; Left Alt and the middle button are avoided because
    -- target scripts and camera zoom already use them. No side button on your
    -- mouse? Rebind it in FiveM's Key Bindings. Only active when AllowMovement
    -- is on.
    LookKeybind = 'MOUSE_EXTRABTN1',

    -- Press this in SELFIE mode to move the camera instead of yourself: the lens
    -- then swings around you rather than turning you with it, so you can frame
    -- yourself from the side instead of head-on every time. Press again to go
    -- back to turning your character. Walking works either way; only the body's
    -- rotation is held. Does nothing on the outward lens, which frames the world.
    -- Defaults to the down arrow: the viewfinder already owns that cluster (up
    -- flips the lens, left and right change mode), every keyboard has one, and
    -- nothing else binds it. X is deliberately avoided because it is the
    -- hands-up key on most servers. Rebind it in FiveM's Key Bindings.
    CameraLockKeybind = 'DOWN',

    -- Press this in SELFIE mode to turn your character's head toward the lens,
    -- so an angled shot still has them looking at the camera instead of past it.
    -- Press again to let the head sit with the body. Defaults to right shift:
    -- every keyboard has one, left shift is sprint but right shift is almost
    -- never bound, and the viewfinder's arrow cluster is already spoken for.
    -- Rebind it in FiveM's Key Bindings.
    CameraFaceKeybind = 'RSHIFT',

    -- The keybind hints drawn over the game while the viewfinder is up.
    CameraHints = {
        -- Show them at all. False hides the list entirely; the keys still work.
        Enabled = true,

        -- Which screen corner they sit in: 'top-right', 'top-left',
        -- 'bottom-right' or 'bottom-left'. Anything else falls back to
        -- top-right. They align and slide in from whichever edge you pick.
        Corner = 'top-right',

        -- 1 or 2 columns. Two fills the column nearest your chosen edge first
        -- and puts the overflow inboard of it, so the list reads outward-in.
        Columns = 2,
    },

    -- Third-person "holding a phone" pose + prop, shown to other players while
    -- the phone is out. Looping upper-body anim so the player can still walk.
    -- The prop model is PropPrefix .. <frame colour> (e.g. sd_phone_red), so
    -- the phone in hand matches the variant you opened. These models are
    -- streamed by the sd-phone-props resource - ensure it's started, or no
    -- prop will attach (the phone itself still works).
    HoldAnimation = true,
    AnimDict      = 'cellphone@',
    AnimName      = 'cellphone_text_read_base',

    -- Held for the whole of a call, in place of the reading anim above, so the ped puts the phone
    -- to their ear. Kept up after the phone is stowed: the call is still running, so the arm stays
    -- there rather than dropping the moment the UI closes.
    CallAnimDict  = 'cellphone@',
    CallAnimName  = 'cellphone_call_listen_base',
    PropPrefix    = 'sd_phone_',
    PropBone      = 28422,   -- SKEL_R_Hand

    -- The logo and trims a player picks for their phones at a case store (its Phone tab,
    -- configs/cases.lua). It costs nothing and is remembered on their machine; other players see it
    -- on the prop. The design itself is not picked there: it comes with the phone, as its item says
    -- (Items above, `look`).
    --   * Designs says which phone designs this server has: `classic` (flat rails, a raised camera
    --     block) and `slate` (rounded rails, three lenses straight off the glass). Set one to false
    --     and phones of that design are held, and drawn, as the other.
    --   * Models lists, for each design, each logo (`sd`, `ifruit`, `generic`) with the stem its
    --     models are named from: <stem>_<colour>, <stem>_fold_<colour>, <stem>_fold_<colour>_open
    --     and <stem>_dui_<colour>. sd-phone-props streams all six. Remove a logo to take it out of
    --     the store; models that are not streamed fall back to the ones named above (PropPrefix,
    --     FoldPropPrefix, PropScreen.Model), which is also what a classic phone with no logo picked is.
    --   * Trims are small coloured parts fitted to the phone itself (sd_trim_* in sd-phone-props):
    --     lens rings, the camera surround and button caps, each in any of the 64 case colours.
    Looks = {
        Enabled = true,    -- false: everyone holds the models named above and the store has no Phone tab
        Designs = { classic = true, slate = true },   -- false: phones of that design are shown as the other one
        Trims   = true,    -- false: no trims
        Logos   = true,    -- false: no logo choice; a design shows the first logo it lists (sd, ifruit, generic)
        Models = {
            classic = { sd = 'sd_phone', ifruit = 'sd_ifruit', generic = 'sd_generic' },
            slate   = { sd = 'sd_slate', ifruit = 'sd_ifruit_slate', generic = 'sd_generic_slate' },
        },
    },

    -- Fine-tune where the prop sits in the hand. The cellphone@ anim is
    -- authored so a phone welded to SKEL_R_Hand at zero offset/rotation lands
    -- in the texting grip (this is what npwd ships), so leave these at 0 unless
    -- a custom sd_phone_<colour> model has its origin off the grip point.
    PropOffset = vec3(0.0, 0.0, 0.0),
    PropRot    = vec3(0.0, 0.0, 0.0),

    -- Where the prop sits while the Camera app is in LANDSCAPE mode. Landscape
    -- plays its own clip, which turns the wrist so the phone already lies on its
    -- side, so these match the portrait transform above: rolling the prop as well
    -- would turn it twice. Nudge them only if a custom model sits off the grip in
    -- that pose.
    PropLandscapeOffset = vec3(0.0, 0.0, 0.0),
    PropLandscapeRot    = vec3(0.0, 0.0, 0.0),

    -- Let other players see the phone in your hand. When true, your ped broadcasts a replicated
    -- statebag while the phone is out and every nearby client spawns its own LOCAL welded copy of
    -- the prop on your ped (the hold animation already replicates on its own). The prop is
    -- deliberately NOT a networked object, because a networked prop's ownership can migrate to
    -- another client whose sync then freezes it mid-hold. Set false to go back to local-only
    -- (only you see your own prop).
    PropVisibleToOthers = true,

    -- Optional: draw the phone UI ON the held prop's screen instead of the full-screen overlay.
    -- The live UI runs in a DUI (off-screen browser) whose image replaces the prop's screen
    -- texture; a close-up camera eases in on the phone and the mouse cursor is mapped onto the
    -- tilted screen. Text fields use the game's on-screen keyboard (a DUI cannot receive keys).
    -- In a vehicle, in the Camera app / a video call, and on an unfolded foldable (unless Foldable
    -- below is on), the phone falls back to the normal full-screen UI. Other players keep seeing
    -- the normal sd_phone_<colour> prop. Code: client/propscreen.lua + web/dui/phone.html.
    --
    -- Off by default: with Enabled = false nothing is created (no DUI, no threads) and the phone
    -- behaves exactly as stock.
    --
    -- THE ART: sd-phone-props streams it (sd_phone_dui, one sd_phone_dui_<colour> per frame colour,
    -- and sd_phone_dui.ytd). The phone in hand is <Model>_<colour> when that model is streamed and
    -- plain <Model> otherwise. To use your own, it has to be a phone model whose screen is a
    -- separate material using a texture from a STANDALONE streamed .ytd, because FiveM's
    -- AddReplaceTexture cannot swap a texture embedded in the .ydr itself:
    --   * <Model>.ydr      the phone body; screen material uses texture <Texture>, ideally emissive
    --                      and UV-mapped 0..1 over the visible screen (top-left = UV 0,0)
    --   * <TextureDict>.ytd holding <Texture> (any placeholder image; it is replaced at runtime)
    --   * a .ytyp archetype for <Model> whose textureDictionary is <TextureDict>
    -- If the model or the .ytd is missing, a warning is printed once in F8 and the phone stays on
    -- the full-screen UI.
    PropScreen = {
        Enabled = false,

        Model       = 'sd_phone_dui',    -- prop held while the UI is on its screen (any frame colour)
        TextureDict = 'sd_phone_dui',    -- standalone .ytd with the screen texture (default: same as Model)
        Texture     = 'sd_phone_screen', -- texture name inside TextureDict that gets replaced

        -- DUI resolution in pixels. The UI's screen is 440x956 CSS px; keep the prop screen's aspect
        -- (here 0.46) and go ~1.2x the UI size for a sharp image. Higher costs more GPU/VRAM.
        Width  = 540,
        Height = 1174,

        -- The screen rectangle in prop-local metres (centre + full width/height), used to map the
        -- cursor onto it: screen faces -Y, top is +Z. These values fit the sd-phone-props models
        -- (73.4 x 158.4 mm screen); measure your own model if it differs.
        ScreenCentre = vec3(0.0, -0.00186, 0.0),
        ScreenSize   = vec2(0.07336, 0.1584),

        -- Unfolded foldable (Foldable above). false = unfolding hands the phone to the full-screen
        -- UI (the prop has one portrait screen). true = keep it on the prop; the wide UI is
        -- letterboxed onto the same portrait screen.
        Foldable = false,

        -- Close-up camera that looks at the raised phone (the gameplay camera is restored on close).
        Camera      = true,
        CamFov      = 40.0,
        CamDistance = 0.34,  -- metres from the screen along its normal
        CamEaseMs   = 450,
        CamFollow   = 1.0,   -- 1.0 = camera rigid to the phone (steady screen); lower = smoothed, phone sways

        Debug = false,       -- F8 log of DUI start-up and each tap (x,y + element)
    },

    -- Let nearby players HEAR your phone ring. Your ringtone is played by each nearby player's own
    -- phone UI at a volume set by how far away they are, so no audio is streamed and no extra
    -- resource is needed: every client already has the bundled ringtones in its build.
    --
    -- Only the eight bundled ringtones can be heard this way. A custom (YouTube) ringtone falls
    -- back to the default tone for bystanders, because those play through a shared player that the
    -- listener's own ringtone is already using.
    AudibleRing = {
        Enabled = true,

        -- Metres at which the ring becomes inaudible. Falloff is squared, so it fades fast.
        Range = 15.0,

        -- Loudest a nearby ring can get (0-1), reached only right next to the ringing player.
        Volume = 0.5,

        -- Multiplier applied when there's no line of sight to the ringing player, so a phone
        -- through a wall is muffled rather than as loud as one in the open. 1.0 disables it.
        Occlusion = 0.35,

        -- Don't broadcast a ring from a phone whose owner has Do Not Disturb on. Their own phone
        -- stays silent for them, so it stays silent for the street too.
        RespectDnd = true,
    },

    -- Flashlight beam emitted forward from the phone (lockscreen torch button).
    -- A spotlight cast from the player's hand in the direction they're looking.
    Flashlight = {
        Color      = { 255, 244, 224 },   -- warm white
        Distance   = 30.0,
        Brightness = 1.4,
        Radius     = 12.0,
    },
}
