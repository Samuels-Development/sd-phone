-- ESX only, and only needed if you set `SeedEsxItems = false` in configs/phone.lua.
-- sd-phone adds these rows itself on boot by default; this file is the manual equivalent.
--
-- ESX keeps its item catalogue in this table and nowhere else, so an item missing from it can
-- never be given or used. Import this once, then restart the server (or the phone items stay
-- unknown to ESX until it re-reads the table).
--
-- Not for ox_inventory / qs / tgiann / codem installs: those keep their own item lists, and the
-- items belong there instead.

INSERT IGNORE INTO `items` (`name`, `label`, `weight`, `rare`, `can_remove`) VALUES
    ('phone_black',         'Black Phone',         1, 0, 1),
    ('phone_blue',          'Blue Phone',          1, 0, 1),
    ('phone_green',         'Green Phone',         1, 0, 1),
    ('phone_orange',        'Orange Phone',        1, 0, 1),
    ('phone_pink',          'Pink Phone',          1, 0, 1),
    ('phone_purple',        'Purple Phone',        1, 0, 1),
    ('phone_red',           'Red Phone',           1, 0, 1),
    ('phone_yellow',        'Yellow Phone',        1, 0, 1),
    ('phone_white',         'White Phone',         1, 0, 1),
    ('phone_silver',        'Silver Phone',        1, 0, 1),
    ('phone_graphite',      'Graphite Phone',      1, 0, 1),
    ('phone_titanium',      'Titanium Phone',      1, 0, 1),
    ('phone_gold',          'Gold Phone',          1, 0, 1),
    ('phone_rosegold',      'Rose Gold Phone',     1, 0, 1),
    ('phone_bronze',        'Bronze Phone',        1, 0, 1),
    ('phone_mocha',         'Mocha Phone',         1, 0, 1),
    ('phone_cream',         'Cream Phone',         1, 0, 1),
    ('phone_burgundy',      'Burgundy Phone',      1, 0, 1),
    ('phone_coral',         'Coral Phone',         1, 0, 1),
    ('phone_peach',         'Peach Phone',         1, 0, 1),
    ('phone_lime',          'Lime Phone',          1, 0, 1),
    ('phone_mint',          'Mint Phone',          1, 0, 1),
    ('phone_sage',          'Sage Phone',          1, 0, 1),
    ('phone_forest',        'Forest Phone',        1, 0, 1),
    ('phone_teal',          'Teal Phone',          1, 0, 1),
    ('phone_cyan',          'Cyan Phone',          1, 0, 1),
    ('phone_skyblue',       'Sky Blue Phone',      1, 0, 1),
    ('phone_navy',          'Navy Phone',          1, 0, 1),
    ('phone_indigo',        'Indigo Phone',        1, 0, 1),
    ('phone_lavender',      'Lavender Phone',      1, 0, 1),
    ('phone_magenta',       'Magenta Phone',       1, 0, 1),
    ('phone_rose',          'Rose Phone',          1, 0, 1),
    ('phone_jetblack',      'Jet Black Phone',     1, 0, 1),
    ('phone_pearl',         'Pearl Phone',         1, 0, 1),
    ('phone_ruby',          'Ruby Phone',          1, 0, 1),
    ('phone_sapphire',      'Sapphire Phone',      1, 0, 1),
    ('phone_blackgold',     'Black & Gold Phone',  1, 0, 1),
    ('phone_whitegold',     'White & Gold Phone',  1, 0, 1),
    ('phone_leather_brown', 'Brown Leather Phone', 1, 0, 1),
    ('phone_leather_black', 'Black Leather Phone', 1, 0, 1),
    ('phone_leather_tan',   'Tan Leather Phone',   1, 0, 1);

-- Only needed when unique phones are on with SIM cards (configs/uniqueandsim.lua).
INSERT IGNORE INTO `items` (`name`, `label`, `weight`, `rare`, `can_remove`) VALUES
    ('sim_card', 'SIM Card', 1, 0, 1);
