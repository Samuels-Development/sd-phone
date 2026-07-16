---@type table Groups persistence layer (server.groups.store): phone_groups row CRUD + active-group pointers.
local store   = require 'server.groups.store'
---@type table Authoritative Groups handlers (server.groups.actions): validation + permission checks.
local actions = require 'server.groups.actions'
---@type table Player bridge (bridge.server.player): citizenid lookups + cid-to-source resolution.
local player  = require 'bridge.server.player'
---@type table Badge engine (server.badges.init): recomputes + pushes home-screen unread counts.
local badges  = require 'server.badges.init'

---Schema bootstrap, run in a thread.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        print(('^1[sd-phone:groups]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:groups]^0 schema ready')
end)

---Pushes a group-related event to a single player; no-op if they're offline.
---@param src number|nil
---@param eventName string
---@param payload any
local function pushTo(src, eventName, payload)
    if not src then return end
    TriggerClientEvent(eventName, src, payload)
end

-- Authoritative NUI-facing callbacks: validation + permission checks live in server.groups.actions.
lib.callback.register('sd-phone:server:groups:list', function(src)
    return actions.list(src)
end)

lib.callback.register('sd-phone:server:groups:create', function(src, payload)
    return actions.create(src, payload)
end)

---Sends an invite, then alerts the online target: an inviteReceived push, a notification
---banner, and a badge recount. `targetSource` is stripped from the response.
lib.callback.register('sd-phone:server:groups:invite', function(src, payload)
    local result = actions.invite(src, payload)
    if result.success and result.data and result.data.invite then
        local targetSrc = result.data.targetSource
        local inv = result.data.invite
        pushTo(targetSrc, 'sd-phone:client:groups:inviteReceived', inv)
        pushTo(targetSrc, 'sd-phone:client:notify', {
            app   = 'groups',
            appId = 'groups',
            title = inv.groupName or 'Group invite',
            body  = ('%s invited you to join'):format(inv.invitedBy or 'Someone'),
            time  = 'now',
        })
        badges.push(targetSrc)
        result.data = { invite = inv }
    end
    return result
end)

---Accepts an invite. On success the online leader gets a memberJoined push and the leader's
---raw citizenid is stripped from the response; the badge recount runs on success and failure.
lib.callback.register('sd-phone:server:groups:accept', function(src, payload)
    local result = actions.accept(src, payload)
    if result.success and result.data then
        local leaderSrc = player.getSourceByIdentifier(result.data.leader)
        pushTo(leaderSrc, 'sd-phone:client:groups:memberJoined', {
            groupId = result.data.group.id,
        })
        result.data = { group = result.data.group }
    end
    badges.push(src)
    return result
end)

---Declines an invite and recounts the caller's Groups badge.
lib.callback.register('sd-phone:server:groups:decline', function(src, payload)
    local result = actions.decline(src, payload)
    badges.push(src)
    return result
end)

---Leaves a group (member-only) and pushes memberLeft to the group's online leader.
lib.callback.register('sd-phone:server:groups:leave', function(src, payload)
    local result = actions.leave(src, payload)
    if result.success and result.data then
        local group = store.getGroup(result.data.groupId)
        if group then
            local leaderSrc = player.getSourceByIdentifier(group.leader_cid)
            pushTo(leaderSrc, 'sd-phone:client:groups:memberLeft', {
                groupId = result.data.groupId,
            })
        end
    end
    return result
end)

---Disbands a group and pushes a disbanded notice to every other online ex-member; the
---member-cid list is stripped from the response.
lib.callback.register('sd-phone:server:groups:disband', function(src, payload)
    local result = actions.disband(src, payload)
    if result.success and result.data then
        for i = 1, #result.data.memberCids do
            local cid = result.data.memberCids[i]
            local memberSrc = player.getSourceByIdentifier(cid)
            if memberSrc and memberSrc ~= src then
                pushTo(memberSrc, 'sd-phone:client:groups:disbanded', {
                    groupId = result.data.groupId,
                    name    = result.data.name,
                })
            end
        end
        result.data = { groupId = result.data.groupId }
    end
    return result
end)

---Kicks a member by citizenid and pushes the online kicked player a kicked notice.
lib.callback.register('sd-phone:server:groups:kick', function(src, payload)
    local result = actions.kick(src, payload)
    if result.success and result.data then
        local kickedSrc = player.getSourceByIdentifier(result.data.citizenid)
        pushTo(kickedSrc, 'sd-phone:client:groups:kicked', {
            groupId = result.data.groupId,
        })
    end
    return result
end)

---Changes the group photo and pushes an updated notice to every other online member; member
---cids are stripped from the response.
lib.callback.register('sd-phone:server:groups:setAvatar', function(src, payload)
    local result = actions.setAvatar(src, payload)
    if result.success and result.data then
        for i = 1, #result.data.memberCids do
            local cid = result.data.memberCids[i]
            local memberSrc = player.getSourceByIdentifier(cid)
            if memberSrc and memberSrc ~= src then
                pushTo(memberSrc, 'sd-phone:client:groups:updated', {
                    groupId = result.data.groupId,
                })
            end
        end
        result.data = { groupId = result.data.groupId, avatar = result.data.avatar }
    end
    return result
end)

-- Thin delegates: active-group selection and the active-id read.
lib.callback.register('sd-phone:server:groups:setActive', function(src, payload)
    return actions.setActive(src, payload)
end)

lib.callback.register('sd-phone:server:groups:activeId', function(src)
    return actions.getActiveGroupIdFor(src)
end)

---Returns the full export-view (real citizenids + live member sources) for the caller's
---client-side cache. Membership-gated; non-members get nil.
lib.callback.register('sd-phone:server:groups:exportView', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(src)
    if not cid or not store.isMember(payload.groupId or '', cid) then return nil end
    return actions.getGroupForExport(payload.groupId or '')
end)

-- Server-side exports for other resources, returning the unmasked export view.
---@param source number player whose active group is requested
---@return table|nil export-view of the player's active group
exports('getActiveGroup', function(source)
    return actions.getActiveGroupForExport(source)
end)

---@param source number player whose active group id is requested
---@return string|nil cached id, nil if no active group set
exports('getActiveGroupId', function(source)
    return actions.getActiveGroupIdFor(source)
end)

---@param groupId string
---@return table|nil export-view of the named group
exports('getGroup', function(groupId)
    return actions.getGroupForExport(groupId)
end)
