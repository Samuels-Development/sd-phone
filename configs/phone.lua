-- Phone open / close behaviour.
return {
    -- Inventory items that open the phone when used. Each entry maps an item
    -- name to a frame colour; that colour drives both the on-screen rail and
    -- the prop model held in hand (PropPrefix .. colour). Add variants by
    -- shipping the matching `sd_phone_<colour>` prop and listing it here.
    -- Order matters: the keybind opens the first owned variant when the
    -- last-used one isn't held. Set to {} to disable item-based opening.
    Items = {
        { item = 'phone_black',  color = 'black'  },
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

    -- Phone numbers: how long a new one is, and how numbers are displayed.
    -- Numbers are always STORED as bare digits, so this changes presentation and
    -- generation only - no database column, contact, message or call log is
    -- rewritten, and every lookup keeps matching on digits.
    Number = {
        -- Digits in a NEWLY generated number. Changing it leaves every existing
        -- number exactly as it is, so a running server ends up with a mix of
        -- lengths, and both keep working everywhere.
        Length = 10,

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

    -- The same, for a FaceTime video call. The mouse keeps driving the call
    -- buttons, so hold LookKeybind to steer while you walk. Set false to freeze
    -- the player for the length of the video call. Needs AllowMovement.
    AllowMovementInVideoCall = true,

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
    PropPrefix    = 'sd_phone_',
    PropBone      = 28422,   -- SKEL_R_Hand

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
