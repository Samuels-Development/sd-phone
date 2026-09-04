---@type table sd-phone config root (configs/config.lua).
local config        = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name lookups from a server id.
local player        = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone-number -> citizenid lookups.
local settings      = require 'server.settings.store'
---@type table Notifications module (server.notifications.init): offline-safe banner delivery.
local notifications = require 'server.notifications.init'
---@type table Calendar persistence layer (server.calendar.store): event + attendee row CRUD.
local store         = require 'server.calendar.store'
---@type table Shared server helpers (server.util): envelopes, string caps, rate limits.
local util          = require 'server.util'

---@type function, function Envelope builders (server.util): ok(data) / fail(key, english, vars).
local ok, fail = util.ok, util.fail

---@type table Calendar app config (config.Calendar): per-character event cap, guest cap, field caps.
local CFG = config.Calendar or require 'configs.calendar'

---@type table Actions module; the table returned at end of file. The organizer's row is the only
---copy of an event: an invitee reads it through their attendee row rather than owning a clone.
local actions = {}

---@type integer, integer Rolling save budget per character. The editor writes once per commit, so
---this only cuts a scripted flood.
local SAVE_WINDOW, SAVE_MAX = 60000, 120
---@type integer Minimum gap between two invites from the same organizer.
local INVITE_GAP_MS = 800
---@type integer, integer Rolling invite budget per organizer. Sits above the guest cap so filling
---one event never trips it, while a fan-out across many events does.
local INVITE_WINDOW, INVITE_MAX = 60000, 40
---@type integer, integer Rolling RSVP budget per attendee, so a toggled answer cannot be used to
---machine-gun the organizer with banners.
local RESPOND_WINDOW, RESPOND_MAX = 60000, 30

---@type table<string, boolean> The two answers an attendee may send. 'pending' is set by the invite
---alone and can never be posted back.
local ANSWERS = { accepted = true, declined = true }

---The acting player's citizenid, resolved from src via the player bridge.
---@param src integer player server id
---@return string|nil citizenid nil when the player can't be resolved
local function cidOf(src) return player.getIdentifier(src) end

---Coerces a client payload to a table so every field read below is safe.
---@param v any
---@return table
local function asTable(v) return type(v) == 'table' and v or {} end

---'YYYY-MM-DD' -> a short human label for a notification body ('Sep 03'). Falls back to the raw
---key when the string is not a date, which validation has already ruled out for stored events.
---@param dayKey string
---@return string label
local function dateLabel(dayKey)
    local y, m, d = tostring(dayKey or ''):match('^(%d%d%d%d)%-(%d%d)%-(%d%d)$')
    if not y then return tostring(dayKey or '') end
    return os.date('%b %d', os.time({ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 }))
end

---Tells one character's open phone to reload its calendar. A no-op when they are offline; their
---next open reads the same rows anyway.
---@param cid string recipient citizenid
---@param eventId string the event that changed
local function pushRefresh(cid, eventId)
    local src = player.getSourceByIdentifier(cid)
    if src then TriggerClientEvent('sd-phone:client:calendar:refresh', src, { eventId = eventId }) end
end

---One attendee row, projected for a viewer. The phone number goes only to the organizer: the rest
---of the guest list sees a name and an answer, the way a group chat does.
---@param row table attendee row
---@param isOrganizer boolean whether the viewer organises the event
---@return table attendee
local function serializeAttendee(row, isOrganizer)
    return {
        citizenid = row.citizenid,
        name      = row.name,
        status    = row.status,
        number    = isOrganizer and row.number or nil,
    }
end

---DB row -> the React event shape (camelCase). `mine` and `myStatus` are computed against the
---viewer, so the same row renders as an owned event for its organizer and a read-only invite for
---everyone else.
---@param row table event row (store's EVENT_SELECT projection)
---@param attendeeRows table[] the event's guest list
---@param cid string viewer citizenid
---@return table event
local function serialize(row, attendeeRows, cid)
    local isOrganizer = row.organizer == cid

    local attendees, myStatus = {}, nil
    for i = 1, #attendeeRows do
        local a = attendeeRows[i]
        attendees[i] = serializeAttendee(a, isOrganizer)
        if a.citizenid == cid then myStatus = a.status end
    end

    return {
        id            = row.id,
        dayKey        = row.day_key,
        title         = row.title,
        allDay        = util.truthy(row.all_day),
        start         = row.start_time,
        ['end']       = row.end_time,
        location      = row.location or '',
        notes         = row.notes or '',
        color         = row.color,
        organizer     = row.organizer,
        organizerName = row.organizer_name,
        mine          = isOrganizer,
        myStatus      = myStatus,
        attendees     = attendees,
    }
end

---Reads one event back for a single viewer, guest list included.
---@param id string event id
---@param cid string viewer citizenid
---@return table|nil event nil when the event is gone
local function eventFor(id, cid)
    local row = store.getEvent(id)
    if not row then return nil end
    return serialize(row, store.attendeesFor(id), cid)
end

---Everyone who should hear about a change to an event: the pending and accepted guests, with a
---declined guest left out since the event is no longer on their calendar.
---@param id string event id
---@return string[] cids attendee citizenids
local function liveAttendeeCids(id)
    local out = {}
    for _, a in ipairs(store.attendeesFor(id)) do
        if a.status ~= 'declined' then out[#out + 1] = a.citizenid end
    end
    return out
end

---Validates a client event payload against the config caps, returning the vetted field set the
---store writes. `allDay` drops both clocks, so a stored all-day event never carries a stale time.
---@param payload table client-supplied event
---@return table|nil ev vetted fields, nil when a required field is unusable
---@return table? refusal the envelope to return when ev is nil
local function vet(payload)
    local id = payload.id
    if type(id) ~= 'string' or id == '' or #id > 40 then
        return nil, fail('calendar.badEventId', 'Bad event id')
    end

    local dayKey = type(payload.dayKey) == 'string' and payload.dayKey:match('^%d%d%d%d%-%d%d%-%d%d$') or nil
    if not dayKey then return nil, fail('calendar.badEventDate', 'Bad event date') end

    local title = util.limitedString(payload.title, CFG.MaxTitleLength)
    if not title then return nil, fail('calendar.titleRequired', 'A title is required') end

    local allDay = payload.allDay == true
    local function clock(v)
        if allDay then return nil end
        local h, m = tostring(v or ''):match('^(%d%d):(%d%d)$')
        if not h or tonumber(h) > 23 or tonumber(m) > 59 then return nil end
        return h .. ':' .. m
    end

    local notes = type(payload.notes) == 'string' and payload.notes or ''
    if #notes > CFG.MaxNotesLength then notes = notes:sub(1, CFG.MaxNotesLength) end

    local color = type(payload.color) == 'string' and payload.color:match('^#%x%x%x%x%x%x$') or '#ff453a'

    return {
        id        = id,
        dayKey    = dayKey,
        title     = title,
        allDay    = allDay,
        startTime = clock(payload.start),
        endTime   = clock(payload['end']),
        location  = util.limitedString(payload.location, CFG.MaxLocationLength) or '',
        notes     = notes,
        color     = color,
    }
end

---Every event the caller should see: the ones they organise plus the invites they have not
---declined, each with its guest list. Read-only.
---@param src integer player server id
---@return table result envelope with { events }
function actions.list(src)
    local cid = cidOf(src)
    if not cid then return ok({ events = {} }) end

    local rows = store.visibleTo(cid)
    local ids = {}
    for i = 1, #rows do ids[i] = rows[i].id end
    local byEvent = store.attendeesForMany(ids)

    local events = {}
    for i = 1, #rows do
        events[i] = serialize(rows[i], byEvent[rows[i].id] or {}, cid)
    end
    return ok({ events = events })
end

---Creates or edits an event the caller organises. An id that already belongs to someone else
---writes nothing (the store guards every column on ownership), so this doubles as the edit gate.
---When a saved edit moves the title, the day or the clock, every guest is refreshed and told.
---@param src integer player server id
---@param payload any client-supplied event
---@return table result envelope with { event }
function actions.save(src, payload)
    local cid = cidOf(src)
    if not cid then return fail('calendar.playerNotFound', 'Player not found') end
    payload = asTable(payload)

    if not util.rateLimit(cid, 'calendar:save', SAVE_WINDOW, SAVE_MAX) then
        return fail('calendar.slowDown', 'Slow down a moment')
    end

    local ev, refusal = vet(payload)
    if not ev then return refusal end

    local existing = store.getEvent(ev.id)
    if existing and existing.organizer ~= cid then
        return fail('calendar.onlyOrganizerEdit', 'Only the organizer can change this event')
    end
    if not existing and store.countFor(cid) >= CFG.MaxEventsPerPlayer then
        return fail('calendar.eventLimitReached', 'Event limit reached')
    end

    local who = player.getName(src) or 'Unknown'
    store.upsert(cid, who, ev, os.time())

    local moved = existing ~= nil and (
        existing.title ~= ev.title
        or existing.day_key ~= ev.dayKey
        or existing.start_time ~= ev.startTime
        or existing.end_time ~= ev.endTime
        or util.truthy(existing.all_day) ~= ev.allDay
    )
    if moved then
        local when = dateLabel(ev.dayKey)
        for _, acid in ipairs(liveAttendeeCids(ev.id)) do
            pushRefresh(acid, ev.id)
            notifications.notifyCid(acid, {
                app = 'Calendar', appId = 'calendar', time = 'now',
                titleKey = 'calendar.appName', title = 'Calendar',
                bodyKey = 'calendar.notifUpdated',
                body = ('%s updated %s, %s'):format(who, ev.title, when),
                bodyVars = { name = who, title = ev.title, date = when },
            })
        end
    end

    return ok({ event = eventFor(ev.id, cid) })
end

---Deletes an event the caller organises, guest list included, and tells everyone who was on it.
---@param src integer player server id
---@param payload any client-supplied { id }
---@return table result envelope with { id }
function actions.remove(src, payload)
    local cid = cidOf(src)
    if not cid then return fail('calendar.playerNotFound', 'Player not found') end
    payload = asTable(payload)

    local id = payload.id
    if type(id) ~= 'string' or id == '' then return fail('calendar.badEventId', 'Bad event id') end

    local row = store.getEvent(id)
    if not row then return ok({ id = id }) end
    if row.organizer ~= cid then
        return fail('calendar.onlyOrganizerDelete', 'Only the organizer can delete this event')
    end

    local guests = liveAttendeeCids(id)
    local who    = player.getName(src) or 'The organizer'
    local when   = dateLabel(row.day_key)
    store.delete(cid, id)

    for _, acid in ipairs(guests) do
        pushRefresh(acid, id)
        notifications.notifyCid(acid, {
            app = 'Calendar', appId = 'calendar', time = 'now',
            titleKey = 'calendar.appName', title = 'Calendar',
            bodyKey = 'calendar.notifCanceled',
            body = ('%s canceled %s, %s'):format(who, row.title, when),
            bodyVars = { name = who, title = row.title, date = when },
        })
    end

    return ok({ id = id })
end

---Invites one phone number to an event the caller organises. The number is resolved to a character
---through Settings, so an unassigned number refuses rather than parking a ghost guest.
---@param src integer player server id
---@param payload any client-supplied { eventId, number, name? }
---@return table result envelope with { event }
function actions.invite(src, payload)
    local cid = cidOf(src)
    if not cid then return fail('calendar.playerNotFound', 'Player not found') end
    payload = asTable(payload)

    if not util.cooldown(cid, 'calendar:invite', INVITE_GAP_MS)
        or not util.rateLimit(cid, 'calendar:invite', INVITE_WINDOW, INVITE_MAX) then
        return fail('calendar.slowDown', 'Slow down a moment')
    end

    local id = payload.eventId
    if type(id) ~= 'string' or id == '' then return fail('calendar.badEventId', 'Bad event id') end

    local number = util.limitedString(payload.number, 24)
    local digits = number and util.digits(number) or nil
    if not digits or digits == '' then return fail('calendar.badNumber', 'That is not a phone number') end

    local row = store.getEvent(id)
    if not row then return fail('calendar.eventNotFound', 'Event not found') end
    if row.organizer ~= cid then
        return fail('calendar.onlyOrganizerInvite', 'Only the organizer can invite people')
    end

    local targetCid = settings.getCitizenByNumber(digits)
    if not targetCid then return fail('calendar.numberNoPhone', 'Nobody is using that number') end
    if targetCid == cid then return fail('calendar.cannotInviteSelf', 'You are already on this event') end

    if store.getAttendee(id, targetCid) then
        return fail('calendar.alreadyInvited', 'They are already invited')
    end
    if store.countAttendees(id) >= CFG.MaxAttendeesPerEvent then
        return fail('calendar.guestLimitReached', 'This event is at {n} guests', { n = CFG.MaxAttendeesPerEvent })
    end

    local name = util.limitedString(payload.name, 80) or number
    store.addAttendee(id, targetCid, number, name, os.time())

    local who       = player.getName(src) or 'Someone'
    local when      = dateLabel(row.day_key)
    local targetSrc = player.getSourceByIdentifier(targetCid)
    if targetSrc then
        TriggerClientEvent('sd-phone:client:calendar:invited', targetSrc, { event = eventFor(id, targetCid) })
    end
    notifications.notifyCid(targetCid, {
        app = 'Calendar', appId = 'calendar', time = 'now',
        titleKey = 'calendar.appName', title = 'Calendar',
        bodyKey = 'calendar.notifInvited',
        body = ('%s invited you to %s, %s'):format(who, row.title, when),
        bodyVars = { name = who, title = row.title, date = when },
    })

    return ok({ event = eventFor(id, cid) })
end

---Records the caller's answer to an invite. Only the invitee may answer their own row; declining an
---accepted event is how leaving works, and drops it back out of their calendar.
---@param src integer player server id
---@param payload any client-supplied { eventId, status }
---@return table result envelope with { event }
function actions.respond(src, payload)
    local cid = cidOf(src)
    if not cid then return fail('calendar.playerNotFound', 'Player not found') end
    payload = asTable(payload)

    if not util.rateLimit(cid, 'calendar:respond', RESPOND_WINDOW, RESPOND_MAX) then
        return fail('calendar.slowDown', 'Slow down a moment')
    end

    local id = payload.eventId
    if type(id) ~= 'string' or id == '' then return fail('calendar.badEventId', 'Bad event id') end
    if not ANSWERS[payload.status] then return fail('calendar.badResponse', 'Bad response') end

    local row = store.getEvent(id)
    if not row then return fail('calendar.eventNotFound', 'Event not found') end

    local attendee = store.getAttendee(id, cid)
    if not attendee then return fail('calendar.notInvited', 'You are not invited to this event') end
    if attendee.status == payload.status then return ok({ event = eventFor(id, cid) }) end

    store.setStatus(id, cid, payload.status, os.time())

    local who = player.getName(src) or attendee.name
    pushRefresh(row.organizer, id)
    if payload.status == 'accepted' then
        notifications.notifyCid(row.organizer, {
            app = 'Calendar', appId = 'calendar', time = 'now',
            titleKey = 'calendar.appName', title = 'Calendar',
            bodyKey = 'calendar.notifAccepted',
            body = ('%s accepted %s'):format(who, row.title),
            bodyVars = { name = who, title = row.title },
        })
    else
        notifications.notifyCid(row.organizer, {
            app = 'Calendar', appId = 'calendar', time = 'now',
            titleKey = 'calendar.appName', title = 'Calendar',
            bodyKey = 'calendar.notifDeclined',
            body = ('%s declined %s'):format(who, row.title),
            bodyVars = { name = who, title = row.title },
        })
    end

    return ok({ event = eventFor(id, cid) })
end

---Takes one guest off an event the caller organises, and tells them the event has left their
---calendar.
---@param src integer player server id
---@param payload any client-supplied { eventId, citizenid }
---@return table result envelope with { event }
function actions.uninvite(src, payload)
    local cid = cidOf(src)
    if not cid then return fail('calendar.playerNotFound', 'Player not found') end
    payload = asTable(payload)

    local id = payload.eventId
    if type(id) ~= 'string' or id == '' then return fail('calendar.badEventId', 'Bad event id') end
    local targetCid = payload.citizenid
    if type(targetCid) ~= 'string' or targetCid == '' then return fail('calendar.badGuest', 'Bad guest') end

    local row = store.getEvent(id)
    if not row then return fail('calendar.eventNotFound', 'Event not found') end
    if row.organizer ~= cid then
        return fail('calendar.onlyOrganizerInvite', 'Only the organizer can invite people')
    end

    local attendee = store.getAttendee(id, targetCid)
    if not attendee then return ok({ event = eventFor(id, cid) }) end

    store.removeAttendee(id, targetCid)

    if attendee.status ~= 'declined' then
        local who = player.getName(src) or 'The organizer'
        pushRefresh(targetCid, id)
        notifications.notifyCid(targetCid, {
            app = 'Calendar', appId = 'calendar', time = 'now',
            titleKey = 'calendar.appName', title = 'Calendar',
            bodyKey = 'calendar.notifRemoved',
            body = ('%s removed you from %s'):format(who, row.title),
            bodyVars = { name = who, title = row.title },
        })
    end

    return ok({ event = eventFor(id, cid) })
end

return actions
