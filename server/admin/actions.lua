---@type table sd-phone config root (configs/config.lua).
local config     = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name/online lookups.
local player     = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone_settings row CRUD.
local settings   = require 'server.settings.store'
---@type table Accounts persistence layer (server.accounts.store): account/session CRUD + hashing.
local acctStore  = require 'server.accounts.store'
---@type table Mail persistence layer (server.mail.store): legacy credential sync on password set.
local mailStore  = require 'server.mail.store'
---@type table Admin persistence layer (server.admin.store): paginated reads + audit writes.
local store      = require 'server.admin.store'
---@type table Mute registry (server.admin.moderation): scope mutes + guards.
local moderation = require 'server.admin.moderation'
---@type table Phone wipe (server.admin.wipe): full per-citizenid data wipe.
local wipe       = require 'server.admin.wipe'
local util       = require 'server.util'

---@type table Actions module; the table returned at end of file.
local actions = {}

local ok, fail = util.ok, util.fail

---@type integer Fixed page size for every paginated admin read; the client can't raise it.
local PAGE = 20
---@type integer Bigger page for the content feeds (app pages + Birdy), still server-capped.
local PAGE_CONTENT = 50

-- Downloadable app ids/labels, mirrored from the App Store rules (base apps are fixed).
---@type table<string, boolean> Set of installable app ids.
local DOWNLOADABLE = {}
---@type table[] UI list of downloadable apps { id, label }.
local DOWNLOADABLE_LIST = {}
for _, app in ipairs(config.Homescreen.Apps or {}) do
    if app.id and app.base ~= true then
        DOWNLOADABLE[app.id] = true
        DOWNLOADABLE_LIST[#DOWNLOADABLE_LIST + 1] = { id = app.id, label = app.label or app.id }
    end
end

---The acting admin's identity for audit rows.
---@param source number admin player server id
---@return string cid, string name
local function adminIdent(source)
    return player.getIdentifier(source) or ('src:' .. tostring(source)), player.getName(source)
end

---Trims and validates a client-supplied citizenid-shaped string.
---@param v any
---@return string|nil cid
local function cleanCid(v)
    v = util.trim(v)
    if v == '' or #v > 64 then return nil end
    return v
end

---Resolves display names for a set of citizenids: live bridge name when online, framework DB
---otherwise. Returns name map + online map in one pass.
---@param cids string[] citizenids
---@return table<string, string> names, table<string, boolean> online
local function resolveNames(cids)
    local onlineMap = player.onlineCidMap()
    local names, online, offline = {}, {}, {}
    for _, cid in ipairs(cids) do
        local src = onlineMap[cid]
        if src then
            names[cid] = player.getName(src)
            online[cid] = true
        else
            offline[#offline + 1] = cid
        end
    end
    local dbNames = store.namesFor(offline)
    for cid, name in pairs(dbNames) do names[cid] = name end
    return names, online
end

---Player listing, paginated 20 at a time. With a query (>= 2 chars): offset-paged search across
---names, citizenids, phone numbers, handles and account usernames. Without one: the most
---recently active phones, keyset-paged - the Players page's default view.
---@param source number admin player server id
---@param payload { q?: string, cursor?: string|number }|nil
---@return table envelope { players, nextCursor }
function actions.search(source, payload)
    local q = util.trim(payload and payload.q)
    if #q > 64 then q = q:sub(1, 64) end

    local hits, nextCursor
    if #q >= 2 then
        local offset = math.max(0, math.floor(tonumber(payload and payload.cursor) or 0))
        hits, nextCursor = store.searchPlayers(q, PAGE, offset)
    elseif #q == 0 then
        local cursor = payload and type(payload.cursor) == 'string' and payload.cursor or nil
        hits, nextCursor = store.listRecentPlayers(cursor, PAGE)
    else
        return fail('Type at least 2 characters')
    end

    local cids = {}
    for i, h in ipairs(hits) do cids[i] = h.citizenid end
    local names, online = resolveNames(cids)
    local numbers = settings.numbersFor(cids)

    local players = {}
    for i, h in ipairs(hits) do
        players[i] = {
            citizenid   = h.citizenid,
            name        = names[h.citizenid],
            phoneNumber = numbers[h.citizenid],
            online      = online[h.citizenid] == true,
            matchedOn   = h.matchedOn ~= 'recent' and h.matchedOn or nil,
        }
    end
    return ok({ players = players, nextCursor = nextCursor })
end

---One player's full phone overview for the detail page.
---@param source number admin player server id
---@param payload { cid?: string }|nil
---@return table envelope
function actions.overview(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end

    local data = store.playerOverview(cid) or {}
    local names, online = resolveNames({ cid })
    data.citizenid = cid
    data.name      = names[cid]
    data.online    = online[cid] == true
    data.mutes     = moderation.activeMutes(cid)
    data.downloadable = DOWNLOADABLE_LIST
    return ok(data)
end

---Reassigns a player's phone number. The number must be 10 digits and not owned by anyone else.
---@param source number admin player server id
---@param payload { cid?: string, number?: string }|nil
---@return table envelope { number }
function actions.setNumber(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local digits = util.digits(payload and payload.number)
    if #digits ~= 10 then return fail('Phone numbers are exactly 10 digits') end

    local owner = settings.getCitizenByNumber(digits)
    if owner and owner ~= cid then return fail('That number is already taken') end

    settings.setPhoneNumber(cid, digits)
    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'set-number', cid, 'new number ' .. digits)
    return ok({ number = digits })
end

---Clears a player's passcode + Face ID so they can unlock their phone again.
---@param source number admin player server id
---@param payload { cid?: string }|nil
---@return table envelope
function actions.resetPasscode(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    if store.resetPasscode(cid) == 0 then return fail('That player has no phone settings yet') end
    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'reset-passcode', cid, '')
    return ok()
end

---Installs or removes one downloadable app on a player's phone. Base apps can't be touched.
---@param source number admin player server id
---@param payload { cid?: string, id?: string, install?: boolean }|nil
---@return table envelope { installed }
function actions.setApp(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local id = payload and payload.id
    if type(id) ~= 'string' or not DOWNLOADABLE[id] then return fail('That app can\'t be managed') end
    local install = payload and payload.install == true

    local installed, keep = settings.getInstalledApps(cid) or {}, {}
    for _, existing in ipairs(installed) do
        if DOWNLOADABLE[existing] and existing ~= id then keep[#keep + 1] = existing end
    end
    if install then keep[#keep + 1] = id end
    settings.setInstalledApps(cid, keep)

    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, install and 'install-app' or 'remove-app', cid, id)
    return ok({ installed = next })
end

---Sets a new password on one app account (admin reset). The engine hash becomes authoritative;
---mail keeps its legacy hash in sync and any saved Passwords-app copies are updated, exactly
---like a player-initiated change.
---@param source number admin player server id
---@param payload { accountId?: number, password?: string }|nil
---@return table envelope
function actions.resetAccountPassword(source, payload)
    local accountId = tonumber(payload and payload.accountId)
    if not accountId then return fail('Missing account') end
    local password = payload and payload.password
    if type(password) ~= 'string' or #password < 4 or #password > 64 then
        return fail('Password must be 4-64 characters')
    end

    local acc = acctStore.getAccountById(accountId)
    if not acc then return fail('Account not found') end

    acctStore.setPassword(acc.id, acctStore.hashPassword(password))
    if acc.app == 'mail' then
        mailStore.setPasswordHash(acc.username, mailStore.hashPassword(password))
    end
    acctStore.syncVaultPassword(acc.app, acc.username, password)

    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'reset-password', nil, ('%s account %s'):format(acc.app, acc.username))
    return ok()
end

---Signs a player out of one app (or every app when no app is given).
---@param source number admin player server id
---@param payload { cid?: string, app?: string }|nil
---@return table envelope
function actions.forceLogout(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local app = payload and payload.app

    if type(app) == 'string' and app ~= '' then
        acctStore.clearSession(app, cid)
        if app == 'birdy' then store.clearBirdyLoggedIn(cid) end
    else
        app = 'all apps'
        acctStore.clearAllSessions(cid)
        store.clearBirdyLoggedIn(cid)
    end

    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'force-logout', cid, app)
    return ok()
end

---Paginated Birdy posts: the global recent feed, optionally filtered by text, or one player's
---posts when cid is given. Author names are resolved for the "who posted this" column.
---@param source number admin player server id
---@param payload { cursor?: string, q?: string, cid?: string }|nil
---@return table envelope { posts, nextCursor }
function actions.birdyPosts(source, payload)
    local q = util.trim(payload and payload.q)
    if q == '' then q = nil end
    local cid = payload and cleanCid(payload.cid) or nil

    local posts, nextCursor = store.listBirdyPosts(payload and payload.cursor, PAGE_CONTENT, q, cid)

    local cids = {}
    for _, p in ipairs(posts) do cids[#cids + 1] = p.authorCid end
    local names, online = resolveNames(cids)
    for _, p in ipairs(posts) do
        p.authorName   = names[p.authorCid]
        p.authorOnline = online[p.authorCid] == true
    end
    return ok({ posts = posts, nextCursor = nextCursor })
end

---Deletes one Birdy post (and its replies/likes/notifications).
---@param source number admin player server id
---@param payload { id?: string }|nil
---@return table envelope
function actions.birdyDeletePost(source, payload)
    local id = payload and payload.id
    if type(id) ~= 'string' or id == '' or #id > 16 then return fail('Missing post') end
    local removed = store.deleteBirdyPost(id)
    if removed == 0 then return fail('Post not found') end
    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'delete-birdy-post', nil, 'post ' .. id)
    return ok()
end

---Toggles the verified badge on a player's Birdy profile.
---@param source number admin player server id
---@param payload { cid?: string, verified?: boolean }|nil
---@return table envelope
function actions.birdySetVerified(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local verified = payload and payload.verified == true
    if store.setBirdyVerified(cid, verified) == 0 then return fail('No Birdy profile') end
    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, verified and 'birdy-verify' or 'birdy-unverify', cid, '')
    return ok()
end

---One page of an app's content for the per-app moderation pages (messages, darkchat,
---photogram, cherry, marketplace, pages). Author names resolve like everywhere else.
---@param source number admin player server id
---@param payload { app?: string, cursor?: string, q?: string }|nil
---@return table envelope { items, nextCursor, deletable }
function actions.content(source, payload)
    local app = payload and payload.app
    local known, deletable = store.contentInfo(type(app) == 'string' and app or '')
    if not known then return fail('Unknown app') end

    local q = util.trim(payload and payload.q)
    if q == '' then q = nil end
    local items, nextCursor = store.listContent(app, payload and payload.cursor, PAGE_CONTENT, q)

    local cids = {}
    for _, item in ipairs(items) do
        if item.authorCid then cids[#cids + 1] = item.authorCid end
    end
    local names, online = resolveNames(cids)
    for _, item in ipairs(items) do
        if item.authorCid then
            item.authorName   = names[item.authorCid]
            item.authorOnline = online[item.authorCid] == true
        end
    end
    return ok({ items = items, nextCursor = nextCursor, deletable = deletable })
end

---Deletes one content row from an app that allows it (darkchat message, photogram post,
---marketplace listing, pages post).
---@param source number admin player server id
---@param payload { app?: string, id?: string }|nil
---@return table envelope
function actions.contentDelete(source, payload)
    local app = payload and payload.app
    local known, deletable = store.contentInfo(type(app) == 'string' and app or '')
    if not known or not deletable then return fail('That content can\'t be deleted') end
    local id = payload and payload.id
    if (type(id) ~= 'string' and type(id) ~= 'number') or tostring(id) == '' then return fail('Missing id') end

    if store.deleteContent(app, tostring(id)) == 0 then return fail('Not found') end
    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'delete-content', nil, ('%s %s'):format(app, tostring(id)))
    return ok()
end

---One player's messages, read-only, paginated.
---@param source number admin player server id
---@param payload { cid?: string, cursor?: string }|nil
---@return table envelope { messages, nextCursor }
function actions.messages(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local messages, nextCursor = store.listMessagesFor(cid, payload and payload.cursor, PAGE)
    return ok({ messages = messages, nextCursor = nextCursor })
end

---One player's call log, read-only, paginated.
---@param source number admin player server id
---@param payload { cid?: string, cursor?: string }|nil
---@return table envelope { calls, nextCursor }
function actions.calls(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local calls, nextCursor = store.listCallsFor(cid, payload and payload.cursor, PAGE)
    return ok({ calls = calls, nextCursor = nextCursor })
end

---@type integer Longest allowed mute: one year.
local MAX_MUTE_SECS = 365 * 24 * 3600

---Mutes a player in one or more scopes, timed or permanent.
---@param source number admin player server id
---@param payload { cid?: string, scopes?: string[], duration?: number, reason?: string }|nil
---@return table envelope { mutes }
function actions.mute(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local scopes = payload and payload.scopes
    if type(scopes) ~= 'table' or #scopes == 0 then return fail('Pick at least one scope') end

    local duration = tonumber(payload and payload.duration)
    if duration then
        if not util.finite(duration) or duration <= 0 then duration = nil
        else duration = math.min(math.floor(duration), MAX_MUTE_SECS) end
    end
    local reason = util.trim(payload and payload.reason):sub(1, 200)

    local aCid, aName = adminIdent(source)
    local applied = moderation.mute(cid, scopes, duration, reason, aCid, aName)
    if applied == 0 then return fail('No valid scopes') end

    store.audit(aCid, aName, 'mute', cid, ('%s / %s / %s'):format(
        table.concat(scopes, ','),
        duration and (tostring(duration) .. 's') or 'permanent',
        reason ~= '' and reason or 'no reason'))
    return ok({ mutes = moderation.activeMutes(cid) })
end

---Lifts a player's mute in one scope, or all scopes when none is given.
---@param source number admin player server id
---@param payload { cid?: string, scope?: string }|nil
---@return table envelope { mutes }
function actions.unmute(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    local scope = payload and payload.scope
    if type(scope) ~= 'string' or scope == '' then scope = nil end

    moderation.unmute(cid, scope)
    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'unmute', cid, scope or 'all scopes')
    return ok({ mutes = moderation.activeMutes(cid) })
end

---Every active mute, paginated, with player names attached.
---@param source number admin player server id
---@param payload { cursor?: number }|nil
---@return table envelope { mutes, nextCursor }
function actions.mutes(source, payload)
    local mutes, nextCursor = moderation.listAll(tonumber(payload and payload.cursor), PAGE)
    local cids = {}
    for _, m in ipairs(mutes) do cids[#cids + 1] = m.citizenid end
    local names, online = resolveNames(cids)
    for _, m in ipairs(mutes) do
        m.name   = names[m.citizenid]
        m.online = online[m.citizenid] == true
    end
    return ok({ mutes = mutes, nextCursor = nextCursor })
end

---Wipes a player's ENTIRE phone footprint. The client must echo the citizenid back in
---payload.confirm; an online target also gets its UI local storage cleared.
---@param source number admin player server id
---@param payload { cid?: string, confirm?: string }|nil
---@return table envelope { rows }
function actions.wipePhone(source, payload)
    local cid = cleanCid(payload and payload.cid)
    if not cid then return fail('Missing player') end
    if (payload and payload.confirm) ~= cid then return fail('Confirmation mismatch') end

    local wiped, rows = wipe.wipeCid(cid)
    if not wiped then return fail('Wipe failed') end

    local tsrc = player.getSourceByIdentifier(cid)
    if tsrc then TriggerClientEvent('sd-phone:client:wipe', tsrc) end

    local aCid, aName = adminIdent(source)
    store.audit(aCid, aName, 'wipe-phone', cid, ('%d rows'):format(rows or 0))
    return ok({ rows = rows })
end

---Audit log, read-only, paginated.
---@param source number admin player server id
---@param payload { cursor?: number }|nil
---@return table envelope { entries, nextCursor }
function actions.audit(source, payload)
    local entries, nextCursor = store.listAudit(tonumber(payload and payload.cursor), PAGE)
    return ok({ entries = entries, nextCursor = nextCursor })
end

---Dashboard stats: table counts + live online player count.
---@param source number admin player server id
---@return table envelope
function actions.stats(source)
    local stats = store.stats()
    stats.online = #GetPlayers()
    return ok(stats)
end

return actions
