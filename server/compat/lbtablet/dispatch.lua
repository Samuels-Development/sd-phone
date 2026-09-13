---@type table Shared shim helpers (server.compat.lbtablet.shared): export registration + warn-once.
local shim = require 'server.compat.lbtablet.shared'
---@type table Dispatch ingest (bridge.server.dispatch): the quarantined path onto the call board.
local ingest = require 'bridge.server.dispatch'
---@type table CAD (server.mdt.dispatch): read-back and early removal of the calls the shim filed.
local mdt = require 'server.mdt.dispatch'

---@type table Compat module; the table returned at end of file.
local compat = {}

---@type table<string, integer> lb-tablet's priority words on the board's 1-4 scale. The board
---floors a mirrored call to 2, so high lands at 2, medium at 3 and low at 4.
local PRIORITY = { high = 1, medium = 3, low = 4 }

---@type table<string, string> lb-tablet's default MDT names, lowercased, on the two boards here.
---Mechanic has no board and is refused rather than put on the police one.
local MDT_DOMAIN = { police = 'leo', ambulance = 'ems', fire = 'ems' }

---@type integer Entries read off a caller-supplied list before it stops being walked.
local MAX_LIST = 16

---@type integer Numeric ids remembered at once, well past the board's capacity.
local MAX_TRACKED = 512

---@type integer Last numeric id handed out.
local nextId = 0
---@type table<integer, string[]> Numeric id -> the board call ids that dispatch produced.
local tracked = {}
---@type integer[] Numeric ids in the order they were handed out, for eviction.
local order = {}

---Lowercased copy of a string field, nil for anything else.
---@param v any
---@return string|nil
local function lower(v)
    if type(v) ~= 'string' or v == '' then return nil end
    return v:lower()
end

---A non-empty string field, nil for anything else.
---@param v any
---@return string|nil
local function str(v)
    if type(v) ~= 'string' or v == '' then return nil end
    return v
end

---Walks a scalar-or-list field, calling fn on each entry up to MAX_LIST.
---@param v any
---@param fn fun(entry: any)
local function each(v, fn)
    if type(v) ~= 'table' then
        if v ~= nil then fn(v) end
        return
    end
    for i = 1, math.min(#v, MAX_LIST) do fn(v[i]) end
end

---Board coordinates from lb-tablet's `location.coords`: a vector2, a vector3 or an { x, y } table.
---A shape with no z gets 0.
---@param coords any
---@return { x: number, y: number, z: number }|nil
local function coordsOf(coords)
    local t = type(coords)
    if t ~= 'table' and t ~= 'vector2' and t ~= 'vector3' and t ~= 'vector4' then return nil end
    local x, y = tonumber(coords.x), tonumber(coords.y)
    if t == 'table' and (x == nil or y == nil) then
        x, y = tonumber(coords[1]), tonumber(coords[2])
    end
    if not x or not y then return nil end
    local z = (t == 'table' or t == 'vector3' or t == 'vector4') and tonumber(coords.z) or nil
    return { x = x + 0.0, y = y + 0.0, z = (z or 0.0) + 0.0 }
end

---Board job list from lb-tablet's `job`, `mdt` and `mdts` fields. Nil with a reason when the
---options name only MDTs this CAD has no board for.
---@param o table lb-tablet NewDispatchOptions
---@return string[]|nil jobs
---@return string|nil reason
local function jobsOf(o)
    local jobs = {}
    local namedMdt, boardMdt = false, false
    each(o.job, function(v)
        local s = lower(v)
        if s then jobs[#jobs + 1] = s end
    end)
    local function addMdt(v)
        local s = lower(v)
        if not s then return end
        namedMdt = true
        local domain = MDT_DOMAIN[s]
        if domain then
            boardMdt = true
            jobs[#jobs + 1] = domain
        end
    end
    each(o.mdt, addMdt)
    each(o.mdts, addMdt)
    if namedMdt and not boardMdt and #jobs == 0 then return nil, 'no board for that MDT' end
    return jobs
end

---The board's suspect and weapon lines from lb-tablet's description and free-form fields: the
---description leads, each field follows as "label: value", and a field labelled weapon fills that slot.
---@param o table lb-tablet NewDispatchOptions
---@return string|nil suspect
---@return string|nil weapon
local function detailsOf(o)
    local parts, weapon = {}, nil
    local description = str(o.description)
    if description then parts[#parts + 1] = description end
    if type(o.fields) == 'table' then
        for i = 1, math.min(#o.fields, MAX_LIST) do
            local f = o.fields[i]
            local value = type(f) == 'table' and str(f.value) or nil
            if value then
                local label = type(f) == 'table' and str(f.label) or nil
                if label and not weapon and label:lower():find('weapon', 1, true) then
                    weapon = value
                else
                    parts[#parts + 1] = label and (label .. ': ' .. value) or value
                end
            end
        end
    end
    return #parts > 0 and table.concat(parts, ', ') or nil, weapon
end

---Maps lb-tablet's NewDispatchOptions onto the board's mirror shape (the one mdtMirrorCall takes).
---Nil with a reason when the options name only MDTs this CAD has no board for.
---@param o table lb-tablet NewDispatchOptions
---@return table|nil call mirror payload
---@return string|nil reason why it was refused
function compat.toCall(o)
    local jobs, reason = jobsOf(o)
    if not jobs then return nil, reason end
    local suspect, weapon = detailsOf(o)
    local location = type(o.location) == 'table' and o.location or {}
    return {
        code     = str(o.code),
        type     = str(o.title),
        priority = PRIORITY[lower(o.priority) or ''] or 3,
        location = str(location.label),
        coords   = coordsOf(location.coords),
        suspect  = suspect,
        weapon   = weapon,
        jobs     = jobs,
    }
end

---Remembers the board ids behind a new numeric id, evicting the oldest past the cap.
---@param ids string[]
---@return integer id
local function track(ids)
    nextId = nextId + 1
    tracked[nextId] = ids
    order[#order + 1] = nextId
    if #order > MAX_TRACKED then
        tracked[table.remove(order, 1)] = nil
    end
    return nextId
end

---AddDispatch(options): files the dispatch on the board(s) its MDTs or jobs name through the
---quarantined mirror path. Returns a numeric id, or false when nothing was filed.
shim.registerLbExport('AddDispatch', function(options)
    if type(options) ~= 'table' then return false end
    local call, why = compat.toCall(options)
    if not call then
        shim.warnOnce('AddDispatch.' .. tostring(why), ('AddDispatch dropped a dispatch (called by %s): %s'):format(GetInvokingResource() or 'unknown', why))
        return false
    end
    local ok, ids = ingest.mirrorCall(call)
    if not ok then return false end
    return track(ids)
end)

---UpdateDispatch(id, options): the board has no in-place edit; warns once and returns false.
shim.registerLbExport('UpdateDispatch', function(_id, _options)
    shim.warnOnce('UpdateDispatch', ('UpdateDispatch is not supported (called by %s), returned false'):format(GetInvokingResource() or 'unknown'))
    return false
end)

---GetDispatch(id): the call behind a numeric id in lb-tablet's DispatchNotification shape, or nil
---once it has expired or been taken off the board.
shim.registerLbExport('GetDispatch', function(id)
    local ids = tracked[tonumber(id) or -1]
    if not ids then return nil end
    local call = mdt.getCall(ids[1])
    if not call then return nil end
    local priority = call.priority <= 2 and 'high' or (call.priority == 3 and 'medium' or 'low')
    return {
        id          = tonumber(id),
        mdt         = call.domain == 'ems' and 'Ambulance' or 'Police',
        priority    = priority,
        code        = call.code,
        title       = call.type,
        description = call.suspect,
        location    = {
            label  = call.location,
            coords = call.coords and { x = call.coords.x, y = call.coords.y } or nil,
        },
        timestamp   = call.at * 1000,
        endTime     = call.expiresAt * 1000,
        responders  = {},
    }
end)

---RemoveDispatch(id): takes the call(s) behind a numeric id off the board early.
shim.registerLbExport('RemoveDispatch', function(id)
    local ids = tracked[tonumber(id) or -1]
    if not ids then return false end
    local removed = false
    for i = 1, #ids do
        if mdt.removeCall(ids[i]) then removed = true end
    end
    return removed
end)

---The client shim's AddDispatch: files a dispatch a player's client raised through the ingest's
---client-sourced entry. Returns the numeric id or false, as the server export does.
---@param src number
---@param options any lb-tablet NewDispatchOptions
---@return integer|false
lib.callback.register('sd-phone:server:lbtablet:addDispatch', function(src, options)
    if type(options) ~= 'table' then return false end
    local call = compat.toCall(options)
    if not call then return false end
    local ok, ids = ingest.mirrorFrom(src, call)
    if not ok then return false end
    return track(ids)
end)

return compat
