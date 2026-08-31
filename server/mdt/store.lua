---@type table Shared server helpers (server.util): trim, limitedString, cleanup registration.
local util    = require 'server.util'
---@type table MDT schema (server.mdt.schema): every phone_mdt_* CREATE plus the offence seed.
local schema  = require 'server.mdt.schema'
---@type table Framework record bridge (bridge.server.records): read-only citizen name resolution.
local records = require 'bridge.server.records'

---@type table Store module; the table returned at end of file. Shared persistence with no policy:
---the human-ref allocator, officer profiles and sessions, name hydration, the penal-code read and
---the single audit write every module reaches through access.audited.
local store = {}

---@type string[] Every table the MDT owns.
store.tables = schema.tables

---Creates every MDT table and seeds the penal code. Run once at boot from server/mdt/init.lua.
store.ensureSchema = schema.ensureSchema

---@type table<string, string> Ref kind -> the letter officers read aloud on the radio.
local REF_PREFIX = {
    report = 'R', case = 'C', warrant = 'W', arrest = 'A',
    ia = 'IA', court = 'CR', expunge = 'EX',
}

---@type table<string, boolean> Counters currently mid-allocation, so two concurrent allocations
---of the same kind cannot read the same incremented value and mint a duplicate ref.
local refLocks = {}

---Increments a counter and returns its new value, serialised per kind.
---@param kind string counter name (a ref kind, 'badge', or 'cs:<job>')
---@return integer counter
function store.nextSequence(kind)
    while refLocks[kind] do Wait(0) end
    refLocks[kind] = true

    local ok, n = pcall(function()
        MySQL.query.await([[
            INSERT INTO phone_mdt_refs (`kind`, `counter`) VALUES (?, 1)
            ON DUPLICATE KEY UPDATE `counter` = `counter` + 1
        ]], { kind })
        return MySQL.scalar.await('SELECT `counter` FROM phone_mdt_refs WHERE `kind` = ?', { kind })
    end)

    refLocks[kind] = nil
    if not ok then error(n, 0) end
    return math.max(1, math.floor(tonumber(n) or 1))
end

---The next human ref for a record kind ('R-0001'). Officers read refs aloud, so this and not the
---auto-increment id is what the UI shows and what every cross-link resolves.
---@param kind 'report'|'case'|'warrant'|'arrest'
---@return string|nil ref nil for an unknown kind
function store.nextRef(kind)
    local prefix = REF_PREFIX[kind]
    if not prefix then return nil end
    return ('%s-%04d'):format(prefix, store.nextSequence(kind))
end

---@type table<string, table> citizenid -> profile row, so identity resolution on every callback
---costs no query after the first read of a character's session.
local profileCache = {}

util.onCleanup(function(_, citizenid)
    if citizenid then profileCache[citizenid] = nil end
end)

---Normalises a raw profile row for the app: nulls become nil, counters become numbers.
---@param row table|nil
---@return table|nil
local function shapeProfile(row)
    if not row then return nil end
    return {
        citizenid  = row.citizenid,
        name       = row.fullname,
        callsign   = (row.callsign and row.callsign ~= '') and row.callsign or nil,
        badge      = (row.badge and row.badge ~= '') and row.badge or nil,
        radio      = (row.radio and row.radio ~= '') and row.radio or nil,
        department = row.department,
        rank       = row.rank_label,
        gradeLevel = tonumber(row.grade_level) or 0,
        avatar     = (row.avatar and row.avatar ~= '') and row.avatar or nil,
        notes      = row.notes,
        createdAt  = tonumber(row.created_at) or 0,
        updatedAt  = tonumber(row.updated_at) or 0,
    }
end

---Reads a profile straight from the database and refreshes the cache.
---@param cid string citizenid
---@return table|nil profile
local function readProfile(cid)
    local row = MySQL.single.await('SELECT * FROM phone_mdt_profiles WHERE citizenid = ?', { cid })
    local shaped = shapeProfile(row)
    profileCache[cid] = shaped
    return shaped
end

---A profile by citizenid, served from the in-memory cache when it is warm. Read-only.
---@param cid string citizenid
---@return table|nil profile
function store.profile(cid)
    if type(cid) ~= 'string' or cid == '' then return nil end
    local hit = profileCache[cid]
    if hit ~= nil then return hit end
    return readProfile(cid)
end

---Drops a character's cached profile so the next read re-resolves it. Call after any write to
---phone_mdt_profiles that did not go through store.updateProfile.
---@param cid string citizenid
function store.forgetProfile(cid)
    profileCache[cid] = nil
end

---Profiles for a set of citizenids as `{ [citizenid] = profile }`, in one query. Read-only.
---@param cids string[]
---@return table<string, table>
function store.profilesFor(cids)
    local out = {}
    if type(cids) ~= 'table' or #cids == 0 then return out end

    local marks = {}
    for i = 1, #cids do marks[i] = '?' end
    local rows = MySQL.query.await(
        ('SELECT * FROM phone_mdt_profiles WHERE citizenid IN (%s)'):format(table.concat(marks, ',')),
        cids) or {}

    for i = 1, #rows do
        local shaped = shapeProfile(rows[i])
        out[shaped.citizenid] = shaped
        profileCache[shaped.citizenid] = shaped
    end
    return out
end

---@type integer Attempts made to mint a callsign before the profile is created without one.
local CALLSIGN_TRIES = 6

---Mints an unused callsign for a department. Returns nil when every attempt collided, which
---leaves the profile callsign-less rather than failing the whole provisioning.
---@param prefix string department callsign prefix ('LS')
---@param format string sequence format ('%s-%03d')
---@return string|nil
local function mintCallsign(prefix, format)
    for _ = 1, CALLSIGN_TRIES do
        local candidate = format:format(prefix, store.nextSequence('cs:' .. prefix))
        local taken = MySQL.scalar.await('SELECT 1 FROM phone_mdt_profiles WHERE callsign = ? LIMIT 1', { candidate })
        if taken == nil then return candidate end
    end
    return nil
end

---Provisions a character's MDT record on first open and keeps the volatile columns (display name,
---department, grade, rank label) in step with the framework on every later open. Idempotent.
---@param cid string citizenid
---@param opts { name: string, department: string, grade: integer, rank: string, callsignPrefix: string, callsignFormat: string }
---@return table profile
function store.ensureProfile(cid, opts)
    local now      = os.time()
    local name     = util.limitedString(opts.name, 96) or cid
    local dept     = util.limitedString(opts.department, 64) or ''
    local rank     = util.limitedString(opts.rank, 64) or ''
    local grade    = math.max(0, math.floor(tonumber(opts.grade) or 0))
    local existing = store.profile(cid)

    if not existing then
        local callsign = mintCallsign(opts.callsignPrefix or 'U', opts.callsignFormat or '%s-%03d')
        local badge    = ('%04d'):format(store.nextSequence('badge'))
        MySQL.query.await([[
            INSERT INTO phone_mdt_profiles
                (citizenid, fullname, callsign, badge, department, rank_label, grade_level, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE fullname = VALUES(fullname)
        ]], { cid, name, callsign, badge, dept, rank, grade, now, now })
        return readProfile(cid)
    end

    if existing.name ~= name or existing.department ~= dept
        or existing.rank ~= rank or existing.gradeLevel ~= grade then
        MySQL.update.await([[
            UPDATE phone_mdt_profiles
            SET fullname = ?, department = ?, rank_label = ?, grade_level = ?, updated_at = ?
            WHERE citizenid = ?
        ]], { name, dept, rank, grade, now, cid })
        return readProfile(cid)
    end

    return existing
end

---@type table<string, string> Writable profile field -> its column. Anything outside this map is
---ignored, so a caller cannot smuggle a column name through a payload.
local PROFILE_COLUMNS = {
    callsign = 'callsign',
    badge    = 'badge',
    radio    = 'radio',
    avatar   = 'avatar',
    notes    = 'notes',
    rank     = 'rank_label',
    grade    = 'grade_level',
    name     = 'fullname',
}

---Writes a subset of a profile's columns. Returns the refreshed profile, or nil when the callsign
---was already taken by another officer.
---@param cid string citizenid
---@param fields table<string, any> keys from PROFILE_COLUMNS
---@return table|nil profile
---@return table? refusal failure envelope when profile is nil
function store.updateProfile(cid, fields)
    if type(cid) ~= 'string' or cid == '' or type(fields) ~= 'table' then
        return nil, util.fail('mdt.unknownOfficer', 'Unknown officer')
    end

    local sets, args = {}, {}
    for key, column in pairs(PROFILE_COLUMNS) do
        local v = fields[key]
        if v ~= nil then
            sets[#sets + 1] = ('`%s` = ?'):format(column)
            args[#args + 1] = v
        end
    end
    if #sets == 0 then return store.profile(cid) end

    sets[#sets + 1] = '`updated_at` = ?'
    args[#args + 1] = os.time()
    args[#args + 1] = cid

    local ok = pcall(MySQL.update.await,
        ('UPDATE phone_mdt_profiles SET %s WHERE citizenid = ?'):format(table.concat(sets, ', ')), args)
    if not ok then return nil, util.fail('mdt.callsignAlreadyUse', 'That callsign is already in use') end

    return readProfile(cid)
end

---Opens a shift row, closing any that a crash left open. Called when an officer opens the MDT.
---@param cid string citizenid
function store.openSession(cid)
    if type(cid) ~= 'string' or cid == '' then return end
    local now = os.time()
    MySQL.update.await(
        'UPDATE phone_mdt_profile_sessions SET logout_at = ? WHERE citizenid = ? AND logout_at IS NULL',
        { now, cid })
    MySQL.insert.await(
        'INSERT INTO phone_mdt_profile_sessions (citizenid, login_at) VALUES (?, ?)', { cid, now })
end

---Closes a character's open shift row. A no-op when they have none.
---@param cid string citizenid
function store.closeSession(cid)
    if type(cid) ~= 'string' or cid == '' then return end
    MySQL.update.await(
        'UPDATE phone_mdt_profile_sessions SET logout_at = ? WHERE citizenid = ? AND logout_at IS NULL',
        { os.time(), cid })
end

---Closes every open shift row. Run on resource stop so a restart does not leave shifts that look
---like they ran for days.
function store.closeOpenSessions()
    MySQL.update.await(
        'UPDATE phone_mdt_profile_sessions SET logout_at = ? WHERE logout_at IS NULL', { os.time() })
end

---Total minutes a character has been clocked into the MDT, open shifts included. Read-only.
---@param cid string citizenid
---@return integer minutes
function store.sessionMinutes(cid)
    if type(cid) ~= 'string' or cid == '' then return 0 end
    local seconds = MySQL.scalar.await([[
        SELECT COALESCE(SUM(COALESCE(logout_at, ?) - login_at), 0)
        FROM phone_mdt_profile_sessions WHERE citizenid = ?
    ]], { os.time(), cid })
    return math.max(0, math.floor((tonumber(seconds) or 0) / 60))
end

---Display names for a set of citizenids as `{ [citizenid] = name }`. The MDT profile name wins
---when one exists (it is the name the department knows the officer by); otherwise the framework
---character name is used, falling back to the identifier itself so a row is never blank.
---@param cids string[]
---@return table<string, string>
function store.namesFor(cids)
    local out = {}
    if type(cids) ~= 'table' or #cids == 0 then return out end

    local unique, list = {}, {}
    for i = 1, #cids do
        local cid = cids[i]
        if type(cid) == 'string' and cid ~= '' and not unique[cid] then
            unique[cid] = true
            list[#list + 1] = cid
        end
    end
    if #list == 0 then return out end

    local fromFramework = records.namesFor(list)
    local fromProfiles  = store.profilesFor(list)

    for i = 1, #list do
        local cid = list[i]
        local profile = fromProfiles[cid]
        out[cid] = (profile and profile.name) or fromFramework[cid] or cid
    end
    return out
end

---@type integer Largest JSON detail blob an audit row will carry.
local AUDIT_DETAIL_BYTES = 4000

---Writes one audit row. Reached only through access.audited, so a write cannot be gated without
---also being recorded. Never raises: an audit failure must not roll back the action it describes.
---@param me table caller identity from access.identity
---@param action string permission key the write was gated on
---@param entityType string|nil 'report' | 'case' | 'warrant' | 'person' | 'vehicle' | ...
---@param entityId string|nil the entity's human ref or identifier
---@param details any JSON-encodable extras shown in the Logs detail pane
function store.audit(me, action, entityType, entityId, details)
    if type(me) ~= 'table' or type(me.citizenid) ~= 'string' then return end

    local blob
    if details ~= nil then
        local ok, encoded = pcall(json.encode, details)
        if ok and type(encoded) == 'string' and #encoded <= AUDIT_DETAIL_BYTES then blob = encoded end
    end

    pcall(MySQL.insert.await, [[
        INSERT INTO phone_mdt_audit
            (actor_cid, actor_name, actor_callsign, department, `action`, entity_type, entity_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        me.citizenid,
        util.limitedString(me.name, 96) or me.citizenid,
        me.callsign,
        me.job or '',
        util.limitedString(action, 48) or 'unknown',
        entityType and (util.limitedString(entityType, 32)) or nil,
        entityId and (util.limitedString(tostring(entityId), 64)) or nil,
        blob,
        os.time(),
    })
end

return store
