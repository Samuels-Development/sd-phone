---@type table sd-phone config root (configs/config.lua).
local config        = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid / name / source lookups.
local player        = require 'bridge.server.player'
---@type table Settings persistence (server.settings.store): number registry + airplane-mode flag.
local settings      = require 'server.settings.store'
---@type table Contacts persistence (server.contacts.store): saved-contact rows + the block list.
local contactsStore = require 'server.contacts.store'
---@type table Banking actions (server.banking.actions): validated transfers with refund-on-failure.
local banking       = require 'server.banking.actions'
---@type table Fivemanage uploader (server.photos.uploader): server-side media upload.
local uploader      = require 'server.photos.uploader'
---@type table Shared media-upload budget (server.photos.mediaLimit): cooldown + rolling byte cap.
local mediaLimit    = require 'server.photos.mediaLimit'
---@type table Messages persistence layer (server.messages.store): mailbox rows, groups, reactions.
local store         = require 'server.messages.store'
---@type table Badge engine (server.badges.init): server-authoritative home-screen unread counts.
local badges        = require 'server.badges.init'
---@type table Admin mute registry (server.admin.moderation): scope guards for sending texts.
local moderation    = require 'server.admin.moderation'

---@type table Messages knobs (configs/messages.lua): body / thread / group caps.
local cfg = config.Messages

---@type table Actions module; the table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail, digits, trim, initialsFor, formatNumber = util.ok, util.fail, util.digits, util.trim, util.initialsFor, util.formatNumber


local colorFor = util.colorFor

-- Message kinds the composer can produce; anything else is coerced to text.
---@type table<string, boolean> Allowed payload.kind values.
local VALID_KINDS = {
    text = true, image = true, gif = true, money = true, location = true, voice = true,
}

-- Message kinds a system text (actions.systemText) may carry via its opts table.
---@type table<string, boolean> Allowed opts.kind values for system texts.
local SYSTEM_KINDS = { image = true, gif = true, location = true }

-- The Tapback emoji the picker offers; reactions outside this set are rejected.
---@type table<string, boolean> Allowed reaction emoji.
local REACTION_SET = { ['❤️'] = true, ['👍'] = true, ['👎'] = true, ['😂'] = true }

---@type integer Upper bound on raw member entries scanned per group create / add call.
local MAX_MEMBER_SCAN = 64






---Resolves a number into the React `Contact` shape. Prefers the viewer's saved contact card,
---then a supplied display name, then the formatted number.
---@param numberDigits string
---@param contactRow table|nil saved-contact row, or nil
---@param fallbackName string|nil
---@return table
local function resolveParticipant(numberDigits, contactRow, fallbackName)
    if contactRow then
        return {
            id       = numberDigits,
            name     = contactRow.name,
            initials = initialsFor(contactRow.name),
            color    = contactRow.color,
            avatar   = contactRow.avatar,
            phone    = numberDigits,
        }
    end

    local name = (fallbackName and fallbackName ~= '') and fallbackName or formatNumber(numberDigits)
    return {
        id       = numberDigits,
        name     = name,
        initials = initialsFor(name),
        color    = colorFor(numberDigits ~= '' and numberDigits or name),
        phone    = numberDigits,
    }
end

---Build a viewer's `digits -> contact row` lookup from their saved contacts.
---@param citizenid string
---@return table<string, table>
local function contactMapFor(citizenid)
    local map = {}
    local rows = contactsStore.listContacts(citizenid)
    for i = 1, #rows do map[digits(rows[i].phone)] = rows[i] end
    return map
end

---Serialize the player's saved contacts for the compose / new-message picker, reusing the same
---shape as `resolveParticipant`, sorted by name.
---@param contactMap table<string, table>
---@return table[]
local function serializeContacts(contactMap)
    local out = {}
    for number, row in pairs(contactMap) do
        out[#out + 1] = resolveParticipant(number, row)
    end
    table.sort(out, function(a, b) return a.name < b.name end)
    return out
end

---Aggregates a message's reaction rows into the client's render shape: one entry per distinct
---emoji (first-appearance order) with its count and whether the viewer chose it.
---@param rows { citizenid: string, emoji: string }[] oldest-first
---@param viewerCid string|nil
---@return table[]
local function buildReactions(rows, viewerCid)
    local order, counts, mineByEmoji = {}, {}, {}
    for _, r in ipairs(rows) do
        if counts[r.emoji] == nil then order[#order + 1] = r.emoji; counts[r.emoji] = 0 end
        counts[r.emoji] = counts[r.emoji] + 1
        if viewerCid and r.citizenid == viewerCid then mineByEmoji[r.emoji] = true end
    end
    local out = {}
    for _, e in ipairs(order) do
        out[#out + 1] = { emoji = e, count = counts[e], mine = mineByEmoji[e] == true }
    end
    return out
end

---Reshapes a stored message row into the React `Message` shape from a viewer's perspective.
---When a `reactionsByMid` lookup + viewer cid are supplied, aggregated reactions ride along.
---@param row table
---@param viewerNumber string
---@param viewerCid string|nil
---@param reactionsByMid table<string, table[]>|nil
---@return table
local function serializeMessage(row, viewerNumber, viewerCid, reactionsByMid)
    local senderDigits = digits(row.sender)
    local meta = store.decodeJson(row.meta)

    local msg = {
        id   = row.id,
        from = (senderDigits ~= '' and senderDigits == viewerNumber) and 'me' or senderDigits,
        body = row.body or '',
        kind = row.kind or 'text',
        ts   = (tonumber(row.created_at) or 0) * 1000,
        read = (tonumber(row.is_read) or 0) == 1,
    }
    if meta.gifUrl   then msg.gifUrl   = meta.gifUrl end
    if meta.amount   then msg.amount   = meta.amount end
    if meta.duration then msg.duration = meta.duration end
    if meta.audio    then msg.audioUrl = meta.audio end
    if meta.waveform then msg.waveform = meta.waveform end
    if meta.wpCode   then msg.wpCode   = meta.wpCode end
    if meta.wpSub    then msg.wpSub    = meta.wpSub end
    if meta.requested     then msg.requested     = true end
    if meta.requestStatus then msg.requestStatus = meta.requestStatus end

    if reactionsByMid and row.mid then
        local rrows = reactionsByMid[row.mid]
        if rrows and #rrows > 0 then msg.reactions = buildReactions(rrows, viewerCid) end
    end
    return msg
end

---Builds a serialized message straight from its fields, for the send-action return value and
---the live push.
---@param id string
---@param senderNumber string
---@param kind string
---@param body string
---@param meta table
---@param ts number unix epoch
---@param isRead boolean
---@param viewerNumber string
---@return table
local function buildMessage(id, senderNumber, kind, body, meta, ts, isRead, viewerNumber)
    return serializeMessage({
        id = id, sender = senderNumber, kind = kind, body = body,
        meta = meta, is_read = isRead and 1 or 0, created_at = ts,
    }, viewerNumber)
end

---Participants of a group thread as seen by `viewerCid` - every member except the viewer,
---resolved against the viewer's own contacts.
---@param viewerCid string
---@param viewerContactMap table<string, table>
---@param groupId string
---@return table[]
local function groupParticipants(viewerCid, viewerContactMap, groupId, members)
    local out = {}
    members = members or store.groupMembers(groupId)
    for i = 1, #members do
        local m = members[i]
        if m.citizenid ~= viewerCid then
            local d = digits(m.number)
            out[#out + 1] = resolveParticipant(d, viewerContactMap[d], m.name)
        end
    end
    return out
end

---Assemble one full conversation payload for a viewer. Dispatches on the thread key: 'g-'
---prefix is a group, everything else a 1:1 by number.
---@param viewerCid string
---@param viewerNumber string
---@param conversation string thread key
---@param rows table[] message rows (chronological)
---@param contactMap table<string, table>
---@return table
local function buildConversation(viewerCid, viewerNumber, conversation, rows, contactMap)
    local mids = {}
    for i = 1, #rows do mids[i] = rows[i].mid end
    local reactionsByMid = store.reactionsForMids(mids)
    local messages = {}
    for i = 1, #rows do messages[i] = serializeMessage(rows[i], viewerNumber, viewerCid, reactionsByMid) end

    if conversation:sub(1, 2) == 'g-' then
        local groupId = conversation:sub(3)
        local group   = store.getGroup(groupId)
        return {
            id           = conversation,
            groupName    = group and group.name or 'Group',
            groupAvatar  = group and group.avatar or nil,
            groupOwner   = group ~= nil and group.owner_cid == viewerCid,
            participants = groupParticipants(viewerCid, contactMap, groupId),
            messages     = messages,
            pinned       = false,
            muted        = false,
        }
    end

    return {
        id           = conversation,
        participants = { resolveParticipant(conversation, contactMap[conversation]) },
        messages     = messages,
        pinned       = false,
        muted        = false,
    }
end

---Sanitizes composer metadata: clamps string lengths, coerces money amounts to a non-negative
---integer, accepts only 'pending' request statuses, and bounds voice waveforms.
---@param kind string
---@param payload table
---@return table
local function sanitizeMeta(kind, payload)
    local meta = {}
    if kind == 'image' or kind == 'gif' then
        local url = trim(payload.gifUrl)
        if url ~= '' then meta.gifUrl = url:sub(1, 512) end
    elseif kind == 'money' then
        local amount = tonumber(payload.amount) or 0
        if amount ~= amount or amount == math.huge or amount == -math.huge then amount = 0 end
        amount = math.floor(amount)
        if math.type(amount) ~= 'integer' then amount = 0 end
        meta.amount = math.max(0, amount)
        if payload.requested == true then meta.requested = true end
        local rs = trim(payload.requestStatus)
        if rs == 'pending' then meta.requestStatus = rs end
    elseif kind == 'voice' then
        meta.duration = math.max(0, math.min(36000, math.floor(tonumber(payload.duration) or 0)))
        local audio = trim(payload.audioUrl)
        if audio ~= '' then meta.audio = audio:sub(1, 512) end
        if type(payload.waveform) == 'table' then
            local bars = {}
            for i = 1, math.min(#payload.waveform, 64) do
                local v = math.floor(tonumber(payload.waveform[i]) or 0)
                bars[i] = math.max(0, math.min(100, v))
            end
            if #bars > 0 then meta.waveform = bars end
        end
    elseif kind == 'location' then
        local code = trim(payload.wpCode)
        local sub  = trim(payload.wpSub)
        if code ~= '' then meta.wpCode = code:sub(1, 256) end
        if sub  ~= '' then meta.wpSub  = sub:sub(1, 128) end
    end
    return meta
end

---True if a message of `kind` carries content, given its body + sanitized meta.
---@param kind string
---@param body string
---@param meta table
---@return boolean
local function hasContent(kind, body, meta)
    if kind == 'text'                     then return body ~= '' end
    if kind == 'image' or kind == 'gif'   then return meta.gifUrl ~= nil end
    if kind == 'money'                    then return (meta.amount or 0) > 0 end
    if kind == 'voice'                    then return (meta.duration or 0) > 0 end
    if kind == 'location'                 then return body ~= '' or meta.wpCode ~= nil end
    return body ~= ''
end

---Builds a short list/banner preview line for a message of any kind. `meta` may be nil only
---for kinds that never read it.
---@param kind string
---@param body string
---@param meta table|nil
---@return string
local function previewFor(kind, body, meta)
    if kind == 'image'      then return '📷 Photo' end
    if kind == 'gif'        then return 'GIF' end
    if kind == 'money'      then return ((meta.requested and '💵 Requested $%d' or '💵 $%d')):format(meta.amount or 0) end
    if kind == 'voice'      then return '🎤 Voice message' end
    if kind == 'location'   then return '📍 ' .. (body ~= '' and body or 'Location') end
    if kind == 'locrequest' then return '📍 Location sharing request' end
    return body
end

---Fires an iOS-style phone notification at a recipient's client, then refreshes their
---home-screen Messages badge from the DB.
---@param targetSrc number
---@param title string
---@param body string
local function notify(targetSrc, title, body)
    TriggerClientEvent('sd-phone:client:notify', targetSrc, {
        app   = 'messages',
        title = title,
        body  = body,
        time  = 'now',
        appId = 'messages',
    })
    badges.push(targetSrc)
end

---Returns full message state for one player: every conversation (1:1 + group, including empty
---new groups), their saved contacts, and their own number/name. Read-only.
---@param source number
---@return table
function actions.list(source)
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local myNumber  = digits(settings.ensurePhoneNumber(cid) or '')
    local contactMap = contactMapFor(cid)

    local conversations, seen = {}, {}
    for _, t in ipairs(store.threadKeys(cid)) do
        seen[t.conversation] = true
        local rows = store.threadMessages(cid, t.conversation, cfg.MessagesPerThread)
        conversations[#conversations + 1] = buildConversation(cid, myNumber, t.conversation, rows, contactMap)
    end

    for _, g in ipairs(store.groupsForMember(cid)) do
        local key = 'g-' .. g.id
        if not seen[key] then
            conversations[#conversations + 1] = buildConversation(cid, myNumber, key, {}, contactMap)
        end
    end

    return ok({
        conversations = conversations,
        contacts      = serializeContacts(contactMap),
        myNumber      = myNumber,
        myName        = player.getName(source),
    })
end

---Delivers one 1:1 message: the sender's copy is always stored; the recipient's copy + live
---push happen only when the number is in service, unblocked, and not in airplane mode.
---@param source number
---@param cid string
---@param myNumber string
---@param target string recipient number digits
---@param kind string
---@param body string
---@param meta table
---@param ts number
---@param mid string shared logical message id stamped on both copies
---@return table
local function sendDirect(source, cid, myNumber, target, kind, body, meta, ts, mid)
    if target == '' or #target > 48 then return fail('No recipient') end
    if target == myNumber then return fail('You can\'t message yourself') end

    local outId = store.newId()
    store.insertMessage(outId, mid, cid, target, myNumber, 'outgoing', kind, body, meta, true, ts)
    store.pruneThread(cid, target, cfg.MessagesPerThread)

    local targetCid = settings.getCitizenByNumber(target)
    local inId, withheld, targetSrc
    if targetCid and targetCid ~= cid and not contactsStore.isBlocked(targetCid, myNumber) then
        withheld = settings.isAirplane(targetCid)
        inId = store.newId()
        store.insertMessage(inId, mid, targetCid, myNumber, myNumber, 'incoming', kind, body, meta, false, ts, withheld)
        store.pruneThread(targetCid, myNumber, cfg.MessagesPerThread)

        targetSrc = player.getSourceByIdentifier(targetCid)
        if targetSrc and not withheld then
            -- No character-name fallback: an unsaved sender shows as their number, matching
            -- the buildConversation reload path (and not leaking identities).
            local theirContacts = contactMapFor(targetCid)
            local participant   = resolveParticipant(myNumber, theirContacts[myNumber])
            local msg           = buildMessage(inId, myNumber, kind, body, meta, ts, false, digits(settings.getPhoneNumber(targetCid)))

            TriggerClientEvent('sd-phone:client:messages:incoming', targetSrc, {
                id           = myNumber,
                participants = { participant },
                messages     = { msg },
                pinned       = false,
                muted        = false,
            })
            notify(targetSrc, participant.name, previewFor(kind, body, meta))
        end
    end

    -- First-party send announcement (1:1 shape).
    TriggerEvent('sd-phone:server:messages:sent', {
        system          = false,
        group           = false,
        source          = source,
        citizenid       = cid,
        senderNumber    = myNumber,
        targetNumber    = target,
        targetCitizenid = targetCid,
        targetSource    = targetSrc,
        kind            = kind,
        body            = body,
        meta            = meta,
        mid             = mid,
        messageId       = outId,
        recipientId     = inId,
        withheld        = withheld == true,
        timestamp       = ts,
    })

    return ok(buildMessage(outId, myNumber, kind, body, meta, ts, true, myNumber))
end

---Delivers a rich app-generated 1:1 message on a player's behalf (internal, module-to-module
---only) and mirrors the outgoing copy into the sender's own Messages UI.
---@param source number sender
---@param targetNumber string recipient number
---@param kind string
---@param body string
---@param meta table|nil
---@return table
function actions.appMessage(source, targetNumber, kind, body, meta)
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')
    local target   = digits(targetNumber)
    local res = sendDirect(source, cid, myNumber, target, kind, trim(body), meta or {}, os.time(), store.newId())

    if res.success and res.data then
        local contactMap = contactMapFor(cid)
        TriggerClientEvent('sd-phone:client:messages:incoming', source, {
            id           = target,
            participants = { resolveParticipant(target, contactMap[target]) },
            messages     = { res.data },
            pinned       = false,
            muted        = false,
        })
    end
    return res
end

---Locates the caller's newest still-pending location-request card in the 1:1 thread with
---`peerNumber`. Scoped to the caller's own mailbox. Read-only.
---@param citizenid string
---@param peerNumber string
---@return string|nil copy id
function actions.findRequestCopy(citizenid, peerNumber)
    return store.latestPendingRequest(citizenid, digits(peerNumber), 'locrequest')
end

---Sets a request card's status on every mailbox copy of the message, pushing the change live
---to online owners. `copyId` must be the caller's own copy.
---@param citizenid string the responder
---@param copyId string the responder's copy id
---@param status string 'accepted' | 'declined'
---@return boolean
function actions.setRequestStatus(citizenid, copyId, status)
    local mid = store.midForCopy(copyId, citizenid)
    if not mid then return false end

    for _, copy in ipairs(store.siblingCopies(mid)) do
        local meta = store.decodeJson(store.messageMeta(copy.id))
        meta.requestStatus = status
        store.updateMeta(copy.id, meta)

        local tgt = player.getSourceByIdentifier(copy.citizenid)
        if tgt then
            TriggerClientEvent('sd-phone:client:messages:meta', tgt, {
                conversation  = copy.conversation,
                id            = copy.id,
                requestStatus = status,
            })
        end
    end
    return true
end

---Delivers a one-way system text from a service short code: no sender mailbox copy, contact
---blocking ignored, non-whitelisted kinds delivered as plain text.
---@param senderNumber string
---@param senderName string
---@param targetNumber string
---@param body string
---@param opts table|nil presentation-safe kind + its meta fields (kind, gifUrl, wpCode, wpSub)
---@return boolean delivered
---@return string? messageId recipient row id of the stored copy, nil when not delivered
function actions.systemText(senderNumber, senderName, targetNumber, body, opts)
    local target = digits(targetNumber)
    if target == '' then return false end
    local targetCid = settings.getCitizenByNumber(target)
    if not targetCid then return false end

    local kind, meta = 'text', nil
    if type(opts) == 'table' and SYSTEM_KINDS[opts.kind] then
        kind = opts.kind
        meta = sanitizeMeta(kind, opts)
    end
    if not hasContent(kind, body, meta or {}) then return false end

    local ts   = os.time()
    local mid  = store.newId()
    local inId = store.newId()
    local withheld = settings.isAirplane(targetCid)
    store.insertMessage(inId, mid, targetCid, senderNumber, senderNumber, 'incoming', kind, body, meta, false, ts, withheld)
    store.pruneThread(targetCid, senderNumber, cfg.MessagesPerThread)

    local targetSrc = player.getSourceByIdentifier(targetCid)
    if targetSrc and not withheld then
        local participant = resolveParticipant(senderNumber, nil, senderName)
        local msg = buildMessage(inId, senderNumber, kind, body, meta, ts, false, digits(settings.getPhoneNumber(targetCid)))
        TriggerClientEvent('sd-phone:client:messages:incoming', targetSrc, {
            id           = senderNumber,
            participants = { participant },
            messages     = { msg },
            pinned       = false,
            muted        = false,
        })
        notify(targetSrc, participant.name, previewFor(kind, body, meta))
    end

    -- First-party send announcement (system shape).
    TriggerEvent('sd-phone:server:messages:sent', {
        system          = true,
        group           = false,
        senderNumber    = senderNumber,
        senderName      = senderName,
        targetNumber    = target,
        targetCitizenid = targetCid,
        targetSource    = targetSrc,
        kind            = kind,
        body            = body,
        meta            = meta,
        mid             = mid,
        messageId       = inId,
        recipientId     = inId,
        withheld        = withheld == true,
        timestamp       = ts,
    })
    return true, inId
end

---Fans a message out to every member of a group thread: an outgoing copy for the sender, an
---incoming copy (plus live push + banner) for everyone else. Membership is store-checked.
---@param source number
---@param cid string
---@param myNumber string
---@param groupId string
---@param kind string
---@param body string
---@param meta table
---@param ts number
---@param mid string shared logical message id stamped on every copy
---@return table
local function sendGroup(source, cid, myNumber, groupId, kind, body, meta, ts, mid)
    local group = store.getGroup(groupId)
    if not group then return fail('Conversation not found') end
    if not store.isGroupMember(groupId, cid) then return fail('You are not in this conversation') end

    local key        = 'g-' .. groupId
    local senderName = player.getName(source)
    local members    = store.groupMembers(groupId)
    local outId

    for _, m in ipairs(members) do
        local isMe = m.citizenid == cid
        local withheld = (not isMe) and settings.isAirplane(m.citizenid)
        local id   = store.newId()
        store.insertMessage(id, mid, m.citizenid, key, myNumber, isMe and 'outgoing' or 'incoming', kind, body, meta, isMe, ts, withheld)
        store.pruneThread(m.citizenid, key, cfg.MessagesPerThread)

        if isMe then
            outId = id
        else
            local targetSrc = player.getSourceByIdentifier(m.citizenid)
            if targetSrc and not withheld then
                local theirContacts = contactMapFor(m.citizenid)
                local msg = buildMessage(id, myNumber, kind, body, meta, ts, false, digits(m.number))
                TriggerClientEvent('sd-phone:client:messages:incoming', targetSrc, {
                    id           = key,
                    groupName    = group.name,
                    participants = groupParticipants(m.citizenid, theirContacts, groupId, members),
                    messages     = { msg },
                    pinned       = false,
                    muted        = false,
                })
                notify(targetSrc, group.name, senderName .. ': ' .. previewFor(kind, body, meta))
            end
        end
    end

    -- First-party send announcement (group shape), fired once per send.
    TriggerEvent('sd-phone:server:messages:sent', {
        system       = false,
        group        = true,
        source       = source,
        citizenid    = cid,
        senderNumber = myNumber,
        groupId      = groupId,
        members      = members,
        kind         = kind,
        body         = body,
        meta         = meta,
        mid          = mid,
        messageId    = outId,
        timestamp    = ts,
    })

    return ok(buildMessage(outId, myNumber, kind, body, meta, ts, true, myNumber))
end

---Sends a message from the composer. `payload.conversation` routes it ('g-' prefix = group,
---else a destination number); kind, body, and meta are re-validated, money runs a bank transfer.
---@param source number
---@param payload table
---@return table
function actions.send(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end
    if settings.isAirplane(cid) then return fail('Airplane Mode is on') end
    local muted = moderation.guard(cid, 'sms'); if muted then return muted end

    local conversation = tostring(payload.conversation or '')
    if conversation == '' then return fail('No conversation') end

    local kind = VALID_KINDS[payload.kind] and payload.kind or 'text'
    local body = trim(payload.body)
    if #body > cfg.MaxBodyLength then body = body:sub(1, cfg.MaxBodyLength) end

    local meta = sanitizeMeta(kind, payload)
    if not hasContent(kind, body, meta) then return fail('Empty message') end

    local isGroup = conversation:sub(1, 2) == 'g-'

    -- Number-dependent: a phone with no number in service can't send (device mode with the SIM
    -- out; in legacy/stock a resolvable caller always has a number, so this never trips). Gate
    -- BEFORE the money branch so a refused text never moves cash.
    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')
    if myNumber == '' then return fail('No service. Install a SIM card to send messages.') end

    if kind == 'money' then
        if isGroup then return fail('Money can only be sent in a direct message') end
        if not meta.requested then
            local res = banking.send(source, {
                number = digits(conversation),
                amount = meta.amount,
                note   = 'Phone payment',
            })
            if not res or not res.success then
                return fail(res and res.message or 'Payment failed')
            end
        end
    end

    local ts = os.time()
    local mid = store.newId()

    if isGroup then
        return sendGroup(source, cid, myNumber, conversation:sub(3), kind, body, meta, ts, mid)
    end
    return sendDirect(source, cid, myNumber, digits(conversation), kind, body, meta, ts, mid)
end

---Toggles one of the caller's reactions on a message (whitelist- and ownership-checked),
---returns the new aggregate, and pushes it live to every other online participant.
---@param source number
---@param payload { id?: string, emoji?: string }
---@return table
function actions.react(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local id    = tostring(payload.id or '')
    local emoji = tostring(payload.emoji or '')
    if id == '' then return fail('No message') end
    if not REACTION_SET[emoji] then return fail('Invalid reaction') end

    local mid = store.midForCopy(id, cid)
    if not mid then return fail('Message not found') end

    store.toggleReaction(mid, cid, emoji, os.time())

    local rows = store.reactionsFor(mid)

    for _, copy in ipairs(store.siblingCopies(mid)) do
        if copy.citizenid ~= cid then
            local tgt = player.getSourceByIdentifier(copy.citizenid)
            if tgt then
                TriggerClientEvent('sd-phone:client:messages:reaction', tgt, {
                    conversation = copy.conversation,
                    id           = copy.id,
                    reactions    = buildReactions(rows, copy.citizenid),
                })
            end
        end
    end

    return ok({ id = id, reactions = buildReactions(rows, cid) })
end

---Creates a group thread from a set of recipient numbers + a name, resolving numbers to
---citizens and capping the roster. Returns the new empty conversation; online members get it pushed.
---@param source number
---@param payload { name?: string, members?: string[] }
---@return table
function actions.createGroup(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local name = trim(payload.name)
    if name == '' then return fail('Group name required') end
    if #name > cfg.MaxGroupNameLength then name = name:sub(1, cfg.MaxGroupNameLength) end

    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')

    local list = type(payload.members) == 'table' and payload.members or {}
    local resolved, seenCid = {}, { [cid] = true }
    for i = 1, math.min(#list, MAX_MEMBER_SCAN) do
        local d = digits(list[i])
        if d ~= '' and d ~= myNumber then
            local mcid = settings.getCitizenByNumber(d)
            if mcid and not seenCid[mcid] then
                seenCid[mcid] = true
                resolved[#resolved + 1] = { cid = mcid, number = d }
            end
        end
    end

    if #resolved == 0 then return fail('Add at least one valid member') end
    if #resolved + 1 > cfg.MaxGroupMembers then
        return fail(('Groups are capped at %d members'):format(cfg.MaxGroupMembers))
    end

    local groupId = store.newId()
    if not store.createGroup(groupId, name, cid, os.time()) then
        return fail('Failed to create group')
    end

    store.addGroupMember(groupId, cid, myNumber, player.getName(source))
    for _, m in ipairs(resolved) do
        local msrc  = player.getSourceByIdentifier(m.cid)
        local mname = msrc and player.getName(msrc) or formatNumber(m.number)
        store.addGroupMember(groupId, m.cid, m.number, mname)
    end

    local key = 'g-' .. groupId

    for _, m in ipairs(resolved) do
        local msrc = player.getSourceByIdentifier(m.cid)
        if msrc then
            local theirContacts = contactMapFor(m.cid)
            TriggerClientEvent('sd-phone:client:messages:incoming', msrc, {
                id           = key,
                groupName    = name,
                participants = groupParticipants(m.cid, theirContacts, groupId),
                messages     = {},
                pinned       = false,
                muted        = false,
            })
        end
    end

    local contactMap = contactMapFor(cid)
    return ok(buildConversation(cid, myNumber, key, {}, contactMap))
end

---Adds one or more members to an existing group (any member may add; roster capped). Pushes
---the refreshed thread to every online member and returns the caller's updated conversation.
---@param source number
---@param payload { conversation?: string, members?: string[] }
---@return table
function actions.addGroupMember(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local key = tostring(payload.conversation or '')
    if key:sub(1, 2) ~= 'g-' then return fail('Not a group conversation') end
    local groupId = key:sub(3)
    if not store.isGroupMember(groupId, cid) then return fail('You are not in this group') end

    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')

    local seenCid, current = { [cid] = true }, store.groupMembers(groupId)
    for _, m in ipairs(current) do seenCid[m.citizenid] = true end

    local list = type(payload.members) == 'table' and payload.members or {}
    local resolved = {}
    for i = 1, math.min(#list, MAX_MEMBER_SCAN) do
        local d = digits(list[i])
        if d ~= '' and d ~= myNumber then
            local mcid = settings.getCitizenByNumber(d)
            if mcid and not seenCid[mcid] then
                seenCid[mcid] = true
                resolved[#resolved + 1] = { cid = mcid, number = d }
            end
        end
    end

    if #resolved == 0 then return fail('Add at least one valid member') end
    if #current + #resolved > cfg.MaxGroupMembers then
        return fail(('Groups are capped at %d members'):format(cfg.MaxGroupMembers))
    end

    for _, m in ipairs(resolved) do
        local msrc  = player.getSourceByIdentifier(m.cid)
        local mname = msrc and player.getName(msrc) or formatNumber(m.number)
        store.addGroupMember(groupId, m.cid, m.number, mname)
    end

    local groupName = (store.getGroup(groupId) or {}).name or 'Group'
    local roster = store.groupMembers(groupId)
    for _, m in ipairs(roster) do
        local msrc = m.citizenid ~= cid and player.getSourceByIdentifier(m.citizenid)
        if msrc then
            TriggerClientEvent('sd-phone:client:messages:incoming', msrc, {
                id           = key,
                groupName    = groupName,
                participants = groupParticipants(m.citizenid, contactMapFor(m.citizenid), groupId, roster),
                messages     = {},
                pinned       = false,
                muted        = false,
            })
        end
    end

    local contactMap = contactMapFor(cid)
    return ok(buildConversation(cid, myNumber, key, {}, contactMap))
end

---Renames a group and/or sets its picture. Creator-only; pushes the refreshed thread to every
---online member and returns the caller's updated conversation.
---@param source number
---@param payload { conversation?: string, name?: string, avatar?: string }
---@return table
function actions.updateGroup(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local key = tostring(payload.conversation or '')
    if key:sub(1, 2) ~= 'g-' then return fail('Not a group conversation') end
    local groupId = key:sub(3)

    local group = store.getGroup(groupId)
    if not group then return fail('Group not found') end
    if group.owner_cid ~= cid then return fail('Only the group creator can edit this group') end

    local name = trim(payload.name)
    if name == '' then name = group.name end
    if name == '' then return fail('Group name required') end
    if #name > cfg.MaxGroupNameLength then name = name:sub(1, cfg.MaxGroupNameLength) end

    local avatar = payload.avatar
    if type(avatar) == 'string' then avatar = avatar:sub(1, 512) else avatar = group.avatar end

    store.updateGroup(groupId, name, avatar)

    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')

    local roster = store.groupMembers(groupId)
    for _, m in ipairs(roster) do
        local msrc = m.citizenid ~= cid and player.getSourceByIdentifier(m.citizenid)
        if msrc then
            TriggerClientEvent('sd-phone:client:messages:incoming', msrc, {
                id           = key,
                groupName    = name,
                groupAvatar  = avatar,
                groupOwner   = false,
                participants = groupParticipants(m.citizenid, contactMapFor(m.citizenid), groupId, roster),
                messages     = {},
                pinned       = false,
                muted        = false,
            })
        end
    end

    local contactMap = contactMapFor(cid)
    return ok(buildConversation(cid, myNumber, key, {}, contactMap))
end

---Removes a member (identified by number) from a group. Creator-only; drops the thread from
---the removed member's app, refreshes the roster, and returns the caller's conversation.
---@param source number
---@param payload { conversation?: string, member?: string }
---@return table
function actions.removeGroupMember(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local key = tostring(payload.conversation or '')
    if key:sub(1, 2) ~= 'g-' then return fail('Not a group conversation') end
    local groupId = key:sub(3)

    local group = store.getGroup(groupId)
    if not group then return fail('Group not found') end
    if group.owner_cid ~= cid then return fail('Only the group creator can remove members') end

    local mnum = digits(payload.member or '')
    local mcid = mnum ~= '' and settings.getCitizenByNumber(mnum)
    if not mcid then return fail('Member not found') end
    if mcid == group.owner_cid then return fail('The creator cannot be removed') end
    if not store.isGroupMember(groupId, mcid) then return fail('Not a member of this group') end

    store.removeGroupMember(groupId, mcid)

    local removedSrc = player.getSourceByIdentifier(mcid)
    if removedSrc then
        TriggerClientEvent('sd-phone:client:messages:removed', removedSrc, { conversation = key })
    end

    local roster = store.groupMembers(groupId)
    for _, m in ipairs(roster) do
        local msrc = m.citizenid ~= cid and player.getSourceByIdentifier(m.citizenid)
        if msrc then
            TriggerClientEvent('sd-phone:client:messages:incoming', msrc, {
                id           = key,
                groupName    = group.name,
                groupAvatar  = group.avatar,
                groupOwner   = false,
                participants = groupParticipants(m.citizenid, contactMapFor(m.citizenid), groupId, roster),
                messages     = {},
                pinned       = false,
                muted        = false,
            })
        end
    end

    local myNumber   = digits(settings.ensurePhoneNumber(cid) or '')
    local contactMap = contactMapFor(cid)
    return ok(buildConversation(cid, myNumber, key, {}, contactMap))
end

---Marks a thread's inbound messages as read for the caller, then refreshes their badge.
---Idempotent.
---@param source number
---@param payload { conversation?: string }
---@return table
function actions.markRead(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local conversation = tostring(payload.conversation or '')
    if conversation == '' then return fail('No conversation') end

    store.markThreadRead(cid, conversation)
    badges.push(source)
    return ok({ conversation = conversation })
end

---Deletes the caller's copy of a thread. Deleting a group thread also leaves the group; an
---emptied group is removed entirely.
---@param source number
---@param payload { conversation?: string }
---@return table
function actions.deleteConversation(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(source)
    if not cid then return fail('Player not found') end

    local conversation = tostring(payload.conversation or '')
    if conversation == '' then return fail('No conversation') end

    store.deleteThread(cid, conversation)

    if conversation:sub(1, 2) == 'g-' then
        local groupId = conversation:sub(3)
        store.removeGroupMember(groupId, cid)
        if store.groupMemberCount(groupId) == 0 then store.deleteGroup(groupId) end
    end

    badges.push(source)
    return ok({ conversation = conversation })
end

---Delivers every message withheld while the player had airplane mode on: pushes each affected
---thread into the live UI and fires one summary banner. Idempotent.
---@param source number
function actions.releaseWithheld(source)
    local cid = player.getIdentifier(source)
    if not cid then return end

    local convs = store.withheldConversations(cid)
    if #convs == 0 then return end
    store.releaseWithheld(cid)

    local myNumber   = digits(settings.getPhoneNumber(cid) or '')
    local contactMap = contactMapFor(cid)
    for _, c in ipairs(convs) do
        local rows = store.threadMessages(cid, c.conversation, cfg.MessagesPerThread)
        TriggerClientEvent('sd-phone:client:messages:incoming', source,
            buildConversation(cid, myNumber, c.conversation, rows, contactMap))
    end

    local n = #convs
    notify(source, 'Messages', ('You have new messages in %d conversation%s.'):format(n, n == 1 and '' or 's'))
end

---Uploads a recorded voice message to Fivemanage and returns its hosted URL. The payload must
---be a data:audio/ URI within config.VoiceMemos.MaxAudioBytes.
---@param source number
---@param payload { audio?: string }
---@return table
function actions.uploadVoice(source, payload)
    payload = type(payload) == 'table' and payload or {}
    local audio = payload.audio
    if type(audio) ~= 'string' or audio:sub(1, 11) ~= 'data:audio/' then return fail('Bad audio payload') end

    local maxBytes = (config.VoiceMemos and config.VoiceMemos.MaxAudioBytes) or (8 * 1024 * 1024)
    if #audio > maxBytes then return fail('Recording is too long') end
    local okLimit, why = mediaLimit.check(player.getIdentifier(source), #audio)
    if not okLimit then return fail(why == 'cooldown' and 'Slow down a moment' or 'Upload limit reached') end

    local ext = audio:find('^data:audio/mpeg') and 'mp3'
        or audio:find('^data:audio/ogg') and 'ogg'
        or audio:find('^data:audio/wav') and 'wav'
        or 'webm'
    local filename = ('sdphone-msgvoice-%d-%d.%s'):format(source, os.time(), ext)

    local p = promise.new()
    uploader.uploadMedia(audio, filename, function(url, err)
        if not url then print(('^1[sd-phone:messages]^0 voice upload failed: %s'):format(tostring(err))) end
        p:resolve(url)
    end)

    local url = Citizen.Await(p)
    if not url then return fail('Upload failed') end
    return ok({ url = url })
end

return actions
