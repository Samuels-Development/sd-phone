-- Main config - an index that stitches the per-group config files together.
-- Every consumer still does `require 'configs.config'` and reads the same
-- table; to change a group's settings, edit its own file in this folder
-- (e.g. configs/garages.lua for the Garages app).

local config = {
    -- Locale file under `locales/<Locale>.json`. Falls back to `en` if missing.
    Locale = 'en',

    -- Debug / dev logging toggle.
    Debug  = false,

    -- Per-group settings (one file each).
    Phone       = require 'configs.phone',        -- open/close, keybind, safety blocks
    Lockscreen  = require 'configs.lockscreen',    -- wallpaper, clock format
    Apps        = require 'configs.apps',          -- dock, wallpaper, app catalog + enable flags
    StatusBar   = require 'configs.statusbar',     -- carrier / signal / battery
    Photos      = require 'configs.photos',        -- camera capture + Fivemanage upload
    Payphone    = require 'configs.payphone',      -- street payphones (ox_target + dial UI)
    Mail        = require 'configs.mail',          -- email accounts + limits
    Messages    = require 'configs.messages',       -- SMS / iMessage threads
    Groups      = require 'configs.groups',        -- player groups / crews
    Birdy       = require 'configs.birdy',         -- microblog
    Photogram   = require 'configs.photogram',     -- photo social + live video streaming
    Voice       = require 'configs.voice',          -- camera/Live audio: own mic + nearby voices (WebRTC)
    Contacts    = require 'configs.contacts',      -- phone-book + recents
    Giphy       = require 'configs.giphy',         -- Messages GIF picker display tunables (key is in configs/server/apikeys.lua)
    Garages     = require 'configs.garages',       -- vehicle list (multi-system)
    Weather     = require 'configs.weather',       -- live weather + world time (multi-sync)
    DarkChat    = require 'configs.darkchat',      -- anonymous chat rooms
    Marketplace = require 'configs.marketplace',   -- classifieds
    Pages       = require 'configs.pages',          -- yellow-pages board
    Review        = require 'configs.review',            -- business reviews directory
    Banking     = require 'configs.banking',        -- wallet + transfers
    Services    = require 'configs.services',        -- job/company directory + boss management
    VoiceMemos  = require 'configs.voicememos',     -- voice notes + Fivemanage
    Share       = require 'configs.share',          -- nearby share sheet
    Notes       = require 'configs.notes',         -- per-character notes
    Documents   = require 'configs.documents',     -- Files: per-character documents + folders
    Housing     = require 'configs.housing',       -- property list (multi-system)
    Cookie      = require 'configs.cookie',        -- clicker mini-game + leaderboard
    Stocks      = require 'configs.stocks',         -- stock + crypto market, brokerage wallet
    Radio       = require 'configs.radio',          -- frequencies + job-restricted bands
    WeazelNews  = require 'configs.weazelnews',     -- broadcast network: staff-published articles + breaking ticker
    Streaks     = require 'configs.streaks',        -- photo-a-day streaks: milestone cash + global gallery
    Migrate     = require 'configs.migrate',         -- one-time lb-phone -> sd-phone data import
    Sim         = require 'configs.uniqueandsim',    -- unique phones + SIM cards (see its pick-your-setup header)
}

-- Server-only secrets: third-party API keys live in configs/server/apikeys.lua, which is NOT in
-- fxmanifest files{} (the glob is `configs/*.lua`, so the server/ subfolder never ships to a
-- client). Merged in server-side only, reachable as config.ApiKeys; on the client this stays nil
-- and no client code reads it.
if IsDuplicityVersion() then
    config.ApiKeys = require 'configs.server.apikeys'
end

return config
