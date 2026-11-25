-- SERVER-ONLY Wi-Fi passwords. This file is deliberately NOT listed in fxmanifest files{} (which uses
-- `configs/*.lua`, so it never matches this subfolder), meaning it stays on the server and never
-- ships to a connected client. configs/wifi.lua, which holds the networks themselves, is sent to
-- every client, so a password written there can be read by anyone who joins. Keep configs/server/
-- out of files{}; a broad glob like `configs/**.lua` would hand every password here out too.
--
-- One entry per secured network, keyed by the network's `id` in configs/wifi.lua. Mark the same
-- network `secured = true` there, so phones show the padlock and ask for the password; the server
-- warns at boot when the two files disagree. A network marked secured with no password here
-- cannot be joined at all.
--
-- Older setups that still have `password = '...'` on a network in configs/wifi.lua keep working:
-- that password is used and the console asks you to move it here.
return {
    Passwords = {
        missionrow  = 'lspd1234',
        mazebank    = 'maze2024',
        lifeinvader = 'gofuckyourself',
        unicorn     = 'backstage',
        casino      = 'jackpot',
        gordo       = 'ranger',
        paleto      = 'paleto',
    },
}
