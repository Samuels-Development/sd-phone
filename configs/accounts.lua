-- App accounts engine. Governs how many accounts one character may create in each app that
-- signs in through it (Photogram, Cherry, Vibez, Ryde, Squawk), and nothing else - Mail keeps
-- its own limit in configs/mail.lua.
return {
    -- Accounts one character may create per app. Their usernames must still differ, but the
    -- accounts may share a recovery email and phone number, so one person can run several
    -- handles from a single contact. 0 = unlimited.
    MaxPerApp = 3,

    -- Per-app overrides, keyed by app id. Anything left out uses MaxPerApp above.
    PerApp = {
        -- photogram = 5,
        -- ryde      = 1,
        -- birdy     = 3,
    },
}
