---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player         = require 'bridge.server.player'
---@type table Messages persistence layer (server.messages.store): per-mailbox row CRUD.
local messageStore   = require 'server.messages.store'
---@type table Contacts/calls persistence layer (server.contacts.store): missed-call counts.
local contactStore   = require 'server.contacts.store'
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
    phone     = function(cid) return contactStore.unreadMissedCount(cid) end,
    mail      = function(cid) return mailStore.unreadCount(cid) end,
    groups    = function(cid) return groupStore.pendingInviteCount(cid) end,
    photogram = photogramCount,
    vibez     = vibezCount,
    birdy     = birdyCount,
}

---@type integer How long a computed snapshot stays reusable for the client-facing fetch (ms).
---Shorter than any human can re-open the phone, so nobody ever sees a stale count.
local SNAPSHOT_TTL = 2000

---@type table<string, { at: number, snap: table }> Last snapshot per citizenid. Written through by
---every push so a served snapshot can never disagree with a number already on the phone.
local memo = {}

---Per-app unread counts for one character, keyed by home-screen app id, computed straight from
---the database on every call.
---@param cid string framework per-character id
---@return { messages: number, phone: number, mail: number, groups: number, photogram: number, vibez: number, birdy: number }
function badges.snapshot(cid)
    local out = {}
    for app, count in pairs(counters) do out[app] = count(cid) end
    memo[cid] = { at = GetGameTimer(), snap = out }
    return out
end

---The last snapshot when it is younger than SNAPSHOT_TTL, otherwise a fresh one. Only the
---client-driven fetch takes this path; a server-side push always recomputes.
---@param cid string framework per-character id
---@return table counts
local function memoized(cid)
    local hit = memo[cid]
    if hit then
        local age = GetGameTimer() - hit.at
        if age >= 0 and age < SNAPSHOT_TTL then return hit.snap end
    end
    return badges.snapshot(cid)
end

-- Best effort: a character who logs out keeps no entry, and one that outlives its player is
-- recomputed on the next fetch anyway.
util.onCleanup(function(_, cid)
    if type(cid) == 'string' then memo[cid] = nil end
end)

---@type integer How often the memo drops entries the TTL already made unusable (ms).
local SWEEP_MS = 5 * 60 * 1000

-- Backstop for the sweep above, whose citizenid is best effort at disconnect. An entry past the
-- TTL is already ignored by memoized(), so dropping it here changes nothing a caller can see.
CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        local now = GetGameTimer()
        for cid, hit in pairs(memo) do
            local age = now - hit.at
            if age < 0 or age >= SNAPSHOT_TTL then memo[cid] = nil end
        end
    end
end)

---Recomputes a player's badge counts from the DB and pushes the exact numbers to their phone.
---A no-op when the source has no resolvable citizenid.
---@param source number player server id
function badges.push(source)
    if not source or source <= 0 then return end
    local cid = player.getIdentifier(source)
    if not cid then return end
    TriggerClientEvent('sd-phone:client:badges', source, badges.snapshot(cid))
end

---Recomputes ONE app's badge and pushes just that number, merged into whatever the phone already
---shows. A content fan-out only ever changes its own app's count, and a full snapshot costs seven
---store reads (one of them an unindexed mail scan) - paid per recipient.
---@param source number player server id
---@param app string home-screen app id; an unknown id is a no-op
function badges.pushApp(source, app)
    if not source or source <= 0 then return end
    local count = counters[app]
    if not count then return end
    local cid = player.getIdentifier(source)
    if not cid then return end
    local n = count(cid)
    -- Patch the memo in place rather than ageing it: the fetch must agree with what was pushed,
    -- but one app's recount says nothing about the other six.
    local hit = memo[cid]
    if hit then hit.snap[app] = n end
    TriggerClientEvent('sd-phone:client:badgePatch', source, { [app] = n })
end

---Fetched once by the React app on phone open. An unresolvable caller gets all-zero counts.
---Read-only, and memoised: the full snapshot is ten store reads, one of them an unindexed mail
---scan, so a repeat caller is served the last one.
lib.callback.register('sd-phone:server:badges:get', function(src)
    local cid = player.getIdentifier(src)
    if not cid then return { messages = 0, phone = 0, mail = 0, groups = 0, photogram = 0, vibez = 0, birdy = 0 } end
    return memoized(cid)
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
    return badges.snapshot(cid)
end)

return badges
