---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Shared server helpers (server.util): the { success, message?, data? } envelope.
local util    = require 'server.util'
---@type table MDT persistence (server.mdt.store): profile provisioning and the audit write.
local store   = require 'server.mdt.store'
---@type table Job bridge (bridge.server.job): live framework job, grade, duty and boss checks.
local job     = require 'bridge.server.job'
---@type table Society bridge (bridge.server.society): the job's grade ladder and grade labels.
local society = require 'bridge.server.society'
---@type table Player bridge (bridge.server.player): citizenid, display name and source lookups.
local player  = require 'bridge.server.player'

---@type table MDT config (configs/mdt.lua): departments, permission thresholds, boss bypass.
local MDT = config.Mdt

---@type boolean Whether bodycams are switched on (configs/bodycam.lua). Read here so a build that
---ships the Cameras key cannot grant it while the feature is off: the section would render, every
---handler behind it would refuse, and the officer would land on an empty grid with no explanation.
local CAMERAS_ENABLED = (require 'configs.bodycam').Enabled == true

---@type table Access module; the table returned at end of file. The whole permission concern:
---identity resolution, the grade-threshold check, the chain-of-command guard, and the two wrappers
---every handler is registered through. No handler anywhere checks a permission by hand.
local access = {}

---@type table[] Configured departments, in file order.
local DEPARTMENTS = MDT.Departments or {}
---@type table<string, number> Keys this build ships that a configs/mdt.lua written before them
---cannot name. `access.grants` only walks keys it can see a threshold for, so without a fallback a
---section added in a release would be denied at every grade and never render at all, on an install
---whose config the owner has customised and does not want overwritten. A key the config DOES name
---always wins.
local SHIPPED_PERMISSIONS = {
    ['weapons.view'] = 0,
    ['weapons.edit'] = 1,
    ['cameras.view'] = 1,
    ['cctv.view']    = 1,
}

---@type table<string, number> Permission key -> minimum grade. An absent key is denied. Built as a
---copy rather than as a reference to the config table, so the fallbacks above cannot leak back into
---configs/mdt.lua for anything else that reads it.
local PERMISSIONS = {}
for key, minimum in pairs(SHIPPED_PERMISSIONS) do PERMISSIONS[key] = minimum end
for key, minimum in pairs(MDT.Permissions or {}) do PERMISSIONS[key] = minimum end
-- A disabled feature is not grantable at any grade, whatever the config names.
if not CAMERAS_ENABLED then PERMISSIONS['cameras.view'] = nil end
---@type boolean Whether a boss of their department holds every key.
local BOSS_BYPASS = MDT.BossBypass ~= false

---@type table<string, table<string, boolean>> Keys that exist on SOME terminals only, as the set of
---domains that reach them. A key absent from this table is shared by all three (home, reports,
---cases, roster, chat, bulletins, logs).
---
---This is declared here rather than in configs/mdt.lua because it is not a setting: it states
---which service a capability belongs to, and a server owner moving `jail.book` to the medical
---terminal would be describing something that has no handler behind it.
local KEY_DOMAIN = {
    ['patients.view']       = { ems = true },
    ['patients.edit']       = { ems = true },
    ['protocols.view']      = { ems = true },
    ['protocols.manage']    = { ems = true },

    ['persons.edit']        = { leo = true },
    ['vehicles.view']       = { leo = true },
    ['vehicles.edit']       = { leo = true },
    ['weapons.view']        = { leo = true },
    ['weapons.edit']        = { leo = true },
    ['cameras.view']        = { leo = true },
    ['cctv.view']           = { leo = true },
    ['warrants.issue']      = { leo = true },
    ['warrants.close']      = { leo = true },
    ['jail.view']           = { leo = true },
    ['jail.book']           = { leo = true },
    ['phone.view']          = { leo = true },
    ['affairs.view']        = { leo = true },
    ['affairs.file']        = { leo = true },
    ['affairs.investigate'] = { leo = true },
    ['affairs.close']       = { leo = true },
    ['dispatch.view']       = { leo = true, ems = true },
    ['dispatch.attach']     = { leo = true, ems = true },
    ['dispatch.status']     = { leo = true, ems = true },

    -- A court looks people up, reads the penal code it sentences against, and reads the warrants
    -- it may void. It never edits a record, never issues a warrant and never books anyone.
    ['persons.view']        = { leo = true, doj = true },
    ['profiles.view']       = { leo = true, doj = true },
    ['warrants.view']       = { leo = true, doj = true },
    ['offences.view']       = { leo = true, doj = true },

    ['court.view']          = { doj = true },
    ['court.file']          = { doj = true },
    ['court.manage']        = { doj = true },
    ['court.rule']          = { doj = true },
    ['expunge.view']        = { doj = true },
    ['expunge.file']        = { doj = true },
    ['expunge.rule']        = { doj = true },
    ['warrants.void']       = { doj = true },
}

---@type table<string, boolean> Keys only a department marked `bench` reaches, at any grade. The
---robe is a property of the department, not of a rank: a senior attorney does not become a judge
---by being promoted, so this is checked before the grade and before the boss bypass.
local BENCH_ONLY = {
    ['court.rule']    = true,
    ['court.manage']  = true,
    ['expunge.rule']  = true,
    ['warrants.void'] = true,
}
---@type string Sequence format auto-generated callsigns are minted with.
local CALLSIGN_FORMAT = (MDT.Dispatch or {}).CallsignFormat or '%s-%03d'

---@type table<string, table> Department entry by framework job name.
local byJob = {}
for i = 1, #DEPARTMENTS do
    local dept = DEPARTMENTS[i]
    if dept.job then byJob[dept.job] = dept end
end

---@type string[] Every permission key, resolved once so grants() does not walk a hash each call.
local KEYS = {}
for key in pairs(PERMISSIONS) do KEYS[#KEYS + 1] = key end
table.sort(KEYS)

---@type table<string, string> '<job>\0<level>' -> grade label. On ESX the ladder is a MySQL read,
---so resolving it on every callback would put a query behind every permission check.
local gradeLabels = {}

---A job grade's display label ('Sergeant'), memoised per job and level.
---@param jobName string
---@param level integer
---@return string
local function gradeLabel(jobName, level)
    local key = jobName .. '\0' .. tostring(level)
    local hit = gradeLabels[key]
    if hit then return hit end
    local label = society.gradeLabel(jobName, level)
    gradeLabels[key] = label
    return label
end

---The terminal a department drives. Anything not explicitly medical or judicial is police, so a
---department that omits `type` keeps the behaviour it had before the field existed.
---@param dept table|nil department entry
---@return 'leo'|'ems'|'doj' domain
local function domainOf(dept)
    local kind = dept and dept.type
    if kind == 'ems' or kind == 'doj' then return kind end
    return 'leo'
end

---The department a framework job belongs to, or nil when the job has no terminal.
---@param jobName string|nil
---@return table|nil department
function access.departmentFor(jobName)
    if type(jobName) ~= 'string' then return nil end
    return byJob[jobName]
end

---Every configured department, in file order. Read-only.
---@return table[]
function access.departments()
    return DEPARTMENTS
end

---The caller's department, resolved from their ACTIVE framework job. Nil when they hold no
---terminal, which is what makes every callback fail closed.
---@param src integer player server id
---@return table|nil department
local function deptOf(src)
    return byJob[job.getName(src) or '']
end

---True when the caller's active job has an MDT at all. Fails closed when the player cannot be
---resolved.
---@param src integer player server id
---@return boolean
function access.canAccess(src)
    return deptOf(src) ~= nil
end

---The caller's resolved identity: citizenid, display name, department, grade, rank label, duty
---state and their provisioned profile fields. Nil when they hold no terminal. Every handler takes
---identity from here and never from the payload.
---@param src integer player server id
---@return table|nil me
function access.identity(src)
    local jobName = job.getName(src)
    if not jobName then return nil end

    local dept = byJob[jobName]
    if not dept then return nil end

    local cid = player.getIdentifier(src)
    if not cid then return nil end

    local grade = job.getGrade(src)
    local rank  = gradeLabel(jobName, grade)
    local name  = player.getName(src)

    local profile = store.ensureProfile(cid, {
        name           = name,
        department     = jobName,
        grade          = grade,
        rank           = rank,
        callsignPrefix = dept.callsign or dept.short or 'U',
        callsignFormat = CALLSIGN_FORMAT,
    })

    local duty = job.getDuty(src)

    return {
        source     = src,
        citizenid  = cid,
        name       = (profile and profile.name) or name,
        job        = jobName,
        department = dept,
        grade      = grade,
        rank       = rank,
        callsign   = profile and profile.callsign or nil,
        badge      = profile and profile.badge or nil,
        radio      = profile and profile.radio or nil,
        avatar     = profile and profile.avatar or nil,
        duty       = duty ~= false,
    }
end

---True when the caller holds a permission key. Boss bypass wins outright when it is enabled; an
---unlisted key is denied rather than permitted, so a fresh install behaves predictably.
---@param src integer player server id
---@param key string permission key
---@return boolean
function access.can(src, key)
    local dept = deptOf(src)
    if not dept then return false end

    -- Which terminal the key belongs to is checked BEFORE the boss bypass, and before the grade.
    -- The permission table is one flat list of names, so without this a police chief would clear
    -- `patients.view` on grade alone and read medical files, and a medic would clear `jail.view`.
    -- A service's own keys are unreachable from the other services at any rank.
    local only = KEY_DOMAIN[key]
    if only and not only[domainOf(dept)] then return false end

    -- The robe outranks the bypass: a chief attorney is still not a judge.
    if BENCH_ONLY[key] and dept.bench ~= true then return false end

    if BOSS_BYPASS and job.isBoss(src, dept.job, dept.bossGrade or 0) then return true end

    local minimum = PERMISSIONS[key]
    if type(minimum) ~= 'number' then return false end
    return job.getGrade(src) >= minimum
end

---Every permission key the caller actually holds. Shipped in the bootstrap envelope so the UI
---never learns about capabilities it cannot use.
---@param src integer player server id
---@return string[] keys
function access.grants(src)
    local out = {}
    if not access.canAccess(src) then return out end
    for i = 1, #KEYS do
        if access.can(src, KEYS[i]) then out[#out + 1] = KEYS[i] end
    end
    return out
end

---An officer's live grade and job: the framework's own answer while they are connected, the last
---grade their profile recorded once they are not.
---@param cid string citizenid
---@return integer|nil grade
---@return string|nil jobName
function access.gradeOf(cid)
    if type(cid) ~= 'string' or cid == '' then return nil, nil end

    local src = player.getSourceByIdentifier(cid)
    if src then return job.getGrade(src), job.getName(src) end

    local profile = store.profile(cid)
    if profile then return profile.gradeLevel, profile.department end
    return nil, nil
end

---Chain of command: a personnel action may only reach an officer of the caller's own department
---who sits STRICTLY below them. Never a peer, never a superior, never yourself, and this holds
---under the boss bypass too, because a boss demoting another boss turns a roster into a weapon.
---@param src integer player server id
---@param targetCid string the officer being acted on
---@return boolean ok
---@return table? refusal failure envelope when ok is false
function access.belowMe(src, targetCid)
    local me = access.identity(src)
    if not me then return false, util.fail('mdt.doNotHaveMdtAccess', 'You do not have MDT access') end
    if type(targetCid) ~= 'string' or targetCid == '' then return false, util.fail('mdt.unknownOfficer', 'Unknown officer') end
    if targetCid == me.citizenid then
        return false, util.fail('mdt.cannotDoOwnRecord', 'You cannot do that to your own record')
    end

    local grade, jobName = access.gradeOf(targetCid)
    if grade == nil then return false, util.fail('mdt.unknownOfficer', 'Unknown officer') end
    if jobName and jobName ~= me.job then
        return false, util.fail('mdt.officerNotDepartment', 'That officer is not in your department')
    end
    if grade >= me.grade then return false, util.fail('mdt.officerNotBelowRank', 'That officer is not below your rank') end
    return true
end

---The record domain a caller reads and writes. This is the whole of the separation between the
---terminals' paperwork, so it is derived from the CONFIGURED department type and never from
---anything the client sends.
---@param me table caller identity from access.identity
---@return 'leo'|'ems'|'doj' domain
function access.domain(me)
    return domainOf(me.department)
end

---Whether the caller works the medical terminal.
---@param me table caller identity
---@return boolean
function access.isMedical(me)
    return domainOf(me.department) == 'ems'
end

---Whether the caller works the court terminal.
---@param me table caller identity
---@return boolean
function access.isCourt(me)
    return domainOf(me.department) == 'doj'
end

---Whether the caller's department wears the robe. Only a bench department rules.
---@param me table caller identity
---@return boolean
function access.isBench(me)
    return me.department.bench == true
end

---The restriction identifiers that admit this caller to a record: their own citizenid, their job,
---and their department type. Report queries fold these into an IN clause, so a department's
---paperwork is not merely un-editable by outsiders, it is un-listable.
---
---A court also carries the `leo` jobtype, because discovery is the point of the terminal: a
---defence attorney who cannot read the report behind the charge cannot argue the case. It does
---NOT carry any individual police job, so paperwork a department restricted to itself stays shut.
---@param me table caller identity from access.identity
---@return { type: string, identifier: string }[]
function access.restrictions(me)
    local domain = domainOf(me.department)
    local out = {
        { type = 'citizenid', identifier = me.citizenid },
        { type = 'job',       identifier = me.job },
        { type = 'jobtype',   identifier = domain },
    }
    if domain == 'doj' then out[#out + 1] = { type = 'jobtype', identifier = 'leo' } end
    return out
end

---Every connected player whose active job has a terminal. Dispatch, chat and bulletins fan their
---pushes out over exactly this set.
---@return integer[] sources
function access.audience()
    local out = {}
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        if src and access.canAccess(src) then out[#out + 1] = src end
    end
    return out
end

---@type table Refusal shown when the caller's job carries no terminal at all.
local NO_ACCESS = util.fail('mdt.doNotHaveAccessTerminal', 'You do not have access to this terminal')
---@type table Refusal shown when the caller's grade is below the key's threshold.
local NO_RANK = util.fail('mdt.rankDoesNotAllow', 'Your rank does not allow that')
---@type table Refusal shown when a handler faulted instead of answering.
local NO_ANSWER = util.fail('mdt.didNotGoThrough', 'That did not go through')

---Runs a handler under pcall, so a fault answers the client instead of leaving its callback
---pending forever. The error is printed, never swallowed.
---@param label string permission key, or the wrapper name for an ungated handler
---@param fn fun(src: integer, payload: table, me: table): table, table?
---@param src integer player server id
---@param payload table
---@param me table caller identity
---@return table envelope
---@return table? audit
local function run(label, fn, src, payload, me)
    local ok, res, audit = pcall(fn, src, payload, me)
    if not ok then
        print(('^1[sd-phone:mdt]^0 %s failed: %s'):format(label, res))
        return NO_ANSWER
    end
    if type(res) ~= 'table' then return NO_ANSWER end
    return res, audit
end

---Wraps a READ handler: resolves identity, checks the key, and normalises the payload. The handler
---receives `(src, payload, me)` and returns the response envelope.
---@param key string permission key
---@param fn fun(src: integer, payload: table, me: table): table
---@return fun(src: integer, payload: any): table
function access.gated(key, fn)
    return function(src, payload)
        local me = access.identity(src)
        if not me then return NO_ACCESS end
        if not access.can(src, key) then return NO_RANK end
        if type(payload) ~= 'table' then payload = {} end
        return (run(key, fn, src, payload, me))
    end
end

---Wraps a WRITE handler: the same gate, plus the audit row on success. Permission checking and
---audit logging are one call so they cannot be forgotten independently. The handler receives
---`(src, payload, me)` and returns `(envelope, audit?)` where audit is
---`{ entityType?, entityId?, details? }`; the audited action is the permission key itself.
---@param key string permission key
---@param fn fun(src: integer, payload: table, me: table): table, table?
---@return fun(src: integer, payload: any): table
function access.audited(key, fn)
    return function(src, payload)
        local me = access.identity(src)
        if not me then return NO_ACCESS end
        if not access.can(src, key) then return NO_RANK end
        if type(payload) ~= 'table' then payload = {} end

        local res, audit = run(key, fn, src, payload, me)

        if res.success == true then
            audit = type(audit) == 'table' and audit or {}
            store.audit(me, key, audit.entityType, audit.entityId, audit.details)
        end
        return res
    end
end

---Wraps a handler that needs a terminal but no particular key (the bootstrap and the home
---dashboard, both of which withhold per column rather than refusing outright).
---@param fn fun(src: integer, payload: table, me: table): table
---@return fun(src: integer, payload: any): table
function access.open(fn)
    return function(src, payload)
        local me = access.identity(src)
        if not me then return NO_ACCESS end
        if type(payload) ~= 'table' then payload = {} end
        return (run('open', fn, src, payload, me))
    end
end

return access
