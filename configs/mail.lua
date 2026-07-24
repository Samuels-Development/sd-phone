-- Mail app - iOS-style email between players. Accounts are globally
-- addressable (one row per email) with a password gate, so any player who
-- knows the credentials can log into the account on their own phone. Sessions
-- persist by citizenid so reconnecting doesn't sign you out.
return {
    -- The one email domain players register under. Sign-up asks for the
    -- username only and the domain is appended server-side; full addresses
    -- on any other domain are rejected.
    Domain = 'lifeinvader.com',

    -- Per-player cap on simultaneously logged-in accounts. Prevents one
    -- player hoarding hundreds of inboxes.
    MaxAccountsPerPlayer = 5,

    -- Hard cap on stored messages per account. Once exceeded, the oldest
    -- messages are pruned. Tunes the JSON row size.
    MaxMessagesPerAccount = 200,

    -- Email format constraints. Min/max apply to the full "local@domain"
    -- string. The regex is intentionally permissive - anything with a `@`
    -- separator and non-empty local + host parts passes.
    MinEmailLength = 5,
    MaxEmailLength = 64,

    -- Password length constraints. Hashing is done server-side before
    -- storage; the plaintext never persists.
    MinPasswordLength = 6,
    MaxPasswordLength = 64,

    -- Display-name constraints (the "Personal" / "Work" label).
    MinNameLength = 1,
    MaxNameLength = 40,

    -- Max saved compose addresses kept per character.
    MaxSavedEmails = 100,
}
