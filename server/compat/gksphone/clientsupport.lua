---@type table Shared shim helpers (server.compat.gksphone.shared): text/digit sanitising.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): source -> handset identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Settings persistence layer (server.settings.store): the caller's own number.
local settings = require 'server.settings.store'
---@type table State bag publisher (server.statebags): the phone lockout a local jam uses.
local statebags = require 'server.statebags'
---@type table Call shim ops (server.compat.gksphone.calls): the shared createCall + live call read.
local calls = require 'server.compat.gksphone.calls'
---@type table Mail shim ops (server.compat.gksphone.mail): the shared sendMail implementation.
local mail = require 'server.compat.gksphone.mail'
---@type table Dispatch shim ops (server.compat.gksphone.dispatch): the shared report filer.
local dispatch = require 'server.compat.gksphone.dispatch'
---@type table Map shim ops (server.compat.gksphone.maps): the shared pin writers.
local maps = require 'server.compat.gksphone.maps'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

-- Everything here backs the gksphone compat CLIENT shim (client/compat/gksphone.lua). gksphone runs
-- these surfaces client-side; sd-phone owns them on the server, so the client half reaches across
-- through the callbacks and events below, into the same implementations the server exports use.
--
-- Every one is scoped to the CALLING player. A client event that could mail, jam or renumber an
-- arbitrary character would be an escalation any player with an executor could reach, so a
-- client-side call naming somebody else is refused in the client half and pointed at the matching
-- server export, which only another resource can call.

---Backs PhoneNumber() and PhoneUniqueId(): the caller's own number and handset id in one round
---trip, since a client asking for one almost always wants the other.
lib.callback.register('sd-phone:server:compat:gks:self', function(source)
    local identity = phones.forSource(source)
    if not identity then return nil end
    return { phoneId = identity, number = settings.ensurePhoneNumber(identity) }
end)

---Backs IsInCall() and IsCall(): whether the caller is in a call or a pending ring. The call read
---answers "no call" as a SUCCESSFUL empty envelope, so the unwrapped call itself is what decides.
lib.callback.register('sd-phone:server:compat:gks:inCall', function(source)
    return calls.currentFor(source) ~= nil
end)

---Backs CreateCall(data): places a 1:1 call, or rings a company when `data.job` is given. Answers
---with gksphone's (ok, reason) pair so the client export hands both straight back.
lib.callback.register('sd-phone:server:compat:gks:call', function(source, data)
    if type(data) ~= 'table' then return { ok = false, reason = 'invalid_data' } end

    local job = shim.text(data.job)
    if not job and not shim.digits(data.number) then
        return { ok = false, reason = 'missing_number' }
    end

    local ok = calls.createCall(source, data)
    if ok then return { ok = true } end
    return { ok = false, reason = job and 'invalid_job' or 'already_in_call' }
end)

---Backs EndCall() and CallEndCustom(): hangs up whatever call the caller is in. Idempotent.
RegisterNetEvent('sd-phone:server:compat:gks:endCall', function()
    sd:endCallFor(source)
end)

---Backs SendNewMail(MailData): mail into the caller's own mailbox.
RegisterNetEvent('sd-phone:server:compat:gks:mail', function(mailData)
    mail.sendMail(source, mailData)
end)

---Backs SendReport / SendDispatch / JobDispatch: a dispatch report from the caller, filed against
---the company they named.
RegisterNetEvent('sd-phone:server:compat:gks:report', function(payload)
    if type(payload) ~= 'table' then return end
    dispatch.fileReport(source, payload.message, payload.photo, payload.job, payload.anonymous)
end)

---Backs heavyJammer(status, message) with no handset id: jams the CALLER's own phone. The
---persistent per-handset form stays on the server export, since a client naming another handset
---could lock any player out of their phone.
RegisterNetEvent('sd-phone:server:compat:gks:jam', function(status)
    statebags.setDisabled(source, status == true)
end)

---Backs the client AddMapLocation / RemoveMapLocation / UpdateMapLocation trio, each acting on the
---caller's own Maps pins. `op` is one of add, remove, update.
RegisterNetEvent('sd-phone:server:compat:gks:map', function(op, a, b)
    local src = source
    if op == 'add' then
        maps.addLocation(src, a)
    elseif op == 'remove' then
        maps.removeLocation(src, a)
    elseif op == 'update' then
        maps.updateLocation(src, a, b)
    end
end)

---Backs Notification() and V1's SendNotification() for a payload the local banner path cannot draw
---on its own, keeping the server as the single place a gksphone notification is shaped.
RegisterNetEvent('sd-phone:server:compat:gks:notify', function(data)
    if type(data) ~= 'table' then return end
    sd:notify(source, {
        title    = shim.text(data.title) or 'Notification',
        body     = shim.text(data.message),
        image    = shim.text(data.icon) or shim.text(data.img),
        duration = tonumber(data.duration),
    })
end)
