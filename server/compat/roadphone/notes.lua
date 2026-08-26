---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Player bridge (bridge.server.player): source -> acting identity.
local player = require 'bridge.server.player'
---@type table Notes persistence layer (server.notes.store): the player's own note rows.
local store = require 'server.notes.store'
---@type table Shared server helpers (server.util): id minting + trim at the shim boundary.
local util = require 'server.util'

local registerExport, stubMeta = shim.registerExport, shim.stubMeta

---@type integer RoadPhone's own metadata cap on notes, honoured here so a caller that expects the
---write to start failing at 150 sees it fail at 150.
local NOTE_CAP = 150

---@type string Empty JSON array, written into the sketch and image columns a foreign note has none of.
local EMPTY = '[]'

---The acting identity behind a source, or nil when the player is not connected.
---@param source any
---@return string|nil identity
local function identity(source)
    local src = shim.source(source)
    return src and player.getIdentifier(src) or nil
end

---sd-phone stores one note body where RoadPhone stores a title and a message, the first line being
---the title on both. The two are joined back into that single body.
---@param note table
---@return string body
local function bodyOf(note)
    local title = util.trim(note.title)
    local message = util.trim(note.message or note.body or note.text)
    if title == '' then return message end
    if message == '' then return title end
    return title .. '\n' .. message
end

---An ISO timestamp in the shape the notes table stores.
---@return string
local function now()
    return os.date('%Y-%m-%d %H:%M:%S')
end

---GetPhoneNotes(source): the player's notes, newest-edited first, as sd-phone's own rows.
registerExport('GetPhoneNotes', function(source)
    local cid = identity(source)
    return cid and store.forPlayer(cid) or {}
end)

---AddNoteToMetadata(source, note): saves a note, minting an id when the caller did not supply one.
registerExport('AddNoteToMetadata', function(source, note)
    local cid = identity(source)
    if not cid or type(note) ~= 'table' then return false end

    local body = bodyOf(note)
    if body == '' then return false end
    if store.countFor(cid) >= NOTE_CAP then return false end

    local id = tostring(note.id or util.newId(16)):sub(1, 40)
    local ts = now()
    store.upsert(cid, id, body, EMPTY, EMPTY, ts, ts)
    return true
end)

---One of a player's own notes by id, so an edit keeps the sketches and images RoadPhone knows
---nothing about instead of clearing them.
---@param cid string owner identity
---@param id string note id
---@return table|nil row
local function noteRow(cid, id)
    for _, row in ipairs(store.forPlayer(cid)) do
        if row.id == id then return row end
    end
    return nil
end

---UpdateNoteInMetadata(source, noteId, updatedNote): rewrites one of the caller's own notes. A note
---id that is not already theirs is refused rather than silently created.
registerExport('UpdateNoteInMetadata', function(source, noteId, updatedNote)
    local cid = identity(source)
    if not cid or type(updatedNote) ~= 'table' then return false end

    local id = tostring(noteId or ''):sub(1, 40)
    local row = id ~= '' and noteRow(cid, id) or nil
    if not row then return false end

    store.upsert(cid, id, bodyOf(updatedNote), row.sketches or EMPTY, row.images or EMPTY, row.created_at, now())
    return true
end)

---DeleteNoteFromMetadata(source, noteId): removes one of the caller's own notes. Idempotent.
registerExport('DeleteNoteFromMetadata', function(source, noteId)
    local cid = identity(source)
    local id = tostring(noteId or ''):sub(1, 40)
    if not cid or id == '' then return false end

    store.delete(cid, id)
    return true
end)

stubMeta('UpdatePhoneNotes', false,
    'notes are rows owned by a character, so replacing the whole list would delete every note written between the read and the write')
