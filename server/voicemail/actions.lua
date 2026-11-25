---@type table Voicemail persistence layer (server.voicemail.store): per-message row CRUD.
local store         = require 'server.voicemail.store'
---@type table Player bridge (bridge.server.player): citizenid and online-source lookups.
local player        = require 'bridge.server.player'
---@type table Settings persistence (server.settings.store): number owners, own number, caller ID.
local settings      = require 'server.settings.store'
---@type table Contacts persistence (server.contacts.store): the owner's phone book and block list.
local contacts      = require 'server.contacts.store'
---@type table Badge engine (server.badges.init): the Phone badge counts unlistened voicemails.
local badges        = require 'server.badges.init'
---@type table Notification relay (server.notifications.init): offline-safe banner delivery.
local notifications = require 'server.notifications.init'
---@type table Shared server helpers (server.util): envelopes, digits, trim, rate limits.
local util          = require 'server.util'
---@type table Media trust boundary: only the caller's just-uploaded recording may be delivered.
local mediaGuard    = require 'server.media.guard'
---@type table Voicemail offers (server.voicemail.offers): the unanswered calls a message may follow.
local offers        = require 'server.voicemail.offers'

local ok, fail = util.ok, util.fail
local digits, trim = util.digits, util.trim

---@type table Actions module; the table returned at end of file.
local actions = {}

---@type integer Voicemails returned to the phone in one list call, and the mailbox cap: the
---oldest is dropped to make room rather than the newest refused.
local MAX_PER_OWNER <const> = 50

---@type integer Longest voicemail the server will store, in seconds. The recorder stops itself
---at the same cap, so this only bounds a client that lies about how long it recorded.
local MAX_SECONDS <const> = 60

---@type integer Window the leave rate limit is measured over (ms).
local LEAVE_WINDOW <const> = 60000
---@type integer Voicemails one character may leave inside that window. Every one costs a CDN
---upload, so this is deliberately tighter than the dial limit it follows.
local LEAVE_PER_WINDOW <const> = 5

---The caller's citizenid, or nil when their character isn't loaded.
---@param src number player server id
---@return string|nil citizenid
local function cidOf(src) return player.getIdentifier(src) end

---Coerces a client-supplied voicemail id into a finite positive integer, or nil.
---@param id any client-supplied id
---@return integer|nil id
local function rowId(id)
    id = tonumber(id)
    if not id or id ~= id or id == math.huge or id == -math.huge then return nil end
    if id ~= math.floor(id) or id < 1 then return nil end
    return id
end

---The name a mailbox owner has saved for a number, or nil when it isn't in their phone book.
---Snapshotted at delivery so the row still names the caller after the contact is edited away,
---and taken from the OWNER's book rather than the caller's character name, so leaving a message
---tells the recipient nothing they could not already see on a missed call.
---@param ownerCid string mailbox owner's framework per-character id
---@param numberDigits string caller's number, digits only
---@return string|nil name
local function contactNameFor(ownerCid, numberDigits)
    if numberDigits == '' then return nil end
    local rows = contacts.listContacts(ownerCid)
    for i = 1, #rows do
        if digits(rows[i].phone) == numberDigits then return rows[i].name end
    end
    return nil
end

---Shapes a DB row into the voicemail object the Phone app renders. The owner's citizenid never
---leaves the server.
---@param row table raw phone_voicemails row
---@return table voicemail { id, number, name, url, duration, listened, date }
local function toVoicemail(row)
    return {
        id       = tostring(row.id),
        number   = row.from_number or '',
        name     = row.from_name,
        url      = row.url,
        duration = tonumber(row.duration) or 0,
        listened = util.truthy(row.listened),
        date     = os.date('!%Y-%m-%dT%H:%M:%SZ', tonumber(row.created_at)),
    }
end

---The caller's own voicemails, newest first. Always answers with an array in
---`data.voicemails`. Read-only.
---@param src number player server id
---@return table result { success, data = { voicemails = voicemail[] } }
function actions.list(src)
    local cid = cidOf(src)
    if not cid then return ok({ voicemails = {} }) end

    local rows = store.listFor(cid, MAX_PER_OWNER)
    local out = {}
    for i = 1, #rows do out[i] = toVoicemail(rows[i]) end
    return ok({ voicemails = out })
end

---Leaves a voicemail on the mailbox that owns `number`. The audio is already hosted: the URL is
---validated as an http link and capped, exactly as a Streaks photo is, because it reaches the
---server from the client that uploaded it.
---
---A message must follow an unanswered call from this caller to this number, which the calls
---module records when it offers the mailbox; without one, a crafted client could drop messages on
---any number it liked. Each such call allows one message.
---
---A caller the owner has blocked is answered with a plain success and nothing is stored. The
---mailbox would otherwise be the one place a block can be probed from: refusing here tells a
---blocked caller they are blocked rather than merely unavailable. The block is checked against
---the caller's real number even when caller ID is withheld, as a call is; withholding the number
---used to skip the check entirely.
---@param src number caller's server id
---@param payload { number?: string, url?: string, duration?: any }
---@return table result { success, message?, data? }
function actions.leave(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = cidOf(src)
    if not cid then return fail('voicemail.playerNotFound', 'Player not found') end
    if not util.rateLimit(cid, 'voicemail:leave', LEAVE_WINDOW, LEAVE_PER_WINDOW) then
        return fail('voicemail.slowDown', 'Slow down')
    end

    local url = mediaGuard.voice(cid, payload.url)
    if not url then return fail('voicemail.invalidRecording', 'Invalid recording') end

    local dialed = digits(payload.number)
    if dialed == '' then return fail('voicemail.numberNotService', 'Number not in service') end

    local ownerCid = settings.getCitizenByNumber(dialed)
    if not ownerCid then return fail('voicemail.numberNotService', 'Number not in service') end
    if ownerCid == cid then return fail('voicemail.cannotLeaveYourself', 'You cannot leave yourself a voicemail') end
    if not offers.take(cid, dialed) then
        return fail('voicemail.callFirst', 'You can only leave a voicemail after a call that was not answered')
    end

    local duration = math.floor(tonumber(payload.duration) or 0)
    if duration ~= duration or duration < 0 then duration = 0 end
    if duration > MAX_SECONDS then duration = MAX_SECONDS end

    -- Caller ID is honoured here the way it is on a call: with the number withheld the message
    -- lands anonymously, so the owner can hear it but cannot ring back.
    local realNumber = digits(settings.ensurePhoneNumber(cid) or ''):sub(1, 32)
    if realNumber ~= '' and contacts.isBlocked(ownerCid, realNumber) then return ok({ delivered = false }) end
    local fromNumber = settings.getCallerId(cid) and realNumber or ''

    -- Trimmed before the insert rather than after, so the mailbox is never briefly over its cap.
    if store.countFor(ownerCid) >= MAX_PER_OWNER then store.trim(ownerCid, MAX_PER_OWNER - 1) end

    local fromName = fromNumber ~= '' and contactNameFor(ownerCid, fromNumber) or nil
    if fromName then fromName = fromName:sub(1, 80) end

    local ts = os.time()
    local id = store.insert(ownerCid, {
        fromNumber = fromNumber,
        fromName   = fromName,
        url        = url,
        duration   = duration,
        ts         = ts,
    })
    if not id then return fail('voicemail.couldNotLeaveVoicemail', 'Could not leave a voicemail') end

    local vm = toVoicemail({
        id = id, from_number = fromNumber, from_name = fromName,
        url = url, duration = duration, listened = 0, created_at = ts,
    })

    local from = fromName or (fromNumber ~= '' and util.formatNumber(fromNumber) or nil)
    if from then
        notifications.notifyCid(ownerCid, {
            appId    = 'phone',
            titleKey = 'voicemail.voicemailTitle', title = 'Voicemail',
            bodyKey  = 'voicemail.newVoicemailFrom',
            body     = ('New voicemail from %s'):format(from),
            bodyVars = { name = from },
            time     = 'now',
        })
    else
        notifications.notifyCid(ownerCid, {
            appId    = 'phone',
            titleKey = 'voicemail.voicemailTitle', title = 'Voicemail',
            bodyKey  = 'voicemail.newVoicemailUnknown',
            body     = 'New voicemail from an unknown number',
            time     = 'now',
        })
    end

    local ownerSrc = player.getSourceByIdentifier(ownerCid)
    if ownerSrc then
        TriggerClientEvent('sd-phone:client:voicemail:new', ownerSrc, vm)
        badges.pushApp(ownerSrc, 'phone')
    end

    return ok({ delivered = true })
end

---Marks every unlistened voicemail in the caller's own mailbox as heard, which is what opening
---the Voicemail tab does, and repushes the Phone badge when anything actually changed.
---@param src number player server id
---@return table result { success, data = { changed = integer } }
function actions.seen(src)
    local cid = cidOf(src)
    if not cid then return ok({ changed = 0 }) end

    local changed = store.markListened(cid)
    if changed > 0 then badges.pushApp(src, 'phone') end
    return ok({ changed = changed })
end

---Deletes one of the caller's own voicemails. Scoped to their citizenid, so an id alone cannot
---reach another mailbox.
---@param src number player server id
---@param id any client-supplied voicemail id
---@return table result { success, message?, data? }
function actions.delete(src, id)
    local cid = cidOf(src)
    if not cid then return fail('voicemail.playerNotFound', 'Player not found') end

    local vmId = rowId(id)
    if not vmId then return fail('voicemail.missingVoicemail', 'Missing voicemail') end

    local row = store.getFor(cid, vmId)
    if not row then return fail('voicemail.voicemailNotFound', 'Voicemail not found') end
    if store.delete(cid, vmId) == 0 then return fail('voicemail.voicemailNotFound', 'Voicemail not found') end

    -- Deleting an unheard message clears it from the badge too, which is the only count that
    -- can have moved.
    if not util.truthy(row.listened) then badges.pushApp(src, 'phone') end
    return ok({ id = tostring(vmId) })
end

return actions
