---@type table sd-phone config root (configs/config.lua); read for the shared paging bounds.
local config           = require 'configs.config'
---@type table Shared server helpers (server.util): envelopes, clamping, TINYINT reads.
local util             = require 'server.util'
---@type table MDT permissions (server.mdt.access): the read gate and the audited write wrapper.
local access           = require 'server.mdt.access'
---@type table MDT persistence (server.mdt.store): display-name hydration for owners and officers.
local store            = require 'server.mdt.store'
---@type table Framework record bridge (bridge.server.records): the citizen an owner resolves to.
local frameworkRecords = require 'bridge.server.records'

---@type table Weapons module; the table returned at end of file. The firearms registry is MDT-owned
---end to end: nothing outside this terminal writes phone_mdt_weapons, so the serial on the frame is
---the only key a lookup ever runs on.
local weapons = {}

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt

---@type integer Rows returned per page.
local PAGE_SIZE = math.floor(tonumber((MDT.Paging or {}).PageSize) or 25)

---@type integer Highest page a client may ask for.
local MAX_PAGE = math.floor(tonumber((MDT.Paging or {}).MaxPage) or 400)

---@type integer Byte cap on a search term.
local MAX_QUERY = 64

---@type integer Byte cap on a serial number.
local MAX_SERIAL = 32

---@type integer Byte cap on the firearm's display name.
local MAX_NAME = 96

---@type integer Byte cap on a citizenid.
local MAX_CID = 64

---@type integer Byte cap on an officer's free-text notes.
local MAX_NOTES = 2000

---@type integer Shortest search term that reaches the database. A single character matches most of
---the registry, so it is answered as the unfiltered page instead.
local MIN_QUERY = 2

---@type table<string, boolean> Registry states a record accepts; mirrors the WeaponStatus union in
---web/src/apps/mdt/data.ts.
local STATUSES = {
    registered = true,
    stolen     = true,
    seized     = true,
    destroyed  = true,
}

---@type table<string, boolean> Classes the registry files a firearm under; mirrors the WeaponClass
---union in web/src/apps/mdt/data.ts.
local CLASSES = {
    pistol  = true,
    smg     = true,
    rifle   = true,
    shotgun = true,
    sniper  = true,
    melee   = true,
    other   = true,
}

---Coerces a client page number to a whole page inside the served range.
---@param v any client-supplied page
---@return integer page 1..MAX_PAGE
local function pageOf(v)
    local n = tonumber(v)
    if type(n) ~= 'number' or not util.finite(n) then return 1 end
    local page = math.floor(n)
    if page ~= n or page < 1 then return 1 end
    return page > MAX_PAGE and MAX_PAGE or page
end

---Escapes the LIKE wildcards in a search term.
---@param term string
---@return string
local function likeSafe(term)
    return (term:gsub('([%%_\\])', '\\%1'))
end

---Normalises a client-supplied serial to the one shape the registry stores: upper case, no
---whitespace. Two officers typing the same frame stamp differently must land on the same row.
---@param v any client-supplied serial
---@return string|nil serial nil when nothing usable was sent
local function serialOf(v)
    local s = util.limitedString(v, MAX_SERIAL)
    if not s then return nil end
    s = (s:upper():gsub('%s+', ''))
    return s ~= '' and s or nil
end

---Display names for every citizenid a set of rows mentions, in one lookup.
---@param rows table[] raw registry rows
---@return table<string, string> names
local function namesIn(rows)
    local cids = {}

    ---Appends one identifier when it is worth resolving. A nil column is common here (an
    ---unregistered firearm, a record nobody has edited yet), so this cannot be an ipairs walk over
    ---the three columns: the first nil would end it and drop the rest.
    ---@param cid any
    local function want(cid)
        if type(cid) == 'string' and cid ~= '' then cids[#cids + 1] = cid end
    end

    for i = 1, #rows do
        want(rows[i].owner)
        want(rows[i].registered_by)
        want(rows[i].updated_by)
    end
    return store.namesFor(cids)
end

---A stored name that is still worth showing, or nil. Blank columns are dropped rather than sent as
---empty strings, so the UI's "not on file" fallback is what renders.
---@param value any
---@return string|nil
local function textOrNil(value)
    return (type(value) == 'string' and value ~= '') and value or nil
end

---The wire shape for one registry row in a list.
---@param row table raw DB row
---@param names table<string, string> citizenid -> display name
---@return table weapon
local function rowOf(row, names)
    local owner = textOrNil(row.owner)
    return {
        serial       = row.serial,
        name         = row.name or '',
        class        = CLASSES[row.class] and row.class or 'other',
        owner        = owner,
        ownerName    = owner and (names[owner] or textOrNil(row.owner_name) or owner) or nil,
        status       = STATUSES[row.status] and row.status or 'registered',
        bolo         = util.truthy(row.bolo),
        registeredAt = tonumber(row.registered_at) or 0,
    }
end

---The wire shape for one registry row in full.
---@param row table raw DB row
---@param names table<string, string> citizenid -> display name
---@return table weapon
local function detailOf(row, names)
    local weapon = rowOf(row, names)
    local filedBy = textOrNil(row.registered_by)
    local editedBy = textOrNil(row.updated_by)

    weapon.notes        = row.notes or ''
    weapon.ballistics   = util.truthy(row.ballistics)
    weapon.registeredBy = filedBy and (names[filedBy] or filedBy) or nil
    weapon.updatedBy    = editedBy and (names[editedBy] or editedBy) or nil
    weapon.updatedAt    = tonumber(row.updated_at)
    return weapon
end

---One registry row by serial, already shaped for the wire.
---@param serial string normalised serial
---@return table|nil weapon
local function readOne(serial)
    local row = MySQL.single.await('SELECT * FROM phone_mdt_weapons WHERE serial = ? LIMIT 1', { serial })
    if not row then return nil end
    return detailOf(row, namesIn({ row }))
end

---Resolves an owner a client named, refusing an identifier that belongs to nobody. An empty owner
---is allowed and means the firearm is on the registry with nobody attached to it, which is what a
---recovery with a filed-off frame looks like.
---@param value any client-supplied citizenid
---@return string|nil citizenid nil when the field was left empty
---@return string|nil name display name, nil when the field was left empty
---@return table|nil refusal failure envelope, set when the identifier belongs to nobody
local function ownerFrom(value)
    local cid = util.limitedString(value, MAX_CID)
    if not cid then return nil, nil, nil end

    local citizen = frameworkRecords.getCitizen(cid)
    if not citizen then return nil, nil, util.fail('mdt.noCitizenHoldsId', 'No citizen holds that ID') end
    return cid, citizen.name or cid, nil
end

---@type string Characters a generated serial is drawn from. O/0 and I/1 are left out so a serial
---read off a frame and typed into the terminal cannot land on a different firearm.
local SERIAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

---A serial no record currently holds, for a caller that mints the firearm and has none of its own.
---Bounded rather than looping: a saturated registry returns nil instead of hanging the shop script
---that asked.
---@return string|nil serial
function weapons.newSerial()
    for _ = 1, 10 do
        local out = {}
        for i = 1, 8 do
            local n = math.random(#SERIAL_ALPHABET)
            out[i] = SERIAL_ALPHABET:sub(n, n)
        end
        local serial = table.concat(out)
        if not MySQL.scalar.await('SELECT 1 FROM phone_mdt_weapons WHERE serial = ? LIMIT 1', { serial }) then
            return serial
        end
    end
    return nil
end

---Files a firearm on the registry with no terminal behind it, for the gun shop, crafting bench or
---admin script that creates the weapon in the first place. Validation is the officer path's, the
---only difference being that there is no permission to check: a caller reaching this is already
---server-side and trusted. An absent serial is minted rather than refused, because a shop knows the
---weapon and the buyer but has no serial until one is issued.
---@param data table { serial?, name, class?, owner?, notes?, registeredBy?, requireSerial? }
---@return string|nil serial the serial the record was filed under
---@return table? refusal failure envelope when serial is nil
function weapons.register(data)
    if type(data) ~= 'table' then return nil, util.fail('mdt.noFirearmGiven', 'No firearm given') end

    local serial = serialOf(data.serial)
    if not serial then
        if data.requireSerial then return nil, util.fail('mdt.serialNumberRequired', 'A serial number is required') end
        serial = weapons.newSerial()
        if not serial then return nil, util.fail('mdt.couldNotIssueSerialNumber', 'Could not issue a serial number') end
    end

    local name = util.limitedString(data.name, MAX_NAME)
    if not name then return nil, util.fail('mdt.nameFirearm', 'Name the firearm') end

    local class = util.limitedString(data.class, 16) or 'other'
    if not CLASSES[class] then return nil, util.fail('mdt.pickValidFirearmClass', 'Pick a valid firearm class') end

    local owner, ownerName, refusal = ownerFrom(data.owner)
    if refusal then return nil, refusal end

    local notes = util.limitedString(data.notes, MAX_NOTES) or ''
    local by = util.limitedString(data.registeredBy, MAX_CID)

    if MySQL.scalar.await('SELECT 1 FROM phone_mdt_weapons WHERE serial = ? LIMIT 1', { serial }) then
        return nil, util.fail('mdt.serialAlreadyRegistry', 'That serial is already on the registry')
    end

    local now = os.time()
    MySQL.query.await([[
        INSERT INTO phone_mdt_weapons
            (serial, `name`, class, owner, owner_name, status, bolo, ballistics, notes,
             registered_by, registered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'registered', 0, 0, ?, ?, ?, ?)
    ]], { serial, name, class, owner, ownerName, notes, by, now, now })

    return serial
end

---One registry record by serial, for a caller outside the terminal.
---@param serial string
---@return table|nil weapon
function weapons.find(serial)
    local key = serialOf(serial)
    return key and readOne(key) or nil
end

---Every firearm registered to a citizen, newest first.
---@param citizenid string
---@return table[] weapons
function weapons.byOwner(citizenid)
    local cid = util.limitedString(citizenid, MAX_CID)
    if not cid then return {} end
    local rows = MySQL.query.await(
        'SELECT * FROM phone_mdt_weapons WHERE owner = ? ORDER BY registered_at DESC', { cid }) or {}
    local names = namesIn(rows)
    local out = {}
    for i = 1, #rows do out[i] = rowOf(rows[i], names) end
    return out
end

---Moves a firearm to another registry state, for the script that seized or destroyed it.
---@param serial string
---@param status string one of the WeaponStatus values
---@param byCitizenid? string who to record as having changed it
---@return boolean ok
---@return string? message refusal reason
function weapons.setStatus(serial, status, byCitizenid)
    local key = serialOf(serial)
    if not key then return false, 'No serial number given' end

    local state = util.limitedString(status, 16)
    if not state or not STATUSES[state] then return false, 'Not a registry status' end

    local affected = MySQL.update.await(
        'UPDATE phone_mdt_weapons SET status = ?, updated_by = ?, updated_at = ? WHERE serial = ?',
        { state, util.limitedString(byCitizenid, MAX_CID), os.time(), key })
    if not affected or affected < 1 then return false, 'No firearm on file under that serial' end
    return true
end
---The registry page, filtered by status and searched across serial, firearm and owner. A term
---shorter than MIN_QUERY is treated as no term at all rather than as a match on everything.
weapons.search = access.gated('weapons.view', function(_, payload)
    local where, params = {}, {}

    local status = util.limitedString(payload.status, 16)
    if status and status ~= 'all' then
        if not STATUSES[status] then return util.fail('mdt.pickValidRegistryStatus', 'Pick a valid registry status') end
        where[#where + 1] = 'status = ?'
        params[#params + 1] = status
    end

    local query = util.limitedString(payload.query, MAX_QUERY)
    if query and #query >= MIN_QUERY then
        where[#where + 1] = '(serial LIKE ? OR `name` LIKE ? OR owner_name LIKE ? OR owner LIKE ?)'
        local like = '%' .. likeSafe(query) .. '%'
        for _ = 1, 4 do params[#params + 1] = like end
    end

    local clauses = #where > 0 and table.concat(where, ' AND ') or '1'
    local total = tonumber(MySQL.scalar.await(
        ('SELECT COUNT(*) FROM phone_mdt_weapons WHERE %s'):format(clauses), params)) or 0

    local page = pageOf(payload.page)
    local rows = MySQL.query.await(([[
        SELECT * FROM phone_mdt_weapons WHERE %s
        ORDER BY registered_at DESC, serial ASC LIMIT %d OFFSET %d
    ]]):format(clauses, PAGE_SIZE, (page - 1) * PAGE_SIZE), params) or {}

    local names = namesIn(rows)
    local out = {}
    for i = 1, #rows do out[i] = rowOf(rows[i], names) end

    return util.ok({ rows = out, total = total, page = page, pageSize = PAGE_SIZE })
end)

---One firearm in full.
weapons.get = access.gated('weapons.view', function(_, payload)
    local serial = serialOf(payload.serial)
    if not serial then return util.fail('mdt.noSerialNumberGiven', 'No serial number given') end

    local weapon = readOne(serial)
    if not weapon then return util.fail('mdt.noFirearmRegisteredSerial', 'No firearm registered on that serial') end
    return util.ok({ weapon = weapon })
end)

---Files a new firearm. The serial is the primary key, so a duplicate is refused rather than
---silently overwriting whatever the registry already holds against it.
weapons.create = access.audited('weapons.edit', function(_, payload, me)
    local serial, refusal = weapons.register({
        serial        = payload.serial,
        name          = payload.name,
        class         = payload.class,
        owner         = payload.owner,
        notes         = payload.notes,
        registeredBy  = me.citizenid,
        requireSerial = true,
    })
    if not serial then return refusal end

    local weapon = readOne(serial)
    if not weapon then return util.fail('mdt.couldNotRegistered', 'That could not be registered') end

    return util.ok({ weapon = weapon }), {
        entityType = 'weapon',
        entityId   = serial,
        details    = { name = weapon.name, class = weapon.class, owner = weapon.owner },
    }
end)

---Updates the registry record on a firearm already on file. Every field is optional; an absent key
---leaves the stored value alone, and an empty owner clears the registration rather than failing.
weapons.update = access.audited('weapons.edit', function(_, payload, me)
    local serial = serialOf(payload.serial)
    if not serial then return util.fail('mdt.noSerialNumberGiven', 'No serial number given') end

    local current = MySQL.single.await('SELECT * FROM phone_mdt_weapons WHERE serial = ? LIMIT 1', { serial })
    if not current then return util.fail('mdt.noFirearmRegisteredSerial', 'No firearm registered on that serial') end

    local status = STATUSES[current.status] and current.status or 'registered'
    if payload.status ~= nil then
        local wanted = util.limitedString(payload.status, 16)
        if not wanted or not STATUSES[wanted] then return util.fail('mdt.pickValidRegistryStatus', 'Pick a valid registry status') end
        status = wanted
    end

    local owner, ownerName = textOrNil(current.owner), textOrNil(current.owner_name)
    if payload.owner ~= nil then
        local refusal
        owner, ownerName, refusal = ownerFrom(payload.owner)
        if refusal then return refusal end
    end

    local notes = current.notes or ''
    if payload.notes ~= nil then notes = util.limitedString(payload.notes, MAX_NOTES) or '' end

    local bolo = util.truthy(current.bolo)
    if payload.bolo ~= nil then bolo = payload.bolo == true end

    local ballistics = util.truthy(current.ballistics)
    if payload.ballistics ~= nil then ballistics = payload.ballistics == true end

    MySQL.query.await([[
        UPDATE phone_mdt_weapons
        SET status = ?, owner = ?, owner_name = ?, bolo = ?, ballistics = ?, notes = ?,
            updated_by = ?, updated_at = ?
        WHERE serial = ?
    ]], {
        status, owner, ownerName, bolo and 1 or 0, ballistics and 1 or 0, notes,
        me.citizenid, os.time(), serial,
    })

    local weapon = readOne(serial)
    if not weapon then return util.fail('mdt.noFirearmRegisteredSerial', 'No firearm registered on that serial') end

    return util.ok({ weapon = weapon }), {
        entityType = 'weapon',
        entityId   = serial,
        details    = { status = status, owner = owner, bolo = bolo, ballistics = ballistics },
    }
end)

return weapons
