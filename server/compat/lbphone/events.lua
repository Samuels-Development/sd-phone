---@type table Player bridge (bridge.server.player): source resolution from a citizenid.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): citizenid -> number lookups.
local settings = require 'server.settings.store'

-- Each handler listens on a first-party 'sd-phone:server:*' lifecycle event and re-fires it
-- under the lb-phone event name with the payload reshaped to lb-phone's contract. Server-local only.

---Number mint -> lb-phone:phoneNumberGenerated (source, number). The citizenid resolves to a
---source first; offline mints are skipped silently.
AddEventHandler('sd-phone:server:number:assigned', function(citizenid, number)
    local src = player.getSourceByIdentifier(citizenid)
    if not src then return end
    TriggerEvent('lb-phone:phoneNumberGenerated', src, number)
end)

---1:1 and system texts -> lb-phone:messages:messageSent; group sends are skipped. channelId is a
---synthetic 0 and attachments is a JSON-encoded string of a one-url array for media messages.
AddEventHandler('sd-phone:server:messages:sent', function(m)
    if m.group then return end
    local attachments
    if (m.kind == 'image' or m.kind == 'gif') and m.meta and m.meta.gifUrl then
        attachments = json.encode({ m.meta.gifUrl })
    end
    TriggerEvent('lb-phone:messages:messageSent', {
        channelId   = 0,
        messageId   = m.messageId or 0,
        sender      = m.senderNumber,
        recipient   = m.targetNumber,
        message     = m.body,
        attachments = attachments,
    })
end)

---Mail compose -> lb-phone:mail:mailSent, fired once per recipient address. A system send's id
---can be nil when nothing was delivered.
AddEventHandler('sd-phone:server:mail:sent', function(m)
    for i = 1, #m.to do
        TriggerEvent('lb-phone:mail:mailSent', {
            id        = m.id,
            to        = m.to[i],
            sender    = m.from.email,
            subject   = m.subject,
            message   = m.body,
            timestamp = m.sentAt,
        })
    end
end)

---Reshapes a first-party call payload into lb-phone's CallData: callId is the pma-voice channel,
---the party tables keep source + number, nearby stays empty, videoCall/hideCallerId are hard false.
---@param call table first-party call payload (server.calls.actions eventCall/eventRing shape)
---@param answered boolean
---@param started number epoch seconds lb consumers read as the call start
---@return table
local function callData(call, answered, started)
    return {
        callId       = call.channel,
        started      = started,
        answered     = answered,
        videoCall    = false,
        hideCallerId = false,
        company      = call.company,
        caller       = { source = call.caller.source, number = call.caller.number, nearby = {} },
        callee       = { source = call.callee and call.callee.source, number = call.callee and call.callee.number, nearby = {} },
    }
end

---A call or group ring started ringing -> lb-phone:newCall, answered false, started now.
AddEventHandler('sd-phone:server:call:started', function(call)
    TriggerEvent('lb-phone:newCall', callData(call, false, os.time()))
end)

---A call was answered -> lb-phone:callAnswered; started is the first-party answer timestamp.
AddEventHandler('sd-phone:server:call:answered', function(call)
    TriggerEvent('lb-phone:callAnswered', callData(call, true, call.startedAt or os.time()))
end)

---A call ended -> lb-phone:callEnded (CallData, endedBy). started is reconstructed as now minus
---the talk duration; endedBy is nil when the teardown came from a disconnect.
AddEventHandler('sd-phone:server:call:ended', function(call, endedBy)
    TriggerEvent('lb-phone:callEnded', callData(call, call.answered == true, os.time() - (call.duration or 0)), endedBy)
end)

---Customer -> company text -> lb-phone:newCompanyMessage. sentByEmployee is hard false, coords
---stays nil and anonymous false.
AddEventHandler('sd-phone:server:services:message', function(e)
    TriggerEvent('lb-phone:newCompanyMessage', {
        company        = e.job,
        sender         = e.number,
        sentByEmployee = false,
        message        = e.body,
        anonymous      = false,
    })
end)

---Logged external transaction -> lb-phone:onAddTransaction (type, number, amount, company, logo).
---The signed amount passes through untouched; skipped when the citizen has no number row.
AddEventHandler('sd-phone:server:banking:transaction', function(t)
    local number = settings.getPhoneNumber(t.citizenid)
    if not number then return end
    TriggerEvent('lb-phone:onAddTransaction', t.amount > 0 and 'received' or 'paid', number, t.amount, t.counterparty or t.label, nil)
end)

---Owner-initiated gallery delete -> lb-phone:deletedFromGallery (source, number, url). Skipped
---when the url is unknown; a missing number row degrades to ''.
AddEventHandler('sd-phone:server:photos:deleted', function(p)
    if not p.url then return end
    TriggerEvent('lb-phone:deletedFromGallery', p.source, settings.getPhoneNumber(p.citizenid) or '', p.url)
end)

---New Birdy post -> lb-phone:birdy:newPost. The id stringifies, the image list JSON-encodes into
---the attachments string (nil for text-only posts), untracked fields stay nil, verified hard false.
AddEventHandler('sd-phone:server:birdy:post', function(p)
    TriggerEvent('lb-phone:birdy:newPost', {
        id           = tostring(p.id),
        username     = p.username,
        content      = p.body,
        attachments  = p.images and json.encode(p.images) or nil,
        timestamp    = os.time(),
        display_name = p.displayName or p.username,
        verified     = false,
    })
end)

---New Photogram post -> lb-phone:instapic:newPost; media is the image url array. A private
---author's post passes through unchanged.
AddEventHandler('sd-phone:server:photogram:post', function(p)
    TriggerEvent('lb-phone:instapic:newPost', {
        id       = tostring(p.id),
        username = p.username,
        media    = p.images or {},
        caption  = p.caption or '',
        location = p.location,
    })
end)

---New Pages post -> lb-phone:pages:newPost. body becomes description and the single legacy
---image url rides as attachment.
AddEventHandler('sd-phone:server:pages:post', function(p)
    TriggerEvent('lb-phone:pages:newPost', {
        id          = p.id,
        number      = p.number or '',
        title       = p.title,
        description = p.body,
        attachment  = p.image,
        price       = p.price,
    })
end)

---New Marketplace listing -> lb-phone:marketplace:newPost. body becomes description and the
---stored images pass through as attachments (empty table when the listing has no photos).
AddEventHandler('sd-phone:server:marketplace:post', function(p)
    TriggerEvent('lb-phone:marketplace:newPost', {
        id          = p.id,
        number      = p.number or '',
        title       = p.title,
        description = p.body,
        attachments = p.images or {},
        price       = p.price or 0,
    })
end)

-- Not mirrored (no sd-phone analog): lb-phone:numberChanged, factoryReset, toggleVerified, trendy:newPost, darkchat:newMessage.
