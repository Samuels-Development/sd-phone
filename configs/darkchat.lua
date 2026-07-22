-- Dark Chat app - anonymous, cross-player chat rooms. Public rooms are
-- server-wide and always browsable; private rooms are created at runtime and
-- gated by a code. Messages, private rooms, memberships and nicknames persist.
return {
    -- Public rooms everyone can see and chat in. `id` must stay stable -
    -- messages are keyed by it. Add / remove / rename freely.
    PublicRooms = {
        { id = 'general', name = 'City General',    topic = 'Anything goes — keep it civil.' },
        { id = 'market',  name = 'The Black Market', topic = 'Buy, sell, trade. No questions asked.' },
        { id = 'grid',    name = 'Off the Grid',     topic = "For people who'd rather not be found." },
        { id = 'night',   name = 'Night Shift',      topic = 'Late-night crew only.' },
        { id = 'rumor',   name = 'Rumor Mill',       topic = 'What did you hear?' },
    },

    HistoryLimit             = 60,   -- messages loaded when a room is opened
    MaxMessageLength         = 300,
    MaxPrivateRoomsPerPlayer = 20,
    MinRoomNameLength        = 1,
    MaxRoomNameLength        = 30,
    MinNicknameLength        = 1,
    MaxNicknameLength        = 20,
    CodeLength               = 6,    -- generated private-room code length
    -- How long a room creator must wait between "generate new code" uses (seconds), so the
    -- code can't be spam-cycled.
    CodeRegenCooldownSeconds = 300,
}
