-- Share sheet. "Nearby" share targets are players who currently have their
-- phone out (open) within `Range` metres of you.
return {
    Range      = 10.0,  -- metres
    MaxTargets = 12,

    -- How the other player is named in an AirShare: the recipient's "X would
    -- like to share a contact" prompt and the sender's "X accepted / declined"
    -- notices. When the viewer has that number saved, their own contact name
    -- is used first under 'card' and 'number'.
    --   'card'      : My Card name, else phone number, else character name.
    --                 A shared number never reveals the character behind it.
    --   'number'    : phone number, else character name. Ignores My Card names.
    --   'character' : always the character name.
    DisplayName = 'card',
}
