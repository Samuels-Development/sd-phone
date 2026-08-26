---@type table ND_Core helpers; the table returned at end of file. Every ND-specific call in the
---bridge goes through here, so an upstream API change is one file to fix rather than fifteen.
local nd = {}

---@type boolean Server context. ND's getPlayer is shaped differently on the two sides: the server
---addresses a player by source, the client only ever means the local player and takes no argument.
local IS_SERVER = IsDuplicityVersion() == true

---ND's own tables, for the bridges that read character and vehicle rows directly rather than going
---through an export. `nd_characters` is keyed by charid, and `nd_vehicles.owner` is a foreign key
---onto it; ND's `nd_users` table is the ACCOUNT (one per player, many characters), which is not the
---same thing despite filling the role ESX gives its `users`.
nd.PEOPLE_TABLE = 'nd_characters'
nd.PEOPLE_ID_COL = 'charid'
nd.VEHICLE_TABLE = 'nd_vehicles'
nd.VEHICLE_ID_COL = 'owner'

---@type table<string, table>|nil Client-side memo of the replicated group definitions, dropped
---whenever ND announces a change.
local convarGroups = nil

---Whether a value read out of one of ND's TINYINT(1) columns means true. Both shapes reach here:
---oxmysql deserialises those as a boolean on current builds and as 1/0 on older ones.
---@param v any
---@return boolean
local function isTruthy(v)
    return v == true or v == 1 or v == '1'
end

nd.isTruthy = isTruthy

---Raw ND character record. `source` is required on the server and ignored on the client, which can
---only ever mean the local player. Nil when there is no loaded character.
---@param source? number player server id (server only)
---@return table|nil
function nd.player(source)
    local ok, p = pcall(function()
        if IS_SERVER then return exports.ND_Core:getPlayer(source) end
        return exports.ND_Core:getPlayer()
    end)
    return ok and p or nil
end

---The phone's identifier for a source: ND's charid, as a string. charid is the character primary
---key in `nd_characters`, and the value `nd_vehicles.owner` is a foreign key onto.
---@param source number player server id
---@return string|nil
function nd.charId(source)
    local p = nd.player(source)
    local id = p and p.id
    return id and tostring(id) or nil
end

---Every group definition ND publishes to the client, as name -> { label, isJob, ranks }. ND mirrors
---its group table into the `core:groups` replicated convar, so this needs no export or round trip.
---@return table<string, table>
local function replicatedGroups()
    if convarGroups then return convarGroups end
    local raw = GetConvar('core:groups', '')
    if raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    convarGroups = (ok and type(decoded) == 'table') and decoded or {}
    return convarGroups
end

if not IS_SERVER then
    -- ND fires this alongside the convar write, so dropping the memo is enough: the next read
    -- refills it from the convar rather than trusting the event payload.
    AddEventHandler('ND:groupsUpdated', function() convarGroups = nil end)
end

---A group's definition (label, isJob, ranks), or nil when the group is unknown. On the server this
---is ND's own cache, which carries the per-rank isBoss flags; on the client, the convar copy, which
---does not.
---@param groupName string|nil
---@return table|nil
function nd.group(groupName)
    if not groupName or groupName == '' then return nil end
    if IS_SERVER then
        local ok, g = pcall(function() return exports.ND_Core:getGroupData(groupName) end)
        if ok and type(g) == 'table' then return g end
    end
    return replicatedGroups()[groupName]
end

---Whether a group is DEFINED as a job. Read from the definition, never from the copy on a
---character: that one's `isJob` marks which single group is their ACTIVE job, so a job group added
---without the flag would read as a gang.
---@param groupName string|nil
---@return boolean
function nd.isJobGroup(groupName)
    local def = nd.group(groupName)
    return def ~= nil and isTruthy(def.isJob)
end

---Every group a character currently holds, as name -> { label, rankName, rank, isJob, isBoss,
---metadata }. Empty table when the character holds none or is nil.
---@param p table|nil ND character record
---@return table<string, table>
function nd.heldGroups(p)
    local groups = p and p.groups
    return type(groups) == 'table' and groups or {}
end

---The character's active job name and rank. ND keeps exactly one active job - setJob clears the
---isJob marker off every other group - and surfaces it as `job` plus a `jobInfo` blob.
---@param p table|nil ND character record
---@return string|nil name, integer rank
function nd.jobOf(p)
    if not p then return nil, 0 end
    local name = type(p.job) == 'string' and p.job ~= '' and p.job or nil
    if not name then return nil, 0 end
    local info = type(p.jobInfo) == 'table' and p.jobInfo or nd.heldGroups(p)[name]
    return name, tonumber(info and info.rank) or 0
end

---The character's gang: the first group they hold whose definition is not a job. ND has no gang
---concept of its own, so where a character holds several non-job groups the winner is arbitrary.
---@param p table|nil ND character record
---@return string|nil name, integer rank
function nd.gangOf(p)
    for name, group in pairs(nd.heldGroups(p)) do
        if type(name) == 'string' and not nd.isJobGroup(name) then
            return name, tonumber(group.rank) or 0
        end
    end
    return nil, 0
end

---The rank a character holds in `groupName`, or nil when they do not hold it. Distinct from rank 0:
---ND ranks start at 1, so 0 is not the "not a member" signal ox_core's grade 0 is.
---@param p table|nil ND character record
---@param groupName string
---@return integer|nil
function nd.rankIn(p, groupName)
    local group = nd.heldGroups(p)[groupName]
    if not group then return nil end
    return tonumber(group.rank) or 0
end

---Whether a rank is a boss rank of its group, read from ND's own per-rank isBoss flag. Falls back
---to the character's group entry, which caches the flag, for the client, whose copy omits it.
---@param groupName string
---@param rank integer|nil
---@param heldGroup? table the character's entry for this group, used as the fallback
---@return boolean
function nd.isBossRank(groupName, rank, heldGroup)
    rank = tonumber(rank)
    if not rank then return false end
    local def = nd.group(groupName)
    local rankData = def and type(def.ranksData) == 'table' and def.ranksData[rank]
    if rankData then return isTruthy(rankData.isBoss) end
    return heldGroup ~= nil and isTruthy(heldGroup.isBoss)
end

---The highest rank defined for a group, or 0 when the group is unknown. ND weights ranks from 1
---upward, as a `ranksData` map on the server and a `ranks` array on the client.
---@param groupName string
---@return integer
function nd.topRank(groupName)
    local def = nd.group(groupName)
    if not def then return 0 end
    local top = 0
    if type(def.ranksData) == 'table' then
        for weight in pairs(def.ranksData) do
            local n = tonumber(weight) or 0
            if n > top then top = n end
        end
    end
    if top == 0 and type(def.ranks) == 'table' then top = #def.ranks end
    return top
end

---A rank's label within a group, or nil when the group or rank is unknown.
---@param groupName string
---@param rank integer|nil
---@return string|nil
function nd.rankLabel(groupName, rank)
    rank = tonumber(rank)
    if not rank then return nil end
    local def = nd.group(groupName)
    if not def then return nil end
    local rankData = type(def.ranksData) == 'table' and def.ranksData[rank]
    if rankData and rankData.label then return rankData.label end
    return type(def.ranks) == 'table' and def.ranks[rank] or nil
end

---Every group definition ND knows about, as name -> definition. Enumerates companies for the
---Services app rather than answering a question about one player.
---@return table<string, table>
function nd.allGroups()
    if IS_SERVER then
        local ok, groups = pcall(function() return exports.ND_Core:getAllGroups() end)
        if ok and type(groups) == 'table' then return groups end
    end
    return replicatedGroups()
end

return nd
