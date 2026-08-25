-- Call recording. Either party can record a call, and the other side is NOT told: a character
-- who knows they are being recorded does not incriminate themselves, and informing them would
-- remove the only thing the feature is for.
--
-- It ships OFF, and it is worth understanding what you are switching on before you do.
--
-- The audio is a real person's real microphone, so it is personal data wherever your players
-- live. Nothing here creates a new capability - anyone can already record a call with OBS, and
-- the far party's voice arrives as game audio either way - but it does put those recordings on
-- your server, which makes them yours to account for.
--
-- What makes that defensible is disclosure and a retention limit, not an in-call warning: say in
-- your rules that phone calls may be recorded in character and kept for a period, and leave
-- KeepDays finite. Every recording is visible and deletable in the admin panel, so there is an
-- audit trail rather than a private stash. None of this is legal advice.
return {
    -- Master switch. With this off the Record button never appears, the server refuses uploads,
    -- and the Recordings tab hides itself.
    Enabled = true,

    -- Longest single recording. The recorder stops itself at the cap and uploads what it has,
    -- rather than dropping the lot for going over.
    MaxMinutes = 10,

    -- Days a recording is kept before the prune sweep drops it. 0 keeps them forever, which
    -- means the storage bill grows forever too.
    KeepDays = 30,

    -- Most recordings one character may hold. The oldest is dropped to make room.
    MaxPerPlayer = 50,
}
