---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Player bridge (bridge.server.player): citizenid/name lookups + online-source maps.
local player  = require 'bridge.server.player'
---@type table Groups persistence layer (server.groups.store): phone_groups row CRUD + active-group pointers.
local store   = require 'server.groups.store'

---@type table Groups app config (configs/groups.lua): member/invite caps + name length rules.
local groupsCfg = config.Groups

---@type table Actions module; the table returned at end of file.
local actions = {}

---@type string Sentinel returned to React in place of the requesting player's own citizenid.
local LOCAL_ID = 'local'

local util = require 'server.util'
local ok, fail = util.ok, util.fail


---Resolves a connected player's display name + citizenid from their server id. Returns nil for
---offline / unknown sources.
---@param source number
---@return { cid: string, name: string }|nil
local function whois(source)
    local cid  = player.getIdentifier(source)
    if not cid then return nil end
    return { cid = cid, name = player.getName(source) }
end

---Coerces a client-supplied callback payload to a table.
---@param payload any
---@return table
local function asTable(payload)
    return type(payload) == 'table' and payload or {}
end

---Reshapes a hydrated store group into the React `Group` shape, masking the viewer's citizenid
---as 'local'; with `onlineCids` each member gets an `online` flag and `onlineCount` is populated.
---@param group { id: string, name: string, leader_cid: string, color: string, members: table[] }
---@param viewerCid string
---@param onlineCids? table<string, number>
---@return { id: string, name: string, leaderId: string, leaderName: string, color: string, members: { id: string, name: string, online: boolean }[], onlineCount: number }
function actions.serializeGroup(group, viewerCid, onlineCids)
    onlineCids = onlineCids or {}
    local leaderName = 'Unknown'
    local outMembers = {}
    local onlineCount = 0

    for i = 1, #group.members do
        local m = group.members[i]
        local id = (m.citizenid == viewerCid) and LOCAL_ID or m.citizenid
        local online = onlineCids[m.citizenid] ~= nil
        if online then onlineCount = onlineCount + 1 end
        outMembers[i] = { id = id, name = m.name, online = online }
        if m.citizenid == group.leader_cid then
            leaderName = m.name
        end
    end

    local leaderId = (group.leader_cid == viewerCid) and LOCAL_ID or group.leader_cid

    return {
        id          = group.id,
        name        = group.name,
        leaderId    = leaderId,
        leaderName  = leaderName,
        color       = group.color,
        avatar      = group.avatar,
        members     = outMembers,
        onlineCount = onlineCount,
    }
end

---Reshape an `{ invite, group }` pair from the store into the React `Invite` shape.
---@param pair { invite: table, group: table }
---@return { id: string, groupId: string, groupName: string, invitedBy: string, memberCount: number, color: string }
local function serializeInvite(pair)
    return {
        id          = pair.invite.id,
        groupId     = pair.group.id,
        groupName   = pair.group.name,
        invitedBy   = pair.invite.invited_name,
        memberCount = #pair.group.members,
        color       = pair.group.color,
        avatar      = pair.group.avatar,
    }
end

actions.serializeInvite = serializeInvite

---Loads the full Groups state for one player - groups, pending invites, and active-group id -
---clearing a stale active pointer when the caller is no longer a member.
---@param source number
---@return { success: true, data: { groups: any[], invites: any[], activeGroupId: string|nil } }|{ success: false, message: string }
function actions.list(source)
    local me = whois(source); if not me then return fail('Player not found') end

    local groupRows   = store.listForMember(me.cid)
    local invitePairs = store.listInvitesFor(me.cid)
    local onlineCids  = player.onlineCidMap()

    local groups = {}
    for i = 1, #groupRows do
        groups[i] = actions.serializeGroup(groupRows[i], me.cid, onlineCids)
    end

    local invites = {}
    for i = 1, #invitePairs do
        invites[i] = serializeInvite(invitePairs[i])
    end

    local activeId = store.getActiveGroupId(me.cid)
    if activeId then
        local stillMember = false
        for i = 1, #groupRows do
            if groupRows[i].id == activeId then stillMember = true; break end
        end
        if not stillMember then
            store.clearActiveGroupForPlayer(me.cid, activeId)
            activeId = nil
        end
    end

    return ok({ groups = groups, invites = invites, activeGroupId = activeId })
end

local colorFor = util.colorFor


---Normalizes and validates a player-supplied group name: type-checked, trimmed, then
---length-gated by configs/groups.lua. Returns the trimmed name or `nil, message`.
---@param raw any
---@return string|nil normalized, string? message
local function validateName(raw)
    if type(raw) ~= 'string' then return nil, 'Group name is required' end
    local trimmed = raw:gsub('^%s+', ''):gsub('%s+$', '')
    if #trimmed < groupsCfg.MinNameLength then
        return nil, ('Group name must be at least %d characters'):format(groupsCfg.MinNameLength)
    end
    if #trimmed > groupsCfg.MaxNameLength then
        return nil, ('Group name must be %d characters or fewer'):format(groupsCfg.MaxNameLength)
    end
    return trimmed, nil
end

---Creates a new group with the caller as leader, enforcing the MaxOwnedPerPlayer cap.
---@param source number
---@param payload { name?: string }
---@return table
function actions.create(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local name, err = validateName(payload.name)
    if not name then return fail(err) end

    if store.countOwnedBy(me.cid) >= groupsCfg.MaxOwnedPerPlayer then
        return fail(('You can lead at most %d groups'):format(groupsCfg.MaxOwnedPerPlayer))
    end

    local id = store.newId()
    local members = { { citizenid = me.cid, name = me.name, joined_at = os.time() } }
    if not store.insertGroup(id, name, me.cid, colorFor(name), members) then
        return fail('Failed to create group')
    end

    local row = store.getGroup(id)
    return ok(actions.serializeGroup(row, me.cid))
end

---Sends a pending invite to the online player identified by `targetSource`. Leader-only, with
---duplicate-member, duplicate-invite, member-cap and invite-cap gates.
---@param source number
---@param payload { groupId?: string, targetSource?: number }
---@return table
function actions.invite(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local groupId = payload.groupId
    local targetSrc = tonumber(payload.targetSource)
    if not groupId or not targetSrc then
        return fail('Group id and target player id are required')
    end

    local group = store.getGroup(groupId)
    if not group then return fail('Group not found') end
    if group.leader_cid ~= me.cid then
        return fail('Only the group leader can send invites')
    end

    local target = whois(targetSrc)
    if not target then return fail('That player is not online') end
    if target.cid == me.cid then return fail('You are already in the group') end

    if store.isMember(groupId, target.cid) then
        return fail(target.name .. ' is already in the group')
    end
    if store.hasPendingInvite(groupId, target.cid) then
        return fail(target.name .. ' already has a pending invite')
    end

    if #group.members >= groupsCfg.MaxMembersPerGroup then
        return fail(('Group already at %d members'):format(groupsCfg.MaxMembersPerGroup))
    end
    if store.countInvitesForGroup(groupId) >= groupsCfg.MaxPendingInvitesPerGroup then
        return fail('Too many pending invites for this group')
    end

    local inviteId = store.newId()
    local invite = {
        id           = inviteId,
        target_cid   = target.cid,
        invited_by   = me.cid,
        invited_name = me.name,
    }
    if not store.addInvite(groupId, invite) then
        return fail('Failed to send invite')
    end

    return ok({
        invite = {
            id          = inviteId,
            groupId     = groupId,
            groupName   = group.name,
            invitedBy   = me.name,
            memberCount = #group.members,
            color       = group.color,
            avatar      = group.avatar,
        },
        targetSource = targetSrc,
    })
end

---Accepts a pending invite; only the invite's target may consume it, and the member cap is
---re-checked at accept time. Returns the joined group plus the leader's raw citizenid.
---@param source number
---@param payload { inviteId?: string }
---@return table
function actions.accept(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local hit = store.findInvite(payload.inviteId or '')
    if not hit then return fail('Invite no longer valid') end
    if hit.invite.target_cid ~= me.cid then return fail('That invite is for someone else') end

    if #hit.group.members >= groupsCfg.MaxMembersPerGroup then
        store.removeInvite(hit.invite.id)
        return fail('Group is full')
    end

    store.addMember(hit.group.id, me.cid, me.name)
    store.removeInvite(hit.invite.id)

    local row = store.getGroup(hit.group.id)
    if not row then return fail('Group was disbanded') end

    return ok({
        group  = actions.serializeGroup(row, me.cid),
        leader = row.leader_cid,
    })
end

---Declines (drops) a pending invite; only the invite's target may decline it. Idempotent.
---@param source number
---@param payload { inviteId?: string }
---@return table
function actions.decline(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local hit = store.findInvite(payload.inviteId or '')
    if hit and hit.invite.target_cid ~= me.cid then
        return fail('That invite is for someone else')
    end
    store.removeInvite(payload.inviteId or '')
    return ok()
end

---Leaves a group as a non-leader member and clears the caller's active-group pointer.
---@param source number
---@param payload { groupId?: string }
---@return table
function actions.leave(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local group = store.getGroup(payload.groupId or '')
    if not group then return fail('Group not found') end
    if group.leader_cid == me.cid then
        return fail('Leaders must disband — leave is for members')
    end
    if not store.isMember(group.id, me.cid) then
        return fail('You are not in that group')
    end

    store.removeMember(group.id, me.cid)
    store.clearActiveGroupForPlayer(me.cid, group.id)
    return ok({ groupId = group.id })
end

---Disbands a group entirely (leader-only). Returns the ex-members' citizenids and clears every
---active-group pointer to this group.
---@param source number
---@param payload { groupId?: string }
---@return table
function actions.disband(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local group = store.getGroup(payload.groupId or '')
    if not group then return fail('Group not found') end
    if group.leader_cid ~= me.cid then
        return fail('Only the leader can disband the group')
    end

    local memberCids = {}
    for i = 1, #group.members do memberCids[i] = group.members[i].citizenid end

    store.deleteGroup(group.id)
    store.clearActiveGroupEverywhere(group.id)

    return ok({ groupId = group.id, memberCids = memberCids, name = group.name })
end

---Kicks a member by citizenid (leader-only); self-kick and leader-kick are refused, the target
---must be an existing member, and the kicked player's active-group pointer is cleared.
---@param source number
---@param payload { groupId?: string, citizenid?: string }
---@return table
function actions.kick(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local group = store.getGroup(payload.groupId or '')
    if not group then return fail('Group not found') end
    if group.leader_cid ~= me.cid then
        return fail('Only the leader can remove members')
    end
    if payload.citizenid == me.cid then
        return fail('Use disband to remove yourself as leader')
    end
    if payload.citizenid == group.leader_cid then
        return fail('Cannot remove the leader')
    end
    if not store.isMember(group.id, payload.citizenid or '') then
        return fail('That player is not in the group')
    end

    store.removeMember(group.id, payload.citizenid)
    store.clearActiveGroupForPlayer(payload.citizenid, group.id)
    return ok({ groupId = group.id, citizenid = payload.citizenid })
end

---Sets a group's picture (leader-only); the URL is type-checked, trimmed and truncated to 512
---chars. Returns the member cids.
---@param source number
---@param payload { groupId?: string, avatar?: string }
---@return table
function actions.setAvatar(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local group = store.getGroup(payload.groupId or '')
    if not group then return fail('Group not found') end
    if group.leader_cid ~= me.cid then
        return fail('Only the leader can change the group photo')
    end

    local avatar = payload.avatar
    if type(avatar) ~= 'string' then return fail('A photo is required') end
    avatar = avatar:gsub('^%s+', ''):gsub('%s+$', '')
    if avatar == '' then return fail('A photo is required') end
    if #avatar > 512 then avatar = avatar:sub(1, 512) end

    if not store.setAvatar(group.id, avatar) then
        return fail('Failed to update group photo')
    end

    local memberCids = {}
    for i = 1, #group.members do memberCids[i] = group.members[i].citizenid end

    return ok({ groupId = group.id, avatar = avatar, memberCids = memberCids })
end

---Sets (or clears) the caller's active group; pass `groupId = nil` to clear. Setting requires
---membership.
---@param source number
---@param payload { groupId?: string|nil }
---@return table
function actions.setActive(source, payload)
    payload = asTable(payload)
    local me = whois(source); if not me then return fail('Player not found') end

    local groupId = payload.groupId
    if groupId == nil or groupId == '' then
        store.setActiveGroupId(me.cid, nil)
        return ok({ activeGroupId = nil })
    end

    if not store.isMember(groupId, me.cid) then
        return fail('You are not a member of that group')
    end

    if not store.setActiveGroupId(me.cid, groupId) then
        return fail('Failed to set active group')
    end
    return ok({ activeGroupId = groupId })
end

---Builds the export-ready view of a group: real citizenids plus a live `source` field per
---online member.
---@param groupId string
---@return { id: string, name: string, color: string, leaderCitizenid: string, members: { citizenid: string, name: string, source: number|nil }[] }|nil
function actions.getGroupForExport(groupId)
    local g = store.getGroup(groupId)
    if not g then return nil end
    local onlineCids = player.onlineCidMap()
    local members = {}
    for i = 1, #g.members do
        local m = g.members[i]
        members[i] = {
            citizenid = m.citizenid,
            name      = m.name,
            source    = onlineCids[m.citizenid],
        }
    end
    return {
        id              = g.id,
        name            = g.name,
        color           = g.color,
        avatar          = g.avatar,
        leaderCitizenid = g.leader_cid,
        members         = members,
    }
end

---Returns the export-view of a player's active group, or nil; a stale pointer to a disbanded
---group is cleared on the way out.
---@param source number
---@return table|nil
function actions.getActiveGroupForExport(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    local activeId = store.getActiveGroupId(cid)
    if not activeId then return nil end

    local g = actions.getGroupForExport(activeId)
    if not g then
        store.clearActiveGroupForPlayer(cid, activeId)
        return nil
    end
    return g
end

---Returns just the active group's id for a given player.
---@param source number
---@return string|nil
function actions.getActiveGroupIdFor(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    return store.getActiveGroupId(cid)
end

return actions
