---@type table Bodycam config (configs/bodycam.lua): the Recording block read here.
local CFG      = require 'configs.bodycam'
---@type table Shared server helpers (server.util): envelopes, clamps, rate limits, cleanup.
local util     = require 'server.util'
---@type table MDT permissions (server.mdt.access): identity and the read gate.
local access   = require 'server.mdt.access'
---@type table Camera seats (server.mdt.cameras): the check that a terminal actually holds the
---camera it is filing footage against.
local cameras  = require 'server.mdt.cameras'
---@type table Fivemanage upload (server.photos.uploader): the same hosting path photos, voice
---memos and call recordings already use.
local uploader = require 'server.photos.uploader'
---@type table Upload throttles (server.photos.mediaLimit): the per-citizen size and cooldown
---ceiling, the same budget photos and voice memos are spent against.
local mediaLimit = require 'server.photos.mediaLimit'
---@type table Player bridge (bridge.server.player): the uploader's identity.
local player   = require 'bridge.server.player'
---@type table Photo library (server.photos.store): where a shared clip lands when it is sent to
---somebody's handset rather than their terminal.
local photos   = require 'server.photos.store'

---@type table Recordings module; the table returned at end of file. A recording is what one
---terminal watched: the picture is rendered on the watching client, so there is no stream running
---when nobody is looking and nothing else that could be captured.
local recordings = {}

---@type table Recording knobs (configs/bodycam.lua Recording).
local REC = type(CFG.Recording) == 'table' and CFG.Recording or {}
---@type boolean Whether watches may be recorded at all.
local ENABLED = CFG.Enabled == true and REC.Enabled ~= false
---@type integer Seconds one recording may run.
local MAX_SECONDS = math.max(5, math.floor(tonumber(REC.MaxSeconds) or 300))
---@type integer Days a recording is kept, 0 meaning forever.
local KEEP_DAYS = math.max(0, math.floor(tonumber(REC.KeepDays) or 30))
---@type integer Recordings one officer may keep before the oldest is dropped.
local MAX_PER_OFFICER = math.max(1, math.floor(tonumber(REC.MaxPerOfficer) or 50))

---@type integer Ceiling on the assembled base64 payload, derived from the profile rather than
---guessed: the encoder cannot produce more than its own bitrate over its own maximum length, and
---base64 adds about a third. The slack covers container overhead and a bitrate overshoot.
local MAX_BYTES = math.floor(
    (math.max(200000, math.floor(tonumber(REC.Bitrate) or 1000000)) / 8) * MAX_SECONDS * 1.5
) + 1048576

---@type integer Slices one recording may be split into, so a client cannot announce a total that
---would have the server hold parts forever.
local MAX_SLICES <const> = 4096
---@type integer Milliseconds an unfinished assembly is kept before it is abandoned.
local ASSEMBLY_TTL_MS <const> = 120000
---@type integer Milliseconds between sweeps of abandoned assemblies.
local SWEEP_MS <const> = 30000

---@type table<integer, table> The recording each terminal is currently assembling, by server id.
---One at a time per terminal: the slices of a second recording would be indistinguishable from
---the first once they are in the same bucket.
local assembling = {}

---@type table<integer, boolean> Terminals with an upload already in flight.
local uploading = {}

---Drops whatever a terminal was assembling.
---@param src integer player server id
local function forget(src)
    assembling[src] = nil
end

---Lists a terminal's own recordings, newest first. Footage is filed against the officer it shows
---AND the terminal that took it, and the reader here is scoped to the latter: a dispatcher sees
---what they recorded. The officer it shows is on the row so it can be searched by unit.
recordings.list = access.gated('cameras.view', function(_src, payload, me)
    if not ENABLED then return util.ok({ enabled = false, recordings = {} }) end

    local officerCid = util.limitedString(payload.officerCid, 64)
    local rows

    if officerCid then
        rows = MySQL.query.await([[
            SELECT id, camera_id, kind, officer_cid, officer_name, callsign, plate, model,
                   watcher_cid, watcher_name, url, mime, duration, bytes, shared_by, created_at
            FROM phone_mdt_bodycam_recs
            WHERE watcher_cid = ? AND officer_cid = ?
            ORDER BY created_at DESC
            LIMIT 100
        ]], { me.citizenid, officerCid })
    else
        rows = MySQL.query.await([[
            SELECT id, camera_id, kind, officer_cid, officer_name, callsign, plate, model,
                   watcher_cid, watcher_name, url, mime, duration, bytes, shared_by, created_at
            FROM phone_mdt_bodycam_recs
            WHERE watcher_cid = ?
            ORDER BY created_at DESC
            LIMIT 100
        ]], { me.citizenid })
    end

    local out = {}
    for _, row in ipairs(rows or {}) do
        out[#out + 1] = {
            id          = row.id,
            cameraId    = row.camera_id,
            kind        = row.kind,
            officerCid  = row.officer_cid,
            officer     = row.officer_name,
            callsign    = row.callsign,
            plate       = row.plate,
            model       = row.model,
            watcher     = row.watcher_name,
            url         = row.url,
            mime        = row.mime,
            duration    = row.duration,
            bytes       = row.bytes,
            sharedBy    = row.shared_by,
            createdAt   = row.created_at,
        }
    end

    return util.ok({ enabled = true, recordings = out })
end)

---Shares one of the caller's own recordings: onto another officer's terminal, into their phone's
---photo library, or both. Copies rather than moves, so the sharer keeps their own copy and the
---recipient's is theirs to delete.
---
---Only ever the caller's OWN footage, and only by the id of a row they already hold: the URL is
---read from the row here rather than taken from the payload, so this cannot be used to post an
---arbitrary link into somebody else's phone.
recordings.share = access.audited('cameras.view', function(_src, payload, me)
    if not ENABLED then return util.fail('Recording is not available') end

    local id = tonumber(payload.id)
    local targetCid = util.limitedString(payload.citizenid, 64)
    local toMdt   = payload.toMdt ~= false
    local toPhone = payload.toPhone == true

    if not id then return util.fail('No such recording') end
    if not targetCid then return util.fail('Pick somebody to send it to') end
    if not toMdt and not toPhone then return util.fail('Pick where to send it') end
    if targetCid == me.citizenid then return util.fail('That is already your recording') end

    local row = MySQL.single.await([[
        SELECT camera_id, kind, officer_cid, officer_name, callsign, plate, model,
               url, mime, duration, bytes
        FROM phone_mdt_bodycam_recs
        WHERE id = ? AND watcher_cid = ?
    ]], { math.floor(id), me.citizenid })
    if not row then return util.fail('No such recording') end

    local targetSrc = player.getSourceByIdentifier(targetCid)
    local sent = {}

    if toMdt then
        -- A second row rather than a shared one: the recipient can delete their copy without
        -- taking the sharer's evidence with it.
        MySQL.insert.await([[
            INSERT INTO phone_mdt_bodycam_recs
                (camera_id, kind, officer_cid, officer_name, callsign, plate, model,
                 watcher_cid, watcher_name, url, mime, duration, bytes, shared_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ]], {
            row.camera_id, row.kind, row.officer_cid, row.officer_name, row.callsign, row.plate,
            row.model, targetCid, '', row.url, row.mime, row.duration, row.bytes, me.name,
            os.time(),
        })
        sent[#sent + 1] = 'mdt'
        if targetSrc then TriggerClientEvent('sd-phone:client:mdt:recShared', targetSrc, { by = me.name }) end
    end

    if toPhone then
        -- The photo library reads a clip's kind back off the URL extension, and a recording is
        -- hosted as .webm, so it lands as a video with no extra flag to set.
        if not photos.hasUrl(targetCid, row.url) then
            photos.insertPhoto(photos.newId(), targetCid, row.url)
        end
        sent[#sent + 1] = 'phone'
        if targetSrc then
            TriggerClientEvent('sd-phone:client:photos:added', targetSrc,
                { id = nil, url = row.url, favorite = false })
        end
    end

    return util.ok({ sent = sent }), {
        entityType = 'camera',
        entityId   = row.camera_id,
        details    = { action = 'recordingShared', to = targetCid, by = me.citizenid, sent = sent },
    }
end)

---Deletes one of the caller's own recordings. Scoped to the terminal that took it: footage is
---evidence, and one dispatcher clearing another's is not a thing this offers.
recordings.delete = access.audited('cameras.view', function(_src, payload, me)
    if not ENABLED then return util.fail('Recording is not available') end

    local id = tonumber(payload.id)
    if not id then return util.fail('No such recording') end

    local affected = MySQL.update.await(
        'DELETE FROM phone_mdt_bodycam_recs WHERE id = ? AND watcher_cid = ?',
        { math.floor(id), me.citizenid }
    )
    if not affected or affected < 1 then return util.fail('No such recording') end

    return util.ok({ id = math.floor(id) }), {
        entityType = 'camera',
        entityId   = tostring(math.floor(id)),
        details    = { action = 'recordingDeleted', by = me.citizenid },
    }
end)

---Writes the finished row and trims the officer's history back to the cap.
---@param src integer uploading terminal
---@param url string hosted media URL
---@param meta table the opening announcement, already validated
---@param bytes integer assembled payload size
---@return table|nil row
local function saveRow(src, url, meta, bytes)
    local watcherCid = player.getIdentifier(src)
    if not watcherCid then return nil end

    local now = os.time()
    local id = MySQL.insert.await([[
        INSERT INTO phone_mdt_bodycam_recs
            (camera_id, kind, officer_cid, officer_name, callsign, plate, model,
             watcher_cid, watcher_name, url, mime, duration, bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        meta.cameraId, meta.kind, meta.officerCid, meta.officer, meta.callsign, meta.plate,
        meta.model, watcherCid, player.getName(src) or '', url, meta.mime, meta.duration,
        bytes, now,
    })
    if not id then return nil end

    -- Trim this terminal's history for this officer, oldest first. Done on write rather than on a
    -- timer so the cap is felt immediately and a busy shift cannot outrun it.
    MySQL.query.await([[
        DELETE FROM phone_mdt_bodycam_recs
        WHERE watcher_cid = ? AND id NOT IN (
            SELECT id FROM (
                SELECT id FROM phone_mdt_bodycam_recs
                WHERE watcher_cid = ?
                ORDER BY created_at DESC
                LIMIT ?
            ) keep
        )
    ]], { watcherCid, watcherCid, MAX_PER_OFFICER })

    return {
        id         = id,
        cameraId   = meta.cameraId,
        kind       = meta.kind,
        officerCid = meta.officerCid,
        officer    = meta.officer,
        callsign   = meta.callsign,
        plate      = meta.plate,
        model      = meta.model,
        watcher    = player.getName(src) or '',
        url        = url,
        mime       = meta.mime,
        duration   = meta.duration,
        bytes      = bytes,
        createdAt  = now,
    }
end

---Assembles the slices in sequence order and hands the result to the uploader.
---
---Order matters and cannot be assumed: latent events are paced onto the wire independently and
---arrive in whatever order they finish, so the slices are keyed by their sequence number and only
---joined once every one of them is present.
---@param src integer uploading terminal
local function finish(src)
    local job = assembling[src]
    if not job then return end
    assembling[src] = nil

    if job.received < job.total then
        TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'The recording did not arrive in full')
        return
    end

    local parts = {}
    for seq = 1, job.total do
        local part = job.slices[seq]
        if not part then
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'The recording did not arrive in full')
            return
        end
        parts[seq] = part
    end

    -- Each slice is the base64 of a byte run whose length divides by 3, so no slice but the last
    -- carries padding and joining the strings reproduces the base64 of the whole file exactly.
    local payload = table.concat(parts)
    local dataUrl = ('data:%s;base64,%s'):format(job.meta.mime, payload)

    local cid = player.getIdentifier(src)
    local okLimit, why = mediaLimit.check(cid, #dataUrl)
    if not okLimit then
        TriggerClientEvent('sd-phone:client:mdt:recFailed', src,
            why == 'cooldown' and 'Slow down a moment' or 'Upload limit reached, try again later')
        return
    end

    local ext = job.meta.mime:find('mp4') and 'mp4' or 'webm'
    local filename = ('sdphone-bodycam-%s-%d.%s'):format(job.meta.officerCid, os.time(), ext)

    uploading[src] = true
    uploader.uploadMedia(dataUrl, filename, function(url, err)
        uploading[src] = nil
        if not url then
            print(('^1[sd-phone:mdt]^0 bodycam upload failed: %s'):format(tostring(err)))
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, err or 'Upload failed')
            return
        end

        local row = saveRow(src, url, job.meta, #dataUrl)
        if row then
            TriggerClientEvent('sd-phone:client:mdt:recSaved', src, row)
        else
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'Could not save the recording')
        end
    end)
end

if ENABLED then
    ---React -> server: a terminal announcing a finished recording and how many slices it is about
    ---to send. Everything the row will carry is settled here, from the camera the terminal is
    ---holding rather than from what it claims to have filmed.
    ---@param payload table { cameraId, mime, duration, total }
    RegisterNetEvent('sd-phone:server:mdt:recBegin', function(payload)
        local src = source
        payload = type(payload) == 'table' and payload or {}

        if uploading[src] then
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'An upload is already in progress')
            return
        end

        local id = util.limitedString(payload.cameraId, 96)
        if not id or not cameras.isWatching(src, id) then
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'That camera is not open')
            return
        end

        local kind, officerCid = cameras.split(id)
        if not kind or not officerCid then
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'That camera is not open')
            return
        end

        local total = math.floor(tonumber(payload.total) or 0)
        if total < 1 or total > MAX_SLICES then
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'That recording is too long to keep')
            return
        end

        local duration = math.floor(tonumber(payload.duration) or 0)
        if duration < 1 then duration = 1 end
        if duration > MAX_SECONDS then duration = MAX_SECONDS end

        local mime = util.limitedString(payload.mime, 64) or 'video/webm'
        if not mime:find('^video/') then mime = 'video/webm' end

        assembling[src] = {
            total    = total,
            received = 0,
            bytes    = 0,
            slices   = {},
            at       = GetGameTimer(),
            meta     = {
                cameraId   = id,
                kind       = kind,
                officerCid = officerCid,
                officer    = util.limitedString(payload.officer, 96) or officerCid,
                callsign   = util.limitedString(payload.callsign, 16),
                plate      = util.limitedString(payload.plate, 16),
                model      = util.limitedString(payload.model, 64),
                mime       = mime,
                duration   = duration,
            },
        }
    end)

    ---React -> server: one slice of the finished recording. Latent, so it is paced onto the wire
    ---rather than blocking the net thread, which is exactly why it carries its own sequence number.
    ---@param payload table { seq, part }
    RegisterNetEvent('sd-phone:server:mdt:recSlice', function(payload)
        local src = source
        local job = assembling[src]
        if not job then return end

        payload = type(payload) == 'table' and payload or {}
        local seq  = math.floor(tonumber(payload.seq) or 0)
        local part = payload.part

        if seq < 1 or seq > job.total or type(part) ~= 'string' or part == '' then return end
        if job.slices[seq] ~= nil then return end

        job.bytes = job.bytes + #part
        if job.bytes > MAX_BYTES then
            assembling[src] = nil
            TriggerClientEvent('sd-phone:client:mdt:recFailed', src, 'That recording is too large to keep')
            return
        end

        job.slices[seq] = part
        job.received = job.received + 1
        job.at = GetGameTimer()

        if job.received >= job.total then finish(src) end
    end)

    ---React -> server: abandon whatever was being assembled, for a terminal that gave up midway.
    RegisterNetEvent('sd-phone:server:mdt:recCancel', function()
        forget(source)
    end)

    -- Abandons assemblies whose terminal stopped sending, so a dropped upload cannot hold its
    -- slices in memory until the resource restarts.
    CreateThread(function()
        while true do
            Wait(SWEEP_MS)
            local now = GetGameTimer()
            for src, job in pairs(assembling) do
                if (now - job.at) > ASSEMBLY_TTL_MS then assembling[src] = nil end
            end
        end
    end)

    -- Drops recordings past the keep window, on its own slow thread. Footage nobody has come back
    -- for in a month is storage, not evidence.
    CreateThread(function()
        if KEEP_DAYS <= 0 then return end
        Wait(180000)
        while true do
            local cutoff = os.time() - (KEEP_DAYS * 86400)
            local removed = MySQL.update.await(
                'DELETE FROM phone_mdt_bodycam_recs WHERE created_at < ?', { cutoff }
            )
            if type(removed) == 'number' and removed > 0 then
                print(('^2[sd-phone:mdt]^0 pruned %d bodycam recording(s) past the keep window'):format(removed))
            end
            Wait(3600000)
        end
    end)

    util.onCleanup(function(src)
        forget(src)
        uploading[src] = nil
    end)
end

---Whether recording is switched on at all, for the routes above it.
---@return boolean
function recordings.enabled() return ENABLED end

return recordings
