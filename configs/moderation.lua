-- Keyword watchlist. A sweep reads what players have posted across the phone's apps and files
-- anything matching a rule into the admin panel's Flags queue, so staff review a short list
-- instead of scrolling every app hoping to catch something.
--
-- Nothing here punishes anyone: a flag is a queue entry an admin still has to act on, and the
-- sweep only ever reads. The rules ship deliberately thin, because what counts as a breach is a
-- server's own decision - the examples below are the shapes that are near-universally unwanted
-- (out-of-character contact and real-money trading), not a moderation policy.
return {
    -- Whether the sweep runs at all. With this off the Flags tab still lists whatever was filed
    -- before, and "Scan now" still works: only the timer stops.
    Enabled = true,

    -- Minutes between automatic sweeps. 0 leaves it to the panel's "Scan now" button.
    SweepMinutes = 30,

    -- How far back a sweep reads, in hours. A flag is filed once per rule per row, so a longer
    -- window costs reading, never duplicates.
    LookbackHours = 24,

    -- Rows one sweep reads per app before it stops, whichever comes first with LookbackHours.
    MaxRowsPerApp = 400,

    -- Apps the sweep reads. Each name is a content adapter in server/admin/store.lua.
    --
    -- Mail is deliberately absent: it keeps every message inside a JSON column on the mailbox
    -- rather than as rows, so a sweep would have to open each mailbox in turn. Search the Mail
    -- tab instead, where the filter does reach message bodies.
    Apps = {
        'birdy', 'messages', 'darkchat', 'photogram', 'vibez',
        'marketplace', 'pages', 'cherry', 'review', 'weazelnews', 'notes',
    },

    -- Rules, checked against the lowercased text of each row.
    --
    --   id        stable key; the flag is filed once per row per id, so renaming one re-files it
    --   label     what the queue shows
    --   patterns  Lua patterns, already lowercase. `%` escapes a magic character, so a literal
    --             dot is `%.` and a literal dash is `%-`.
    Rules = {
        {
            id    = 'ooc-contact',
            label = 'Out-of-character contact',
            patterns = { 'discord%.gg/', 'discord%.com/invite', 'teamspeak', 'ts3server', 'steamcommunity%.com' },
        },
        {
            id    = 'real-money',
            label = 'Real-money trading',
            patterns = { 'paypal', 'cash ?app', 'venmo', 'real money', 'irl cash', 'irl money' },
        },
        -- Left empty on purpose. Fill it with the words your server actually bans; there is no
        -- list that is right for every community, and shipping someone else's is worse than
        -- shipping none.
        {
            id    = 'slurs',
            label = 'Banned words',
            patterns = {},
        },
    },
}
