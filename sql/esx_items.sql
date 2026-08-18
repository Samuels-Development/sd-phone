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
    ('phone_black',  'Black Phone',  1, 0, 1),
    ('phone_blue',   'Blue Phone',   1, 0, 1),
    ('phone_green',  'Green Phone',  1, 0, 1),
    ('phone_orange', 'Orange Phone', 1, 0, 1),
    ('phone_pink',   'Pink Phone',   1, 0, 1),
    ('phone_purple', 'Purple Phone', 1, 0, 1),
    ('phone_red',    'Red Phone',    1, 0, 1),
    ('phone_yellow', 'Yellow Phone', 1, 0, 1);

-- Only needed when unique phones are on with SIM cards (configs/uniqueandsim.lua).
INSERT IGNORE INTO `items` (`name`, `label`, `weight`, `rare`, `can_remove`) VALUES
    ('sim_card', 'SIM Card', 1, 0, 1);
