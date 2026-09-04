-- Birdy app - the in-game microblog (posts, likes, follows, DMs, alerts).
-- Content is per-character, stored in the phone_birdy_* tables created on
-- resource start.
return {
    -- New profiles start unverified. Flip to true to hand everyone the blue
    -- check, or set a badge per-account with /birdyverify <handle> <type>.
    DefaultVerified = false,

    -- Buying the blue check from inside the app (Profile > Edit profile).
    -- Only blue is ever purchasable: the gold business and grey government
    -- badges assert who someone is, so they stay staff-granted through the
    -- admin panel or /birdyverify. Set Enabled = false to hide the row.
    Verification = {
        Enabled = true,
        Price   = 25000,
        Account = 'bank',
    },

    -- Max length of a post / reply body. Mirrors the React composer's
    -- maxLength so client and server agree.
    MaxPostLength = 280,

    -- Max length of a direct message.
    MaxDmLength = 500,

    -- Polls. A post carries either a poll or media, never both, and the post
    -- body is the question. Options are 2 to MaxPollOptions choices.
    MaxPollOptions      = 4,
    MaxPollOptionLength = 40,

    -- Durations the composer offers, in seconds. The server accepts only
    -- these exact values, so add a duration here and to the React composer
    -- together (web/src/apps/birdy/data.ts).
    PollDurations = { 3600, 86400, 259200, 604800 },

    -- Posts returned per feed load (newest first).
    FeedLimit = 50,

    -- Days of post history the Search tab's trending-hashtag counts look at.
    TrendingWindowDays = 7,

    -- Notifications returned per alerts-tab load.
    NotificationLimit = 50,

    -- Notify a player whenever someone they follow posts. On, every new post alerts each of the
    -- author's followers and badges their Squawk icon, the way a real feed app does. Off, posts
    -- land silently in the feed and only likes, replies, reposts and follows still notify.
    -- Worth turning off on a busy server, where a prolific poster can fill their followers'
    -- notification list on their own.
    PostNotifications = true,

    -- Account field bounds, mirrored by the React register/login forms.
    MaxNameLength     = 32,
    MinHandleLength   = 2,
    MaxHandleLength   = 15,
    MinPasswordLength = 4,
    MaxPasswordLength = 64,
    MaxBioLength      = 160,
}
