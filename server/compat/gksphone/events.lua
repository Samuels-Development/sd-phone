-- Each handler listens on a first-party 'sd-phone:server:*' lifecycle event and re-fires it under
-- the gksphone event name with the payload reshaped to gksphone's documented contract. Server-local
-- only, so these are AddEventHandler rather than RegisterNetEvent, exactly as gksphone documents.

---@type table Settings persistence layer (server.settings.store): participant number lookups.
local settings = require 'server.settings.store'
---@type table Dispatch shim ops (server.compat.gksphone.dispatch): the in-flight report flag.
local dispatch = require 'server.compat.gksphone.dispatch'

---The media URL carried on a services message, whose meta arrives as a JSON string rather than a
---table. Nil for a plain text message and for meta that fails to decode.
---@param meta any
---@return string|nil
local function mediaOf(meta)
    if type(meta) ~= 'string' or meta == '' then return nil end
    local ok, decoded = pcall(json.decode, meta)
    if not ok or type(decoded) ~= 'table' then return nil end
    return decoded.mediaUrl
end

---1:1 and system texts -> gksphone:messages:messageSent. Group sends are skipped: gksphone's
---payload names exactly one receiver, and sd-phone's group shape does not name them individually.
AddEventHandler('sd-phone:server:messages:sent', function(m)
    if m.group then return end

    TriggerEvent('gksphone:messages:messageSent', {
        senderNumber    = m.senderNumber,
        senderPhoneId   = m.citizenid,
        senderSource    = m.source,
        receiverNumber  = m.targetNumber,
        receiverPhoneId = m.targetCitizenid,
        receiverSource  = m.targetSource,
        message         = m.body,
        messageId       = m.messageId,
        timestamp       = os.time(),
    })
end)

---A placed call -> gksphone:calls:newCall. sd-phone connects a 1:1 call at dial time rather than
---publishing a separate ring event, so `isBusy` is always false: a busy target never reaches here.
AddEventHandler('sd-phone:server:call:started', function(call)
    local caller, callee = call.caller, call.callee

    TriggerEvent('gksphone:calls:newCall', {
        callId        = call.channel,
        callType      = 'calling',
        callerSource  = caller and caller.source,
        callerNumber  = caller and (caller.number or settings.getPhoneNumber(caller.citizenid)),
        targetSource  = callee and callee.source,
        targetNumber  = callee and (callee.number or settings.getPhoneNumber(callee.citizenid)),
        company       = call.company,
        isJobCall     = call.company ~= nil,
        isPrivateCall = false,
        fromPayphone  = false,
        isBusy        = false,
    })
end)

---An answered call -> gksphone:calls:callAnswered.
AddEventHandler('sd-phone:server:call:answered', function(call)
    TriggerEvent('gksphone:calls:callAnswered', {
        callId        = call.channel,
        callType      = 'calling',
        isPrivateCall = false,
        callerNumber  = call.caller and call.caller.number,
        targetNumber  = call.callee and call.callee.number,
        targetSource  = call.callee and call.callee.source,
        callerSource  = call.caller and call.caller.source,
        company       = call.company,
    })
end)

---An ended call -> gksphone:calls:callEnded. Fires for a ring nobody answered too, which is the
---same shape with the callee leg absent.
AddEventHandler('sd-phone:server:call:ended', function(call)
    TriggerEvent('gksphone:calls:callEnded', {
        callId        = call.channel,
        callType      = 'calling',
        isPrivateCall = false,
        callerNumber  = call.caller and call.caller.number,
        targetNumber  = call.callee and call.callee.number,
        targetSource  = call.callee and call.callee.source,
        callerSource  = call.caller and call.caller.source,
        company       = call.company,
    })
end)

---A Birdy post -> gksphone:squawk:newPost. gksphone hands `image` over as a JSON string rather than
---an array, which is the one shape difference a listener would otherwise trip on.
AddEventHandler('sd-phone:server:birdy:post', function(p)
    TriggerEvent('gksphone:squawk:newPost', {
        id          = p.id,
        username    = p.username,
        content     = p.body,
        displayname = p.displayName,
        image       = json.encode(p.images or {}),
        isComment   = false,
    })
end)

---A Photogram post -> gksphone:snapgram:newPost.
AddEventHandler('sd-phone:server:photogram:post', function(p)
    TriggerEvent('gksphone:snapgram:newPost', {
        id        = p.id,
        username  = p.username,
        caption   = p.caption,
        full_name = p.username,
        media     = json.encode(p.images or {}),
        location  = p.location,
    })
end)

---A Yellow Pages post -> gksphone:adv:newPost, gksphone's advertising feed. `filter` is its ad
---category, which sd-phone does not carry on a post, so the title stands in as the label a listener
---groups by.
AddEventHandler('sd-phone:server:pages:post', function(p)
    TriggerEvent('gksphone:adv:newPost', {
        id          = p.id,
        phoneNumber = p.number,
        message     = p.body,
        filter      = p.title,
        image       = json.encode(p.images or (p.image and { p.image }) or {}),
    })
end)

---A customer message to a company -> gksphone:services:newReport, which is the closest first-party
---edge to a dispatch report. A report arriving through SendReport is announced by dispatch.lua with
---the photo and anonymous flag attached, so its echo is skipped here rather than fired twice.
AddEventHandler('sd-phone:server:services:message', function(m)
    if m.source and dispatch.filing[m.source] then return end

    TriggerEvent('gksphone:services:newReport', {
        source      = m.source,
        message     = m.body,
        reportPhoto = mediaOf(m.meta),
        job         = m.job,
        isAnonymous = false,
        phoneNumber = m.number,
    })
end)

-- sd-phone's 'number:assigned' has no gksphone counterpart: gksphone announces a new number only
-- inside gksphone:server:phoneReset, which sim.lua already fires from ResetPhoneData. Mirroring a
-- first assignment there too would tell a listener a handset had just been factory reset.
