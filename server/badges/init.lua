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
---@type table Birdy persistence layer (server.birdy.store): unseen-notification counts.
local birdyStore     = require 'server.birdy.store'

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

---Per-app unread counts for one character, keyed by home-screen app id, computed straight from
---the database on every call.
---@param cid string framework per-character id
---@return { messages: number, phone: number, mail: number, groups: number, photogram: number, birdy: number }
function badges.snapshot(cid)
    return {
        messages  = messageStore.unreadCount(cid),
        phone     = contactStore.unreadMissedCount(cid),
        mail      = mailStore.unreadCount(cid),
        groups    = groupStore.pendingInviteCount(cid),
        photogram = photogramCount(cid),
        birdy     = birdyStore.unseenNotificationCount(cid),
    }
end

---Recomputes a player's badge counts from the DB and pushes the exact numbers to their phone.
---A no-op when the source has no resolvable citizenid.
---@param source number player server id
function badges.push(source)
    if not source or source <= 0 then return end
    local cid = player.getIdentifier(source)
    if not cid then return end
    TriggerClientEvent('sd-phone:client:badges', source, badges.snapshot(cid))
end

---Fetched once by the React app on phone open. An unresolvable caller gets all-zero counts.
---Read-only.
lib.callback.register('sd-phone:server:badges:get', function(src)
    local cid = player.getIdentifier(src)
    if not cid then return { messages = 0, phone = 0, mail = 0, groups = 0, photogram = 0, birdy = 0 } end
    return badges.snapshot(cid)
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
