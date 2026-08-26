---@type table Shared shim helpers (server.compat.qssmartphone.shared): warn-once + arg sanitising.
local shim = require 'server.compat.qssmartphone.shared'
---@type table Notification delivery (server.compat.qssmartphone.notifications): the banner funnel.
local notifications = require 'server.compat.qssmartphone.notifications'
---@type table Mail delivery (server.compat.qssmartphone.mail): the system send behind the mail events.
local mail = require 'server.compat.qssmartphone.mail'
---@type table Identity translation (server.compat.qssmartphone.identify): scope + number reads.
local identify = require 'server.compat.qssmartphone.identify'
---@type table Authoritative company handlers (server.services.actions): the job inbox behind SOS.
local services = require 'server.services.actions'
---@type table Job bridge (bridge.server.job): job name + duty reads for the job-alert fan-out.
local job = require 'bridge.server.job'
---@type table Player bridge (bridge.server.player): the online roster for the job-alert fan-out.
local player = require 'bridge.server.player'

local warnOnce = shim.warnOnce

---@type table<number, true> Sources whose phone is open, tracked here because the state bag is
---already cleared by the time a drop reaches this file.
local openPhones = {}

---Whether the event being handled came from a server-side trigger rather than from a player's
---client. The dispatch events below name their own recipient, which a client must not get to pick.
---@param src any the ambient event source
---@return boolean
local function fromServer(src)
    local n = tonumber(src) or 0
    return n <= 0 or GetPlayerName(n) == nil
end

---Registers a net event that qs-smartphone answers and sd-phone cannot, so a caller's trigger is
---received rather than dropped as unregistered, and the server owner is told once what happened.
---@param name string event name, spelled exactly as qs-smartphone registers it
---@param why string what is unsupported and what happened instead
local function unsupportedEvent(name, why)
    RegisterNetEvent(name, function()
        warnOnce('event.' .. name, ('%s was triggered but %s'):format(name, why))
    end)
end

-- Inbound: the events third-party scripts trigger AT the phone.

---qs-smartphone:client:notify's server-side sibling: the legacy lockscreen notification, triggered
---by the player's own client with { head, msg, app }.
RegisterNetEvent('qs-smartphone:server:AddNotifies', function(payload)
    notifications.deliver(source, payload)
end)

---The legacy mail + Quest event, triggered from the client with { sender, subject, message, button }.
RegisterNetEvent('qs-smartphone:server:sendNewMail', function(payload)
    if type(payload) ~= 'table' then return end
    mail.send(source, payload.subject, payload.message, payload.sender, payload.button)
end)

---The PRO spelling of the same mail event.
RegisterNetEvent('phone:sendNewMail', function(payload)
    if type(payload) ~= 'table' then return end
    mail.send(source, payload.subject, payload.message, payload.sender, payload.button)
end)

---Offline mail delivery by identifier or number, which qs dispatches server-side. A client origin
---is refused: the payload names both mailbox and sender, so honouring one is mailbox injection.
RegisterNetEvent('qs-smartphone:server:sendNewMailToOffline', function(payload)
    if not fromServer(source) then
        warnOnce('event.sendNewMailToOffline.client', 'qs-smartphone:server:sendNewMailToOffline was triggered by a player\'s client and refused: it names its own recipient and its own sender, so a client origin would let any player write mail into any mailbox. Trigger it from a server script.')
        return
    end
    if type(payload) ~= 'table' then return end

    local who = payload.citizenid or payload.identifier or payload.number or payload.email
    if not who then return end
    mail.send(who, payload.subject, payload.message, payload.sender, payload.button)
end)

---The legacy Business-app dispatch: an alert to every on-duty employee of `jobName`. `alert.img`
---rides as the banner image and `alert.location` is dropped, sd-phone banners carrying no waypoint.
RegisterNetEvent('qs-smartphone:server:sendJobAlert', function(alert, jobName)
    if not fromServer(source) then
        warnOnce('event.sendJobAlert.client', 'qs-smartphone:server:sendJobAlert was triggered by a player\'s client and refused: it banners every on-duty employee of a job the caller names, so a client origin would let any player spam any job. Trigger it from a server script.')
        return
    end
    if type(alert) ~= 'table' or type(jobName) ~= 'string' or jobName == '' then return end
    if alert.location ~= nil then
        warnOnce('sendJobAlert.location', 'qs-smartphone:server:sendJobAlert alert.location is not supported; the alert was delivered as a notification without a waypoint')
    end

    for _, src in pairs(player.onlineCidMap()) do
        if job.getName(src) == jobName and job.getDuty(src) == true then
            notifications.deliver(src, {
                app   = 'business',
                title = shim.str(alert.title or jobName),
                text  = alert.message,
                image = alert.img,
            })
        end
    end
end)

---The PRO SOS net event: (job, message, type). 'location' carries JSON-encoded coords, 'message'
---carries prose. Delivered to the job's company inbox, which is the queue its employees read.
RegisterNetEvent('phone:sendSOSMessage', function(jobName, message, kind)
    if type(jobName) ~= 'string' or jobName == '' then return end

    local body = shim.str(message)
    if kind == 'location' then
        local ok, decoded = pcall(json.decode, body)
        if ok and type(decoded) == 'table' then
            body = ('SOS at %.1f, %.1f, %.1f'):format(
                tonumber(decoded.x) or 0, tonumber(decoded.y) or 0, tonumber(decoded.z) or 0)
        end
    end
    if body == '' then body = 'SOS' end

    services.messageCompany(source, { job = jobName, body = body })
end)

---The client half forwards qs-smartphone:sendJobMessage here: its payload names a JOB in the
---`phone` key rather than a number, and the documented usage sends the prose and the location as
---two triggers 300ms apart.
RegisterNetEvent('sd-phone:server:compat:qs:jobMessage', function(payload)
    if type(payload) ~= 'table' then return end
    local jobName = shim.str(payload.phone)
    if jobName == '' then return end

    local body = shim.str(payload.message)
    if payload.type == 'location' then
        local ok, decoded = pcall(json.decode, body)
        if ok and type(decoded) == 'table' then
            body = ('Location: %.1f, %.1f, %.1f'):format(
                tonumber(decoded.x) or 0, tonumber(decoded.y) or 0, tonumber(decoded.z) or 0)
        end
    end
    if body == '' then return end

    services.messageCompany(source, { job = jobName, body = body })
end)

-- Undocumented inbound events. Each is known only from a public call site, with no payload contract
-- to act on, so the name is registered (an unregistered net event is refused outright) and reports
-- itself once rather than failing silently.
unsupportedEvent('qs-smartphone:server:HasPhone',
    'sd-phone answers phone ownership through exports["sd-phone"]:hasPhone(source), which an event cannot return a value to')
unsupportedEvent('qs-smartphone:server:SendMessage',
    'its payload shape was never documented; send texts with exports["sd-phone"]:sendSystemMessage or the SendNewMessageFromApp shim')
unsupportedEvent('qs-smartphone:server:CallContact',
    'its payload shape was never documented; start calls with exports["sd-phone"]:startCall(source, number)')
unsupportedEvent('qs-smartphone:server:AnswerCall',
    'sd-phone answers a call from the ringing phone\'s own UI and exposes no server-side accept')
unsupportedEvent('qs-smartphone:server:CancelCall',
    'end a call with exports["sd-phone"]:endCallFor(source) instead')
unsupportedEvent('qs-smartphone:server:SetCallState',
    'sd-phone owns call state authoritatively and accepts no external writes to it')
unsupportedEvent('qs-smartphone:server:GetAlertsJobs',
    'sd-phone has no alert-job registry; its company directory lives in configs/services.lua')
unsupportedEvent('qs-smartphone:server:GetCurrentLawyers',
    'sd-phone has no lawyer registry; read on-duty employees of the job through the Services app instead')
unsupportedEvent('qs-smartphone:server:SendFakeNUmber',
    'sd-phone has no fake-number DLC, so there is no alternate number to send from')
unsupportedEvent('qs-smartphone:server:uberPay',
    'sd-phone settles Ryde fares inside its own ride flow, which takes no external payment trigger')
unsupportedEvent('qs-smartphone-pro:serverCallback',
    'it is PRO\'s internal callback transport; sd-phone uses ox_lib callbacks and cannot answer it')

-- Outbound: sd-phone's own lifecycle, re-fired under qs-smartphone's event names.

---The first-party shell-state feed (client/statebags.lua) carries the open flag, so phone:opened /
---phone:closed ride on it. EDGE-triggered: several halves report onto it, and a level would repeat.
AddEventHandler('sd-phone:server:statebags:report', function(payload)
    if type(payload) ~= 'table' or payload.open == nil then return end

    local src = source
    local was = openPhones[src] == true
    local now = payload.open == true
    if was == now then return end
    openPhones[src] = now or nil

    if now then
        TriggerEvent('phone:opened', src, {
            phoneNumber = identify.numberOf(src),
            scope       = identify.scopeOf(src),
            mode        = payload.soft and 'companion' or 'full',
        })
    else
        TriggerEvent('phone:closed', src, {
            reason      = 'closed',
            phoneNumber = identify.numberOf(src),
            scope       = identify.scopeOf(src),
        })
    end
end)

---A player dropping while the phone was open is a close, which is the second case qs-smartphone
---documents for phone:closed.
AddEventHandler('playerDropped', function()
    local src = source
    if not openPhones[src] then return end
    openPhones[src] = nil
    TriggerEvent('phone:closed', src, { reason = 'disconnected' })
end)

---Services duty change -> qs-smartphone:marketplace:dutyChanged (accountId, jobName, source), whose
---source argument comes LAST. The account id is sd-phone's data identity for that phone.
AddEventHandler('sd-phone:services:dutyChanged', function(src, jobName, on)
    TriggerEvent('qs-smartphone:marketplace:dutyChanged', identify.scopeOf(src), on and jobName or nil, src)
end)
