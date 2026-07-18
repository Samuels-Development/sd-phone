-- Phone open / close behaviour.
return {
    -- Inventory items that open the phone when used. Each entry maps an item
    -- name to a frame colour; that colour drives both the on-screen rail and
    -- the prop model held in hand (PropPrefix .. colour). Add variants by
    -- shipping the matching `sd_phone_<colour>` prop and listing it here.
    -- Order matters: the keybind opens the first owned variant when the
    -- last-used one isn't held. Set to {} to disable item-based opening.
    Items = {
        { item = 'phone',  color = 'black'  },
        { item = 'phone_blue',   color = 'blue'   },
        { item = 'phone_green',  color = 'green'  },
        { item = 'phone_orange', color = 'orange' },
        { item = 'phone_pink',   color = 'pink'   },
        { item = 'phone_purple', color = 'purple' },
        { item = 'phone_red',    color = 'red'    },
        { item = 'phone_yellow', color = 'yellow' },
    },

    -- Frame colour the phone opens with before any item has been used this
    -- session (the keybind fallback). Must be one of the frame colours.
    DefaultColor = 'black',

    -- Default keybind to open / close the phone. Players can rebind
    -- via FiveM's keybinding menu (Settings → Key Bindings → FiveM).
    Keybind  = 'F1',

    -- Hide the phone while the player is dead, swimming, in water,
    -- or carrying a two-handed weapon. The phone is still openable
    -- otherwise - these are just safety blocks against use-on-floor
    -- exploits.
    BlockWhileDead     = true,
    BlockWhileSwimming = true,

    -- Let the player walk around while the phone is open (the game keeps
    -- receiving input alongside the UI). Mouse-look, aiming, firing, melee and
    -- weapon switching are suppressed so the mouse only drives the on-screen
    -- cursor; focusing a text field briefly hands full control back to the UI so
    -- typing WASD in a search box doesn't move you. Set false to freeze the
    -- player while the phone is out (the classic behaviour).
    AllowMovement = true,

    -- Hold this key/button (while the phone is open) to free the mouse for
    -- camera rotation without closing the phone. Releasing it returns to the
    -- on-screen cursor. Combat stays suppressed, so you can look around but not
    -- shoot. Defaults to the first mouse side button (thumb button), which is
    -- almost never taken; Left Alt and the middle button are avoided because
    -- target scripts and camera zoom already use them. No side button on your
    -- mouse? Rebind it in FiveM's Key Bindings. Only active when AllowMovement
    -- is on.
    LookKeybind = 'MOUSE_EXTRABTN1',

    -- Third-person "holding a phone" pose + prop, shown to other players while
    -- the phone is out. Looping upper-body anim so the player can still walk.
    -- The prop model is PropPrefix .. <frame colour> (e.g. sd_phone_red), so
    -- the phone in hand matches the variant you opened. These models are
    -- streamed by the sd-phone-props resource - ensure it's started, or no
    -- prop will attach (the phone itself still works).
    HoldAnimation = true,
    AnimDict      = 'cellphone@',
    AnimName      = 'cellphone_text_read_base',
    PropPrefix    = 'sd_phone_',
    PropBone      = 28422,   -- SKEL_R_Hand

    -- Fine-tune where the prop sits in the hand. The cellphone@ anim is
    -- authored so a phone welded to SKEL_R_Hand at zero offset/rotation lands
    -- in the texting grip (this is what npwd ships), so leave these at 0 unless
    -- a custom sd_phone_<colour> model has its origin off the grip point.
    PropOffset = vec3(0.0, 0.0, 0.0),
    PropRot    = vec3(0.0, 0.0, 0.0),

    -- Let other players see the phone in your hand. When true, your ped broadcasts a replicated
    -- statebag while the phone is out and every nearby client spawns its own LOCAL welded copy of
    -- the prop on your ped (the hold animation already replicates on its own). This is lb-phone's
    -- "state" strategy: the prop is deliberately NOT a networked object, because a networked prop's
    -- ownership can migrate to another client whose sync then freezes it mid-hold. Set false to go
    -- back to local-only (only you see your own prop).
    PropVisibleToOthers = true,

    -- Flashlight beam emitted forward from the phone (lockscreen torch button).
    -- A spotlight cast from the player's hand in the direction they're looking.
    Flashlight = {
        Color      = { 255, 244, 224 },   -- warm white
        Distance   = 30.0,
        Brightness = 1.4,
        Radius     = 12.0,
    },
}
