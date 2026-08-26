---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table Authoritative group handlers (server.groups.actions): membership lookups.
local actions = require 'server.groups.actions'
---@type table Player bridge (bridge.server.player): identity/source resolution.
local player = require 'bridge.server.player'

local registerExport, stubExport = shim.registerExport, shim.stubExport

---@type table<number, table<string, table>> groupId -> key -> arbitrary blob. YSeries lets callers
---hang their own state off a group; sd-phone has no such column, so the shim keeps it in memory for
---the session. Deliberately NOT persisted: a caller that needs durability should own its own table.
local groupData = {}

---The sd-phone group a YSeries numeric group id refers to. sd-phone group ids are strings, so a
---numeric id is matched by its string form.
---@param groupId any
---@return table|nil
local function groupFor(groupId)
    if groupId == nil then return nil end
    return actions.getGroupForExport(tostring(groupId))
end

---GetGroupLeader(groupId): the leader's server id, nil when the group is unknown or its leader is
---offline.
registerExport('GetGroupLeader', function(groupId)
    local group = groupFor(groupId)
    local leader = group and group.leaderCitizenid
    return leader and player.getSourceByIdentifier(leader) or nil
end)

---IsGroupLeader(groupId, playerSrc): whether a player leads a group.
registerExport('IsGroupLeader', function(groupId, playerSrc)
    local group = groupFor(groupId)
    if not group or not group.leaderCitizenid then return false end
    local cid = player.getIdentifier(tonumber(playerSrc))
    return cid ~= nil and cid == group.leaderCitizenid
end)

---GetGroupMembers(groupId): every member as { source, name }, offline members included with a nil
---source, matching YSeries' "source ids and character names" shape.
registerExport('GetGroupMembers', function(groupId)
    local group = groupFor(groupId)
    if not group or type(group.members) ~= 'table' then return {} end

    local out = {}
    for _, member in ipairs(group.members) do
        local cid = member.citizenid or member.cid
        out[#out + 1] = {
            source = cid and player.getSourceByIdentifier(cid) or nil,
            name   = member.name,
        }
    end
    return out
end)

---GetGroupMembersCount(groupId): current member count, 0 when the group is unknown.
registerExport('GetGroupMembersCount', function(groupId)
    local group = groupFor(groupId)
    local members = group and group.members
    return type(members) == 'table' and #members or 0
end)

---FindGroupByMember(playerSrc): the id of the group a player is currently active in, nil when
---they are in none.
registerExport('FindGroupByMember', function(playerSrc)
    local src = tonumber(playerSrc)
    if not src then return nil end
    return actions.getActiveGroupIdFor(src)
end)

---NotifyGroup(groupId, message, timeout): a phone banner at every online member.
registerExport('NotifyGroup', function(groupId, message, timeout)
    local group = groupFor(groupId)
    if not group or type(group.members) ~= 'table' then return end

    for _, member in ipairs(group.members) do
        local cid = member.citizenid or member.cid
        local src = cid and player.getSourceByIdentifier(cid) or nil
        if src then
            TriggerClientEvent('sd-phone:client:notify', src, {
                app      = 'groups',
                appId    = 'groups',
                title    = group.name or 'Group',
                body     = message,
                duration = tonumber(timeout) or 3000,
            })
        end
    end
end)

---SetGroupData(groupId, key, data): stores an arbitrary blob against a group for this session.
registerExport('SetGroupData', function(groupId, key, data)
    if groupId == nil or type(key) ~= 'string' then return end
    local id = tostring(groupId)
    groupData[id] = groupData[id] or {}
    groupData[id][key] = data
end)

---GetGroupData(groupId, key): reads a blob stored by SetGroupData, nil when unset.
registerExport('GetGroupData', function(groupId, key)
    if groupId == nil or type(key) ~= 'string' then return nil end
    local bucket = groupData[tostring(groupId)]
    return bucket and bucket[key] or nil
end)

---DestroyGroupData(groupId, key): drops one stored blob.
registerExport('DestroyGroupData', function(groupId, key)
    if groupId == nil or type(key) ~= 'string' then return end
    local bucket = groupData[tostring(groupId)]
    if bucket then bucket[key] = nil end
end)

---SendGroupEvent(groupId, event, args): fires a client event at every online member.
registerExport('SendGroupEvent', function(groupId, event, args)
    if type(event) ~= 'string' or event == '' then return end
    local group = groupFor(groupId)
    if not group or type(group.members) ~= 'table' then return end

    for _, member in ipairs(group.members) do
        local cid = member.citizenid or member.cid
        local src = cid and player.getSourceByIdentifier(cid) or nil
        if src then TriggerClientEvent(event, src, args) end
    end
end)

-- YSeries' side-job model: a group carries a free-text job status and a stage that its own job
-- scripts drive. sd-phone groups are a roster with an active pointer and nothing else, so these
-- have nothing to read or write.
stubExport('GetJobStatus', nil, 'has no sd-phone equivalent: groups carry no job status')
stubExport('SetJobStatus', nil, 'has no sd-phone equivalent: groups carry no job status')

-- Group blips are drawn by YSeries' own client; sd-phone draws none and owns no blip registry.
stubExport('CreateBlipForGroup', nil, 'has no sd-phone equivalent: the phone draws no group blips')
stubExport('RemoveBlipForGroup', nil, 'has no sd-phone equivalent: the phone draws no group blips')
