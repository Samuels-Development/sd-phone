---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): identifier -> phone identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Groups persistence layer (server.groups.store): identity-keyed group rows, which is
---the shape gksphone's Job Center addresses even while the leader is offline.
local store = require 'server.groups.store'
---@type table Player bridge (bridge.server.player): live source resolution for group members.
local player = require 'bridge.server.player'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---Reshapes one sd-phone group row into the groupData table gksphone's Job Center hands back.
---sd-phone groups carry no job code or task list, so `jobcode` and `tasks` stay absent and a
---caller reading them falls through to its own defaults.
---@param g table|nil hydrated group row
---@return table|nil
local function groupData(g)
    if not g then return nil end

    local online = player.onlineCidMap()
    local members = {}
    for i = 1, #(g.members or {}) do
        local m = g.members[i]
        members[i] = {
            cid    = m.citizenid,
            source = online[m.citizenid],
            online = online[m.citizenid] ~= nil,
            name   = m.name,
        }
    end

    return {
        groupID  = g.id,
        name     = g.name,
        leader   = g.leader_cid,
        members  = members,
    }
end

---GetJobGroupByLeader(playerIdentifier): the group this identity leads, or nil. Identity-keyed, so
---it resolves for an offline leader.
registerExport('GetJobGroupByLeader', function(playerIdentifier)
    local cid = phones.forIdentifier(shim.text(playerIdentifier))
    if not cid then return nil end

    for _, g in ipairs(store.listForMember(cid) or {}) do
        if g.leader_cid == cid then return groupData(g) end
    end
    return nil
end)

---GetGroupByMember(playerIdentifier): the group this identity belongs to, leader or not.
registerExport('GetGroupByMember', function(playerIdentifier)
    local cid = phones.forIdentifier(shim.text(playerIdentifier))
    if not cid then return nil end
    return groupData((store.listForMember(cid) or {})[1])
end)

---DeleteJobGroup(jobcode, groupID): disbands a group and pushes the disbanded notice every online
---ex-member's cache needs. `jobcode` is ignored: sd-phone groups are not scoped to a job.
registerExport('DeleteJobGroup', function(jobcode, groupID)
    local id = shim.text(groupID)
    if not id then return false end

    if jobcode ~= nil then
        warnOnce('DeleteJobGroup.jobcode', ('DeleteJobGroup jobcode is ignored (called by %s); sd-phone groups carry no job code, so the group id alone chose the group that was disbanded'):format(shim.invoker()))
    end

    local group = store.getGroup(id)
    if not group then return false end

    store.clearActiveGroupEverywhere(id)
    store.deleteGroup(id)

    for i = 1, #(group.members or {}) do
        local memberSrc = player.getSourceByIdentifier(group.members[i].citizenid)
        if memberSrc then
            TriggerClientEvent('sd-phone:client:groups:disbanded', memberSrc, {
                groupId = id,
                name    = group.name,
            })
        end
    end
    return true
end)
