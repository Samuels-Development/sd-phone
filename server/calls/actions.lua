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
---@type table Admin mute registry (server.admin.moderation): scope guard for dialing out.
local moderation = require 'server.admin.moderation'
---@type table Payphone persistence (server.payphone.store): booth number -> location lookups.
local payphones = require 'server.payphone.store'
---@type table Cell service (server.service): authoritative signal level per player.
local service  = require 'server.service'

---@type table Actions module; the table returned at end of file.
local actions = {}

---Whether a player can be rung at all. A server that gates the phone behind an item should not
---ring someone who is not carrying one; a server with no items configured rings everyone.
---@param src number player server id
---@return boolean
local function reachable(src)
    if #(config.Phone.Items or {}) == 0 then return true end
    return exports['sd-phone']:hasPhone(src) ~= nil
end

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

-- Pending inbound payphone rings keyed by channel; whoever answers at the booth is promoted
-- into a normal 1:1 'sessions' entry.
---@type table<number, table> { channel, location, boothNumber, caller }
local boothRings = {}

local util = require 'server.util'
local ok, fail, digits = util.ok, util.fail, util.digits



---Every live party of a session in one list: the two primary legs first, then anyone merged in.
---The order is stable so the phone can render a conference the same way twice running.
---@param s table session from `sessions`
---@return table[] parties
local function membersOf(s)
    local list = { s.caller, s.callee }
    if s.merged then
        for _, p in pairs(s.merged) do list[#list + 1] = p end
    end
    return list
end

---True when `src` is one of a session's live parties, merged third parties included.
---@param s table session from `sessions`
---@param src number
---@return boolean
local function isMember(s, src)
    if s.caller.src == src or s.callee.src == src then return true end
    return (s.merged and s.merged[src]) ~= nil
end

---Find the channel + session a source is currently part of, as either primary leg, a merged third
---party, or the one still ringing into the conference.
---@param src number
---@return number|nil channel, table|nil session
local function sessionForSource(src)
    for channel, session in pairs(sessions) do
        -- Merged third parties and the pending ringer count as being on this call: every
        -- busy-guard in this file reads through here, so leaving them out would let a merged
        -- player be dialed into a second call at the same time.
        if isMember(session, src) or (session.pending and session.pending.src == src) then
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

---Find the booth ring a source started, if any.
---@param src number
---@return number|nil channel, table|nil ring
local function boothRingForSource(src)
    for channel, ring in pairs(boothRings) do
        if ring.caller.src == src then return channel, ring end
    end
    return nil
end

---True when a source is already tied up: in a live session, in a group ring, or ringing a booth.
---Exported so callers that fan out before dialling (services.callCompany) can reject a busy caller
---up front instead of after their own expensive work.
---@param src number
---@return boolean
function actions.isBusy(src)
    return (sessionForSource(src) or ringForSource(src) or boothRingForSource(src)) ~= nil
end

---@type number Metres from a booth that its ring is sent to. The client discards a ring further
---than 50 m away (client/payphone.lua), so this is double the audible radius and every player who
---can hear a booth today still receives it.
local BOOTH_RING_RANGE = 100.0

---The players near a booth, as a set. Ringing all of them instead of the whole server keeps the
---fan-out proportional to who can actually hear the bell.
---@param location string 'x,y,z' booth key
---@return table<number, boolean> sources
local function listenersNear(location)
    local out = {}
    local x, y, z = location:match('^(-?[%d%.]+),(-?[%d%.]+),(-?[%d%.]+)$')
    if not x then return out end
    local at = vector3(tonumber(x), tonumber(y), tonumber(z))
    for _, pid in ipairs(GetPlayers()) do
        local psrc = tonumber(pid)
        local ped = psrc and GetPlayerPed(psrc)
        if ped and ped ~= 0 and #(GetEntityCoords(ped) - at) <= BOOTH_RING_RANGE then
            out[psrc] = true
        end
    end
    return out
end

---Silences a booth for exactly the players that were told it was ringing. Players move between
---the two events, so the recorded set is authoritative, not a fresh proximity scan.
---@param ring table ring from `boothRings`
local function stopBoothRing(ring)
    for lsrc in pairs(ring.heard) do
        TriggerClientEvent('sd-phone:client:payphone:ringStop', lsrc, { channel = ring.channel })
    end
end

---Stops an unanswered booth ring: silences every listening client's booth, tells the caller,
---forgets it.
---@param channel number
---@param reason string
local function cancelBoothRing(channel, reason)
    local ring = boothRings[channel]
    if not ring then return end
    boothRings[channel] = nil
    stopBoothRing(ring)
    TriggerClientEvent('sd-phone:client:call:ended', ring.caller.src, { channel = channel, reason = reason })
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

-- Speakerphone: while a participant keeps speaker on, players standing near them join the
-- pma-voice call channel (they hear AND can talk - a real speakerphone circle) and drop out
-- again when they walk away, the speaker turns off, or the call ends.
---@type number Metres a bystander may stand from a speaker-holder and stay in the circle.
local SPEAKER_RANGE = 3.0
---@type table<number, number> Speaker-enabled participant source -> their call channel.
local speakerOn = {}
---@type table<number, table<number, boolean>> Channel -> joined bystander sources.
local speakerGuests = {}
---@type boolean True while the proximity sweep thread is alive.
local speakerThreadRunning = false

---Drops every speakerphone bystander of a channel out of voice. A no-op for channels without
---guests.
---@param channel number
local function clearSpeakerGuests(channel)
    local guests = speakerGuests[channel]
    if not guests then return end
    speakerGuests[channel] = nil
    for gsrc in pairs(guests) do setVoice(gsrc, 0) end
end

---Turns a participant's speaker off, releasing the channel's guests when no other participant
---keeps it on.
---@param src number participant source
local function dropSpeaker(src)
    local channel = speakerOn[src]
    if not channel then return end
    speakerOn[src] = nil
    for _, ochan in pairs(speakerOn) do
        if ochan == channel then return end
    end
    clearSpeakerGuests(channel)
end

---One proximity sweep: computes who should currently sit in each speaker circle, then joins
---newcomers and drops leavers. Bystanders in their own call or pending ring are never pulled in.
local function sweepSpeakers()
    local want = {}
    for hsrc, channel in pairs(speakerOn) do
        local s = sessions[channel]
        if not s or s.state ~= 'active' then
            speakerOn[hsrc] = nil
        else
            local ped = GetPlayerPed(hsrc)
            if ped and ped ~= 0 then
                local at = GetEntityCoords(ped)
                want[channel] = want[channel] or {}
                for _, pidStr in ipairs(GetPlayers()) do
                    local psrc = tonumber(pidStr)
                    -- isMember rather than the two legs by hand: a merged third party is already
                    -- on the channel, and re-adding them as a speaker guest would drop them out
                    -- of voice the moment they stepped away from the speaker holder.
                    if psrc and not isMember(s, psrc)
                        and not sessionForSource(psrc) and not ringForSource(psrc) then
                        local pped = GetPlayerPed(psrc)
                        if pped and pped ~= 0 and #(GetEntityCoords(pped) - at) <= SPEAKER_RANGE then
                            want[channel][psrc] = true
                        end
                    end
                end
            end
        end
    end

    local channels = {}
    for ch in pairs(speakerGuests) do channels[ch] = true end
    for ch in pairs(want) do channels[ch] = true end
    for ch in pairs(channels) do
        local cur, desired = speakerGuests[ch] or {}, want[ch] or {}
        for gsrc in pairs(cur) do
            if not desired[gsrc] then cur[gsrc] = nil; setVoice(gsrc, 0) end
        end
        for gsrc in pairs(desired) do
            if not cur[gsrc] then cur[gsrc] = true; setVoice(gsrc, ch) end
        end
        speakerGuests[ch] = next(cur) and cur or nil
    end
end

---Enables/disables speakerphone for a call participant. The sweep thread runs only while
---someone keeps a speaker on; turning it off releases that channel's bystanders immediately.
---@param source number participant server id
---@param on boolean
function actions.setSpeaker(source, on)
    if not on then dropSpeaker(source) return end
    local s = sessionForSource(source)
    if not s or s.state ~= 'active' then return end
    speakerOn[source] = s.channel
    if speakerThreadRunning then return end
    speakerThreadRunning = true
    CreateThread(function()
        while next(speakerOn) do
            sweepSpeakers()
            Wait(1500)
        end
        speakerThreadRunning = false
    end)
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
---
---caller/callee keep meaning exactly what they always did - the two original legs - so a resource
---listening for these events reads a merged call the same way it reads any other. `merged` is
---additive and stays nil until somebody is actually conferenced in.
---@param s table session from `sessions`
---@return table
local function eventCall(s)
    local merged
    if s.merged then
        merged = {}
        for _, m in pairs(s.merged) do merged[#merged + 1] = eventParty(m) end
    end
    return {
        channel = s.channel,
        company = s.company,
        caller  = eventParty(s.caller),
        callee  = eventParty(s.callee),
        merged  = merged,
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
    speakerOn[s.caller.src] = nil
    speakerOn[s.callee.src] = nil
    clearSpeakerGuests(channel)

    local answered = s.state == 'active'
    local duration = (answered and s.startedAt) and (os.time() - s.startedAt) or 0

    -- Merged third parties are torn down first and on their own terms: they joined partway
    -- through, so their recents row is timed from when THEY answered rather than the call's own
    -- start, and their leg leaves the primary two logged exactly as a 1:1 call always was.
    if s.merged then
        for msrc, m in pairs(s.merged) do
            setVoice(msrc, 0)
            speakerOn[msrc] = nil
            TriggerClientEvent('sd-phone:client:call:ended', msrc, { channel = channel, reason = reason })
            logCall(m.cid, m.addedNumber or s.caller.number, m.addedName or s.caller.name,
                    'incoming', m.joinedAt and (os.time() - m.joinedAt) or 0)
        end
    end

    -- A third party still ringing when the call dies never joined, so it is a missed call for
    -- them and nothing at all for the conference.
    if s.pending then
        TriggerClientEvent('sd-phone:client:call:ended', s.pending.src, { channel = channel, reason = reason })
        badges.pushApp(s.pending.src, 'phone')
    end

    -- The booth side of a payphone call logs nothing; withheld numbers leave no trace anywhere.
    if s.payphoneSide ~= 'caller' then
        logCall(s.caller.cid, s.callee.number, s.callee.name, 'outgoing', duration)
    end
    if s.payphoneSide ~= 'callee' and s.caller.number ~= '' then
        logCall(s.callee.cid, s.caller.number, s.caller.name, answered and 'incoming' or 'missed', duration)
    end

    -- Only the missed-call count can have moved, and a full snapshot is seven store reads.
    if not answered then badges.pushApp(s.callee.src, 'phone') end

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

---@type number|false Seconds a live call tolerates a signal too weak to hold it, false to never drop.
local DROP_AFTER = (function()
    local cfg = config.CellTowers
    local n = cfg and cfg.DropCallsAfter
    if n == false or n == nil then return false end
    return math.max(0, tonumber(n) or 0)
end)()

---@type integer Milliseconds between coverage sweeps while at least one call is live.
local COVERAGE_MS = 2000
---@type integer Milliseconds between sweeps while nothing is connected.
local COVERAGE_IDLE_MS = 5000

---@type table<number, number> Channel -> os.time() a participant first fell below call signal.
local losingSignal = {}

---Whether one leg of a call still has the signal to hold it. A payphone leg is a landline, so it
---always does; an unresolvable player is left alone rather than cut off.
---@param party table session side, { src, cid, ... }
---@param isPayphone boolean
---@return boolean
local function legHasSignal(party, isPayphone)
    if isPayphone then return true end
    if not party or not party.src then return true end
    return service.allows(party.src, 'call')
end

---Ends a call because coverage went and tells each side whose signal was the one that went, so
---the phone can raise the dialog. Only that fact travels: the wording and its translation are the
---NUI's business.
---@param channel number
---@param s table live session
---@param callerOk boolean caller still had signal
---@param calleeOk boolean callee still had signal
local function dropForNoService(channel, s, callerOk, calleeOk)
    local caller, callee = s.caller, s.callee
    endCall(channel, 'noservice')

    if caller and caller.src then
        TriggerClientEvent('sd-phone:client:call:dropped', caller.src, { lost = not callerOk })
    end
    if callee and callee.src then
        TriggerClientEvent('sd-phone:client:call:dropped', callee.src, { lost = not calleeOk })
    end
end

-- Coverage watch. There is no event for "player walked out of range", so a live call has to be
-- looked at; the sweep is bounded by the number of connected calls rather than players, and idles
-- when nothing is up. Ringing calls are left alone: an unanswered ring ends on its own.
CreateThread(function()
    if DROP_AFTER == false then return end
    while true do
        if next(sessions) == nil then
            losingSignal = {}
            Wait(COVERAGE_IDLE_MS)
        else
            local now = os.time()
            for channel, s in pairs(sessions) do
                if s.state ~= 'active' then
                    losingSignal[channel] = nil
                else
                    local callerOk = legHasSignal(s.caller, s.payphoneSide == 'caller')
                    local calleeOk = legHasSignal(s.callee, s.payphoneSide == 'callee')
                    if callerOk and calleeOk then
                        losingSignal[channel] = nil
                    else
                        local since = losingSignal[channel] or now
                        losingSignal[channel] = since
                        if now - since >= DROP_AFTER then
                            losingSignal[channel] = nil
                            dropForNoService(channel, s, callerOk, calleeOk)
                        end
                    end
                end
            end
            Wait(COVERAGE_MS)
        end
    end
end)

---@type integer Dial budget window in ms.
local DIAL_WINDOW = 30000
---@type integer Dials allowed per window, counted even when the dial fails. Redialling a busy
---number a few times in a row is normal; nobody places ten calls in half a minute, while a
---dial/hangup loop that used to broadcast a booth ring per pass is cut to this.
local DIAL_PER_WINDOW = 10

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
    if sessionForSource(source) or ringForSource(source) or boothRingForSource(source) then return fail('You are already on a call') end
    if not util.rateLimit(cid, 'call:dial', DIAL_WINDOW, DIAL_PER_WINDOW) then return fail('Slow down') end
    if settings.isAirplane(cid) then return fail('Airplane Mode is on') end
    if not service.allows(source, 'call') then return fail('No Service') end
    local muted = moderation.guard(cid, 'calls'); if muted then return muted end

    local myNumber = settings.ensurePhoneNumber(cid)
    -- Number-dependent: no number in service (device mode with the SIM out) can't place a call.
    -- In legacy/stock a resolvable caller always has a number, so this never trips.
    if not myNumber or digits(myNumber) == '' then
        return fail('No service. Install a SIM card to place calls.')
    end
    if digits(myNumber) == dialed then return fail('You can\'t call yourself') end

    local targetCid = settings.getCitizenByNumber(dialed)
    if not targetCid then
        -- Not a player number: a payphone booth rings physically instead.
        local pcfg = config.Payphone
        if pcfg and pcfg.Enabled and pcfg.Inbound and pcfg.Inbound.Enabled ~= false then
            local location = payphones.locationForNumber(dialed)
            if location then
                local channel = nextChannel
                nextChannel = nextChannel + 1
                local heard = listenersNear(location)
                boothRings[channel] = {
                    channel     = channel,
                    location    = location,
                    boothNumber = dialed,
                    heard       = heard,
                    caller      = { src = source, cid = cid, name = player.getName(source), number = digits(myNumber) },
                }
                TriggerClientEvent('sd-phone:client:call:outgoing', source, {
                    channel = channel,
                    name    = contactNameFor(cid, dialed),
                    number  = dialed,
                })
                for lsrc in pairs(heard) do
                    TriggerClientEvent('sd-phone:client:payphone:ringStart', lsrc, { channel = channel, location = location })
                end
                local ringChannel = channel
                SetTimeout(tonumber(pcfg.Inbound.RingTimeout) or 30000, function()
                    cancelBoothRing(ringChannel, 'no-answer')
                end)
                return ok({ channel = channel })
            end
        end
        return fail('Number not in service')
    end

    -- Any-phone resolver: a call rings the target even when the dialed number sits on the
    -- OTHER phone in their pocket (unlike UI pushes, which only land on the active phone).
    local targetSrc = player.getAnySourceByIdentifier(targetCid)
    if not targetSrc then return fail('This number is currently unavailable') end
    if not reachable(targetSrc) then return fail('This number is currently unavailable') end
    if settings.isAirplane(targetCid) then return fail('This number is currently unavailable') end
    if not service.allows(targetSrc, 'call') then return fail('This number is currently unavailable') end
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

---Pushes the current conference roster to every live member, so each phone can name who else is
---on the line. Each recipient gets the OTHER members, never themselves.
---@param s table session from `sessions`
local function pushRoster(s)
    local members = membersOf(s)
    for _, me in ipairs(members) do
        local others = {}
        for _, p in ipairs(members) do
            if p.src ~= me.src then
                others[#others + 1] = {
                    name   = contactNameFor(me.cid, p.number) or p.name,
                    number = p.number,
                }
            end
        end
        TriggerClientEvent('sd-phone:client:call:roster', me.src, {
            channel = s.channel,
            others  = others,
            pending = s.pending and {
                name   = contactNameFor(me.cid, s.pending.number) or s.pending.name,
                number = s.pending.number,
            } or nil,
        })
    end
end

actions.pushRoster = pushRoster

---@type integer Most parties one conference may hold, the two original legs included. Three is
---what the phone's UI is built to name and what a voice channel stays intelligible at.
local MAX_CONFERENCE <const> = 3

---Rings a third party into a call that is already live, the conference equivalent of dial. Only a
---member of the call may add, the call has to be answered, and one add may be in flight at a time.
---The target rings on the SAME channel, so answering drops them straight into the conversation
---rather than opening a second call that then has to be merged.
---@param source number adding member's server id
---@param payload { number?: string }
---@return table
function actions.addCall(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local channel, s = sessionForSource(source)
    if not s or not channel then return fail('You are not on a call') end
    if not isMember(s, source) then return fail('You are not on a call') end
    if s.state ~= 'active' then return fail('Wait for the call to connect') end
    if s.pending then return fail('Already adding someone') end
    if #membersOf(s) >= MAX_CONFERENCE then return fail('This call is full') end

    local dialed = digits(payload.number)
    if dialed == '' then return fail('No number dialed') end
    if not util.rateLimit(cid, 'call:dial', DIAL_WINDOW, DIAL_PER_WINDOW) then return fail('Slow down') end
    if settings.isAirplane(cid) then return fail('Airplane Mode is on') end
    if not service.allows(source, 'call') then return fail('No Service') end
    local muted = moderation.guard(cid, 'calls'); if muted then return muted end

    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')
    if myNumber == '' then return fail('No service. Install a SIM card to place calls.') end
    if myNumber == dialed then return fail('You can\'t add yourself') end

    -- Anyone already on this call, dialed by their own number, is the commonest mis-add and
    -- reads as "line busy" through the generic guard below, which is the wrong explanation.
    for _, p in ipairs(membersOf(s)) do
        if p.number ~= '' and p.number == dialed then return fail('They are already on this call') end
    end

    local targetCid = settings.getCitizenByNumber(dialed)
    if not targetCid then return fail('Number not in service') end

    local targetSrc = player.getAnySourceByIdentifier(targetCid)
    if not targetSrc then return fail('This number is currently unavailable') end
    if not reachable(targetSrc) then return fail('This number is currently unavailable') end
    if settings.isAirplane(targetCid) then return fail('This number is currently unavailable') end
    if not service.allows(targetSrc, 'call') then return fail('This number is currently unavailable') end
    if contacts.isBlocked(targetCid, myNumber) then return fail('This number is currently unavailable') end
    if sessionForSource(targetSrc) or ringForSource(targetSrc) or boothRingForSource(targetSrc) then return fail('Line busy') end

    s.pending = {
        src    = targetSrc,
        cid    = targetCid,
        name   = player.getName(targetSrc),
        number = dialed,
        by     = source,
    }

    TriggerClientEvent('sd-phone:client:call:incoming', targetSrc, {
        channel = channel,
        name    = contactNameFor(targetCid, myNumber),
        number  = myNumber,
    })
    pushRoster(s)

    return ok({ channel = channel })
end

---Places a 1:1 call with a caller identity that isn't the player's phone (a street payphone).
---The caller needs no phone number; the callee sees callerName/callerNumber. An empty
---callerNumber rings as withheld and leaves no recents row.
---@param source number caller server id
---@param payload { number?: string, callerName?: string, callerNumber?: string }
---@return table result { success, data = { channel } }
function actions.dialPayphone(source, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local dialed = digits(payload.number)
    if dialed == '' then return fail('No number dialed') end
    if sessionForSource(source) or ringForSource(source) then return fail('You are already on a call') end
    -- Shares the dial budget: a booth is just another way to place the same call.
    if not util.rateLimit(cid, 'call:dial', DIAL_WINDOW, DIAL_PER_WINDOW) then return fail('Slow down') end
    local muted = moderation.guard(cid, 'calls'); if muted then return muted end

    local callerNumber = digits(payload.callerNumber)
    local callerName   = tostring(payload.callerName or 'Payphone'):sub(1, 32)
    if callerNumber ~= '' and callerNumber == dialed then return fail("You can't call this payphone") end

    local targetCid = settings.getCitizenByNumber(dialed)
    if not targetCid then return fail('Number not in service') end

    local targetSrc = player.getAnySourceByIdentifier(targetCid)
    if not targetSrc then return fail('This number is currently unavailable') end
    if not reachable(targetSrc) then return fail('This number is currently unavailable') end
    if settings.isAirplane(targetCid) then return fail('This number is currently unavailable') end
    if not service.allows(targetSrc, 'call') then return fail('This number is currently unavailable') end
    if callerNumber ~= '' and contacts.isBlocked(targetCid, callerNumber) then return fail('This number is currently unavailable') end
    if sessionForSource(targetSrc) or ringForSource(targetSrc) then return fail('Line busy') end

    local channel = nextChannel
    nextChannel = nextChannel + 1

    sessions[channel] = {
        channel   = channel,
        state     = 'ringing',
        startedAt = nil,
        payphoneSide = 'caller',
        caller    = { src = source,    cid = cid,       name = callerName,                number = callerNumber },
        callee    = { src = targetSrc, cid = targetCid, name = player.getName(targetSrc), number = dialed },
    }

    TriggerClientEvent('sd-phone:client:payphone:outgoing', source, { channel = channel, number = dialed })
    TriggerClientEvent('sd-phone:client:call:incoming', targetSrc, {
        channel = channel,
        name    = (callerNumber ~= '' and contactNameFor(targetCid, callerNumber)) or callerName,
        number  = callerNumber,
    })

    TriggerEvent('sd-phone:server:call:started', eventCall(sessions[channel]))

    return ok({ channel = channel })
end

---Promotes a ringing booth into a live 1:1 call: the answering player becomes the callee with
---the booth's identity, both sides join voice, and the ring stops everywhere.
---@param source number answering player server id
---@param channel number ringing booth channel
---@return table result { success, data = { channel, number, callerName } }
function actions.answerBoothRing(source, channel)
    local ring = boothRings[tonumber(channel) or -1]
    if not ring then return fail('This phone has stopped ringing') end
    if ring.caller.src == source then return fail("You can't answer your own call") end
    if sessionForSource(source) or ringForSource(source) then return fail('You are already on a call') end

    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    boothRings[ring.channel] = nil
    stopBoothRing(ring)

    sessions[ring.channel] = {
        channel      = ring.channel,
        state        = 'active',
        startedAt    = os.time(),
        payphoneSide = 'callee',
        caller       = ring.caller,
        callee       = { src = source, cid = cid, name = (config.Payphone and config.Payphone.CallerLabel) or 'Payphone', number = ring.boothNumber },
    }

    setVoice(ring.caller.src, ring.channel)
    setVoice(source, ring.channel)
    TriggerClientEvent('sd-phone:client:call:connected', ring.caller.src, { channel = ring.channel })

    TriggerEvent('sd-phone:server:call:started', eventCall(sessions[ring.channel]))

    return ok({ channel = ring.channel, number = ring.boothNumber, callerName = ring.caller.name })
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
    if not service.allows(source, 'call') then return fail('No Service') end

    local myNumber = digits(settings.ensurePhoneNumber(cid))

    local ringTargets = {}
    for _, t in ipairs(targets) do
        if t.src and t.src ~= source
            and not sessionForSource(t.src) and not ringForSource(t.src)
            and not settings.isAirplane(t.cid) and reachable(t.src)
            and service.allows(t.src, 'call') then
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

    -- Conference join: the call is already up and this is the third party being added to it, so
    -- there is no state change to make - they simply come onto the channel everyone else is on.
    if s.pending and s.pending.src == source then
        local joiner = s.pending
        s.pending = nil
        joiner.joinedAt = os.time()
        -- Who they answered, kept for their recents row: the conference outlives whoever added
        -- them, so reading it back off the session at teardown could name someone who has left.
        joiner.addedName   = s.caller.name
        joiner.addedNumber = s.caller.number

        s.merged = s.merged or {}
        s.merged[source] = joiner

        setVoice(source, channel)
        TriggerClientEvent('sd-phone:client:call:connected', source, { channel = channel })

        -- Video is two-ended and peerSrc stops resolving the moment a conference forms, so any
        -- picture already running has to be closed rather than left on a frame that will never
        -- update again. Harmless for the two originals when no video was up.
        TriggerClientEvent('sd-phone:client:call:video:stop', s.caller.src)
        TriggerClientEvent('sd-phone:client:call:video:stop', s.callee.src)

        pushRoster(s)

        local call = eventCall(s)
        call.startedAt = s.startedAt
        call.joined    = eventParty(joiner)
        TriggerEvent('sd-phone:server:call:merged', call)

        return ok({ channel = channel })
    end

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

    -- A third party turning down a conference invite leaves the original call untouched: only
    -- the invite is cancelled, and the members are told so the "adding..." row clears.
    if s.pending and s.pending.src == source then
        local declined = s.pending
        s.pending = nil
        TriggerClientEvent('sd-phone:client:call:ended', source, { channel = channel, reason = 'declined' })
        logCall(declined.cid, s.caller.number, s.caller.name, 'missed', 0)
        badges.pushApp(source, 'phone')
        pushRoster(s)
        return ok()
    end

    if s.callee.src ~= source then return fail('Not your call') end

    endCall(channel, 'declined', source)
    return ok()
end

---Removes a merged third party from a live conference without touching the call itself: they drop
---out of voice, the remaining members keep talking, and their recents row is written now rather
---than at teardown. No-op unless `src` really is merged into `s`.
---@param s table session from `sessions`
---@param src number leaving member's server id
---@param reason string
---@return boolean left true when someone was actually removed
local function leaveConference(s, src, reason)
    local m = s.merged and s.merged[src]
    if not m then return false end

    s.merged[src] = nil
    if next(s.merged) == nil then s.merged = nil end

    setVoice(src, 0)
    dropSpeaker(src)
    TriggerClientEvent('sd-phone:client:call:ended', src, { channel = s.channel, reason = reason })
    logCall(m.cid, m.addedNumber or s.caller.number, m.addedName or s.caller.name,
            'incoming', m.joinedAt and (os.time() - m.joinedAt) or 0)
    pushRoster(s)

    local call = eventCall(s)
    call.left = eventParty(m)
    TriggerEvent('sd-phone:server:call:left', call, src)
    return true
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

    local bring = channel and boothRings[channel]
    if bring and bring.caller.src == source then
        cancelBoothRing(channel, 'hangup')
        return ok()
    end

    local s = channel and sessions[channel]
    if not s then return ok() end

    -- A third party hanging up is the same thing as declining the invite.
    if s.pending and s.pending.src == source then
        return actions.decline(source, payload)
    end

    -- A merged member leaves; the two original legs keep their call. Only an original leg
    -- hanging up ends it for everyone, which is the rule the recents logging already assumes.
    if leaveConference(s, source, 'hangup') then return ok() end

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

    local cid = player.getIdentifier(source)

    -- Being rung into a live conference looks like any other incoming call from here: the adder
    -- is who the phone should name, and the channel is the one already in progress.
    if s.pending and s.pending.src == source then
        local by = (isMember(s, s.pending.by) and s.pending.by == s.callee.src) and s.callee or s.caller
        return ok({
            channel = channel,
            phase   = 'incoming',
            number  = by.number,
            name    = contactNameFor(cid, by.number),
            elapsed = 0,
        })
    end

    local meCaller = s.caller.src == source
    local merged   = s.merged and s.merged[source]
    -- A merged third party has no opposite leg of their own, so they are titled by whoever's call
    -- they joined - the same party their ring named.
    local peer = merged and s.caller or (meCaller and s.callee or s.caller)
    local phase = s.state == 'active' and 'active' or (meCaller and 'outgoing' or 'incoming')
    local elapsed = (s.state == 'active' and s.startedAt) and (os.time() - s.startedAt) or 0

    local others = {}
    for _, p in ipairs(membersOf(s)) do
        if p.src ~= source then
            others[#others + 1] = { name = contactNameFor(cid, p.number) or p.name, number = p.number }
        end
    end

    return ok({
        channel = channel,
        phase   = phase,
        number  = peer.number,
        name    = contactNameFor(cid, peer.number),
        elapsed = elapsed,
        others  = others,
        pending = s.pending and {
            name   = contactNameFor(cid, s.pending.number) or s.pending.name,
            number = s.pending.number,
        } or nil,
    })
end

-- Video calling layers on an existing voice call: audio stays on pma-voice, the picture is a
-- peer-to-peer WebRTC stream; the server only relays signaling to the sender's session peer.

---The source of the other party in `src`'s current call, or nil outside a live 1:1 session.
---
---A conference has no single peer, and the picture is a plain two-ended WebRTC connection with
---nowhere to put a third stream, so video is refused for as long as anyone is merged in. The call
---UI hides the Video button on the same condition; this is the half that cannot be lied to.
---@param src number
---@return number|nil
local function peerSrc(src)
    local _, s = sessionForSource(src)
    if not s then return nil end
    if s.merged then return nil end
    if s.caller.src == src then return s.callee.src end
    if s.callee.src == src then return s.caller.src end
    return nil
end

---@type table<string, boolean> Signal kinds the video peer sends (web/src/apps/phone/calls/webrtc.ts).
local SIGNAL_KINDS = { offer = true, answer = true, ice = true }
---@type integer Byte ceiling on one signaling blob. A video SDP with the full codec list runs
---about 8 KB and a trickled candidate a couple of hundred bytes, so this is several times either.
local SIGNAL_BYTES = 32768
---@type integer Signal-relay budget window in ms.
local SIGNAL_WINDOW = 10000
---@type integer Relays allowed per window. One peer connection trickles a few dozen candidates
---while it negotiates and nothing afterwards, so this is many times the real burst.
local SIGNAL_PER_WINDOW = 200

---Relays a WebRTC signaling blob to the call peer. Dropped silently when the sender isn't in a
---live call, when the blob isn't the shape the video peer sends, or when it is over budget.
---@param src number
---@param payload table { kind: string, sdp?: string, candidate?: table }
function actions.videoSignal(src, payload)
    if type(payload) ~= 'table' or not SIGNAL_KINDS[payload.kind] then return end
    if not util.smallTable(payload, 16, SIGNAL_BYTES) then return end
    local peer = peerSrc(src)
    if not peer then return end
    if not util.rateLimit(player.getIdentifier(src), 'call:videoSignal', SIGNAL_WINDOW, SIGNAL_PER_WINDOW) then return end
    TriggerClientEvent('sd-phone:client:call:video:signal', peer, payload)
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
    local channel, s = sessionForSource(src)
    if channel and s then
        -- A merged third party or a pending invite dropping takes only their own leg with them;
        -- the call they joined carries on between the two originals.
        if s.pending and s.pending.src == src then
            s.pending = nil
            pushRoster(s)
            return
        end
        if leaveConference(s, src, 'disconnected') then return end
        endCall(channel, 'disconnected')
        return
    end

    local bchannel = boothRingForSource(src)
    if bchannel then cancelBoothRing(bchannel, 'disconnected'); return end

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
