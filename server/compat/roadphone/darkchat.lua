---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Dark chat persistence layer (server.darkchat.store): rooms, members and history.
local store = require 'server.darkchat.store'
---@type table Player bridge (bridge.server.player): source -> acting identity.
local player = require 'bridge.server.player'
---@type table sd-phone config root (configs/config.lua): DarkChat public rooms + history cap.
local config = require 'configs.config'

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---Resolves a RoadPhone group name to an sd-phone room id: an id first, then an invite code, then a
---public room's display name. Nil when nothing matches.
---@param name any
---@return string|nil roomId
local function roomFor(name)
    if type(name) ~= 'string' or name == '' then return nil end
    if store.roomById(name) then return name end

    local byCode = store.roomByCode(name)
    if byCode then return byCode.id end

    for _, room in ipairs(config.DarkChat.PublicRooms or {}) do
        if room.name == name or room.id == name then return room.id end
    end
    return nil
end

---getDarkchatRooms(): every room, as { id, name, members }.
---
---Only the PUBLIC rooms configs/darkchat.lua names are listed: private rooms exist to be reachable
---by invite code alone, and enumerating them here would hand any resource the guest list of every
---room on the server.
registerExport('getDarkchatRooms', function()
    warnOnce('getDarkchatRooms', ('getDarkchatRooms lists public rooms only (called by %s); private sd-phone rooms are code-gated and are deliberately not enumerated'):format(GetInvokingResource() or 'unknown'))

    local out = {}
    for _, room in ipairs(config.DarkChat.PublicRooms or {}) do
        out[#out + 1] = { id = room.id, name = room.name, members = store.memberCount(room.id) }
    end
    return out
end)

---getGroupMessages(groupname, limit?): one room's history, oldest first. `groupname` accepts a room
---id, an invite code or a public room's name.
registerExport('getGroupMessages', function(groupname, limit)
    local roomId = roomFor(groupname)
    if not roomId then return {} end

    local cap = math.max(1, math.min(200, math.floor(tonumber(limit) or config.DarkChat.HistoryLimit or 80)))
    return store.recentMessages(roomId, cap)
end)

---GetDarkchatRoomsFromMetadata(source): the rooms this player is in, as { id, name, members }. The
---room owner is stripped, and there are no unread counts: sd-phone derives an unread badge from the
---stored rows rather than parking one on the phone.
registerExport('GetDarkchatRoomsFromMetadata', function(source)
    local src = shim.source(source)
    local cid = src and player.getIdentifier(src) or nil
    if not cid then return {} end

    local out = {}
    for _, room in ipairs(store.privateRoomsFor(cid)) do
        out[#out + 1] = { id = room.id, name = room.name, members = store.memberCount(room.id) }
    end
    return out
end)

-- The group-message firehose and the metadata writes have no counterpart: sd-phone scopes dark chat
-- to room membership, so there is no all-rooms message feed to hand out and no per-phone room list
-- to overwrite.
stubExport('getDarkchatGroupmessages', {},
    'is not answered: it would return every dark chat message on the server, which sd-phone scopes to room membership')
stubExport('UpdateDarkchatRoomsInMetadata', false,
    'has no sd-phone counterpart: room membership is a stored join row, not a list kept on the phone')
stubExport('ClearDarkchatUnreadInMetadata', false,
    'has no sd-phone counterpart: dark chat unread state is derived from the stored rows rather than kept as a metadata badge')
