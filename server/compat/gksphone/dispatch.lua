---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): source -> identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Settings persistence layer (server.settings.store): the reporter's own number.
local settings = require 'server.settings.store'
---@type table Company inbox store (server.services.msgstore): the direct write a report photo takes.
local msgstore = require 'server.services.msgstore'
---@type table Player bridge (bridge.server.player): the reporter's display name on the photo row.
local player = require 'bridge.server.player'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---@type table Module table returned at end of file. `filing` holds the sources currently inside
---fileReport, so events.lua can skip the echo for THAT report without swallowing a concurrent one.
local dispatch = { filing = {} }

---@type string Body stored on an image row, matching what sd-phone's own company message parser
---writes so a photo report reads identically to one sent from the Services app.
local PHOTO_BODY = '📷 Photo'

---@type table<string, boolean> Jobs whose dispatch desk a caller has closed with JobStatusChange.
---Session-local: sd-phone stores no per-job dispatch flag, and a desk that silently reopened on
---restart would be worse than one that forgets.
local closedJobs = {}

---Files one report into a company inbox and fires gksphone's own report event. Shared by SendReport
---and its legacy alias SendDispatch, whose signatures are identical.
---
---A photo goes as a SECOND row written straight into the company inbox: the customer-facing send is
---rate-limited to one message a second, so a second call in the same tick would be refused.
---@param src any reporting player's server id
---@param message any report body
---@param photo any attached image URL, or nil
---@param job any company the report is addressed to
---@param anonymous any whether the reporter asked to stay unnamed
---@return boolean filed
local function fileReport(src, message, photo, job, anonymous)
    local source = tonumber(src)
    local body = shim.text(message)
    local target = shim.text(job)
    if not source or not body or not target then return false end
    if closedJobs[target] then return false end

    if anonymous then
        warnOnce('SendReport.anonymous', ('SendReport anonymous is not supported (called by %s); the report reached the company inbox with the reporter named, because sd-phone threads a company message by its sender'):format(shim.invoker()))
    end

    dispatch.filing[source] = true
    local result = sd:messageCompany(source, { job = target, body = body })
    dispatch.filing[source] = nil
    if not result or result.success ~= true then return false end

    local identity = phones.forSource(source)
    local number = identity and shim.digits(settings.getPhoneNumber(identity))
    local mediaUrl = shim.text(photo)
    if mediaUrl and number then
        msgstore.insert({
            id            = msgstore.newId(),
            job           = target,
            citizenNumber = number,
            citizenName   = player.getName(source),
            sender        = 'citizen',
            body          = PHOTO_BODY,
            kind          = 'image',
            meta          = json.encode({ mediaUrl = mediaUrl }),
            createdAt     = os.time(),
        })
    end

    TriggerEvent('gksphone:services:newReport', {
        source      = source,
        message     = body,
        reportPhoto = mediaUrl,
        job         = target,
        isAnonymous = anonymous == true,
        phoneNumber = number,
    })
    return true
end

---SendReport(src, reportMessage, reportPhoto, job, anonymous, playerCoords, streedZone): a citizen
---dispatch report. The coordinates and street name are dropped: sd-phone's company inbox is a
---message thread rather than a map-pinned CAD call, so a caller that wants the location in the
---report should put it in the message body.
registerExport('SendReport', function(src, reportMessage, reportPhoto, job, anonymous, playerCoords, streedZone)
    if playerCoords or streedZone then
        warnOnce('SendReport.coords', ('SendReport coordinates and street zone are dropped (called by %s); sd-phone files the report as a company message with no map pin'):format(shim.invoker()))
    end
    return fileReport(src, reportMessage, reportPhoto, job, anonymous)
end)

---SendDispatch(...): gksphone's pre-rename name for SendReport, identical in every argument. Still
---live in third-party scripts written against the old docs page, so it is registered too.
registerExport('SendDispatch', function(src, reportMessage, reportPhoto, job, anonymous, playerCoords, streedZone)
    if playerCoords or streedZone then
        warnOnce('SendDispatch.coords', ('SendDispatch coordinates and street zone are dropped (called by %s); sd-phone files the report as a company message with no map pin'):format(shim.invoker()))
    end
    return fileReport(src, reportMessage, reportPhoto, job, anonymous)
end)

---JobStatusChange(job, status): opens or closes a company's dispatch desk. While a desk is closed
---every SendReport addressed to it is refused. sd-phone keeps no dispatch flag of its own, so the
---setting lives for this session only and every desk reopens on restart.
registerExport('JobStatusChange', function(job, status)
    local target = shim.text(job)
    if not target then return false end

    warnOnce('JobStatusChange', ('JobStatusChange is session-local (called by %s); sd-phone stores no per-job dispatch flag, so every desk reopens when the resource restarts'):format(shim.invoker()))
    closedJobs[target] = (status == false) or nil
    return true
end)

---IsJobStatus(job): whether a company's dispatch desk is open, which is true for every configured
---company until something closes it with JobStatusChange.
registerExport('IsJobStatus', function(job)
    local target = shim.text(job)
    if not target then return false end
    return not closedJobs[target]
end)

-- Returned so the client-support half can file a report without going back out through the export
-- registry, which would resolve to the real gksphone the moment this shim deregisters, and so
-- events.lua can read the in-flight flag that keeps one report from announcing itself twice.
dispatch.fileReport = fileReport
return dispatch
