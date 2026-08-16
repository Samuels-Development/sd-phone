---@type table Shared empty table, used as the read-only stand-in for a missing group set and for a
---missing config. Never mutated: every writer in this file builds its own table.
local EMPTY_SET = {}

---@type string[] Shared empty revoke list, returned by plans that revoke nothing. Never mutated.
local EMPTY_LIST = {}

---@type string vRP 1's getUserGroupByType answers with an EMPTY STRING, not nil, when the player
---holds no group of that type (vrp-v1/vrp/modules/group.lua). Every read of the active group goes
---through activeGroup() so that trap is defused in exactly one place.
local NO_GROUP = ''

---@type string Group type the Jobs table lives under when configs/vrp.lua does not name one.
local DEFAULT_JOB_GTYPE = 'job'

---@type string Group type the Gangs table lives under when configs/vrp.lua does not name one.
local DEFAULT_GANG_GTYPE = 'gang'

---@type table Groups module; the table returned at end of file. Translates a vRP group set into
---sd-phone's job/grade/boss/duty shape. It is a pure function of (group set, permissions, config):
---no I/O, no rpc, no globals and no state, so impl_v1 and impl_v2 can both hand it whatever they
---already fetched and it can be unit tested standalone.
local groups = {}

---True when `perm` is a permission this adapter is willing to evaluate at all. vRP's "!name.arg"
---form dispatches to registered permission functions, and several stock ones (inside, in_vehicle,
---in_owned_vehicle, home, item, aptitude) block on a Tunnel round trip to the client. Yielding
---inside a cross-resource export invocation is not supported, so the "!" form is refused outright
---rather than attempted and hoped for.
---@param perm any
---@return boolean
function groups.isPlainPermission(perm)
    return type(perm) == 'string' and perm ~= '' and perm:sub(1, 1) ~= '!'
end

---Evaluate one permission against the caller-supplied predicate. Refused permissions never reach
---the predicate, so a "!" permission costs nothing and can never yield. The pcall is not defensive
---padding: the predicate is a live proxy/export call supplied by impl_v1 or impl_v2, and a boss
---check must fail closed rather than propagate a vRP error into an app callback.
---@param state table player state passed to the public API
---@param perm any
---@return boolean
local function granted(state, perm)
    if not groups.isPlainPermission(perm) then return false end
    local check = state and state.hasPermission
    if type(check) ~= 'function' then return false end
    local ok, res = pcall(check, perm)
    return ok and res == true
end

---The player's group membership set, normalised. A missing set means "we could not read vRP", and
---every lookup then simply misses, which is the fail-closed direction.
---@param state table
---@return table<string, boolean>
local function memberships(state)
    local held = state and state.groups
    if type(held) ~= 'table' then return EMPTY_SET end
    return held
end

---The player's gtype-active group, or nil. Guards the empty-string return of vRP 1's
---getUserGroupByType, which is the single most likely place for a naive port to treat "no job" as
---a group named "".
---@param state table
---@return string|nil
local function activeGroup(state)
    local active = state and state.active
    if type(active) ~= 'string' or active == NO_GROUP then return nil end
    return active
end

---Pick a compiled entry's grade resolver ONCE, when the config is compiled. Convention (A),
---rank-per-group, reads the grade off the highest ranked group the player holds; convention (B),
---a single group plus permissions, reads it off the highest matching gradePermissions level. Which
---convention applies is a property of the config and never of the player, so binding the closure
---here keeps every later lookup a straight call instead of a branch.
---@param names string[] rank groups, ordered low to high
---@param gradePermissions { perm: string, level: number }[]|nil
---@return fun(state: table): integer
local function chooseGradeResolver(names, gradePermissions)
    if #names == 1 and type(gradePermissions) == 'table' and #gradePermissions > 0 then
        return function(state)
            local best = 0
            for i = 1, #gradePermissions do
                local rule = gradePermissions[i]
                local level = math.floor(tonumber(rule and rule.level) or 0)
                -- Level first: a rule that cannot raise the grade is never worth a permission call.
                if level > best and granted(state, rule and rule.perm) then best = level end
            end
            return best
        end
    end

    return function(state)
        local held = memberships(state)
        local best = 0
        for i = 1, #names do
            if held[names[i]] then best = i - 1 end
        end
        return best
    end
end

---Copy the string members of a config list into a fresh array, dropping anything else. Config is
---hand-written by server owners, so a stray nil or number must not shift the rank indices that the
---grade is derived from.
---@param list any
---@return string[]
local function stringList(list)
    local out = {}
    if type(list) ~= 'table' then return out end
    for i = 1, #list do
        if type(list[i]) == 'string' and list[i] ~= '' then out[#out + 1] = list[i] end
    end
    return out
end

---Compile one configs/vrp.lua Jobs/Gangs entry. Returns nil for an entry that cannot be honoured,
---because a half-mapped job is worse than an unmapped one: it would report a name the adapter has
---no way to grade, boss-check or revoke.
---@param raw any one element of cfg.Jobs / cfg.Gangs
---@param warnings string[] appended to, never read here
---@return table|nil
local function compileEntry(raw, warnings)
    if type(raw) ~= 'table' or type(raw.job) ~= 'string' or raw.job == '' then
        warnings[#warnings + 1] = 'entry with no `job` name was ignored'
        return nil
    end

    local names = stringList(raw.groups)
    if #names == 0 then
        warnings[#warnings + 1] = ('job "%s" lists no groups and was ignored'):format(raw.job)
        return nil
    end

    -- A refused permission is kept, not dropped: keeping it makes the check fail closed, while
    -- dropping it would silently fall back to the ESX grade threshold and grant more than the
    -- admin asked for. The warning is how they find out.
    if raw.bossPermission ~= nil and not groups.isPlainPermission(raw.bossPermission) then
        warnings[#warnings + 1] =
            ('job "%s" bossPermission is a function permission and will always be refused'):format(raw.job)
    end
    if raw.dutyPermission ~= nil and not groups.isPlainPermission(raw.dutyPermission) then
        warnings[#warnings + 1] =
            ('job "%s" dutyPermission is a function permission and will always be refused'):format(raw.job)
    end
    if type(raw.gradePermissions) == 'table' then
        for i = 1, #raw.gradePermissions do
            local rule = raw.gradePermissions[i]
            if type(rule) == 'table' and not groups.isPlainPermission(rule.perm) then
                warnings[#warnings + 1] =
                    ('job "%s" gradePermissions[%d] is a function permission and will always be refused')
                        :format(raw.job, i)
            end
        end
    end

    local bossGroups = stringList(raw.bossGroups)

    return {
        job            = raw.job,
        label          = type(raw.label) == 'string' and raw.label or nil,
        groups         = names,
        gradeLabels    = type(raw.gradeLabels) == 'table' and raw.gradeLabels or nil,
        bossGroups     = #bossGroups > 0 and bossGroups or nil,
        bossPermission = raw.bossPermission ~= nil and raw.bossPermission or nil,
        dutyGroup      = type(raw.dutyGroup) == 'string' and raw.dutyGroup ~= '' and raw.dutyGroup or nil,
        dutyPermission = raw.dutyPermission ~= nil and raw.dutyPermission or nil,
        grade          = chooseGradeResolver(names, raw.gradePermissions),
    }
end

---Compile configs/vrp.lua into the lookup shape every other function here takes. Call it once, at
---module load, and keep the result: it walks the whole config and binds one grade resolver per job.
---A missing, empty or malformed config compiles to an empty translator instead of raising, because
---this module is reached before anything has proven the admin's config is sane - and on a server
---that copied an old configs/ folder over a new release there may be no config at all.
---@param cfg table|nil the whole configs/vrp.lua table
---@param kind? 'job'|'gang' which half of the config to compile. Default 'job'.
---@return table compiled { kind, gtype, unemployedGroup, entries, byJob, byGroup, warnings }
function groups.compile(cfg, kind)
    kind = kind == 'gang' and 'gang' or 'job'
    cfg = type(cfg) == 'table' and cfg or EMPTY_SET

    local gtype = kind == 'gang' and cfg.GangGtype or cfg.JobGtype
    local compiled = {
        kind            = kind,
        gtype           = type(gtype) == 'string' and gtype ~= '' and gtype
            or (kind == 'gang' and DEFAULT_GANG_GTYPE or DEFAULT_JOB_GTYPE),
        unemployedGroup = kind == 'job' and type(cfg.UnemployedGroup) == 'string'
            and cfg.UnemployedGroup ~= '' and cfg.UnemployedGroup or nil,
        entries         = {},
        byJob           = {},
        byGroup         = {},
        warnings        = {},
    }

    local list = kind == 'gang' and cfg.Gangs or cfg.Jobs
    if type(list) ~= 'table' then return compiled end

    for i = 1, #list do
        local entry = compileEntry(list[i], compiled.warnings)
        if entry and compiled.byJob[entry.job] then
            compiled.warnings[#compiled.warnings + 1] =
                ('job "%s" is listed twice; the later entry was ignored'):format(entry.job)
        elseif entry then
            compiled.entries[#compiled.entries + 1] = entry
            compiled.byJob[entry.job] = entry
            -- Only `groups` names a job. bossGroups and dutyGroup deliberately do not, so a duty
            -- group shared between two jobs can never decide which job the player is on.
            for j = 1, #entry.groups do
                if not compiled.byGroup[entry.groups[j]] then
                    compiled.byGroup[entry.groups[j]] = entry
                end
            end
        end
    end

    return compiled
end

---The highest ranked group of `entry` the player actually holds. Nil when the entry was matched
---through the gtype-active group alone and the caller supplied no membership set.
---@param entry table compiled entry
---@param state table
---@return string|nil
local function highestHeldGroup(entry, state)
    local held = memberships(state)
    local best
    for i = 1, #entry.groups do
        if held[entry.groups[i]] then best = entry.groups[i] end
    end
    return best
end

---Resolve the player's active job from their vRP groups. vRP's own exclusivity rule is the primary
---source - one group per gtype, so the gtype-active group names the job outright - but it is only
---a hint: an active group nobody mapped (a vanilla `citizen`) must not shadow a rank group the
---player also holds, so an unmapped active group falls through to a config-ordered scan of the
---membership set. Nothing matching returns job = nil, which fails closed: every job-gated app in
---the phone stays hidden rather than opening on a guess.
---@param compiled table from groups.compile
---@param state { groups?: table<string, boolean>, active?: string, hasPermission?: fun(perm: string): boolean }
---@return { job: string|nil, grade: integer, group: string|nil, entry: table|nil }
function groups.resolve(compiled, state)
    local active = activeGroup(state)
    local entry = active and compiled.byGroup[active] or nil

    if not entry then
        local held = memberships(state)
        for i = 1, #compiled.entries do
            local candidate = compiled.entries[i]
            for j = 1, #candidate.groups do
                if held[candidate.groups[j]] then
                    entry = candidate
                    break
                end
            end
            if entry then break end
        end
    end

    if not entry then return { job = nil, grade = 0 } end

    return {
        job   = entry.job,
        grade = entry.grade(state),
        group = highestHeldGroup(entry, state) or active,
        entry = entry,
    }
end

---The player's current job name, or nil when no configured job matches.
---@param compiled table
---@param state table
---@return string|nil
function groups.jobName(compiled, state)
    return groups.resolve(compiled, state).job
end

---The player's current grade. 0 both for "grade zero" and for "no job", exactly like the ESX path,
---because every caller pairs it with jobName and treats a nil job as ungated.
---@param compiled table
---@param state table
---@return integer
function groups.grade(compiled, state)
    return groups.resolve(compiled, state).grade
end

---Every configured job whose groups the player holds, mapped to its grade. Unlike ESX this is real
---data: vRP membership is a set, so a player genuinely can hold two mapped jobs at once. It stays
---reporting-only - job.supportsMultijob() is false on vRP, because switching job here means
---granting a live permission group rather than moving a saved-job pointer.
---@param compiled table
---@param state table
---@return table<string, integer> jobName -> grade
function groups.getAll(compiled, state)
    local out = {}
    local held = memberships(state)

    for i = 1, #compiled.entries do
        local entry = compiled.entries[i]
        for j = 1, #entry.groups do
            if held[entry.groups[j]] then
                out[entry.job] = entry.grade(state)
                break
            end
        end
    end

    -- The gtype-active group wins even when the caller supplied no membership set, so a state
    -- carrying only `active` still reports the job the player is visibly doing.
    local res = groups.resolve(compiled, state)
    if res.job then out[res.job] = res.grade end
    return out
end

---True when the player is on `jobName` AND a boss of it. bossGroups membership or bossPermission
---satisfies it; with neither configured the test degrades to grade >= esxBossGrade, the threshold
---the caller already passes from configs/services.lua, so an unconfigured vRP server behaves
---exactly like ESX with no extra config. Every company-management action (deposit, withdraw, hire,
---fire, promote, demote) is gated here, which is why a configured-but-refused bossPermission
---answers false instead of quietly reverting to the looser grade threshold.
---@param compiled table
---@param state table
---@param jobName string
---@param esxBossGrade? integer Default 0; callers pass DefaultBossGrade or a company override.
---@return boolean
function groups.isBoss(compiled, state, jobName, esxBossGrade)
    if type(jobName) ~= 'string' or jobName == '' then return false end

    local res = groups.resolve(compiled, state)
    if not res.entry or res.job ~= jobName then return false end

    local entry = res.entry
    if entry.bossGroups then
        local held = memberships(state)
        for i = 1, #entry.bossGroups do
            if held[entry.bossGroups[i]] then return true end
        end
    end
    if entry.bossPermission and granted(state, entry.bossPermission) then return true end
    if entry.bossGroups or entry.bossPermission then return false end

    return res.grade >= (tonumber(esxBossGrade) or 0)
end

---The player's on-duty state, or nil when their job has no duty model configured. Nil is the
---default and it is meaningful: vRP has no duty flag, and callers already read nil as "use the
---phone's own stored duty preference", exactly as they do on ESX. dutyGroup is preferred over
---dutyPermission because membership is a plain set read that setDuty can also toggle back off,
---while a permission may be inherited from a parent group and so is read-only in practice.
---@param compiled table
---@param state table
---@param jobName? string When given, duty is only reported for that job; nil otherwise.
---@return boolean|nil
function groups.getDuty(compiled, state, jobName)
    local res = groups.resolve(compiled, state)
    if not res.entry then return nil end
    if jobName ~= nil and res.job ~= jobName then return nil end

    local entry = res.entry
    if entry.dutyGroup then return memberships(state)[entry.dutyGroup] == true end
    if entry.dutyPermission then return granted(state, entry.dutyPermission) end
    return nil
end

---The group setDuty has to add or remove to change duty for `jobName`. Nil when the job has no
---duty group, in which case duty is unwritable and setDuty must report false rather than pretend.
---@param compiled table
---@param jobName string
---@return string|nil
function groups.dutyGroup(compiled, jobName)
    local entry = type(jobName) == 'string' and compiled.byJob[jobName] or nil
    return entry and entry.dutyGroup or nil
end

---Every group of the player's CURRENT job, so a revoke cannot leave a stray rank attached. The
---gtype-active group comes first and is included even when it is unmapped, because vRP's own
---exclusivity rule makes it the group that defines their job, mapped or not.
---@param compiled table
---@param state table
---@return string[]
local function currentJobGroups(compiled, state)
    local out, seen = {}, {}
    local active = activeGroup(state)
    if active then
        out[#out + 1] = active
        seen[active] = true
    end

    local res = groups.resolve(compiled, state)
    if res.entry then
        local held = memberships(state)
        for i = 1, #res.entry.groups do
            local name = res.entry.groups[i]
            if held[name] and not seen[name] then
                out[#out + 1] = name
                seen[name] = true
            end
        end
    end

    return out
end

---Plan the group writes that move a player to `jobName` at `grade`. A plan is returned rather than
---applied so this module stays free of I/O; impl_v1 and impl_v2 feed it to addGroup/removeGroup.
---A MAPPED job is a single add: vRP's own gtype exclusivity evicts the previous rank, which is why
---every group in configs/vrp.lua must carry _config.gtype = JobGtype.
---An UNMAPPED job is treated as a REVOKE, not as an error. society.fire() arrives here with
---configs/services.lua's 'unemployed', which no vRP server has a group for, and reporting a failed
---fire while leaving the employee's police_chief group attached would be a privilege leak. Revoking
---is the only safe failure direction, so the plan drops their current job groups and, when the
---admin configured one, adds UnemployedGroup.
---@param compiled table
---@param state table
---@param jobName string
---@param grade? number Default 0. Indexes the entry's rank list, so grade 1 is the second group.
---@return { ok: boolean, add: string|nil, remove: string[] }
function groups.setJobPlan(compiled, state, jobName, grade)
    local entry = type(jobName) == 'string' and compiled.byJob[jobName] or nil

    if entry then
        local group = entry.groups[math.floor(tonumber(grade) or 0) + 1]
        -- A grade the config has no rank group for is a real error: silently clamping it would
        -- promote or demote someone to a rank nobody asked for.
        if not group then return { ok = false, remove = EMPTY_LIST } end
        return { ok = true, add = group, remove = EMPTY_LIST }
    end

    return {
        ok     = true,
        add    = compiled.unemployedGroup,
        remove = currentJobGroups(compiled, state),
    }
end

---A job's display label, falling back to the job name so the UI never renders an empty chip.
---@param compiled table
---@param jobName string
---@return string|nil
function groups.label(compiled, jobName)
    local entry = type(jobName) == 'string' and compiled.byJob[jobName] or nil
    if not entry then return nil end
    return entry.label or entry.job
end

---A single grade's label, e.g. 'Sergeant' for police grade 1.
---@param compiled table
---@param jobName string
---@param grade? number Default 0.
---@return string|nil
function groups.gradeLabel(compiled, jobName, grade)
    local entry = type(jobName) == 'string' and compiled.byJob[jobName] or nil
    if not entry or not entry.gradeLabels then return nil end
    local label = entry.gradeLabels[math.floor(tonumber(grade) or 0) + 1]
    return type(label) == 'string' and label or nil
end

---Every grade of a job in society.getGrades' shape, straight from config - vRP has no grade table
---to query, so the rank list IS the grade list.
---@param compiled table
---@param jobName string
---@return { level: integer, label: string }[]
function groups.grades(compiled, jobName)
    local out = {}
    local entry = type(jobName) == 'string' and compiled.byJob[jobName] or nil
    if not entry then return out end

    for i = 1, #entry.groups do
        local label = entry.gradeLabels and entry.gradeLabels[i]
        out[#out + 1] = {
            level = i - 1,
            label = type(label) == 'string' and label or ('Grade ' .. tostring(i - 1)),
        }
    end
    return out
end

return groups
