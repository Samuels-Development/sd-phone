---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table MDT permissions (server.mdt.access): identity, the handler wrappers, the audience.
local access = require 'server.mdt.access'
---@type table Shared server helpers (server.util): envelopes, clamps, cooldowns, ids.
local util   = require 'server.util'

---@type table Dispatch module; the table returned at end of file. The CAD lives entirely in
---memory: no table is read or written by anything in this file.
local dispatch = {}

---@type table Dispatch config (configs/mdt.lua): TTL, board size, callsign format.
local DISPATCH = (config.Mdt.Dispatch or {})
---@type integer Seconds a call stays on the board before it auto-expires.
local CALL_TTL = math.max(30, math.floor(tonumber(DISPATCH.CallTTL) or 900))
---@type integer Calls the board holds at once; creating past this drops the least urgent.
local MAX_CALLS = math.max(1, math.floor(tonumber(DISPATCH.MaxCalls) or 60))
---@type integer Mirrored calls - the ones bridge/server/dispatch.lua files from a third-party
---dispatch resource - the board holds at once. A ceiling of their own, trimmed before the board's:
---every entry point that produces one is a net event a client can forge, so mirroring is strictly
---additive and may only ever evict itself. Half the board, so a genuine call is never short of room.
local MAX_INGESTED = math.max(1, math.floor(MAX_CALLS / 2))

---@type integer The mirrored ceiling above, read by the ingest bridge so the figure it warns about
---at load is the figure this board actually enforces rather than a second copy of the same sum.
dispatch.ingestBudget = MAX_INGESTED
---@type integer Milliseconds a full-state broadcast is coalesced over.
local FLUSH_MS = 150
---@type integer Minimum gap between accepted 10-code changes, in ms.
local STATUS_GAP = 1500
---@type boolean Whether police and medical share one call board (configs/mdt.lua Dispatch.Shared).
local SHARED = DISPATCH.Shared == true
---@type integer Milliseconds between position refreshes for the map. Coarse on purpose: a CAD map
---wants to know roughly where a unit is, and a tighter tick would push the whole board every time.
local POSITION_MS = math.max(1000, math.floor(tonumber(DISPATCH.PositionMs) or 4000))

---@type table<string, boolean> 10-codes a unit may put itself on.
local CODES = { ['10-8'] = true, ['10-6'] = true, ['10-7'] = true, ['10-90'] = true }

---@type table<integer, table> Live units keyed by player server id.
local units = {}
---@type table<string, table> Live calls keyed by call id.
local calls = {}
---@type integer Monotonic counter behind the generated call id.
local callSeq = 0
---@type boolean True while a coalesced state broadcast is already scheduled.
local flushPending = false

---World coordinates of a connected player, or nil when they are not spawned.
---@param src integer player server id
---@return table|nil coords { x, y, z }
local function coordsOf(src)
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return nil end
    local c = GetEntityCoords(ped)
    if not c then return nil end
    return { x = c.x + 0.0, y = c.y + 0.0, z = c.z + 0.0 }
end

---Registers the caller as a live unit, or refreshes the identity fields of one already on the
---board. Every unit row is built from access.identity, never from a payload.
---@param me table caller identity from access.identity
---@return table unit
local function ensureUnit(me)
    local existing = units[me.source]
    if existing then
        existing.name       = me.name
        existing.rank       = me.rank
        existing.department = me.job
        existing.callsign   = me.callsign or existing.callsign
        return existing
    end

    local unit = {
        source     = me.source,
        citizenid  = me.citizenid,
        name       = me.name,
        callsign   = me.callsign or '',
        rank       = me.rank,
        department = me.job,
        domain     = access.domain(me),
        code       = '10-8',
        callId     = nil,
    }
    units[me.source] = unit
    return unit
end

---Whether a unit or a call belongs on `domain`'s board. With Dispatch.Shared on there is one board
---and this is always true; otherwise police and medical never see each other's traffic.
---@param rowDomain string|nil the unit's or call's own domain
---@param domain string the viewer's domain
---@return boolean
local function onBoard(rowDomain, domain)
    if SHARED then return true end
    return (rowDomain or 'leo') == domain
end

---Public unit shape every terminal receives.
---@param u table live unit
---@return table unit
local function unitPublic(u)
    -- Live position travels with the unit rather than waiting for a locate: the map plots every
    -- unit at once, so asking per marker would be one round trip per pin per refresh. It is the
    -- same set a CAD already shows on the list, so this discloses nothing new to the terminal.
    local coords = coordsOf(u.source)
    return {
        citizenid  = u.citizenid,
        name       = u.name,
        callsign   = u.callsign,
        rank       = u.rank,
        department = u.department,
        domain     = u.domain or 'leo',
        code       = u.code,
        callId     = u.callId,
        coords     = coords and { x = coords.x, y = coords.y } or nil,
    }
end

---Callsigns attached to a call, alphabetically.
---@param call table live call
---@return string[] callsigns
local function attachedCallsigns(call)
    local out = {}
    for _, u in pairs(units) do
        if call.attached[u.citizenid] then out[#out + 1] = u.callsign end
    end
    table.sort(out)
    return out
end

---Public call shape every terminal receives.
---@param call table live call
---@return table call
local function callPublic(call)
    local attached = attachedCallsigns(call)
    return {
        id        = call.id,
        code      = call.code,
        type      = call.type,
        priority  = call.priority,
        location  = call.location,
        direction = call.direction,
        suspect   = call.suspect,
        weapon    = call.weapon,
        units     = attached,
        unitCount = #attached,
        createdAt = call.at,
        expiresAt = call.expiresAt,
        hasCoords = call.coords ~= nil,
        coords    = call.coords and { x = call.coords.x, y = call.coords.y } or nil,
    }
end

---Every live unit, sorted by callsign.
---@return table[] units
local function unitList(domain)
    local out = {}
    for _, u in pairs(units) do
        if onBoard(u.domain, domain) then out[#out + 1] = unitPublic(u) end
    end
    table.sort(out, function(a, b) return a.callsign < b.callsign end)
    return out
end

---Every live call, most urgent first then newest.
---@return table[] calls
local function callList(domain)
    local ordered = {}
    for _, c in pairs(calls) do
        if onBoard(c.domain, domain) then ordered[#ordered + 1] = c end
    end
    table.sort(ordered, function(a, b)
        if a.priority ~= b.priority then return a.priority < b.priority end
        return a.at > b.at
    end)

    local out = {}
    for i = 1, #ordered do out[i] = callPublic(ordered[i]) end
    return out
end

---The full CAD state, which is what both the read and the push carry.
---@return table state { units, calls }
local function snapshot(domain)
    return { units = unitList(domain), calls = callList(domain) }
end

---Schedules one coalesced full-state broadcast, so a burst of attach and detach traffic costs a
---single push to every terminal.
local function markDirty()
    if flushPending then return end
    flushPending = true
    SetTimeout(FLUSH_MS, function()
        flushPending = false
        -- Both boards are built once and handed out by the recipient's own domain, rather than
        -- rebuilt per terminal: the snapshot is the expensive half and there are only ever two.
        local byDomain = { leo = snapshot('leo'), ems = snapshot('ems') }
        for _, src in ipairs(access.audience()) do
            local me = access.identity(src)
            if me then
                TriggerClientEvent('sd-phone:client:mdt:dispatch', src, byDomain[access.domain(me)])
            end
        end
    end)
end

-- Units move without anything on the board changing, so the map would freeze between attaches
-- without a tick of its own. It rides the existing coalesced broadcast rather than adding a second
-- push path, and it is skipped entirely when nobody is on air, so an empty server pays nothing.
CreateThread(function()
    while true do
        Wait(POSITION_MS)
        if next(units) ~= nil then markDirty() end
    end
end)

---Takes a call off the board and returns every unit that was on it to 10-8.
---@param id string call id
local function expire(id)
    if not calls[id] then return end
    calls[id] = nil
    for _, u in pairs(units) do
        if u.callId == id then
            u.callId = nil
            u.code = '10-8'
        end
    end
    markDirty()
end

---Removes calls whose TTL has elapsed and units that no longer hold a terminal. Each call also
---expires on its own timer, so the call half is the backstop for one lost to a restart.
---@return boolean changed
function dispatch.sweep()
    local now, changed = os.time(), false

    for src, unit in pairs(units) do
        if not GetPlayerName(src) or not access.canAccess(src) then
            local call = unit.callId and calls[unit.callId]
            if call then call.attached[unit.citizenid] = nil end
            units[src] = nil
            changed = true
        end
    end

    for id, call in pairs(calls) do
        if now >= call.expiresAt then
            calls[id] = nil
            changed = true
            for _, u in pairs(units) do
                if u.callId == id then
                    u.callId = nil
                    u.code = '10-8'
                end
            end
        end
    end
    if changed then markDirty() end
    return changed
end

---Mirrored calls on the board, counted by ALERT rather than by row: one alert addressed to both
---services is two rows and one mirrored call, and charging it twice would spend a share meant for
---two separate alerts.
---@return integer live mirrored alerts currently on the board
---@return string|nil oldest ingest id of the oldest of them, nil when the board holds none
local function ingestedLoad()
    local groups, live, oldest, oldestAt, oldestSeq = {}, 0, nil, nil, nil
    for _, c in pairs(calls) do
        if c.ingested then
            local group = c.ingestId or c.id
            if not groups[group] then
                groups[group] = true
                live = live + 1
            end
            -- `at` is os.time(), one-second resolution, so a burst inside one second ties on it and
            -- the winner used to be whatever order pairs() walked the hash in: a new alert could
            -- pick ITSELF as the oldest and evict the row it had just been called for, which is the
            -- refuse-the-new-one behaviour the eviction rule exists to remove. `seq` is the board's
            -- own monotonic counter, so a tie always breaks towards the call really filed first.
            local seq = c.seq or 0
            if not oldestAt or c.at < oldestAt or (c.at == oldestAt and seq < oldestSeq) then
                oldest, oldestAt, oldestSeq = group, c.at, seq
            end
        end
    end
    return live, oldest
end

---Whether `c` should be evicted before `other`: a mirrored call ahead of any genuine one, then the
---least urgent, then the oldest. On a board holding no mirrored call this is the priority-then-age
---rule the board has always trimmed by, unchanged.
---@param c table candidate call
---@param other table worst call found so far
---@return boolean worse
local function worseThan(c, other)
    if (c.ingested == true) ~= (other.ingested == true) then return c.ingested == true end
    if c.priority ~= other.priority then return c.priority > other.priority end
    if c.at ~= other.at then return c.at < other.at end
    -- Same second, which a burst of calls always is: the monotonic counter decides rather than
    -- pairs() order, so the trim picks the same victim every time instead of a call filed after the
    -- one it is being compared against.
    return (c.seq or 0) < (other.seq or 0)
end

---Holds mirrored calls to their own share of the board, then drops the least urgent, oldest call
---once the board itself is over its cap. A mirrored alert past that share evicts the OLDEST
---MIRRORED one rather than being refused: refusing blacks the mirror out for a whole TTL and takes
---the genuine alerts a dispatch resource raises down with it.
---@return nil
local function trimBoard()
    local live, oldest = ingestedLoad()
    while live > MAX_INGESTED and oldest do
        -- Both copies of a two-service alert go together, so the count above always falls and this
        -- loop always ends.
        for id, c in pairs(calls) do
            if c.ingested and (c.ingestId or c.id) == oldest then calls[id] = nil end
        end
        live, oldest = ingestedLoad()
    end

    local n = 0
    for _ in pairs(calls) do n = n + 1 end
    if n <= MAX_CALLS then return end

    local worstId, worst
    for id, c in pairs(calls) do
        if not worst or worseThan(c, worst) then worstId, worst = id, c end
    end
    if worstId then calls[worstId] = nil end
end

---Pushes a call onto the board. Every field is clamped and the id, timestamps and expiry are
---stamped here. Two callers reach it: a trusted one (the mdtCreateCall export, and the terminal
---behind it), and the dispatch ingest, which marks what it files with `ingested` so the board can
---quarantine it.
---@param data any { code, type, priority, location, coords, direction?, suspect?, weapon?, ttl?,
---ingested?, ingestId? }
---@return string|nil callId nil when the payload carried neither a code nor a type, or when the
---call was trimmed off the board again the moment it was put there
function dispatch.createCall(data)
    if type(data) ~= 'table' then return nil end

    local code = util.limitedString(data.code, 12)
    local kind = util.limitedString(data.type, 64)
    if not code and not kind then return nil end

    ---@type boolean Whether this call is MIRRORED from a third-party dispatch resource. The mark is
    ---the whole quarantine: it holds mirrored traffic to its own share of the board, puts it first
    ---in line for eviction and floors its priority. Only the ingest bridge sets it.
    local ingested = data.ingested == true

    local priority = math.floor(tonumber(data.priority) or 3)
    if priority < 1 then priority = 1 end
    if priority > 4 then priority = 4 end
    -- A mirrored alert may never claim the top tier. Every event one arrives on is a net event a
    -- client can forge, and priority 1 is both the head of the board order and the last thing
    -- eviction reaches, so a forged "officer down" must not be able to outrank a real one.
    if ingested and priority < 2 then priority = 2 end

    local ttl = math.floor(tonumber(data.ttl) or CALL_TTL)
    if ttl < 30 then ttl = 30 end
    if ttl > 21600 then ttl = 21600 end

    local coords
    if type(data.coords) == 'table' then
        local x, y, z = tonumber(data.coords.x), tonumber(data.coords.y), tonumber(data.coords.z)
        if util.finite(x) and util.finite(y) then
            coords = { x = x, y = y, z = util.finite(z) and z or 0.0 }
        end
    end

    callSeq = callSeq + 1
    local id = ('c%d%s'):format(callSeq, util.newId(4))
    local now = os.time()

    -- Which board the call lands on. Callers that predate the medical terminal pass no domain and
    -- get 'leo', which is what every existing dispatch integration expects.
    local domain = data.domain == 'ems' and 'ems' or 'leo'

    calls[id] = {
        id        = id,
        -- The counter behind the id, kept as a field so eviction can break a tie on it. `at` is
        -- os.time() and every call in one second shares a value, which left the trim picking its
        -- victim by pairs() order.
        seq       = callSeq,
        code      = code or '10-00',
        type      = kind or 'Call for Service',
        priority  = priority,
        domain    = domain,
        location  = util.limitedString(data.location, 120) or 'Unknown location',
        direction = util.limitedString(data.direction, 60),
        suspect   = util.limitedString(data.suspect, 120),
        weapon    = util.limitedString(data.weapon, 60),
        coords    = coords,
        attached  = {},
        at        = now,
        expiresAt = now + ttl,
        -- Absent rather than false on a genuine call, so a board with nothing mirrored on it holds
        -- exactly the rows it always has.
        ingested  = ingested or nil,
        -- One id per mirrored ALERT, shared by both rows of a two-service one, so the mirrored
        -- share is counted in alerts and an alert is evicted whole.
        ingestId  = ingested and (util.limitedString(data.ingestId, 32) or id) or nil,
    }
    trimBoard()

    -- The trim can evict the call it was just called for - a mirrored one past its share, or the
    -- least urgent row on a full board - and there is nothing to push or return when it does.
    if not calls[id] then return nil end

    local fresh = callPublic(calls[id])
    -- Addressed the same way the full-state broadcast is: each terminal is handed the board for its
    -- OWN domain, and this push has to agree with it. Pushed to the whole audience it put medical
    -- calls on police terminals and the other way round, for a row the receiving terminal never sees
    -- again on any later read. With one shared board every terminal is on the same board, so that
    -- path stays exactly as it was and pays nothing for a filter that would keep everyone anyway.
    if SHARED then
        util.pushMany('sd-phone:client:mdt:call', access.audience(), { call = fresh })
    else
        local targets = {}
        for _, src in ipairs(access.audience()) do
            local me = access.identity(src)
            if me and onBoard(domain, access.domain(me)) then targets[#targets + 1] = src end
        end
        util.pushMany('sd-phone:client:mdt:call', targets, { call = fresh })
    end
    markDirty()

    SetTimeout(ttl * 1000, function() expire(id) end)
    return id
end

---Live units and calls. Registering the caller as a unit is what puts them on the board, so the
---roster on every other terminal fills in the moment a terminal comes up.
dispatch.state = access.gated('dispatch.view', function(_src, _payload, me)
    local known = units[me.source] ~= nil
    ensureUnit(me)
    if not known then markDirty() end
    return util.ok(snapshot(access.domain(me)))
end)

---Puts the caller's unit on a 10-code. Going available or out of service also drops whatever call
---they were on. Not audited: the unit board is volatile memory, and a shift of 10-codes would bury
---the actions the Logs section exists to show.
dispatch.setStatus = access.gated('dispatch.status', function(_src, payload, me)
    local code = payload.code
    if not CODES[code] then return util.fail('mdt.unknownStatusCode', 'Unknown status code') end
    if not util.cooldown(me.citizenid, 'mdt:dispatch:status', STATUS_GAP) then
        return util.fail('mdt.slowDown', 'Slow down')
    end

    local unit = ensureUnit(me)
    unit.code = code

    if code == '10-8' or code == '10-7' then
        local call = unit.callId and calls[unit.callId]
        if call then call.attached[unit.citizenid] = nil end
        unit.callId = nil
    end

    markDirty()
    return util.ok({ unit = unitPublic(unit) })
end)

---Attaches the caller's unit to a call and flips them to 10-6.
dispatch.attach = access.gated('dispatch.attach', function(_src, payload, me)
    local call = calls[payload.callId]
    -- A call off this terminal's board is reported as gone rather than refused, because to this
    -- caller it never existed: the id could only have been guessed.
    if not call or not onBoard(call.domain, access.domain(me)) then
        return util.fail('mdt.callNoLongerActive', 'That call is no longer active')
    end

    local unit = ensureUnit(me)
    local previous = unit.callId and calls[unit.callId]
    if previous then previous.attached[unit.citizenid] = nil end

    call.attached[unit.citizenid] = true
    unit.callId = call.id
    unit.code = '10-6'

    markDirty()
    return util.ok({ call = callPublic(call) })
end)

---Detaches the caller's unit from a call and returns them to 10-8.
dispatch.detach = access.gated('dispatch.attach', function(_src, payload, me)
    local call = calls[payload.callId]
    if not call then return util.fail('mdt.callNoLongerActive', 'That call is no longer active') end

    local unit = ensureUnit(me)
    call.attached[unit.citizenid] = nil
    if unit.callId == call.id then
        unit.callId = nil
        unit.code = '10-8'
    end

    markDirty()
    return util.ok({ call = callPublic(call) })
end)

---Coordinates for a call or for a unit on the air, so the client can drop a waypoint on it.
dispatch.locate = access.gated('dispatch.view', function(_src, payload, me)
    local domain = access.domain(me)

    if payload.callId ~= nil then
        local call = calls[payload.callId]
        if not call or not onBoard(call.domain, domain) then
            return util.fail('mdt.callNoLongerActive', 'That call is no longer active')
        end
        if not call.coords then return util.fail('mdt.callHasNoCoordinates', 'That call has no coordinates') end
        return util.ok({ coords = call.coords })
    end

    if payload.citizenid ~= nil then
        for _, u in pairs(units) do
            if u.citizenid == payload.citizenid and onBoard(u.domain, domain) then
                local coords = coordsOf(u.source)
                if not coords then return util.fail('mdt.unitNotMap', 'That unit is not on the map') end
                return util.ok({ coords = coords })
            end
        end
        return util.fail('mdt.unitNotAir', 'That unit is not on the air')
    end

    return util.fail('mdt.nothingLocate', 'Nothing to locate')
end)

---Renames a unit already on the air, after the roster persists a new callsign.
---@param citizenid string officer citizenid
---@param callsign string new callsign
function dispatch.setCallsign(citizenid, callsign)
    for _, u in pairs(units) do
        if u.citizenid == citizenid then
            u.callsign = callsign
            markDirty()
            return
        end
    end
end

---Takes a departing player off the board and off any call they were attached to.
---@param src integer player server id
function dispatch.drop(src)
    local unit = units[src]
    if not unit then return end

    local call = unit.callId and calls[unit.callId]
    if call then call.attached[unit.citizenid] = nil end

    units[src] = nil
    markDirty()
end

return dispatch
