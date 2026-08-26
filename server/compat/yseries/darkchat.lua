---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table Dark chat persistence layer (server.darkchat.store): room + message writes.
local store = require 'server.darkchat.store'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---Resolves a YSeries channel name to an sd-phone room id. YSeries addresses rooms by NAME while
---sd-phone addresses them by id, so a public room is matched on its name and anything unmatched is
---refused rather than silently creating a room.
---@param channel any
---@return string|nil roomId
local function roomFor(channel)
    if type(channel) ~= 'string' or channel == '' then return nil end

    local direct = store.roomById(channel)
    if direct then return channel end

    local byCode = store.roomByCode(channel)
    if byCode then return byCode.id end
    return nil
end

---Writes one dark-chat row as `username`. The message lands in history and appears when a viewer
---next opens the room; it is NOT pushed live.
---
---sd-phone's live fan-out walks a room-presence registry private to server/darkchat/init.lua, and
---the only reachable alternative is a broadcast to every client, which would hand a private room's
---contents to players who are not in it. A delayed message beats a leaked one.
---@param username any display name written on the message
---@param channel any room name, code or id
---@param body string message body
---@param kind string 'text' or 'location'
---@param meta table|nil kind payload, JSON-encoded on the way to the column
---@return boolean
local function post(username, channel, body, kind, meta)
    local roomId = roomFor(channel)
    if not roomId then
        warnOnce('darkchat.channel', ('dark chat channel names must match an existing room id or invite code (called by %s); the message was dropped rather than creating a room'):format(GetInvokingResource() or 'unknown'))
        return false
    end

    warnOnce('darkchat.live', ('dark chat messages sent through the compat layer are stored but not pushed live (called by %s); viewers see them when they next open the room'):format(GetInvokingResource() or 'unknown'))

    local author = type(username) == 'string' and username ~= '' and username:sub(1, 32) or 'Anonymous'
    local metaJson = (meta and next(meta) ~= nil) and json.encode(meta) or nil
    local ok = pcall(function()
        store.insertMessage(roomId, nil, author, body, os.time(), kind, metaJson)
    end)
    return ok
end

---SendDarkChatMessage(username, channel, message): posts a text row into a dark-chat room.
---
---Unlike YSeries this never generates a user for an unknown username: sd-phone nicknames are owned
---by a character, so the name is written on the message as a display label instead.
registerExport('SendDarkChatMessage', function(username, channel, message)
    local body = type(message) == 'number' and tostring(message) or message
    if type(body) ~= 'string' or body == '' then return false end
    return post(username, channel, body:sub(1, 1024), 'text', nil)
end)

---SendDarkChatLocation(username, channel, coords): posts a location row into a dark-chat room.
registerExport('SendDarkChatLocation', function(username, channel, coords)
    if type(coords) ~= 'table' and type(coords) ~= 'vector2' and type(coords) ~= 'vector3' then
        return false
    end
    local x, y = tonumber(coords.x), tonumber(coords.y)
    if not x or not y then return false end
    return post(username, channel, 'Shared a location', 'location', { x = x, y = y })
end)
