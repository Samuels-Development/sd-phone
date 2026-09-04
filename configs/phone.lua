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
    -- A fixed relay of your own (coturn, Metered) can be added for calls on top of that:
    --     set sd_phone_turn_url        "turn:turn.example.com:3478"
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

    -- Flashlight beam emitted forward from the phone (lockscreen torch button).
    -- A spotlight cast from the player's hand in the direction they're looking.
    Flashlight = {
        Color      = { 255, 244, 224 },   -- warm white
        Distance   = 30.0,
        Brightness = 1.4,
        Radius     = 12.0,
    },
}
