---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Notes persistence layer (server.notes.store): per-citizenid note row CRUD.
local store  = require 'server.notes.store'
---@type table Player bridge (bridge.server.player): citizenid lookups from a server id.
local player = require 'bridge.server.player'
---@type table AirShare core (server.share.core): nearby/phone-open share request handshake.
local share  = require 'server.share.core'
---@type table Shared server helpers (server.util): the per-character save budget.
local util   = require 'server.util'
---@type table Media URL ownership checks for note images that may be shared with another player.
local mediaGuard = require 'server.media.guard'
---@type table Sketch checks (server.notes.sketches): what a stored drawing may be.
local sketchCheck = require 'server.notes.sketches'

---@type table Notes config (configs/notes.lua): per-player note count + content caps.
local N = config.Notes

---@type table Actions module; the table returned at end of file. Handlers return the phone's
---{ success, message?, data? } envelope. The client owns the id and the ISO timestamps; the
---server validates, clamps and persists them, scoped to the caller's citizenid.
local actions = {}

---@type integer Upper bound (bytes) for each encoded sketches/images JSON column, just under the
---MEDIUMTEXT limit (16,777,215).
local MAX_MEDIA_JSON = 16000000
---@type integer Per-sketch ceiling. A sketch is a phone-screen PNG data URL; even a canvas
---scribbled edge to edge lands near 350 KB, so a megabyte only rejects a fabricated entry.
local MAX_SKETCH_BYTES = 1024 * 1024
---@type integer Encoded sketch data one note may hold (configs/notes.lua MaxSketchBytesPerNote).
local NOTE_SKETCH_BYTES = math.floor(tonumber(N.MaxSketchBytesPerNote) or 5 * 1024 * 1024)
---@type integer Encoded sketch data one character may keep across every note
---(configs/notes.lua MaxSketchBytesPerPlayer).
local PLAYER_SKETCH_BYTES = math.floor(tonumber(N.MaxSketchBytesPerPlayer) or 30 * 1024 * 1024)
---@type integer Per-image ceiling. An image entry is a hosted URL, not inline data, and matches
---the 512-char url column Photos stores.
local MAX_IMAGE_BYTES = 512
---@type integer, integer Rolling save budget per character. The editor autosaves 350ms after a
---pause in typing, so even a hunt-and-peck typist tops out near 170 writes a minute; 300 sits
---clear of that yet cuts a scripted flood by three orders of magnitude.
local SAVE_WINDOW, SAVE_MAX = 60000, 300

---The acting player's citizenid, resolved from src via the player bridge.
---@param src integer player server id
---@return string|nil citizenid nil when the player can't be resolved
local function cidOf(src) return player.getIdentifier(src) end

---Keeps only well-formed, non-empty strings from a client-supplied array, capped at `limit`
---entries of at most `maxLen` bytes each. An over-length entry is skipped rather than truncated,
---so a half-written data URL never reaches the column. A non-table yields an empty list.
---@param arr any client-supplied array
---@param limit integer max entries to keep
---@param maxLen integer max bytes per entry
---@return string[] out sanitized list
local function sanitizeList(arr, limit, maxLen)
    if type(arr) ~= 'table' then return {} end
    local out = {}
    for i = 1, #arr do
        local s = arr[i]
        if type(s) == 'string' and s ~= '' and #s <= maxLen then
            out[#out + 1] = s
            if #out >= limit then break end
        end
    end
    return out
end

---The valid sketches from a client-supplied list, capped at the configured count.
---@param arr any client-supplied array
---@return string[] sketches
local function cleanSketches(arr)
    return sketchCheck.clean(arr, N.MaxSketches, MAX_SKETCH_BYTES)
end

---Decodes a JSON-array text column back into a Lua array (empty on null/garbage).
---@param raw string|nil stored JSON text
---@return table arr decoded array, empty when absent or malformed
local function decodeArr(raw)
    if raw and raw ~= '' then
        local ok, decoded = pcall(json.decode, raw)
        if ok and type(decoded) == 'table' then return decoded end
    end
    return {}
end

---Whether `bytes` more sketch data still fits in a character's allowance, counting every other
---note they keep. `replacing` is the note's current sketch size: shrinking or keeping a note's
---drawings never needs the check, so a character already over the allowance can still tidy up.
---@param cid string citizenid
---@param id string|nil note being written, left out of the total
---@param bytes integer encoded size about to be stored
---@param replacing integer encoded size it replaces (0 for a new note)
---@return boolean fits
local function sketchesFit(cid, id, bytes, replacing)
    if bytes <= replacing then return true end
    return store.sketchBytesFor(cid, id) + bytes <= PLAYER_SKETCH_BYTES
end

---All of the caller's notes, newest-edited first, with every sketch on them. Read-only and heavy:
---kept for the desk link (server/compat/computers.lua), which edits a note's text and carries its
---sketches back. The phone lists through actions.summaries.
---@param src integer player server id
---@return table result envelope with { notes }
function actions.list(src)
    local cid = cidOf(src)
    if not cid then return { success = false, data = { notes = {} } } end

    local out = {}
    for _, row in ipairs(store.forPlayer(cid)) do
        out[#out + 1] = {
            id        = row.id,
            body      = row.body or '',
            sketches  = decodeArr(row.sketches),
            images    = decodeArr(row.images),
            createdAt = row.created_at,
            updatedAt = row.updated_at,
        }
    end
    return { success = true, data = { notes = out } }
end

---The caller's notes for the list, newest-edited first: text, timestamps and how many sketches and
---images each holds. Sketches stay on the server until a note is opened (actions.get). Read-only.
---@param src integer player server id
---@return table result envelope with { notes = { id, body, sketchCount, imageCount, createdAt, updatedAt }[] }
function actions.summaries(src)
    local cid = cidOf(src)
    if not cid then return { success = false, data = { notes = {} } } end

    local out = {}
    for _, row in ipairs(store.summaries(cid)) do
        out[#out + 1] = {
            id          = row.id,
            body        = row.body or '',
            sketchCount = tonumber(row.sketch_count) or 0,
            imageCount  = #decodeArr(row.images),
            createdAt   = row.created_at,
            updatedAt   = row.updated_at,
        }
    end
    return { success = true, data = { notes = out } }
end

---One of the caller's notes in full, sketches and images included, for the editor to open.
---Read-only.
---@param src integer player server id
---@param id any client-supplied note id
---@return table result envelope with { note }
function actions.get(src, id)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(id) ~= 'string' or id == '' or #id > 40 then return util.fail('notes.badNoteId', 'Bad note id') end

    local row = store.get(cid, id)
    if not row then return util.fail('notes.noteNotFound', 'Note not found') end
    return util.ok({ note = {
        id        = row.id,
        body      = row.body or '',
        sketches  = decodeArr(row.sketches),
        images    = decodeArr(row.images),
        createdAt = row.created_at,
        updatedAt = row.updated_at,
    } })
end

---Inserts or updates one of the caller's notes (PK citizenid+id). The per-player cap applies only
---to brand-new notes; timestamps fall back to server time when malformed, media JSON is size-capped.
---Sketches are written only when the payload carries them, which the phone does only when they
---changed: a save without them keeps the stored ones. When the sketches do not fit the per-note or
---per-character allowance, the text and images are saved anyway and the answer is a failure with
---`data.textSaved`, so a drawing that was refused never costs the words typed alongside it.
---@param src integer player server id
---@param payload any client-supplied note { id, body?, sketches?, images?, createdAt?, updatedAt? }
---@return table result envelope
function actions.save(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    local id = payload.id
    if type(id) ~= 'string' or id == '' or #id > 40 then return { success = false, messageKey = 'notes.badNoteId', message = 'Bad note id' } end

    if not util.rateLimit(cid, 'notes:save', SAVE_WINDOW, SAVE_MAX) then
        return { success = false, messageKey = 'notes.slowDownMoment', message = 'Slow down a moment' }
    end

    local current = store.meta(cid, id)
    if not current and store.countFor(cid) >= N.MaxNotesPerPlayer then
        return { success = false, messageKey = 'notes.noteLimitReached', message = 'Note limit reached' }
    end

    local body = type(payload.body) == 'string' and payload.body or ''
    if #body > N.MaxBodyLength then body = body:sub(1, N.MaxBodyLength) end

    local images     = mediaGuard.photos(cid, payload.images, N.MaxImages, current and decodeArr(current.images))
    local imagesJson = json.encode(images)
    if #imagesJson > MAX_MEDIA_JSON then
        return { success = false, messageKey = 'notes.noteTooLarge', message = 'Note is too large' }
    end

    local createdAt = type(payload.createdAt) == 'string' and #payload.createdAt <= 40 and payload.createdAt
        or os.date('!%Y-%m-%dT%H:%M:%S.000Z')
    local updatedAt = type(payload.updatedAt) == 'string' and #payload.updatedAt <= 40 and payload.updatedAt
        or createdAt

    if payload.sketches == nil then
        store.saveText(cid, id, body, imagesJson, createdAt, updatedAt)
        return { success = true }
    end

    local sketches     = cleanSketches(payload.sketches)
    local sketchesJson = json.encode(sketches)
    local refusal
    if #sketchesJson > NOTE_SKETCH_BYTES or #sketchesJson > MAX_MEDIA_JSON then
        refusal = util.fail('notes.drawingsTooLarge', 'These drawings are too large for one note')
    elseif not sketchesFit(cid, id, #sketchesJson, current and tonumber(current.sketch_bytes) or 0) then
        refusal = util.fail('notes.drawingStorageFull', 'Your drawing storage is full. Delete some drawings first.')
    end
    if refusal then
        store.saveText(cid, id, body, imagesJson, createdAt, updatedAt)
        refusal.data = { textSaved = true }
        return refusal
    end

    store.upsert(cid, id, body, sketchesJson, imagesJson, createdAt, updatedAt, #sketches)
    return { success = true }
end

---Deletes one of the caller's notes, scoped to citizenid + id. A missing id deletes nothing.
---@param src integer player server id
---@param id any client-supplied note id
---@return table result envelope with { id } on success
function actions.delete(src, id)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(id) ~= 'string' or id == '' then return { success = false, messageKey = 'notes.badNoteId', message = 'Bad note id' } end
    store.delete(cid, id)
    return { success = true, data = { id = id } }
end

---Opens an AirShare request offering this note's text, sketches and image URLs to a nearby
---player. Content is clamped with the same caps as a save, so only valid sketches within one
---note's allowance ever travel; delivery happens only on accept.
---@param src integer sender server id
---@param target any client-supplied recipient server id (validated by share.request)
---@param payload any client-supplied note content { body?, sketches?, images? }
---@return table result envelope
function actions.requestShare(src, target, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end

    local body = type(payload.body) == 'string' and payload.body or ''
    if #body > N.MaxBodyLength then body = body:sub(1, N.MaxBodyLength) end

    local sketches = cleanSketches(payload.sketches)
    if #json.encode(sketches) > NOTE_SKETCH_BYTES then
        return util.fail('notes.drawingsTooLarge', 'These drawings are too large for one note')
    end
    local images   = mediaGuard.photos(cid, payload.images, N.MaxImages)
    if body:gsub('%s', '') == '' and #sketches == 0 and #images == 0 then
        return { success = false, messageKey = 'notes.nothingShare', message = 'Nothing to share' }
    end

    local okSent, refusal = share.request(src, target, 'note', { body = body, sketches = sketches, images = images })
    if not okSent then
        return refusal or { success = false, messageKey = 'notes.couldNotSendRequest', message = 'Could not send request' }
    end
    return { success = true }
end

---Delivers an accepted note share as a fresh note in the recipient's list; runs only as the
---AirShare 'note' handler. The id is server-generated, the recipient's note cap and drawing
---allowance apply, and the sketches are checked again rather than trusted from the request.
---@param targetSrc number recipient server id
---@param payload { body: string, sketches: string[], images: string[] } vetted share payload
---@return boolean delivered
---@return string|nil reason shown to the recipient when the note could not be kept
function actions.deliverShare(targetSrc, payload)
    local tcid = player.getIdentifier(targetSrc)
    if not tcid then return false end
    if store.countFor(tcid) >= N.MaxNotesPerPlayer then return false end

    local body     = type(payload.body) == 'string' and payload.body or ''
    if #body > N.MaxBodyLength then body = body:sub(1, N.MaxBodyLength) end
    local sketches = cleanSketches(payload.sketches)
    local images   = sanitizeList(payload.images, N.MaxImages, MAX_IMAGE_BYTES)
    if body == '' and #sketches == 0 and #images == 0 then return false end

    local sketchesJson = json.encode(sketches)
    local imagesJson   = json.encode(images)
    if #sketchesJson > NOTE_SKETCH_BYTES or #sketchesJson > MAX_MEDIA_JSON or #imagesJson > MAX_MEDIA_JSON then return false end
    if #sketches > 0 and not sketchesFit(tcid, nil, #sketchesJson, 0) then
        return false, 'Your drawing storage is full'
    end

    local now = os.date('!%Y-%m-%dT%H:%M:%S.000Z')
    local id  = ('shr%d%d'):format(os.time(), math.random(100000, 999999))
    store.upsert(tcid, id, body, sketchesJson, imagesJson, now, now, #sketches)

    TriggerClientEvent('sd-phone:client:notes:added', targetSrc, {
        id = id, body = body, sketches = sketches, images = images, createdAt = now, updatedAt = now,
    })
    return true
end

return actions
