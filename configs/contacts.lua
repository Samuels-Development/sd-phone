-- Contacts / Recents - the phone-book + call-log backend. Both are
-- per-character, stored in the phone_contacts / phone_calls tables created on
-- resource start.
return {
    -- Per-player cap on saved contacts. Blocks new inserts past this many
    -- (existing contacts are never auto-removed).
    MaxContactsPerPlayer = 500,

    -- Hard cap on call-log (Recents) rows per player. Once exceeded, the
    -- oldest calls are pruned so the log stays bounded.
    MaxRecents = 100,

    -- Field length bounds, mirrored by the React add / edit forms.
    MaxNameLength    = 60,
    MaxPhoneLength   = 32,
    MaxEmailLength   = 128,
    MaxAddressLength = 128,
}
