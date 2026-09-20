---@type integer Per-event latent send ceiling for one video chunk (bytes/s).
local CHUNK_BPS <const> = 512 * 1024
---@type number How much of the stream may sit unacknowledged before the uplink counts as behind (s).
local BACKLOG_SECONDS <const> = 1.5
---@type integer Floor on that allowance (bytes), so a low bitrate still clears its own keyframe.
local BACKLOG_FLOOR <const> = 200000
---@type integer Silence after which an unacknowledged backlog is written off (ms). An ack cannot
---normally go missing; this only stops one that somehow did from refusing the broadcast forever.
local STALE_MS <const> = 15000

---Registers the host's video chunk push for one app, with the backpressure a latent event lacks.
---
---A latent event paces ITSELF, not the ones beside it, and nothing caps how many are in flight. A
---live stream never stops producing, so on an uplink slower than the encoder the chunks overlap,
---each one runs at its full rate and re-sends what was lost, and the host's packet loss climbs for
---as long as the broadcast runs. The server acks every chunk it receives; what is sent but not
---yet acked is the backlog, and past the allowance a chunk is refused instead of queued. The page
---drops the rest of that encoder run when it is told no, because the chunks are slices of one byte
---run and a viewer cannot decode across a hole. A header is only let back in once the backlog has
---mostly drained, so a broadcast that fell behind resumes on a clear wire rather than a full one.
---@param app string app namespace ('vibez' | 'photogram')
---@param bitrate number|nil configured encode bitrate (bits/s)
return function(app, bitrate)
    ---@type integer Base64 bytes of stream per second at the configured bitrate.
    local perSecond = math.floor((tonumber(bitrate) or 900000) / 8 * 1.4)
    ---@type integer Unacknowledged bytes past which a chunk is refused.
    local backlogMax = math.max(BACKLOG_FLOOR, math.floor(perSecond * BACKLOG_SECONDS))
    ---@type integer Unacknowledged bytes a new header has to be under to be sent.
    local resumeMax = math.floor(backlogMax / 4)

    ---@type any, integer, integer The live the backlog belongs to, its unacknowledged bytes, and
    ---when it last moved.
    local liveId, pending, movedAt = nil, 0, 0

    ---Whether a chunk may go on the wire now. It is admitted on an allowance it may then exceed,
    ---so a single chunk larger than the allowance is never refused outright.
    ---@param id any live the chunk belongs to
    ---@param bytes integer chunk size
    ---@param init boolean whether it is a stream header
    ---@return boolean
    local function admit(id, bytes, init)
        local now = GetGameTimer()
        if id ~= liveId or (pending > 0 and now - movedAt > STALE_MS) then
            liveId, pending = id, 0
        end
        if pending >= (init and resumeMax or backlogMax) then return false end
        if pending == 0 then movedAt = now end
        pending = pending + bytes
        return true
    end

    ---Server push: it received a chunk of this many bytes.
    ---@param bytes integer
    RegisterNetEvent('sd-phone:client:' .. app .. ':liveAck', function(bytes)
        pending = math.max(0, pending - (tonumber(bytes) or 0))
        movedAt = GetGameTimer()
    end)

    ---Host video chunk push: relays a MediaRecorder segment to the server over a latent event;
    ---`init` marks the stream-header chunk. Answers ok = false when the uplink is behind and the
    ---chunk was not sent.
    ---@param payload table { liveId: any, chunk: string, init?: boolean, mime?: string }
    RegisterNUICallback('sd-phone:' .. app .. ':liveChunk', function(payload, cb)
        local chunk = type(payload) == 'table' and payload.chunk or nil
        if type(chunk) ~= 'string' or chunk == '' then
            cb({ ok = true })
            return
        end

        local init = payload.init == true
        if not admit(payload.liveId, #chunk, init) then
            cb({ ok = false })
            return
        end

        TriggerLatentServerEvent('sd-phone:server:' .. app .. ':liveChunk', CHUNK_BPS, {
            liveId = payload.liveId,
            chunk  = chunk,
            init   = init,
            mime   = payload.mime,
        })
        cb({ ok = true })
    end)
end
