---@type table Detected voice backend (bridge.shared.voice): resource name + API dialect.
local backend = require 'bridge.shared.voice'

---@type string|nil Resource exports are invoked on.
local RESOURCE = backend.resource
---@type string|nil API dialect: 'pma-voice' or 'saltychat'.
local PROVIDER = backend.provider

---@type table Module table; the table returned at end of file. One API over the supported voice
---scripts for call membership and speakerphone.
local voice = {}

---@type table<number, string> Source -> the SaltyChat call identifier they are currently in.
---
---Needed because the two backends model leaving a call differently: pma-voice takes channel 0 as
---"leave whatever you were in", while SaltyChat's RemovePlayerFromCall demands the identifier of
---the call being left. Nothing else knows it by then - the phone has already torn the session
---down - so the bridge has to remember it. Unused on pma-voice.
local inCall = {}

---Detected API dialect ('pma-voice' | 'saltychat'), or nil. Read-only.
---@return string|nil
function voice.provider() return PROVIDER end

---Whether the backend has a real speakerphone of its own (SaltyChat, and AI Core's ai-voice, which
---speaks the pma-voice dialect). When false the caller has to build one, which is what the
---proximity sweep in server/calls/actions.lua is for.
---@return boolean
function voice.nativeSpeaker() return PROVIDER == 'saltychat' or RESOURCE == 'ai-voice' end

---Moves a player in or out of a call channel. Channel 0 leaves.
---
---SaltyChat identifies calls with STRINGS, so the phone's numeric channel is stringified rather
---than passed through - handing it the number joins a call nobody else is in, silently.
---@param src number player source
---@param channel number 0 to leave
---@return boolean handled
function voice.setPlayerCall(src, channel)
    if not RESOURCE then return false end
    channel = math.floor(tonumber(channel) or 0)

    if PROVIDER == 'saltychat' then
        local previous = inCall[src]
        if channel <= 0 then
            if not previous then return true end
            inCall[src] = nil
            return pcall(function() exports[RESOURCE]:RemovePlayerFromCall(previous, src) end)
        end

        local identifier = tostring(channel)
        if previous == identifier then return true end
        if previous then
            pcall(function() exports[RESOURCE]:RemovePlayerFromCall(previous, src) end)
        end
        inCall[src] = identifier
        return pcall(function() exports[RESOURCE]:AddPlayerToCall(identifier, src) end)
    end

    return pcall(function() exports[RESOURCE]:setPlayerCall(src, channel) end)
end

---Turns a player's speakerphone on or off, where the backend has one.
---@param src number player source
---@param on boolean
---@return boolean handled false when the caller must fall back to its own proximity circle
function voice.setPhoneSpeaker(src, on)
    if RESOURCE == 'ai-voice' then
        return pcall(function() exports[RESOURCE]:setPlayerCallSpeaker(src, on == true) end)
    end
    if PROVIDER ~= 'saltychat' or not RESOURCE then return false end
    return pcall(function() exports[RESOURCE]:SetPhoneSpeaker(src, on == true) end)
end

-- A player who disconnects mid-call never reaches the phone's own teardown, which would otherwise
-- leave their source keyed in the map forever and, worse, hand a recycled source the previous
-- occupant's call identifier.
AddEventHandler('playerDropped', function()
    inCall[source] = nil
end)

return voice
