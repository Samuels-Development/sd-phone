-- Street payphones. ox_target on the phone-box props opens a standalone dial UI (no phone
-- needed, works for players without one). Each payphone location mints a persistent number on
-- first use, so the same booth always calls out from the same number. Other scripts can open
-- the UI anywhere via exports['sd-phone']:openPayphone().
return {
    -- Master switch: false removes the targets, callbacks and exports do nothing.
    Enabled = true,

    -- When true the callee sees a withheld caller ("Payphone") instead of the booth's number.
    Anonymous = false,

    -- Caller name shown on the callee's incoming-call screen (their saved contacts still win).
    CallerLabel = 'Payphone',

    -- Prop models that get the ox_target interaction.
    Models = {
        'prop_phonebox_01a',
        'prop_phonebox_01b',
        'prop_phonebox_01c',
        'prop_phonebox_02',
        'prop_phonebox_03',
        'prop_phonebox_04',
        'p_phonebox_01b_s',
    },

    -- ox_target interaction distance.
    TargetDistance = 1.5,

    -- Use ox_lib context menus + input dialog instead of the payphone UI page.
    UseOxLibMenu = false,

    -- Show the player's favourite contacts on the payphone's notepad (needs their phone's
    -- contact list, so it's empty for players without a phone).
    ShowFavorites = true,

    -- Area code the minted payphone numbers start with.
    NumberPrefix = '444',

    -- On-the-phone animation against the booth (Contract-DLC payphone scripted anims). Tweak
    -- the clips here if your game build names them differently.
    Scene = {
        Enabled = true,
        Dict  = 'anim@scripted@payphone_hits@male@',
        Enter = 'fxfr_phl_1_intro_male',
        Idle  = 'fxfr_ptj_1_male',
        Exit  = 'exit_left_male',
        -- Animatable booth spawned over the (hidden) world prop so the handset really lifts.
        AnimProp  = 'sf_prop_sf_phonebox_01b_s',
        EnterProp = 'fxfr_pcn_1_intro_phone',
    },

    -- Inbound calls: dialing a booth's number rings the physical booth. Anyone nearby can pick
    -- up via the target's "Answer Phone".
    Inbound = {
        Enabled = true,
        -- How long the booth rings before the caller hears "no answer" (ms).
        RingTimeout = 30000,
        -- Sound played from the booth object while it rings.
        SoundName = 'Remote_Ring',
        SoundSet  = 'Phone_SoundSet_Michael',
    },
}
