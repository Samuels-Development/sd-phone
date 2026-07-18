---@type table Player bridge (bridge.server.player): citizenid + online-source lookups from src.
local player    = require 'bridge.server.player'
---@type table Settings persistence (server.settings.store): citizenid -> phone-number lookups.
local settings  = require 'server.settings.store'
---@type table Banking actions (server.banking.actions): the authoritative money-transfer path.
local banking   = require 'server.banking.actions'
---@type table Accounts engine store (server.accounts.store): cherry account rows + login sessions.
local acctStore = require 'server.accounts.store'
---@type table Cherry persistence layer (server.cherry.store): profile/swipe/match/message CRUD.
local store     = require 'server.cherry.store'
---@type table Admin mute registry (server.admin.moderation): scope guards for sending messages.
local moderation = require 'server.admin.moderation'

---@type table Actions module; the table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail, trim, flag = util.ok, util.fail, util.trim, util.truthy

---@type table<string, boolean> Whitelisted profile genders - anything else falls back to 'Man'.
local GENDERS   = { Man = true, Woman = true, Nonbinary = true }
---@type table<string, boolean> Whitelisted interest settings - anything else falls back to 'Everyone'.
local INTERESTS = { Women = true, Men = true, Everyone = true }
---@type table<string, boolean> Whitelisted message kinds (text/image/gif/money/location/voice).
local VALID_KINDS = { text = true, image = true, gif = true, money = true, location = true, voice = true }
---@type table<string, boolean> Allowed reaction emoji; anything else is rejected.
local REACTION_SET = { ['❤️'] = true, ['👍'] = true, ['👎'] = true, ['😂'] = true }

---Does `interest` cover `gender`? 'Everyone' matches all, and Nonbinary profiles count toward
---both 'Women' and 'Men' seekers; otherwise Man pairs with 'Men' and Woman with 'Women'.
---@param interest string one of INTERESTS
---@param gender string one of GENDERS
---@return boolean covered
local function wants(interest, gender)
    if interest == 'Everyone' then return true end
    if gender == 'Nonbinary' then return true end
    if gender == 'Man' then return interest == 'Men' end
    return interest == 'Women'
end

---The signed-in cherry account for this player, or nil.
---@param src integer player server id
---@return table|nil account accounts-engine row { id, username, displayName, ... }
local function viewerAccount(src)
    local cid = player.getIdentifier(src)
    if not cid then return nil end
    return acctStore.getSessionAccount('cherry', cid)
end

---Profile DB row -> the React profile shape (avatar mirrors the first photo).
---@param row table phone_cherry_profiles row
---@return table profile
local function serializeProfile(row)
    local photos = store.decodeJson(row.photos)
    return {
        username     = row.username,
        name         = row.name,
        age          = tonumber(row.age) or 21,
        about        = row.about or '',
        gender       = row.gender,
        interestedIn = row.interested,
        visible      = flag(row.visible),
        photos       = photos,
        avatar       = photos[1],
    }
end

---Loads (or bootstraps) the viewer's profile. A fresh account gets a visible starter profile
---seeded from the account's display name.
---@param acc table accounts-engine account row
---@return table row phone_cherry_profiles row
local function ensureProfile(acc)
    local row = store.getProfile(acc.username)
    if row then return row end
    store.upsertProfile(acc.username, {
        name = acc.displayName ~= '' and acc.displayName or acc.username,
        age = 21, about = '', gender = 'Man', interested = 'Everyone',
        visible = true, photos = {},
    })
    return store.getProfile(acc.username)
end

---The other side of a match row, from `username`'s perspective.
---@param matchRow table phone_cherry_matches row
---@param username string one of the pair
---@return string partner the other username
local function partnerOf(matchRow, username)
    return matchRow.a == username and matchRow.b or matchRow.a
end

---Compact partner card used by the matches list and the match push; a vanished profile row
---falls back to a username-only card.
---@param username string partner's account username
---@return table card { username, name, age, gender?, photo?, about?, photos? }
local function partnerCard(username, row)
    row = row or store.getProfile(username)
    if not row then
        return { username = username, name = username, age = 0, photo = nil }
    end
    local p = serializeProfile(row)
    return {
        username = p.username, name = p.name, age = p.age, gender = p.gender,
        photo = p.avatar, about = p.about, photos = p.photos,
    }
end

---Online sources signed into `username`'s cherry account.
---@param username string account username
---@return integer[] srcs online player server ids
local function sourcesFor(username)
    local acc = acctStore.getAccount('cherry', username)
    if not acc then return {} end
    local out = {}
    for _, cid in ipairs(acctStore.sessionCitizens('cherry', acc.id)) do
        local src = player.getSourceByIdentifier(cid)
        if src then out[#out + 1] = src end
    end
    return out
end

---Banner notification on one player's phone under the Cherry app identity.
---@param src integer player server id
---@param body string banner text
local function notify(src, body)
    TriggerClientEvent('sd-phone:client:notify', src, {
        app = 'cherry', appId = 'cherry', title = 'Cherry', body = body, time = 'now',
    })
end

---@type table<integer, boolean> Players with the Cherry app on screen right now, by src.
local watchers = {}

---Marks/unmarks the caller as having Cherry on screen.
---@param src integer player server id
---@param on boolean whether the app is on screen
function actions.setWatch(src, on)
    if on then watchers[src] = true else watchers[src] = nil end
end

---Drops a departing player's watcher flag.
AddEventHandler('playerDropped', function()
    watchers[source] = nil
end)

---Message DB row -> the React `Message` shape: sanitized meta fields are flattened onto the
---message and the reactions JSON collapses to per-emoji counts with a viewer `mine` flag.
---@param row table phone_cherry_messages row
---@param viewer string viewing username (drives reactions[].mine)
---@return table msg
local function serializeMessage(row, viewer)
    local meta = store.decodeJson(row.meta)
    local msg = {
        id     = row.id,
        sender = row.sender,
        body   = row.body or '',
        kind   = row.kind or 'text',
        ts     = (tonumber(row.created_at) or 0) * 1000,
    }
    if meta.gifUrl    then msg.gifUrl    = meta.gifUrl end
    if meta.amount    then msg.amount    = meta.amount end
    if meta.requested then msg.requested = true end
    if meta.duration  then msg.duration  = meta.duration end
    if meta.audio     then msg.audioUrl  = meta.audio end
    if meta.waveform  then msg.waveform  = meta.waveform end
    if meta.wpCode    then msg.wpCode    = meta.wpCode end
    if meta.wpSub     then msg.wpSub     = meta.wpSub end

    local reactions = store.decodeJson(row.reactions)
    if next(reactions) ~= nil then
        local out = {}
        for emoji, users in pairs(reactions) do
            local mine = false
            for _, u in ipairs(users) do if u == viewer then mine = true break end end
            if #users > 0 then out[#out + 1] = { emoji = emoji, count = #users, mine = mine } end
        end
        if #out > 0 then msg.reactions = out end
    end
    return msg
end

---Banner preview line per kind (mirrors the Messages module's previews).
---@param kind string message kind
---@param body string trimmed body
---@param meta table sanitized meta
---@return string preview
local function previewFor(kind, body, meta)
    if kind == 'image'    then return '📷 Photo' end
    if kind == 'gif'      then return 'GIF' end
    if kind == 'money'    then return ((meta.requested and '💵 Requested $%d' or '💵 $%d')):format(meta.amount or 0) end
    if kind == 'voice'    then return '🎤 Voice message' end
    if kind == 'location' then return '📍 Location' end
    return body
end

---Clamps/coerces composer metadata per kind: URLs trimmed + byte-capped, voice duration and
---waveform bars clamped, waypoint strings capped, money forced to a finite capped integer.
---@param kind string whitelisted message kind
---@param payload table raw client payload
---@return table meta sanitized meta (possibly empty)
local function sanitizeMeta(kind, payload)
    local meta = {}
    if kind == 'image' or kind == 'gif' then
        local url = trim(payload.gifUrl)
        if url ~= '' then meta.gifUrl = url:sub(1, 512) end
    elseif kind == 'money' then
        local amount = tonumber(payload.amount) or 0
        if amount ~= amount or amount == math.huge or amount == -math.huge then amount = 0 end
        meta.amount = math.max(0, math.min(1000000000, math.floor(amount)))
        if payload.requested == true then meta.requested = true end
    elseif kind == 'voice' then
        meta.duration = math.max(0, math.min(36000, math.floor(tonumber(payload.duration) or 0)))
        local audio = trim(payload.audioUrl)
        if audio ~= '' then meta.audio = audio:sub(1, 512) end
        if type(payload.waveform) == 'table' then
            local bars = {}
            for i = 1, math.min(#payload.waveform, 64) do
                bars[i] = math.max(0, math.min(100, math.floor(tonumber(payload.waveform[i]) or 0)))
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

---Whether a sanitized message carries something to send for its kind.
---@param kind string message kind
---@param body string trimmed body
---@param meta table sanitized meta
---@return boolean hasContent
local function hasContent(kind, body, meta)
    if kind == 'text'                   then return body ~= '' end
    if kind == 'image' or kind == 'gif' then return meta.gifUrl ~= nil end
    if kind == 'money'                  then return (meta.amount or 0) > 0 end
    if kind == 'voice'                  then return (meta.duration or 0) > 0 end
    if kind == 'location'               then return body ~= '' or meta.wpCode ~= nil end
    return body ~= ''
end

---One serialized match: partner card + last-message preview.
---@param matchRow table phone_cherry_matches row
---@param username string viewing side
---@return table match { id, createdAt, partner, lastMessage? }
local function serializeMatch(matchRow, username, profiles)
    local last = store.lastMessage(matchRow.id)
    local partner = partnerOf(matchRow, username)
    return {
        id          = matchRow.id,
        createdAt   = (tonumber(matchRow.created_at) or 0) * 1000,
        partner     = partnerCard(partner, profiles and profiles[partner]),
        lastMessage = last and serializeMessage(last, username) or nil,
    }
end

---Everything the app needs on open: my profile (bootstrapped on first open), the swipe deck
---(interest matrix applied in both directions), my matches, and the canReset flag.
---@param src integer player server id
---@return table result { me, profile, deck, matches, canReset }
function actions.state(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end

    local mine = serializeProfile(ensureProfile(acc))

    local deck = {}
    for _, row in ipairs(store.deckCandidates(acc.username, 30)) do
        local p = serializeProfile(row)
        if wants(mine.interestedIn, p.gender) and wants(p.interestedIn, mine.gender) then
            deck[#deck + 1] = {
                id = p.username, name = p.name, age = p.age, gender = p.gender,
                bio = p.about, photos = p.photos,
            }
        end
    end

    local matchRows   = store.matchesFor(acc.username)
    local partnerNames = {}
    for i = 1, #matchRows do partnerNames[i] = partnerOf(matchRows[i], acc.username) end
    local matchProfiles = store.profilesByUsernames(partnerNames)

    local matches = {}
    for _, m in ipairs(matchRows) do
        matches[#matches + 1] = serializeMatch(m, acc.username, matchProfiles)
    end

    local canReset = #deck > 0
    if not canReset then
        for _, row in ipairs(store.potentialCandidates(acc.username, 50)) do
            local p = serializeProfile(row)
            if wants(mine.interestedIn, p.gender) and wants(p.interestedIn, mine.gender) then
                canReset = true
                break
            end
        end
    end

    return ok({ me = acc.username, profile = mine, deck = deck, matches = matches, canReset = canReset })
end

---Saves the viewer's own profile. Every field is clamped server-side: name required and capped
---at 50, age 18-99, about 300, gender/interest whitelisted, photos capped at 6 http(s) URLs.
---@param src integer player server id
---@param payload table { name, age, about, gender, interestedIn, visible, photos }
---@return table result fresh serialized profile
function actions.saveProfile(src, payload)
    payload = payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end

    local name = trim(payload.name):sub(1, 50)
    if name == '' then return fail('Name is required') end

    local photos = {}
    if type(payload.photos) == 'table' then
        for i = 1, math.min(#payload.photos, 6) do
            local url = trim(payload.photos[i])
            if url:sub(1, 4) == 'http' then photos[#photos + 1] = url:sub(1, 512) end
        end
    end

    store.upsertProfile(acc.username, {
        name       = name,
        age        = math.max(18, math.min(99, math.floor(tonumber(payload.age) or 21))),
        about      = trim(payload.about):sub(1, 300),
        gender     = GENDERS[payload.gender] and payload.gender or 'Man',
        interested = INTERESTS[payload.interestedIn] and payload.interestedIn or 'Everyone',
        visible    = payload.visible == true,
        photos     = photos,
    })
    return ok(serializeProfile(store.getProfile(acc.username)))
end

---Records a swipe on a card; mutual likes become a match and both sides learn about it live.
---The target must exist and not be blocked in either direction; match creation is idempotent.
---@param src integer player server id
---@param payload table { target: string, liked: boolean }
---@return table result { matched, match? }
function actions.swipe(src, payload)
    payload = payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end

    local target = trim(payload.target)
    if target == '' or target == acc.username then return fail('Bad target') end
    if not store.getProfile(target) then return fail('Profile not found') end
    if store.isBlocked(acc.username, target) then return fail('Profile not found') end

    local liked = payload.liked == true
    store.recordSwipe(acc.username, target, liked)
    if not liked then return ok({ matched = false }) end

    if not store.hasLiked(target, acc.username) then return ok({ matched = false }) end

    local existing = store.matchBetween(acc.username, target)
    local matchId  = existing and existing.id or store.createMatch(acc.username, target)
    local matchRow = store.getMatch(matchId)

    if not existing then
        for _, tsrc in ipairs(sourcesFor(target)) do
            TriggerClientEvent('sd-phone:client:cherry:match', tsrc, serializeMatch(matchRow, target))
            if not watchers[tsrc] then
                notify(tsrc, ("It's a match! You and %s liked each other."):format(partnerCard(acc.username).name))
            end
        end
    end

    return ok({ matched = true, match = serializeMatch(matchRow, acc.username) })
end

---Restores the named card by deleting the caller's own swipe row. A swipe that became a match
---is not rewindable.
---@param src integer player server id
---@param payload table { target: string }
---@return table result
function actions.rewind(src, payload)
    payload = payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end

    local target = trim(payload.target)
    if target == '' then return fail('Nothing to rewind') end
    if store.matchBetween(acc.username, target) then return fail('You already matched') end

    store.deleteSwipe(acc.username, target)
    return ok()
end

---Clears every one of the viewer's swipes (the deck's "Start over"). Matches persist.
---@param src integer player server id
---@return table result
function actions.resetDeck(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    store.clearSwipes(acc.username)
    return ok()
end

---Verifies the viewer belongs to a match. Type-checks the id before it touches the store.
---@param src integer player server id
---@param matchId any client-supplied match id
---@return table|nil acc viewer account (nil = not signed in or not a member)
---@return table|nil m match row
local function memberOf(src, matchId)
    local acc = viewerAccount(src)
    if not acc then return nil end
    local m = type(matchId) == 'string' and store.getMatch(matchId) or nil
    if not m or (m.a ~= acc.username and m.b ~= acc.username) then return nil end
    return acc, m
end

---A match's chat thread: the newest 100 messages, serialized oldest-first for the viewer.
---Membership gated. Read-only.
---@param src integer player server id
---@param payload table { matchId: string }
---@return table result { matchId, messages }
function actions.thread(src, payload)
    payload = payload or {}
    local acc, m = memberOf(src, payload.matchId)
    if not acc then return fail('Match not found') end
    local out = {}
    for _, row in ipairs(store.threadMessages(m.id, 100)) do
        out[#out + 1] = serializeMessage(row, acc.username)
    end
    return ok({ matchId = m.id, messages = out })
end

---Sends a chat message into a match: membership gated, whitelisted kind, capped body, sanitized
---meta. Money clears through Banking first; the partner gets a live push + banner preview.
---@param src integer player server id
---@param payload table { matchId, kind?, body?, gifUrl?, amount?, requested?, duration?, audioUrl?, waveform?, wpCode?, wpSub? }
---@return table result the serialized message
function actions.send(src, payload)
    payload = payload or {}
    local muted = moderation.guard(player.getIdentifier(src), 'cherry'); if muted then return muted end
    local acc, m = memberOf(src, payload.matchId)
    if not acc then return fail('Match not found') end

    local kind = VALID_KINDS[payload.kind] and payload.kind or 'text'
    local body = trim(payload.body):sub(1, 1000)
    local meta = sanitizeMeta(kind, payload)
    if not hasContent(kind, body, meta) then return fail('Empty message') end

    local partner = partnerOf(m, acc.username)

    if kind == 'money' and not meta.requested then
        local tsrcs = sourcesFor(partner)
        if #tsrcs == 0 then return fail('They need to be online to receive money') end
        local tcid = player.getIdentifier(tsrcs[1])
        local number = tcid and settings.getPhoneNumber(tcid)
        if not number then return fail('Payment failed') end
        local res = banking.send(src, { number = number, amount = meta.amount, note = 'Cherry payment' })
        if not res or not res.success then
            return fail(res and res.message or 'Payment failed')
        end
    end

    local id = store.newId()
    store.insertMessage(id, m.id, acc.username, kind, body, meta, os.time())
    store.pruneThread(m.id, 200)

    local msg = serializeMessage(store.getMessage(id), acc.username)
    local myName = partnerCard(acc.username).name
    for _, tsrc in ipairs(sourcesFor(partner)) do
        TriggerClientEvent('sd-phone:client:cherry:message', tsrc, { matchId = m.id, message = msg })
        notify(tsrc, ('%s: %s'):format(myName, previewFor(kind, body, meta)))
    end

    return ok(msg)
end

---Toggles the viewer's reaction on a message; both sides get the new set. Membership is
---re-derived from the message's own match row; the emoji is whitelist-checked.
---@param src integer player server id
---@param payload table { id: string, emoji: string }
---@return table result { id, reactions }
function actions.react(src, payload)
    payload = payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end

    local row = type(payload.id) == 'string' and store.getMessage(payload.id) or nil
    if not row then return fail('Message not found') end
    local m = store.getMatch(row.match_id)
    if not m or (m.a ~= acc.username and m.b ~= acc.username) then return fail('Message not found') end

    local emoji = tostring(payload.emoji or '')
    if not REACTION_SET[emoji] then return fail('Invalid reaction') end

    local reactions = store.decodeJson(row.reactions)
    local users = reactions[emoji] or {}
    local found = nil
    for i, u in ipairs(users) do if u == acc.username then found = i break end end
    if found then table.remove(users, found) else users[#users + 1] = acc.username end
    if #users > 0 then reactions[emoji] = users else reactions[emoji] = nil end
    store.updateReactions(row.id, reactions)

    local fresh = store.getMessage(row.id)
    local partner = partnerOf(m, acc.username)
    for _, tsrc in ipairs(sourcesFor(partner)) do
        TriggerClientEvent('sd-phone:client:cherry:reaction', tsrc, {
            matchId = m.id, id = row.id,
            reactions = serializeMessage(fresh, partner).reactions or {},
        })
    end

    return ok({ id = row.id, reactions = serializeMessage(fresh, acc.username).reactions or {} })
end

---Everyone the viewer has blocked, with enough profile to render a row. Read-only, scoped to
---the caller's own block rows.
---@param src integer player server id
---@return table result blocked cards { username, name, age, photo }
function actions.blockedList(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local out = {}
    for _, r in ipairs(store.blockedBy(acc.username)) do
        local photos = store.decodeJson(r.photos)
        out[#out + 1] = { username = r.username, name = r.name or r.username, age = tonumber(r.age) or 0, photo = photos[1] }
    end
    return ok(out)
end

---Lifts one of the viewer's blocks, scoped to the caller's own block row.
---@param src integer player server id
---@param payload table { username: string }
---@return table result
function actions.unblock(src, payload)
    payload = payload or {}
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    local target = trim(payload.username)
    if target == '' then return fail('Bad target') end
    store.removeBlock(acc.username, target)
    return ok()
end

---Drops a match thread for both sides and tells the partner's open app (no banner).
---@param m table match row
---@param partner string the other username
local function dissolveMatch(m, partner)
    store.deleteMatch(m.id)
    for _, tsrc in ipairs(sourcesFor(partner)) do
        TriggerClientEvent('sd-phone:client:cherry:unmatch', tsrc, { matchId = m.id })
    end
end

---Unmatches: forgets the match, thread, and the pair's swipes on each other. Membership gated.
---@param src integer player server id
---@param payload table { matchId: string }
---@return table result
function actions.unmatch(src, payload)
    payload = payload or {}
    local acc, m = memberOf(src, payload.matchId)
    if not acc then return fail('Match not found') end

    local partner = partnerOf(m, acc.username)
    store.clearPairSwipes(acc.username, partner)
    dissolveMatch(m, partner)
    return ok()
end

---Blocks a match partner: dissolves the match like an unmatch and adds a permanent block row.
---Membership gated.
---@param src integer player server id
---@param payload table { matchId: string }
---@return table result
function actions.block(src, payload)
    payload = payload or {}
    local acc, m = memberOf(src, payload.matchId)
    if not acc then return fail('Match not found') end

    local partner = partnerOf(m, acc.username)
    store.clearPairSwipes(acc.username, partner)
    store.addBlock(acc.username, partner)
    dissolveMatch(m, partner)
    return ok()
end

---Deletes the cherry account outright: profile, swipes, matches, threads, and the credentials
---via the accounts engine.
---@param src integer player server id
---@return table result
function actions.deleteAccount(src)
    local acc = viewerAccount(src)
    if not acc then return fail('Not signed in') end
    store.wipeUser(acc.username)
    acctStore.deleteAccount(acc.id)
    return ok()
end

return actions
