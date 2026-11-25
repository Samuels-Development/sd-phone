---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player         = require 'bridge.server.player'
---@type table Messages persistence layer (server.messages.store): per-mailbox row CRUD.
local messageStore   = require 'server.messages.store'
---@type table Contacts/calls persistence layer (server.contacts.store): missed-call counts.
local contactStore   = require 'server.contacts.store'
---@type table Voicemail persistence layer (server.voicemail.store): unlistened-message counts.
local voicemailStore = require 'server.voicemail.store'
---@type table Mail persistence layer (server.mail.store): inbox unread counts.
local mailStore      = require 'server.mail.store'
---@type table Groups persistence layer (server.groups.store): pending-invite counts.
local groupStore     = require 'server.groups.store'
---@type table App-accounts persistence layer (server.accounts.store): per-app session lookups.
local acctStore      = require 'server.accounts.store'
---@type table Photogram persistence layer (server.photogram.store): notification/DM counts.
local photogramStore = require 'server.photogram.store'
---@type table Vibez persistence layer (server.vibez.store): notification counts.
local vibezStore     = require 'server.vibez.store'
---@type table Birdy persistence layer (server.birdy.store): unseen-notification counts.
local birdyStore     = require 'server.birdy.store'
---@type table Shared server helpers (server.util): the disconnect sweep hook.
local util           = require 'server.util'

---@type table Badges module; the table returned at end of file.
local badges = {}

---Photogram unread = unseen Activity notifications + unread DMs, keyed by the photogram
---account signed in on this character; 0 if not signed in.
---@param cid string framework per-character id
---@return number unread
local function photogramCount(cid)
    local acc = acctStore.getSessionAccount('photogram', cid)
    if not acc then return 0 end
    return photogramStore.unseenNotificationCount(acc.username) + photogramStore.dmUnreadTotal(acc.username)
end

---Vibez unread = unseen Inbox notifications, keyed by the vibez account signed in on this
---character; 0 if not signed in.
---@param cid string framework per-character id
---@return number unread
local function vibezCount(cid)
    local acc = acctStore.getSessionAccount('vibez', cid)
    if not acc then return 0 end
    return vibezStore.unseenNotificationCount(acc.username)
end

---Birdy unread = unseen notifications, keyed by the Squawk account signed in on this character;
---0 if not signed in.
---@param cid string framework per-character id
---@return number unread
local function birdyCount(cid)
    local acc = acctStore.getSessionAccount('birdy', cid)
    if not acc then return 0 end
    return birdyStore.unseenNotificationCount(acc.username)
end

---@type table<string, fun(cid: string): number> One count resolver per home-screen app id. The
---single source of truth for both the full snapshot and a single-app push, so the two can never
---disagree about which apps carry a badge.
local counters = {
    messages  = function(cid) return messageStore.unreadCount(cid) end,
    phone     = function(cid) return contactStore.unreadMissedCount(cid) + voicemailStore.unlistenedCount(cid) end,
    mail      = function(cid) return mailStore.unreadCount(cid) end,
    groups    = function(cid) return groupStore.pendingInviteCount(cid) end,
    photogram = photogramCount,
    vibez     = vibezCount,
    birdy     = birdyCount,
}

---@type integer Backstop age (ms) past which a kept snapshot is recounted on the next fetch.
---Every write the phone makes pushes the count it changed (push or pushApp), so this only
---catches a count changed from outside sd-phone: another resource writing the tables directly.
local SNAPSHOT_MAX_AGE = 10 * 60 * 1000

---@type table<integer, { cid: string, at: integer, snap: table }> Counts per player, kept until a
---write changes them. Keyed by server id and tagged with the identity they were counted for, so
---switching to another phone (another identity) recounts instead of showing the last one's.
local memo = {}

---Per-app unread counts for one character, keyed by home-screen app id, computed straight from
---the database on every call.
---@param cid string framework per-character id
---@return { messages: number, phone: number, mail: number, groups: number, photogram: number, vibez: number, birdy: number }
function badges.snapshot(cid)
    local out = {}
    for app, count in pairs(counters) do out[app] = count(cid) end
    return out
end

---Keeps a full recount as the player's snapshot.
---@param source integer player server id
---@param cid string identity it was counted for
---@param snap table counts
local function remember(source, cid, snap)
    memo[source] = { cid = cid, at = GetGameTimer(), snap = snap }
end

---The player's kept counts, recounting only what is missing: everything when nothing is kept for
---this identity (or it is past SNAPSHOT_MAX_AGE), else just the apps badges.forget dropped.
---@param source integer player server id
---@param cid string the identity the phone is acting as
---@return table counts
local function cached(source, cid)
    local hit = memo[source]
    local age = hit and GetGameTimer() - hit.at
    if not hit or hit.cid ~= cid or age < 0 or age >= SNAPSHOT_MAX_AGE then
        local snap = badges.snapshot(cid)
        remember(source, cid, snap)
        return snap
    end
    for app, count in pairs(counters) do
        if hit.snap[app] == nil then hit.snap[app] = count(cid) end
    end
    return hit.snap
end

---Drops kept counts for an identity, so the next fetch recounts them. For a change no push
---reports, such as signing in or out of an app account.
---@param cid string framework per-character id
---@param apps string[]|nil apps to recount; nil recounts the whole snapshot
function badges.forget(cid, apps)
    for source, hit in pairs(memo) do
        if hit.cid == cid then
            if apps then
                for i = 1, #apps do hit.snap[apps[i]] = nil end
            else
                memo[source] = nil
            end
        end
    end
end

util.onCleanup(function(source) memo[source] = nil end)

---@type string[] The apps whose badge belongs to a signed-in account rather than the character.
local ACCOUNT_APPS = { 'photogram', 'vibez', 'birdy' }

---Wraps one of the account store's session writers so the badge of the app it signs in or out of
---is recounted on the next fetch. A sign-in changes whose notifications the badge counts without
---writing to any of them, so no push follows it.
---@param name string store function name
---@param cidArg integer which argument carries the citizenid (the app is always the first)
---@param allApps boolean|nil true when the writer signs out of every app at once
local function recountOnSession(name, cidArg, allApps)
    local original = acctStore[name]
    if type(original) ~= 'function' then return end
    acctStore[name] = function(...)
        local results = table.pack(original(...))
        local cid = select(cidArg, ...)
        if type(cid) == 'string' then
            badges.forget(cid, allApps and ACCOUNT_APPS or { (...) })
        end
        return table.unpack(results, 1, results.n)
    end
end

recountOnSession('setSession', 2)
recountOnSession('clearSession', 2)
recountOnSession('clearAccountSession', 2)
recountOnSession('clearAllSessions', 1, true)

---Recomputes a player's badge counts from the DB and pushes the exact numbers to their phone.
---A no-op when the source has no resolvable citizenid.
---@param source number player server id
function badges.push(source)
    if not source or source <= 0 then return end
    local cid = player.getIdentifier(source)
    if not cid then return end
    local snap = badges.snapshot(cid)
    remember(source, cid, snap)
    TriggerClientEvent('sd-phone:client:badges', source, snap)
end

---Recomputes ONE app's badge and pushes just that number, merged into whatever the phone already
---shows. A content fan-out only ever changes its own app's count, and a full snapshot costs
---about a dozen store reads (one of them an unindexed mail scan) - paid per recipient. The kept
---counts are patched in place, so the next fetch agrees with what was pushed without recounting
---the other apps.
---@param source number player server id
---@param app string home-screen app id; an unknown id is a no-op
function badges.pushApp(source, app)
    if not source or source <= 0 then return end
    local count = counters[app]
    if not count then return end
    local cid = player.getIdentifier(source)
    if not cid then return end
    local n = count(cid)
    local hit = memo[source]
    if hit and hit.cid == cid then hit.snap[app] = n end
    TriggerClientEvent('sd-phone:client:badgePatch', source, { [app] = n })
end

---Fetched by the React app on every phone open. An unresolvable caller gets all-zero counts.
---Read-only, and served from the kept counts: the full snapshot is about a dozen store reads,
---one of them an unindexed mail scan, and every write already pushed what it changed.
lib.callback.register('sd-phone:server:badges:get', function(src)
    local cid = player.getIdentifier(src)
    if not cid then return { messages = 0, phone = 0, mail = 0, groups = 0, photogram = 0, vibez = 0, birdy = 0 } end
    return cached(src, cid)
end)

---Recomputes and pushes a player's badge counts from another resource. A non-number source is
---a silent no-op.
---@param source number player server id
exports('pushBadges', function(source)
    if type(source) ~= 'number' then return end
    badges.push(source)
end)

---A player's current per-app unread counts without pushing them. Nil when the source doesn't
---resolve to a loaded character.
---@param source number player server id
---@return { messages: number, phone: number, mail: number, groups: number, photogram: number, birdy: number }|nil counts
exports('getBadgeCounts', function(source)
    if type(source) ~= 'number' then return nil end
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    local snap = badges.snapshot(cid)
    remember(source, cid, snap)
    return snap
end)

return badges
