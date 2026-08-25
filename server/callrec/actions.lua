---@type table Call recording persistence (server.callrec.store): row CRUD.
local store  = require 'server.callrec.store'
---@type table Player bridge (bridge.server.player): citizenid lookups.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): envelopes and trimming.
local util   = require 'server.util'
---@type table Call recording config (configs.callrec).
local cfg    = require 'configs.callrec'

---@type table Actions module; the table returned at end of file.
local actions = {}

local ok, fail = util.ok, util.fail

---@type integer Recordings returned to the phone in one list call.
local LIST_LIMIT = 100

---@type table<string, boolean> Directions a recording may claim.
local DIRECTIONS = { incoming = true, outgoing = true }

---The client-facing shape of one recording. The citizenid never leaves the server.
---@param row table raw phone_call_recordings row
---@return table recording
local function toRecording(row)
    return {
        id         = tostring(row.id),
        label      = row.label,
        peerNumber = row.peer_number,
        peerName   = row.peer_name,
        direction  = row.direction,
        oneSided   = util.truthy(row.one_sided),
        url        = row.url,
        duration   = tonumber(row.duration) or 0,
        date       = os.date('!%Y-%m-%dT%H:%M:%SZ', tonumber(row.created_at)),
    }
end

---The caller's recordings, newest first. Always returns an array in `data.recordings`.
---@param src number player server id
---@return table result
function actions.list(src)
    local cid = player.getIdentifier(src)
    if not cid then return ok({ recordings = {} }) end

    local rows = store.listFor(cid, LIST_LIMIT)
    local out = {}
    for i = 1, #rows do out[i] = toRecording(rows[i]) end
    return ok({ recordings = out })
end

---Persists a finished recording once its audio is hosted. Called by the upload handler rather
---than by a client, so the URL is one this server minted.
---@param src number player server id
---@param url string hosted audio URL
---@param meta table { peerNumber?, peerName?, direction?, oneSided?, duration? } from the recorder
---@return table|nil recording the stored row, nil when it could not be saved
function actions.saveUploaded(src, url, meta)
    local cid = player.getIdentifier(src)
    if not cid then return nil end
    meta = type(meta) == 'table' and meta or {}

    -- Trimmed before the insert rather than after: the cap is a ceiling on what a character
    -- holds, and inserting first would briefly put them over it.
    local keep = math.max(1, tonumber(cfg.MaxPerPlayer) or 50)
    if store.countFor(cid) >= keep then store.trim(cid, keep - 1) end

    local duration = math.floor(tonumber(meta.duration) or 0)
    if duration ~= duration or duration < 0 then duration = 0 end
    if duration > (tonumber(cfg.MaxMinutes) or 10) * 60 then
        duration = (tonumber(cfg.MaxMinutes) or 10) * 60
    end

    local peerName = util.trim(meta.peerName)
    local id = store.insert(cid, {
        peerNumber = util.digits(tostring(meta.peerNumber or '')):sub(1, 32),
        peerName   = peerName ~= '' and peerName:sub(1, 80) or nil,
        direction  = DIRECTIONS[meta.direction] and meta.direction or 'outgoing',
        oneSided   = meta.oneSided == true,
        url        = url,
        duration   = duration,
        ts         = os.time(),
    })
    if not id then return nil end

    local rows = store.listFor(cid, 1)
    return rows[1] and toRecording(rows[1]) or nil
end

---Renames one of the caller's recordings. A blank name clears the label rather than storing an
---empty string, so the row goes back to showing who the call was with.
---@param src number player server id
---@param id any client-supplied recording id
---@param name any client-supplied label
---@return table result
function actions.rename(src, id, name)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local rowId = math.floor(tonumber(id) or 0)
    if rowId <= 0 then return fail('Missing recording') end

    local label = util.trim(name):sub(1, 120)
    if store.rename(cid, rowId, label ~= '' and label or nil) == 0 then
        return fail('Recording not found')
    end
    return ok({ id = tostring(rowId), label = label ~= '' and label or nil })
end

---Deletes one of the caller's recordings. Scoped to the citizenid, so an id alone cannot reach
---another character's row.
---@param src number player server id
---@param id any client-supplied recording id
---@return table result
function actions.delete(src, id)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local rowId = math.floor(tonumber(id) or 0)
    if rowId <= 0 then return fail('Missing recording') end
    if store.delete(cid, rowId) == 0 then return fail('Recording not found') end
    return ok({ id = tostring(rowId) })
end

return actions
