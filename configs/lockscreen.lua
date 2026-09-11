-- Lockscreen appearance.
return {
    -- Wallpaper name. Resolved by the React app's wallpaper registry
    -- (`web/src/shell/wallpapers.ts`) into a bundled JPG. Override by
    -- dropping a new file into `web/src/assets/wallpapers/`,
    -- registering it in `wallpapers.ts`, and putting the new key
    -- here.
    Wallpaper = 'homescreen.jpg',

    -- Show the date row above the time. Mirrors iOS - disabling
    -- gives the clock the full top half of the screen.
    ShowDate  = true,

    -- 24-hour or 12-hour clock. iOS default is the device locale;
    -- here we let the server author pick once.
    Use24Hour = false,

    -- Fail Face Unlock while a mask, bandana or hood covers the
    -- player's face, the way a real phone refuses a face it cannot
    -- read. The lockscreen falls back to the passcode. Turn this off
    -- to let a covered face unlock the phone anyway.
    MaskBlocksFaceUnlock = true,
}
