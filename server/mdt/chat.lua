---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table MDT permissions (server.mdt.access): identity, the read gate, the audience.
local access = require 'server.mdt.access'
---@type table Shared server helpers (server.util): envelopes, string caps, rate limiting, ids.
local util   = require 'server.util'
---@type table Job bridge (bridge.server.job): the department a push recipient belongs to.
local job    = require 'bridge.server.job'

---@type table Chat module; the table returned at end of file. The channel lives entirely in
---memory: no table is read or written by anything in this file.
local chat = {}

---@type table Channel settings (configs/mdt.lua Chat).
local C = config.Mdt.Chat or {}

---@type integer Transmissions one department's channel holds before the oldest drops off.
local MAX_MESSAGES = math.max(1, math.floor(tonumber(C.MaxMessages) or 50))

---@type integer Longest accepted transmission, in characters.
local MAX_LENGTH = math.max(1, math.floor(tonumber(C.MaxLength) or 300))

---@type integer Rolling rate-limit window, in milliseconds.
local RATE_WINDOW = math.max(1000, math.floor(tonumber(C.RateWindow) or 60000))

---@type integer Transmissions one officer may send inside a window.
local RATE_MAX = math.max(1, math.floor(tonumber(C.RateMax) or 20))

---@type string Client event every open terminal appends a transmission from.
local CHAT_EVENT = 'sd-phone:client:mdt:chat'

---@type table<string, table[]> Ring buffer of transmissions, keyed by framework job name.
local channels = {}

---@type integer Monotonic counter behind the generated message id.
local seq = 0

---A department's channel, created empty on first use.
---@param department string framework job name
---@return table[] messages oldest first
local function channelOf(department)
    local rows = channels[department]
    if not rows then
        rows = {}
        channels[department] = rows
    end
    return rows
end

---The traffic the caller's department channel still holds, oldest first.
chat.history = access.gated('chat.view', function(_src, _payload, me)
    return util.ok({ messages = channelOf(me.job) })
end)

---Transmits on the caller's department channel. The byline is stamped from the caller's identity,
---never from the payload, and only that department's terminals are pushed to.
chat.send = access.gated('chat.send', function(_src, payload, me)
    local body = util.limitedString(payload.body, MAX_LENGTH)
    if not body then return util.fail('mdt.writeSomethingFirst', 'Write something first') end
    if not util.rateLimit(me.citizenid, 'mdt:chat:send', RATE_WINDOW, RATE_MAX) then
        return util.fail('mdt.slowDown', 'Slow down')
    end

    seq = seq + 1
    local message = {
        id        = ('m%d%s'):format(seq, util.newId(4)),
        citizenid = me.citizenid,
        name      = me.name,
        callsign  = me.callsign,
        avatar    = me.avatar,
        body      = body,
        createdAt = os.time(),
    }

    local rows = channelOf(me.job)
    rows[#rows + 1] = message
    while #rows > MAX_MESSAGES do table.remove(rows, 1) end

    for _, src in ipairs(access.audience()) do
        if job.getName(src) == me.job then
            TriggerClientEvent(CHAT_EVENT, src, { message = message })
        end
    end

    return util.ok({ message = message })
end)

return chat
