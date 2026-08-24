-- lb-phone -> sd-phone data migration. When a server switches from lb-phone to sd-phone this
-- carries each player's essentials across, so people keep their phone instead of starting over:
-- phone number + lock passcode, contacts, call history, blocked numbers, SMS threads (incl.
-- groups), photos + albums, and notes.
--
-- Nothing happens until you ask for it. /phoneadmin -> Migration previews what is on the other
-- side, takes a domain selection and streams the run; set `enabled` below if you would rather it
-- ran by itself on the next boot instead.
--
-- It is idempotent and non-destructive. A marker row (phone_migrations) stops it running twice,
-- every write is INSERT IGNORE / fill-only, and a player who already has sd-phone data is never
-- overwritten. Safe to leave enabled forever: once there is nothing left to import it is a cheap
-- no-op. The join is lb-phone's phone owner id -> framework citizenid, and each player's lb-phone
-- number is adopted as their sd-phone number so every contact / thread / call log still lines up.
return {
    -- Import automatically on resource start. Off by default: this reads millions of rows and runs
    -- the server heavy for as long as it takes, which is not something to do to a live server
    -- nobody was expecting it on.
    --
    -- Leave it off and you drive the import yourself from /phoneadmin -> Migration, which previews
    -- what lb-phone actually holds, lets you pick the domains, and streams the run with a live log
    -- and an ETA. Turn it on if you would rather it happen by itself on the next boot and never
    -- think about it again; it is idempotent, so once there is nothing left to import it is a
    -- cheap no-op. `sdphone:migrate` from the server console works either way.
    enabled = false,

    -- lb-phone's table prefix. Its tables are all phone_* (phone_phones, phone_phone_contacts,
    -- ...). Only touch this if you renamed them; it must be plain [a-z0-9_] or it is ignored.
    sourcePrefix = 'phone_',

    -- How an lb-phone phone owner id maps to an sd-phone citizenid:
    --   'auto'      match owner_id against known citizenids first, else treat it as a license
    --   'citizenid' owner_id is already the citizenid (skip the license fallback)
    --   'license'   owner_id is a license; always map through the players table
    -- 'auto' is right for almost everyone (it covers both lb-phone identifier setups).
    identifierMode = 'auto',

    -- Dry run: count everything and log the plan, but write nothing. Run the console command with
    -- `sdphone:migrate dry` for a preview without flipping this.
    dryRun = false,

    -- Per-domain switches, if you want to import only some of it. `numbers` must stay on: every
    -- other domain is keyed off the number -> citizenid resolution it establishes.
    --
    -- `reactions` needs `messages` (it attaches to the messages that porter writes) and
    -- `sessions` needs `photogram` (it links to the accounts that porter creates). Turning
    -- `birdy` or `vibez` off also holds back their logins, since there is then no account for a
    -- Twitter or Trendy session to attach to.
    --
    -- lb-phone passwords are bcrypt hashed and cannot be converted to sd-phone's hasher, so
    -- migrated accounts rely on the pre-seeded sessions to stay signed in. Anyone who logs out
    -- recovers through the normal in-app password reset.
    domains = {
        numbers    = true,
        contacts   = true,
        blocked    = true,
        calls      = true,
        messages   = true,
        photos     = true,
        notes      = true,
        -- wallpaper, theme, clock format, ringtones, volumes, home-screen layout
        settings   = true,
        -- message reactions; needs `messages`
        reactions  = true,
        -- Instagram accounts, posts, comments, likes, follows, stories and DMs
        photogram  = true,
        -- Twitter accounts, posts and replies, likes, reposts, follows and DMs
        birdy      = true,
        -- Trendy accounts, videos, comments, likes, saves, follows and notifications
        vibez      = true,
        -- mail accounts and their received messages
        mail       = true,
        -- wallet transaction history
        wallet     = true,
        -- voice memo recordings
        voicememos = true,
        -- keeps players signed into their migrated accounts; needs `photogram`, runs last
        sessions   = true,
    },
}
