-- Birdy app - the in-game microblog (posts, likes, follows, DMs, alerts).
-- Content is per-character, stored in the phone_birdy_* tables created on
-- resource start.
return {
    -- New profiles start unverified. Flip to true to hand everyone the blue
    -- check, or set verified = 1 per-citizenid in phone_birdy_profiles.
    DefaultVerified = false,

    -- Max length of a post / reply body. Mirrors the React composer's
    -- maxLength so client and server agree.
    MaxPostLength = 280,

    -- Max length of a direct message.
    MaxDmLength = 500,

    -- Posts returned per feed load (newest first).
    FeedLimit = 50,

    -- Days of post history the Search tab's trending-hashtag counts look at.
    TrendingWindowDays = 7,

    -- Notifications returned per alerts-tab load.
    NotificationLimit = 50,

    -- Account field bounds, mirrored by the React register/login forms.
    MaxNameLength     = 32,
    MinHandleLength   = 2,
    MaxHandleLength   = 15,
    MinPasswordLength = 4,
    MaxPasswordLength = 64,
    MaxBioLength      = 160,
}
