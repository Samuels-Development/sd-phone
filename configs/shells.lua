-- Phone shells. A shell is the chassis only: rail shape and finish, corner radius, bezel
-- thickness, the camera cutout and where the side buttons sit. The screen itself never changes
-- size, so every app looks and behaves identically whichever shell a player picks.
--
-- Shell ids ship in web/src/shell/shells.ts. The ones that exist today:
--   ios        the default. Rounded rail, Dynamic Island, polished finish.
--   android    flat matte rail, tighter corners, small centred punch-hole camera.
--   edge       the thinnest bezel, near-square rail, tiny centred pinhole camera.
--   classic    thicker bezel, centred notch, gently rounded corners, matte finish.
--   compact    thin sides with a forehead and chin, camera in the bezel, no cutout at all.
--   droplet    barely-there borders with a tiny teardrop notch.
--   dual       the thinnest borders of all, wide twin-camera punch-hole.
--   rugged     armoured: the thickest border of the set, deep buttons, spare key.
--   gaming     the boxiest body, even borders, shoulder triggers on the right.
--   waterfall  near-frameless body, glass rolled over all four edges, orange key.
return {
    -- false locks everyone to Forced below (or to the first entry of Allowed when Forced is nil)
    -- and hides the Phone Shell page from Settings entirely, so there is no dead control.
    AllowPlayerChoice = true,

    -- Shells players may pick from. Remove entries to narrow the list. An id that does not exist
    -- is ignored rather than erroring, so a typo costs you one option and not the picker.
    Allowed = {
        'ios', 'android', 'edge', 'classic', 'compact',
        'droplet', 'dual', 'rugged', 'gaming', 'waterfall',
    },

    -- Set to a shell id to put every phone on it regardless of what a player chose earlier. Their
    -- stored choice is kept, so clearing this hands their own shell back rather than resetting it.
    Forced = nil,
}
