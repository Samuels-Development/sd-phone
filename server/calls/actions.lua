---@type table Player bridge (bridge.server.player): citizenid/name/source lookups.
local player   = require 'bridge.server.player'
---@type table Settings persistence (server.settings.store): phone numbers, airplane mode, number-owner lookups.
local settings = require 'server.settings.store'
---@type table Contacts persistence (server.contacts.store): contact rows, recents log, block list.
local contacts = require 'server.contacts.store'
---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Badge engine (server.badges.init): server-authoritative unread badge pushes.
local badges   = require 'server.badges.init'

---@type table Actions module; the table returned at end of file.
local actions = {}

-- Live call state is transient and in-memory; only a finished call is persisted. Channels
-- double as pma-voice call channels, handed out monotonically from 1000.
---@type table<number, table> Active 1:1 sessions keyed by channel: { channel, state ('ringing'|'active'), startedAt, caller, callee, company? (display name when promoted from a group ring) }.
local sessions = {}
---@type number Next pma-voice call channel to hand out.
local nextChannel = 1000

-- Pending "ring everyone" group calls keyed by channel; the first to accept is promoted into
-- a normal 1:1 `sessions` entry and the rest are cancelled.
---@type table<number, table> Pending group rings keyed by channel: { channel, caller, targets = { [src] = callee }, display }.
local groupRings = {}

local util = require 'server.util'
local ok, fail, digits = util.ok, util.fail, util.digits



---Find the channel + session a source is currently part of (as caller or callee).
---@param src number
---@return number|nil channel, table|nil session
local function sessionForSource(src)
    for channel, session in pairs(sessions) do
        if session.caller.src == src or session.callee.src == src then
            return channel, session
        end
    end
    return nil
end

---Find the group ring (+ channel) a source belongs to, as the caller or a ringer.
---@param src number
---@return number|nil channel, table|nil ring
local function ringForSource(src)
    for channel, ring in pairs(groupRings) do
        if ring.caller.src == src or ring.targets[src] then return channel, ring end
    end
    return nil
end

---Resolves a number to a saved-contact name for a given owner, or nil.
---@param citizenid string|nil
---@param numberDigits string
---@return string|nil
local function contactNameFor(citizenid, numberDigits)
    if not citizenid then return nil end
    local rows = contacts.listContacts(citizenid)
    for i = 1, #rows do
        if digits(rows[i].phone) == numberDigits then return rows[i].name end
    end
    return nil
end

---Moves a player in/out of a pma-voice call channel, pcall-guarded.
---@param src number
---@param channel number
local function setVoice(src, channel)
    pcall(function() exports['pma-voice']:setPlayerCall(src, channel) end)
end

---Persists one side of a finished call to its owner's recents log, pruning to the configured
---cap.
---@param citizenid string
---@param number string
---@param name string|nil
---@param direction string
---@param duration number
local function logCall(citizenid, number, name, direction, duration)
    contacts.insertCall(contacts.newId(), citizenid, {
        number    = number,
        name      = name,
        direction = direction,
        duration  = duration,
        calledAt  = os.time(),
    })
    contacts.pruneCalls(citizenid, config.Contacts.MaxRecents)
end

---Reshapes one stored call party for a first-party lifecycle event payload: src/cid become
---source/citizenid on a fresh copy. Nil in, nil out.
---@param p { src: number, cid: string, name: string, number: string }|nil
---@return { source: number, citizenid: string, name: string, number: string }|nil
local function eventParty(p)
    if not p then return nil end
    return { source = p.src, citizenid = p.cid, name = p.name, number = p.number }
end

---Builds the shared payload for the first-party 'sd-phone:server:call:*' lifecycle events from
---a stored session table. company is nil on a plain 1:1 call.
---@param s table session from `sessions`
---@return table
local function eventCall(s)
    return {
        channel = s.channel,
        company = s.company,
        caller  = eventParty(s.caller),
        callee  = eventParty(s.callee),
    }
end

---Ring variant of eventCall for an unanswered group ring: callee stays nil, company is the
---ring's display name, targets lists everyone still ringing.
---@param ring table ring from `groupRings`
---@return table
local function eventRing(ring)
    local targets = {}
    for _, t in pairs(ring.targets) do targets[#targets + 1] = eventParty(t) end
    return {
        channel = ring.channel,
        company = ring.display.name,
        caller  = eventParty(ring.caller),
        targets = targets,
    }
end

---Tears a call down: drops both sides from voice, persists both recents rows, notifies both
---clients, and fires the 'sd-phone:server:call:ended' lifecycle event. Idempotent.
---@param channel number
---@param reason string
---@param endedBy number|nil source that caused the teardown, nil when it came from a disconnect
local function endCall(channel, reason, endedBy)
    local s = sessions[channel]
    if not s then return end
    sessions[channel] = nil

    if s.state == 'active' then
        setVoice(s.caller.src, 0)
        setVoice(s.callee.src, 0)
    end

    local answered = s.state == 'active'
    local duration = (answered and s.startedAt) and (os.time() - s.startedAt) or 0

    logCall(s.caller.cid, s.callee.number, s.callee.name, 'outgoing', duration)
    logCall(s.callee.cid, s.caller.number, s.caller.name, answered and 'incoming' or 'missed', duration)

    if not answered then badges.push(s.callee.src) end

    TriggerClientEvent('sd-phone:client:call:ended', s.caller.src, { channel = channel, reason = reason })
    TriggerClientEvent('sd-phone:client:call:ended', s.callee.src, { channel = channel, reason = reason })

    -- Server-local lifecycle event: the call ended.
    local call = eventCall(s)
    call.answered = answered
    call.duration = duration
    call.reason   = reason
    TriggerEvent('sd-phone:server:call:ended', call, endedBy)
end

actions.endCall = endCall

---Starts a call to a dialed number. Rejects when the caller is mid-call/ring or in airplane
---mode, the number is unassigned, or the callee is unreachable, blocked, or busy.
---@param source number caller server id
---@param payload { number?: string }
---@return table
function actions.dial(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local dialed = digits(payload.number)
    if dialed == '' then return fail('No number dialed') end
    if sessionForSource(source) or ringForSource(source) then return fail('You are already on a call') end
    if settings.isAirplane(cid) then return fail('Airplane Mode is on') end

    local myNumber = settings.ensurePhoneNumber(cid)
    if myNumber and digits(myNumber) == dialed then return fail('You can\'t call yourself') end

    local targetCid = settings.getCitizenByNumber(dialed)
    if not targetCid then return fail('Number not in service') end

    local targetSrc = player.getSourceByIdentifier(targetCid)
    if not targetSrc then return fail('This number is currently unavailable') end
    if settings.isAirplane(targetCid) then return fail('This number is currently unavailable') end
    if contacts.isBlocked(targetCid, digits(myNumber)) then return fail('This number is currently unavailable') end
    if sessionForSource(targetSrc) or ringForSource(targetSrc) then return fail('Line busy') end

    local channel = nextChannel
    nextChannel = nextChannel + 1

    sessions[channel] = {
        channel   = channel,
        state     = 'ringing',
        startedAt = nil,
        caller    = { src = source,    cid = cid,       name = player.getName(source),    number = digits(myNumber) },
        callee    = { src = targetSrc, cid = targetCid, name = player.getName(targetSrc), number = dialed },
    }

    TriggerClientEvent('sd-phone:client:call:outgoing', source, {
        channel = channel,
        name    = contactNameFor(cid, dialed),
        number  = dialed,
    })
    TriggerClientEvent('sd-phone:client:call:incoming', targetSrc, {
        channel = channel,
        name    = contactNameFor(targetCid, sessions[channel].caller.number),
        number  = sessions[channel].caller.number,
    })

    -- Server-local lifecycle event: a 1:1 call started ringing.
    TriggerEvent('sd-phone:server:call:started', eventCall(sessions[channel]))

    return ok({ channel = channel })
end

---Rings a set of recipients at once (server-side callers only). Unavailable recipients are
---filtered out; the first to accept is connected and the rest are cancelled.
---@param source number caller server id
---@param targets { src: number, cid: string }[] server-built recipient list
---@param displayName string what the caller sees they're calling (e.g. 'Police')
---@param displayNumber? string
---@return table
function actions.callGroup(source, targets, displayName, displayNumber)
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end
    if sessionForSource(source) or ringForSource(source) then return fail('You are already on a call') end
    if settings.isAirplane(cid) then return fail('Airplane Mode is on') end

    local myNumber = digits(settings.ensurePhoneNumber(cid))

    local ringTargets = {}
    for _, t in ipairs(targets) do
        if t.src and t.src ~= source
            and not sessionForSource(t.src) and not ringForSource(t.src)
            and not settings.isAirplane(t.cid) then
            ringTargets[t.src] = {
                src    = t.src,
                cid    = t.cid,
                name   = player.getName(t.src),
                number = digits(settings.getPhoneNumber(t.cid)),
            }
        end
    end
    if next(ringTargets) == nil then return fail('No one is available right now') end

    local channel = nextChannel
    nextChannel = nextChannel + 1
    groupRings[channel] = {
        channel = channel,
        caller  = { src = source, cid = cid, name = player.getName(source), number = myNumber },
        targets = ringTargets,
        display = { name = displayName, number = digits(displayNumber) },
    }

    TriggerClientEvent('sd-phone:client:call:outgoing', source, {
        channel = channel, name = displayName, number = digits(displayNumber),
    })
    for tsrc, t in pairs(ringTargets) do
        TriggerClientEvent('sd-phone:client:call:incoming', tsrc, {
            channel = channel,
            name    = contactNameFor(t.cid, myNumber),
            number  = myNumber,
        })
    end

    -- Server-local lifecycle event: a company/group ring started.
    TriggerEvent('sd-phone:server:call:started', eventRing(groupRings[channel]))

    return ok({ channel = channel })
end

---Callee answers. On a group ring the first acceptor is promoted into an active session and
---every other ringer is cancelled. Joins both sides to the pma-voice channel.
---@param source number
---@param payload { channel?: number }
---@return table
function actions.accept(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local channel = tonumber(payload.channel)

    local ring = channel and groupRings[channel]
    if ring then
        local t = ring.targets[source]
        if not t then return fail('Call no longer active') end
        groupRings[channel] = nil
        for other in pairs(ring.targets) do
            if other ~= source then
                TriggerClientEvent('sd-phone:client:call:ended', other, { channel = channel, reason = 'answered' })
            end
        end
        sessions[channel] = {
            channel = channel, state = 'active', startedAt = os.time(),
            company = ring.display.name,
            caller  = ring.caller,
            callee  = {
                src    = t.src, cid = t.cid,
                name   = ring.display.name,
                number = ring.display.number ~= '' and ring.display.number or t.number,
            },
        }
        setVoice(ring.caller.src, channel)
        setVoice(t.src, channel)
        TriggerClientEvent('sd-phone:client:call:connected', ring.caller.src, { channel = channel })
        TriggerClientEvent('sd-phone:client:call:connected', t.src, { channel = channel })

        -- Server-local lifecycle event: the group ring was answered.
        local s = sessions[channel]
        local call = eventCall(s)
        call.startedAt = s.startedAt
        TriggerEvent('sd-phone:server:call:answered', call)

        return ok({ channel = channel })
    end

    local s = channel and sessions[channel]
    if not s then return fail('Call no longer active') end
    if s.callee.src ~= source then return fail('Not your call') end
    if s.state ~= 'ringing' then return fail('Call not ringing') end

    s.state = 'active'
    s.startedAt = os.time()

    setVoice(s.caller.src, channel)
    setVoice(s.callee.src, channel)

    TriggerClientEvent('sd-phone:client:call:connected', s.caller.src, { channel = channel })
    TriggerClientEvent('sd-phone:client:call:connected', s.callee.src, { channel = channel })

    -- Server-local lifecycle event: the call was answered.
    local call = eventCall(s)
    call.startedAt = s.startedAt
    TriggerEvent('sd-phone:server:call:answered', call)

    return ok({ channel = channel })
end

---Callee declines. On a group ring a decline drops that recipient; the last decline tears the
---ring down. On a 1:1 session only the callee may decline. Unknown channels return success.
---@param source number
---@param payload { channel?: number }
---@return table
function actions.decline(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local channel = tonumber(payload.channel)

    local ring = channel and groupRings[channel]
    if ring then
        if ring.targets[source] then
            ring.targets[source] = nil
            TriggerClientEvent('sd-phone:client:call:ended', source, { channel = channel, reason = 'declined' })
            if next(ring.targets) == nil then
                groupRings[channel] = nil
                TriggerClientEvent('sd-phone:client:call:ended', ring.caller.src, { channel = channel, reason = 'unavailable' })
                logCall(ring.caller.cid, ring.display.number ~= '' and ring.display.number or ring.display.name,
                        ring.display.name, 'outgoing', 0)

                -- Server-local lifecycle event: the group ring ended unanswered.
                local call = eventRing(ring)
                call.answered = false
                call.duration = 0
                call.reason   = 'declined'
                TriggerEvent('sd-phone:server:call:ended', call, source)
            end
        end
        return ok()
    end

    local s = channel and sessions[channel]
    if not s then return ok() end
    if s.callee.src ~= source then return fail('Not your call') end

    endCall(channel, 'declined', source)
    return ok()
end

---Either party hangs up. A group-ring caller hanging up cancels the whole ring; a recipient
---hanging up is a decline. Unknown channels return success.
---@param source number
---@param payload { channel?: number }
---@return table
function actions.hangup(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local channel = tonumber(payload.channel)

    local ring = channel and groupRings[channel]
    if ring then
        if ring.caller.src == source then
            groupRings[channel] = nil
            for tsrc in pairs(ring.targets) do
                TriggerClientEvent('sd-phone:client:call:ended', tsrc, { channel = channel, reason = 'hangup' })
            end
            TriggerClientEvent('sd-phone:client:call:ended', source, { channel = channel, reason = 'hangup' })
            logCall(ring.caller.cid, ring.display.number ~= '' and ring.display.number or ring.display.name,
                    ring.display.name, 'outgoing', 0)

            -- Server-local lifecycle event: the caller cancelled the ring.
            local call = eventRing(ring)
            call.answered = false
            call.duration = 0
            call.reason   = 'hangup'
            TriggerEvent('sd-phone:server:call:ended', call, source)
        elseif ring.targets[source] then
            return actions.decline(source, payload)
        end
        return ok()
    end

    local s = channel and sessions[channel]
    if not s then return ok() end
    if s.caller.src ~= source and s.callee.src ~= source then return fail('Not your call') end

    endCall(channel, 'hangup', source)
    return ok()
end

---Reports the caller's live call (or pending group ring) from their own perspective, or nil.
---Read-only and scoped to src's own session.
---@param source number
---@return table
function actions.current(source)
    local channel, s = sessionForSource(source)
    if not s then
        local rchannel, ring = ringForSource(source)
        if ring then
            if ring.caller.src == source then
                return ok({ channel = rchannel, phase = 'outgoing',
                            number = ring.display.number, name = ring.display.name, elapsed = 0 })
            end
            return ok({ channel = rchannel, phase = 'incoming',
                        number = ring.caller.number,
                        name   = contactNameFor(player.getIdentifier(source), ring.caller.number), elapsed = 0 })
        end
        return ok(nil)
    end

    local meCaller = s.caller.src == source
    local peer = meCaller and s.callee or s.caller
    local phase = s.state == 'active' and 'active' or (meCaller and 'outgoing' or 'incoming')
    local elapsed = (s.state == 'active' and s.startedAt) and (os.time() - s.startedAt) or 0

    return ok({
        channel = channel,
        phase   = phase,
        number  = peer.number,
        name    = contactNameFor(player.getIdentifier(source), peer.number),
        elapsed = elapsed,
    })
end

-- Video calling layers on an existing voice call: audio stays on pma-voice, the picture is a
-- peer-to-peer WebRTC stream; the server only relays signaling to the sender's session peer.

---The source of the other party in `src`'s current call, or nil outside a live 1:1 session.
---@param src number
---@return number|nil
local function peerSrc(src)
    local _, s = sessionForSource(src)
    if not s then return nil end
    if s.caller.src == src then return s.callee.src end
    if s.callee.src == src then return s.caller.src end
    return nil
end

---Relays a WebRTC signaling blob to the call peer, verbatim. Dropped silently when the sender
---isn't in a live call.
---@param src number
---@param payload any opaque signaling blob
function actions.videoSignal(src, payload)
    local peer = peerSrc(src)
    if peer then TriggerClientEvent('sd-phone:client:call:video:signal', peer, payload) end
end

---Tell the peer this side wants to start video. Dropped silently outside a live call.
---@param src number
function actions.videoRequest(src)
    local peer = peerSrc(src)
    if peer then TriggerClientEvent('sd-phone:client:call:video:request', peer) end
end

---Tell the peer this side accepted their video request. Dropped silently outside a live call.
---@param src number
function actions.videoAccept(src)
    local peer = peerSrc(src)
    if peer then TriggerClientEvent('sd-phone:client:call:video:accept', peer) end
end

---Tell the peer this side stopped video (audio call continues). Dropped silently outside a
---live call.
---@param src number
function actions.videoStop(src)
    local peer = peerSrc(src)
    if peer then TriggerClientEvent('sd-phone:client:call:video:stop', peer) end
end

---Returns ICE servers for the browser RTCPeerConnection: Google STUN by default, plus a TURN
---relay when the sd_phone_turn_* convars are set.
---@return { iceServers: table }
function actions.iceConfig()
    local servers = { { urls = 'stun:stun.l.google.com:19302' } }
    local turn = GetConvar('sd_phone_turn_url', '')
    if turn ~= '' then
        servers[#servers + 1] = {
            urls       = turn,
            username   = GetConvar('sd_phone_turn_username', ''),
            credential = GetConvar('sd_phone_turn_credential', ''),
        }
    end
    return { iceServers = servers }
end

---Ends whatever call a dropped player was in: a live session tears down as 'disconnected', a
---dropping ring caller cancels the whole ring, and a dropping ringer is removed.
---@param src number
function actions.onDrop(src)
    local channel = sessionForSource(src)
    if channel then endCall(channel, 'disconnected'); return end

    local rchannel, ring = ringForSource(src)
    if not ring then return end
    if ring.caller.src == src then
        groupRings[rchannel] = nil
        for tsrc in pairs(ring.targets) do
            TriggerClientEvent('sd-phone:client:call:ended', tsrc, { channel = rchannel, reason = 'disconnected' })
        end

        -- Server-local lifecycle event: the ring's caller disconnected.
        local call = eventRing(ring)
        call.answered = false
        call.duration = 0
        call.reason   = 'disconnected'
        TriggerEvent('sd-phone:server:call:ended', call)
    else
        ring.targets[src] = nil
        if next(ring.targets) == nil then
            groupRings[rchannel] = nil
            TriggerClientEvent('sd-phone:client:call:ended', ring.caller.src, { channel = rchannel, reason = 'unavailable' })

            -- Server-local lifecycle event: the ring ended with nobody left to answer.
            local call = eventRing(ring)
            call.answered = false
            call.duration = 0
            call.reason   = 'unavailable'
            TriggerEvent('sd-phone:server:call:ended', call)
        end
    end
end

return actions
