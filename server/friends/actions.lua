---@type table Find Friends config (configs/friends.lua): MaxFriends cap + push interval.
local config        = require 'configs.friends'
---@type table Player bridge (bridge.server.player): citizenid/name/online-source lookups.
local player        = require 'bridge.server.player'
---@type table Settings persistence (server.settings.store): phone-number <-> citizenid mapping.
local settings      = require 'server.settings.store'
---@type table Contacts persistence (server.contacts.store): the owner's saved contact cards.
local contactsStore = require 'server.contacts.store'
---@type table Messages business logic (server.messages.actions): locrequest cards + status patches.
local messages      = require 'server.messages.actions'
---@type table Find Friends persistence (server.friends.store): directed share-edge CRUD.
local store         = require 'server.friends.store'

---@type table Actions module; the table returned at end of file.
local actions = {}

---@type string[] Ring colours; mirrors FRIEND_COLORS in web/src/apps/findfriends/data.ts.
local PALETTE = {
    '#0a84ff', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2',
    '#64d2ff', '#ffd60a', '#ff6482', '#5e5ce6', '#30d158',
}

local util = require 'server.util'
local digits, flag = util.digits, util.truthy

---Stable per-character key (citizenid via the player bridge). The acting player's identity always
---comes from src - never from the payload.
---@param src number player server id
---@return string|nil citizenid or nil
local function cidOf(src) return player.getIdentifier(src) end


---Deterministic colour from the friend's citizenid.
---@param id string friend citizenid
---@return string hex colour from PALETTE
local function colorFor(id)
    local h = 0
    for i = 1, #id do h = (h * 31 + id:byte(i)) % 2147483647 end
    return PALETTE[(h % #PALETTE) + 1]
end

---number -> saved contact { name, avatar } map built from the owner's own address book.
---@param owner string owner citizenid
---@return table<string, table> map of digits-number -> { name, avatar }
local function contactInfo(owner)
    local map = {}
    for _, c in ipairs(contactsStore.listContacts(owner) or {}) do
        local n = digits(c.phone)
        if n ~= '' and c.name then map[n] = { name = c.name, avatar = c.avatar } end
    end
    return map
end

---The full roster for a player: every added friend with display info, the two directional share
---flags, and live coords for online sharing friends; incoming requests come first. Read-only.
---@param src number player server id
---@param onlineCids? table<string, number> shared citizenid->src map; the tick loop builds it once
---and passes it to every watcher, nil = build it here (for one-off callback use)
---@return table[] roster entries
function actions.snapshot(src, onlineCids)
    local owner = cidOf(src)
    if not owner then return {} end

    local contacts = contactInfo(owner)
    local sharers  = store.sharersOf(owner)
    onlineCids     = onlineCids or player.onlineCidMap()
    local nowMs    = os.time() * 1000

    local requests = store.requestsFor(owner)
    local friends  = store.friendsOf(owner)

    local cids = {}
    for i = 1, #requests do cids[#cids + 1] = requests[i] end
    for i = 1, #friends do cids[#cids + 1] = friends[i].friend end
    local numbers = settings.numbersFor(cids)

    local out, inRoster = {}, {}

    for _, rcid in ipairs(requests) do
        inRoster[rcid] = true
        local rnumber = numbers[rcid] or ''
        local card    = contacts[rnumber]
        out[#out + 1] = {
            id        = rcid,
            name      = card and card.name or (rnumber ~= '' and rnumber) or 'Friend',
            phone     = rnumber,
            color     = colorFor(rcid),
            avatar    = card and card.avatar or nil,
            youShare  = false,
            theyShare = false,
            incoming  = true,
        }
    end

    for _, row in ipairs(friends) do
        if not inRoster[row.friend] then
            local fcid      = row.friend
            local fnumber   = numbers[fcid] or ''
            local isPending = flag(row.pending)
            local theyShare = (not isPending) and sharers[fcid] == true
            local card      = contacts[fnumber]

            local entry = {
                id        = fcid,
                name      = card and card.name or (fnumber ~= '' and fnumber) or 'Friend',
                phone     = fnumber,
                color     = colorFor(fcid),
                avatar    = card and card.avatar or nil,
                youShare  = flag(row.share),
                theyShare = theyShare,
                pending   = isPending or nil,
            }

            if theyShare then
                local fsrc = onlineCids[fcid]
                if fsrc then
                    local ped = GetPlayerPed(fsrc)
                    if ped and ped ~= 0 then
                        local c = GetEntityCoords(ped)
                        entry.x, entry.y, entry.updatedAt = c.x, c.y, nowMs
                    end
                end
            end

            out[#out + 1] = entry
        end
    end
    return out
end

---Roster fetch for the app's initial load. Read-only.
---@param src number player server id
---@return table result { success, data = roster }
function actions.list(src)
    return { success = true, data = actions.snapshot(src) }
end

---Adds someone as a pending share request: the edge is stored pending and the target gets a
---`locrequest` Messages card. Rejects self-adds, duplicates and the MaxFriends cap server-side.
---@param src number player server id
---@param phone any client-supplied target number
---@return table result { success, data?, message? }
function actions.add(src, phone)
    local owner = cidOf(src)
    if not owner then return { success = false } end

    local number = digits(phone)
    if number == '' then return { success = false, message = 'Enter a number' } end

    local myNumber = digits(settings.ensurePhoneNumber(owner))
    if number == myNumber then return { success = false, message = 'That is your own number' } end

    local fcid = settings.getCitizenByNumber(number)
    if not fcid then return { success = false, message = 'No phone is registered to that number' } end
    if fcid == owner then return { success = false, message = 'That is your own number' } end

    local edge = store.edge(owner, fcid)
    if edge then
        if flag(edge.pending) then return { success = false, message = 'Request already sent' } end
        return { success = false, message = 'Already added' }
    end
    if store.count(owner) >= config.MaxFriends then
        return { success = false, message = 'Friend limit reached' }
    end

    store.add(owner, fcid, os.date('!%Y-%m-%dT%H:%M:%S.000Z'), true)

    messages.appMessage(src, number, 'locrequest', 'Location sharing request',
        { requested = true, requestStatus = 'pending' })

    return { success = true, data = actions.snapshot(src) }
end

---Accepts or declines a location-share request; only the pending edge's true target can answer.
---Accepting activates both edges, declining deletes the request; the card is patched and the requester notified.
---@param src number the responder (the request's target)
---@param msgId string|nil the responder's copy of the locrequest card
---@param phone any the requester's number (the 1:1 thread key)
---@param accept boolean
---@return table result { success, data?, message? }
function actions.respond(src, msgId, phone, accept)
    local owner = cidOf(src)
    if not owner then return { success = false } end

    local number = digits(phone)
    local rcid = number ~= '' and settings.getCitizenByNumber(number) or nil
    if not rcid then return { success = false, message = 'Request not found' } end

    local edge = store.edge(rcid, owner)
    if not edge or not flag(edge.pending) then
        return { success = false, message = 'This request is no longer active' }
    end

    if accept then
        store.accept(rcid, owner, os.date('!%Y-%m-%dT%H:%M:%S.000Z'))
    else
        store.remove(rcid, owner)
    end

    local copyId = (type(msgId) == 'string' and msgId ~= '') and msgId
        or messages.findRequestCopy(owner, number)
    if copyId then
        messages.setRequestStatus(owner, copyId, accept and 'accepted' or 'declined')
    end

    local rsrc = player.getSourceByIdentifier(rcid)
    if rsrc then
        -- Shown as the requester sees them: saved contact name, else the number - never
        -- the responder's character name.
        local myNumber = digits(settings.ensurePhoneNumber(owner))
        local card = contactInfo(rcid)[myNumber]
        local shown = card and card.name or (myNumber ~= '' and myNumber) or 'Someone'
        TriggerClientEvent('sd-phone:client:notify', rsrc, {
            app   = 'maps',
            appId = 'maps',
            title = 'Maps',
            body  = ('%s %s your location sharing request.'):format(
                shown, accept and 'accepted' or 'declined'),
            time  = 'now',
        })
    end

    return { success = true, data = actions.snapshot(src) }
end

---Share state between the caller and a number, for the Messages thread's location action sheet:
---whether an edge exists, whether it's still pending, and the two live share flags. Read-only.
---@param src number player server id
---@param phone any client-supplied peer number
---@return table result { success, data = { exists, id?, pending?, youShare?, theyShare? } }
function actions.status(src, phone)
    local owner = cidOf(src)
    if not owner then return { success = false } end

    local number = digits(phone)
    local fcid = number ~= '' and settings.getCitizenByNumber(number) or nil
    if not fcid or fcid == owner then return { success = true, data = { exists = false } } end

    local edge  = store.edge(owner, fcid)
    local redge = store.edge(fcid, owner)
    if not edge and not redge then return { success = true, data = { exists = false } } end

    local pending = edge ~= nil and flag(edge.pending)
    return { success = true, data = {
        id        = fcid,
        exists    = edge ~= nil,
        pending   = pending,
        youShare  = (edge ~= nil and not pending and flag(edge.share)) or false,
        theyShare = (redge ~= nil and not flag(redge.pending) and flag(redge.share)) or false,
    } }
end

---Drops a friend from the caller's roster by deleting only the caller's directed edge; the
---friend's reverse edge is untouched.
---@param src number player server id
---@param id any client-supplied friend citizenid
---@return table result { success, data? }
function actions.remove(src, id)
    local owner = cidOf(src)
    if not owner or type(id) ~= 'string' or id == '' then return { success = false } end
    store.remove(owner, id)
    return { success = true, data = actions.snapshot(src) }
end

---Toggles whether the caller broadcasts their location to friend `id`. Writes only the caller's
---own directed edge; `enabled` is coerced to a strict boolean.
---@param src number player server id
---@param id any client-supplied friend citizenid
---@param enabled any client-supplied flag
---@return table result { success, data? }
function actions.setShare(src, id, enabled)
    local owner = cidOf(src)
    if not owner or type(id) ~= 'string' or id == '' then return { success = false } end
    store.setShare(owner, id, enabled == true)
    return { success = true, data = actions.snapshot(src) }
end

return actions
