---@type table Shared per-character budget for every Fivemanage upload path (camera, voice memos,
---message audio). The per-app in-flight locks stop concurrent bursts; this caps SUSTAINED cost so a
---modified client can't just spam serial multi-MB uploads (slower, but unbounded) or round-robin
---between apps to dodge a single app's lock. Keyed by citizenid so a reconnect can't reset it.
local mediaLimit = {}

---@type integer Minimum gap between accepted uploads (ms). Serialises rapid fire without troubling
---a real player, who uploads a deliberate capture at a time.
local COOLDOWN_MS  = 1000
---@type integer Rolling window the byte budget is measured over (ms).
local WINDOW_MS    = 10 * 60 * 1000
---@type integer Max bytes a character may upload within one window. ~200 MB / 10 min sits far above
---any legitimate use (a handful of photos / the odd 32 MB clip) yet bounds abuse to a known ceiling.
local WINDOW_BYTES = 200 * 1024 * 1024

---@type table<string, { last: integer, events: { t: integer, bytes: integer }[] }>
local buckets = {}

---Gates + records an upload against the shared budget. Fully synchronous (no yield), so calling it
---immediately before an async upload is race-free: a concurrent request sees the recorded bytes.
---A missing / empty cid is not blocked (server-side exports, unidentified callers).
---@param cid string|nil citizenid
---@param bytes any size of the upload being attempted
---@return boolean ok true when the upload may proceed
---@return string? reason 'cooldown' | 'budget' when blocked
function mediaLimit.check(cid, bytes)
    if type(cid) ~= 'string' or cid == '' then return true end
    bytes = tonumber(bytes) or 0
    local now = GetGameTimer()
    local b = buckets[cid]
    if b and now - b.last < COOLDOWN_MS then return false, 'cooldown' end
    b = b or { last = 0, events = {} }
    buckets[cid] = b

    local kept, sum = {}, 0
    for _, e in ipairs(b.events) do
        if now - e.t < WINDOW_MS then kept[#kept + 1] = e; sum = sum + e.bytes end
    end
    b.events = kept
    if sum + bytes > WINDOW_BYTES then return false, 'budget' end

    b.last = now
    b.events[#b.events + 1] = { t = now, bytes = bytes }
    return true
end

-- Periodic sweep: drop buckets with nothing left in the window so the table can't grow unbounded.
CreateThread(function()
    while true do
        Wait(WINDOW_MS)
        local now = GetGameTimer()
        for cid, b in pairs(buckets) do
            if now - b.last >= WINDOW_MS and #b.events == 0 then buckets[cid] = nil
            elseif now - b.last >= WINDOW_MS then
                local live = false
                for _, e in ipairs(b.events) do if now - e.t < WINDOW_MS then live = true; break end end
                if not live then buckets[cid] = nil end
            end
        end
    end
end)

return mediaLimit
